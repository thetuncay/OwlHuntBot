/**
 * leaderboard-queries.ts — DB sorgu katmanı
 *
 * Sorumluluklar:
 *   - Kategori bazlı DB sorguları (fetchPower/Hunt/Relic/Arena/Wealth)
 *   - Rank hesaplama (getRankFromDB)
 *   - Bağlam satırları (getContextFromDB)
 *   - Yardımcı fonksiyonlar (categoryScoreField, buildDetail)
 */

import type { PrismaClient } from '@prisma/client';
import type { LeaderboardCategory, LeaderboardEntry } from './leaderboard.ts.bak';

// ─── Kategori → DB alan adı ───────────────────────────────────────────────────

export function categoryScoreField(category: LeaderboardCategory): string {
  switch (category) {
    case 'power':  return 'powerScore';
    case 'hunt':   return 'totalHunts';
    case 'relic':  return 'totalRareFinds';
    case 'arena':  return 'totalPvpWins';
    case 'wealth': return 'totalCoinsEarned';
  }
}

// ─── Detay metni ──────────────────────────────────────────────────────────────

export function buildDetail(
  category: LeaderboardCategory,
  r: {
    level: number; xp: number;
    totalHunts: number; totalRareFinds: number;
    totalPvpWins: number; pvpCount: number;
    totalCoinsEarned: number; coins: number;
  },
): string {
  switch (category) {
    case 'power':  return `Lv.${r.level} · ${r.xp.toLocaleString('tr-TR')} XP`;
    case 'hunt':   return `${r.totalHunts.toLocaleString('tr-TR')} av`;
    case 'relic':  return `${r.totalRareFinds.toLocaleString('tr-TR')} nadir`;
    case 'arena': {
      const wr = r.pvpCount > 0 ? Math.round((r.totalPvpWins / r.pvpCount) * 100) : 0;
      return `${r.totalPvpWins}G / ${r.pvpCount}M · %${wr}`;
    }
    case 'wealth': return `${r.totalCoinsEarned.toLocaleString('tr-TR')} toplam`;
  }
}

// ─── Kategori sorguları ───────────────────────────────────────────────────────

export async function fetchFromDB(
  prisma: PrismaClient,
  category: LeaderboardCategory,
): Promise<LeaderboardEntry[]> {
  switch (category) {
    case 'power':  return fetchPower(prisma);
    case 'hunt':   return fetchHunt(prisma);
    case 'relic':  return fetchRelic(prisma);
    case 'arena':  return fetchArena(prisma);
    case 'wealth': return fetchWealth(prisma);
  }
}

async function fetchPower(prisma: PrismaClient): Promise<LeaderboardEntry[]> {
  const rows = await prisma.player.findMany({
    orderBy: [{ level: 'desc' }, { xp: 'desc' }],
    take: 100,
    select: {
      id: true, powerScore: true, level: true, xp: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    playerId: r.id,
    displayName: r.registrations[0]?.displayName ?? r.registrations[0]?.username ?? 'Oyuncu',
    score: r.powerScore,
    level: r.level,
    detail: `Lv.${r.level} · ${r.xp.toLocaleString('tr-TR')} XP`,
  }));
}

async function fetchHunt(prisma: PrismaClient): Promise<LeaderboardEntry[]> {
  const rows = await prisma.player.findMany({
    orderBy: [{ totalHunts: 'desc' }, { level: 'desc' }],
    take: 100,
    select: {
      id: true, totalHunts: true, level: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    playerId: r.id,
    displayName: r.registrations[0]?.displayName ?? r.registrations[0]?.username ?? 'Oyuncu',
    score: r.totalHunts,
    level: r.level,
    detail: `${r.totalHunts.toLocaleString('tr-TR')} av`,
  }));
}

async function fetchRelic(prisma: PrismaClient): Promise<LeaderboardEntry[]> {
  const rows = await prisma.player.findMany({
    orderBy: [{ totalRareFinds: 'desc' }],
    take: 100,
    select: {
      id: true, totalRareFinds: true, level: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    playerId: r.id,
    displayName: r.registrations[0]?.displayName ?? r.registrations[0]?.username ?? 'Oyuncu',
    score: r.totalRareFinds,
    level: r.level,
    detail: `${r.totalRareFinds.toLocaleString('tr-TR')} nadir`,
  }));
}

