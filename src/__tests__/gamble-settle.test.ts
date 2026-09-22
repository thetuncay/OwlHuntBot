import { describe, expect, it, vi, beforeEach } from 'vitest';
import { settleGambleRound, clearSettlementLock } from '../systems/gamble/settle';

function createRedisMock() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      const hasNX = (args as string[]).includes('NX');
      if (hasNX && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  };
}

describe('settleGambleRound idempotency', () => {
  const prisma = {} as import('@prisma/client').PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('duplicate settlement id returns zero delta', async () => {
    const redis = createRedisMock();

    const first = await settleGambleRound(prisma, redis as never, {
      playerId: 'p1',
      settlementId: 'dup-test',
      delta: 0,
    });
    expect(first.applied).toBe(true);
    expect(first.delta).toBe(0);

    const dup = await settleGambleRound(prisma, redis as never, {
      playerId: 'p1',
      settlementId: 'dup-test',
      delta: 999,
    });
    expect(dup.applied).toBe(false);
    expect(dup.delta).toBe(0);
  });

  it('zero-delta settlement returns current balance for UI', async () => {
    const redis = createRedisMock();
    const playerId = 'p1';
    const coins = 1_643_486;
    redis._store.set(
      `state:player:${playerId}`,
      JSON.stringify({ id: playerId, coins, level: 34 }),
    );

    const prismaWithOwl = {
      owl: { findFirst: vi.fn(async () => null) },
    } as unknown as import('@prisma/client').PrismaClient;

    const result = await settleGambleRound(prismaWithOwl, redis as never, {
      playerId,
      settlementId: 'lose-test',
      delta: 0,
    });

    expect(result.applied).toBe(true);
    expect(result.delta).toBe(0);
    expect(result.finalCoins).toBe(coins);
  });

  it('allows reuse after lock cleared', async () => {
    const redis = createRedisMock();
    await settleGambleRound(prisma, redis as never, {
      playerId: 'p1',
      settlementId: 'clear-test',
      delta: 0,
    });

    await clearSettlementLock(redis as never, 'clear-test');

    const again = await settleGambleRound(prisma, redis as never, {
      playerId: 'p1',
      settlementId: 'clear-test',
      delta: 0,
    });
    expect(again.applied).toBe(true);
  });
});
