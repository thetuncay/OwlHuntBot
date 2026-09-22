/**
 * leaderboard-rebuild.ts — ZSET tam rebuild (top-100 seed değil)
 */
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { LEADERBOARD_REBUILD_BATCH } from '../config';
import {
  activePeriods,
  ALL_CATEGORIES,
  GLOBAL_SCOPE,
  guildScopeId,
  legacyZsetKey,
  zsetKey,
} from './leaderboard-keys';
import { categoryScoreField, playerScoreForCategory } from './leaderboard-queries';
import type { LeaderboardCategory } from './leaderboard-types';

export async function rebuildZsetForScopePeriod(
  redis: Redis,
  prisma: PrismaClient,
  scopeId: string,
  category: LeaderboardCategory,
  period: string,
): Promise<number> {
  const zKey = zsetKey(scopeId, category, period);
  await redis.del(zKey);

  let cursor: string | undefined;
  let total = 0;

  for (;;) {
    const batch = await prisma.player.findMany({
      take: LEADERBOARD_REBUILD_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        powerScore: true,
        totalHunts: true,
        totalRareFinds: true,
        totalPvpWins: true,
        totalCoinsEarned: true,
        totalCoinsLost: true,
        level: true,
        xp: true,
        coins: true,
        pvpCount: true,
      },
    });
    if (batch.length === 0) break;

    const pipeline = redis.pipeline();
    for (const player of batch) {
      const score = playerScoreForCategory(category, player);
      if (score > 0) {
        pipeline.zadd(zKey, score, player.id);
        total++;
      }
    }
    await pipeline.exec();

    cursor = batch[batch.length - 1]!.id;
    if (batch.length < LEADERBOARD_REBUILD_BATCH) break;
  }

  return total;
}

export async function rebuildAllLeaderboardZsets(
  redis: Redis,
  prisma: PrismaClient,
  opts: { scopeId?: string; includeLegacy?: boolean } = {},
): Promise<{ keys: number; members: number }> {
  const scopeId = opts.scopeId ?? GLOBAL_SCOPE;
  const periods = activePeriods();
  const periodValues = [periods.season, periods.week, periods.month, periods.alltime];
  let keys = 0;
  let members = 0;

  for (const category of ALL_CATEGORIES) {
    for (const period of periodValues) {
      members += await rebuildZsetForScopePeriod(redis, prisma, scopeId, category, period);
      keys++;
    }
    if (opts.includeLegacy !== false) {
      await redis.del(legacyZsetKey(category));
      const players = await prisma.player.findMany({
        select: {
          id: true,
          powerScore: true,
          totalHunts: true,
          totalRareFinds: true,
          totalPvpWins: true,
          totalCoinsEarned: true,
          totalCoinsLost: true,
          level: true,
          xp: true,
          coins: true,
          pvpCount: true,
        },
      });
      const pipeline = redis.pipeline();
      for (const p of players) {
        const score = playerScoreForCategory(category, p);
        if (score > 0) pipeline.zadd(legacyZsetKey(category), score, p.id);
      }
      await pipeline.exec();
    }
  }

  return { keys, members };
}

export async function rebuildGuildScopeFromRegistrations(
  redis: Redis,
  prisma: PrismaClient,
  guildId: string,
): Promise<number> {
  const scopeId = guildScopeId(guildId);
  const regs = await prisma.playerRegistration.findMany({
    where: { guildId },
    select: { userId: true },
  });
  if (regs.length === 0) return 0;

  const playerIds = regs.map((r) => r.userId);
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: {
      id: true,
      powerScore: true,
      totalHunts: true,
      totalRareFinds: true,
      totalPvpWins: true,
      totalCoinsEarned: true,
      totalCoinsLost: true,
      level: true,
      xp: true,
      coins: true,
      pvpCount: true,
    },
  });

  const periods = activePeriods();
  const periodValues = [periods.season, periods.week, periods.month, periods.alltime];
  let count = 0;

  for (const category of ALL_CATEGORIES) {
    for (const period of periodValues) {
      const zKey = zsetKey(scopeId, category, period);
      await redis.del(zKey);
      const pipeline = redis.pipeline();
      for (const p of players) {
        const score = playerScoreForCategory(category, p);
        if (score > 0) {
          pipeline.zadd(zKey, score, p.id);
          count++;
        }
      }
      await pipeline.exec();
    }
  }
  return count;
}
