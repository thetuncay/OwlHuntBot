/**
 * leaderboard-season.ts — Sezon yönetimi
 *
 * Sorumluluklar:
 *   - Sezon ID üretimi (currentSeasonId)
 *   - Sezon bitiş tarihi (seasonEndDate)
 *   - Sezon arşivleme ve sıfırlama (archiveAndResetSeason)
 *   - Sezon sorgulama (getCurrentSeason, getSeasonArchive)
 */

import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { SEASON_TYPE } from '../config';
import type { LeaderboardCategory } from './leaderboard';

// ─── Sezon ID ─────────────────────────────────────────────────────────────────

export function currentSeasonId(type: 'weekly' | 'monthly' = SEASON_TYPE): string {
  const now = new Date();
  if (type === 'monthly') {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  // ISO hafta numarası
  const d      = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo    = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ─── Sezon bitiş tarihi ───────────────────────────────────────────────────────

export function seasonEndDate(type: 'weekly' | 'monthly' = SEASON_TYPE): Date {
  const now = new Date();
  if (type === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  const d   = new Date(now);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (8 - day));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Cache key yardımcısı ─────────────────────────────────────────────────────

export const seasonCacheKey = (category: LeaderboardCategory): string =>
  `lb:${category}:${currentSeasonId()}`;

// ─── Sezon arşivleme ──────────────────────────────────────────────────────────

/**
 * Mevcut sezonu arşivler ve liderboard sayaçlarını sıfırlar.
 * Oyuncu ilerlemesi (level, xp, coins, owls) KORUNUR.
 */
export async function archiveAndResetSeason(prisma: PrismaClient, redis: Redis): Promise<string> {
  const seasonId = currentSeasonId();

  const players = await prisma.player.findMany({
    select: {
      id: true, powerScore: true, totalHunts: true,
      totalRareFinds: true, totalPvpWins: true, totalCoinsEarned: true,
    },
    orderBy: [{ powerScore: 'desc' }],
  });

  const archives = players.map((p, i) => ({
    playerId:        p.id,
    seasonId,
    seasonType:      SEASON_TYPE,
    powerScore:      p.powerScore,
    totalHunts:      p.totalHunts,
    totalRareFinds:  p.totalRareFinds,
    totalPvpWins:    p.totalPvpWins,
    totalCoinsEarned: p.totalCoinsEarned,
    rank: i + 1,
  }));

  if (archives.length > 0) {
    await prisma.seasonArchive.createMany({ data: archives });
  }

  if (players.length > 0) {
    await prisma.player.updateMany({
      data: {
        totalHunts: 0, totalRareFinds: 0,
        totalPvpWins: 0, totalCoinsEarned: 0, powerScore: 0,
      },
    });
  }

  const endsAt = seasonEndDate();
  await prisma.season.upsert({
    where:  { id: 'current' },
    update: { seasonId: currentSeasonId(), seasonType: SEASON_TYPE, startedAt: new Date(), endsAt },
    create: { id: 'current', seasonId: currentSeasonId(), seasonType: SEASON_TYPE, endsAt },
  });

  const categories: LeaderboardCategory[] = ['power', 'hunt', 'relic', 'arena', 'wealth'];
  await Promise.all(categories.map((c) => redis.del(seasonCacheKey(c))));

  console.info(`[Leaderboard] Sezon arsivlendi: ${seasonId} (${players.length} oyuncu)`);
  return seasonId;
}

// ─── Sezon sorgulama ──────────────────────────────────────────────────────────

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
    where:   { seasonId },
    orderBy: [{ [scoreField]: 'desc' }],
    take,
    select:  { rank: true, playerId: true, [scoreField]: true },
  });
  return rows.map((r) => ({
    rank:     r.rank ?? 0,
    playerId: r.playerId ?? '',
    score:    r[scoreField as keyof typeof r] as unknown as number,
  }));
}

function archiveScoreField(category: LeaderboardCategory): string {
  switch (category) {
    case 'power':  return 'powerScore';
    case 'hunt':   return 'totalHunts';
    case 'relic':  return 'totalRareFinds';
    case 'arena':  return 'totalPvpWins';
    case 'wealth': return 'totalCoinsEarned';
  }
}
