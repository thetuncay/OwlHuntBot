/**
 * Komut performans ölçümü — kuyruk bekleme, handler süresi, yavaş komut uyarıları.
 * Redis'e dakikalık bucket yazar; PM2 log + /admin sys perf ile okunur.
 */
import { performance } from 'node:perf_hooks';
import type { Redis } from 'ioredis';
import { MAX_CONCURRENT_COMMANDS } from '../config';

const INFLIGHT_KEY = 'gate:commands:inflight';

export type PerfSource = 'slash' | 'prefix';

export interface PerfSampleMeta {
  command: string;
  source: PerfSource;
  ok: boolean;
  error?: string;
}

interface BucketStats {
  n: number;
  sumTotal: number;
  sumWait: number;
  sumHandler: number;
  maxTotal: number;
  slow: number;
  errors: number;
}

function envFlag(name: string, defaultOn = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultOn;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

export function isPerfMetricsEnabled(): boolean {
  return envFlag('PERF_METRICS', process.env.NODE_ENV !== 'production');
}

export function perfSlowThresholdMs(): number {
  return Number.parseInt(process.env.PERF_SLOW_MS ?? '2000', 10);
}

export function perfSummaryIntervalMs(): number {
  const sec = Number.parseInt(process.env.PERF_SUMMARY_INTERVAL_SECONDS ?? '60', 10);
  return Math.max(15, sec) * 1000;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? 0;
}

function bucketKey(minute: number): string {
  return `perf:min:${minute}`;
}

function fieldKey(source: PerfSource, command: string): string {
  return `${source}:${command.slice(0, 48)}`;
}

function parseBucket(raw: string | null): BucketStats {
  if (!raw) {
    return { n: 0, sumTotal: 0, sumWait: 0, sumHandler: 0, maxTotal: 0, slow: 0, errors: 0 };
  }
  try {
    return JSON.parse(raw) as BucketStats;
  } catch {
    return { n: 0, sumTotal: 0, sumWait: 0, sumHandler: 0, maxTotal: 0, slow: 0, errors: 0 };
  }
}

const localSamples = new Map<string, number[]>();
const LOCAL_SAMPLE_CAP = 120;

export class CommandPerfSpan {
  private readonly t0 = performance.now();
  private tQueue = 0;

  markQueueDone(): void {
    if (this.tQueue === 0) this.tQueue = performance.now();
  }

  async finish(redis: Redis, meta: PerfSampleMeta): Promise<void> {
    if (!isPerfMetricsEnabled()) return;

    const t1 = performance.now();
    const totalMs = Math.round(t1 - this.t0);
    const waitMs = this.tQueue > 0 ? Math.round(this.tQueue - this.t0) : 0;
    const handlerMs = this.tQueue > 0 ? Math.round(t1 - this.tQueue) : totalMs;

    await recordSample(redis, {
      ...meta,
      waitMs,
      handlerMs,
      totalMs,
    });
  }
}

export function beginCommandPerf(): CommandPerfSpan {
  return new CommandPerfSpan();
}

async function recordSample(
  redis: Redis,
  sample: PerfSampleMeta & { waitMs: number; handlerMs: number; totalMs: number },
): Promise<void> {
  const slowThreshold = perfSlowThresholdMs();
  const key = fieldKey(sample.source, sample.command);

  const buf = localSamples.get(key) ?? [];
  buf.push(sample.totalMs);
  if (buf.length > LOCAL_SAMPLE_CAP) buf.shift();
  localSamples.set(key, buf);

  const minute = Math.floor(Date.now() / 60_000);
  const redisKey = bucketKey(minute);
  const field = fieldKey(sample.source, sample.command);
  const prev = parseBucket(await redis.hget(redisKey, field));
  const next: BucketStats = {
    n: prev.n + 1,
    sumTotal: prev.sumTotal + sample.totalMs,
    sumWait: prev.sumWait + sample.waitMs,
    sumHandler: prev.sumHandler + sample.handlerMs,
    maxTotal: Math.max(prev.maxTotal, sample.totalMs),
    slow: prev.slow + (sample.totalMs >= slowThreshold ? 1 : 0),
    errors: prev.errors + (sample.ok ? 0 : 1),
  };

  await redis
    .multi()
    .hset(redisKey, field, JSON.stringify(next))
    .expire(redisKey, 7200)
    .exec();

  if (sample.totalMs >= slowThreshold) {
    const msg =
      `[Perf] SLOW ${sample.source}:${sample.command} total=${sample.totalMs}ms ` +
      `wait=${sample.waitMs}ms handler=${sample.handlerMs}ms` +
      (sample.error ? ` err=${sample.error.slice(0, 80)}` : '');
    console.warn(msg);
    await redis
      .multi()
      .lpush('perf:slow', msg)
      .ltrim('perf:slow', 0, 49)
      .exec()
      .catch(() => null);
  }
}

export function logLocalPerfSummary(): void {
  if (!isPerfMetricsEnabled() || localSamples.size === 0) return;

  const lines: string[] = [];
  for (const [key, samples] of localSamples.entries()) {
    if (samples.length === 0) continue;
    lines.push(
      `${key} n=${samples.length} p50=${percentile(samples, 50)}ms p95=${percentile(samples, 95)}ms max=${Math.max(...samples)}ms`,
    );
  }
  if (lines.length === 0) return;
  lines.sort();
  console.info(`[Perf] Ozet (yerel, son ${LOCAL_SAMPLE_CAP} ornek/komut):\n${lines.join('\n')}`);
}

export interface AggregatedCommandPerf {
  key: string;
  n: number;
  avgTotal: number;
  avgWait: number;
  avgHandler: number;
  maxTotal: number;
  slow: number;
  errors: number;
}

export async function aggregatePerfBuckets(
  redis: Redis,
  minutes: number,
): Promise<AggregatedCommandPerf[]> {
  const nowMinute = Math.floor(Date.now() / 60_000);
  const merged = new Map<string, AggregatedCommandPerf>();

  for (let i = 0; i < minutes; i++) {
    const raw = await redis.hgetall(bucketKey(nowMinute - i));
    for (const [field, json] of Object.entries(raw)) {
      const b = parseBucket(json);
      if (b.n === 0) continue;
      const prev = merged.get(field);
      if (!prev) {
        merged.set(field, {
          key: field,
          n: b.n,
          avgTotal: b.sumTotal / b.n,
          avgWait: b.sumWait / b.n,
          avgHandler: b.sumHandler / b.n,
          maxTotal: b.maxTotal,
          slow: b.slow,
          errors: b.errors,
        });
      } else {
        const totalN = prev.n + b.n;
        merged.set(field, {
          key: field,
          n: totalN,
          avgTotal: (prev.avgTotal * prev.n + b.sumTotal) / totalN,
          avgWait: (prev.avgWait * prev.n + b.sumWait) / totalN,
          avgHandler: (prev.avgHandler * prev.n + b.sumHandler) / totalN,
          maxTotal: Math.max(prev.maxTotal, b.maxTotal),
          slow: prev.slow + b.slow,
          errors: prev.errors + b.errors,
        });
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.n - a.n);
}

export async function buildPerfReport(redis: Redis, minutes = 5): Promise<string> {
  const [agg, inflightRaw, slowRecent] = await Promise.all([
    aggregatePerfBuckets(redis, minutes),
    redis.get(INFLIGHT_KEY),
    redis.lrange('perf:slow', 0, 4),
  ]);

  const inflight = Number.parseInt(inflightRaw ?? '0', 10) || 0;
  const poolLimit = process.env.BOT_DB_POOL_LIMIT ?? '8';
  const poolTimeout = process.env.DB_POOL_TIMEOUT ?? '10';

  let text = `📊 **Performans Raporu** (son **${minutes}** dk, Redis bucket)\n\n`;
  text += `Inflight komut: **${inflight}** / ${MAX_CONCURRENT_COMMANDS}\n`;
  text += `DB pool: **${poolLimit}** conn, timeout **${poolTimeout}s**\n`;
  text += `PERF_METRICS=${isPerfMetricsEnabled() ? 'açık' : 'kapalı'} | yavaş eşik **${perfSlowThresholdMs()}ms**\n\n`;

  if (agg.length === 0) {
    text += `_Henüz örnek yok. .env içinde PERF_METRICS=1 yapıp komut spam testi çalıştır._\n`;
  } else {
    text += `**Komutlar** (avg total / wait / handler):\n`;
    for (const row of agg.slice(0, 15)) {
      text +=
        `• \`${row.key}\` n=${row.n} ` +
        `avg=${Math.round(row.avgTotal)}/${Math.round(row.avgWait)}/${Math.round(row.avgHandler)}ms ` +
        `max=${row.maxTotal}ms slow=${row.slow} err=${row.errors}\n`;
    }
  }

  if (slowRecent.length > 0) {
    text += `\n**Son yavaş komutlar:**\n${slowRecent.map((l) => `• ${l}`).join('\n')}`;
  }

  return text;
}
