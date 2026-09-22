import { describe, expect, it } from 'vitest';
import type { MarketListing } from '@prisma/client';
import {
  groupListingsIntoStalls,
  paginateMarketStalls,
  sortMarketStalls,
} from '../utils/market-stalls';

function listing(
  partial: Partial<MarketListing> & Pick<MarketListing, 'listingNo' | 'sellerId' | 'price' | 'itemName'>,
): MarketListing {
  return {
    id: `id-${partial.listingNo}`,
    marketCategory: 'buff',
    itemId: `item-${partial.listingNo}`,
    itemType: 'Buff',
    quantity: 1,
    status: 'active',
    sellerNote: null,
    createdAt: new Date('2026-06-01T12:00:00Z'),
    expiresAt: new Date('2026-06-03T12:00:00Z'),
    ...partial,
  } as MarketListing;
}

describe('groupListingsIntoStalls', () => {
  it('merges same seller into one stall', () => {
    const listings = [
      listing({ listingNo: 10, sellerId: 's1', price: 1000, itemName: 'Berrak Zihin' }),
      listing({ listingNo: 11, sellerId: 's1', price: 2000, itemName: 'Keskin Nişan' }),
      listing({ listingNo: 12, sellerId: 's2', price: 500, itemName: 'Savunma' }),
    ];
    const stalls = groupListingsIntoStalls(listings);
    expect(stalls).toHaveLength(2);
    expect(stalls.find((s) => s.sellerId === 's1')?.listings).toHaveLength(2);
  });
});

describe('sortMarketStalls', () => {
  it('orders stalls by cheapest listing for price_asc', () => {
    const listings = [
      listing({ listingNo: 1, sellerId: 'expensive', price: 9000, itemName: 'A' }),
      listing({ listingNo: 2, sellerId: 'cheap', price: 100, itemName: 'B' }),
      listing({ listingNo: 3, sellerId: 'expensive', price: 5000, itemName: 'C' }),
    ];
    const stalls = sortMarketStalls(groupListingsIntoStalls(listings), 'price_asc');
    expect(stalls[0]?.sellerId).toBe('cheap');
    expect(stalls[1]?.listings.map((l) => l.price)).toEqual([5000, 9000]);
  });
});

describe('paginateMarketStalls', () => {
  it('pages by stall count', () => {
    const stalls = [
      { sellerId: 'a', listings: [listing({ listingNo: 1, sellerId: 'a', price: 1, itemName: 'X' })] },
      { sellerId: 'b', listings: [listing({ listingNo: 2, sellerId: 'b', price: 2, itemName: 'Y' })] },
      { sellerId: 'c', listings: [listing({ listingNo: 3, sellerId: 'c', price: 3, itemName: 'Z' })] },
    ];
    expect(paginateMarketStalls(stalls, 1, 2)).toHaveLength(2);
    expect(paginateMarketStalls(stalls, 2, 2)).toHaveLength(1);
  });
});
