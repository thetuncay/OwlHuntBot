import { describe, expect, it, vi } from 'vitest';

// countUnclaimedReadyQuests real modülü — refresh test'i için mock.
vi.mock('../systems/daily-quests', () => ({
  countUnclaimedReadyQuests: vi.fn(async () => 2),
}));

// runDetached'i inline sync executor'a çevir (test'te fire-and-forget beklemek istemiyoruz).
vi.mock('../utils/async', () => ({
  runDetached: (_label: string, fn: () => Promise<unknown>) => {
    void fn();
  },
}));

import {
  getCooldownHint,
  refreshCooldownHintCache,
  invalidateCooldownHint,
  scheduleCooldownHintRefresh,
} from '../utils/cooldown-hint';

/**
 * Minimal in-memory Redis mock — get/set/del/expire yeter.
 */
function makeRedis() {
  const store = new Map<string, { v: string; expAt?: number }>();
  const now = () => Date.now();

  const redis = {
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expAt && entry.expAt < now()) {
        store.delete(key);
        return null;
      }
      return entry.v;
    }),
    set: vi.fn(async (key: string, value: string, _mode?: string, ttl?: number) => {
      const expAt = ttl ? now() + ttl * 1000 : undefined;
      store.set(key, { v: value, expAt });
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
  };
  return { redis, store };
}

describe('getCooldownHint', () => {
  it('cache miss returns null (does not touch PG)', async () => {
    const { redis } = makeRedis();
    const hint = await getCooldownHint(redis as any, 'user-1', 'w');
    expect(hint).toBeNull();
  });

  it('cache hit with zero ready quests returns null', async () => {
    const { redis } = makeRedis();
    await redis.set('cd:hint:ready:user-2', '0');
    const hint = await getCooldownHint(redis as any, 'user-2', 'w');
    expect(hint).toBeNull();
  });

  it('cache hit with 1 ready quest returns singular hint', async () => {
    const { redis } = makeRedis();
    await redis.set('cd:hint:ready:user-3', '1');
    const hint = await getCooldownHint(redis as any, 'user-3', 'w');
    expect(hint).toContain('Hazır görevin var');
    expect(hint).toContain('`w q`');
  });

  it('cache hit with multi ready quests returns plural label', async () => {
    const { redis } = makeRedis();
    await redis.set('cd:hint:ready:user-4', '3');
    const hint = await getCooldownHint(redis as any, 'user-4', 'w');
    expect(hint).toContain('3 görev hazır');
  });

  it('gracefully handles corrupted cache value', async () => {
    const { redis } = makeRedis();
    await redis.set('cd:hint:ready:user-5', 'abc');
    const hint = await getCooldownHint(redis as any, 'user-5', 'w');
    expect(hint).toBeNull();
  });
});

describe('refreshCooldownHintCache', () => {
  it('writes count to redis with TTL', async () => {
    const { redis, store } = makeRedis();
    await refreshCooldownHintCache(redis as any, {} as any, 'user-6');
    const entry = store.get('cd:hint:ready:user-6');
    expect(entry?.v).toBe('2'); // mock returns 2
    expect(entry?.expAt).toBeGreaterThan(Date.now());
  });

  it('does not throw when PG call fails', async () => {
    const daily = await import('../systems/daily-quests');
    (daily.countUnclaimedReadyQuests as any).mockRejectedValueOnce(new Error('PG down'));
    const { redis } = makeRedis();
    await expect(refreshCooldownHintCache(redis as any, {} as any, 'user-7')).resolves.toBeUndefined();
  });
});

describe('invalidateCooldownHint', () => {
  it('removes existing cache entry', async () => {
    const { redis, store } = makeRedis();
    await redis.set('cd:hint:ready:user-8', '5');
    await invalidateCooldownHint(redis as any, 'user-8');
    expect(store.has('cd:hint:ready:user-8')).toBe(false);
  });
});

describe('scheduleCooldownHintRefresh', () => {
  it('fires without throwing (fire-and-forget)', () => {
    const { redis } = makeRedis();
    expect(() => scheduleCooldownHintRefresh(redis as any, {} as any, 'user-9')).not.toThrow();
  });
});
