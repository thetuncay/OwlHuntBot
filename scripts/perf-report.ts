/**
 * Redis'teki perf bucket'larını okuyup konsola yazar.
 * Kullanım: pnpm perf:report
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { buildPerfReport } from '../src/utils/perf-metrics';

config({ path: resolve(process.cwd(), '.env') });

const minutes = Number.parseInt(process.argv[2] ?? '5', 10);
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6380';
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });

async function main(): Promise<void> {
  await redis.connect();
  const report = await buildPerfReport(redis, Number.isFinite(minutes) ? minutes : 5);
  console.log(report.replace(/\*\*/g, '').replace(/`/g, ''));
  await redis.quit();
}

void main().catch((err) => {
  console.error('[perf-report]', err instanceof Error ? err.message : err);
  process.exit(1);
});
