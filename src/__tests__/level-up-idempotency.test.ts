import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  computeXpDelta,
  hydratePlayerState,
  refreshPlayerXpInRedis,
  refreshPlayerCoinsInRedis,
  reloadInventoryFromPg,
  applyHuntDelta,
} from '../state/player-state';
import { xpRequired } from '../utils/math';

function makeRedis(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, val: string) => {
      store.set(key, val);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) {
        if (store.delete(k)) n++;
      }
      return n;
    }),
    expire: vi.fn(async () => 1),
    pipeline: vi.fn(() => {
      const ops: Array<() => Promise<void>> = [];
      const chain = {
        set: (...args: unknown[]) => {
          ops.push(async () => {
            store.set(String(args[0]), String(args[1]));
          });
          return chain;
        },
        sadd: () => chain,
        expire: () => chain,
        hset: () => chain,
        exec: async () => {
          for (const op of ops) await op();
          return ops.map(() => [null, 1] as [null, number]);
        },
      };
      return chain;
    }),
    multi: vi.fn(() => {
      const ops: Array<() => Promise<void>> = [];
      const chain = {
        set: (...args: unknown[]) => {
          ops.push(async () => {
            store.set(String(args[0]), String(args[1]));
          });
          return chain;
        },
        sadd: () => chain,
        exec: async () => {
          for (const op of ops) await op();
          return ops.map(() => [null, 1] as [null, number]);
        },
      };
      return chain;
    }),
    hmget: vi.fn(async () => []),
    hget: vi.fn(async () => null),
    hgetall: vi.fn(async () => ({})),
    hset: vi.fn(async (key: string, field: string, val: string) => {
      const invKey = [...store.keys()].find((k) => k.includes(':inv:'));
      if (invKey && key === invKey) {
        store.set(`${key}:${field}`, val);
      }
      return 1;
    }),
    hdel: vi.fn(async (key: string, field: string) => {
      store.delete(`${key}:${field}`);
      return 1;
    }),
    _store: store,
  } as unknown as import('ioredis').Redis & { _store: Map<string, string> };
}

const prisma = {
  player: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  owl: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  inventoryItem: {
    findMany: vi.fn(async () => []),
  },
} as unknown as import('@prisma/client').PrismaClient;

