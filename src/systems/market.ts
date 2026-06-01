/**
 * market.ts — Global Marketplace v1.0
 *
 * Serbest piyasa: fiyat sınırı yok, listeleme ücreti + satış vergisi.
 * Escrow: ilan açılınca item/baykuş oyuncudan alınır.
 */

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
import { runWithListingLock } from './economy-transaction-manager';
import { trackQuestProgress } from './daily-quests';
import type { Redis } from 'ioredis';
import {
  addInventoryItemInRedis,
  applyCoinDeltaInRedis,
  deductCoinsInRedis,
  hydratePlayerState,
  reloadInventoryFromPg,
} from '../state/player-state';
import { resolveOwlByInput } from '../utils/owl-id';
import { enqueueDbWrite } from '../utils/db-queue';

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

/** İlan oluştur — envanter eşyası */
export async function createListing(
  prisma: PrismaClient,
  sellerId: string,
  itemName: string,
  quantity: number,
  price: number,
  redis?: Redis,
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
          `Listeleme ücreti **${listingFee.toLocaleString('tr-TR')}** coin — yetersiz bakiye.`,
        );
      }
    } else if (player.coins < listingFee) {
      throw new Error(
        `Listeleme ücreti **${listingFee.toLocaleString('tr-TR')}** coin — yetersiz bakiye.`,
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

      trackQuestProgress(tx as PrismaClient, sellerId, 'market').catch(() => null);
      return { listing, listingFee };
    });

    if (redis) {
      await deductCoinsInRedis(redis, sellerId, result.listingFee, prisma);
      await reloadInventoryFromPg(redis, prisma, sellerId);
    }
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
          `Listeleme ücreti **${listingFee.toLocaleString('tr-TR')}** coin — yetersiz bakiye.`,
        );
      }
    } else if (player.coins < listingFee) {
      throw new Error(
        `Listeleme ücreti **${listingFee.toLocaleString('tr-TR')}** coin — yetersiz bakiye.`,
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
          status: 'active',
          expiresAt: new Date(Date.now() + MARKET_LISTING_DURATION_MS),
        },
      });

      await tx.owl.update({
        where: { id: owl.id },
        data: { passiveMode: 'market', isMain: false },
      });

      trackQuestProgress(tx as PrismaClient, sellerId, 'market').catch(() => null);
      return { listing, listingFee };
    });

    if (redis) {
      await deductCoinsInRedis(redis, sellerId, result.listingFee, prisma);
    }
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

async function resolveListing(
  tx: Prisma.TransactionClient,
  listingRef: string,
): Promise<MarketListing | null> {
  const num = parseInt(listingRef, 10);
  if (!Number.isNaN(num)) {
    return tx.marketListing.findUnique({ where: { listingNo: num } });
  }
  if (listingRef.length === 36) {
    return tx.marketListing.findUnique({ where: { id: listingRef } });
  }
  return tx.marketListing.findFirst({ where: { id: { startsWith: listingRef } } });
}

async function resolveListingIdForLock(
  prisma: PrismaClient,
  listingRef: string,
): Promise<string | null> {
  const num = parseInt(listingRef, 10);
  const select = { id: true } as const;
  if (!Number.isNaN(num)) {
    return (
      (await prisma.marketListing.findUnique({ where: { listingNo: num }, select }))?.id ?? null
    );
  }
  if (listingRef.length === 36) {
    return (
      (await prisma.marketListing.findUnique({ where: { id: listingRef }, select }))?.id ?? null
    );
  }
  return (
    (await prisma.marketListing.findFirst({ where: { id: { startsWith: listingRef } }, select }))
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
  return withLock(buyerId, 'market_buy', async () => {
    const listingId = await resolveListingIdForLock(prisma, listingRef);
    if (!listingId) throw new Error('İlan bulunamadı.');

    return runWithListingLock(listingId, async () => {
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
        const sellerGain = listing.price - tax;

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
      return result;
    });
  });
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

      return tx.marketListing.update({
        where: { id: found.id },
        data: { status: 'cancelled' },
      });
    });

    if (redis) {
      await reloadInventoryFromPg(redis, prisma, sellerId);
    }
    return listing;
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
    } catch (err) {
      console.error(`[Market] İlan temizleme hatası (${listing.listingNo}):`, err);
    }
  }

  if (redis) {
    await Promise.all([...sellerIds].map((id) => reloadInventoryFromPg(redis, prisma, id)));
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

export async function fetchListingByNo(prisma: PrismaClient, listingNo: number) {
  return prisma.marketListing.findUnique({ where: { listingNo } });
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
