/**
 * Public player profile JSON for the marketing site.
 */
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { getRankFromSortedSet } from '../systems/leaderboard';
import type { LeaderboardCategory } from '../systems/leaderboard-types';
import { resolvePlayerDisplayName } from '../utils/player-display-name';

const CATEGORIES: LeaderboardCategory[] = ['power', 'hunt', 'arena', 'wealth'];

export interface PublicPlayerProfile {
  playerId: string;
  displayName: string;
  level: number;
  xp: number;
  coins: number;
  powerScore: number;
  totalHunts: number;
  totalRareFinds: number;
  totalPvpWins: number;
  pvpCount: number;
  huntComboStreak: number;
  prestigeLevel: number;
  mainOwl: {
    species: string;
    tier: number;
    quality: string;
  } | null;
  ranks: Record<LeaderboardCategory, number>;
}

export async function resolvePublicPlayerProfile(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
): Promise<PublicPlayerProfile | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      leaderboardName: true,
      level: true,
      xp: true,
      coins: true,
      powerScore: true,
      totalHunts: true,
      totalRareFinds: true,
      totalPvpWins: true,
      pvpCount: true,
      huntComboStreak: true,
      prestigeLevel: true,
      mainOwlId: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });

  if (!player) return null;

  let mainOwl: PublicPlayerProfile['mainOwl'] = null;
  if (player.mainOwlId) {
    const owl = await prisma.owl.findUnique({
      where: { id: player.mainOwlId },
      select: { species: true, tier: true, quality: true },
    });
    if (owl) mainOwl = owl;
  } else {
    const owl = await prisma.owl.findFirst({
      where: { ownerId: player.id, isMain: true },
      select: { species: true, tier: true, quality: true },
    });
    if (owl) mainOwl = owl;
  }

  const ranks = {} as Record<LeaderboardCategory, number>;
  await Promise.all(
    CATEGORIES.map(async (cat) => {
      ranks[cat] = await getRankFromSortedSet(redis, prisma, cat, playerId);
    }),
  );

  return {
    playerId: player.id,
    displayName: resolvePlayerDisplayName(player),
    level: player.level,
    xp: player.xp,
    coins: player.coins,
    powerScore: player.powerScore,
    totalHunts: player.totalHunts,
    totalRareFinds: player.totalRareFinds,
    totalPvpWins: player.totalPvpWins,
    pvpCount: player.pvpCount,
    huntComboStreak: player.huntComboStreak,
    prestigeLevel: player.prestigeLevel,
    mainOwl,
    ranks,
  };
}
