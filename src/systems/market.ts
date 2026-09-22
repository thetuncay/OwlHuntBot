/**
 * market.ts — Avcı Pazarı
 *
 * Serbest piyasa: fiyat sınırı yok, listeleme ücreti + satış vergisi.
 * Escrow: ilan açılınca item/baykuş oyuncudan alınır.
 */

import { formatCoinLabel } from '../config/ui-emojis';
import type { PrismaClient, MarketListing, Prisma } from '@prisma/client';
import {
  MARKET_MIN_LEVEL,
  MARKET_TAX_RATE,
  MARKET_LISTING_FEE_RATE,
  MARKET_MAX_ACTIVE_LISTINGS,
  MARKET_LISTING_DURATION_MS,
  MARKET_PAGE_SIZE,
  MARKET_SUSPICIOUS_THRESHOLD,
  PREY,
} from '../config';
import { withLock } from '../utils/lock';
import { runWithFinancialLocks, runWithListingLock } from './economy-transaction-manager';
import { trackQuestProgress } from './daily-quests';
import { fireQuest } from './quest-tracker';
import { mergeQuestNotices } from './daily-quests';
import type { Redis } from 'ioredis';
import {
  addInventoryItemInRedis,
  applyCoinDeltaInRedis,
  deductCoinsInRedis,
  hydratePlayerState,
  syncInventoryItemsFromPg,
} from '../state/player-state';
import { resolveOwlByInput } from '../utils/owl-id';
import { enqueueDbWrite } from '../utils/db-queue';
import { validateMarketSellerNote } from '../utils/market-seller-note';
import { owlToMarketSnapshot, type OwlMarketSnapshot, type MarketSaleView } from '../utils/market-ux';
import { applyRewardMultiplier } from '../anticheat/reward-throttle';
import {
  flattenStallListings,
  groupListingsIntoStalls,
  paginateMarketStalls,
  sortMarketStalls,
  type MarketSellerStall,
} from '../utils/market-stalls';

export type MarketCategory = 'owl' | 'item' | 'buff' | 'material';

export type MarketSort =
  | 'price_asc'
  | 'price_desc'
  | 'newest'
  | 'oldest'
  | 'ending_soon'
  | 'most_expensive'
  | 'cheapest';

export interface MarketBrowseOptions {
  category?: MarketCategory;
  search?: string;
  sort?: MarketSort;
  page?: number;
  sellerId?: string;
}

const CATEGORY_ITEM_TYPES: Record<MarketCategory, string[]> = {
  owl: ['owl'],
  item: ['Consumable', 'Lootbox', 'Kutu', 'Equipment', 'Item'],
  buff: ['Buff'],
  material: ['Materyal', 'Material', 'Av'],
};

const PREY_NAMES = new Set<string>(PREY.map((p) => p.name));

export function resolveMarketCategory(itemType: string, itemName: string): MarketCategory {
  const lower = itemType.toLowerCase();
  if (lower === 'owl') return 'owl';
  if (lower === 'buff') return 'buff';
  if (lower === 'materyal' || lower === 'material' || lower === 'av') return 'material';
  if (PREY_NAMES.has(itemName)) return 'material';
  return 'item';
}

export function parseMarketSort(raw?: string): MarketSort {
  const s = (raw ?? '').toLowerCase().replace('sort:', '');
  const allowed: MarketSort[] = [
    'price_asc',
    'price_desc',
    'newest',
    'oldest',
    'ending_soon',
    'most_expensive',
    'cheapest',
  ];
  return allowed.includes(s as MarketSort) ? (s as MarketSort) : 'price_asc';
}

function buildOrderBy(sort: MarketSort): Prisma.MarketListingOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_desc':
    case 'most_expensive':
      return [{ price: 'desc' }];
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'ending_soon':
      return [{ expiresAt: 'asc' }];
    case 'cheapest':
    case 'price_asc':
    default:
      return [{ price: 'asc' }];
  }
}

function activeListingWhere(
  extra?: Prisma.MarketListingWhereInput,
): Prisma.MarketListingWhereInput {
  return {
    status: 'active',
    expiresAt: { gt: new Date() },
    ...extra,
  };
}

async function countActiveListings(
  tx: Prisma.TransactionClient,
  sellerId: string,
): Promise<number> {
  return tx.marketListing.count({
    where: activeListingWhere({ sellerId }),
  });
}

