// ============================================================
// encounter-fight.ts — Encounter Savaş Sistemi + Loot
//
// Savaş kazanma ana ödül yolu: coin, XP, materyal, buff, kutu.
// Ödüller düşman tier / kalite / gücüne göre ölçeklenir.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  BUFF_ITEMS,
  HUNT_ITEM_DROPS,
  type BuffItemDef,
} from '../config';
import { statEffect } from '../utils/math';
import { addXP } from './xp';
import { rollEncounterFightLootboxDrop } from './drops';
import { applyCoinDeltaInRedis, reloadInventoryFromPg } from '../state/player-state';
import type { EncounterFightLootItem, EncounterFightResult } from '../utils/encounter-ux';

const FIGHT_MIN_COINS = 600;

const FIGHT_BASE_COINS: Record<number, number> = {
  1: 480, 2: 390, 3: 315, 4: 255,
  5: 195, 6: 150, 7: 112, 8: 82,
};

const FIGHT_BASE_XP: Record<number, number> = {
  1: 160, 2: 130, 3: 105, 4: 85,
  5: 65,  6: 50,  7: 38,  8: 28,
};

const QUALITY_FIGHT_MULT: Record<string, number> = {
  Trash:    0.75,
  Common:   1.0,
  Good:     1.15,
  Rare:     1.35,
  Elite:    1.6,
  'God Roll': 2.0,
};

const BUFF_RARITY_WEIGHT: Record<string, number> = {
  Common:   50,
  Uncommon: 30,
  Rare:     14,
  Epic:     5,
  Legendary: 1,
};

function calcWinChance(
  playerPower: number,
  enemyPower: number,
  playerLevel: number,
): number {
  const hiddenScaling = Math.max(0, (playerLevel - 20) * 0.005);
  const scaledEnemyPower = enemyPower * (1 + hiddenScaling);
  const raw = 50 + (playerPower - scaledEnemyPower) * 0.35;
  return Math.min(85, Math.max(20, raw));
}

function calcCoinXpReward(
  baseCoin: number,
  baseXP: number,
  playerPower: number,
  enemyPower: number,
  qualityMult: number,
): { coins: number; xp: number } {
  const powerRatio = enemyPower / Math.max(1, playerPower);
  const rewardMult = Math.min(1.6, Math.max(0.55, powerRatio));
  return {
    coins: Math.max(FIGHT_MIN_COINS, Math.round(baseCoin * rewardMult * qualityMult)),
    xp:    Math.round(baseXP   * rewardMult * qualityMult),
  };
}

function tierToDifficulty(tier: number): number {
  return Math.max(1, Math.min(8, 9 - tier));
}

function pickWeightedMaterial(tier: number, qualityMult: number): EncounterFightLootItem | null {
  const diff = tierToDifficulty(tier);
  const pool = HUNT_ITEM_DROPS.filter((d) => d.minDifficulty <= diff);
  if (pool.length === 0) return null;

  const weights = pool.map((d) => d.dropChance * qualityMult);
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;

  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      const def = pool[i]!;
      const qty = tier <= 3 ? 2 : 1;
      return {
        itemName: def.itemName,
        itemType: def.itemType,
        rarity:   def.rarity,
        quantity: qty,
      };
    }
  }
  const fallback = pool[pool.length - 1]!;
  return {
    itemName: fallback.itemName,
    itemType: fallback.itemType,
    rarity:   fallback.rarity,
    quantity: 1,
  };
}

function rollBuffDrop(tier: number, quality: string): EncounterFightLootItem | null {
  const qualityMult = QUALITY_FIGHT_MULT[quality] ?? 1;
  const buffChance = Math.min(50, (6 + (9 - tier) * 5) * qualityMult);
  if (Math.random() * 100 >= buffChance) return null;

  const maxRarityByTier: Record<number, string[]> = {
    8: ['Common'],
    7: ['Common'],
    6: ['Common', 'Uncommon'],
    5: ['Common', 'Uncommon', 'Rare'],
    4: ['Common', 'Uncommon', 'Rare'],
    3: ['Common', 'Uncommon', 'Rare', 'Epic'],
    2: ['Common', 'Uncommon', 'Rare', 'Epic'],
    1: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'],
  };
  const allowed = maxRarityByTier[tier] ?? ['Common'];
  const pool = BUFF_ITEMS.filter((b) => allowed.includes(b.rarity));
  if (pool.length === 0) return null;

  const pick = weightedPickBuff(pool);
  return {
    itemName: pick.name,
    itemType: 'Buff',
    rarity:   pick.rarity,
    quantity: 1,
    emoji:    pick.emoji,
  };
}

function weightedPickBuff(pool: BuffItemDef[]): BuffItemDef {
  const weights = pool.map((b) => BUFF_RARITY_WEIGHT[b.rarity] ?? 1);
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

function rollMaterialDrops(tier: number, quality: string): EncounterFightLootItem[] {
  const qualityMult = QUALITY_FIGHT_MULT[quality] ?? 1;
  const dropCount = tier <= 2 ? 3 : tier <= 5 ? 2 : 1;
  const drops: EncounterFightLootItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < dropCount; i++) {
    const item = pickWeightedMaterial(tier, qualityMult);
    if (!item) continue;
    const existing = drops.find((d) => d.itemName === item.itemName);
    if (existing) {
      existing.quantity += item.quantity;
    } else if (!seen.has(item.itemName) || i === 0) {
      drops.push(item);
      seen.add(item.itemName);
    }
  }
  return drops;
}

