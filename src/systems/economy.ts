import type { PrismaClient } from '@prisma/client';
import {
  AUTO_SINK_COIN_PER_ITEM,
  AUTO_SINK_XP_PER_ITEM,
  MAINTENANCE_DAILY_AMT,
  MAINTENANCE_DAILY_ITEM,
  MAINTENANCE_MISS_EFFECTIVENESS_LOSS,
  REPAIR_BASE_COST,
  REPAIR_EFFECTIVENESS_FULL,
} from '../config';
import { withLock } from '../utils/lock';
import { addXP } from './xp';

/**
 * Baykusu tamir eder, effectiveness degerini 100'e ceker.
 */
export async function repair(prisma: PrismaClient, playerId: string, owlId: string): Promise<void> {
  await withLock(playerId, 'repair', async () => {
    await prisma.$transaction(async (tx) => {
      const owl = await tx.owl.findUnique({
        where: { id: owlId },
        select: { id: true, ownerId: true, effectiveness: true },
      });
      if (!owl || owl.ownerId !== playerId) {
        throw new Error('Baykus bulunamadi.');
      }

      const player = await tx.player.findUnique({
        where: { id: playerId },
        select: { coins: true },
      });
      if (!player) {
        throw new Error('Oyuncu bulunamadi.');
      }

      if (player.coins < REPAIR_BASE_COST) {
        throw new Error('Tamir icin yeterli coin yok.');
      }

      await tx.player.update({
        where: { id: playerId },
        data: { coins: { decrement: REPAIR_BASE_COST } },
      });
      await tx.owl.update({
        where: { id: owlId },
        data: { effectiveness: REPAIR_EFFECTIVENESS_FULL },
      });
    });
  });
}

/**
 * Gunluk bakim item'ini dusurur, yoksa effectiveness cezasi uygular.
 */
export async function dailyMaintenance(prisma: PrismaClient, playerId: string): Promise<void> {
  await withLock(playerId, 'maintenance', async () => {
    await prisma.$transaction(async (tx) => {
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
          return;
        }
        await tx.owl.update({
          where: { id: mainOwl.id },
          data: {
            effectiveness: {
              decrement: MAINTENANCE_MISS_EFFECTIVENESS_LOSS,
            },
          },
        });
        return;
      }

      await tx.inventoryItem.update({
        where: { ownerId_itemName: { ownerId: playerId, itemName: MAINTENANCE_DAILY_ITEM } },
        data: { quantity: { decrement: MAINTENANCE_DAILY_AMT } },
      });
    });
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
): Promise<void> {
  await withLock(playerId, 'autosink', async () => {
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

      const sinkQty = Math.min(qty, item.quantity);
      if (sinkQty <= 0) {
        return;
      }

      await tx.inventoryItem.update({
        where: { ownerId_itemName: { ownerId: playerId, itemName } },
        data: { quantity: { decrement: sinkQty } },
      });
      await tx.player.update({
        where: { id: playerId },
        data: {
          coins: { increment: sinkQty * AUTO_SINK_COIN_PER_ITEM },
        },
      });
    });

    await addXP(prisma, playerId, qty * AUTO_SINK_XP_PER_ITEM, 'autoSink');
  });
}