function calcListingFee(price: number): number {
  return Math.max(1, Math.ceil(price * MARKET_LISTING_FEE_RATE));
}

function calcTax(price: number): number {
  return Math.ceil(price * MARKET_TAX_RATE);
}

/** UI katmanı için satış vergisi hesabı */
export function calcMarketTax(price: number): number {
  return calcTax(price);
}

/** İlan oluştur — envanter eşyası */
export async function createListing(
  prisma: PrismaClient,
  sellerId: string,
  itemName: string,
  quantity: number,
  price: number,
  redis?: Redis,
  sellerNote?: string | null,
) {
  if (quantity < 1) throw new Error('Miktar en az 1 olmalı.');
  if (price < 1) throw new Error('Fiyat en az 1 coin olmalı.');

  return withLock(sellerId, 'market_list', async () => {
    const player = await prisma.player.findUnique({
      where: { id: sellerId },
      select: { level: true, coins: true },
    });
    if (!player) throw new Error('Oyuncu bulunamadı.');
    if (player.level < MARKET_MIN_LEVEL) {
      throw new Error(`Market için en az **${MARKET_MIN_LEVEL}** seviye olmalısın.`);
    }

    const listingFee = calcListingFee(price);
    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, sellerId);
      const coins = bundle?.player.coins ?? player.coins;
      if (coins < listingFee) {
        throw new Error(
          `Listeleme ücreti ${formatCoinLabel(listingFee)} — yetersiz bakiye.`,
        );
      }
    } else if (player.coins < listingFee) {
      throw new Error(
        `Listeleme ücreti ${formatCoinLabel(listingFee)} — yetersiz bakiye.`,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const activeCount = await countActiveListings(tx, sellerId);
      if (activeCount >= MARKET_MAX_ACTIVE_LISTINGS) {
        throw new Error(`En fazla **${MARKET_MAX_ACTIVE_LISTINGS}** aktif ilan açabilirsin.`);
      }

      const invItem = await tx.inventoryItem.findUnique({
        where: { ownerId_itemName: { ownerId: sellerId, itemName } },
      });
      if (!invItem || invItem.quantity < quantity) {
        throw new Error('Yetersiz eşya miktarı.');
      }

      const marketCategory = resolveMarketCategory(invItem.itemType, itemName);

      await tx.player.update({
        where: { id: sellerId },
        data: { coins: { decrement: listingFee } },
      });

      const listing = await tx.marketListing.create({
        data: {
          sellerId,
          itemId: itemName,
          itemName,
          itemType: invItem.itemType,
          marketCategory,
          rarity: invItem.rarity,
          quantity,
          price,
          listingFeePaid: listingFee,
          sellerNote: sellerNote ?? null,
          status: 'active',
          expiresAt: new Date(Date.now() + MARKET_LISTING_DURATION_MS),
        },
      });

      const newQty = invItem.quantity - quantity;
      if (newQty <= 0) {
        await tx.inventoryItem.delete({ where: { id: invItem.id } });
      } else {
        await tx.inventoryItem.update({
          where: { id: invItem.id },
          data: { quantity: newQty },
        });
      }

      return { listing, listingFee };
    });

    if (redis) {
      await deductCoinsInRedis(redis, sellerId, result.listingFee, prisma);
      await syncInventoryItemsFromPg(redis, prisma, sellerId, [itemName]);
    }
    await trackQuestProgress(prisma, sellerId, 'market');
    await trackQuestProgress(prisma, sellerId, 'market_item');
    return result;
  });
}

