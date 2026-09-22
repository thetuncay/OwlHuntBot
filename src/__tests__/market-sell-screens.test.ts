import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderSellTypeScreen, renderSellSelectScreen } from '../utils/market-screens';

function makePrismaMock() {
  return {
    inventoryItem: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'inv-1',
          ownerId: 'u1',
          itemName: 'Savunma',
          itemType: 'Buff',
          rarity: 'Common',
          quantity: 3,
        },
      ]),
      findFirst: vi.fn(),
    },
    owl: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    marketListing: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

describe('sell screens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderSellTypeScreen shows item and owl buttons', async () => {
    const { embed, components } = await renderSellTypeScreen({
      prisma: makePrismaMock(),
      userId: 'u1',
    });
    expect(embed.data.title).toBe('Ne satmak istiyorsun?');
    expect(components[0]!.components).toHaveLength(3);
  });

  it('renderSellSelectScreen lists inventory items', async () => {
    const prisma = makePrismaMock();
    const { embed, components } = await renderSellSelectScreen(
      { prisma, userId: 'u1' },
      'item',
      0,
    );
    expect(embed.data.title).toBe('Eşyanı seç');
    expect(components[0]!.components[0]!.data.custom_id).toBe('mk:sell:select:item:0:select');
  });
});
