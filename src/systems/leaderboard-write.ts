/**
 * leaderboard-write.ts — Tek yazım yolu: ZSET + PG write-behind
 */
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  LEADERBOARD_SNAPSHOT_TOP_100,
  LEADERBOARD_SNAPSHOT_TOP_1000,
  LEADERBOARD_TOP_N,
} from '../config';
import {
  activePeriods,
  GLOBAL_SCOPE,
  guildScopeId,
  legacyZsetKey,
  zsetKey,
} from './leaderboard-keys';
import { invalidateAllSnapshotsForCategory } from './leaderboard-cache';
import type { LeaderboardCategory } from './leaderboard-types';
import { requestRoleSync } from '../jobs/background-jobs';
import { banKey } from '../utils/admin-access';

const ROLE_SYNC_CATEGORIES = new Set<LeaderboardCategory>(['power', 'arena', 'wealth']);

export interface ScoreUpdate {
  category: LeaderboardCategory;
  score: number;
}

const SNAPSHOT_TOP_NS = [LEADERBOARD_TOP_N, LEADERBOARD_SNAPSHOT_TOP_100, LEADERBOARD_SNAPSHOT_TOP_1000];

async function upsertLeaderboardScorePg(
  prisma: PrismaClient,
  scope: string,
  category: LeaderboardCategory,
  period: string,
  playerId: string,
  score: number,
): Promise<void> {
  if (score <= 0) return;
  try {
    await prisma.leaderboardScore.upsert({
      where: {
        scope_category_period_playerId: {
          scope,
          category,
          period,
          playerId,
        },
      },
      create: {
        scope,
        category,
        period,
        playerId,
        score: BigInt(Math.min(score, Number.MAX_SAFE_INTEGER)),
      },
      update: {
        score: BigInt(Math.min(score, Number.MAX_SAFE_INTEGER)),
      },
    });
  } catch {
    /* write-behind — ZSET authoritative */
  }
}

export async function syncLeaderboardScores(
  redis: Redis,
  prisma: PrismaClient,
  opts: {
    playerId: string;
    guildId?: string | null;
    updates: ScoreUpdate[];
  },
): Promise<void> {
  const { playerId, guildId, updates } = opts;
  if (updates.length === 0) return;
  const banned = await redis.get(banKey(playerId));
  if (banned) return;

  const periods = activePeriods();
  const periodValues = [periods.season, periods.week, periods.month, periods.alltime];
  const scopes = [GLOBAL_SCOPE];
  if (guildId) scopes.push(guildScopeId(guildId));

  const pipeline = redis.pipeline();
  const invalidateTargets: Array<{ scopeId: string; category: LeaderboardCategory }> = [];

  for (const { category, score } of updates) {
    if (!Number.isFinite(score)) continue;
    const safeScore = Math.max(0, Math.round(score));

    for (const scopeId of scopes) {
      for (const period of periodValues) {
        pipeline.zadd(zsetKey(scopeId, category, period), safeScore, playerId);
      }
      pipeline.zadd(legacyZsetKey(category), safeScore, playerId);
      invalidateTargets.push({ scopeId, category });
    }

    for (const scopeId of scopes) {
      for (const period of periodValues) {
        void upsertLeaderboardScorePg(prisma, scopeId, category, period, playerId, safeScore);
      }
    }
  }

  await pipeline.exec();

  await Promise.all(
    invalidateTargets.map(({ scopeId, category }) =>
      invalidateAllSnapshotsForCategory(redis, scopeId, category, periodValues, SNAPSHOT_TOP_NS),
    ),
  );

  if (updates.some((u) => ROLE_SYNC_CATEGORIES.has(u.category))) {
    await requestRoleSync(redis);
  }
}

export async function removePlayerFromScopeZsets(
  redis: Redis,
  scopeId: string,
  playerId: string,
): Promise<void> {
  const categories: LeaderboardCategory[] = ['power', 'hunt', 'arena', 'wealth'];
  const periodValues = Object.values(activePeriods());
  const pipeline = redis.pipeline();
  for (const category of categories) {
    for (const period of periodValues) {
      pipeline.zrem(zsetKey(scopeId, category, period), playerId);
    }
    pipeline.zrem(legacyZsetKey(category), playerId);
  }
  await pipeline.exec();
}

export async function removeBannedPlayerFromLeaderboards(redis: Redis, playerId: string): Promise<void> {
  await removePlayerFromScopeZsets(redis, GLOBAL_SCOPE, playerId);
}