async function grantFightLoot(
  prisma: PrismaClient,
  playerId: string,
  items: EncounterFightLootItem[],
): Promise<void> {
  for (const item of items) {
    await prisma.inventoryItem.upsert({
      where: { ownerId_itemName: { ownerId: playerId, itemName: item.itemName } },
      create: {
        ownerId:  playerId,
        itemName: item.itemName,
        itemType: item.itemType,
        rarity:   item.rarity,
        quantity: item.quantity,
      },
      update: { quantity: { increment: item.quantity } },
    });
  }
}

/** UI önizlemesi — tahmini savaş ödül aralığı */
export function estimateEncounterFightRewards(
  tier: number,
  quality: string,
  playerPower: number,
  enemyPower: number,
): { coinMin: number; coinMax: number; xpMin: number; xpMax: number; materialHint: string; buffChance: number } {
  const qMult = QUALITY_FIGHT_MULT[quality] ?? 1;
  const baseCoin = FIGHT_BASE_COINS[tier] ?? 60;
  const baseXP   = FIGHT_BASE_XP[tier]   ?? 20;
  const low  = calcCoinXpReward(baseCoin, baseXP, playerPower, enemyPower * 0.6, qMult);
  const high = calcCoinXpReward(baseCoin, baseXP, playerPower, enemyPower * 1.4, qMult);
  const matCount = tier <= 2 ? 3 : tier <= 5 ? 2 : 1;
  const buffChance = Math.min(50, Math.round((6 + (9 - tier) * 5) * qMult));

  return {
    coinMin: Math.min(low.coins, high.coins),
    coinMax: Math.max(low.coins, high.coins),
    xpMin:   Math.min(low.xp, high.xp),
    xpMax:   Math.max(low.xp, high.xp),
    materialHint: `${matCount} materyal`,
    buffChance,
  };
}

export async function resolveEncounterFight(
  prisma: PrismaClient,
  playerId: string,
  encounterId: string,
  redis?: Redis,
): Promise<EncounterFightResult> {
  const [encounter, player, mainOwl] = await Promise.all([
    prisma.encounter.findFirst({
      where: { id: encounterId, playerId },
      select: {
        id: true, status: true,
        owlTier: true, owlQuality: true, owlSpecies: true, owlStats: true,
      },
    }),
    prisma.player.findUnique({
      where: { id: playerId },
      select: { level: true, prestigeLevel: true },
    }),
    prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: {
        statGaga: true, statGoz: true, statKulak: true,
        statKanat: true, statPence: true,
      },
    }),
  ]);

  if (!encounter || encounter.status !== 'open') {
    throw new Error('Encounter bulunamadı veya artık aktif değil.');
  }
  if (!player || !mainOwl) {
    throw new Error('Oyuncu veya main baykuş bulunamadı.');
  }

  const prestige = player.prestigeLevel ?? 0;
  const playerPower =
    statEffect(mainOwl.statGaga, prestige) +
    statEffect(mainOwl.statGoz, prestige) +
    statEffect(mainOwl.statKulak, prestige) +
    statEffect(mainOwl.statKanat, prestige) +
    statEffect(mainOwl.statPence, prestige);

  const rawStats = encounter.owlStats as Record<string, number>;
  const enemyPower =
    statEffect(rawStats.gaga  ?? 10) +
    statEffect(rawStats.goz   ?? 10) +
    statEffect(rawStats.kulak ?? 10) +
    statEffect(rawStats.kanat ?? 10) +
    statEffect(rawStats.pence ?? 10);

  const winChance = calcWinChance(playerPower, enemyPower, player.level);
  const playerWon = Math.random() * 100 < winChance;

  await prisma.encounter.update({
    where: { id: encounterId },
    data: { status: 'closed' },
  });

  if (!playerWon) {
    return {
      playerWon:   false,
      rewardCoins: 0,
      rewardXP:    0,
      lootItems:   [],
      enemyTier:   encounter.owlTier,
      enemyQuality: encounter.owlQuality,
      enemyLevel:  Math.round(enemyPower),
      winChance:   Math.round(winChance),
    };
  }

  const qualityMult = QUALITY_FIGHT_MULT[encounter.owlQuality] ?? 1;
  const baseCoin = FIGHT_BASE_COINS[encounter.owlTier] ?? 60;
  const baseXP   = FIGHT_BASE_XP[encounter.owlTier]   ?? 20;
  const { coins, xp } = calcCoinXpReward(baseCoin, baseXP, playerPower, enemyPower, qualityMult);

  const lootItems = rollMaterialDrops(encounter.owlTier, encounter.owlQuality);
  const buffDrop = rollBuffDrop(encounter.owlTier, encounter.owlQuality);
  if (buffDrop) lootItems.push(buffDrop);

  if (redis) {
    await applyCoinDeltaInRedis(redis, playerId, coins, prisma);
  } else {
    await prisma.player.update({
      where: { id: playerId },
      data: { coins: { increment: coins } },
    });
  }
  await addXP(prisma, playerId, xp, 'encounterFight', undefined, undefined, redis);
  await grantFightLoot(prisma, playerId, lootItems);

  const lootbox = redis
    ? await rollEncounterFightLootboxDrop(prisma, redis, playerId, player.level)
    : null;

  if (lootbox) {
    lootItems.push({
      itemName: lootbox.lootboxName,
      itemType: 'Kutu',
      rarity:   'Common',
      quantity: 1,
      emoji:    lootbox.emoji,
    });
  }

  if (redis) {
    await reloadInventoryFromPg(redis, prisma, playerId);
  }

  return {
    playerWon:    true,
    rewardCoins:  coins,
    rewardXP:     xp,
    lootItems,
    lootbox,
    enemyTier:    encounter.owlTier,
    enemyQuality: encounter.owlQuality,
    enemyLevel:   Math.round(enemyPower),
    winChance:    Math.round(winChance),
  };
}
