/**
 * command-analytics.ts — Redis rolling command metrics (all pipeline entrypoints).
 */
import type { Redis } from 'ioredis';
import type { PerfSource } from '../utils/perf-metrics';
import {
  isOpsAnalyticsEnabled,
  opsCmdBucketTtlSec,
  opsGuildHourTtlSec,
  opsHllUserTtlSec,
  opsUserHourTtlSec,
} from './ops-config';

export interface CommandAnalyticsEvent {
  command: string;
  source: PerfSource;
  userId: string;
  guildId?: string | null;
  ok: boolean;
  durationMs: number;
}

interface BucketStats {
  n: number;
  ok: number;
  fail: number;
  sumMs: number;
  maxMs: number;
}

export interface AggregatedCommandStats {
  field: string;
  n: number;
  ok: number;
  fail: number;
  avgMs: number;
  maxMs: number;
}

export interface CommandRollup24h {
  total: number;
  failed: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  byCommand: AggregatedCommandStats[];
}

function parseBucket(json: string | null): BucketStats {
  if (!json) return { n: 0, ok: 0, fail: 0, sumMs: 0, maxMs: 0 };
  try {
    const b = JSON.parse(json) as BucketStats;
    return {
      n: b.n ?? 0,
      ok: b.ok ?? 0,
      fail: b.fail ?? 0,
      sumMs: b.sumMs ?? 0,
      maxMs: b.maxMs ?? 0,
    };
  } catch {
    return { n: 0, ok: 0, fail: 0, sumMs: 0, maxMs: 0 };
  }
}

export function normalizeCommandName(command: string): string {
  const trimmed = command.trim().slice(0, 64);
  return trimmed || 'unknown';
}

export function hourBucketKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `ops:cmd:hour:${y}${mo}${d}${h}`;
}

export function dateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${d}`;
}

function cmdRedisKey(hourKey: string): string {
  return hourKey;
}

function fieldKey(source: PerfSource, command: string): string {
  return `${source}:${normalizeCommandName(command)}`;
}

/**
 * Record one command execution into rolling Redis buckets (fire-and-forget safe).
 */
export async function recordCommandAnalytics(
  redis: Redis,
  event: CommandAnalyticsEvent,
): Promise<void> {
  if (!isOpsAnalyticsEnabled()) return;

  const hourKey = hourBucketKey();
  const hourSuffix = hourKey.replace('ops:cmd:hour:', '');
  const field = fieldKey(event.source, event.command);
  const prev = parseBucket(await redis.hget(hourKey, field));
  const next: BucketStats = {
    n: prev.n + 1,
    ok: prev.ok + (event.ok ? 1 : 0),
    fail: prev.fail + (event.ok ? 0 : 1),
    sumMs: prev.sumMs + Math.max(0, event.durationMs),
    maxMs: Math.max(prev.maxMs, event.durationMs),
  };

  const multi = redis.multi().hset(hourKey, field, JSON.stringify(next)).expire(hourKey, opsCmdBucketTtlSec());

  const hllKey = `ops:hll:user:${dateKey()}`;
  multi.pfadd(hllKey, event.userId).expire(hllKey, opsHllUserTtlSec());

  const userHourKey = `ops:user:hour:${hourSuffix}:${event.userId}`;
  multi.incr(userHourKey).expire(userHourKey, opsUserHourTtlSec());

  if (event.guildId) {
    const guildHourKey = `ops:guild:hour:${hourSuffix}:${event.guildId}`;
    multi.incr(guildHourKey).expire(guildHourKey, opsGuildHourTtlSec());
  }

  if (!event.ok) {
    const failKey = `ops:cmd:fail:hour:${hourSuffix}`;
    multi.hincrby(failKey, field, 1).expire(failKey, opsCmdBucketTtlSec());
  }

  await multi.exec().catch(() => null);
}

/** Sum command buckets for the last N UTC hours. */
export async function aggregateCommandRollup24h(redis: Redis): Promise<CommandRollup24h> {
  const merged = new Map<string, AggregatedCommandStats>();
  const latencies: number[] = [];
  let total = 0;
  let failed = 0;
  let sumMs = 0;

  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getTime() - i * 3600_000);
    const key = hourBucketKey(d);
    const raw = await redis.hgetall(key).catch(() => ({}));
    for (const [field, json] of Object.entries(raw)) {
      const b = parseBucket(json);
      if (b.n === 0) continue;
      total += b.n;
      failed += b.fail;
      sumMs += b.sumMs;
      if (b.maxMs > 0) latencies.push(b.maxMs);

      const prev = merged.get(field);
      if (!prev) {
        merged.set(field, {
          field,
          n: b.n,
          ok: b.ok,
          fail: b.fail,
          avgMs: b.sumMs / b.n,
          maxMs: b.maxMs,
        });
      } else {
        const n = prev.n + b.n;
        merged.set(field, {
          field,
          n,
          ok: prev.ok + b.ok,
          fail: prev.fail + b.fail,
          avgMs: (prev.avgMs * prev.n + b.sumMs) / n,
          maxMs: Math.max(prev.maxMs, b.maxMs),
        });
      }
    }
  }

  const byCommand = [...merged.values()].sort((a, b) => b.n - a.n);
  latencies.sort((a, b) => a - b);
  const p95 = percentile(latencies, 95);

  return {
    total,
    failed,
    avgLatencyMs: total > 0 ? Math.round(sumMs / total) : 0,
    p95LatencyMs: p95,
    byCommand,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

export async function getActiveUsers24h(redis: Redis): Promise<number> {
  const today = `ops:hll:user:${dateKey()}`;
  const yesterday = `ops:hll:user:${dateKey(new Date(Date.now() - 86_400_000))}`;
  const [t, y] = await Promise.all([
    redis.pfcount(today).catch(() => 0),
    redis.pfcount(yesterday).catch(() => 0),
  ]);
  return Math.max(t, y);
}

export interface TopTrafficEntry {
  id: string;
  count: number;
}

/** Top guild/user traffic for current UTC hour (snapshot helper). */
export async function getTopGuildTraffic(
  redis: Redis,
  limit = 10,
): Promise<TopTrafficEntry[]> {
  const suffix = hourBucketKey().replace('ops:cmd:hour:', '');
  const pattern = `ops:guild:hour:${suffix}:*`;
  return scanTopIncrKeys(redis, pattern, limit);
}

export async function getTopUserTraffic(
  redis: Redis,
  limit = 10,
): Promise<TopTrafficEntry[]> {
  const suffix = hourBucketKey().replace('ops:cmd:hour:', '');
  const pattern = `ops:user:hour:${suffix}:*`;
  return scanTopIncrKeys(redis, pattern, limit);
}

async function scanTopIncrKeys(
  redis: Redis,
  pattern: string,
  limit: number,
): Promise<TopTrafficEntry[]> {
  const entries: TopTrafficEntry[] = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    for (const key of keys) {
      const count = parseInt((await redis.get(key)) ?? '0', 10);
      if (!Number.isFinite(count) || count <= 0) continue;
      const id = key.split(':').pop() ?? key;
      entries.push({ id, count });
    }
  } while (cursor !== '0' && entries.length < limit * 3);

  return entries.sort((a, b) => b.count - a.count).slice(0, limit);
}
