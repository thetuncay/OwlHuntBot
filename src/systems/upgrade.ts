import type { PrismaClient } from '@prisma/client';
import { formatCoinLabel } from '../config/ui-emojis';
import type { Redis } from 'ioredis';
import {
  ITEM_MAX_PER_ATTEMPT,
  UPGRADE_COIN_DISCOUNT_CAP,
  UPGRADE_COST,
  UPGRADE_ITEM_BONUS,
} from '../config';
import type { BuffEffects, OwlStatKey } from '../types';
import {
  upgradeCoinCost,
  upgradeCoinCostAfterDiscount,
  upgradeMaterialRequirement,
} from '../utils/math';
import { withLock } from '../utils/lock';
import { resolveUpgradeGate } from '../utils/upgrade-deps';
import {
  applyTrainedDelta,
  getEffectiveStat,
  getEffectiveStats,
  getTrainedStat,
  getTrainedStats,
  type OwlStatRecord,
} from '../utils/owl-stats';
import { getBuffEffects, drainBuffCharge } from './items';
import { hydratePlayerState, deductCoinsInRedis, applyOwlStatUpdate, syncInventoryQuantitiesInRedis, type InventoryQuantitySync } from '../state/player-state';
import { checkAndApplyMoonEvolution, type MoonEvolutionResult } from './owl-moon-evolution';
import { fireQuest } from './quest-tracker';

export interface UpgradePreview {
  statTrained:     number;
  statEffective:   number;
  coinCost:        number;
  coinCostBase:    number;
  coinDiscountPct: number;
  materialCost:    number;
  materialName:    string;
  /** Bulk plan için: oyuncunun coin bakiyesi. */
  playerCoins:     number;
  /** Bulk plan için: birincil materyal stoku. */
  materialHave:    number;
  /** Bulk plan için: buff/item indirim oranı (0–cap). */
  discountFraction: number;
  requiredItems:   string[];
  depCheck: {
    ok:        boolean;
    reason?:   'dependency' | 'spread';
    dependsOn: OwlStatKey | null;
    required:  number;
    current:   number;
    gap:       number;
    suggestion: OwlStatKey | null;
  };
}

