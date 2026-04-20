/**
 * leaderboard.ts — Liderboard sistemi ana giriş noktası
 *
 * Alt modüller:
 *   leaderboard-queries.ts  — DB sorguları (fetch*, getRankFromDB, getContextFromDB)
 *   leaderboard-season.ts   — Sezon yönetimi (archive, reset, getCurrentSeason)
 */

import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  LEADERBOARD_CACHE_TTL,
  LEADERBOARD_TOP_N,
  POWER_WEIGHT_LEVEL,
  POWER_WEIGHT_RARE,
  POWER_WEIGHT_XP,
} from '../config';
import { fetchFromDB, getRankFromDB, getContextFromDB } from './leaderboard-queries';
import { currentSeasonId, seasonCacheKey } from './leaderboard-season';

// ─── Re-export (dış bağımlılıklar için) ──────────────────────────────────────
export { currentSeasonId, seasonEndDate } from './leaderboard-season';
export {
  archiveAndResetSeason,
  getCurrentSeason,
  getSeasonArchive,
} from './leaderboard-season';

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type LeaderboardCategory = 'power' | 'hunt' | 'relic' | 'arena' | 'wealth';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  score: number;
  level: number;
  detail: string;
}

export interface LeaderboardResult {
  category: LeaderboardCategory;
  seasonId: string;
  entries: LeaderboardEntry[];
  viewerRank: number;
  viewerContext: LeaderboardEntry[];
  updatedAt: Date;
}

export interface RankChangeResult {
  oldRank: number;
  newRank: number;
  delta: number;
  category: LeaderboardCategory;
}

// ─── Güç skoru formülü ────────────────────────────────────────────────────────

export function calcPowerScore(level: number, totalXP: number, totalRareFinds: number): number {
  return Math.round(
    level * POWER_WEIGHT_LEVEL +
    totalXP * POWER_WEIGHT_XP +
    totalRareFinds * POWER_WEIGHT_RARE,
  );
}

// ─── Liderboard sorgusu ───────────────────────────────────────────────────────

export async function getLeaderboard(
  prisma: PrismaClient,
  redis: Redis,
  category: LeaderboardCategory,
  viewerId?: string,
): Promise<LeaderboardResult> {
  const key    = seasonCacheKey(category);
  const cached = await redis.get(key);

  let entries: LeaderboardEntry[];
  if (cached) {
    entries = JSON.parse(cached) as LeaderboardEntry[];
  } else {
    entries = await fetchFromDB(prisma, category);
    await redis.set(key, JSON.stringify(entries), 'EX', LEADERBOARD_CACHE_TTL);
  }

  let viewerRank    = -1;
  let viewerContext: LeaderboardEntry[] = [];

  if (viewerId) {
    const idx = entries.findIndex((e) => e.playerId === viewerId);
    if (idx !== -1) {
      viewerRank = entries[idx]!.rank;
      const start = Math.max(0, idx - 2);
      const end   = Math.min(entries.length, idx + 3);
      viewerContext = entries.slice(start, end);
    } else {
      viewerRank = await getRankFromDB(prisma, category, viewerId);
      if (viewerRank > 0) {
        viewerContext = await getContextFromDB(prisma, category, viewerId, viewerRank);
      }
    }
  }

  return {
    category,
    seasonId: currentSeasonId(),
    entries:  entries.slice(0, LEADERBOARD_TOP_N),
    viewerRank,
    viewerContext,
    updatedAt: new Date(),
  };
}

// ─── İstatistik güncelleme ────────────────────────────────────────────────────

export async function refreshPowerScore(prisma: PrismaClient, playerId: string): Promise<number> {
  const player = await prisma.player.findUnique({
    where:  { id: playerId },
    select: { level: true, xp: true, totalRareFinds: true },
  });
  if (!player) return 0;

  const { xpRequired } = await import('../utils/math');
  let totalXP = player.xp;
  for (let l = 1; l < player.level; l++) {
    totalXP += xpRequired(l);
  }

  const score = calcPowerScore(player.level, totalXP, player.totalRareFinds);
  await prisma.player.update({ where: { id: playerId }, data: { powerScore: score } });
  return score;
}

export async function recordHuntStats(
  prisma: PrismaClient,
  playerId: string,
  successCount: number,
  rareCount: number,
): Promise<void> {
  if (successCount <= 0 && rareCount <= 0) return;
  await prisma.player.update({
    where: { id: playerId },
    data: {
      totalHunts:     { increment: successCount },
      totalRareFinds: { increment: rareCount },
    },
  });
}

export async function recordPvpWin(prisma: PrismaClient, winnerId: string): Promise<void> {
  await prisma.player.update({
    where: { id: winnerId },
    data:  { totalPvpWins: { increment: 1 } },
  });
}

export async function recordCoinsEarned(
  prisma: PrismaClient,
  playerId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await prisma.player.update({
    where: { id: playerId },
    data:  { totalCoinsEarned: { increment: amount } },
  });
}

// ─── Rank değişim takibi ──────────────────────────────────────────────────────

export async function trackRankChange(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  category: LeaderboardCategory,
  action: () => Promise<void>,
): Promise<RankChangeResult | null> {
  const before = await getRankFromDB(prisma, category, playerId);
  await action();
  await redis.del(seasonCacheKey(category));
  const after = await getRankFromDB(prisma, category, playerId);

  if (before === -1 || after === -1) return null;
  return { oldRank: before, newRank: after, delta: before - after, category };
}

// ─── Cache temizleme ──────────────────────────────────────────────────────────

export async function invalidateLeaderboardCache(redis: Redis): Promise<void> {
  const categories: LeaderboardCategory[] = ['power', 'hunt', 'relic', 'arena', 'wealth'];
  await Promise.all(categories.map((c) => redis.del(seasonCacheKey(c))));
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

export async function backfillLeaderboardStats(
  prisma: PrismaClient,
): Promise<{ updated: number }> {
  const { xpRequired } = await import('../utils/math');

  const players = await prisma.player.findMany({
    select: {
      id: true, level: true, xp: true, coins: true, pvpCount: true,
      totalHunts: true, totalRareFinds: true, totalPvpWins: true,
      totalCoinsEarned: true, powerScore: true,
    },
  });

  let updated = 0;

  for (const p of players) {
    const patch: Record<string, number> = {};

    if (p.totalCoinsEarned === 0 && p.coins > 0)   patch.totalCoinsEarned = p.coins;
    if (p.totalPvpWins === 0 && p.pvpCount > 0)     patch.totalPvpWins    = Math.floor(p.pvpCount * 0.5);
    if (p.totalHunts === 0 && p.level > 1)          patch.totalHunts      = (p.level - 1) * 8;
    if (p.totalRareFinds === 0 && p.level > 1)      patch.totalRareFinds  = Math.floor((p.level - 1) * 0.5);

    if (p.powerScore === 0) {
      let totalXP = p.xp;
      for (let l = 1; l < p.level; l++) totalXP += xpRequired(l);
      patch.powerScore = calcPowerScore(p.level, totalXP, patch.totalRareFinds ?? p.totalRareFinds);
    }

    if (Object.keys(patch).length > 0) {
      await prisma.player.update({ where: { id: p.id }, data: patch });
      updated++;
    }
  }

  return { updated };
}
