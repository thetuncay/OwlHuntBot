/**
 * runes.ts — Rün drop, liste, kesin apply (G3 kalıcı güç).
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  RUNE_APPLIED_REDIS_PREFIX,
  RUNE_DEF_BY_ID,
  RUNE_DEF_BY_NAME,
  RUNE_DEFS,
  RUNE_DROP_GATE_FIGHT,
  RUNE_DROP_GATE_TAME,
  RUNE_ITEM_TYPE,
  RUNE_RARITY_TO_INVENTORY,
  RUNE_RARITY_WEIGHTS,
  runeBonusesToStatDeltas,
  runeRarityWeightMult,
  type RuneDef,
  type RuneRarity,
} from '../config/runes';
import {
  addInventoryItemInRedis,
  applyOwlStatUpdate,
  applyInventoryQuantityInRedis,
} from '../state/player-state';
import { withLock } from '../utils/lock';
import {
  applyTrainedDelta,
  type OwlStatRecord,
} from '../utils/owl-stats';
import { formatRuneDropLine, renderRuneEmoji } from '../utils/rune-ux';

export type RuneDropSource = 'tame' | 'fight';

export interface RuneDropResult {
  def: RuneDef;
  line: string;
}

function appliedKey(owlId: string): string {
  return `${RUNE_APPLIED_REDIS_PREFIX}${owlId}`;
}

function pickWeightedRarity(
  mult: Record<RuneRarity, number>,
): RuneRarity {
  const entries = (Object.keys(RUNE_RARITY_WEIGHTS) as RuneRarity[]).map((r) => ({
    rarity: r,
    weight: RUNE_RARITY_WEIGHTS[r] * mult[r],
  }));
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.rarity;
  }
  return entries[entries.length - 1]!.rarity;
}

function pickRuneOfRarity(rarity: RuneRarity): RuneDef {
  const pool = RUNE_DEFS.filter((d) => d.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)] ?? RUNE_DEFS[0]!;
}

/**
 * Düşük şanslı rün roll — envantere yazar, drop satırı döner.
 *
 * @param prisma Prisma
 * @param redis Redis (yoksa PG upsert)
 * @param playerId Oyuncu
 * @param source tame | fight
 * @param tier Düşman tier
 * @param quality Düşman kalite
 */
export async function maybeDropRune(
  prisma: PrismaClient,
  redis: Redis | undefined,
  playerId: string,
  source: RuneDropSource,
  tier: number,
  quality: string,
): Promise<RuneDropResult | null> {
  const gate = source === 'tame' ? RUNE_DROP_GATE_TAME : RUNE_DROP_GATE_FIGHT;
  if (Math.random() >= gate) return null;

  const rarity = pickWeightedRarity(runeRarityWeightMult(tier, quality));
  const def = pickRuneOfRarity(rarity);
  const invRarity = RUNE_RARITY_TO_INVENTORY[def.rarity];

  if (redis) {
    await addInventoryItemInRedis(
      redis,
      playerId,
      def.name,
      RUNE_ITEM_TYPE,
      invRarity,
      1,
      prisma,
    );
  } else {
    await prisma.inventoryItem.upsert({
      where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
      create: {
        ownerId: playerId,
        itemName: def.name,
        itemType: RUNE_ITEM_TYPE,
        rarity: invRarity,
        quantity: 1,
      },
      update: { quantity: { increment: 1 } },
    });
  }

  return { def, line: formatRuneDropLine(def) };
}

/**
 * ID veya isimle rün tanımı.
 *
 * @param token `040` veya ad
 */
export function resolveRuneDef(token: string): RuneDef | null {
  const raw = token.trim();
  if (!raw) return null;
  const byId = RUNE_DEF_BY_ID.get(raw.padStart(3, '0')) ?? RUNE_DEF_BY_ID.get(raw);
  if (byId) return byId;
  return RUNE_DEF_BY_NAME.get(raw.toLocaleLowerCase('tr-TR')) ?? null;
}

/**
 * Oyuncunun rün envanteri (tanımlı taşlar).
 *
 * @param prisma Prisma
 * @param playerId Oyuncu
 */
