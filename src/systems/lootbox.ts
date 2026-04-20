// ============================================================
// lootbox.ts — Lootbox Sistemi
//
// Sorumluluklar:
//   1. Lootbox açma (weighted RNG + pity sistemi)
//   2. Lootbox envanterini yönetmek
//   3. Drop sonuçlarını buff item envanterine eklemek
//
// Pity Sistemi:
//   Her lootbox tipi için ayrı pity sayacı tutulur.
//   X kutu açmadan Rare+ gelmezse bir sonraki açılışta garanti.
//   Pity sayacı Redis'te tutulur (hafif, geçici veri).
//
// Lootbox Kaynakları (drop sistemi drops.ts'de):
//   - Hunt: her başarılı av rolünde küçük şans
//   - PvP kazanma: orta şans
//   - Encounter tame başarısı: yüksek şans
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

/** Belirli rarity'deki buff item'larından rastgele seç */
function pickBuffItem(rarity: BuffItemRarity): (typeof BUFF_ITEMS)[number] | null {
  const pool = BUFF_ITEMS.filter((b) => b.rarity === rarity);
  if (pool.length === 0) {
    // Fallback: bir üst rarity'e in
    const fallback = BUFF_ITEMS.filter((b) => b.rarity === 'Common');
    return fallback[Math.floor(Math.random() * fallback.length)] ?? null;
  }
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

/** Pity Redis key */
function pityKey(playerId: string, lootboxId: string): string {
  return `pity:${playerId}:${lootboxId}`;
}

/** Pity sayacını oku */
async function getPityCount(redis: Redis, playerId: string, lootboxId: string): Promise<number> {
  const val = await redis.get(pityKey(playerId, lootboxId));
  return val ? parseInt(val, 10) : 0;
}

/** Pity sayacını artır */
async function incrementPity(redis: Redis, playerId: string, lootboxId: string): Promise<void> {
  const key = pityKey(playerId, lootboxId);
  await redis.incr(key);
  // 30 gün TTL — aktif olmayan oyuncuların pity'si sıfırlanır
  await redis.expire(key, 30 * 24 * 60 * 60);
}

/** Pity sayacını sıfırla */
async function resetPity(redis: Redis, playerId: string, lootboxId: string): Promise<void> {
  await redis.del(pityKey(playerId, lootboxId));
}

// ── LOOTBOX AÇMA ─────────────────────────────────────────────────────────────

/**
 * Oyuncunun envanterindeki bir lootbox'ı açar.
 *
 * Pity sistemi:
 *   - Ortak Kutu: 8 açılışta Rare+ gelmezse garanti
 *   - Nadir Kutu: 5 açılışta Epic+ gelmezse garanti
 *   - Efsane Kutu: 3 açılışta Epic+ gelmezse garanti
 */
export async function openLootbox(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  lootboxId: string,
): Promise<LootboxOpenResult> {
  return withLock(playerId, 'lootbox', async () => {
    const def = LOOTBOX_DEF_MAP[lootboxId];
    if (!def) throw new Error(`Bilinmeyen lootbox: ${lootboxId}`);

    // Envanterde var mı?
    const inv = await prisma.inventoryItem.findUnique({
      where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
    });
    if (!inv || inv.quantity < 1) {
      throw new Error(`Envanterinde **${def.emoji} ${def.name}** yok.`);
    }

    // Pity kontrolü
    const pityCount = await getPityCount(redis, playerId, lootboxId);
    const pityTriggered = pityCount >= def.pityThreshold;

    // Kaç item çıkacak?
    const [minItems, maxItems] = def.itemCount;
    const itemCount = minItems + Math.floor(Math.random() * (maxItems - minItems + 1));

    const droppedItems: LootboxOpenResult['items'] = [];
    let gotRarePlus = false;

    for (let i = 0; i < itemCount; i++) {
      let rarity: BuffItemRarity;

      // İlk item için pity kontrolü
      if (i === 0 && pityTriggered) {
        // Pity tetiklendi — minimum Rare garantisi
        const pityWeights = def.weights.filter((w) => {
          const rarityOrder: BuffItemRarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];
          const minIdx = rarityOrder.indexOf('Rare');
          return rarityOrder.indexOf(w.rarity) >= minIdx && w.weight > 0;
        });
        rarity = pityWeights.length > 0 ? rollRarity(pityWeights) : 'Rare';
        gotRarePlus = true;
      } else {
        rarity = rollRarity(def.weights);
        if (rarity === 'Rare' || rarity === 'Epic' || rarity === 'Legendary') {
          gotRarePlus = true;
        }
      }

      const item = pickBuffItem(rarity);
      if (!item) continue;

      droppedItems.push({
        buffItemId: item.id,
        buffName:   `${item.emoji} ${item.name}`,
        rarity:     item.rarity,
        emoji:      item.emoji,
      });
    }

    // DB işlemleri: lootbox tüket + buff item'larını envantere ekle
    await prisma.$transaction(async (tx) => {
      // Lootbox'ı tüket
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

      // Buff item'larını envantere ekle
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

    // Pity sayacını güncelle
    if (gotRarePlus || pityTriggered) {
      await resetPity(redis, playerId, lootboxId);
    } else {
      await incrementPity(redis, playerId, lootboxId);
    }

    return {
      lootboxId:     def.id,
      lootboxName:   `${def.emoji} ${def.name}`,
      items:         droppedItems,
      pityTriggered,
    };
  });
}

/**
 * Oyuncunun lootbox envanterini döndürür.
 */
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

/**
 * Oyuncunun pity sayaçlarını döndürür (UI için).
 */
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
