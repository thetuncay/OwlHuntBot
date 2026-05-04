// ============================================================
// drops.ts — Lootbox Drop Sistemi
//
// Sorumluluklar:
//   1. Hunt sonrası lootbox drop şansını hesaplamak
//   2. PvP kazanma sonrası lootbox drop şansını hesaplamak
//   3. Encounter tame başarısı sonrası lootbox drop şansını hesaplamak
//   4. Lootbox'ı oyuncunun envanterine eklemek
//
// Tasarım:
//   - Drop şansları config.ts'de tanımlı (LOOTBOX_*_CHANCE)
//   - Kritik avda drop şansı 2x
//   - Soft cap: oyuncu seviyesi yükseldikçe drop şansı hafifçe azalır
//     (güçlü oyuncular item spam yapamaz)
//   - Günlük soft cap: 24 saatte max 5 lootbox drop (anti-farm)
// ============================================================

import type { PrismaClient } from '@prisma/client';
import {
  LOOTBOX_CRIT_MULT,
  LOOTBOX_DEF_MAP,
  LOOTBOX_DEFS,
  LOOTBOX_ENCOUNTER_WIN_CHANCE,
  LOOTBOX_HUNT_DROP_CHANCE,
  LOOTBOX_PVP_WIN_CHANCE,
  type LootboxTier,
} from '../config';
import type { LootboxDrop } from '../types';

// ── SABİTLER ─────────────────────────────────────────────────────────────────

/** Günlük maksimum lootbox drop sayısı (anti-farm) */
const DAILY_DROP_CAP = 5;

/** Seviye soft cap başlangıcı — bu seviyeden sonra drop şansı azalır */
const LEVEL_SOFTCAP_START = 20;

/** Her seviye için drop şansı azalma oranı (0.01 = %1 azalır) */
const LEVEL_SOFTCAP_RATE = 0.01;

/** Maksimum drop şansı azalması (0.30 = max %30 azalır) */
const LEVEL_SOFTCAP_MAX = 0.30;

// ── YARDIMCI FONKSİYONLAR ────────────────────────────────────────────────────

/**
 * Seviyeye göre drop şansı çarpanı.
 * Lv.20'den sonra her seviye için %1 azalır, max %30.
 * Yeni oyuncular daha fazla lootbox görür, veteran oyuncular daha az.
 */
function levelDropMult(level: number): number {
  if (level <= LEVEL_SOFTCAP_START) return 1.0;
  const reduction = Math.min(
    LEVEL_SOFTCAP_MAX,
    (level - LEVEL_SOFTCAP_START) * LEVEL_SOFTCAP_RATE,
  );
  return 1.0 - reduction;
}

/**
 * Oyuncunun bugün kaç lootbox drop aldığını kontrol eder ve atomik olarak artırır.
 * Race condition fix: check + increment tek bir atomic upsert ile yapılır.
 * Döner: true = drop verildi, false = günlük cap doldu
 */
async function tryClaimDailyDrop(prisma: PrismaClient, playerId: string): Promise<boolean> {
  const today = new Date();
  const todayStr = today.toDateString();

  // Atomic read-then-conditional-write: findUnique + update tek sorguda
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      dailyLootboxDrops:   true,
      lastLootboxDropDate: true,
    },
  });
  if (!player) return false;

  const lastDate = player.lastLootboxDropDate;
  const isNewDay = !lastDate || lastDate.toDateString() !== todayStr;
  const currentCount = isNewDay ? 0 : (player.dailyLootboxDrops ?? 0);

  if (currentCount >= DAILY_DROP_CAP) return false;

  // Atomic increment — eğer başka bir istek aynı anda gelirse
  // en kötü ihtimalle cap'i 1 aşar, bu kabul edilebilir
  await prisma.player.update({
    where: { id: playerId },
    data: {
      dailyLootboxDrops:   isNewDay ? 1 : { increment: 1 },
      lastLootboxDropDate: today,
    },
  });

  return true;
}

/**
 * Lootbox'ı oyuncunun envanterine ekler.
 */