describe('level-up idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computeXpDelta does not level up twice when player already at target level', () => {
    const req19 = xpRequired(19);
    const first = computeXpDelta({ level: 19, xp: req19 - 50 }, 100);
    expect(first.levelUp?.newLevel).toBe(20);

    const second = computeXpDelta(
      { level: 20, xp: first.levelUp!.remainingXP },
      100,
    );
    expect(second.levelUp).toBeUndefined();
    expect(second.currentLevel).toBe(20);
  });

  it('hydratePlayerState prefers Redis over stale PG level', async () => {
    const playerId = 'user-1';
    const redis = makeRedis({
      'state:player:user-1': JSON.stringify({
        id: playerId,
        level: 20,
        xp: 35,
        coins: 1000,
        huntComboStreak: 1,
        noRareStreak: 0,
        mainOwlId: null,
        dailyLootboxDrops: 0,
        lastLootboxDropDate: null,
      }),
    });

    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      id: playerId,
      level: 19,
      xp: 9999,
      coins: 1000,
      huntComboStreak: 1,
      noRareStreak: 0,
      mainOwlId: null,
      dailyLootboxDrops: 0,
      lastLootboxDropDate: null,
      prestigeLevel: 0,
      gambleStreakWins: 0,
      gambleStreakLosses: 0,
    } as never);
    vi.mocked(prisma.owl.findFirst).mockResolvedValue(null);

    const bundle = await hydratePlayerState(redis, prisma, playerId, { includeInventory: false });
    expect(bundle?.player.level).toBe(20);
    expect(prisma.player.findUnique).not.toHaveBeenCalled();
  });

  it('refreshPlayerXpInRedis does not downgrade Redis when PG is stale', async () => {
    const playerId = 'user-2';
    const redis = makeRedis({
      'state:player:user-2': JSON.stringify({
        id: playerId,
        level: 20,
        xp: 55,
        coins: 500,
        huntComboStreak: 0,
        noRareStreak: 0,
        mainOwlId: null,
        dailyLootboxDrops: 0,
        lastLootboxDropDate: null,
      }),
    });

    vi.mocked(prisma.player.findUnique).mockResolvedValue({ level: 19, xp: 9990 } as never);

    await refreshPlayerXpInRedis(redis, prisma, playerId);

    const raw = redis._store.get('state:player:user-2');
    const player = JSON.parse(raw!);
    expect(player.level).toBe(20);
    expect(player.xp).toBe(55);
  });

  it('applyHuntDelta persists level-up to Redis for next hunt', async () => {
    const playerId = 'user-3';
    const req19 = xpRequired(19);
    const player = {
      id: playerId,
      level: 19,
      xp: req19 - 10,
      coins: 100,
      huntComboStreak: 0,
      noRareStreak: 0,
      mainOwlId: 'owl-1',
      dailyLootboxDrops: 0,
      lastLootboxDropDate: null,
    };
    const redis = makeRedis({
      'state:player:user-3': JSON.stringify(player),
      'state:hydrated:user-3': '1',
    });

    const xpResult = computeXpDelta(player, 200);
    expect(xpResult.levelUp?.newLevel).toBe(20);

    await applyHuntDelta(
      redis,
      prisma,
      playerId,
      {
        gainedXP: xpResult.gainedXP,
        newLevel: xpResult.levelUp!.newLevel,
        newXp: xpResult.levelUp!.remainingXP,
        totalXPGain: xpResult.gainedXP,
        huntComboStreak: 1,
        noRareStreak: 0,
        bondGain: 0,
        owlId: 'owl-1',
        inventoryItems: [],
      },
      null,
      player,
    );

    expect(redis._store.get('state:hydrated:user-3')).toBe('1');
    const stored = JSON.parse(redis._store.get('state:player:user-3')!);
    expect(stored.level).toBe(20);

    const bundle = await hydratePlayerState(redis, prisma, playerId, { includeInventory: false });
    expect(bundle?.player.level).toBe(20);
    expect(computeXpDelta(bundle!.player, 100).levelUp).toBeUndefined();
  });

  it('refreshPlayerCoinsInRedis does not downgrade Redis when PG is stale', async () => {
    const playerId = 'user-4';
    const redis = makeRedis({
      'state:player:user-4': JSON.stringify({
        id: playerId,
        level: 20,
        xp: 35,
        coins: 50000,
        huntComboStreak: 0,
        noRareStreak: 0,
        mainOwlId: null,
        dailyLootboxDrops: 0,
        lastLootboxDropDate: null,
      }),
    });

    vi.mocked(prisma.player.findUnique).mockResolvedValue({ coins: 1000 } as never);

    await refreshPlayerCoinsInRedis(redis, prisma, playerId);

    const player = JSON.parse(redis._store.get('state:player:user-4')!);
    expect(player.coins).toBe(50000);
  });

  it('mirrorInventoryFromPg removes Redis-only rows not in PG', async () => {
    const playerId = 'user-mirror';
    const invKey = `state:inv:${playerId}`;
    const redis = makeRedis({
      [`state:player:${playerId}`]: JSON.stringify({
        id: playerId,
        level: 5,
        xp: 0,
        coins: 1000,
        huntComboStreak: 0,
        noRareStreak: 0,
        mainOwlId: null,
        dailyLootboxDrops: 0,
        lastLootboxDropDate: null,
      }),
      [`${invKey}:Tavşan`]: JSON.stringify({ itemType: 'Av', rarity: 'Common', quantity: 5 }),
      [`${invKey}:Eşya Kutusu`]: JSON.stringify({ itemType: 'Lootbox', rarity: 'Rare', quantity: 1 }),
    });

    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      { itemName: 'Eşya Kutusu', itemType: 'Lootbox', rarity: 'Rare', quantity: 1 },
    ] as never);

    const hdelOps: string[] = [];
    redis.hkeys = vi.fn(async () => ['Tavşan', 'Eşya Kutusu']);
    redis.pipeline = vi.fn(() => {
      const chain = {
        hdel: (_key: string, field: string) => {
          hdelOps.push(field);
          return chain;
        },
        hset: () => chain,
        expire: () => chain,
        exec: async () => [[null, 1]],
      };
      return chain;
    }) as typeof redis.pipeline;

    const { mirrorInventoryFromPg } = await import('../state/player-state.js');
    await mirrorInventoryFromPg(redis, prisma, playerId);

    expect(hdelOps).toContain('Tavşan');
  });

  it('reloadInventoryFromPg keeps Redis-only pending items', async () => {
    const playerId = 'user-5';
    const invKey = `state:inv:${playerId}`;
    const redis = makeRedis({
      [`state:player:${playerId}`]: JSON.stringify({
        id: playerId,
        level: 20,
        xp: 35,
        coins: 1000,
        huntComboStreak: 0,
        noRareStreak: 0,
        mainOwlId: null,
        dailyLootboxDrops: 0,
        lastLootboxDropDate: null,
      }),
      [`${invKey}:Yıldız Tüy`]: JSON.stringify({
        itemType: 'Material',
        rarity: 'Legendary',
        quantity: 1,
      }),
    });

    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      {
        itemName: 'Eşya Kutusu',
        itemType: 'Lootbox',
        rarity: 'Rare',
        quantity: 2,
      },
    ] as never);

    const pipelineOps: Array<{ type: string; args: unknown[] }> = [];
    redis.pipeline = vi.fn(() => {
      const chain = {
        hset: (...args: unknown[]) => {
          pipelineOps.push({ type: 'hset', args });
          return chain;
        },
        expire: () => chain,
        exec: async () => [[null, 1]],
      };
      return chain;
    }) as typeof redis.pipeline;

    await reloadInventoryFromPg(redis, prisma, playerId);

    expect(pipelineOps.some((op) => op.type === 'hset')).toBe(true);
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis._store.get(`${invKey}:Yıldız Tüy`)).toBeDefined();
  });
});
