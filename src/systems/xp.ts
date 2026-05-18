import type { PrismaClient } from '@prisma/client';
import type { XpApplyResult } from '../types';
import { finalXP, xpRequired } from '../utils/math';
import { enqueueDbWrite } from '../utils/db-queue';
import { PRESTIGE_XP_BONUS_PER_LEVEL } from '../config';

/**
 * Oyuncuya XP ekler, level-up durumunu hesaplar ve sonucu dondurur.
 * Opsiyonel olarak mevcut player verisi geçilebilir — DB sorgusu azaltır.
 * Hunt gibi yoğun akışlarda existingPlayer her zaman geçilmeli.
 *
 * @param skipDbWrite - true geçilirse:
 *   - Level-up yoksa: DB_Queue'ya fire-and-forget yazma yapılır, hesaplanan değerler döndürülür.
 *   - Level-up varsa: senkron prisma.player.update yapılır (level değişimi kritik).
 *   false veya belirtilmemişse mevcut davranış korunur (geriye dönük uyumluluk).
 */
export async function addXP(
  prisma: PrismaClient,
  playerId: string,
  amount: number,
  source: string,
  existingPlayer?: { level: number; xp: number; prestigeLevel?: number },
  skipDbWrite?: boolean,
): Promise<XpApplyResult> {
  // existingPlayer geçildiyse DB'ye gitme — round-trip tasarrufu
  const player = existingPlayer ?? await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, level: true, xp: true, prestigeLevel: true },
  });
  if (!player) {
    throw new Error('Oyuncu bulunamadi.');
  }

  // Prestige bonusu
  const prestigeBonus = 1 + (player.prestigeLevel || 0) * PRESTIGE_XP_BONUS_PER_LEVEL;
  const gainedXP = Math.round(finalXP(amount, player.level) * prestigeBonus);
  const nextXP   = player.xp + gainedXP;
  const required = xpRequired(player.level);

  if (nextXP < required) {
    // Level-up yok
    if (skipDbWrite) {
      // Fire-and-forget: DB_Queue'ya ekle, senkron bekleme
      enqueueDbWrite({ type: 'updatePlayer', playerId, data: { xp: nextXP } });
      return {
        gainedXP,
        currentXP:    nextXP,
        currentLevel: player.level,
      };
    }

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

  // Level-up var — her iki modda da senkron yazma yapılır (level değişimi kritik)
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
