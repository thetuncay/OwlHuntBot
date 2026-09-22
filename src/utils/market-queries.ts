/**
 * market-queries.ts — Pazar UI veri sorguları
 */

import type { PrismaClient, MarketListing } from '@prisma/client';
import {
  fetchListingByNo,
  fetchSellerStallListings,
  fetchMarketHubSummary,
  fetchMyActiveListings,
  type MarketCategory,
  type MarketHubSummary,
} from '../systems/market';
import {
  flattenStallListings,
  groupListingsIntoStalls,
  sortMarketStalls,
} from './market-stalls';
import { MARKET_BROWSE_PAGE_SIZE } from '../config';
import { formatOwlIdentity } from './owl-display';
import { resolveMarketSellerByQuery } from './market-seller-resolve';
import { TIER_LABEL } from './theme';

export const MARKET_CATEGORY_ORDER: MarketCategory[] = ['owl', 'buff', 'item', 'material'];

export interface CategoryListingsPage {
  items: MarketListing[];
  totalPages: number;
  totalCount: number;
  page: number;
}

export interface HubStats extends MarketHubSummary {
  totalListings: number;
  totalShops: number;
}

function activeListingWhere(category?: MarketCategory) {
  return {
    status: 'active' as const,
    expiresAt: { gt: new Date() },
    ...(category ? { marketCategory: category } : {}),
  };
}

export async function getListingByNo(
  prisma: PrismaClient,
  listingNo: number,
): Promise<MarketListing | null> {
  return fetchListingByNo(prisma, listingNo);
}

export async function getCategoryListingsPage(
  prisma: PrismaClient,
  category: MarketCategory,
  page: number,
  pageSize = MARKET_BROWSE_PAGE_SIZE,
): Promise<CategoryListingsPage> {
  const allListings = await prisma.marketListing.findMany({
    where: activeListingWhere(category),
  });
  const stalls = sortMarketStalls(groupListingsIntoStalls(allListings), 'price_asc');
  const flat = flattenStallListings(stalls);
  const totalCount = flat.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const items = flat.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return { items, totalPages, totalCount, page: safePage };
}

export async function getSellerListings(
  prisma: PrismaClient,
  sellerId: string,
): Promise<MarketListing[]> {
  return fetchSellerStallListings(prisma, sellerId);
}

export async function getMyActiveListings(
  prisma: PrismaClient,
  sellerId: string,
): Promise<MarketListing[]> {
  return fetchMyActiveListings(prisma, sellerId);
}

export interface SellableEntry {
  id: string;
  label: string;
  description: string;
  maxQuantity: number;
}

export interface SellableInventoryPage {
  items: SellableEntry[];
  totalPages: number;
  page: number;
  totalCount: number;
}

const SELL_SELECT_PAGE_SIZE = 20;

export async function getSellableInventory(
  prisma: PrismaClient,
  userId: string,
  type: 'item' | 'owl',
  page: number,
  pageSize = SELL_SELECT_PAGE_SIZE,
): Promise<SellableInventoryPage> {
  if (type === 'item') {
    const rows = await prisma.inventoryItem.findMany({
      where: { ownerId: userId, quantity: { gt: 0 } },
      orderBy: [{ itemName: 'asc' }],
    });
    const totalCount = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const slice = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
    return {
      items: slice.map((row) => ({
        id: row.id,
        label: row.itemName,
        description: `Elinde ${row.quantity} adet`,
        maxQuantity: row.quantity,
      })),
      totalPages,
      page: safePage,
      totalCount,
    };
  }

  const [owls, listedOwlIds] = await Promise.all([
    prisma.owl.findMany({
      where: {
        ownerId: userId,
        isMain: false,
        passiveMode: { not: 'market' },
      },
      orderBy: [{ tier: 'desc' }, { species: 'asc' }],
      select: {
        id: true,
        species: true,
        nickname: true,
        tier: true,
      },
    }),
    prisma.marketListing.findMany({
      where: {
        sellerId: userId,
        status: 'active',
        marketCategory: 'owl',
        expiresAt: { gt: new Date() },
      },
      select: { itemId: true },
    }),
  ]);

  const listed = new Set(listedOwlIds.map((l) => l.itemId));
  const sellable = owls.filter((owl) => !listed.has(owl.id));
  const totalCount = sellable.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = sellable.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return {
    items: slice.map((owl) => {
      const tier = TIER_LABEL[owl.tier] ?? `T${owl.tier}`;
      const identity = formatOwlIdentity(owl);
      return {
        id: owl.id,
        label: `${identity.primary} · ${tier}`,
        description: owl.nickname?.trim() ? owl.species : 'Satışa uygun',
        maxQuantity: 1,
      };
    }),
    totalPages,
    page: safePage,
    totalCount,
  };
}

export async function resolveSellableItemName(
  prisma: PrismaClient,
  userId: string,
  inventoryItemId: string,
): Promise<{ itemName: string; maxQuantity: number }> {
  const row = await prisma.inventoryItem.findFirst({
    where: { id: inventoryItemId, ownerId: userId },
  });
  if (!row || row.quantity < 1) {
    throw new Error('Eşya bulunamadı veya yetersiz miktar.');
  }
  return { itemName: row.itemName, maxQuantity: row.quantity };
}

const SEARCH_RESULTS_LIMIT = 25;

export interface SearchShopMatch {
  sellerId: string;
  displayName: string;
  listingCount: number;
}

export interface SearchListingsAndSellersResult {
  query: string;
  shops: SearchShopMatch[];
  items: MarketListing[];
  truncated: boolean;
}

export async function searchListingsAndSellers(
  prisma: PrismaClient,
  rawQuery: string,
): Promise<SearchListingsAndSellersResult> {
  const query = rawQuery.trim();
  if (!query) {
    return { query: '', shops: [], items: [], truncated: false };
  }

  const sellerResolved = await resolveMarketSellerByQuery(prisma, query);
  const shops: SearchShopMatch[] = [];

  if (sellerResolved.status === 'found') {
    shops.push({
      sellerId: sellerResolved.match.sellerId,
      displayName: sellerResolved.match.displayName,
      listingCount: sellerResolved.match.listingCount,
    });
  } else if (sellerResolved.status === 'ambiguous') {
    for (const match of sellerResolved.matches) {
      shops.push({
        sellerId: match.sellerId,
        displayName: match.displayName,
        listingCount: match.listingCount,
      });
    }
  }

  const shopSlots = shops.length;
  const itemSlots = Math.max(0, SEARCH_RESULTS_LIMIT - shopSlots);

  const allItemMatches = await prisma.marketListing.findMany({
    where: {
      ...activeListingWhere(),
      OR: [
        { itemName: { contains: query, mode: 'insensitive' } },
        { itemId: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ price: 'asc' }, { listingNo: 'asc' }],
  });

  const items = allItemMatches.slice(0, itemSlots);
  const truncated = shops.length + allItemMatches.length > SEARCH_RESULTS_LIMIT;

  return { query, shops, items, truncated };
}

export async function getHubStats(prisma: PrismaClient): Promise<HubStats> {
  const summary = await fetchMarketHubSummary(prisma);
  const shopRows = await prisma.marketListing.groupBy({
    by: ['sellerId'],
    where: activeListingWhere(),
  });
  const totalListings = MARKET_CATEGORY_ORDER.reduce(
    (sum, cat) => sum + summary.categoryCounts[cat],
    0,
  );

  return {
    ...summary,
    totalListings,
    totalShops: shopRows.length,
  };
}
