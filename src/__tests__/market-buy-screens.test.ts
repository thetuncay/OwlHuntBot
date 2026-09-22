import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MarketListing } from '@prisma/client';
import {
  renderBuyConfirmScreen,
  renderBuyErrorScreen,
  renderBuySuccessScreen,
} from '../utils/market-screens';

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

function makePrismaMock(row: MarketListing | null) {
  return {
    marketListing: {
      findUnique: vi.fn().mockResolvedValue(row),
    },
    player: {
      findMany: vi.fn().mockResolvedValue(
        row
          ? [{
              id: row.sellerId,
              leaderboardName: 'Tuncay',
              registrations: [{ displayName: 'Tuncay', username: 'tuncay' }],
            }]
          : [],
      ),
    },
    owl: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

describe('buy screens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderBuyConfirmScreen shows tax breakdown', async () => {
    const row = listing({ listingNo: 9, sellerId: 's1', price: 10_000, itemName: 'Berrak Zihin' });
    const prisma = makePrismaMock(row);

    const { embed, components } = await renderBuyConfirmScreen(
      { prisma, userId: 'buyer-1' },
      9,
      'cat.buff.0',
    );

    expect(embed.data.title).toBe('Satın almayı onayla');
    expect(embed.data.description).toContain('10.000 coin');
    const fieldNames = embed.data.fields?.map((f) => f.name) ?? [];
    expect(fieldNames).toContain('Vergi (kesinti)');
    expect(fieldNames).toContain('Satıcıya geçecek');
    expect(components[0]!.components.map((c) => c.data.label)).toEqual(['Onayla', 'Vazgeç']);
  });

  it('renderBuySuccessScreen shows handshake and hub button for legacy buy', async () => {
    const row = listing({ listingNo: 3, sellerId: 's1', price: 5000, itemName: 'Savunma' });
    const prisma = makePrismaMock(row);

    const { embed, components } = await renderBuySuccessScreen(
      { prisma, userId: 'buyer-1' },
      { listing: row, tax: 250, sellerGain: 4750 },
      '',
    );

    expect(embed.data.title).toBe('🤝 Anlaşma tamam');
    expect(embed.data.description).toContain('Tuncay ile el sıkıştın');
    expect(components[0]!.components).toHaveLength(1);
    expect(components[0]!.components[0]!.data.custom_id).toBe('mk:hub');
  });

  it('renderBuySuccessScreen includes continue when from context exists', async () => {
    const row = listing({ listingNo: 3, sellerId: 's1', price: 5000, itemName: 'Savunma' });
    const prisma = makePrismaMock(row);

    const { components } = await renderBuySuccessScreen(
      { prisma, userId: 'buyer-1' },
      { listing: row, tax: 250, sellerGain: 4750 },
      'cat.buff.0',
    );

    const ids = components[0]!.components.map((c) => c.data.custom_id);
    expect(ids).toContain('mk:cat:buff:0');
    expect(ids).toContain('mk:hub');
  });

  it('renderBuyErrorScreen maps insufficient balance', async () => {
    const row = listing({ listingNo: 4, sellerId: 's1', price: 8000, itemName: 'Keskin Nişan' });
    const prisma = makePrismaMock(row);

    const { embed, components } = await renderBuyErrorScreen(
      { prisma, userId: 'buyer-1' },
      'Yetersiz bakiye.',
      4,
      'cat.buff.0',
    );

    expect(embed.data.description).toContain('8.000 coin');
    expect(components[0]!.components[0]!.data.custom_id).toBe('mk:cat:buff:0');
  });

  it('renderBuyErrorScreen maps missing listing to gone message', async () => {
    const prisma = makePrismaMock(null);

    const { embed } = await renderBuyErrorScreen(
      { prisma, userId: 'buyer-1' },
      'İlan bulunamadı.',
      99,
      '',
    );

    expect(embed.data.description).toBe('Bu ilan artık mevcut değil.');
  });
});
