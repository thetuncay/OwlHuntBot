// ============================================================
// lootbox.ts — Lootbox Sistemi
//
// İki kutu tipi (ikisi de av buff'ı):
//   Silah Kutusu (wc) — nadir av buff ağırlıklı
//   Eşya Kutusu  (ec) — standart av buff havuzu
//
// Komutlar:
//   w sk        → 1 silah kutusu aç
//   w sk all    → tüm silah kutularını aç
//   w ek        → 1 eşya kutusu aç
//   w ek all    → tüm eşya kutularını aç
//
// Pity Sistemi:
//   Her kutu tipi için ayrı pity sayacı (Redis).
//   X kutu açmadan Rare+ gelmezse bir sonraki açılışta garanti.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  BUFF_ITEMS,
  LOOTBOX_DEF_MAP,
  LOOTBOX_DEFS,
  type BuffItemRarity,
  type LootboxDef,
} from '../config';
import { displayBuffEmoji, displayLootboxEmoji } from '../config/custom-emojis';
import type { LootboxOpenResult } from '../types';
import { withLock } from '../utils/lock';
import { syncInventoryItemsFromPg } from '../state/player-state';

// ── YARDIMCI FONKSİYONLAR ────────────────────────────────────────────────────

/** Ağırlıklı rastgele rarity seçimi */
function rollRarity(weights: LootboxDef['weights']): BuffItemRarity {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let cursor = Math.random() * total;
  for (const w of weights) {
    cursor -= w.weight;
    if (cursor <= 0) return w.rarity;
  }
  return weights[weights.length - 1]!.rarity;
}

/** Belirli rarity + kategori havuzundan rastgele item seç */
function pickBuffItem(
  rarity: BuffItemRarity,
  categories: string[],
): (typeof BUFF_ITEMS)[number] | null {
  const pool = BUFF_ITEMS.filter(
    (b) => b.rarity === rarity && categories.includes(b.category),
  );
  if (pool.length === 0) {
    // Fallback: aynı kategoride Common'a in
    const fallback = BUFF_ITEMS.filter(
      (b) => b.rarity === 'Common' && categories.includes(b.category),
    );
    return fallback[Math.floor(Math.random() * fallback.length)] ?? null;
  }
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

/** Pity Redis key */
function pityKey(playerId: string, lootboxId: string): string {
  return `pity:${playerId}:${lootboxId}`;
}

async function getPityCount(redis: Redis, playerId: string, lootboxId: string): Promise<number> {
  const val = await redis.get(pityKey(playerId, lootboxId));
  return val ? parseInt(val, 10) : 0;
}

async function setPityCount(redis: Redis, playerId: string, lootboxId: string, count: number): Promise<void> {
  const key = pityKey(playerId, lootboxId);
  if (count <= 0) {
    await redis.del(key);
    return;
  }
  await redis.set(key, String(count));
}

interface LootboxRollOutcome {
  item: (typeof BUFF_ITEMS)[number] | null;
  pityTriggered: boolean;
  nextPityCount: number;
}

function rollLootboxOutcome(def: LootboxDef, pityCount: number): LootboxRollOutcome {
  const pityTriggered = pityCount >= def.pityThreshold;
  let rarity: BuffItemRarity;
  if (pityTriggered) {
    const pityWeights = def.weights.filter((w) => {
      const order: BuffItemRarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];
      return order.indexOf(w.rarity) >= order.indexOf('Rare') && w.weight > 0;
    });
    rarity = pityWeights.length > 0 ? rollRarity(pityWeights) : 'Rare';
  } else {
    rarity = rollRarity(def.weights);
  }

  const gotRarePlus = rarity === 'Rare' || rarity === 'Epic' || rarity === 'Legendary';
  const item = pickBuffItem(rarity, def.categories);
  const nextPityCount = gotRarePlus || pityTriggered ? 0 : pityCount + 1;

  return { item, pityTriggered, nextPityCount };
}

// ── TEK KUTU AÇMA (İÇ) ───────────────────────────────────────────────────────

/**
 * Lock olmadan tek kutu açar — withLock zaten alınmış olmalı.
 * openLootbox ve openAllLootboxes tarafından kullanılır.
 */
