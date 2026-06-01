/**
 * hunt-hotpath-metrics.ts
 * Opsiyonel hunt profiling (production-safe, aggregate only).
 */
import { performance } from 'node:perf_hooks';

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

function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

const HUNT_HOTPATH_METRICS_ENABLED = envFlag('HUNT_HOTPATH_METRICS');

const samples: HuntSample[] = [];
const snapshots: HuntHotPathSnapshot[] = [];
let lastFlushAt = Date.now();

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

function maybeFlushAggregates(): void {
  if (samples.length === 0) return;
  const now = Date.now();
  if (samples.length < FLUSH_EVERY_HUNTS && now - lastFlushAt < FLUSH_EVERY_MS) return;

  const exec = samples.map((s) => s.executionDurationMs);
  const reward = samples.map((s) => s.rewardCalcDurationMs);
  const redisReads = samples.map((s) => s.redisReads);
  const redisWrites = samples.map((s) => s.redisWrites);
  const pgReads = samples.map((s) => s.pgReads);
  const pgWrites = samples.map((s) => s.pgWrites);
  const cacheHits = samples.map((s) => s.cacheHits);
  const cacheMisses = samples.map((s) => s.cacheMisses);
  const hydrations = samples.map((s) => s.hydrationCount);
  const persists = samples.map((s) => s.persistenceCount);

  const snapshot = buildSnapshot(samples, now);
  snapshots.push(snapshot);
  if (snapshots.length > 24) snapshots.shift();

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

  samples.length = 0;
  lastFlushAt = now;
}

export function isHuntHotPathMetricsEnabled(): boolean {
  return HUNT_HOTPATH_METRICS_ENABLED;
}

export function getLatestHuntHotPathSnapshot(): HuntHotPathSnapshot | null {
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1] ?? null;
}

function statText(label: string, s: MetricStats): string {
  return `- ${label}: avg ${fmt(s.avg)} | p50 ${fmt(s.p50)} | p95 ${fmt(s.p95)} | p99 ${fmt(s.p99)} | max ${fmt(s.max)}`;
}

export function buildHuntHotPathReport(snapshot: HuntHotPathSnapshot): string {
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
    `samples: **${snapshot.sampleCount}**`,
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
  if (!HUNT_HOTPATH_METRICS_ENABLED) return null;

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
      samples.push({
        ...sample,
        executionDurationMs: performance.now() - startedAt,
        rewardCalcDurationMs: rewardDurationMs,
      });
      maybeFlushAggregates();
    },
  };
}