/** Baykuş ilanı */
export async function createOwlListing(
  prisma: PrismaClient,
  sellerId: string,
  owlId: string,
  price: number,
  redis?: Redis,
  sellerNote?: string | null,
) {
  if (price < 1) throw new Error('Fiyat en az 1 coin olmalı.');

  return withLock(sellerId, 'market_list', async () => {
    const player = await prisma.player.findUnique({
      where: { id: sellerId },
      select: { level: true, coins: true },
    });
    if (!player) throw new Error('Oyuncu bulunamadı.');
    if (player.level < MARKET_MIN_LEVEL) {
      throw new Error(`Market için en az **${MARKET_MIN_LEVEL}** seviye olmalısın.`);
    }

    const listingFee = calcListingFee(price);
    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, sellerId);
      const coins = bundle?.player.coins ?? player.coins;
      if (coins < listingFee) {
        throw new Error(
          `Listeleme ücreti ${formatCoinLabel(listingFee)} — yetersiz bakiye.`,
        );
      }
    } else if (player.coins < listingFee) {
      throw new Error(
        `Listeleme ücreti ${formatCoinLabel(listingFee)} — yetersiz bakiye.`,
      );
    }

    const owl = await resolveOwlByInput(prisma, sellerId, owlId);
    if (!owl) throw new Error('Baykuş bulunamadı.');
    if (owl.isMain) throw new Error('Main baykuşu satışa koyamazsın.');
    if (owl.passiveMode === 'market') throw new Error('Bu baykuş zaten markette.');

    const result = await prisma.$transaction(async (tx) => {
      const activeCount = await countActiveListings(tx, sellerId);
      if (activeCount >= MARKET_MAX_ACTIVE_LISTINGS) {
        throw new Error(`En fazla **${MARKET_MAX_ACTIVE_LISTINGS}** aktif ilan açabilirsin.`);
      }

      const existing = await tx.marketListing.findFirst({
        where: { itemId: owl.id, status: 'active' },
      });
      if (existing) throw new Error('Bu baykuş zaten listelenmiş.');

      await tx.player.update({
        where: { id: sellerId },
        data: { coins: { decrement: listingFee } },
      });

      const listing = await tx.marketListing.create({
        data: {
          sellerId,
          itemId: owl.id,
          itemName: `${owl.species} T${owl.tier}`,
          itemType: 'owl',
          marketCategory: 'owl',
          rarity: owl.quality,
          quantity: 1,
          price,
          listingFeePaid: listingFee,
          sellerNote: sellerNote ?? null,
          status: 'active',
          expiresAt: new Date(Date.now() + MARKET_LISTING_DURATION_MS),
        },
      });

      await tx.owl.update({
        where: { id: owl.id },
        data: { passiveMode: 'market', isMain: false },
      });

      return { listing, listingFee };
    });

    if (redis) {
      await deductCoinsInRedis(redis, sellerId, result.listingFee, prisma);
    }
    await mergeQuestNotices(
      await trackQuestProgress(prisma, sellerId, 'market'),
      await fireQuest(prisma, sellerId, 'market_owl'),
    );
    return result;
  });
}

