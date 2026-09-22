import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  AUTO_SINK_COIN_PER_ITEM,
  AUTO_SINK_XP_PER_ITEM,
  MAINTENANCE_DAILY_AMT,
  MAINTENANCE_DAILY_ITEM,
  MAINTENANCE_MISS_EFFECTIVENESS_LOSS,
} from '../config';
import { withLock } from '../utils/lock';
import { addXP } from './xp';
import { applyInventoryQuantityInRedis } from '../state/player-state';

/**
 * Gunluk bakim item'ini dusurur, yoksa effectiveness cezasi uygular.
 */
export async function dailyMaintenance(
  prisma: PrismaClient,
  playerId: string,
  redis?: Redis,
): Promise<void> {
  await withLock(playerId, 'maintenance', async () => {
    const sync = await prisma.$transaction(async (tx) => {
      const inventoryItem = await tx.inventoryItem.findUnique({
        where: {
          ownerId_itemName: {
            ownerId: playerId,
            itemName: MAINTENANCE_DAILY_ITEM,
          },
        },
      });

      if (!inventoryItem || inventoryItem.quantity < MAINTENANCE_DAILY_AMT) {
        const mainOwl = await tx.owl.findFirst({
          where: { ownerId: playerId, isMain: true },
          select: { id: true, effectiveness: true },
        });
        if (!mainOwl) {
          return null;
        }
        await tx.owl.update({
          where: { id: mainOwl.id },
          data: {
            effectiveness: {
              decrement: MAINTENANCE_MISS_EFFECTIVENESS_LOSS,
            },
          },
        });
        return null;
      }

      const remaining = inventoryItem.quantity - MAINTENANCE_DAILY_AMT;
      if (remaining <= 0) {
        await tx.inventoryItem.delete({
          where: { ownerId_itemName: { ownerId: playerId, itemName: MAINTENANCE_DAILY_ITEM } },
        });
      } else {
        await tx.inventoryItem.update({
          where: { ownerId_itemName: { ownerId: playerId, itemName: MAINTENANCE_DAILY_ITEM } },
          data: { quantity: remaining },
        });
      }

      return { itemName: MAINTENANCE_DAILY_ITEM, quantity: Math.max(0, remaining) };
    });

    if (redis && sync) {
      await applyInventoryQuantityInRedis(
        redis,
        playerId,
        sync.itemName,
        sync.quantity,
        { itemType: 'Materyal', rarity: 'Common' },
      );
    }
  });
}

/**
 * Tasma limiti asan itemleri coin/XP'ye cevirir.
 */
export async function autoSink(
  prisma: PrismaClient,
  playerId: string,
  itemName: string,
  qty: number,
  redis?: Redis,
): Promise<void> {
  await withLock(playerId, 'autosink', async () => {
    let sinkQty = 0;
    let remainingQty: number | null = null;

    await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({
        where: {
          ownerId_itemName: {
            ownerId: playerId,
            itemName,
          },
        },
      });
      if (!item) {
        return;
      }

      sinkQty = Math.min(qty, item.quantity);
      if (sinkQty <= 0) {
        return;
      }

      remainingQty = item.quantity - sinkQty;
      if (remainingQty <= 0) {
        await tx.inventoryItem.delete({
          where: { ownerId_itemName: { ownerId: playerId, itemName } },
        });
        remainingQty = 0;
      } else {
        await tx.inventoryItem.update({
          where: { ownerId_itemName: { ownerId: playerId, itemName } },
          data: { quantity: remainingQty },
        });
      }
      await tx.player.update({
        where: { id: playerId },
        data: {
          coins: { increment: sinkQty * AUTO_SINK_COIN_PER_ITEM },
        },
      });
    });

    if (sinkQty > 0) {
      await addXP(prisma, playerId, sinkQty * AUTO_SINK_XP_PER_ITEM, 'autoSink', undefined, undefined, redis);
      if (redis && remainingQty !== null) {
        await applyInventoryQuantityInRedis(redis, playerId, itemName, remainingQty);
      }
    }
  });
}
