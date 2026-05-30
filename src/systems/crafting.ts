import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { DISMANTLE_TABLE, CRAFTING_RECIPES } from '../config';
import { withLock } from '../utils/lock';
import { trackQuestProgress } from './daily-quests';
import { hydratePlayerState, deductCoinsInRedis, reloadInventoryFromPg } from '../state/player-state';

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
        where: { ownerId_itemName: { ownerId: playerId, itemName } }
      });

      if (!invItem || invItem.quantity < quantity) {
        throw new Error('Yetersiz eşya miktarı.');
      }

      const dismantleResult = DISMANTLE_TABLE[itemName];
      if (!dismantleResult) {
        throw new Error('Bu eşya parçalanamaz.');
      }

      // Eşyayı tüket
      if (invItem.quantity === quantity) {
        await tx.inventoryItem.delete({
          where: { id: invItem.id }
        });
      } else {
        await tx.inventoryItem.update({
          where: { id: invItem.id },
          data: { quantity: { decrement: quantity } }
        });
      }

      const produced: { itemName: string; quantity: number }[] = [];

      // Materyalleri üret
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
            rarity: 'Uncommon', // Genelde materyaller uncommon
            quantity: totalProduced
          },
          update: {
            quantity: { increment: totalProduced }
          }
        });
      }

      return produced;
    }).then(async (produced) => {
      if (redis) await reloadInventoryFromPg(redis, prisma, playerId);
      return produced;
    });
  });
}

/**
 * Recipe kullanarak yeni bir eşya üretir.
 */
export async function craftItem(
  prisma: PrismaClient,
  playerId: string,
  recipeId: string,
  redis?: Redis,
) {
  return withLock(playerId, 'craft', async () => {
    const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
    if (!recipe) throw new Error('Tarif bulunamadı.');

    if (redis) {
      await hydratePlayerState(redis, prisma, playerId);
    }

    return prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { id: playerId },
        select: { coins: true }
      });

      if (!player || player.coins < recipe.requiredCoins) {
        throw new Error('Yetersiz coin.');
      }

      // Materyal kontrolü
      for (const mat of recipe.requiredMaterials) {
        const inv = await tx.inventoryItem.findUnique({
          where: { ownerId_itemName: { ownerId: playerId, itemName: mat.itemName } }
        });
        if (!inv || inv.quantity < mat.quantity) {
          throw new Error(`Yetersiz malzeme: ${mat.itemName}`);
        }
      }

      // Coin tüketimi (Redis-first — upgrade ile aynı pattern)
      if (redis) {
        await deductCoinsInRedis(redis, playerId, recipe.requiredCoins, prisma);
      } else {
        await tx.player.update({
          where: { id: playerId },
          data: { coins: { decrement: recipe.requiredCoins } }
        });
      }

      // Materyal tüketimi
      for (const mat of recipe.requiredMaterials) {
        await tx.inventoryItem.update({
          where: { ownerId_itemName: { ownerId: playerId, itemName: mat.itemName } },
          data: { quantity: { decrement: mat.quantity } }
        });
      }

      // Sıfır kalan satırları temizle
      await tx.inventoryItem.deleteMany({
        where: { ownerId: playerId, quantity: { lte: 0 } },
      });

      // Sonuç üretimi
      await tx.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: playerId, itemName: recipe.resultItem.itemName } },
        create: {
          ownerId: playerId,
          itemName: recipe.resultItem.itemName,
          itemType: recipe.resultItem.itemType,
          rarity: recipe.resultItem.rarity,
          quantity: recipe.resultItem.quantity
        },
        update: {
          quantity: { increment: recipe.resultItem.quantity }
        }
      });

      trackQuestProgress(tx as any, playerId, 'craft').catch(() => null);

      return recipe.resultItem;
    }).then(async (result) => {
      if (redis) {
        await reloadInventoryFromPg(redis, prisma, playerId);
      }
      return result;
    });
  });
}