async function computeRiskScore(
  tx: Prisma.TransactionClient,
  sellerId: string,
  buyerId: string,
  itemId: string,
  salePrice: number,
  sellerCreatedAt: Date,
  buyerCreatedAt: Date,
): Promise<{ score: number; factors: string[] }> {
  let score = 0;
  const factors: string[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const analytics = await tx.marketAnalytics.findUnique({ where: { itemId } });
  if (analytics?.averagePrice7d && analytics.averagePrice7d > 0) {
    const ratio = salePrice / analytics.averagePrice7d;
    if (ratio >= 5) {
      score += 40;
      factors.push('high_price_vs_avg');
    } else if (ratio >= 3) {
      score += 20;
      factors.push('elevated_price');
    }
  }

  const sellerAgeDays = (now - sellerCreatedAt.getTime()) / dayMs;
  const buyerAgeDays = (now - buyerCreatedAt.getTime()) / dayMs;
  if (sellerAgeDays < 7) {
    score += 15;
    factors.push('new_seller_account');
  }
  if (buyerAgeDays < 7) {
    score += 15;
    factors.push('new_buyer_account');
  }

  const since = new Date(now - dayMs);
  const pairTrades = await tx.marketSale.count({
    where: {
      sellerId,
      buyerId,
      soldAt: { gte: since },
    },
  });
  if (pairTrades >= 10) {
    score += 35;
    factors.push('repeat_pair_trades_10+');
  } else if (pairTrades >= 5) {
    score += 25;
    factors.push('repeat_pair_trades_5+');
  }

  const oneWay = await tx.marketSale.count({
    where: {
      OR: [
        { sellerId, buyerId },
        { sellerId: buyerId, buyerId: sellerId },
      ],
      soldAt: { gte: since },
    },
  });
  if (oneWay >= 15) {
    score += 20;
    factors.push('one_way_trade_pattern');
  }

  return { score: Math.min(100, score), factors };
}

export async function refreshMarketAnalytics(
  tx: Prisma.TransactionClient | PrismaClient,
  itemId: string,
  itemName: string,
  lastSalePrice: number,
): Promise<void> {
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const sales24h = await tx.marketSale.findMany({
    where: { itemId, soldAt: { gte: h24 } },
    select: { salePrice: true },
  });
  const sales7d = await tx.marketSale.findMany({
    where: { itemId, soldAt: { gte: d7 } },
    select: { salePrice: true },
  });
  const sales30d = await tx.marketSale.findMany({
    where: { itemId, soldAt: { gte: d30 } },
    select: { salePrice: true },
    orderBy: { salePrice: 'asc' },
  });

  const avg = (rows: { salePrice: number }[]) =>
    rows.length ? Math.round(rows.reduce((s, r) => s + r.salePrice, 0) / rows.length) : 0;

  const median30 = (() => {
    if (!sales30d.length) return 0;
    const mid = Math.floor(sales30d.length / 2);
    return sales30d.length % 2
      ? sales30d[mid]!.salePrice
      : Math.round((sales30d[mid - 1]!.salePrice + sales30d[mid]!.salePrice) / 2);
  })();

  await tx.marketAnalytics.upsert({
    where: { itemId },
    create: {
      itemId,
      itemName,
      lastSalePrice,
      averagePrice24h: avg(sales24h),
      averagePrice7d: avg(sales7d),
      medianPrice30d: median30,
      salesCount24h: sales24h.length,
      salesCount7d: sales7d.length,
    },
    update: {
      itemName,
      lastSalePrice,
      averagePrice24h: avg(sales24h),
      averagePrice7d: avg(sales7d),
      medianPrice30d: median30,
      salesCount24h: sales24h.length,
      salesCount7d: sales7d.length,
    },
  });
}

/** Yalnızca tam sayı string → ilan no (UUID parseInt tuzağından kaçın). */
export function parseMarketListingNoRef(ref: string): number | null {
  const trimmed = ref.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

async function resolveListing(
  tx: Prisma.TransactionClient,
  listingRef: string,
): Promise<MarketListing | null> {
  const trimmed = listingRef.trim();
  const listingNo = parseMarketListingNoRef(trimmed);
  if (listingNo !== null) {
    return tx.marketListing.findUnique({ where: { listingNo } });
  }
  if (trimmed.length === 36) {
    return tx.marketListing.findUnique({ where: { id: trimmed } });
  }
  return tx.marketListing.findFirst({ where: { id: { startsWith: trimmed } } });
}

async function resolveListingIdForLock(
  prisma: PrismaClient,
  listingRef: string,
): Promise<string | null> {
  const trimmed = listingRef.trim();
  const select = { id: true } as const;
  const listingNo = parseMarketListingNoRef(trimmed);
  if (listingNo !== null) {
    return (
      (await prisma.marketListing.findUnique({ where: { listingNo }, select }))?.id ?? null
    );
  }
  if (trimmed.length === 36) {
    return (
      (await prisma.marketListing.findUnique({ where: { id: trimmed }, select }))?.id ?? null
    );
  }
  return (
    (await prisma.marketListing.findFirst({ where: { id: { startsWith: trimmed } }, select }))
      ?.id ?? null
  );
}

/** Satın al */
export async function buyListing(
  prisma: PrismaClient,
  buyerId: string,
  listingRef: string,
  redis?: Redis,
) {
  const listingId = await resolveListingIdForLock(prisma, listingRef);
  if (!listingId) throw new Error('İlan bulunamadı.');

  const listingPreview = await prisma.marketListing.findUnique({
    where: { id: listingId },
    select: { sellerId: true },
  });
  if (!listingPreview) throw new Error('İlan bulunamadı.');

  return runWithFinancialLocks([buyerId, listingPreview.sellerId], async () =>
    withLock(buyerId, 'market_buy', async () =>
      runWithListingLock(listingId, async () => {
      const result = await prisma.$transaction(async (tx) => {
        const listing = await resolveListing(tx, listingId);
        if (!listing) throw new Error('İlan bulunamadı.');
        if (listing.status !== 'active') throw new Error('Bu ilan artık aktif değil.');
        if (listing.expiresAt <= new Date()) throw new Error('Bu ilanın süresi dolmuş.');
        if (listing.sellerId === buyerId) throw new Error('Kendi ilanını satın alamazsın.');

        const reserved = await tx.marketListing.updateMany({
          where: { id: listing.id, status: 'active' },
          data: { status: 'reserved' },
        });
        if (reserved.count === 0) throw new Error('İlan başka biri tarafından alınıyor.');

        const buyer = await tx.player.findUnique({
          where: { id: buyerId },
          select: { coins: true, createdAt: true },
        });
        const seller = await tx.player.findUnique({
          where: { id: listing.sellerId },
          select: { coins: true, createdAt: true },
        });
        if (!buyer || !seller) throw new Error('Oyuncu bulunamadı.');
        if (buyer.coins < listing.price) throw new Error('Yetersiz bakiye.');

        const tax = calcTax(listing.price);
        const baseSellerGain = listing.price - tax;
        const sellerGain = await applyRewardMultiplier(
          tx,
          { userId: listing.sellerId, rewardType: 'market_gain' },
          baseSellerGain,
        );

        await tx.player.update({
          where: { id: buyerId },
          data: { coins: { decrement: listing.price } },
        });
        await tx.player.update({
          where: { id: listing.sellerId },
          data: { coins: { increment: sellerGain } },
        });

        if (listing.marketCategory === 'owl') {
          await tx.owl.update({
            where: { id: listing.itemId },
            data: { ownerId: buyerId, passiveMode: 'idle', isMain: false },
          });
        } else {
          await tx.inventoryItem.upsert({
            where: { ownerId_itemName: { ownerId: buyerId, itemName: listing.itemName } },
            create: {
              ownerId: buyerId,
              itemName: listing.itemName,
              itemType: listing.itemType,
              rarity: listing.rarity,
              quantity: listing.quantity,
            },
            update: { quantity: { increment: listing.quantity } },
          });
        }

        const { score, factors } = await computeRiskScore(
          tx,
          listing.sellerId,
          buyerId,
          listing.itemId,
          listing.price,
          seller.createdAt,
          buyer.createdAt,
        );

        const sale = await tx.marketSale.create({
          data: {
            listingId: listing.id,
            listingNo: listing.listingNo,
            sellerId: listing.sellerId,
            buyerId,
            itemId: listing.itemId,
            itemName: listing.itemName,
            itemType: listing.itemType,
            marketCategory: listing.marketCategory,
            quantity: listing.quantity,
            salePrice: listing.price,
            taxPaid: tax,
            riskScore: score,
          },
        });

        if (score >= MARKET_SUSPICIOUS_THRESHOLD) {
          await tx.marketSuspiciousLog.create({
            data: {
              saleId: sale.id,
              listingId: listing.id,
              sellerId: listing.sellerId,
              buyerId,
              itemId: listing.itemId,
              itemName: listing.itemName,
              salePrice: listing.price,
              riskScore: score,
              riskFactors: factors,
            },
          });
        }

        const sold = await tx.marketListing.update({
          where: { id: listing.id },
          data: {
            status: 'sold',
            buyerId,
            soldAt: new Date(),
          },
        });

        return { listing: sold, tax, sellerGain, sale, riskScore: score };
      });

      enqueueDbWrite({
        type: 'refreshMarketAnalytics',
        itemId: result.listing.itemId,
        itemName: result.listing.itemName,
        lastSalePrice: result.listing.price,
      });

      if (redis) {
        const jobs: Promise<unknown>[] = [
          applyCoinDeltaInRedis(redis, buyerId, -result.listing.price, prisma),
          applyCoinDeltaInRedis(redis, result.listing.sellerId, result.sellerGain, prisma),
        ];
        if (result.listing.marketCategory !== 'owl') {
          jobs.push(
            addInventoryItemInRedis(
              redis,
              buyerId,
              result.listing.itemName,
              result.listing.itemType,
              result.listing.rarity,
              result.listing.quantity,
              prisma,
            ),
          );
        }
        await Promise.all(jobs);
      }
      await fireQuest(prisma, buyerId, 'market_buy', 1);
      return result;
      }),
    ),
  );
}

/** İlan iptal */
export async function cancelListing(
  prisma: PrismaClient,
  sellerId: string,
  listingRef: string,
  redis?: Redis,
) {
  return withLock(sellerId, 'market_list', async () => {
    const listing = await prisma.$transaction(async (tx) => {
      const found = await resolveListing(tx, listingRef);
      if (!found) throw new Error('İlan bulunamadı.');
      if (found.sellerId !== sellerId) throw new Error('Bu ilan sana ait değil.');
      if (found.status !== 'active') throw new Error('Bu ilan iptal edilemez.');

      await returnListingToSeller(tx, found);

      return {
        listing: await tx.marketListing.update({
          where: { id: found.id },
          data: { status: 'cancelled' },
        }),
        itemName: found.marketCategory === 'owl' ? null : found.itemName,
      };
    });

    if (redis && listing.itemName) {
      await syncInventoryItemsFromPg(redis, prisma, sellerId, [listing.itemName]);
    }
    return listing.listing;
  });
}

async function returnListingToSeller(
  tx: Prisma.TransactionClient,
  listing: MarketListing,
): Promise<void> {
  if (listing.marketCategory === 'owl') {
    await tx.owl.update({
      where: { id: listing.itemId },
      data: { passiveMode: 'idle' },
    });
  } else {
    await tx.inventoryItem.upsert({
      where: { ownerId_itemName: { ownerId: listing.sellerId, itemName: listing.itemName } },
      create: {
        ownerId: listing.sellerId,
        itemName: listing.itemName,
        itemType: listing.itemType,
        rarity: listing.rarity,
        quantity: listing.quantity,
      },
      update: { quantity: { increment: listing.quantity } },
    });
  }
}

/** Süresi dolmuş ilanları iade et */
export async function cleanupExpiredListings(prisma: PrismaClient, redis?: Redis) {
  const now = new Date();
  const expired = await prisma.marketListing.findMany({
    where: { status: 'active', expiresAt: { lte: now } },
    take: 50,
  });

  const sellerIds = new Set<string>();

  const sellerItems = new Map<string, string[]>();

  for (const listing of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.marketListing.findUnique({ where: { id: listing.id } });
        if (!current || current.status !== 'active') return;

        await returnListingToSeller(tx, current);
        await tx.marketListing.update({
          where: { id: listing.id },
          data: { status: 'returned' },
        });
      });
      sellerIds.add(listing.sellerId);
      if (listing.marketCategory !== 'owl') {
        const items = sellerItems.get(listing.sellerId) ?? [];
        items.push(listing.itemName);
        sellerItems.set(listing.sellerId, items);
      }
    } catch (err) {
      console.error(`[Market] İlan temizleme hatası (${listing.listingNo}):`, err);
    }
  }

  if (redis) {
    await Promise.all(
      [...sellerItems.entries()].map(([sellerId, itemNames]) =>
        syncInventoryItemsFromPg(redis, prisma, sellerId, itemNames),
      ),
    );
  }

  return expired.length;
}