export interface UpgradeResult {
  success:  boolean;
  oldValue: number;
  newValue: number;
  evolution?: MoonEvolutionResult;
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

/** Buff + opsiyonel consumable bonus → toplam coin indirimi (0–UPGRADE_COIN_DISCOUNT_CAP). */
export function computeUpgradeCoinDiscount(
  buffEffects: BuffEffects,
  itemBonusPoints: number,
): number {
  const itemDiscount = itemBonusPoints * 0.01;
  return Math.min(UPGRADE_COIN_DISCOUNT_CAP, buffEffects.upgradeCoinDiscount + itemDiscount);
}

export async function getUpgradePreview(
  prisma: PrismaClient,
  playerId: string,
  owlId: string,
  stat: OwlStatKey,
  itemNames: string[],
  _redis?: Redis,
): Promise<UpgradePreview> {
  if (itemNames.length > ITEM_MAX_PER_ATTEMPT) {
    throw new Error(`Tek denemede en fazla ${ITEM_MAX_PER_ATTEMPT} farklı item kullanılabilir.`);
  }
  if (new Set(itemNames).size !== itemNames.length) {
    throw new Error('Aynı item aynı denemede iki kez kullanılamaz.');
  }

  const [player, owl] = await Promise.all([
    prisma.player.findUnique({ where: { id: playerId } }),
    prisma.owl.findUnique({ where: { id: owlId } }),
  ]);
  if (!player || !owl || owl.ownerId !== playerId) {
    throw new Error('Oyuncu veya baykuş bilgisi geçersiz.');
  }

  const trainedLevel = getTrainedStat(owl, stat);
  const effectiveLevel = getEffectiveStat(owl, stat);
  const effectiveStats = getEffectiveStats(owl);

  const trainedStats = getTrainedStats(owl);
  const depCheck = resolveUpgradeGate(stat, trainedStats, effectiveStats);

  const requiredCosts = UPGRADE_COST[stat] ?? [];
  const materialName = requiredCosts[0]?.itemName ?? 'Materyal';
  const materialCost = upgradeMaterialRequirement(trainedLevel);
  const coinCostBase = upgradeCoinCost(trainedLevel);

  const itemBonus = itemNames.reduce((sum, n) => sum + (UPGRADE_ITEM_BONUS[n] ?? 0), 0);
  const buffEffects = await getBuffEffects(prisma, playerId, 'upgrade');
  const discount = computeUpgradeCoinDiscount(buffEffects, itemBonus);
  const coinCost = upgradeCoinCostAfterDiscount(trainedLevel, discount);
  const coinDiscountPct = Math.round(discount * 100);

  const invChecks = await Promise.all(
    requiredCosts.map((cost) =>
      prisma.inventoryItem
        .findUnique({ where: { ownerId_itemName: { ownerId: playerId, itemName: cost.itemName } } })
        .then((inv) => ({ cost, has: inv?.quantity ?? 0 })),
    ),
  );

  const requiredItems = [
    ...invChecks.map(
      ({ cost, has }) => `${cost.itemName} x${materialCost} (sahip: ${has})`,
    ),
    `Ücret: ${formatCoinLabel(coinCost)} (sahip: ${formatCoinLabel(player.coins)})`,
  ];

  return {
    statTrained: trainedLevel,
    statEffective: effectiveLevel,
    coinCost,
    coinCostBase,
    coinDiscountPct,
    materialCost,
    materialName,
    playerCoins: player.coins,
    materialHave: invChecks[0]?.has ?? 0,
    discountFraction: discount,
    requiredItems,
    depCheck,
  };
}

export async function attemptUpgrade(
  prisma: PrismaClient,
  playerId: string,
  owlId: string,
  stat: OwlStatKey,
  itemNames: string[],
  redis?: Redis,
): Promise<UpgradeResult> {
  return withLock(playerId, 'financial', async () => {
    if (itemNames.length > ITEM_MAX_PER_ATTEMPT) {
      throw new Error(`Tek denemede en fazla ${ITEM_MAX_PER_ATTEMPT} farklı item kullanılabilir.`);
    }
    if (new Set(itemNames).size !== itemNames.length) {
      throw new Error('Aynı item aynı denemede iki kez kullanılamaz.');
    }

    return prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { id: playerId } });
      const owl = await tx.owl.findUnique({ where: { id: owlId } });
      if (!player || !owl || owl.ownerId !== playerId) {
        throw new Error('Oyuncu veya baykuş bilgisi geçersiz.');
      }

      const oldTrained = getTrainedStat(owl, stat);

      const effectiveStats = getEffectiveStats(owl);

      const trainedStats = getTrainedStats(owl);
      const gate = resolveUpgradeGate(stat, trainedStats, effectiveStats);
      if (!gate.ok && gate.reason === 'dependency' && gate.dependsOn) {
        throw new Error(
          `DEP_FAIL:${gate.dependsOn}:${gate.required}:${gate.current}:${gate.suggestion}`,
        );
      }
      if (!gate.ok && gate.reason === 'spread' && gate.dependsOn) {
        throw new Error(
          `SPREAD_FAIL:${gate.dependsOn}:${gate.required}:${gate.current}:${gate.suggestion}`,
        );
      }

      const requiredCosts = UPGRADE_COST[stat] ?? [];
      const matRequirement = upgradeMaterialRequirement(oldTrained);
      const itemBonus = itemNames.reduce((sum, n) => sum + (UPGRADE_ITEM_BONUS[n] ?? 0), 0);
      const buffEffects = await getBuffEffects(prisma, playerId, 'upgrade');
      const discount = computeUpgradeCoinDiscount(buffEffects, itemBonus);
      const coinCost = upgradeCoinCostAfterDiscount(oldTrained, discount);

      if (player.coins < coinCost) {
        throw new Error(`Yetersiz bakiye: ${formatCoinLabel(coinCost)} gerekli.`);
      }

      if (redis) {
        await hydratePlayerState(redis, prisma, playerId);
      }

      const requiredInvChecks = await Promise.all(
        requiredCosts.map((cost) =>
          (tx.inventoryItem.findUnique({
            where: { ownerId_itemName: { ownerId: playerId, itemName: cost.itemName } },
          }) as Promise<{ quantity: number } | null>).then((inv) => ({ cost, inv })),
        ),
      );
      for (const { cost, inv } of requiredInvChecks) {
        if (!inv || inv.quantity < matRequirement) {
          throw new Error(
            `Yetersiz malzeme: **${cost.itemName}** (gerekli: ${matRequirement}, sahip: ${inv?.quantity ?? 0})`,
          );
        }
      }

      const bonusInvChecks = await Promise.all(
        itemNames.map((itemName) =>
          (tx.inventoryItem.findUnique({
            where: { ownerId_itemName: { ownerId: playerId, itemName } },
          }) as Promise<{ quantity: number } | null>).then((inv) => ({ itemName, inv })),
        ),
      );
      for (const { itemName, inv } of bonusInvChecks) {
        if (!inv || inv.quantity < 1) {
          throw new Error(`Gerekli kaynak eksik: ${itemName}`);
        }
      }

      if (!redis) {
        await tx.player.update({
          where: { id: playerId },
          data: { coins: { decrement: coinCost } },
        });
      }

      const inventorySync: InventoryQuantitySync[] = [];

      for (const { cost, inv } of requiredInvChecks) {
        const remaining = inv!.quantity - matRequirement;
        if (remaining <= 0) {
          await tx.inventoryItem.delete({
            where: { ownerId_itemName: { ownerId: playerId, itemName: cost.itemName } },
          });
          inventorySync.push({ itemName: cost.itemName, quantity: 0 });
        } else {
          await tx.inventoryItem.update({
            where: { ownerId_itemName: { ownerId: playerId, itemName: cost.itemName } },
            data: { quantity: remaining },
          });
          inventorySync.push({ itemName: cost.itemName, quantity: remaining });
        }
      }

      for (const { itemName, inv } of bonusInvChecks) {
        const remaining = inv!.quantity - 1;
        if (remaining <= 0) {
          await tx.inventoryItem.delete({
            where: { ownerId_itemName: { ownerId: playerId, itemName } },
          });
          inventorySync.push({ itemName, quantity: 0 });
        } else {
          await tx.inventoryItem.update({
            where: { ownerId_itemName: { ownerId: playerId, itemName } },
            data: { quantity: remaining },
          });
          inventorySync.push({ itemName, quantity: remaining });
        }
      }

      const owlMut: OwlStatRecord = { ...owl };
      applyTrainedDelta(owlMut, stat, 1);
      const newTrained = oldTrained + 1;

      const updateData = owlStatUpdatePayload(owlMut);
      await tx.owl.update({ where: { id: owlId }, data: updateData });

      return {
        success: true,
        oldValue: oldTrained,
        newValue: newTrained,
        coinCost,
        updateData,
        inventorySync,
      };
    }).then(async (result) => {
      if (redis) {
        await deductCoinsInRedis(redis, playerId, result.coinCost, prisma);
        await applyOwlStatUpdate(redis, prisma, playerId, owlId, result.updateData);
        if (result.inventorySync.length > 0) {
          await syncInventoryQuantitiesInRedis(redis, playerId, result.inventorySync);
        }
      }
      await drainBuffCharge(prisma, playerId, 'upgrade');
      const evolution = await checkAndApplyMoonEvolution(prisma, owlId);
      await fireQuest(prisma, playerId, 'upgrade', 1);
      await fireQuest(prisma, playerId, 'upgrade_stat', 1, { stat });
      if (evolution) await fireQuest(prisma, playerId, 'moon_tier', 1);
      const { coinCost: _c, updateData: _u, inventorySync: _s, ...upgradeResult } = result;
      return {
        ...upgradeResult,
        evolution: evolution ?? undefined,
      };
    });
  });
}
