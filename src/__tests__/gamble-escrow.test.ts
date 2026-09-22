import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  finalizeDuelBetEscrow,
  getActiveGambleDuelSession,
  setGambleDuelGuard,
} from '../systems/gamble/escrow';

function mockRedis(initial: Record<string, string> = {}): Redis {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const key of keys) {
        if (store.delete(key)) n += 1;
      }
      return n;
    }),
    _store: store,
  } as unknown as Redis & { _store: Map<string, string> };
}

describe('gamble escrow guards', () => {
  it('finalizeDuelBetEscrow clears guards and meta after successful duel', async () => {
    const sessionId = 'session-1';
    const challengerId = 'user-a';
    const defenderId = 'user-b';
    const redis = mockRedis({
      [`gamble:duel:${challengerId}`]: sessionId,
      [`gamble:duel:${defenderId}`]: sessionId,
      [`gamble:duelbet:${sessionId}`]: JSON.stringify({
        sessionId,
        settlementId: 'settle-1',
        bet: 1000,
        challengerId,
        defenderId,
        escrowedAt: Date.now(),
      }),
    });

    await finalizeDuelBetEscrow(redis, sessionId);

    expect(redis._store.has(`gamble:duel:${challengerId}`)).toBe(false);
    expect(redis._store.has(`gamble:duel:${defenderId}`)).toBe(false);
    expect(redis._store.has(`gamble:duelbet:${sessionId}`)).toBe(false);
  });

  it('getActiveGambleDuelSession self-heals finished pvp sessions', async () => {
    const sessionId = 'session-finished';
    const challengerId = 'user-a';
    const defenderId = 'user-b';
    const redis = mockRedis({
      [`gamble:duel:${challengerId}`]: sessionId,
      [`gamble:duel:${defenderId}`]: sessionId,
      [`gamble:duelbet:${sessionId}`]: JSON.stringify({
        sessionId,
        settlementId: 'settle-1',
        bet: 500,
        challengerId,
        defenderId,
        escrowedAt: Date.now(),
      }),
    });

    const prisma = {
      pvpSession: {
        findUnique: vi.fn(async () => ({ status: 'finished' })),
      },
    } as unknown as PrismaClient;

    const active = await getActiveGambleDuelSession(redis, challengerId, prisma);
    expect(active).toBeNull();
    expect(redis._store.has(`gamble:duel:${challengerId}`)).toBe(false);
    expect(redis._store.has(`gamble:duelbet:${sessionId}`)).toBe(false);
  });

  it('setGambleDuelGuard blocks duplicate active sessions', async () => {
    const redis = mockRedis();
    const ok1 = await setGambleDuelGuard(redis, 'user-a', 's1', 60);
    const ok2 = await setGambleDuelGuard(redis, 'user-a', 's2', 60);
    expect(ok1).toBe(true);
    expect(ok2).toBe(false);
  });
});
