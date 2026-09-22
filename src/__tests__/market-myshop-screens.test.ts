import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MarketListing } from '@prisma/client';
import {
  renderMyShopItemScreen,
  renderMyShopScreen,
} from '../utils/market-screens';
import {
  buildEditListingModal,
  parseEditListingModalListingNo,
} from '../utils/market-modals';

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
    sellerNote: 'İlk ilanım',
    createdAt: new Date('2026-06-01T12:00:00Z'),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    ...partial,
  } as MarketListing;
}

function makePrismaMock(rows: MarketListing[]) {
  return {
    marketListing: {
      findMany: vi.fn().mockResolvedValue(rows),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { listingNo: number } }) =>
        Promise.resolve(rows.find((r) => r.listingNo === where.listingNo) ?? null),
      ),
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

describe('myshop screens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderMyShopScreen shows empty state without select menu', async () => {
    const prisma = makePrismaMock([]);
    const { embed, components } = await renderMyShopScreen({ prisma, userId: 'seller-1' });

    expect(embed.data.title).toBe('🏪 Dükkanın');
    expect(embed.data.description).toBe('Henüz satışa çıkardığın bir şey yok.');
    expect(components).toHaveLength(1);
    expect(components[0]!.components).toHaveLength(2);
  });

  it('renderMyShopScreen lists active listings with select menu', async () => {
    const rows = [
      listing({ listingNo: 1, sellerId: 'seller-1', price: 3000, itemName: 'Savunma' }),
      listing({ listingNo: 2, sellerId: 'seller-1', price: 5000, itemName: 'Berrak Zihin' }),
    ];
    const prisma = makePrismaMock(rows);

    const { embed, components } = await renderMyShopScreen({ prisma, userId: 'seller-1' });

    expect(embed.data.description).toContain('2/5 ilan dolu');
    expect(embed.data.description).toContain('Savunma');
    expect(components).toHaveLength(2);
    expect(components[0]!.components[0]!.data.custom_id).toBe('mk:myshop:select');
  });

  it('renderMyShopScreen shows flash footer after cancel', async () => {
    const prisma = makePrismaMock([]);
    const { embed } = await renderMyShopScreen(
      { prisma, userId: 'seller-1' },
      'İlan kaldırıldı, eşyan iade edildi.',
    );
    expect(embed.data.footer?.text).toBe('İlan kaldırıldı, eşyan iade edildi.');
  });

  it('renderMyShopItemScreen shows management buttons for own listing', async () => {
    const row = listing({ listingNo: 5, sellerId: 'seller-1', price: 7000, itemName: 'Keskin Nişan' });
    const prisma = makePrismaMock([row]);

    const { embed, components } = await renderMyShopItemScreen(
      { prisma, userId: 'seller-1' },
      5,
    );

    expect(embed.data.description).toContain('Bu ilan senin.');
    const labels = components[0]!.components.map((c) => c.data.label);
    expect(labels).toEqual(['Kaldır', 'Düzenle', 'Geri']);
  });

  it('buildEditListingModal includes price quantity and note for items', () => {
    const row = listing({ listingNo: 5, sellerId: 'seller-1', price: 7000, itemName: 'Keskin Nişan' });
    const modal = buildEditListingModal(row);
    expect(modal.data.custom_id).toBe('mk:modal:editlisting:5');
    expect(modal.components).toHaveLength(3);
    expect(parseEditListingModalListingNo('mk:modal:editlisting:5')).toBe(5);
  });

  it('buildEditListingModal omits quantity for owl listings', () => {
    const row = listing({
      listingNo: 8,
      sellerId: 'seller-1',
      price: 50_000,
      itemName: 'owl-1',
      marketCategory: 'owl',
      itemId: 'owl-uuid',
      itemType: 'owl',
    });
    const modal = buildEditListingModal(row);
    expect(modal.components).toHaveLength(2);
  });
});