export async function fetchListings(prisma: PrismaClient, options: MarketBrowseOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? 'price_asc';
  const skip = (page - 1) * MARKET_PAGE_SIZE;

  const where: Prisma.MarketListingWhereInput = activeListingWhere();

  if (options.category) {
    where.marketCategory = options.category;
  }

  if (options.sellerId) {
    where.sellerId = options.sellerId;
  }

  if (options.search) {
    where.OR = [
      { itemName: { contains: options.search, mode: 'insensitive' } },
      { itemId: { contains: options.search, mode: 'insensitive' } },
    ];
  }

  const [listings, total] = await Promise.all([
    prisma.marketListing.findMany({
      where,
      orderBy: buildOrderBy(sort),
      skip,
      take: MARKET_PAGE_SIZE,
    }),
    prisma.marketListing.count({ where }),
  ]);

  return {
    listings,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE)),
  };
}

export interface MarketStallBrowseResult {
  stalls: MarketSellerStall[];
  listings: MarketListing[];
  totalListings: number;
  totalStalls: number;
  page: number;
  totalPages: number;
}

/** Kategori/arama listesini satıcı tezgâhlarına göre gruplar ve sayfalar. */
export async function fetchMarketStalls(
  prisma: PrismaClient,
  options: MarketBrowseOptions = {},
): Promise<MarketStallBrowseResult> {
  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? 'price_asc';

  const where: Prisma.MarketListingWhereInput = activeListingWhere();

  if (options.category) {
    where.marketCategory = options.category;
  }

  if (options.sellerId) {
    where.sellerId = options.sellerId;
  }

  if (options.search) {
    where.OR = [
      { itemName: { contains: options.search, mode: 'insensitive' } },
      { itemId: { contains: options.search, mode: 'insensitive' } },
    ];
  }

  const allListings = await prisma.marketListing.findMany({ where });
  const sortedStalls = sortMarketStalls(groupListingsIntoStalls(allListings), sort);
  const totalListings = allListings.length;
  const totalStalls = sortedStalls.length;
  const totalPages = Math.max(1, Math.ceil(totalStalls / MARKET_PAGE_SIZE));
  const stalls = paginateMarketStalls(sortedStalls, page, MARKET_PAGE_SIZE);

  return {
    stalls,
    listings: flattenStallListings(stalls),
    totalListings,
    totalStalls,
    page,
    totalPages,
  };
}

