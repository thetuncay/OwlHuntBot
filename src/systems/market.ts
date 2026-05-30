import type { PrismaClient } from '@prisma/client';
import {
  MARKET_MIN_LEVEL,
  MARKET_TAX_RATE,
  MARKET_LISTING_LIMIT_DAILY,
  MARKET_LISTING_DURATION_MS,
  MARKET_MIN_PRICE,
  MARKET_MAX_PRICE
} from '../config';
import { withLock } from '../utils/lock';
import { trackQuestProgress } from './daily-quests';
import type { Redis } from 'ioredis';
import { syncPlayerStateAfterPgWrite } from '../state/player-state';

/**
 * Markette yeni bir ilan oluşturur.
 */
export async function createListing(
  prisma: PrismaClient,
  sellerId: string,
  itemName: string,
  quantity: number,
  price: number,
  redis?: Redis,
) {
  return withLock(sellerId, 'market_list', async () => {
    const player = await prisma.player.findUnique({
      where: { id: sellerId },
      select: { level: true, dailyMarketListings: true, lastMarketListingDate: true }
    });

    if (!player) throw new Error('Oyuncu bulunamadı.');
    if (player.level < MARKET_MIN_LEVEL) {
      throw new Error(`Market kullanmak için en az **${MARKET_MIN_LEVEL}** seviye olmalısın.`);
    }

    if (price < MARKET_MIN_PRICE || price > MARKET_MAX_PRICE) {
      throw new Error(`Fiyat **${MARKET_MIN_PRICE}** ile **${MARKET_MAX_PRICE}** arasında olmalıdır.`);
    }

    // Günlük limit kontrolü
    const now = new Date();
    const isSameDay = player.lastMarketListingDate &&
                      player.lastMarketListingDate.toDateString() === now.toDateString();
    const dailyCount = isSameDay ? player.dailyMarketListings : 0;

    if (dailyCount >= MARKET_LISTING_LIMIT_DAILY) {
      throw new Error('Günlük maksimum ilan limitine ulaştın.');
    }

    return prisma.$transaction(async (tx) => {
      const invItem = await tx.inventoryItem.findUnique({
        where: { ownerId_itemName: { ownerId: sellerId, itemName } }
      });

      if (!invItem || invItem.quantity < quantity) {
        throw new Error('Yetersiz eşya miktarı.');
      }

      // İlanı oluştur
      const listing = await tx.marketListing.create({
        data: {
          sellerId,
          itemName,
          itemType: invItem.itemType,
          rarity: invItem.rarity,
          quantity,
          price,
          expiresAt: new Date(Date.now() + MARKET_LISTING_DURATION_MS)
        }
      });

      // Eşyayı envanterden düş
      await tx.inventoryItem.update({
        where: { id: invItem.id },
        data: { quantity: { decrement: quantity } }
      });

      // Günlük sayacı güncelle
      await tx.player.update({
        where: { id: sellerId },
        data: {
          dailyMarketListings: isSameDay ? { increment: 1 } : 1,
          lastMarketListingDate: now
        }
      });

      trackQuestProgress(tx as any, sellerId, 'market').catch(() => null);

      return listing;
    }).then(async (listing) => {
      await syncPlayerStateAfterPgWrite(redis, prisma, sellerId, 'full');
      return listing;
    });
  });
}

/**
 * Marketteki bir ilanı satın alır.
 * listingId tam UUID veya UI'da gösterilen kısaltılmış ID (ilk 8 karakter) olabilir.
 */
export async function buyListing(
  prisma: PrismaClient,
  buyerId: string,
  listingId: string,
  redis?: Redis,
) {
  return withLock(buyerId, 'market_buy', async () => {
    return prisma.$transaction(async (tx) => {
      // Tam UUID veya kısaltılmış prefix ile ara
      const listing = listingId.length === 36
        ? await tx.marketListing.findUnique({ where: { id: listingId } })
        : await tx.marketListing.findFirst({ where: { id: { startsWith: listingId } } });
      // Gerçek ID'yi kullan (kısa ID ile arama yapıldıysa listing.id tam UUID'dir)
      const realListingId = listing?.id ?? listingId;

      if (!listing) throw new Error('İlan bulunamadı veya süresi dolmuş.');
      if (listing.sellerId === buyerId) throw new Error('Kendi ilanını satın alamazsın.');
      if (listing.expiresAt <= new Date()) throw new Error('Bu ilanın süresi dolmuş.');

      const buyer = await tx.player.findUnique({
        where: { id: buyerId },
        select: { coins: true }
      });

      if (!buyer || buyer.coins < listing.price) {
        throw new Error('Yetersiz bakiye.');
      }

      const tax = Math.ceil(listing.price * MARKET_TAX_RATE);
      const sellerGain = listing.price - tax;

      // Alıcıdan coin düş
      await tx.player.update({
        where: { id: buyerId },
        data: { coins: { decrement: listing.price } }
      });

      // Satıcıya coin ekle
      await tx.player.update({
        where: { id: listing.sellerId },
        data: { coins: { increment: sellerGain } }
      });

      // Alıcıya eşyayı ver
      await tx.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: buyerId, itemName: listing.itemName } },
        create: {
          ownerId: buyerId,
          itemName: listing.itemName,
          itemType: listing.itemType,
          rarity: listing.rarity,
          quantity: listing.quantity
        },
        update: {
          quantity: { increment: listing.quantity }
        }
      });

      // İlanı sil (gerçek tam UUID ile)
      await tx.marketListing.delete({
        where: { id: realListingId }
      });

      return { listing, tax, sellerGain };
    }).then(async (result) => {
      await Promise.all([
        syncPlayerStateAfterPgWrite(redis, prisma, buyerId, 'full'),
        syncPlayerStateAfterPgWrite(redis, prisma, result.listing.sellerId, 'full'),
      ]);
      return result;
    });
  });
}

/**
 * Süresi dolmuş ilanları temizler ve eşyaları satıcılara iade eder.
 */
export async function cleanupExpiredListings(prisma: PrismaClient) {
  const now = new Date();
  const expired = await prisma.marketListing.findMany({
    where: { expiresAt: { lte: now } },
    take: 50 // Her seferinde küçük parçalarla temizle (performance)
  });

  for (const listing of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        // Eşyayı iade et
        await tx.inventoryItem.upsert({
          where: { ownerId_itemName: { ownerId: listing.sellerId, itemName: listing.itemName } },
          create: {
            ownerId: listing.sellerId,
            itemName: listing.itemName,
            itemType: listing.itemType,
            rarity: listing.rarity,
            quantity: listing.quantity
          },
          update: {
            quantity: { increment: listing.quantity }
          }
        });

        // İlanı sil
        await tx.marketListing.delete({ where: { id: listing.id } });
      });
    } catch (err) {
      console.error(`İlan temizleme hatası (ID: ${listing.id}):`, err);
    }
  }

  return expired.length;
}

/**
 * Market ilanlarını listeler (arama destekli).
 */
export async function fetchListings(
  prisma: PrismaClient,
  itemName?: string
) {
  return prisma.marketListing.findMany({
    where: {
      itemName: itemName ? { contains: itemName, mode: 'insensitive' } : undefined,
      expiresAt: { gt: new Date() }
    },
    orderBy: { price: 'asc' },
    take: 20
  });
}
