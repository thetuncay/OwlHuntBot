/**
 * Dashboard API — Discord userId = Player.id
 */
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  LEADERBOARD_SNAPSHOT_TOP_100,
  LEADERBOARD_SNAPSHOT_TOP_1000,
  LEADERBOARD_TOP_N,
} from '../config';
import { invalidateAllSnapshotsForCategory } from '../systems/leaderboard-cache';
import { activePeriods, ALL_CATEGORIES, GLOBAL_SCOPE } from '../systems/leaderboard-keys';
import {
  resolvePlayerDisplayName,
  validateLeaderboardDisplayName,
} from '../utils/player-display-name';
import type { WebSession } from './web-session';

export interface DashboardProfile {
  linked: boolean;
  registered: boolean;
  displayName: string | null;
  leaderboardName: string | null;
  player: {
    level: number;
    xp: number;
    coins: number;
    powerScore: number;
    totalHunts: number;
    totalRareFinds: number;
    totalPvpWins: number;
    huntComboStreak: number;
    prestigeLevel: number;
  } | null;
  mainOwl: {
    species: string;
    tier: number;
    quality: string;
  } | null;
}

export async function loadDashboardProfile(
  prisma: PrismaClient,
  session: WebSession,
): Promise<DashboardProfile> {
  const player = await prisma.player.findUnique({
    where: { id: session.userId },
    select: {
      leaderboardName: true,
      level: true,
      xp: true,
      coins: true,
      powerScore: true,
      totalHunts: true,
      totalRareFinds: true,
      totalPvpWins: true,
      huntComboStreak: true,
      prestigeLevel: true,
      mainOwlId: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });

  if (!player) {
    return {
      linked: true,
      registered: false,
      displayName: null,
      leaderboardName: null,
      player: null,
      mainOwl: null,
    };
  }

  let mainOwl: DashboardProfile['mainOwl'] = null;
  if (player.mainOwlId) {
    const owl = await prisma.owl.findUnique({
      where: { id: player.mainOwlId },
      select: { species: true, tier: true, quality: true },
    });
    if (owl) {
      mainOwl = {
        species: owl.species,
        tier: owl.tier,
        quality: owl.quality,
      };
    }
  } else {
    const owl = await prisma.owl.findFirst({
      where: { ownerId: session.userId, isMain: true },
      select: { species: true, tier: true, quality: true },
    });
    if (owl) {
      mainOwl = {
        species: owl.species,
        tier: owl.tier,
        quality: owl.quality,
      };
    }
  }

  return {
    linked: true,
    registered: true,
    displayName: resolvePlayerDisplayName(player),
    leaderboardName: player.leaderboardName,
    player: {
      level: player.level,
      xp: player.xp,
      coins: player.coins,
      powerScore: player.powerScore,
      totalHunts: player.totalHunts,
      totalRareFinds: player.totalRareFinds,
      totalPvpWins: player.totalPvpWins,
      huntComboStreak: player.huntComboStreak,
      prestigeLevel: player.prestigeLevel,
    },
    mainOwl,
  };
}

export async function updatePlayerLeaderboardName(
  prisma: PrismaClient,
  redis: Redis | null,
  userId: string,
  rawName: string,
): Promise<string> {
  const existing = await prisma.player.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existing) {
    throw new Error('Önce Discord\'da botu kullanıp kayıt olmalısın.');
  }

  const name = validateLeaderboardDisplayName(rawName);
  await prisma.player.update({
    where: { id: userId },
    data: { leaderboardName: name },
  });

  if (redis) {
    const periods = activePeriods();
    const periodValues = [periods.season, periods.week, periods.month, periods.alltime];
    const topNs = [LEADERBOARD_TOP_N, LEADERBOARD_SNAPSHOT_TOP_100, LEADERBOARD_SNAPSHOT_TOP_1000];
    await Promise.all(
      ALL_CATEGORIES.map((category) =>
        invalidateAllSnapshotsForCategory(redis, GLOBAL_SCOPE, category, periodValues, topNs),
      ),
    );
  }

  return name;
}