/** Tüm aktif ilanları satıcı tezgâhlarına gruplar (pazar ID kaydı için). */
export async function fetchAllActiveMarketStalls(prisma: PrismaClient): Promise<MarketSellerStall[]> {
  const listings = await prisma.marketListing.findMany({
    where: activeListingWhere(),
    orderBy: [{ listingNo: 'asc' }],
  });
  return groupListingsIntoStalls(listings);
}

export async function fetchListingByNo(prisma: PrismaClient, listingNo: number) {
  return prisma.marketListing.findUnique({ where: { listingNo } });
}

const OWL_MARKET_SELECT = {
  id: true,
  species: true,
  nickname: true,
  tier: true,
  quality: true,
  hp: true,
  hpMax: true,
  staminaCur: true,
  statGaga: true,
  statGoz: true,
  statKulak: true,
  statKanat: true,
  statPence: true,
  bond: true,
  effectiveness: true,
} as const;

/** Aktif ilanlardaki baykuşlar için toplu stat özeti */
export async function fetchOwlSnapshotsForListings(
  prisma: PrismaClient,
  listings: MarketListing[],
): Promise<Map<string, OwlMarketSnapshot>> {
  const owlIds = listings
    .filter((l) => l.marketCategory === 'owl')
    .map((l) => l.itemId);
  if (owlIds.length === 0) return new Map();

  const owls = await prisma.owl.findMany({
    where: { id: { in: owlIds } },
    select: OWL_MARKET_SELECT,
  });

  return new Map(owls.map((owl) => [owl.id, owlToMarketSnapshot(owl)]));
}

