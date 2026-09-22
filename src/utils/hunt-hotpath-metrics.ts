/**
 * hunt-hotpath-metrics.ts
 * Opsiyonel hunt profiling (production-safe, aggregate only).
 * Örnekler Redis listesinde tutulur — tsx/dist çift modül ve PM2 restart güvenli.
 */
import { performance } from 'node:perf_hooks';
import type { Redis } from 'ioredis';

interface HuntSample {
  redisReads: number;
  redisWrites: number;
  pgReads: number;
  pgWrites: number;
  cacheHits: number;
  cacheMisses: number;
  hydrationCount: number;
  persistenceCount: number;
  executionDurationMs: number;
  rewardCalcDurationMs: number;
}

export interface MetricStats {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface HuntHotPathSnapshot {
  collectedAtMs: number;
  sampleCount: number;
  executionDurationMs: MetricStats;
  rewardCalcDurationMs: MetricStats;
  redisReads: MetricStats;
  redisWrites: MetricStats;
  pgReads: MetricStats;
  pgWrites: MetricStats;
  cacheHits: MetricStats;
  cacheMisses: MetricStats;
  hydrationCount: MetricStats;
  persistenceCount: MetricStats;
}

export interface HuntHotPathMetricsCollector {
  addRedisRead(n?: number): void;
  addRedisWrite(n?: number): void;
  addPgRead(n?: number): void;
  addPgWrite(n?: number): void;
  addCacheHit(n?: number): void;
  addCacheMiss(n?: number): void;
  addHydration(n?: number): void;
  addPersistence(n?: number): void;
  beginRewardCalc(): void;
  endRewardCalc(): void;
  finish(): void;
}

const FLUSH_EVERY_HUNTS = 100;
const FLUSH_EVERY_MS = 5 * 60 * 1000;
const REDIS_SNAPSHOT_KEY = 'ops:hunt:hotpath:v1';
const REDIS_PENDING_KEY = 'ops:hunt:hotpath:pending:v1';
const REDIS_LAST_FLUSH_KEY = 'ops:hunt:hotpath:lastflush:v1';
const REDIS_SNAPSHOT_TTL_SEC = 7 * 86400;
const REDIS_PENDING_TTL_SEC = 86400;

function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? 0;
}

function statLine(name: string, values: number[]): string {
  if (values.length === 0) return `${name}: n=0`;
  const sum = values.reduce((s, v) => s + v, 0);
  const avg = sum / values.length;
  const max = Math.max(...values);
  return `${name}: avg=${avg.toFixed(2)} p50=${percentile(values, 50).toFixed(2)} p95=${percentile(values, 95).toFixed(2)} p99=${percentile(values, 99).toFixed(2)} max=${max.toFixed(2)}`;
}