async function _openLootboxUnsafe(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  lootboxId: string,
): Promise<LootboxOpenResult> {
  const def = LOOTBOX_DEF_MAP[lootboxId];
  if (!def) throw new Error(`Bilinmeyen kutu: ${lootboxId}`);

  // Envanterde var mı?
  const inv = await prisma.inventoryItem.findUnique({
    where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
  });
  if (!inv || inv.quantity < 1) {
    throw new Error(`Envanterinde **${displayLootboxEmoji(def)} ${def.name}** yok.`);
  }

  const pityCount = await getPityCount(redis, playerId, lootboxId);
  const roll = rollLootboxOutcome(def, pityCount);
  const droppedItems: LootboxOpenResult['items'] = [];

  if (roll.item) {
    droppedItems.push({
      buffItemId: roll.item.id,
      buffName:   `${displayBuffEmoji(roll.item)} ${roll.item.name}`,
      rarity:     roll.item.rarity,
      emoji:      displayBuffEmoji(roll.item),
    });
  }

  // DB: kutuyu tüket + buff item envantere ekle
  await prisma.$transaction(async (tx) => {
    if (inv.quantity === 1) {
      await tx.inventoryItem.delete({
        where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
      });
    } else {
      await tx.inventoryItem.update({
        where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
        data: { quantity: { decrement: 1 } },
      });
    }

    for (const dropped of droppedItems) {
      const buffDef = BUFF_ITEMS.find((b) => b.id === dropped.buffItemId);
      if (!buffDef) continue;
      await tx.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: playerId, itemName: buffDef.name } },
        create: {
          ownerId:  playerId,
          itemName: buffDef.name,
          itemType: 'Buff',
          rarity:   buffDef.rarity,
          quantity: 1,
        },
        update: { quantity: { increment: 1 } },
      });
    }
  });

  await setPityCount(redis, playerId, lootboxId, roll.nextPityCount);

  const syncedItems = [def.name];
  for (const dropped of droppedItems) {
    const buffDef = BUFF_ITEMS.find((b) => b.id === dropped.buffItemId);
    if (buffDef) syncedItems.push(buffDef.name);
  }
  await syncInventoryItemsFromPg(redis, prisma, playerId, syncedItems);

  return {
    lootboxId,
    lootboxName:   `${displayLootboxEmoji(def)} ${def.name}`,
    items:         droppedItems,
    pityTriggered: roll.pityTriggered,
  };
}

// ── TEK KUTU AÇMA (PUBLIC) ────────────────────────────────────────────────────

/**
 * Oyuncunun envanterindeki bir kutuyu açar.
 * `lootboxId`: 'wc' (silah) veya 'ec' (eşya)
 */
export async function openLootbox(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  lootboxId: string,
): Promise<LootboxOpenResult> {
  return withLock(playerId, 'financial', () =>
    _openLootboxUnsafe(prisma, redis, playerId, lootboxId),
  );
}

// ── TOPLU KUTU AÇMA ───────────────────────────────────────────────────────────

export interface BulkOpenResult {
  opened:  number;
  results: LootboxOpenResult[];
}

/**
 * Oyuncunun envanterindeki tüm belirli kutuları açar.
 * Her açılış ayrı pity sayacı günceller.
 */
export async function openAllLootboxes(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  lootboxId: string,
): Promise<BulkOpenResult> {
  const def = LOOTBOX_DEF_MAP[lootboxId];
  if (!def) throw new Error(`Bilinmeyen kutu: ${lootboxId}`);

  // Outer lock: count stale-read + concurrent açma sorununu önler
  return withLock(playerId, 'financial', async () => {
    const inv = await prisma.inventoryItem.findUnique({
      where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
    });
    if (!inv || inv.quantity < 1) {
      throw new Error(`Envanterinde **${displayLootboxEmoji(def)} ${def.name}** yok.`);
    }

    const count = inv.quantity;
    let pityCount = await getPityCount(redis, playerId, lootboxId);
    const results: LootboxOpenResult[] = [];
    const buffIncrements = new Map<string, { itemType: string; rarity: string; quantity: number }>();

    for (let i = 0; i < count; i++) {
      const roll = rollLootboxOutcome(def, pityCount);
      pityCount = roll.nextPityCount;
      const droppedItems: LootboxOpenResult['items'] = [];
      if (roll.item) {
        droppedItems.push({
          buffItemId: roll.item.id,
          buffName:   `${displayBuffEmoji(roll.item)} ${roll.item.name}`,
          rarity:     roll.item.rarity,
          emoji:      displayBuffEmoji(roll.item),
        });
        const existing = buffIncrements.get(roll.item.name);
        if (existing) {
          existing.quantity += 1;
        } else {
          buffIncrements.set(roll.item.name, {
            itemType: 'Buff',
            rarity: roll.item.rarity,
            quantity: 1,
          });
        }
      }
      results.push({
        lootboxId,
        lootboxName: `${displayLootboxEmoji(def)} ${def.name}`,
        items: droppedItems,
        pityTriggered: roll.pityTriggered,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.delete({
        where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
      });
      for (const [itemName, meta] of buffIncrements) {
        await tx.inventoryItem.upsert({
          where: { ownerId_itemName: { ownerId: playerId, itemName } },
          create: {
            ownerId: playerId,
            itemName,
            itemType: meta.itemType,
            rarity: meta.rarity,
            quantity: meta.quantity,
          },
          update: { quantity: { increment: meta.quantity } },
        });
      }
    });

    await setPityCount(redis, playerId, lootboxId, pityCount);
    const syncedItems = [def.name, ...buffIncrements.keys()];
    await syncInventoryItemsFromPg(redis, prisma, playerId, syncedItems);

    return { opened: count, results };
  });
}

// ── ENVANTER SORGULAMA ────────────────────────────────────────────────────────

export async function listLootboxInventory(
  prisma: PrismaClient,
  playerId: string,
): Promise<{ def: LootboxDef; quantity: number }[]> {
  const lootboxNames = LOOTBOX_DEFS.map((l) => l.name);
  const rows = await prisma.inventoryItem.findMany({
    where: { ownerId: playerId, itemName: { in: lootboxNames } },
  });

  return rows
    .map((row) => {
      const def = LOOTBOX_DEFS.find((l) => l.name === row.itemName);
      if (!def) return null;
      return { def, quantity: row.quantity };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function getPityCounts(
  redis: Redis,
  playerId: string,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const def of LOOTBOX_DEFS) {
    result[def.id] = await getPityCount(redis, playerId, def.id);
  }
  return result;
}
