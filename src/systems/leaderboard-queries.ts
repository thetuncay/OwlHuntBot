/**
 * leaderboard-queries.ts — DB sorgu katmanı + skor hesaplama
 */
import type { PrismaClient } from '@prisma/client';
import { formatCoinLabel } from '../config/ui-emojis';
import { resolvePlayerDisplayName } from '../utils/player-display-name';
import { wealthLeaderboardScore } from './leaderboard-scoring';
import type { LeaderboardCategory, LeaderboardEntry } from './leaderboard-types';

export function categoryScoreField(category: LeaderboardCategory): string {
  switch (category) {
    case 'power':  return 'powerScore';
    case 'hunt':   return 'totalHunts';
    case 'arena':  return 'totalPvpWins';
    case 'wealth': return 'coins';
  }
}

export type PlayerScoreRow = {
  id: string;
  powerScore: number;
  totalHunts: number;
  totalRareFinds: number;
  totalPvpWins: number;
  totalCoinsEarned: number;
  totalCoinsLost: number;
  level: number;
  xp: number;
  coins: number;
  pvpCount: number;
};

export function playerScoreForCategory(category: LeaderboardCategory, r: PlayerScoreRow): number {
  switch (category) {
    case 'power':
      return r.powerScore;
    case 'hunt':
      return r.totalHunts;
    case 'arena':
      return r.totalPvpWins > 0 ? r.totalPvpWins : Math.floor(r.pvpCount * 0.5);
    case 'wealth':
      return wealthLeaderboardScore(r.totalCoinsEarned, r.totalCoinsLost, r.coins);
  }
}

export function buildDetail(
  category: LeaderboardCategory,
  r: {
    level: number; xp: number;
    totalHunts: number; totalRareFinds: number;
    totalPvpWins: number; pvpCount: number;
    totalCoinsEarned: number; totalCoinsLost: number; coins: number;
  },
): string {
  switch (category) {
    case 'power':  return `Lv.${r.level} · ${r.xp.toLocaleString('tr-TR')} XP`;
    case 'hunt':   return `${r.totalHunts.toLocaleString('tr-TR')} av`;
    case 'arena': {
      const matches = r.pvpCount;
      const wins = r.totalPvpWins;
      const losses = Math.max(0, matches - wins);
      const kd = losses > 0 ? (wins / losses).toFixed(2) : wins > 0 ? wins.toFixed(2) : '0.00';
      return `${wins}G / ${matches}M · ${kd} K/D`;
    }
    case 'wealth': {
      const shown = wealthLeaderboardScore(r.totalCoinsEarned, r.totalCoinsLost, r.coins);
      return formatCoinLabel(shown);
    }
  }
}

const ENTRY_SELECT = {
  id: true,
  leaderboardName: true,
  powerScore: true,
  totalHunts: true,
  totalRareFinds: true,
  totalPvpWins: true,
  totalCoinsEarned: true,
  totalCoinsLost: true,
  pvpCount: true,
  level: true,
  xp: true,
  coins: true,
  registrations: { select: { displayName: true, username: true }, take: 1 },
} as const;

type EntryRow = {
  id: string;
  leaderboardName: string | null;
  powerScore: number;
  totalHunts: number;
  totalRareFinds: number;
  totalPvpWins: number;
  totalCoinsEarned: number;
  totalCoinsLost: number;
  pvpCount: number;
  level: number;
  xp: number;
  coins: number;
  registrations: { displayName: string | null; username: string }[];
};

function rowToEntry(r: EntryRow, rank: number, category: LeaderboardCategory): LeaderboardEntry {
  const score = playerScoreForCategory(category, r);
  return {
    rank,
    playerId: r.id,
    displayName: resolvePlayerDisplayName(r),
    score,
    level: r.level,
    detail: buildDetail(category, r),
  };
}

export async function fetchFromDB(
  prisma: PrismaClient,
  category: LeaderboardCategory,
  take = 100,
): Promise<LeaderboardEntry[]> {
  const scoreField = categoryScoreField(category);
  const orderBy =
    category === 'arena'
      ? [{ totalPvpWins: 'desc' as const }, { pvpCount: 'desc' as const }]
      : [{ [scoreField]: 'desc' as const }];

  const rows = await prisma.player.findMany({
    orderBy,
    take,
    select: ENTRY_SELECT,
  });

  return rows.map((r, i) => rowToEntry(r, i + 1, category));
}

export async function entriesFromZsetWithNames(
  prisma: PrismaClient,
  category: LeaderboardCategory,
  pairs: { playerId: string; score: number }[],
): Promise<LeaderboardEntry[]> {
  if (pairs.length === 0) return [];
  const ids = pairs.map((p) => p.playerId);
  const rows = await prisma.player.findMany({
    where: { id: { in: ids } },
    select: ENTRY_SELECT,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  return pairs.map((p, i) => {
    const r = byId.get(p.playerId);
    if (!r) {
      return {
        rank: i + 1,
        playerId: p.playerId,
        displayName: 'Oyuncu',
        score: p.score,
        level: 1,
        detail: String(p.score),
      };
    }
    const entry = rowToEntry(r, i + 1, category);
    return { ...entry, score: p.score };
  });
}

export async function getRankFromDB(
  prisma: PrismaClient,
  category: LeaderboardCategory,
  playerId: string,
): Promise<number> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      powerScore: true,
      totalHunts: true,
      totalRareFinds: true,
      totalPvpWins: true,
      totalCoinsEarned: true,
      totalCoinsLost: true,
      pvpCount: true,
      coins: true,
    },
  });
  if (!player) return -1;

  const score = playerScoreForCategory(category, { id: playerId, level: 1, xp: 0, ...player });
  if (score <= 0) return -1;

  const scoreField = categoryScoreField(category);
  const above = await prisma.player.count({ where: { [scoreField]: { gt: score } } });
  return above + 1;
}

export async function getContextFromDB(
  prisma: PrismaClient,
  category: LeaderboardCategory,
  viewerId: string,
  viewerRank: number,
): Promise<LeaderboardEntry[]> {
  const scoreField = categoryScoreField(category);
  const viewer = await prisma.player.findUnique({ where: { id: viewerId }, select: ENTRY_SELECT });
  if (!viewer) return [];

  const viewerScore = playerScoreForCategory(category, viewer);
  const [above, below] = await Promise.all([
    prisma.player.findMany({
      where: { [scoreField]: { gt: viewerScore }, id: { not: viewerId } },
      orderBy: [{ [scoreField]: 'asc' }],
      take: 2,
      select: ENTRY_SELECT,
    }),
    prisma.player.findMany({
      where: { [scoreField]: { lt: viewerScore }, id: { not: viewerId } },
      orderBy: [{ [scoreField]: 'desc' }],
      take: 2,
      select: ENTRY_SELECT,
    }),
  ]);

  const allRows = [
    ...above.reverse().map((r, i) => ({ r, rank: viewerRank - (above.length - i) })),
    { r: viewer, rank: viewerRank },
    ...below.map((r, i) => ({ r, rank: viewerRank + i + 1 })),
  ];

  return allRows.map(({ r, rank }) => rowToEntry(r, rank, category));
}

export async function fetchGuildPlayerIds(
  prisma: PrismaClient,
  guildId: string,
): Promise<string[]> {
  const regs = await prisma.playerRegistration.findMany({
    where: { guildId },
    select: { userId: true },
  });
  return regs.map((r) => r.userId);
}