export async function listOwnedRunes(
  prisma: PrismaClient,
  playerId: string,
): Promise<Array<{ def: RuneDef; quantity: number }>> {
  const names = RUNE_DEFS.map((d) => d.name);
  const rows = await prisma.inventoryItem.findMany({
    where: {
      ownerId: playerId,
      itemType: RUNE_ITEM_TYPE,
      itemName: { in: names },
      quantity: { gt: 0 },
    },
    select: { itemName: true, quantity: true },
  });
  const qty = new Map(rows.map((r) => [r.itemName, r.quantity]));
  return RUNE_DEFS
    .map((def) => ({ def, quantity: qty.get(def.name) ?? 0 }))
    .filter((x) => x.quantity > 0);
}

/**
 * Main’e uygulanmış rün sayısı.
 *
 * @param redis Redis
 * @param owlId Main owl id
 */
export async function getRuneAppliedCount(redis: Redis, owlId: string): Promise<number> {
  return Number(await redis.get(appliedKey(owlId)) ?? 0);
}

function owlStatUpdatePayload(owl: OwlStatRecord): Record<string, number> {
  return {
    statGagaBase: owl.statGagaBase ?? owl.statGaga ?? 1,
    statGozBase: owl.statGozBase ?? owl.statGoz ?? 1,
    statKulakBase: owl.statKulakBase ?? owl.statKulak ?? 1,
    statKanatBase: owl.statKanatBase ?? owl.statKanat ?? 1,
    statPenceBase: owl.statPenceBase ?? owl.statPence ?? 1,
    statGagaTrained: owl.statGagaTrained ?? 0,
    statGozTrained: owl.statGozTrained ?? 0,
    statKulakTrained: owl.statKulakTrained ?? 0,
    statKanatTrained: owl.statKanatTrained ?? 0,
    statPenceTrained: owl.statPenceTrained ?? 0,
    statGaga: owl.statGaga ?? 1,
    statGoz: owl.statGoz ?? 1,
    statKulak: owl.statKulak ?? 1,
    statKanat: owl.statKanat ?? 1,
    statPence: owl.statPence ?? 1,
  };
}

export interface RuneApplyResult {
  def: RuneDef;
  appliedCount: number;
  emoji: string;
}

/**
 * Rünü main baykuşa uygular — fail RNG yok.
 *
 * @param prisma Prisma
 * @param redis Redis
 * @param playerId Oyuncu
 * @param token ID veya ad
 */
export async function applyRuneToMain(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  token: string,
): Promise<RuneApplyResult> {
  const def = resolveRuneDef(token);
  if (!def) throw new Error('Rün bulunamadı.');

  return withLock(playerId, 'rune_apply', async () => {
    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventoryItem.findUnique({
        where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
      });
      if (!inv || inv.quantity < 1 || inv.itemType !== RUNE_ITEM_TYPE) {
        throw new Error(`Envanterde **${def.name}** yok.`);
      }

      const main = await tx.owl.findFirst({
        where: { ownerId: playerId, isMain: true },
      });
      if (!main) throw new Error('Main baykuş yok.');

      const remaining = inv.quantity - 1;
      if (remaining <= 0) {
        await tx.inventoryItem.delete({
          where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
        });
      } else {
        await tx.inventoryItem.update({
          where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
          data: { quantity: remaining },
        });
      }

      const owlMut: OwlStatRecord = { ...main };
      const deltas = runeBonusesToStatDeltas(def.bonuses);
      for (const [stat, delta] of Object.entries(deltas) as [keyof typeof deltas, number][]) {
        if (delta) applyTrainedDelta(owlMut, stat, delta);
      }
      const updateData = owlStatUpdatePayload(owlMut);
      await tx.owl.update({ where: { id: main.id }, data: updateData });

      await tx.auditLog.create({
        data: {
          playerId,
          action: 'rune_apply',
          before: { itemName: def.name, quantity: inv.quantity },
          after: {
            owlId: main.id,
            runeId: def.id,
            deltas: runeBonusesToStatDeltas(def.bonuses),
            remaining: remaining,
          },
        },
      });

      return { owlId: main.id, updateData, remaining };
    });

    await applyInventoryQuantityInRedis(redis, playerId, def.name, result.remaining, {
      itemType: RUNE_ITEM_TYPE,
      rarity: RUNE_RARITY_TO_INVENTORY[def.rarity],
    });
    await applyOwlStatUpdate(redis, prisma, playerId, result.owlId, result.updateData);

    const appliedCount = await redis.incr(appliedKey(result.owlId));
    await redis.expire(appliedKey(result.owlId), 365 * 24 * 60 * 60);

    return {
      def,
      appliedCount,
      emoji: renderRuneEmoji(def),
    };
  });
}
