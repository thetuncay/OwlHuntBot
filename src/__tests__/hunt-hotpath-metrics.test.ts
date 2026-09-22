import { describe, expect, it, vi, beforeEach } from 'vitest';

function mockRedis(overrides: {
  get?: (key: string) => Promise<string | null>;
  llen?: (key: string) => Promise<number>;
  lrange?: (key: string, start: number, end: number) => Promise<string[]>;
  rpush?: (key: string, value: string) => Promise<number>;
  set?: (...args: unknown[]) => Promise<string>;
  del?: (key: string) => Promise<number>;
  expire?: (...args: unknown[]) => Promise<number>;
} = {}) {
  return {
    get: vi.fn(overrides.get ?? (async () => null)),
    llen: vi.fn(overrides.llen ?? (async () => 0)),
    lrange: vi.fn(overrides.lrange ?? (async () => [])),
    rpush: vi.fn(overrides.rpush ?? (async () => 1)),
    set: vi.fn(overrides.set ?? (async () => 'OK')),
    del: vi.fn(overrides.del ?? (async () => 1)),
    expire: vi.fn(overrides.expire ?? (async () => 1)),
  };
}

describe('hunt-hotpath-metrics', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.HUNT_HOTPATH_METRICS = '1';
  });

  it('forceFlush aggregates pending samples from redis', async () => {
    const sample = {
      redisReads: 2,
      redisWrites: 0,
      pgReads: 0,
      pgWrites: 0,
      cacheHits: 1,
      cacheMisses: 0,
      hydrationCount: 0,
      persistenceCount: 0,
      executionDurationMs: 42,
      rewardCalcDurationMs: 1,
    };
    const redis = mockRedis({
      lrange: async () => [JSON.stringify(sample)],
      get: async (key) => (key === 'ops:hunt:hotpath:v1' ? null : null),
    });

    const mod = await import('../utils/hunt-hotpath-metrics.js');
    const flushed = await mod.forceFlushHuntHotPathMetrics(redis as never);
    expect(flushed).not.toBeNull();
    expect(flushed!.sampleCount).toBe(1);
    expect(redis.set).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('ops:hunt:hotpath:pending:v1');
  });

  it('reads snapshot from redis when provided', async () => {
    const stored = {
      collectedAtMs: Date.now(),
      sampleCount: 3,
      executionDurationMs: { avg: 1, p50: 1, p95: 1, p99: 1, max: 1 },
      rewardCalcDurationMs: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      redisReads: { avg: 1, p50: 1, p95: 1, p99: 1, max: 1 },
      redisWrites: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      pgReads: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      pgWrites: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      cacheHits: { avg: 1, p50: 1, p95: 1, p99: 1, max: 1 },
      cacheMisses: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      hydrationCount: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      persistenceCount: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
    };

    const redis = mockRedis({
      get: async (key) =>
        key === 'ops:hunt:hotpath:v1' ? JSON.stringify(stored) : null,
    });

    const mod = await import('../utils/hunt-hotpath-metrics.js');
    const latest = await mod.getLatestHuntHotPathSnapshot(redis as never);
    expect(latest?.sampleCount).toBe(3);
  });

  it('finish pushes sample via redis rpush', async () => {
    const redis = mockRedis();
    vi.doMock('../utils/redis.js', () => ({ redis }));

    const mod = await import('../utils/hunt-hotpath-metrics.js');
    const collector = mod.beginHuntHotPathMetrics();
    expect(collector).not.toBeNull();
    collector!.addRedisRead(1);
    collector!.finish();

    await new Promise((r) => setTimeout(r, 20));
    expect(redis.rpush).toHaveBeenCalled();
  });
});
