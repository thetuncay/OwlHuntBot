import type { PrismaClient } from '@prisma/client';
import { DAILY_QUEST_TYPES, DAILY_QUEST_CONFIG } from '../config';
import { addXP } from './xp';

/**
 * Oyuncu için günlük görevleri oluşturur (eğer yoksa).
 */
export async function ensureDailyQuests(prisma: PrismaClient, playerId: string) {
  const now = new Date();
  const nextReset = new Date();
  nextReset.setHours(24, 0, 0, 0);

  const existing = await prisma.dailyQuest.findFirst({
    where: { playerId, resetAt: { gt: now } }
  });

  if (!existing) {
    // Her tipten bir görev oluştur
    const tasks = DAILY_QUEST_TYPES.map(type => {
      const cfg = DAILY_QUEST_CONFIG[type];
      return prisma.dailyQuest.create({
        data: {
          playerId,
          type,
          target: cfg.target,
          rewardCoins: cfg.rewardCoins,
          rewardXp: cfg.rewardXp,
          resetAt: nextReset
        }
      });
    });
    await Promise.all(tasks);
  }
}

/**
 * Görev ilerlemesini günceller.
 */
export async function trackQuestProgress(
  prisma: PrismaClient,
  playerId: string,
  type: typeof DAILY_QUEST_TYPES[number],
  amount = 1
) {
  const now = new Date();
  await prisma.dailyQuest.updateMany({
    where: { playerId, type, resetAt: { gt: now }, isClaimed: false },
    data: { current: { increment: amount } }
  });
}

/**
 * Tamamlanan bir görevin ödülünü verir.
 */
export async function claimQuestReward(
  prisma: PrismaClient,
  playerId: string,
  questId: string
) {
  return prisma.$transaction(async (tx) => {
    const quest = await tx.dailyQuest.findUnique({ where: { id: questId } });

    if (!quest || quest.playerId !== playerId) throw new Error('Görev bulunamadı.');
    if (quest.isClaimed) throw new Error('Ödül zaten alınmış.');
    if (quest.current < quest.target) throw new Error('Görev henüz tamamlanmamış.');

    await tx.dailyQuest.update({
      where: { id: questId },
      data: { isClaimed: true }
    });

    await tx.player.update({
      where: { id: playerId },
      data: { coins: { increment: quest.rewardCoins } }
    });

    const xpResult = await addXP(tx as any, playerId, quest.rewardXp, 'dailyQuest');

    return { coins: quest.rewardCoins, xp: quest.rewardXp, levelUp: xpResult.levelUp };
  });
}