async function fetchArena(prisma: PrismaClient): Promise<LeaderboardEntry[]> {
  const rows = await prisma.player.findMany({
    orderBy: [{ totalPvpWins: 'desc' }, { pvpCount: 'desc' }],
    take: 100,
    select: {
      id: true, totalPvpWins: true, pvpCount: true, level: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });
  return rows.map((r, i) => {
    const score   = r.totalPvpWins > 0 ? r.totalPvpWins : Math.floor(r.pvpCount * 0.5);
    const winRate = r.pvpCount > 0 ? Math.round((score / r.pvpCount) * 100) : 0;
    return {
      rank: i + 1,
      playerId: r.id,
      displayName: r.registrations[0]?.displayName ?? r.registrations[0]?.username ?? 'Oyuncu',
      score,
      level: r.level,
      detail: `${score}G / ${r.pvpCount}M · %${winRate}`,
    };
  });
}

async function fetchWealth(prisma: PrismaClient): Promise<LeaderboardEntry[]> {
  const rows = await prisma.player.findMany({
    orderBy: [{ coins: 'desc' }],
    take: 100,
    select: {
      id: true, totalCoinsEarned: true, coins: true, level: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });
  return rows.map((r, i) => {
    const score = r.totalCoinsEarned > 0 ? r.totalCoinsEarned : r.coins;
    return {
      rank: i + 1,
      playerId: r.id,
      displayName: r.registrations[0]?.displayName ?? r.registrations[0]?.username ?? 'Oyuncu',
      score,
      level: r.level,
      detail: `${score.toLocaleString('tr-TR')} 💰`,
    };
  });
}

// ─── Rank hesaplama ───────────────────────────────────────────────────────────

export async function getRankFromDB(
  prisma: PrismaClient,
  category: LeaderboardCategory,
  playerId: string,
): Promise<number> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { powerScore: true, totalHunts: true, totalRareFinds: true, totalPvpWins: true, totalCoinsEarned: true },
  });
  if (!player) return -1;

  const scoreField = categoryScoreField(category);
  const score      = player[scoreField as keyof typeof player] as number;
  const above      = await prisma.player.count({ where: { [scoreField]: { gt: score } } });
  return above + 1;
}

// ─── Bağlam satırları (±2) ────────────────────────────────────────────────────

const CONTEXT_SELECT = {
  id: true,
  powerScore: true, totalHunts: true, totalRareFinds: true,
  totalPvpWins: true, totalCoinsEarned: true,
  pvpCount: true, level: true, xp: true, coins: true,
  registrations: { select: { displayName: true, username: true }, take: 1 },
} as const;

export async function getContextFromDB(
  prisma: PrismaClient,
  category: LeaderboardCategory,
  viewerId: string,
  viewerRank: number,
): Promise<LeaderboardEntry[]> {
  const scoreField = categoryScoreField(category);
  const viewer     = await prisma.player.findUnique({ where: { id: viewerId }, select: CONTEXT_SELECT });
  if (!viewer) return [];

  const viewerScore = viewer[scoreField as keyof typeof viewer] as number;

  const [above, below] = await Promise.all([
    prisma.player.findMany({
      where: { [scoreField]: { gt: viewerScore }, id: { not: viewerId } },
      orderBy: [{ [scoreField]: 'asc' }],
      take: 2,
      select: CONTEXT_SELECT,
    }),
    prisma.player.findMany({
      where: { [scoreField]: { lt: viewerScore }, id: { not: viewerId } },
      orderBy: [{ [scoreField]: 'desc' }],
      take: 2,
      select: CONTEXT_SELECT,
    }),
  ]);

  const allRows = [
    ...above.reverse().map((r, i) => ({ r, rank: viewerRank - (above.length - i) })),
    { r: viewer, rank: viewerRank },
    ...below.map((r, i) => ({ r, rank: viewerRank + i + 1 })),
  ];

  return allRows.map(({ r, rank }) => ({
    rank,
    playerId: r.id,
    displayName: r.registrations[0]?.displayName ?? r.registrations[0]?.username ?? 'Oyuncu',
    score: r[scoreField as keyof typeof r] as number,
    level: r.level,
    detail: buildDetail(category, r as Parameters<typeof buildDetail>[1]),
  }));
}
