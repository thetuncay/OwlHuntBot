import type { MarketListing } from '@prisma/client';
import type { MarketSort } from '../systems/market';

export interface MarketSellerStall {
  sellerId: string;
  listings: MarketListing[];
}

function listingSortValue(l: MarketListing, sort: MarketSort): number | Date {
  switch (sort) {
    case 'price_desc':
    case 'most_expensive':
      return l.price;
    case 'newest':
      return l.createdAt;
    case 'oldest':
      return l.createdAt;
    case 'ending_soon':
      return l.expiresAt;
    case 'cheapest':
    case 'price_asc':
    default:
      return l.price;
  }
}

function compareListings(a: MarketListing, b: MarketListing, sort: MarketSort): number {
  const va = listingSortValue(a, sort);
  const vb = listingSortValue(b, sort);
  if (va instanceof Date && vb instanceof Date) {
    const diff = va.getTime() - vb.getTime();
    if (diff !== 0) {
      return sort === 'newest' || sort === 'ending_soon' ? -diff : diff;
    }
  } else {
    const na = va as number;
    const nb = vb as number;
    if (na !== nb) {
      const asc = sort === 'price_asc' || sort === 'cheapest' || sort === 'oldest';
      return asc ? na - nb : nb - na;
    }
  }
  return a.listingNo - b.listingNo;
}

function stallSortValue(stall: MarketSellerStall, sort: MarketSort): number | Date {
  const values = stall.listings.map((l) => listingSortValue(l, sort));
  if (values[0] instanceof Date) {
    const times = (values as Date[]).map((d) => d.getTime());
    if (sort === 'newest') return new Date(Math.max(...times));
    if (sort === 'oldest') return new Date(Math.min(...times));
    if (sort === 'ending_soon') return new Date(Math.min(...times));
    return new Date(Math.max(...times));
  }
  const nums = values as number[];
  if (sort === 'price_desc' || sort === 'most_expensive') return Math.max(...nums);
  return Math.min(...nums);
}

function compareStalls(a: MarketSellerStall, b: MarketSellerStall, sort: MarketSort): number {
  const va = stallSortValue(a, sort);
  const vb = stallSortValue(b, sort);
  if (va instanceof Date && vb instanceof Date) {
    const diff = va.getTime() - vb.getTime();
    if (diff !== 0) {
      return sort === 'newest' || sort === 'ending_soon' ? -diff : diff;
    }
  } else {
    const na = va as number;
    const nb = vb as number;
    if (na !== nb) {
      const asc = sort === 'price_asc' || sort === 'cheapest' || sort === 'oldest';
      return asc ? na - nb : nb - na;
    }
  }
  const aMin = Math.min(...a.listings.map((l) => l.listingNo));
  const bMin = Math.min(...b.listings.map((l) => l.listingNo));
  return aMin - bMin;
}

/** Aktif ilanları sellerId bazında tezgâhlara gruplar. */
export function groupListingsIntoStalls(listings: MarketListing[]): MarketSellerStall[] {
  const bySeller = new Map<string, MarketListing[]>();
  for (const listing of listings) {
    const bucket = bySeller.get(listing.sellerId) ?? [];
    bucket.push(listing);
    bySeller.set(listing.sellerId, bucket);
  }
  return [...bySeller.entries()].map(([sellerId, sellerListings]) => ({
    sellerId,
    listings: sellerListings,
  }));
}

/** Tezgâhları sıralar; her tezgâhtaki ürünleri de aynı kritere göre dizer. */
export function sortMarketStalls(stalls: MarketSellerStall[], sort: MarketSort): MarketSellerStall[] {
  return [...stalls]
    .sort((a, b) => compareStalls(a, b, sort))
    .map((stall) => ({
      ...stall,
      listings: [...stall.listings].sort((x, y) => compareListings(x, y, sort)),
    }));
}

export function paginateMarketStalls(
  stalls: MarketSellerStall[],
  page: number,
  pageSize: number,
): MarketSellerStall[] {
  const skip = (Math.max(1, page) - 1) * pageSize;
  return stalls.slice(skip, skip + pageSize);
}

export function flattenStallListings(stalls: MarketSellerStall[]): MarketListing[] {
  return stalls.flatMap((stall) => stall.listings);
}
