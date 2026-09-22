/**
 * leaderboard.ts — Liderboard ana API (ZSET + snapshot cache)
 */
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  LEADERBOARD_SNAPSHOT_TOP_100,
  LEADERBOARD_SNAPSHOT_TOP_1000,
  LEADERBOARD_TOP_N,
  POWER_WEIGHT_LEVEL,
  POWER_WEIGHT_RARE,
  POWER_WEIGHT_XP,
} from '../config';
import {
  activePeriods,
  currentSeasonPeriodId,
  GLOBAL_SCOPE,
  guildScopeId,
  zsetKey,
  ALL_CATEGORIES,
  legacySeasonSnapshotKey,
} from './leaderboard-keys';
import { getContextFromDB } from './leaderboard-queries';
import {
  calcNetWealthScore,
  calcPowerScore,
  wealthLeaderboardScore,
  cappedHuntScoreIncrement,
  cappedWealthScoreIncrement,
} from './leaderboard-scoring';
import { rebuildZsetForScopePeriod } from './leaderboard-rebuild';
import { syncLeaderboardScores } from './leaderboard-write';
import { xpRequired } from '../utils/math.js';

export type {
  LeaderboardCategory,
  LeaderboardEntry,
  LeaderboardResult,
  LeaderboardScopeMode,
  LeaderboardPeriodMode,
  GetLeaderboardOptions,
  RankChangeResult,
} from './leaderboard-types';

export {
  calcPowerScore,
  calcNetWealthScore,
} from './leaderboard-scoring';

export { currentSeasonId, seasonEndDate } from './leaderboard-season';
export {
  archiveAndResetSeason,
  getCurrentSeason,
  getSeasonArchive,
} from './leaderboard-season';

export { rebuildAllLeaderboardZsets } from './leaderboard-rebuild';

import type {
  GetLeaderboardOptions,
  LeaderboardCategory,
  LeaderboardPeriodMode,
  LeaderboardResult,
  LeaderboardScopeMode,
  RankChangeResult,
} from './leaderboard-types';
import { getOrBuildSnapshot, invalidateAllSnapshotsForCategory } from './leaderboard-cache';
import { seasonCacheKey } from './leaderboard-season';
import { banKey } from '../utils/admin-access';

function resolveScopeId(scope: LeaderboardScopeMode, guildId?: string | null): string {
  if (scope === 'guild' && guildId) return guildScopeId(guildId);
  return GLOBAL_SCOPE;
}

function resolvePeriodId(period: LeaderboardPeriodMode): string {
  const p = activePeriods();
  switch (period) {
    case 'week': return p.week;
    case 'month': return p.month;
    case 'alltime': return p.alltime;
    case 'season':
    default:
      return p.season;
  }
}

function scopeLabel(scope: LeaderboardScopeMode, guildId?: string | null): string {
  if (scope === 'guild' && guildId) return 'Sunucu sıralaması';
  return 'Global sıralama';
}

export async function getRankFromSortedSet(
  redis: Redis,
  prisma: PrismaClient,
  category: LeaderboardCategory,
  playerId: string,
  scopeId = GLOBAL_SCOPE,
  period?: string,
): Promise<number> {
  const periodId = period ?? resolvePeriodId('season');
  const zKey = zsetKey(scopeId, category, periodId);
  const rank = await redis.zrevrank(zKey, playerId);
  if (rank !== null) return rank + 1;

  await rebuildZsetForScopePeriod(redis, prisma, scopeId, category, periodId);
  const rankAfter = await redis.zrevrank(zKey, playerId);
  return rankAfter !== null ? rankAfter + 1 : -1;
}

