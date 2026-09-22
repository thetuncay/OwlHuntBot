import { describe, it, expect, beforeEach } from 'vitest';
import {
  aggregateCommandRollup24h,
  hourBucketKey,
  normalizeCommandName,
  recordCommandAnalytics,
} from '../ops/command-analytics';

type HashStore = Map<string, Map<string, string>>;

function createMockRedis() {
  const strings = new Map<string, string>();
  const hashes: HashStore = new Map();
  const hll = new Map<string, Set<string>>();

  const hget = async (key: string, field: string) => hashes.get(key)?.get(field) ?? null;
  const hgetall = async (key: string) => {
    const h = hashes.get(key);
    if (!h) return {};
    return Object.fromEntries(h);
  };
  const hset = async (key: string, field: string, value: string) => {
    if (!hashes.has(key)) hashes.set(key, new Map());
    hashes.get(key)!.set(field, value);
    return 1;
  };
  const hincrby = async (key: string, field: string, by: number) => {
    if (!hashes.has(key)) hashes.set(key, new Map());
    const h = hashes.get(key)!;
    const cur = parseInt(h.get(field) ?? '0', 10);
    const next = cur + by;
    h.set(field, String(next));
    return next;
  };
  const incr = async (key: string) => {
    const cur = parseInt(strings.get(key) ?? '0', 10);
    const next = cur + 1;
    strings.set(key, String(next));
    return next;
  };
  const get = async (key: string) => strings.get(key) ?? null;
  const expire = async () => 1;
  const pfadd = async (key: string, ...members: string[]) => {
    if (!hll.has(key)) hll.set(key, new Set());
    for (const m of members) hll.get(key)!.add(m);
    return 1;
  };
  const pfcount = async (key: string) => hll.get(key)?.size ?? 0;
  const scan = async () => ['0', []] as [string, string[]];
  const keys = async (pattern: string) => {
    const all = [...strings.keys(), ...hashes.keys()];
    if (pattern === 'ops:*') return all.filter((k) => k.startsWith('ops:'));
    return [];
  };

  const multi = () => {
    const ops: Array<() => Promise<unknown>> = [];
    const chain = {
      hset: (key: string, field: string, value: string) => {
        ops.push(() => hset(key, field, value));
        return chain;
      },
      expire: (key: string) => {
        ops.push(() => expire(key));
        return chain;
      },
      pfadd: (key: string, member: string) => {
        ops.push(() => pfadd(key, member));
        return chain;
      },
      incr: (key: string) => {
        ops.push(() => incr(key));
        return chain;
      },
      hincrby: (key: string, field: string, by: number) => {
        ops.push(() => hincrby(key, field, by));
        return chain;
      },
      exec: async () => {
        for (const op of ops) await op();
        return [];
      },
    };
    return chain;
  };

  return { hget, hgetall, hset, multi, get, incr, pfcount, scan, keys };
}

describe('command-analytics', () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it('normalizes command names', () => {
    expect(normalizeCommandName('  owl:hunt  ')).toBe('owl:hunt');
    expect(normalizeCommandName('')).toBe('unknown');
  });

  it('records success and failure into hour bucket', async () => {
    process.env.OPS_ANALYTICS = '1';
    await recordCommandAnalytics(redis as any, {
      command: 'owl:hunt',
      source: 'slash',
      userId: 'user-1',
      guildId: 'guild-1',
      ok: true,
      durationMs: 100,
    });
    await recordCommandAnalytics(redis as any, {
      command: 'owl:hunt',
      source: 'slash',
      userId: 'user-1',
      guildId: 'guild-1',
      ok: false,
      durationMs: 200,
    });

    const key = hourBucketKey();
    const raw = await redis.hget(key, 'slash:owl:hunt');
    expect(raw).toBeTruthy();
    const stats = JSON.parse(raw!);
    expect(stats.n).toBe(2);
    expect(stats.ok).toBe(1);
    expect(stats.fail).toBe(1);

    const rollup = await aggregateCommandRollup24h(redis as any);
    expect(rollup.total).toBe(2);
    expect(rollup.failed).toBe(1);
    delete process.env.OPS_ANALYTICS;
  });

  it('skips when OPS_ANALYTICS disabled', async () => {
    process.env.OPS_ANALYTICS = '0';
    await recordCommandAnalytics(redis as any, {
      command: 'test',
      source: 'prefix',
      userId: 'u',
      ok: true,
      durationMs: 1,
    });
    const keys = await redis.keys('ops:*');
    expect(keys.length).toBe(0);
    delete process.env.OPS_ANALYTICS;
  });
});
