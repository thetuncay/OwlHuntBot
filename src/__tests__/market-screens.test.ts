import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MarketListing } from '@prisma/client';
import { renderMarketScreen } from '../utils/market-screens';

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
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    ...partial,
  } as MarketListing;
}

function makePrismaMock() {
  return {
    marketListing: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    marketSale: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    marketAnalytics: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    player: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    owl: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

describe('renderMarketScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hub screen has category select and three action buttons', async () => {
    const prisma = makePrismaMock();
    vi.mocked(prisma.marketListing.findMany).mockResolvedValue([]);
    vi.mocked(prisma.marketListing.groupBy).mockResolvedValue([]);

    const { embed, components } = await renderMarketScreen('mk:hub', {
      prisma,
      userId: 'buyer-1',
    });

    expect(embed.data.title).toBe('🦉 Baykuş Pazarı');
    expect(embed.data.description).toBe('Henüz açık ilan yok.');
    expect(components).toHaveLength(2);
    expect(components[0]!.components).toHaveLength(1);
    expect(components[0]!.components[0]!.data.custom_id).toBe('mk:hub:select');
    expect(components[1]!.components).toHaveLength(3);
  });

  it('empty category browse hides select and shows back button', async () => {
    const prisma = makePrismaMock();
    vi.mocked(prisma.marketListing.findMany).mockResolvedValue([]);

    const { embed, components } = await renderMarketScreen('mk:cat:buff:0', {
      prisma,
      userId: 'buyer-1',
    });

    expect(embed.data.title).toContain('İksir Köşesi');
    expect(embed.data.description).toBe('Bu sırada henüz ilan yok.');
    expect(components).toHaveLength(1);
    expect(components[0]!.components[0]!.data.custom_id).toBe('mk:hub');
  });

  it('category browse lists listings in select menu with pagination', async () => {
    const prisma = makePrismaMock();
    const rows = Array.from({ length: 3 }, (_, i) =>
      listing({
        listingNo: i + 1,
        sellerId: 'seller-1',
        price: 1000 * (i + 1),
        itemName: `İksir ${i + 1}`,
        marketCategory: 'buff',
      }),
    );
    vi.mocked(prisma.marketListing.findMany).mockResolvedValue(rows);
    vi.mocked(prisma.player.findMany).mockResolvedValue([
      {
        id: 'seller-1',
        leaderboardName: 'Tuncay',
        registrations: [{ displayName: 'Tuncay', username: 'tuncay' }],
      },
    ] as never);

    const { embed, components } = await renderMarketScreen('mk:cat:buff:0', {
      prisma,
      userId: 'buyer-1',
    });

    expect(embed.data.description).toContain('3 ilan · sayfa 1/1');
    expect(components).toHaveLength(3);
    expect(components[0]!.components[0]!.data.custom_id).toBe('mk:cat:buff:0:select');
    expect(components[1]!.components).toHaveLength(2);
    expect(components[1]!.components[0]!.data.disabled).toBe(true);
    expect(components[1]!.components[1]!.data.disabled).toBe(true);
  });

  it('item detail hides buy button for own listing', async () => {
    const prisma = makePrismaMock();
    const row = listing({
      listingNo: 7,
      sellerId: 'seller-1',
      price: 5000,
      itemName: 'Berrak Zihin',
    });
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValue(row);
    vi.mocked(prisma.player.findMany).mockResolvedValue([
      {
        id: 'seller-1',
        leaderboardName: 'Tuncay',
        registrations: [{ displayName: 'Tuncay', username: 'tuncay' }],
      },
    ] as never);

    const { embed, components } = await renderMarketScreen('mk:item:7:cat.buff.0', {
      prisma,
      userId: 'seller-1',
    });

    expect(embed.data.description).toContain('Bu senin ilanın.');
    const buttons = components[0]!.components;
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.data.label).toBe('Geri');
  });

  it('item detail shows buy button for other seller listing', async () => {
    const prisma = makePrismaMock();
    const row = listing({
      listingNo: 7,
      sellerId: 'seller-1',
      price: 5000,
      itemName: 'Berrak Zihin',
    });
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValue(row);
    vi.mocked(prisma.player.findMany).mockResolvedValue([
      {
        id: 'seller-1',
        leaderboardName: 'Tuncay',
        registrations: [{ displayName: 'Tuncay', username: 'tuncay' }],
      },
    ] as never);

    const { components } = await renderMarketScreen('mk:item:7:cat.buff.0', {
      prisma,
      userId: 'buyer-1',
    });

    const labels = components[0]!.components.map((c) => c.data.label);
    expect(labels).toContain('Satın Al');
    expect(labels).toContain('Geri');
  });
});
