import type { PrismaClient } from '@prisma/client';
import type { XpApplyResult } from '../types';
import { finalXP, xpRequired } from '../utils/math';

/**
 * Oyuncuya XP ekler, level-up durumunu hesaplar ve sonucu dondurur.
 * Atlas M0 uyumlu: $transaction kullanmaz, direkt sorgular.
 */
export async function addXP(
  prisma: PrismaClient,
  playerId: string,
  amount: number,
  source: string,
): Promise<XpApplyResult> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, level: true, xp: true },
  });
  if (!player) {
    throw new Error('Oyuncu bulunamadi.');
  }

  const gainedXP = finalXP(amount, player.level);
  const nextXP   = player.xp + gainedXP;
  const required = xpRequired(player.level);

  if (nextXP < required) {
    const updated = await prisma.player.update({
      where: { id: playerId },
      data:  { xp: nextXP },
      select: { level: true, xp: true },
    });
    return {
      gainedXP,
      currentXP:    updated.xp,
      currentLevel: updated.level,
    };
  }

  const oldLevel = player.level;
  const newLevel = player.level + 1;
  const updated  = await prisma.player.update({
    where: { id: playerId },
    data:  { level: newLevel, xp: 0 },
    select: { level: true, xp: true },
  });

  console.info(`[XP] ${playerId} kaynak=${source} +${gainedXP} XP (Lv ${oldLevel} -> ${newLevel})`);
  return {
    gainedXP,
    currentXP:    updated.xp,
    currentLevel: updated.level,
    levelUp: {
      oldLevel,
      newLevel,
      remainingXP: 0,
    },
  };
}