export async function fetchOwlSnapshotForListing(
  prisma: PrismaClient,
  listing: MarketListing,
): Promise<OwlMarketSnapshot | undefined> {
  if (listing.marketCategory !== 'owl') return undefined;
  const owl = await prisma.owl.findUnique({
    where: { id: listing.itemId },
    select: OWL_MARKET_SELECT,
  });
  return owl ? owlToMarketSnapshot(owl) : undefined;
}

export async function fetchRecentSales(prisma: PrismaClient, limit = 5) {
  return prisma.marketSale.findMany({
    orderBy: { soldAt: 'desc' },
    take: limit,
  });
}

export async function fetchMarketAnalytics(prisma: PrismaClient, itemId: string) {
  return prisma.marketAnalytics.findUnique({ where: { itemId } });
}

export async function fetchMyActiveListings(prisma: PrismaClient, sellerId: string) {
  return prisma.marketListing.findMany({
    where: activeListingWhere({ sellerId }),
    orderBy: { createdAt: 'desc' },
  });
}

/** Satıcının tezgâhındaki diğer aktif ilanlar (detay ekranı için). */
export async function fetchSellerStallListings(
  prisma: PrismaClient,
  sellerId: string,
  excludeListingNo?: number,
): Promise<MarketListing[]> {
  return prisma.marketListing.findMany({
    where: activeListingWhere({
      sellerId,
      ...(excludeListingNo != null ? { listingNo: { not: excludeListingNo } } : {}),
    }),
    orderBy: [{ price: 'asc' }, { listingNo: 'asc' }],
  });
}

export interface MarketHubSummary {
  categoryCounts: Record<MarketCategory, number>;
  busiestCategory: MarketCategory;
  lastSale: MarketSaleView | null;
  newestListings: MarketListing[];
}

