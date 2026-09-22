/**
 * Görev ilerleme — oyun aksiyonlarından çağrılır.
 */
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { HUNT_HIGH_TIER_THRESHOLD, PREY } from '../config';
import type { DailyQuestType } from '../config/daily-quest-pool';
import {
  ensureDailyQuests,
  mergeQuestNotices,
  trackQuestProgress,
  trackQuestProgressEnsured,
  trackQuestThreshold,
  type QuestCompletionNotice,
} from './daily-quests';

const PREY_SELL: Record<string, number> = Object.fromEntries(
  PREY.map((p) => [p.name, p.sellPrice]),
);

export type HuntQuestTrackPayload = {
  catchCount: number;
  catches: { preyName: string; difficulty: number }[];
  totalXP: number;
  hasCritical: boolean;
  huntComboStreak: number;
};

export async function trackHuntQuests(
  prisma: PrismaClient,
  playerId: string,
  payload: HuntQuestTrackPayload,
  redis?: Redis,
): Promise<QuestCompletionNotice[]> {
  await ensureDailyQuests(prisma, playerId, redis);

  const { catchCount, catches, totalXP, hasCritical, huntComboStreak } = payload;
  const tasks: Promise<QuestCompletionNotice[]>[] = [];

  if (catchCount > 0) {
    tasks.push(trackQuestProgressEnsured(prisma, playerId, 'hunt', catchCount));
    tasks.push(trackQuestProgressEnsured(prisma, playerId, 'bond', 1));
  } else {
    tasks.push(trackQuestProgressEnsured(prisma, playerId, 'hunt_empty', 1));
  }

  if (totalXP > 0) tasks.push(trackQuestProgressEnsured(prisma, playerId, 'hunt_xp', totalXP));
  if (hasCritical) tasks.push(trackQuestProgressEnsured(prisma, playerId, 'hunt_critical', 1));
  if (huntComboStreak >= 3) tasks.push(trackQuestProgressEnsured(prisma, playerId, 'hunt_streak', 1));

  let coinValue = 0;
  for (const c of catches) {
    if (c.difficulty >= HUNT_HIGH_TIER_THRESHOLD) {
      tasks.push(trackQuestProgressEnsured(prisma, playerId, 'hunt_rare', 1));
    }
    tasks.push(trackQuestProgressEnsured(prisma, playerId, 'hunt_species', 1, { prey: c.preyName }));
    coinValue += PREY_SELL[c.preyName] ?? 10;
  }
  if (coinValue > 0) {
    tasks.push(trackQuestProgressEnsured(prisma, playerId, 'hunt_coin_value', coinValue));
  }

  const batches = await Promise.all(tasks);
  return mergeQuestNotices(...batches);
}

export async function trackSellQuests(
  prisma: PrismaClient,
  playerId: string,
  soldCount: number,
  redis?: Redis,
) {
  if (soldCount <= 0) return [];
  return trackQuestProgress(prisma, playerId, 'sell', soldCount, undefined, redis);
}

export async function trackEarnCoinsQuests(
  prisma: PrismaClient,
  playerId: string,
  amount: number,
  redis?: Redis,
) {
  if (amount <= 0) return [];
  return trackQuestProgress(prisma, playerId, 'earn_coins', amount, undefined, redis);
}

export async function fireQuest(
  prisma: PrismaClient,
  playerId: string,
  type: DailyQuestType,
  amount = 1,
  match?: { prey?: string; stat?: string },
  redis?: Redis,
): Promise<QuestCompletionNotice[]> {
  try {
    return await trackQuestProgress(prisma, playerId, type, amount, match, redis);
  } catch {
    return [];
  }
}

export async function fireQuestThreshold(
  prisma: PrismaClient,
  playerId: string,
  type: DailyQuestType,
  value: number,
  redis?: Redis,
): Promise<QuestCompletionNotice[]> {
  try {
    return await trackQuestThreshold(prisma, playerId, type, value, redis);
  } catch {
    return [];
  }
}

export async function fireQuestBatch(
  prisma: PrismaClient,
  playerId: string,
  calls: Array<{ type: DailyQuestType; amount?: number; match?: { prey?: string; stat?: string } }>,
  redis?: Redis,
): Promise<QuestCompletionNotice[]> {
  await ensureDailyQuests(prisma, playerId, redis);
  const batches = await Promise.all(
    calls.map((c) =>
      trackQuestProgressEnsured(prisma, playerId, c.type, c.amount ?? 1, c.match),
    ),
  );
  return mergeQuestNotices(...batches);
}
