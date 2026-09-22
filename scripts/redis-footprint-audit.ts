#!/usr/bin/env npx tsx
/**
 * redis-footprint-audit.ts — Read-only Redis keyspace footprint report.
 *
 * Usage: npx tsx scripts/redis-footprint-audit.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import Redis from 'ioredis';

config({ path: resolve(process.cwd(), '.env') });

const PREFIXES = [
  'state:player:',
  'dirty:',
  'lb:',
  'encounter:',
  'duel:',
  'mute:',
  'rate:',
  'cooldown:',
  'gate:',
  'ops:',
  'perf:',
  'ban:',
  'bull:db-writes:',
];

async function countPrefix(redis: Redis, prefix: string): Promise<number> {
  let count = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
    cursor = next;
    count += keys.length;
  } while (cursor !== '0');
  return count;
}

async function main(): Promise<void> {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const redis = new Redis(url);

  try {
    const info = await redis.info('memory');
    const usedMatch = info.match(/used_memory:(\d+)/);
    const maxMatch = info.match(/maxmemory:(\d+)/);
    const usedMb = usedMatch ? Math.round(parseInt(usedMatch[1]!, 10) / 1024 / 1024) : 0;
    const maxMb =
      maxMatch && parseInt(maxMatch[1]!, 10) > 0
        ? Math.round(parseInt(maxMatch[1]!, 10) / 1024 / 1024)
        : null;

    const dbsize = await redis.dbsize();

    console.log('=== Redis Footprint Audit ===\n');
    console.log(`DBSIZE (approx keys): ${dbsize}`);
    console.log(`used_memory: ${usedMb} MB${maxMb ? ` / max ${maxMb} MB` : ''}\n`);
    console.log('Prefix counts (SCAN, may take a moment):\n');

    const rows: { prefix: string; count: number }[] = [];
    for (const prefix of PREFIXES) {
      const count = await countPrefix(redis, prefix);
      rows.push({ prefix, count });
    }
    rows.sort((a, b) => b.count - a.count);

    for (const row of rows) {
      console.log(`  ${row.prefix.padEnd(22)} ${row.count}`);
    }

    const accounted = rows.reduce((s, r) => s + r.count, 0);
    console.log(`\nAccounted (sum of prefixes): ${accounted}`);
    console.log(`Unaccounted (DBSIZE - sum): ~${Math.max(0, dbsize - accounted)}`);
    console.log('\nPilot scaling notes:');
    console.log('  - state:player:* scales with registered players (dominant).');
    console.log('  - Guild count weakly affects Redis; traffic drives mute/rate/cooldown keys.');
    console.log('  - ops:* keys have TTL (48-72h); perf:* buckets expire in ~2h.');
    console.log('\nRecommended alerts:');
    console.log('  - used_memory > 80% maxmemory');
    console.log('  - DBSIZE week-over-week +20%');
    console.log('  - ops:snapshot queue.waiting sustained > 200');
  } finally {
    await redis.quit();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