export async function fetchMarketHubSummary(prisma: PrismaClient): Promise<MarketHubSummary> {
  const categoryCounts = await countListingsByCategory(prisma);
  const categories: MarketCategory[] = ['owl', 'item', 'buff', 'material'];
  const busiestCategory = categories.reduce((best, cat) =>
    categoryCounts[cat] > categoryCounts[best] ? cat : best,
  );

  const [lastSaleRow, newestListings] = await Promise.all([
    prisma.marketSale.findFirst({ orderBy: { soldAt: 'desc' } }),
    prisma.marketListing.findMany({
      where: activeListingWhere(),
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ]);

  const lastSale: MarketSaleView | null = lastSaleRow
    ? {
        itemName: lastSaleRow.itemName,
        marketCategory: lastSaleRow.marketCategory,
        quantity: lastSaleRow.quantity,
        salePrice: lastSaleRow.salePrice,
        soldAt: lastSaleRow.soldAt,
      }
    : null;

  return { categoryCounts, busiestCategory, lastSale, newestListings };
}

/** Aktif ilanın satıcı notunu güncelle */
export async function updateListingSellerNote(
  prisma: PrismaClient,
  sellerId: string,
  listingRef: string,
  rawNote: string,
): Promise<MarketListing> {
  return updateActiveListing(prisma, sellerId, listingRef, { sellerNote: rawNote });
}

export interface UpdateActiveListingInput {
  price?: number;
  quantity?: number;
  sellerNote?: string | null;
}

async function applyListingQuantityDelta(
  tx: Prisma.TransactionClient,
  listing: MarketListing,
  newQuantity: number,
): Promise<void> {
  if (listing.marketCategory === 'owl') {
    if (newQuantity !== 1) throw new Error('Baykuş ilanında adet değiştirilemez.');
    return;
  }

  if (newQuantity < 1) throw new Error('Miktar en az 1 olmalı.');

  const delta = newQuantity - listing.quantity;
  if (delta === 0) return;

  const invItem = await tx.inventoryItem.findUnique({
    where: { ownerId_itemName: { ownerId: listing.sellerId, itemName: listing.itemName } },
  });

  if (delta > 0) {
    if (!invItem || invItem.quantity < delta) {
      throw new Error('Yetersiz eşya miktarı.');
    }
    const remaining = invItem.quantity - delta;
    if (remaining <= 0) {
      await tx.inventoryItem.delete({ where: { id: invItem.id } });
    } else {
      await tx.inventoryItem.update({
        where: { id: invItem.id },
        data: { quantity: remaining },
      });
    }
    return;
  }

  const returnQty = -delta;
  if (invItem) {
    await tx.inventoryItem.update({
      where: { id: invItem.id },
      data: { quantity: { increment: returnQty } },
    });
  } else {
    await tx.inventoryItem.create({
      data: {
        ownerId: listing.sellerId,
        itemName: listing.itemName,
        itemType: listing.itemType,
        rarity: listing.rarity,
        quantity: returnQty,
      },
    });
  }
}

/** Aktif ilanın fiyat, adet ve/veya notunu günceller (escrow uyumlu). */
export async function updateActiveListing(
  prisma: PrismaClient,
  sellerId: string,
  listingRef: string,
  input: UpdateActiveListingInput,
  redis?: Redis,
): Promise<MarketListing> {
  if (input.price != null && input.price < 1) {
    throw new Error('Fiyat en az 1 coin olmalı.');
  }

  const note = input.sellerNote !== undefined
    ? validateMarketSellerNote(input.sellerNote)
    : undefined;

  const result = await withLock(sellerId, 'market_list', async () => {
    const updated = await prisma.$transaction(async (tx) => {
      const listing = await resolveListing(tx, listingRef);
      if (!listing) throw new Error('İlan bulunamadı.');
      if (listing.sellerId !== sellerId) throw new Error('Bu ilan sana ait değil.');
      if (listing.status !== 'active') throw new Error('Yalnızca aktif ilanlar düzenlenebilir.');
      if (listing.expiresAt <= new Date()) throw new Error('Bu ilanın süresi dolmuş.');

      if (input.quantity != null) {
        await applyListingQuantityDelta(tx, listing, input.quantity);
      }

      return tx.marketListing.update({
        where: { id: listing.id },
        data: {
          ...(input.price != null ? { price: input.price } : {}),
          ...(input.quantity != null ? { quantity: input.quantity } : {}),
          ...(note !== undefined ? { sellerNote: note } : {}),
        },
      });
    });

    return updated;
  });

  if (redis && result.marketCategory !== 'owl') {
    await syncInventoryItemsFromPg(redis, prisma, sellerId, [result.itemName]);
  }

  return result;
}

export async function countListingsByCategory(prisma: PrismaClient) {
  const categories: MarketCategory[] = ['owl', 'item', 'buff', 'material'];
  const counts = await Promise.all(
    categories.map(async (cat) => ({
      category: cat,
      count: await prisma.marketListing.count({
        where: activeListingWhere({ marketCategory: cat }),
      }),
    })),
  );
  return Object.fromEntries(counts.map((c) => [c.category, c.count])) as Record<
    MarketCategory,
    number
  >;
}

export { MARKET_PAGE_SIZE, CATEGORY_ITEM_TYPES };
