// ============================================================
// drops.ts — Lootbox Drop Sistemi
//
// İki kutu tipi (ikisi de av buff'ı):
//   Silah Kutusu (wc) — nadir av buff ağırlıklı
//   Eşya Kutusu  (ec) — standart av buff havuzu
//
// Drop kaynakları:
//   Hunt      → Eşya Kutusu ağırlıklı
//   PvP       → Eşya / Silah kutusu
//   Encounter → Eşya Kutusu ağırlıklı
//
// Günlük soft cap: 24 saatte max LOOTBOX_DAILY_DROP_CAP drop (anti-farm)
// Oranlar + seviye softcap'i oyuncuya `w yardim drop` ile ilan edilir;
// sabitler bu yüzden config/drop-transparency.ts içinde paylaşılır.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  LOOTBOX_CRIT_MULT,
  LOOTBOX_DEF_MAP,
  LOOTBOX_DEFS,
  LOOTBOX_ENCOUNTER_WIN_CHANCE,
  LOOTBOX_ENCOUNTER_FIGHT_CHANCE,
  LOOTBOX_HUNT_DROP_CHANCE,
  LOOTBOX_PVP_WIN_CHANCE,
  type LootboxTier,
} from '../config';
import { displayLootboxEmoji } from '../config/custom-emojis';
import {
  LOOTBOX_DAILY_DROP_CAP,
  lootboxLevelDropMultiplier,
} from '../config/drop-transparency';
import type { LootboxDrop } from '../types';
import { enqueueDbWrite } from '../utils/db-queue';
import { addInventoryItemInRedis } from '../state/player-state';

// ── YARDIMCI FONKSİYONLAR ────────────────────────────────────────────────────

const levelDropMult = lootboxLevelDropMultiplier;

async function tryClaimDailyDrop(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
): Promise<boolean> {
  const today    = new Date();
  const todayStr = today.toDateString();

  // Atomik Redis sayacı — stale cache bypass'ını önler
  const capKey = `daily:lootbox:${playerId}:${todayStr}`;
  const count  = await redis.incr(capKey);
  if (count === 1) {
    // İlk artırma: gece yarısına kadar TTL ayarla
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const ttlSec = Math.floor((midnight.getTime() - Date.now()) / 1000);
    await redis.expire(capKey, ttlSec);
  }
  if (count > LOOTBOX_DAILY_DROP_CAP) {
    // Limit aşıldı — sayacı geri al
    await redis.decr(capKey);
    return false;
  }

  // DB'yi fire-and-forget ile güncelle (UI için gerekli değil)
  enqueueDbWrite({
    type:     'updatePlayer',
    playerId,
    data: {
      dailyLootboxDrops:   count,
      lastLootboxDropDate: today,
    },
  });

  return true;
}

async function tryClaimDailyDropFromDb(prisma: PrismaClient, playerId: string): Promise<boolean> {
  const today    = new Date();
  const todayStr = today.toDateString();

  const player = await prisma.player.findUnique({
    where:  { id: playerId },
    select: { dailyLootboxDrops: true, lastLootboxDropDate: true },
  });
  if (!player) return false;

  const lastDate     = player.lastLootboxDropDate;
  const isNewDay     = !lastDate || lastDate.toDateString() !== todayStr;
  const currentCount = isNewDay ? 0 : (player.dailyLootboxDrops ?? 0);

  if (currentCount >= LOOTBOX_DAILY_DROP_CAP) return false;

  await prisma.player.update({
    where: { id: playerId },
    data: {
      dailyLootboxDrops:   isNewDay ? 1 : { increment: 1 },
      lastLootboxDropDate: today,
    },
  });

  return true;
}

