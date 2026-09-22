/**
 * rebalance-compensation.ts — Stat Rebalance V2 telafi kutusu
 */

import type { PrismaClient } from '@prisma/client';
import { formatCoinLabel } from '../config/ui-emojis';
import type { Redis } from 'ioredis';
import { applyCoinDeltaInRedis, rehydratePlayerState } from '../state/player-state';

export interface CompensationPayload {
  coins: number;
  items: Array<{
    itemName: string;
    itemType: string;
    rarity: string;
    quantity: number;
  }>;
}

export interface CompensationSnapshot {
  species: string;
  tier: number;
  quality: string;
  avgEffective: number;
  stats: Record<string, number>;
}

const COMPENSATION_TIERS: Array<{
  maxAvg: number;
  coins: number;
  lootboxes: number;
  extras: CompensationPayload['items'];
}> = [
  { maxAvg: 25, coins: 2_000, lootboxes: 1, extras: [] },
  {
    maxAvg: 44,
    coins: 8_000,
    lootboxes: 3,
    extras: [{ itemName: 'Keskin Nişan', itemType: 'Buff', rarity: 'Uncommon', quantity: 1 }],
  },
  {
    maxAvg: 64,
    coins: 20_000,
    lootboxes: 5,
    extras: [
      { itemName: 'Keskin Nişan', itemType: 'Buff', rarity: 'Uncommon', quantity: 1 },
      { itemName: 'Av Kokusu', itemType: 'Buff', rarity: 'Uncommon', quantity: 1 },
    ],
  },
  {
    maxAvg: 79,
    coins: 40_000,
    lootboxes: 8,
    extras: [
      { itemName: 'Keskin Nişan', itemType: 'Buff', rarity: 'Uncommon', quantity: 1 },
      { itemName: 'Yırtıcı İksiri', itemType: 'Buff', rarity: 'Rare', quantity: 1 },
      { itemName: 'Tüy Parçası', itemType: 'Material', rarity: 'Common', quantity: 5 },
    ],
  },
  {
    maxAvg: Infinity,
    coins: 75_000,
    lootboxes: 12,
    extras: [
      { itemName: 'Keskin Nişan', itemType: 'Buff', rarity: 'Uncommon', quantity: 2 },
      { itemName: 'Yırtıcı İksiri', itemType: 'Buff', rarity: 'Rare', quantity: 1 },
      { itemName: 'Nadir İz', itemType: 'Material', rarity: 'Rare', quantity: 3 },
      { itemName: 'Efsane Av Ruhu', itemType: 'Buff', rarity: 'Rare', quantity: 1 },
    ],
  },
];

export function computeCompensationPayload(avgEffective: number): CompensationPayload {
  const tier = COMPENSATION_TIERS.find((t) => avgEffective < t.maxAvg) ?? COMPENSATION_TIERS.at(-1)!;
  const items: CompensationPayload['items'] = [
    { itemName: 'Eşya Kutusu', itemType: 'Lootbox', rarity: 'Rare', quantity: tier.lootboxes },
    ...tier.extras,
  ];
  return { coins: tier.coins, items };
}

export function compensationExpiresAt(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 7);
  return d;
}

export function daysUntilExpiry(expiresAt: Date, now = new Date()): number {
  const ms = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export interface ClaimResult {
  ok: boolean;
  message: string;
  payload?: CompensationPayload;
  daysLeft?: number;
}

export async function getPendingCompensation(
  prisma: PrismaClient,
  playerId: string,
): Promise<{ id: string; payload: CompensationPayload; expiresAt: Date; claimedAt: Date | null } | null> {
  const row = await prisma.rebalanceCompensation.findUnique({ where: { playerId } });
  if (!row || row.claimedAt) return null;
  if (row.expiresAt < new Date()) {
    await prisma.rebalanceCompensation.delete({ where: { id: row.id } }).catch(() => null);
    return null;
  }
  return {
    id: row.id,
    payload: row.payload as unknown as CompensationPayload,
    expiresAt: row.expiresAt,
    claimedAt: row.claimedAt,
  };
}

export async function claimRebalanceCompensation(
  prisma: PrismaClient,
  playerId: string,
  redis?: Redis,
): Promise<ClaimResult> {
  const row = await prisma.rebalanceCompensation.findUnique({ where: { playerId } });
  if (!row) {
    return { ok: false, message: '❌ Bekleyen telafi paketin yok.' };
  }
  if (row.claimedAt) {
    return { ok: false, message: '✅ Telafi paketini zaten aldın.' };
  }
  if (row.expiresAt < new Date()) {
    await prisma.rebalanceCompensation.delete({ where: { id: row.id } }).catch(() => null);
    return { ok: false, message: '⏰ Telafi süresi doldu (7 gün). Paket artık alınamaz.' };
  }

  const payload = row.payload as unknown as CompensationPayload;
  const daysLeft = daysUntilExpiry(row.expiresAt);

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.rebalanceCompensation.findUnique({ where: { playerId } });
    if (!fresh || fresh.claimedAt || fresh.expiresAt < new Date()) {
      throw new Error('EXPIRED');
    }

    if (payload.coins > 0) {
      await tx.player.update({
        where: { id: playerId },
        data: { coins: { increment: payload.coins } },
      });
    }

    for (const item of payload.items) {
      if (item.quantity <= 0) continue;
      await tx.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: playerId, itemName: item.itemName } },
        create: {
          ownerId: playerId,
          itemName: item.itemName,
          itemType: item.itemType,
          rarity: item.rarity,
          quantity: item.quantity,
        },
        update: { quantity: { increment: item.quantity } },
      });
    }

    await tx.rebalanceCompensation.update({
      where: { id: row.id },
      data: { claimedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        playerId,
        action: 'rebalance_compensation_claim',
        before: {},
        after: { coins: payload.coins, items: payload.items, daysLeft },
      },
    });
  });

  if (redis) {
    await applyCoinDeltaInRedis(redis, playerId, payload.coins, prisma);
    await rehydratePlayerState(redis, prisma, playerId);
  }

  const itemLines = payload.items.map((i) => `• ${i.itemName} x${i.quantity}`).join('\n');
  return {
    ok: true,
    message: `🎁 **Telafi paketi alındı!**\n${formatCoinLabel(payload.coins)}\n${itemLines}`,
    payload,
    daysLeft,
  };
}
