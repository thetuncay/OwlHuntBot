/**
 * post-migration.ts — Aktarim sonrasi Redis liderboard ve istatistik senkronu
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { backfillLeaderboardStats } from '../systems/leaderboard';
import type { LeaderboardCategory } from '../systems/leaderboard';
import { categoryScoreField } from '../systems/leaderboard-queries';
import { seasonCacheKey } from '../systems/leaderboard-season';
import { redis } from '../utils/redis';

config({ path: resolve(process.cwd(), '.env') });

const CATEGORIES: LeaderboardCategory[] = ['power', 'hunt', 'relic', 'arena', 'wealth'];

async function rebuildRedisLeaderboards(prisma: PrismaClient): Promise<void> {
  const players = await prisma.player.findMany({
    select: {
      id: true,
      powerScore: true,
      totalHunts: true,
      totalRareFinds: true,
      totalPvpWins: true,
      totalCoinsEarned: true,
    },
  });

  for (const category of CATEGORIES) {
    const field = categoryScoreField(category) as keyof typeof players[0];
    await redis.del(`lb:${category}`);
    if (players.length === 0) continue;

    const pipeline = redis.pipeline();
    for (const player of players) {
      const score = Number(player[field] ?? 0);
      if (score > 0) {
        pipeline.zadd(`lb:${category}`, score, player.id);
      }
    }
    await pipeline.exec();
    console.info(`[PostMigration] lb:${category} → ${players.length} oyuncu tarandi`);
  }

  await Promise.all(CATEGORIES.map((c) => redis.del(seasonCacheKey(c))));
  console.info('[PostMigration] Sezon liderboard cache temizlendi');
}

export async function runPostMigration(): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.$connect();
  await assertRedisConnection();

  try {
    const { updated } = await backfillLeaderboardStats(prisma);
    console.info(`[PostMigration] backfillLeaderboardStats: ${updated} oyuncu guncellendi`);

    await rebuildRedisLeaderboards(prisma);

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
