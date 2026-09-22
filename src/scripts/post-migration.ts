/**
 * post-migration.ts — Aktarim sonrasi Redis liderboard ve istatistik senkronu
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { backfillLeaderboardStats, rebuildAllLeaderboardZsets } from '../systems/leaderboard';
import { redis } from '../utils/redis';

config({ path: resolve(process.cwd(), '.env') });

export async function runPostMigration(): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.$connect();
  await assertRedisConnection();

  try {
    const { updated } = await backfillLeaderboardStats(prisma, redis);
    console.info(`[PostMigration] backfillLeaderboardStats: ${updated} oyuncu guncellendi`);

    const rebuilt = await rebuildAllLeaderboardZsets(redis, prisma);
    console.info(`[PostMigration] ZSET rebuild: ${rebuilt.keys} keys, ~${rebuilt.members} members`);

    const counts = await Promise.all([
      prisma.player.count(),
      prisma.owl.count(),
      prisma.inventoryItem.count(),
    ]);
    console.info(`[PostMigration] PG ozet: Player=${counts[0]}, Owl=${counts[1]}, Inventory=${counts[2]}`);
  } finally {
    await redis.quit();
    await prisma.$disconnect();
  }
}

async function assertRedisConnection(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== 'PONG') throw new Error('Redis ping basarisiz');
  console.info('[PostMigration] Redis baglandi');
}

if (process.argv[1]?.includes('post-migration')) {
  runPostMigration()
    .then(() => {
      console.info('[PostMigration] Tamamlandi');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[PostMigration] Hata:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
