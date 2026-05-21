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

  // WHY: Eski kod sadece 1 level atlıyordu. Quest ödülü + hunt XP aynı anda
  // geldiğinde fazla XP kayboluyordu. while döngüsü tüm level-up'ları işler.
  const oldLevel = player.level;
  let currentLevel = player.level;
  let remainingXP  = nextXP;

  // Birden fazla level atlama desteği
  while (remainingXP >= xpRequired(currentLevel)) {
    remainingXP -= xpRequired(currentLevel);
    currentLevel++;
  }

  const didLevelUp = currentLevel > oldLevel;

  if (!didLevelUp) {
    // Level-up yok — caller zaten senkron yazma yapacak (hunt.ts gibi)
    // skipDbWrite=true ise queue'ya YAZMA — double-write rollback'i önler
    if (skipDbWrite) {
      // Sadece hesaplanan değerleri döndür; caller kendi update'inde xp'yi yazar
      return {
        gainedXP,
        currentXP:    remainingXP,
        currentLevel: oldLevel,
      };
    }

    const updated = await prisma.player.update({
      where: { id: playerId },
      data:  { xp: remainingXP },
      select: { level: true, xp: true },
    });
    return {
      gainedXP,
      currentXP:    updated.xp,
      currentLevel: updated.level,
    };
  }

  // Level-up var — senkron yazma (level değişimi kritik, queue'ya bırakılmaz)
  const updated = await prisma.player.update({
    where: { id: playerId },
    data:  { level: currentLevel, xp: remainingXP },
    select: { level: true, xp: true },
  });

  console.info(`[XP] ${playerId} kaynak=${source} +${gainedXP} XP (Lv ${oldLevel} -> ${currentLevel})`);
  return {
    gainedXP,
    currentXP:    updated.xp,
    currentLevel: updated.level,
    levelUp: {
      oldLevel,
      newLevel:    currentLevel,
      remainingXP: updated.xp,
    },
  };
}
