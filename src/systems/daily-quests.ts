import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  DAILY_QUEST_POOL,
  DAILY_QUEST_VARIANTS,
  DAILY_QUESTS_PER_DAY,
  DAILY_MARKET_QUESTS_MIN,
  MARKET_DAILY_QUEST_TYPES,
  MARKET_HARD_QUEST_TYPES,
  formatDailyQuestLabel,
  parseDailyQuestMeta,
  rollQuestMeta,
  type DailyQuestMeta,
  type DailyQuestType,
  type DailyQuestVariant,
} from '../config/daily-quest-pool';
import { addXP } from './xp';
import { withLock } from '../utils/lock';
import { syncPlayerStateAfterPgWrite, applyCoinDeltaInRedis } from '../state/player-state';
import { recordQuestClaim, recordQuestComplete } from './engagement-metrics';

export type { DailyQuestType } from '../config/daily-quest-pool';

export interface QuestCompletionNotice {
  id: string;
  type: DailyQuestType;
  target: number;
  rewardCoins: number;
  rewardXp: number;
  meta?: string | null;
}

export interface QuestTrackMatch {
  prey?: string;
  stat?: string;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pickVariant(type: DailyQuestType, playerId: string, resetDay: string): DailyQuestVariant {
  const variants = DAILY_QUEST_VARIANTS[type];
  const hash = createHash('sha256').update(`${playerId}:${resetDay}:${type}`).digest();
  const roll = hash[0]! % 100;
  let tierIndex = 0;
  if (roll >= 50) tierIndex = 1;
  if (roll >= 85) tierIndex = 2;
  return variants[tierIndex]!;
}

/** Oyuncu + gün için deterministik 4 görev tipi; en az `DAILY_MARKET_QUESTS_MIN` market. */
export function pickDailyQuestTypes(playerId: string, resetAt: Date): DailyQuestType[] {
  const resetDay = dayKey(resetAt);
  const hash = createHash('sha256').update(`${playerId}:${resetDay}:quest-pick`).digest();
  const rank = (index: number, salt: number): number =>
    hash[index % hash.length]! ^ hash[(index + salt) % hash.length]!;

  const hard = new Set<string>(MARKET_HARD_QUEST_TYPES);

  const marketOrdered = [...MARKET_DAILY_QUEST_TYPES].sort((a, b) => {
    const ia = DAILY_QUEST_POOL.indexOf(a);
    const ib = DAILY_QUEST_POOL.indexOf(b);
    return rank(ia < 0 ? 0 : ia, 3) - rank(ib < 0 ? 0 : ib, 3);
  });
  const picked: DailyQuestType[] = marketOrdered.slice(0, DAILY_MARKET_QUESTS_MIN);

  const fillerPool = DAILY_QUEST_POOL.filter(
    (t) => !picked.includes(t) && !hard.has(t),
  );
  const fillers = [...fillerPool]
    .sort((a, b) => {
      const ia = DAILY_QUEST_POOL.indexOf(a);
      const ib = DAILY_QUEST_POOL.indexOf(b);
      return rank(ia, 7) - rank(ib, 7);
    })
    .slice(0, DAILY_QUESTS_PER_DAY - picked.length);

  return [...picked, ...fillers];
}

function rollDailyQuestSet(playerId: string, resetAt: Date) {
  const resetDay = dayKey(resetAt);
  const types = pickDailyQuestTypes(playerId, resetAt);
  return types.map((type) => {
    const variant = pickVariant(type, playerId, resetDay);
    const metaObj = rollQuestMeta(type, `${playerId}:${resetDay}:${type}`);
    const meta = metaObj ? JSON.stringify(metaObj) : null;
    return { type, ...variant, meta };
  });
}

function matchesMeta(questMeta: string | null | undefined, match?: QuestTrackMatch): boolean {
  if (!match || (!match.prey && !match.stat)) return true;
  const parsed = parseDailyQuestMeta(questMeta);
  if (match.prey && parsed?.prey !== match.prey) return false;
  if (match.stat && parsed?.stat !== match.stat) return false;
  return true;
}

function toNotice(quest: {
  id: string;
  type: string;
  target: number;
  rewardCoins: number;
  rewardXp: number;
  meta?: string | null;
}): QuestCompletionNotice {
  return {
    id: quest.id,
    type: quest.type as DailyQuestType,
    target: quest.target,
    rewardCoins: quest.rewardCoins,
    rewardXp: quest.rewardXp,
    meta: quest.meta,
  };
}

function questsEnsuredCacheKey(playerId: string, resetDay: string): string {
  return `quests:ensured:${playerId}:${resetDay}`;
}

export async function ensureDailyQuests(
  prisma: PrismaClient,
  playerId: string,
  redis?: Redis,
) {
  const nextReset = new Date();
  nextReset.setHours(24, 0, 0, 0);
  const resetDay = dayKey(nextReset);
  const cacheKey = questsEnsuredCacheKey(playerId, resetDay);

  if (redis) {
    const hit = await redis.get(cacheKey);
    if (hit === '1') return;
  }

  const now = new Date();
  const existing = await prisma.dailyQuest.count({
    where: { playerId, resetAt: { gt: now } },
  });
  if (existing >= DAILY_QUESTS_PER_DAY) {
    if (redis) {
      const ttl = Math.max(60, Math.ceil((nextReset.getTime() - Date.now()) / 1000));
      await redis.set(cacheKey, '1', 'EX', ttl);
    }
    return;
  }

  const rolled = rollDailyQuestSet(playerId, nextReset);
  await Promise.all(
    rolled.map((quest) =>
      prisma.dailyQuest.upsert({
        where: {
          playerId_type_resetAt: {
            playerId,
            type: quest.type,
            resetAt: nextReset,
          },
        },
        create: {
          playerId,
          type: quest.type,
          target: quest.target,
          meta: quest.meta,
          rewardCoins: quest.rewardCoins,
          rewardXp: quest.rewardXp,
          resetAt: nextReset,
        },
        update: {},
      }),
    ),
  );

  if (redis) {
    const ttl = Math.max(60, Math.ceil((nextReset.getTime() - Date.now()) / 1000));
    await redis.set(cacheKey, '1', 'EX', ttl);
  }
}

async function findActiveQuests(
  prisma: PrismaClient,
  playerId: string,
  type: DailyQuestType,
  match?: QuestTrackMatch,
) {
  const now = new Date();
  const quests = await prisma.dailyQuest.findMany({
    where: { playerId, type, resetAt: { gt: now }, isClaimed: false },
  });
  return quests.filter((q) => matchesMeta(q.meta, match));
}

export async function trackQuestProgress(
  prisma: PrismaClient,
  playerId: string,
  type: DailyQuestType,
  amount = 1,
  match?: QuestTrackMatch,
  redis?: Redis,
): Promise<QuestCompletionNotice[]> {
  if (amount <= 0) return [];
  await ensureDailyQuests(prisma, playerId, redis);
  return applyQuestProgress(prisma, playerId, type, amount, match);
}

/** ensureDailyQuests zaten çağrıldıysa (hot path batch). */
export async function trackQuestProgressEnsured(
  prisma: PrismaClient,
  playerId: string,
  type: DailyQuestType,
  amount = 1,
  match?: QuestTrackMatch,
): Promise<QuestCompletionNotice[]> {
  if (amount <= 0) return [];
  return applyQuestProgress(prisma, playerId, type, amount, match);
}

async function applyQuestProgress(
  prisma: PrismaClient,
  playerId: string,
  type: DailyQuestType,
  amount: number,
  match?: QuestTrackMatch,
): Promise<QuestCompletionNotice[]> {
  const quests = await findActiveQuests(prisma, playerId, type, match);
  if (quests.length === 0) return [];

  const newlyCompleted: QuestCompletionNotice[] = [];
  for (const quest of quests) {
    if (quest.current < quest.target && quest.current + amount >= quest.target) {
      newlyCompleted.push(toNotice(quest));
    }
  }

  const now = new Date();
  await prisma.dailyQuest.updateMany({
    where: {
      id: { in: quests.map((q) => q.id) },
      resetAt: { gt: now },
      isClaimed: false,
    },
    data: { current: { increment: amount } },
  });

  return newlyCompleted;
}

/** Koşul sağlanınca ilerlemeyi hedefe çeker (buff_active vb.). */
export async function trackQuestThreshold(
  prisma: PrismaClient,
  playerId: string,
  type: DailyQuestType,
  value: number,
  redis?: Redis,
): Promise<QuestCompletionNotice[]> {
  await ensureDailyQuests(prisma, playerId, redis);
  const quests = await findActiveQuests(prisma, playerId, type);
  const newlyCompleted: QuestCompletionNotice[] = [];

  for (const quest of quests) {
    const newCurrent = Math.min(quest.target, Math.max(quest.current, value));
    if (quest.current < quest.target && newCurrent >= quest.target) {
      newlyCompleted.push(toNotice(quest));
    }
    if (newCurrent !== quest.current) {
      await prisma.dailyQuest.update({
        where: { id: quest.id },
        data: { current: newCurrent },
      });
    }
  }
  return newlyCompleted;
}

export function mergeQuestNotices(...batches: QuestCompletionNotice[][]): QuestCompletionNotice[] {
  const seen = new Set<string>();
  const out: QuestCompletionNotice[] = [];
  for (const batch of batches) {
    for (const n of batch) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
  }
  return out;
}

export async function countUnclaimedReadyQuests(
  prisma: PrismaClient,
  playerId: string,
  redis?: Redis,
): Promise<number> {
  await ensureDailyQuests(prisma, playerId, redis);
  const now = new Date();
  const quests = await prisma.dailyQuest.findMany({
    where: { playerId, resetAt: { gt: now }, isClaimed: false },
  });
  return quests.filter((q) => q.current >= q.target).length;
}

export async function claimQuestReward(
  prisma: PrismaClient,
  playerId: string,
  questId: string,
  redis?: Redis,
) {
  return withLock(playerId, 'quest_claim', async () => {
    const result = await prisma.$transaction(async (tx) => {
      const quest = await tx.dailyQuest.findUnique({ where: { id: questId } });

      if (!quest || quest.playerId !== playerId) throw new Error('Görev bulunamadı.');
      if (quest.isClaimed) throw new Error('Ödül zaten alınmış.');
      if (quest.current < quest.target) throw new Error('Görev henüz tamamlanmamış.');

      await tx.dailyQuest.update({
        where: { id: questId },
        data: { isClaimed: true },
      });

      await tx.player.update({
        where: { id: playerId },
        data: { coins: { increment: quest.rewardCoins } },
      });

      const xpResult = await addXP(tx as any, playerId, quest.rewardXp, 'dailyQuest');

      return {
        coins: quest.rewardCoins,
        xp: quest.rewardXp,
        levelUp: xpResult.levelUp,
        levelAfter: xpResult.currentLevel,
        xpAfter: xpResult.currentXP,
      };
    });
    if (redis) {
      await applyCoinDeltaInRedis(redis, playerId, result.coins, prisma);
      await syncPlayerStateAfterPgWrite(redis, prisma, playerId, 'progress');
      await recordQuestClaim(redis).catch(() => undefined);
      await recordQuestComplete(redis).catch(() => undefined);
    }
    return result;
  });
}

export function resolveQuestTier(type: DailyQuestType, target: number): DailyQuestVariant['tier'] {
  const match = DAILY_QUEST_VARIANTS[type].find((v) => v.target === target);
  return match?.tier ?? 2;
}

export function formatQuestNoticeLabel(notice: QuestCompletionNotice): string {
  return formatDailyQuestLabel(notice.type, notice.target, notice.meta);
}
