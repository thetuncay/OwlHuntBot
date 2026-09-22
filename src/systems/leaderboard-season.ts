/**
 * leaderboard-season.ts — Sezon yönetimi (batch reset + ZSET temizliği)
 */
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { LEADERBOARD_SEASON_BATCH, LEADERBOARD_SEASON_RESET_ENABLED, SEASON_TYPE } from '../config';
import type { LeaderboardCategory } from './leaderboard-types';
import {
  activePeriods,
  ALL_CATEGORIES,
  currentMonthId,
  currentWeekId,
  legacySeasonSnapshotKey,
  legacyZsetKey,
  zsetKey,
} from './leaderboard-keys';
import { invalidateAllSnapshotsForCategory } from './leaderboard-cache';
import { LEADERBOARD_SNAPSHOT_TOP_100, LEADERBOARD_SNAPSHOT_TOP_1000, LEADERBOARD_TOP_N } from '../config';

export function currentSeasonId(type: 'weekly' | 'monthly' = SEASON_TYPE): string {
  return type === 'monthly' ? currentMonthId() : currentWeekId();
}

export function seasonEndDate(type: 'weekly' | 'monthly' = SEASON_TYPE): Date {
  const now = new Date();
  if (type === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  const d = new Date(now);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (8 - day));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const seasonCacheKey = (category: LeaderboardCategory): string =>
  legacySeasonSnapshotKey(category, currentSeasonId());

async function clearLeaderboardRedisKeys(redis: Redis, archivedSeasonId: string): Promise<void> {
  const topNs = [LEADERBOARD_TOP_N, LEADERBOARD_SNAPSHOT_TOP_100, LEADERBOARD_SNAPSHOT_TOP_1000];
  const periods = activePeriods();
  const periodValues = Object.values(periods);

  const delKeys: string[] = [];
  for (const category of ALL_CATEGORIES) {
    delKeys.push(legacyZsetKey(category));
    delKeys.push(legacySeasonSnapshotKey(category, archivedSeasonId));
    for (const period of periodValues) {
      delKeys.push(zsetKey('global', category, period));
    }
  }

  const chunk = 100;
  for (let i = 0; i < delKeys.length; i += chunk) {
    await redis.del(...delKeys.slice(i, i + chunk));
  }

  await Promise.all(
    ALL_CATEGORIES.map((c) =>
      invalidateAllSnapshotsForCategory(redis, 'global', c, periodValues, topNs),
    ),
  );
}

export async function archiveAndResetSeason(prisma: PrismaClient, redis: Redis): Promise<string> {
  if (!LEADERBOARD_SEASON_RESET_ENABLED) {
    throw new Error('Leaderboard season reset is disabled (LEADERBOARD_SEASON_RESET_ENABLED=false)');
  }
  const seasonId = currentSeasonId();

  const archives: Array<{
    playerId: string;
    seasonId: string;
    seasonType: string;
    powerScore: number;
    totalHunts: number;
    totalRareFinds: number;
    totalPvpWins: number;
    totalCoinsEarned: number;
    rank: number;
  }> = [];
  let rankCounter = 0;

  const rankedPlayers = await prisma.player.findMany({
    where: { powerScore: { gt: 0 } },
    orderBy: [{ powerScore: 'desc' }],
    select: {
      id: true,
      powerScore: true,
      totalHunts: true,
      totalRareFinds: true,
      totalPvpWins: true,
      totalCoinsEarned: true,
    },
  });

  for (const p of rankedPlayers) {
    rankCounter++;
    archives.push({
      playerId: p.id,
      seasonId,
      seasonType: SEASON_TYPE,
      powerScore: p.powerScore,
      totalHunts: p.totalHunts,
      totalRareFinds: p.totalRareFinds,
      totalPvpWins: p.totalPvpWins,
      totalCoinsEarned: p.totalCoinsEarned,
      rank: rankCounter,
    });
  }

  if (archives.length > 0) {
    for (let i = 0; i < archives.length; i += LEADERBOARD_SEASON_BATCH) {
      const chunk = archives.slice(i, i + LEADERBOARD_SEASON_BATCH);
      await prisma.seasonArchive.createMany({ data: chunk, skipDuplicates: true });
    }
  }

  let resetCursor: string | undefined;
  for (;;) {
    const batch = await prisma.player.findMany({
      take: LEADERBOARD_SEASON_BATCH,
      ...(resetCursor ? { skip: 1, cursor: { id: resetCursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (batch.length === 0) break;

    await prisma.player.updateMany({
      where: { id: { in: batch.map((b) => b.id) } },
      data: {
        totalHunts: 0,
        totalRareFinds: 0,
        totalPvpWins: 0,
        totalCoinsEarned: 0,
        powerScore: 0,
      },
    });

    resetCursor = batch[batch.length - 1]!.id;
    if (batch.length < LEADERBOARD_SEASON_BATCH) break;
  }

  const endsAt = seasonEndDate();
  await prisma.season.upsert({
    where: { id: 'current' },
    update: { seasonId: currentSeasonId(), seasonType: SEASON_TYPE, startedAt: new Date(), endsAt },
    create: { id: 'current', seasonId: currentSeasonId(), seasonType: SEASON_TYPE, endsAt },
  });

  await clearLeaderboardRedisKeys(redis, seasonId);

  console.info(`[Leaderboard] Sezon arsivlendi: ${seasonId} (${archives.length} oyuncu)`);
  return seasonId;
}

export async function getCurrentSeason(prisma: PrismaClient): Promise<{
  seasonId: string;
  seasonType: string;
  startedAt: Date;
  endsAt: Date;
} | null> {
  return prisma.season.findUnique({ where: { id: 'current' } });
}

export async function getSeasonArchive(
  prisma: PrismaClient,
  seasonId: string,
  category: LeaderboardCategory,
  take = 10,
): Promise<{ rank: number; playerId: string; score: number }[]> {
  const scoreField = archiveScoreField(category);
  const rows = await prisma.seasonArchive.findMany({
    where: { seasonId },
    orderBy: [{ [scoreField]: 'desc' }],
    take,
    select: { rank: true, playerId: true, [scoreField]: true },
  });
  return rows.map((r) => ({
    rank: r.rank ?? 0,
    playerId: r.playerId ?? '',
    score: r[scoreField as keyof typeof r] as unknown as number,
  }));
}

function archiveScoreField(category: LeaderboardCategory): string {
  switch (category) {
    case 'power':  return 'powerScore';
    case 'hunt':   return 'totalHunts';
    case 'arena':  return 'totalPvpWins';
    case 'wealth': return 'totalCoinsEarned';
  }
}