export async function getLeaderboard(
  prisma: PrismaClient,
  redis: Redis,
  category: LeaderboardCategory,
  viewerIdOrOptions?: string | GetLeaderboardOptions,
): Promise<LeaderboardResult> {
  const opts: GetLeaderboardOptions =
    typeof viewerIdOrOptions === 'string'
      ? { viewerId: viewerIdOrOptions }
      : viewerIdOrOptions ?? {};

  const scope: LeaderboardScopeMode = opts.scope ?? 'global';
  const periodMode: LeaderboardPeriodMode = opts.period ?? 'season';
  const scopeId = resolveScopeId(scope, opts.guildId);
  const periodId = resolvePeriodId(periodMode);
  const viewerId = opts.viewerId;

  const rebuildIfEmpty = async (): Promise<void> => {
    await rebuildZsetForScopePeriod(redis, prisma, scopeId, category, periodId);
  };

  if (opts.fresh) {
    await invalidateAllSnapshotsForCategory(redis, scopeId, category, [periodId], [
      LEADERBOARD_TOP_N,
      LEADERBOARD_SNAPSHOT_TOP_100,
      LEADERBOARD_SNAPSHOT_TOP_1000,
    ]);
  }

  const entriesRaw = await getOrBuildSnapshot(
    redis,
    prisma,
    scopeId,
    category,
    periodId,
    LEADERBOARD_SNAPSHOT_TOP_100,
    rebuildIfEmpty,
  );

  const banFlags = await Promise.all(
    entriesRaw.map((e) => redis.exists(banKey(e.playerId))),
  );
  const entries = entriesRaw
    .filter((_, i) => banFlags[i] !== 1)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  let viewerRank = -1;
  let viewerContext: LeaderboardResult['viewerContext'] = [];

  if (viewerId) {
    const idx = entries.findIndex((e) => e.playerId === viewerId);
    if (idx !== -1) {
      viewerRank = entries[idx]!.rank;
      const start = Math.max(0, idx - 2);
      const end = Math.min(entries.length, idx + 3);
      viewerContext = entries.slice(start, end);
    } else {
      viewerRank = await getRankFromSortedSet(redis, prisma, category, viewerId, scopeId, periodId);
      if (viewerRank > 0) {
        viewerContext = await getContextFromDB(prisma, category, viewerId, viewerRank);
      }
    }
  }

  return {
    category,
    seasonId: currentSeasonPeriodId(),
    scope,
    period: periodMode,
    scopeLabel: scopeLabel(scope, opts.guildId),
    entries: entries.slice(0, LEADERBOARD_TOP_N),
    viewerRank,
    viewerContext,
    updatedAt: new Date(),
  };
}

export async function refreshPowerScore(prisma: PrismaClient, playerId: string): Promise<number> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { level: true, totalXP: true, totalRareFinds: true },
  });
  if (!player) return 0;

  const score = calcPowerScore(player.level, player.totalXP, player.totalRareFinds);
  await prisma.player.update({ where: { id: playerId }, data: { powerScore: score } });
  return score;
}

export async function recordHuntStats(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  successCount: number,
  rareCount: number,
  guildId?: string | null,
): Promise<void> {
  if (successCount <= 0 && rareCount <= 0) return;

  const huntIncrement = await cappedHuntScoreIncrement(redis, playerId, successCount);

  const updated = await prisma.player.update({
    where: { id: playerId },
    data: {
      totalHunts: { increment: huntIncrement },
      totalRareFinds: { increment: rareCount },
    },
    select: {
      totalHunts: true,
      totalRareFinds: true,
      powerScore: true,
    },
  });

  let powerScore = updated.powerScore;
  if (rareCount > 0) {
    powerScore = await refreshPowerScore(prisma, playerId);
  }

  await syncLeaderboardScores(redis, prisma, {
    playerId,
    guildId,
    updates: [
      { category: 'hunt', score: updated.totalHunts },
      { category: 'power', score: powerScore },
    ],
  });
}

export async function recordPvpWin(
  prisma: PrismaClient,
  winnerId: string,
  redis: Redis,
  guildId?: string | null,
): Promise<void> {
  const updated = await prisma.player.update({
    where: { id: winnerId },
    data: { totalPvpWins: { increment: 1 } },
    select: { totalPvpWins: true },
  });

  await syncLeaderboardScores(redis, prisma, {
    playerId: winnerId,
    guildId,
    updates: [{ category: 'arena', score: updated.totalPvpWins }],
  });
}

/** Net servet akışı — pozitif kazanç, negatif kayıp */
export async function recordWealthDelta(
  prisma: PrismaClient,
  redis: Redis | undefined,
  playerId: string,
  delta: number,
  guildId?: string | null,
): Promise<void> {
  if (delta === 0) return;

  let cappedDelta = delta;
  if (delta > 0 && redis) {
    cappedDelta = await cappedWealthScoreIncrement(redis, playerId, delta);
    if (cappedDelta <= 0) return;
  }

  const data =
    cappedDelta > 0
      ? { totalCoinsEarned: { increment: cappedDelta } }
      : { totalCoinsLost: { increment: -cappedDelta } };

  const updated = await prisma.player.update({
    where: { id: playerId },
    data,
    select: { totalCoinsEarned: true, totalCoinsLost: true, coins: true },
  });

  if (!redis) return;

  const score = wealthLeaderboardScore(
    updated.totalCoinsEarned,
    updated.totalCoinsLost,
    updated.coins,
  );

  await syncLeaderboardScores(redis, prisma, {
    playerId,
    guildId,
    updates: [{ category: 'wealth', score }],
  });
}

