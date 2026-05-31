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

  console.info(
    `[HuntHotPathMetrics] samples=${samples.length}\n` +
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

