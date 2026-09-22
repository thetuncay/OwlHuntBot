import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { DISMANTLE_TABLE } from '../config';
import { withLock } from '../utils/lock';
import { syncInventoryItemsFromPg } from '../state/player-state';
import { fireQuest } from './quest-tracker';

/**
 * Bir eşyayı parçalayarak materyal üretir.
 */
export async function dismantleItem(
  prisma: PrismaClient,
  playerId: string,
  itemName: string,
  quantity = 1,
  redis?: Redis,
) {
  return withLock(playerId, 'dismantle', async () => {
    return prisma.$transaction(async (tx) => {
      const invItem = await tx.inventoryItem.findUnique({
        where: { ownerId_itemName: { ownerId: playerId, itemName } },
      });

      if (!invItem || invItem.quantity < quantity) {
        throw new Error('Yetersiz eşya miktarı.');
      }

      const dismantleResult = DISMANTLE_TABLE[itemName];
      if (!dismantleResult) {
        throw new Error('Bu eşya parçalanamaz.');
      }

      if (invItem.quantity === quantity) {
        await tx.inventoryItem.delete({
          where: { id: invItem.id },
        });
      } else {
        await tx.inventoryItem.update({
          where: { id: invItem.id },
          data: { quantity: { decrement: quantity } },
        });
      }

      const produced: { itemName: string; quantity: number }[] = [];

      for (const res of dismantleResult) {
        let totalProduced = 0;
        for (let i = 0; i < quantity; i++) {
          totalProduced += Math.floor(Math.random() * (res.max - res.min + 1)) + res.min;
        }

        produced.push({ itemName: res.itemName, quantity: totalProduced });

        await tx.inventoryItem.upsert({
          where: { ownerId_itemName: { ownerId: playerId, itemName: res.itemName } },
          create: {
            ownerId: playerId,
            itemName: res.itemName,
            itemType: 'Materyal',
            rarity: 'Uncommon',
            quantity: totalProduced,
          },
          update: {
            quantity: { increment: totalProduced },
          },
        });
      }

      return produced;
    }).then(async (produced) => {
      if (redis) {
        await syncInventoryItemsFromPg(redis, prisma, playerId, [
          itemName,
          ...produced.map((entry) => entry.itemName),
        ]);
      }
      await fireQuest(prisma, playerId, 'dismantle', quantity);
      return produced;
    });
  });
}

/**
 * Envanterdeki tüm parçalanabilir avları tek işlemde parçalar.
 */
export async function dismantleAllPrey(
  prisma: PrismaClient,
  playerId: string,
  redis?: Redis,
) {
  return withLock(playerId, 'dismantle', async () => {
    const result = await prisma.$transaction(async (tx) => {
      const avItems = await tx.inventoryItem.findMany({
        where: { ownerId: playerId, itemType: 'Av' },
      });
      const dismantleable = avItems.filter((i) => i.itemName in DISMANTLE_TABLE);
      if (dismantleable.length === 0) {
        throw new Error('Parçalanacak av bulunamadı.');
      }

      const producedMap = new Map<string, number>();
      const dismantled: { itemName: string; quantity: number }[] = [];
      let totalDismantledQty = 0;
      const touchedItemNames = new Set<string>();

      for (const invItem of dismantleable) {
        const { itemName, quantity } = invItem;
        const dismantleResult = DISMANTLE_TABLE[itemName]!;

        await tx.inventoryItem.delete({ where: { id: invItem.id } });
        dismantled.push({ itemName, quantity });
        totalDismantledQty += quantity;
        touchedItemNames.add(itemName);

        for (const res of dismantleResult) {
          let totalProduced = 0;
          for (let i = 0; i < quantity; i++) {
            totalProduced += Math.floor(Math.random() * (res.max - res.min + 1)) + res.min;
          }
          producedMap.set(res.itemName, (producedMap.get(res.itemName) ?? 0) + totalProduced);
          touchedItemNames.add(res.itemName);

          await tx.inventoryItem.upsert({
            where: { ownerId_itemName: { ownerId: playerId, itemName: res.itemName } },
            create: {
              ownerId: playerId,
              itemName: res.itemName,
              itemType: 'Materyal',
              rarity: 'Uncommon',
              quantity: totalProduced,
            },
            update: {
              quantity: { increment: totalProduced },
            },
          });
        }
      }

      return {
        dismantled,
        produced: Array.from(producedMap.entries()).map(([itemName, quantity]) => ({ itemName, quantity })),
        totalDismantledQty,
        touchedItemNames: [...touchedItemNames],
      };
    });

    if (redis) {
      await syncInventoryItemsFromPg(redis, prisma, playerId, result.touchedItemNames);
    }
    await fireQuest(prisma, playerId, 'dismantle', result.totalDismantledQty);
    return { dismantled: result.dismantled, produced: result.produced };
  });
}
