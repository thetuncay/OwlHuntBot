import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { XpApplyResult } from '../types';
import { finalXP, xpRequired } from '../utils/math';
import { PRESTIGE_XP_BONUS_PER_LEVEL, getLevelUpReward } from '../config';
import {
  applyCoinDeltaInRedis,
  reloadInventoryFromPg,
  syncPlayerStateAfterPgWrite,
} from '../state/player-state';

function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

const XP_LOG_ENABLED = envFlag('XP_LOG');

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
  redis?: Redis,
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
      // Sadece hesaplanan değerleri döndür; caller kendi update'inde xp ve
      // totalXP'yi yazmalıdır: { xp: currentXP, totalXP: { increment: gainedXP } }
      return {
        gainedXP,
        currentXP:    remainingXP,
        currentLevel: oldLevel,
      };
    }

    const updated = await prisma.player.update({
      where: { id: playerId },
      data:  { xp: remainingXP, totalXP: { increment: gainedXP } },
      select: { level: true, xp: true },
    });
    if (redis) {
      await syncPlayerStateAfterPgWrite(redis, prisma, playerId, 'progress');
    }
    return {
      gainedXP,
      currentXP:    updated.xp,
      currentLevel: updated.level,
    };
  }

  // Level-up var — senkron yazma (level değişimi kritik, queue'ya bırakılmaz)
  const updated = await prisma.player.update({
    where: { id: playerId },
    data:  { level: currentLevel, xp: remainingXP, totalXP: { increment: gainedXP } },
    select: { level: true, xp: true },
  });

  // Level-up ödülü ver
  let rewardSummary: { coins: number; lootboxName?: string; lootboxEmoji?: string; lootbox2Name?: string; lootbox2Emoji?: string; itemName?: string; message?: string } | undefined;
  let totalLevelUpCoins = 0;
  for (let lvl = oldLevel + 1; lvl <= currentLevel; lvl++) {
    const reward = getLevelUpReward(lvl);
    // Coin ödülü
    if (reward.coins > 0) {
      totalLevelUpCoins += reward.coins;
      await prisma.player.update({
        where: { id: playerId },
        data:  { coins: { increment: reward.coins } },
      });
    }
    // Item ödülü
    if (reward.item) {
      await (prisma as any).inventoryItem.upsert({
        where:  { ownerId_itemName: { ownerId: playerId, itemName: reward.item.itemName } },
        create: { ownerId: playerId, ...reward.item },
        update: { quantity: { increment: reward.item.quantity } },
      });
    }
    // Lootbox ödülü
    if (reward.lootbox) {
      await (prisma as any).inventoryItem.upsert({
        where:  { ownerId_itemName: { ownerId: playerId, itemName: reward.lootbox.name } },
        create: { ownerId: playerId, itemName: reward.lootbox.name, itemType: 'Lootbox', rarity: 'Rare', quantity: reward.lootbox.quantity },
        update: { quantity: { increment: reward.lootbox.quantity } },
      });
    }
    // İkinci lootbox (Lv.4 gibi iki farklı kutu)
    if (reward.lootbox2) {
      await (prisma as any).inventoryItem.upsert({
        where:  { ownerId_itemName: { ownerId: playerId, itemName: reward.lootbox2.name } },
        create: { ownerId: playerId, itemName: reward.lootbox2.name, itemType: 'Lootbox', rarity: 'Rare', quantity: reward.lootbox2.quantity },
        update: { quantity: { increment: reward.lootbox2.quantity } },
      });
    }
    // Son seviyenin ödülünü özetle (birden fazla level atlandıysa son seviyeyi göster)
    rewardSummary = {
      coins:        reward.coins,
      lootboxName:  reward.lootbox?.name,
      lootboxEmoji: reward.lootbox?.emoji,
      lootbox2Name:  reward.lootbox2?.name,
      lootbox2Emoji: reward.lootbox2?.emoji,
      itemName:     reward.item?.itemName,
      message:      reward.message,
    };
  }

  if (XP_LOG_ENABLED) {
    console.info(`[XP] ${playerId} kaynak=${source} +${gainedXP} XP (Lv ${oldLevel} -> ${currentLevel})`);
  }

  if (redis) {
    if (totalLevelUpCoins > 0) {
      await applyCoinDeltaInRedis(redis, playerId, totalLevelUpCoins, prisma);
    }
    await reloadInventoryFromPg(redis, prisma, playerId);
    await syncPlayerStateAfterPgWrite(redis, prisma, playerId, 'progress');
  }

  return {    gainedXP,
    currentXP:    updated.xp,
    currentLevel: updated.level,
    levelUp: {
      oldLevel,
      newLevel:    currentLevel,
      remainingXP: updated.xp,
      reward:      rewardSummary,
    },
  };
}