/** @deprecated recordWealthDelta kullan */
export async function recordCoinsEarned(
  prisma: PrismaClient,
  playerId: string,
  amount: number,
  redis?: Redis,
  guildId?: string | null,
): Promise<void> {
  if (amount <= 0 || !redis) return;
  await recordWealthDelta(prisma, redis, playerId, amount, guildId);
}

export async function trackRankChange(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  category: LeaderboardCategory,
  action: () => Promise<void>,
): Promise<RankChangeResult | null> {
  const before = await getRankFromSortedSet(redis, prisma, category, playerId);
  await action();
  const periods = Object.values(activePeriods());
  await invalidateAllSnapshotsForCategory(redis, GLOBAL_SCOPE, category, periods, [LEADERBOARD_TOP_N]);
  const after = await getRankFromSortedSet(redis, prisma, category, playerId);

  if (before === -1 || after === -1) return null;
  return { oldRank: before, newRank: after, delta: before - after, category };
}

export async function invalidateLeaderboardCache(redis: Redis): Promise<void> {
  const periods = Object.values(activePeriods());
  await Promise.all(
    ALL_CATEGORIES.flatMap((c) => [
      invalidateAllSnapshotsForCategory(redis, GLOBAL_SCOPE, c, periods, [
        LEADERBOARD_TOP_N,
        LEADERBOARD_SNAPSHOT_TOP_100,
      ]),
      redis.del(seasonCacheKey(c)),
      redis.del(legacySeasonSnapshotKey(c, currentSeasonPeriodId())),
    ]),
  );
}

export async function backfillLeaderboardStats(
  prisma: PrismaClient,
  redis?: Redis,
): Promise<{ updated: number }> {
  const players = await prisma.player.findMany({
    select: {
      id: true, level: true, xp: true, coins: true, pvpCount: true,
      totalHunts: true, totalRareFinds: true, totalPvpWins: true,
      totalCoinsEarned: true, totalCoinsLost: true, powerScore: true, totalXP: true,
    },
  });

  let updated = 0;

  for (const p of players) {
    const patch: Record<string, number> = {};

    const earnedBefore = p.totalCoinsEarned;
    const lostBefore = p.totalCoinsLost;
    const netBefore = calcNetWealthScore(earnedBefore, lostBefore);
    if (p.coins > netBefore) {
      patch.totalCoinsEarned = p.coins + lostBefore;
    } else if (earnedBefore === 0 && p.coins > 0) {
      patch.totalCoinsEarned = p.coins;
    }
    if (p.totalPvpWins === 0 && p.pvpCount > 0) patch.totalPvpWins = Math.floor(p.pvpCount * 0.5);
    if (p.totalHunts === 0 && p.level > 1) patch.totalHunts = (p.level - 1) * 8;
    if (p.totalRareFinds === 0 && p.level > 1) patch.totalRareFinds = Math.floor((p.level - 1) * 0.5);

    if (p.totalXP === 0) {
      let computedTotalXP = p.xp;
      for (let l = 1; l < p.level; l++) computedTotalXP += xpRequired(l);
      patch.totalXP = computedTotalXP;
    }

    if (p.powerScore === 0) {
      const totalXPForScore = patch.totalXP ?? p.totalXP;
      patch.powerScore = calcPowerScore(p.level, totalXPForScore, patch.totalRareFinds ?? p.totalRareFinds);
    }

    if (Object.keys(patch).length > 0) {
      await prisma.player.update({ where: { id: p.id }, data: patch });
      updated++;
    }
  }

  if (redis) {
    const { rebuildAllLeaderboardZsets } = await import('./leaderboard-rebuild.js');
    await rebuildAllLeaderboardZsets(redis, prisma);
  }

  return { updated };
}

// Re-export weights for tests
export { POWER_WEIGHT_LEVEL, POWER_WEIGHT_RARE, POWER_WEIGHT_XP };
