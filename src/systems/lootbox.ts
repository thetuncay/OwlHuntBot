// ============================================================
// lootbox.ts — Lootbox Sistemi
//
// İki kutu tipi:
//   Silah Kutusu (wc) — PvP buff item'ları
//   Eşya Kutusu  (ec) — Hunt & Upgrade buff item'ları
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
import type { LootboxOpenResult } from '../types';
import { enqueueDbWrite } from '../utils/db-queue.js';
import { withLock } from '../utils/lock';

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
    throw new Error(`Envanterinde **${def.emoji} ${def.name}** yok.`);
  }

  // Pity kontrolü
  const pityCount     = await getPityCount(redis, playerId, lootboxId);
  const pityTriggered = pityCount >= def.pityThreshold;

  // Rarity seç
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

  // Item seç (kutunun kategorisine göre)
  const item = pickBuffItem(rarity, def.categories);
  const droppedItems: LootboxOpenResult['items'] = [];

  if (item) {
    droppedItems.push({
      buffItemId: item.id,
      buffName:   `${item.emoji} ${item.name}`,
      rarity:     item.rarity,
      emoji:      item.emoji,
    });
  }

  // DB: kutuyu tüket + item'ı envantere ekle
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

  // Pity güncelle (arka planda — BullMQ kuyruğuna ekle)
  if (gotRarePlus || pityTriggered) {
    enqueueDbWrite({ type: 'recordPity', playerId, lootboxId, increment: 0, reset: true });
  } else {
    enqueueDbWrite({ type: 'recordPity', playerId, lootboxId, increment: 1, reset: false });
  }

  return {
    lootboxId,
    lootboxName:   `${def.emoji} ${def.name}`,
    items:         droppedItems,
    pityTriggered,
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
      throw new Error(`Envanterinde **${def.emoji} ${def.name}** yok.`);
    }

    const count = inv.quantity;
    const results: LootboxOpenResult[] = [];

    for (let i = 0; i < count; i++) {
      // _openLootboxUnsafe: lock almadan açar — outer lock zaten alınmış
      results.push(await _openLootboxUnsafe(prisma, redis, playerId, lootboxId));
    }

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
