import { describe, expect, it, vi, beforeEach } from 'vitest';
import { searchListingsAndSellers } from '../utils/market-queries';
import { renderSearchResultsScreen } from '../utils/market-screens';

vi.mock('../utils/market-seller-resolve', () => ({
  resolveMarketSellerByQuery: vi.fn(),
}));

import { resolveMarketSellerByQuery } from '../utils/market-seller-resolve';

const mockedResolve = vi.mocked(resolveMarketSellerByQuery);

function makeListing(no: number, name: string, sellerId = 'seller-1') {
  return {
    listingNo: no,
    sellerId,
    itemId: `item-${no}`,
    itemName: name,
    itemType: 'Buff',
    marketCategory: 'buff',
    quantity: 1,
    price: 100 + no,
    status: 'active',
    expiresAt: new Date(Date.now() + 86400000),
    sellerNote: null,
    listingFeePaid: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePrismaMock(listings: ReturnType<typeof makeListing>[]) {
  return {
    marketListing: {
      findMany: vi.fn().mockResolvedValue(listings),
    },
    player: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'seller-1',
          leaderboardName: 'Kifoz',
          registrations: [{ displayName: 'Kifoz', username: 'kifoz' }],
        },
      ]),
    },
    owl: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

describe('searchListingsAndSellers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines shop and item matches', async () => {
    mockedResolve.mockResolvedValue({
      status: 'found',
      match: {
        sellerId: 'shop-1',
        displayName: 'Kifoz',
        score: 100,
        listingCount: 3,
      },
    });

    const prisma = makePrismaMock([
      makeListing(1, 'Savunma'),
      makeListing(2, 'Savunma Plus'),
    ]);

    const result = await searchListingsAndSellers(prisma, 'savunma');

    expect(result.shops).toHaveLength(1);
    expect(result.shops[0]!.displayName).toBe('Kifoz');
    expect(result.items).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it('truncates combined results to 25', async () => {
    mockedResolve.mockResolvedValue({
      status: 'ambiguous',
      matches: Array.from({ length: 10 }, (_, i) => ({
        sellerId: `shop-${i}`,
        displayName: `Shop ${i}`,
        score: 85,
        listingCount: 1,
      })),
    });

    const manyListings = Array.from({ length: 30 }, (_, i) => makeListing(i + 1, `Item ${i}`));
    const prisma = makePrismaMock(manyListings);

    const result = await searchListingsAndSellers(prisma, 'item');

    expect(result.shops).toHaveLength(10);
    expect(result.items).toHaveLength(15);
    expect(result.truncated).toBe(true);
  });
});

describe('renderSearchResultsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no matches', async () => {
    mockedResolve.mockResolvedValue({ status: 'not_found' });
    const prisma = makePrismaMock([]);

    const { embed, components } = await renderSearchResultsScreen(
      { prisma, userId: 'u1' },
      'yok-boyle-bir-sey',
    );

    expect(embed.data.title).toBe('Arama sonuçları: "yok-boyle-bir-sey"');
    expect(embed.data.description).toContain('sonuç bulunamadı');
    expect(components).toHaveLength(1);
  });

  it('builds select menu with shop and item options', async () => {
    mockedResolve.mockResolvedValue({
      status: 'found',
      match: {
        sellerId: 'shop-1',
        displayName: 'Kifoz',
        score: 100,
        listingCount: 2,
      },
    });
    const prisma = makePrismaMock([makeListing(5, 'Savunma', 'seller-1')]);

    const { embed, components } = await renderSearchResultsScreen(
      { prisma, userId: 'u1' },
      'sav',
    );

    expect(embed.data.title).toContain('sav');
    const select = components[0]!.components[0]!;
    expect(select.data.custom_id).toBe('mk:search:results:select');
    const options = select.toJSON().options ?? [];
    expect(options).toHaveLength(2);
    expect(options[0]!.value).toBe('shop.shop-1');
    expect(options[1]!.value).toBe('item.5.search');
  });
});
