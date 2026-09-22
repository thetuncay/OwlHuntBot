#!/usr/bin/env tsx
/**
 * Tum oyunculari PG'den Redis'e yeniden yukler; stale owl key'lerini temizler.
 * Stat rebalance / restore sonrasi calistir.
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { rehydratePlayerState } from '../src/state/player-state';
import { invalidatePlayerCache } from '../src/utils/player-cache';
import { redis } from '../src/utils/redis';

config({ path: resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const players = await prisma.player.findMany({ select: { id: true } });
  const validOwlIds = new Set(
    (await prisma.owl.findMany({ select: { id: true } })).map((o) => o.id),
  );

  const CONCURRENCY = Number.parseInt(process.env.REHYDRATE_CONCURRENCY ?? '20', 10);
  const batchSize = Math.max(1, Math.min(CONCURRENCY, 50));

  let rehydrated = 0;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);
    await Promise.all(batch.map(async ({ id }) => {
      await rehydratePlayerState(redis, prisma, id);
      await invalidatePlayerCache(redis, id);
    }));
    rehydrated += batch.length;
  }

  let orphanOwls = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'state:owl:*', 'COUNT', 200);
    cursor = next;
    for (const key of keys) {
      const owlId = key.replace('state:owl:', '');
      if (!validOwlIds.has(owlId)) {
        await redis.del(key);
        orphanOwls++;
      }
    }
  } while (cursor !== '0');

  console.log(JSON.stringify({
    rehydrated,
    orphanOwlsDeleted: orphanOwls,
    validOwlsInPg: validOwlIds.size,
  }, null, 2));

  await redis.quit();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