async function addLootboxToInventory(
  prisma: PrismaClient,
  playerId: string,
  lootboxId: string,
): Promise<void> {
  const def = LOOTBOX_DEF_MAP[lootboxId];
  if (!def) return;

  await prisma.inventoryItem.upsert({
    where:  { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
    create: {
      ownerId:  playerId,
      itemName: def.name,
      itemType: 'Kutu',
      rarity:   'Common',
      quantity: 1,
    },
    update: { quantity: { increment: 1 } },
  });
}

// ── HUNT DROP ────────────────────────────────────────────────────────────────

/**
 * Başarılı av rolünde kutu düşüp düşmeyeceğini hesaplar.
 * Eşya Kutusu ağırlıklı, Silah Kutusu daha nadir.
 */
export async function rollHuntLootboxDrop(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  playerLevel: number,
  isCritical: boolean,
): Promise<LootboxDrop[]> {
  const mult  = levelDropMult(playerLevel) * (isCritical ? LOOTBOX_CRIT_MULT : 1.0);
  const drops: LootboxDrop[] = [];

  // Hunt'ta önce Eşya Kutusu, sonra Silah Kutusu kontrol edilir
  const tierOrder: LootboxTier[] = ['Eşya', 'Silah'];

  for (const tier of tierOrder) {
    const baseChance  = LOOTBOX_HUNT_DROP_CHANCE[tier];
    const finalChance = baseChance * mult;

    if (Math.random() * 100 < finalChance) {
      const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
      if (!def) continue;

      const claimed = await tryClaimDailyDrop(prisma, redis, playerId);
      if (!claimed) break;

      const lootboxDef = LOOTBOX_DEF_MAP[def.id];
      if (lootboxDef) {
        await addInventoryItemInRedis(
          redis,
          playerId,
          lootboxDef.name,
          'Kutu',
          'Common',
          1,
          prisma,
        );
      }

      drops.push({ lootboxId: def.id, lootboxName: def.name, emoji: displayLootboxEmoji(def) });
      break; // Bir hunt'ta en fazla 1 kutu
    }
  }

  return drops;
}

// ── PVP DROP ─────────────────────────────────────────────────────────────────

/**
 * PvP kazanma sonrası kutu düşüp düşmeyeceğini hesaplar.
 * Silah Kutusu ağırlıklı.
 */
export async function rollPvpLootboxDrop(
  prisma: PrismaClient,
  playerId: string,
  playerLevel: number,
  redis?: Redis,
): Promise<LootboxDrop | null> {
  const mult = levelDropMult(playerLevel);

  // PvP'de önce Silah Kutusu, sonra Eşya Kutusu
  const tierOrder: LootboxTier[] = ['Silah', 'Eşya'];

  for (const tier of tierOrder) {
    const baseChance  = LOOTBOX_PVP_WIN_CHANCE[tier];
    const finalChance = baseChance * mult;

    if (Math.random() * 100 < finalChance) {
      const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
      if (!def) continue;

      const claimed = redis
        ? await tryClaimDailyDrop(prisma, redis, playerId)
        : await tryClaimDailyDropFromDb(prisma, playerId);
      if (!claimed) return null;

      const lootboxDef = LOOTBOX_DEF_MAP[def.id];
      if (redis && lootboxDef) {
        await addInventoryItemInRedis(
          redis,
          playerId,
          lootboxDef.name,
          'Kutu',
          'Common',
          1,
          prisma,
        );
      } else {
        await addLootboxToInventory(prisma, playerId, def.id);
      }
      return { lootboxId: def.id, lootboxName: def.name, emoji: displayLootboxEmoji(def) };
    }
  }

  return null;
}

// ── ENCOUNTER DROP ───────────────────────────────────────────────────────────

/**
 * Encounter tame başarısı sonrası kutu düşüp düşmeyeceğini hesaplar.
 * Eşya Kutusu ağırlıklı.
 */
export async function rollEncounterLootboxDrop(
  prisma: PrismaClient,
  playerId: string,
  playerLevel: number,
  redis?: Redis,
): Promise<LootboxDrop | null> {
  const mult = levelDropMult(playerLevel);

  // Encounter'da önce Eşya Kutusu, sonra Silah Kutusu
  const tierOrder: LootboxTier[] = ['Eşya', 'Silah'];

  for (const tier of tierOrder) {
    const baseChance  = LOOTBOX_ENCOUNTER_WIN_CHANCE[tier];
    const finalChance = baseChance * mult;

    if (Math.random() * 100 < finalChance) {
      const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
      if (!def) continue;

      const claimed = redis
        ? await tryClaimDailyDrop(prisma, redis, playerId)
        : await tryClaimDailyDropFromDb(prisma, playerId);
      if (!claimed) return null;

      const lootboxDef = LOOTBOX_DEF_MAP[def.id];
      if (redis && lootboxDef) {
        await addInventoryItemInRedis(
          redis,
          playerId,
          lootboxDef.name,
          'Kutu',
          'Common',
          1,
          prisma,
        );
      } else {
        await addLootboxToInventory(prisma, playerId, def.id);
      }
      return { lootboxId: def.id, lootboxName: def.name, emoji: displayLootboxEmoji(def) };
    }
  }

  return null;
}

/**
 * Encounter savaş kazanma — yüksek kutu şansı (Redis günlük cap).
 */
export async function rollEncounterFightLootboxDrop(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  playerLevel: number,
): Promise<LootboxDrop | null> {
  const mult = levelDropMult(playerLevel);
  const tierOrder: LootboxTier[] = ['Eşya', 'Silah'];

  for (const tier of tierOrder) {
    const baseChance  = LOOTBOX_ENCOUNTER_FIGHT_CHANCE[tier];
    const finalChance = baseChance * mult;

    if (Math.random() * 100 < finalChance) {
      const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
      if (!def) continue;

      const claimed = await tryClaimDailyDrop(prisma, redis, playerId);
      if (!claimed) return null;

      const lootboxDef = LOOTBOX_DEF_MAP[def.id];
      if (lootboxDef) {
        await addInventoryItemInRedis(
          redis,
          playerId,
          lootboxDef.name,
          'Kutu',
          'Common',
          1,
          prisma,
        );
      }

      return { lootboxId: def.id, lootboxName: def.name, emoji: displayLootboxEmoji(def) };
    }
  }

  return null;
}