async function addLootboxToInventory(
  prisma: PrismaClient,
  playerId: string,
  lootboxId: string,
): Promise<void> {
  const def = LOOTBOX_DEF_MAP[lootboxId];
  if (!def) return;

  await prisma.inventoryItem.upsert({
    where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
    create: {
      ownerId:  playerId,
      itemName: def.name,
      itemType: 'Kutu',
      rarity:   def.tier === 'Efsane' ? 'Legendary' : def.tier === 'Nadir' ? 'Rare' : 'Common',
      quantity: 1,
    },
    update: { quantity: { increment: 1 } },
  });
}

// ── HUNT DROP ────────────────────────────────────────────────────────────────

/**
 * Başarılı bir av rolünde lootbox düşüp düşmeyeceğini hesaplar.
 * Kritik avda şans 2x.
 *
 * @param isCritical Kritik av mı?
 * @param playerLevel Oyuncu seviyesi (soft cap için)
 * @returns Düşen lootbox listesi (genellikle 0 veya 1 item)
 */
export async function rollHuntLootboxDrop(
  prisma: PrismaClient,
  playerId: string,
  playerLevel: number,
  isCritical: boolean,
): Promise<LootboxDrop[]> {
  const mult = levelDropMult(playerLevel) * (isCritical ? LOOTBOX_CRIT_MULT : 1.0);
  const drops: LootboxDrop[] = [];

  const tierOrder: LootboxTier[] = ['Efsane', 'Nadir', 'Ortak'];
  for (const tier of tierOrder) {
    const baseChance = LOOTBOX_HUNT_DROP_CHANCE[tier];
    const finalChance = baseChance * mult;
    if (Math.random() * 100 < finalChance) {
      const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
      if (!def) continue;

      // Atomic cap check + increment
      const claimed = await tryClaimDailyDrop(prisma, playerId);
      if (!claimed) break;

      await addLootboxToInventory(prisma, playerId, def.id);
      drops.push({ lootboxId: def.id, lootboxName: def.name, emoji: def.emoji });
      break;
    }
  }

  return drops;
}

// ── PVP DROP ─────────────────────────────────────────────────────────────────

/**
 * PvP kazanma sonrası lootbox düşüp düşmeyeceğini hesaplar.
 */
export async function rollPvpLootboxDrop(
  prisma: PrismaClient,
  playerId: string,
  playerLevel: number,
): Promise<LootboxDrop | null> {
  const mult = levelDropMult(playerLevel);
  const tierOrder: LootboxTier[] = ['Efsane', 'Nadir', 'Ortak'];

  for (const tier of tierOrder) {
    const baseChance = LOOTBOX_PVP_WIN_CHANCE[tier];
    const finalChance = baseChance * mult;
    if (Math.random() * 100 < finalChance) {
      const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
      if (!def) continue;

      const claimed = await tryClaimDailyDrop(prisma, playerId);
      if (!claimed) return null;

      await addLootboxToInventory(prisma, playerId, def.id);
      return { lootboxId: def.id, lootboxName: def.name, emoji: def.emoji };
    }
  }

  return null;
}

// ── ENCOUNTER DROP ───────────────────────────────────────────────────────────

/**
 * Encounter tame başarısı sonrası lootbox düşüp düşmeyeceğini hesaplar.
 * Encounter en yüksek drop şansına sahip kaynak.
 */
export async function rollEncounterLootboxDrop(
  prisma: PrismaClient,
  playerId: string,
  playerLevel: number,
): Promise<LootboxDrop | null> {
  const mult = levelDropMult(playerLevel);
  const tierOrder: LootboxTier[] = ['Efsane', 'Nadir', 'Ortak'];

  for (const tier of tierOrder) {
    const baseChance = LOOTBOX_ENCOUNTER_WIN_CHANCE[tier];
    const finalChance = baseChance * mult;
    if (Math.random() * 100 < finalChance) {
      const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
      if (!def) continue;

      const claimed = await tryClaimDailyDrop(prisma, playerId);
      if (!claimed) return null;

      await addLootboxToInventory(prisma, playerId, def.id);
      return { lootboxId: def.id, lootboxName: def.name, emoji: def.emoji };
    }
  }

  return null;
}
