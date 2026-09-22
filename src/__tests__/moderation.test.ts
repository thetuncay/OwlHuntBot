import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  issuePlayerWarning,
  recordSpamViolation,
  formatDurationTr,
} from '../systems/moderation';
import {
  MOD_BAN_DURATIONS_SECONDS,
  MOD_SPAM_STRIKES_FOR_WARN,
  MOD_WARN_THRESHOLD,
  SPAM_MUTE_SECONDS,
} from '../config';

function createMockRedis(initial: Record<string, string> = {}) {
  const store = new Map<string, { value: string; ttl?: number }>(
    Object.entries(initial).map(([k, v]) => [k, { value: v }]),
  );
  const lists = new Map<string, string[]>();

  return {
    store,
    async get(key: string) {
      return store.get(key)?.value ?? null;
    },
    async set(key: string, value: string, mode?: string, ttl?: number) {
      if (mode === 'EX' && typeof ttl === 'number') {
        store.set(key, { value, ttl });
      } else {
        store.set(key, { value });
      }
      return 'OK';
    },
    async incr(key: string) {
      const cur = Number.parseInt(store.get(key)?.value ?? '0', 10) || 0;
      const next = cur + 1;
      store.set(key, { value: String(next) });
      return next;
    },
    async del(key: string) {
      store.delete(key);
      lists.delete(key);
      return 1;
    },
    async expire(_key: string, _sec: number) {
      return 1;
    },
    async lpush(key: string, value: string) {
      const arr = lists.get(key) ?? [];
      arr.unshift(value);
      lists.set(key, arr);
      return arr.length;
    },
    async ltrim(key: string, start: number, end: number) {
      const arr = lists.get(key) ?? [];
      lists.set(key, arr.slice(start, end + 1));
      return 'OK';
    },
    async lrange(key: string, start: number, end: number) {
      const arr = lists.get(key) ?? [];
      return arr.slice(start, end + 1);
    },
    async ttl(key: string) {
      const entry = store.get(key);
      if (!entry) return -2;
      return entry.ttl ?? -1;
    },
  };
}

describe('moderation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('formats Turkish durations', () => {
    expect(formatDurationTr(45)).toBe('45 saniye');
    expect(formatDurationTr(3600)).toBe('1 saat');
    expect(formatDurationTr(5400)).toBe('1 saat 30 dk');
  });

  it('warns until threshold then applies first tier ban', async () => {
    const redis = createMockRedis();
    const userId = 'user-1';

    for (let i = 1; i < MOD_WARN_THRESHOLD; i++) {
      const r = await issuePlayerWarning(redis as any, {
        userId,
        reason: `warn ${i}`,
        source: 'admin',
      });
      expect(r.type).toBe('warned');
    }

    const ban = await issuePlayerWarning(redis as any, {
      userId,
      reason: 'final warn',
      source: 'admin',
    });

    expect(ban.type).toBe('banned');
    if (ban.type === 'banned') {
      expect(ban.durationSec).toBe(MOD_BAN_DURATIONS_SECONDS[0]);
    }

    const banReason = await redis.get(`ban:${userId}`);
    expect(banReason).toContain('final warn');

    const warnCount = await redis.get(`mod:warn:count:${userId}`);
    expect(warnCount).toBe('0');
  });

  it('escalates ban duration on second auto-ban cycle', async () => {
    const redis = createMockRedis();
    const userId = 'user-2';

    for (let cycle = 0; cycle < MOD_WARN_THRESHOLD; cycle++) {
      await issuePlayerWarning(redis as any, {
        userId,
        reason: `w${cycle}`,
        source: 'admin',
      });
    }
    const firstBan = await redis.store.get(`ban:${userId}`);
    expect(firstBan?.ttl).toBe(MOD_BAN_DURATIONS_SECONDS[0]);

    await redis.del(`ban:${userId}`);

    for (let cycle = 0; cycle < MOD_WARN_THRESHOLD; cycle++) {
      await issuePlayerWarning(redis as any, {
        userId,
        reason: `w2-${cycle}`,
        source: 'admin',
      });
    }

    const secondBan = await redis.store.get(`ban:${userId}`);
    expect(secondBan?.ttl).toBe(MOD_BAN_DURATIONS_SECONDS[1]);
  });

  it('warns only after MOD_SPAM_STRIKES_FOR_WARN spam violations', async () => {
    const redis = createMockRedis();
    const userId = 'spammer';

    for (let i = 1; i < MOD_SPAM_STRIKES_FOR_WARN; i++) {
      const r = await recordSpamViolation(redis as any, userId);
      expect(r.moderation).toBeNull();
      expect(r.muteSeconds).toBeGreaterThanOrEqual(SPAM_MUTE_SECONDS);
    }

    const warned = await recordSpamViolation(redis as any, userId);
    expect(warned.moderation?.type).toBe('warned');
  });
});