function metricStats(values: number[]): MetricStats {
  if (values.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sum = values.reduce((s, v) => s + v, 0);
  return {
    avg: sum / values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: Math.max(...values),
  };
}

function buildSnapshot(items: HuntSample[], collectedAtMs: number): HuntHotPathSnapshot {
  return {
    collectedAtMs,
    sampleCount: items.length,
    executionDurationMs: metricStats(items.map((s) => s.executionDurationMs)),
    rewardCalcDurationMs: metricStats(items.map((s) => s.rewardCalcDurationMs)),
    redisReads: metricStats(items.map((s) => s.redisReads)),
    redisWrites: metricStats(items.map((s) => s.redisWrites)),
    pgReads: metricStats(items.map((s) => s.pgReads)),
    pgWrites: metricStats(items.map((s) => s.pgWrites)),
    cacheHits: metricStats(items.map((s) => s.cacheHits)),
    cacheMisses: metricStats(items.map((s) => s.cacheMisses)),
    hydrationCount: metricStats(items.map((s) => s.hydrationCount)),
    persistenceCount: metricStats(items.map((s) => s.persistenceCount)),
  };
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function parseSample(raw: string): HuntSample | null {
  try {
    const parsed = JSON.parse(raw) as HuntSample;
    if (typeof parsed.executionDurationMs !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function resolveRedis(client?: Redis | null): Promise<Redis | null> {
  if (client) return client;
  try {
    const { redis } = await import('./redis.js');
    return redis;
  } catch {
    return null;
  }
}

async function loadPendingSamples(client?: Redis | null): Promise<HuntSample[]> {
  const redis = await resolveRedis(client);
  if (!redis) return [];
  try {
    const raw = await redis.lrange(REDIS_PENDING_KEY, 0, -1);
    return raw.map(parseSample).filter((s): s is HuntSample => s !== null);
  } catch {
    return [];
  }
}

async function getLastFlushAt(client?: Redis | null): Promise<number> {
  const redis = await resolveRedis(client);
  if (!redis) return 0;
  try {
    const raw = await redis.get(REDIS_LAST_FLUSH_KEY);
    if (!raw) return 0;
    const ts = Number.parseInt(raw, 10);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

async function persistSnapshotToRedis(
  snapshot: HuntHotPathSnapshot,
  client?: Redis | null,
): Promise<void> {
  const redis = await resolveRedis(client);
  if (!redis) return;
  try {
    await redis.set(REDIS_SNAPSHOT_KEY, JSON.stringify(snapshot), 'EX', REDIS_SNAPSHOT_TTL_SEC);
  } catch {
    /* ops-only */
  }
}

async function pushSampleToRedis(sample: HuntSample, client?: Redis | null): Promise<void> {
  const redis = await resolveRedis(client);
  if (!redis) return;
  try {
    await redis.rpush(REDIS_PENDING_KEY, JSON.stringify(sample));
    await redis.expire(REDIS_PENDING_KEY, REDIS_PENDING_TTL_SEC);
  } catch {
    /* ops-only */
  }
}

async function clearPendingSamples(client?: Redis | null): Promise<void> {
  const redis = await resolveRedis(client);
  if (!redis) return;
  try {
    await redis.del(REDIS_PENDING_KEY);
  } catch {
    /* ops-only */
  }
}

async function setLastFlushAt(ts: number, client?: Redis | null): Promise<void> {
  const redis = await resolveRedis(client);
  if (!redis) return;
  try {
    await redis.set(REDIS_LAST_FLUSH_KEY, String(ts), 'EX', REDIS_SNAPSHOT_TTL_SEC);
  } catch {
    /* ops-only */
  }
}

async function flushNow(
  force: boolean,
  client?: Redis | null,
): Promise<HuntHotPathSnapshot | null> {
  const pending = await loadPendingSamples(client);
  if (pending.length === 0) return null;

  const now = Date.now();
  const lastFlushAt = await getLastFlushAt(client);
  if (!force && pending.length < FLUSH_EVERY_HUNTS && now - lastFlushAt < FLUSH_EVERY_MS) {
    return null;
  }

  const snapshot = buildSnapshot(pending, now);
  await persistSnapshotToRedis(snapshot, client);
  await clearPendingSamples(client);
  await setLastFlushAt(now, client);

  const exec = pending.map((s) => s.executionDurationMs);
  const reward = pending.map((s) => s.rewardCalcDurationMs);
  const redisReads = pending.map((s) => s.redisReads);
  const redisWrites = pending.map((s) => s.redisWrites);
  const pgReads = pending.map((s) => s.pgReads);
  const pgWrites = pending.map((s) => s.pgWrites);
  const cacheHits = pending.map((s) => s.cacheHits);
  const cacheMisses = pending.map((s) => s.cacheMisses);
  const hydrations = pending.map((s) => s.hydrationCount);
  const persists = pending.map((s) => s.persistenceCount);

  console.info(
    `[HuntHotPathMetrics] samples=${snapshot.sampleCount}\n` +
      `  ${statLine('exec_ms', exec)}\n` +
      `  ${statLine('reward_calc_ms', reward)}\n` +
      `  ${statLine('redis_reads', redisReads)}\n` +
      `  ${statLine('redis_writes', redisWrites)}\n` +
      `  ${statLine('pg_reads', pgReads)}\n` +
      `  ${statLine('pg_writes', pgWrites)}\n` +
      `  ${statLine('cache_hits', cacheHits)}\n` +
      `  ${statLine('cache_misses', cacheMisses)}\n` +
      `  ${statLine('hydrations', hydrations)}\n` +
      `  ${statLine('persistence_ops', persists)}`,
  );

  return snapshot;
}

function scheduleMaybeFlush(client?: Redis | null): void {
  void flushNow(false, client).catch(() => null);
}

export function isHuntHotPathMetricsEnabled(): boolean {
  return envFlag('HUNT_HOTPATH_METRICS');
}

export async function getPendingHuntSampleCount(client?: Redis | null): Promise<number> {
  const redis = await resolveRedis(client);
  if (!redis) return 0;
  try {
    return await redis.llen(REDIS_PENDING_KEY);
  } catch {
    return 0;
  }
}

/** Bekleyen örnekleri hemen aggregate eder (/admin sys huntperf). */
export async function forceFlushHuntHotPathMetrics(
  client?: Redis | null,
): Promise<HuntHotPathSnapshot | null> {
  return flushNow(true, client);
}

export async function getLatestHuntHotPathSnapshot(
  client?: Redis | null,
): Promise<HuntHotPathSnapshot | null> {
  const redis = await resolveRedis(client);
  if (redis) {
    try {
      const raw = await redis.get(REDIS_SNAPSHOT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HuntHotPathSnapshot;
        if (typeof parsed.sampleCount === 'number') return parsed;
      }
    } catch {
      /* fallback */
    }
  }
  return null;
}

function statText(label: string, s: MetricStats): string {
  return `- ${label}: avg ${fmt(s.avg)} | p50 ${fmt(s.p50)} | p95 ${fmt(s.p95)} | p99 ${fmt(s.p99)} | max ${fmt(s.max)}`;
}

export function buildHuntHotPathReport(snapshot: HuntHotPathSnapshot): string {
  const collected = new Date(snapshot.collectedAtMs).toLocaleString('tr-TR');
  const totalCache = snapshot.cacheHits.avg + snapshot.cacheMisses.avg;
  const hitRate = totalCache > 0 ? (snapshot.cacheHits.avg / totalCache) * 100 : 0;
  const missRate = totalCache > 0 ? (snapshot.cacheMisses.avg / totalCache) * 100 : 0;
  const avgRedisOps = snapshot.redisReads.avg + snapshot.redisWrites.avg;
  const avgPgOps = snapshot.pgReads.avg + snapshot.pgWrites.avg;

  const opportunities: string[] = [];
  if (snapshot.redisReads.p95 >= 12 || avgRedisOps >= 16) {
    opportunities.push('Redis read pressure: batch/pipeline more state reads.');
  }
  if (avgPgOps >= 2 || snapshot.pgReads.p95 >= 2) {
    opportunities.push('PostgreSQL pressure: reduce display-path DB reads.');
  }
  if (missRate >= 20 || snapshot.hydrationCount.avg >= 0.2) {
    opportunities.push('Hydration misses: improve hot-state TTL/warmup.');
  }
  if (snapshot.persistenceCount.p95 >= 3) {
    opportunities.push('Persistence pressure: stronger per-player coalescing.');
  }
  if (snapshot.rewardCalcDurationMs.p95 >= 15 || snapshot.executionDurationMs.p95 >= 60) {
    opportunities.push('Reward calc tail latency: precompute heavy branches.');
  }
  if (opportunities.length === 0) {
    opportunities.push('No clear bottleneck from current snapshot.');
  }

  return [
    `📈 **Hunt Hot Path Perf**`,
    `samples: **${snapshot.sampleCount}** · toplanma: ${collected}`,
    '',
    `**Timings (ms)**`,
    statText('executionDurationMs', snapshot.executionDurationMs),
    statText('rewardCalcDurationMs', snapshot.rewardCalcDurationMs),
    '',
    `**Ops / Hunt**`,
    statText('redisReads', snapshot.redisReads),
    statText('redisWrites', snapshot.redisWrites),
    statText('pgReads', snapshot.pgReads),
    statText('pgWrites', snapshot.pgWrites),
    statText('cacheHits', snapshot.cacheHits),
    statText('cacheMisses', snapshot.cacheMisses),
    statText('hydrationCount', snapshot.hydrationCount),
    statText('persistenceCount', snapshot.persistenceCount),
    '',
    `**Derived**`,
    `- cache hit rate: ${fmt(hitRate)}%`,
    `- cache miss rate: ${fmt(missRate)}%`,
    `- avg Redis operations / hunt: ${fmt(avgRedisOps)}`,
    `- avg PostgreSQL operations / hunt: ${fmt(avgPgOps)}`,
    '',
    `**Optimization Opportunities**`,
    ...opportunities.map((item) => `- ${item}`),
  ].join('\n');
}

export function beginHuntHotPathMetrics(): HuntHotPathMetricsCollector | null {
  if (!isHuntHotPathMetricsEnabled()) return null;

  const startedAt = performance.now();
  let rewardStartedAt = 0;
  let rewardDurationMs = 0;

  const sample: Omit<HuntSample, 'executionDurationMs' | 'rewardCalcDurationMs'> = {
    redisReads: 0,
    redisWrites: 0,
    pgReads: 0,
    pgWrites: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hydrationCount: 0,
    persistenceCount: 0,
  };

  return {
    addRedisRead(n = 1): void { sample.redisReads += n; },
    addRedisWrite(n = 1): void { sample.redisWrites += n; },
    addPgRead(n = 1): void { sample.pgReads += n; },
    addPgWrite(n = 1): void { sample.pgWrites += n; },
    addCacheHit(n = 1): void { sample.cacheHits += n; },
    addCacheMiss(n = 1): void { sample.cacheMisses += n; },
    addHydration(n = 1): void { sample.hydrationCount += n; },
    addPersistence(n = 1): void { sample.persistenceCount += n; },
    beginRewardCalc(): void {
      if (rewardStartedAt === 0) rewardStartedAt = performance.now();
    },
    endRewardCalc(): void {
      if (rewardStartedAt === 0) return;
      rewardDurationMs += performance.now() - rewardStartedAt;
      rewardStartedAt = 0;
    },
    finish(): void {
      if (rewardStartedAt > 0) {
        rewardDurationMs += performance.now() - rewardStartedAt;
        rewardStartedAt = 0;
      }
      const completed: HuntSample = {
        ...sample,
        executionDurationMs: performance.now() - startedAt,
        rewardCalcDurationMs: rewardDurationMs,
      };
      void pushSampleToRedis(completed).then(() => scheduleMaybeFlush());
    },
  };
}
