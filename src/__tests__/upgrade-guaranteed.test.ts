import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  upgradeCoinCost,
  upgradeMaterialRequirement,
  upgradeCoinCostAfterDiscount,
} from '../utils/math';
import {
  attemptUpgrade,
  computeUpgradeCoinDiscount,
  getUpgradePreview,
} from '../systems/upgrade';
import { buildUpgradePanel } from '../utils/upgrade-ux';
import type { BuffEffects } from '../types';

vi.mock('../utils/lock', () => ({
  withLock: (_id: string, _action: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../systems/items', () => ({
  getBuffEffects: vi.fn(),
  drainBuffCharge: vi.fn(),
}));

vi.mock('../state/player-state', () => ({
  hydratePlayerState: vi.fn(),
  deductCoinsInRedis: vi.fn(),
  applyOwlStatUpdate: vi.fn(),
}));

vi.mock('../systems/owl-moon-evolution', () => ({
  checkAndApplyMoonEvolution: vi.fn().mockResolvedValue(null),
}));

vi.mock('../systems/quest-tracker', () => ({
  fireQuest: vi.fn().mockResolvedValue(undefined),
}));

import { getBuffEffects, drainBuffCharge } from '../systems/items';

const baseOwl = {
  id: 'owl-1',
  ownerId: 'player-1',
  statGagaBase: 23,
  statGozBase: 15,
  statKulakBase: 15,
  statKanatBase: 15,
  statPenceBase: 12,
  statGagaTrained: 0,
  statGozTrained: 0,
  statKulakTrained: 0,
  statKanatTrained: 0,
  statPenceTrained: 0,
  statGaga: 23,
  statGoz: 15,
  statKulak: 15,
  statKanat: 15,
  statPence: 12,
};

function makeOwl(overrides: Record<string, unknown> = {}) {
  return { ...baseOwl, ...overrides };
}

function emptyBuff(): BuffEffects {
  return {
    catchBonus: 0,
    lootMult: 1,
    rareDropBonus: 0,
    upgradeBonus: 0,
    upgradeCoinDiscount: 0,
    downgradeShield: 1,
    pvpDamageMult: 1,
    pvpDodgeBonus: 0,
  };
}

describe('Garanti Upgrade V2 — maliyet formülleri', () => {
  it('hafif+ coin/materyal snapshot (trained 0,10,20,30,50)', () => {
    expect({
      t0:  { coin: upgradeCoinCost(0),  mat: upgradeMaterialRequirement(0) },
      t10: { coin: upgradeCoinCost(10), mat: upgradeMaterialRequirement(10) },
      t20: { coin: upgradeCoinCost(20), mat: upgradeMaterialRequirement(20) },
      t30: { coin: upgradeCoinCost(30), mat: upgradeMaterialRequirement(30) },
      t50: { coin: upgradeCoinCost(50), mat: upgradeMaterialRequirement(50) },
    }).toEqual({
      t0:  { coin: 90,   mat: 3 },
      t10: { coin: 403,  mat: 4 },
      t20: { coin: 888,  mat: 5 },
      t30: { coin: 1471, mat: 6 },
      t50: { coin: 2842, mat: 8 },
    });
  });

  it('buff %10 indirim → 90 coin → 81', () => {
    expect(upgradeCoinCostAfterDiscount(0, 0.10)).toBe(81);
  });
});

describe('Garanti Upgrade V2 — computeUpgradeCoinDiscount', () => {
  it('buff indirimi cap %25', () => {
    const buff: BuffEffects = { ...emptyBuff(), upgradeCoinDiscount: 0.30 };
    expect(computeUpgradeCoinDiscount(buff, 0)).toBe(0.25);
  });
});

describe('Garanti Upgrade V2 — panel UX', () => {
  it('panel maliyet + garanti satırı', () => {
    const embed = buildUpgradePanel({
      owlName: 'Test Owl',
      owlQuality: 'Rare',
      stat: 'gaga',
      statTrained: 0,
      statEffective: 23,
      coinCost: 65,
      coinDiscountPct: 0,
      materialCost: 3,
      materialName: 'Kemik Tozu',
      allStatsEffective: { gaga: 23, pence: 12, goz: 15, kulak: 15, kanat: 15 },
    });
    const desc = embed.data.description ?? '';
    expect(desc).toContain('Coin: 65');
    expect(desc).toContain('Kemik Tozu ×3');
    expect(desc).toContain('Garanti');
    expect(desc).not.toContain('Başarı:');
  });

  it('blocked panel shows reason and suggestion only', () => {
    const embed = buildUpgradePanel({
      owlName: 'Tuncay',
      owlQuality: 'Common',
      stat: 'goz',
      statTrained: 7,
      statEffective: 20,
      coinCost: 217,
      coinDiscountPct: 0,
      materialCost: 3,
      materialName: 'Av Gözü Kristali',
      allStatsEffective: { gaga: 20, pence: 15, goz: 20, kulak: 33, kanat: 26 },
      depCheck: {
        ok: false,
        reason: 'spread',
        dependsOn: 'pence',
        required: 3,
        current: 0,
        gap: 3,
        suggestion: 'pence',
      },
    }, 'w');
    const desc = embed.data.description ?? '';
    expect(desc).toContain('yükseltilemez');
    expect(desc).toContain('Pençe');
    expect(desc).toContain('w upgrade pence');
    expect(desc).not.toContain('217 coin');
    expect(desc).not.toContain('Garanti');
  });

});

describe('Garanti Upgrade V2 — attemptUpgrade', () => {
  beforeEach(() => {
    vi.mocked(getBuffEffects).mockResolvedValue(emptyBuff());
    vi.mocked(drainBuffCharge).mockResolvedValue(undefined);
  });

  it('garanti +1 trained başarı', async () => {
    let owlState = makeOwl();
    let coins = 1000;
    let kemikQty = 10;

    const prisma = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({
        player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1', coins }) },
        owl: { findUnique: vi.fn().mockImplementation(() => Promise.resolve({ ...owlState })) },
        inventoryItem: {
          findUnique: vi.fn().mockImplementation(({ where }: { where: { ownerId_itemName: { itemName: string } } }) => {
            if (where.ownerId_itemName.itemName === 'Kemik Tozu') {
              return Promise.resolve({ quantity: kemikQty });
            }
            return Promise.resolve(null);
          }),
          updateMany: vi.fn().mockImplementation(() => {
            kemikQty -= 3;
            return Promise.resolve({ count: 1 });
          }),
        },
        player_update: vi.fn(),
        owl_update: vi.fn().mockImplementation(({ data }: { data: Record<string, number> }) => {
          owlState = { ...owlState, ...data };
          return Promise.resolve(owlState);
        }),
      }),
      player: { findUnique: vi.fn() },
      owl: { findUnique: vi.fn() },
      inventoryItem: { findUnique: vi.fn() },
    };

    // Patch tx methods used in upgrade.ts
    const tx = {
      player: {
        findUnique: vi.fn().mockResolvedValue({ id: 'player-1', coins }),
        update: vi.fn().mockImplementation(() => {
          coins -= 65;
          return Promise.resolve({});
        }),
      },
      owl: {
        findUnique: vi.fn().mockImplementation(() => Promise.resolve({ ...owlState })),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, number> }) => {
          owlState = { ...owlState, ...data };
          return Promise.resolve(owlState);
        }),
      },
      inventoryItem: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { ownerId_itemName: { itemName: string } } }) => {
          if (where.ownerId_itemName.itemName === 'Kemik Tozu') {
            return Promise.resolve({ quantity: kemikQty });
          }
          return Promise.resolve(null);
        }),
        update: vi.fn().mockImplementation(({ data }: { data: { quantity: number } }) => {
          kemikQty = data.quantity;
          return Promise.resolve({ quantity: kemikQty });
        }),
        delete: vi.fn().mockImplementation(() => {
          kemikQty = 0;
          return Promise.resolve({});
        }),
        updateMany: vi.fn(),
      },
    };

    prisma.$transaction = (fn: (t: typeof tx) => Promise<unknown>) => fn(tx);

    const result = await attemptUpgrade(prisma as never, 'player-1', 'owl-1', 'gaga', []);
    expect(result.success).toBe(true);
    expect(result.oldValue).toBe(0);
    expect(result.newValue).toBe(1);
    expect(owlState.statGagaTrained).toBe(1);
    expect(owlState.statGaga).toBe(24);
    expect(kemikQty).toBe(7);
  });

  it('yüksek eğitim seviyesinde de upgrade yapılabilir', async () => {
    const owlHighTrained = makeOwl({
      statGagaTrained: 50,
      statGaga: 73,
      statPenceTrained: 50,
      statPence: 62,
      statGozTrained: 50,
      statGoz: 65,
      statKulakTrained: 50,
      statKulak: 65,
      statKanatTrained: 50,
      statKanat: 65,
    });
    let kemikQty = 10;
    let coins = 99999;

    const tx = {
      player: {
        findUnique: vi.fn().mockResolvedValue({ id: 'player-1', coins }),
        update: vi.fn().mockImplementation(() => {
          coins -= upgradeCoinCost(50);
          return Promise.resolve({});
        }),
      },
      owl: {
        findUnique: vi.fn().mockImplementation(() => Promise.resolve({ ...owlHighTrained })),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, number> }) => {
          Object.assign(owlHighTrained, data);
          return Promise.resolve(owlHighTrained);
        }),
      },
      inventoryItem: {
        findUnique: vi.fn().mockResolvedValue({ quantity: kemikQty }),
        update: vi.fn().mockImplementation(() => {
          kemikQty -= 8;
          return Promise.resolve({});
        }),
        delete: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    const prisma = {
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      owl: { findUnique: vi.fn().mockResolvedValue(owlHighTrained) },
    };

    const result = await attemptUpgrade(prisma as never, 'player-1', 'owl-1', 'gaga', []);
    expect(result.success).toBe(true);
    expect(result.oldValue).toBe(50);
    expect(result.newValue).toBe(51);
    expect(owlHighTrained.statGagaTrained).toBe(51);
  });

  it('bağımlılık engeli — malzeme harcanmaz', async () => {
    const owl = makeOwl({
      statGagaBase: 9,
      statGaga: 9,
      statPenceBase: 4,
      statPence: 4,
    });
    let kemikQty = 10;

    const tx = {
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1', coins: 99999 }) },
      owl: { findUnique: vi.fn().mockResolvedValue(owl) },
      inventoryItem: {
        findUnique: vi.fn().mockResolvedValue({ quantity: kemikQty }),
        updateMany: vi.fn(),
      },
    };

    const prisma = {
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };

    await expect(
      attemptUpgrade(prisma as never, 'player-1', 'owl-1', 'gaga', []),
    ).rejects.toThrow(/^DEP_FAIL:/);
    expect(kemikQty).toBe(10);
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });
});

describe('Garanti Upgrade V2 — getUpgradePreview indirim', () => {
  beforeEach(() => {
    vi.mocked(getBuffEffects).mockResolvedValue({
      ...emptyBuff(),
      upgradeCoinDiscount: 0.10,
    });
  });

  it('preview indirimli coin gösterir', async () => {
    const prisma = {
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1', level: 10, coins: 500 }) },
      owl: { findUnique: vi.fn().mockResolvedValue(makeOwl()) },
      inventoryItem: {
        findUnique: vi.fn().mockResolvedValue({ quantity: 5 }),
      },
    };

    const preview = await getUpgradePreview(prisma as never, 'player-1', 'owl-1', 'gaga', []);
    expect(preview.coinCostBase).toBe(90);
    expect(preview.coinCost).toBe(81);
    expect(preview.coinDiscountPct).toBe(10);
    expect(preview.materialCost).toBe(3);
    expect(preview.materialName).toBe('Kemik Tozu');
  });
});
