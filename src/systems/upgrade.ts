import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  ITEM_MAX_PER_ATTEMPT,
  UPGRADE_BASE_CHANCE,
  UPGRADE_COST,
  UPGRADE_ENDGAME_LEVEL,
  UPGRADE_FAIL_DOWNGRADE_RATE,
  UPGRADE_ITEM_BONUS,
  CONSUMABLE_ITEM_BY_NAME,
} from '../config';
import type { OwlStatKey } from '../types';
import { upgradeChance, upgradeCoinCost, upgradeMaterialRequirement } from '../utils/math';
import { withLock } from '../utils/lock';
import { checkUpgradeDep, suggestNextUpgrade, type AllStats } from '../utils/upgrade-deps';
import { getBuffEffects, drainBuffCharge } from './items';
import { hydratePlayerState, deductCoinsInRedis, applyOwlStatUpdate } from '../state/player-state';

const statFieldMap: Record<OwlStatKey, 'statGaga' | 'statGoz' | 'statKulak' | 'statKanat' | 'statPence'> = {
  gaga:  'statGaga',
  goz:   'statGoz',
  kulak: 'statKulak',
  kanat: 'statKanat',
  pence: 'statPence',
};

export interface UpgradePreview {
  chance:        number;
  statValue:     number;
  requiredItems: string[];
  /** Bağımlılık kontrolü sonucu */
  depCheck: {
    ok:        boolean;
    dependsOn: OwlStatKey | null;
    required:  number;
    current:   number;
    gap:       number;
    suggestion: OwlStatKey | null;
  };
}

export interface UpgradeResult {
  success:   boolean;
  chance:    number;
  oldValue:  number;
  newValue:  number;
}

/** Baykuşun tüm statlarını AllStats formatına çevirir. */
function owlToStats(owl: {
  statGaga: number; statGoz: number; statKulak: number;
  statKanat: number; statPence: number;
}): AllStats {
  return {
    gaga:  owl.statGaga,
    goz:   owl.statGoz,
    kulak: owl.statKulak,
    kanat: owl.statKanat,
    pence: owl.statPence,
  };
}

/**
 * Upgrade şansını ve bağımlılık durumunu döndürür.
 */
export async function getUpgradePreview(
  prisma: PrismaClient,
  playerId: string,
  owlId: string,
  stat: OwlStatKey,
  itemNames: string[],
  consumableBonus = 0,
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

  const field      = statFieldMap[stat];
  const statValue  = owl[field];
  const targetLevel = statValue + 1;
  const stats      = owlToStats(owl);

  // Bağımlılık kontrolü
  const depCheck   = checkUpgradeDep(stat, targetLevel, stats);
  const suggestion = depCheck.ok ? null : suggestNextUpgrade(stat, stats);

  const itemBonus = itemNames.reduce((sum, n) => sum + (UPGRADE_ITEM_BONUS[n] ?? 0), 0);
  const buffEffects = await getBuffEffects(prisma, playerId, 'upgrade');
  const totalItemBonus = itemBonus + buffEffects.upgradeBonus + consumableBonus;
  const chance    = upgradeChance(UPGRADE_BASE_CHANCE, player.level, totalItemBonus, statValue);

  const requiredCosts = UPGRADE_COST[stat] ?? [];
  const matRequirement = upgradeMaterialRequirement(statValue);
  const coinCost = upgradeCoinCost(statValue);

  const invChecks = await Promise.all(
    requiredCosts.map((cost) =>
      prisma.inventoryItem
        .findUnique({ where: { ownerId_itemName: { ownerId: playerId, itemName: cost.itemName } } })
        .then((inv) => ({ cost, has: inv?.quantity ?? 0 })),
    ),
  );
  
  const requiredItems = [
    ...invChecks.map(
      ({ cost, has }) => `${cost.itemName} x${matRequirement} (sahip: ${has})`,
    ),
    `Ücret: ${coinCost.toLocaleString('tr-TR')} 💰 (sahip: ${player.coins.toLocaleString('tr-TR')})`
  ];

  return {
    chance,
    statValue,
    requiredItems,
    depCheck: { ...depCheck, suggestion },
  };
}

/**
 * Seçilen stat için upgrade uygular.
 * Bağımlılık karşılanmıyorsa açıklayıcı hata fırlatır.
 */
export async function attemptUpgrade(
  prisma: PrismaClient,
  playerId: string,
  owlId: string,
  stat: OwlStatKey,
  itemNames: string[],
  consumableBonus = 0,
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
      const owl    = await tx.owl.findUnique({ where: { id: owlId } });
      if (!player || !owl || owl.ownerId !== playerId) {
        throw new Error('Oyuncu veya baykuş bilgisi geçersiz.');
      }

      const field      = statFieldMap[stat];
      const oldValue   = owl[field];
      const targetLevel = oldValue + 1;
      const stats      = owlToStats(owl);

      // ── Bağımlılık kontrolü ───────────────────────────────────────────────
      const depCheck = checkUpgradeDep(stat, targetLevel, stats);
      if (!depCheck.ok && depCheck.dependsOn) {
        const suggestion = suggestNextUpgrade(stat, stats);
        const depName = depCheck.dependsOn.charAt(0).toUpperCase() + depCheck.dependsOn.slice(1);
        throw new Error(
          `DEP_FAIL:${depCheck.dependsOn}:${depCheck.required}:${depCheck.current}:${suggestion}`,
        );
      }

      // ── Zorunlu malzemeleri kontrol et ve tüket ───────────────────────────
      const requiredCosts = UPGRADE_COST[stat] ?? [];
      const matRequirement = upgradeMaterialRequirement(oldValue);
      const coinCost = upgradeCoinCost(oldValue);

      if (player.coins < coinCost) {
        throw new Error(`Yetersiz bakiye: **${coinCost.toLocaleString('tr-TR')}** 💰 gerekli.`);
      }

      if (redis) {
        await hydratePlayerState(redis, prisma, playerId);
        await deductCoinsInRedis(redis, playerId, coinCost);
      }

      // Zorunlu malzeme kontrolü: paralel findUnique
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

      // ── Ek item bonusları kontrolü ────────────────────────────────────────
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

      // Coin ve malzeme tüketimi
      if (!redis) {
        await tx.player.update({
          where: { id: playerId },
          data: { coins: { decrement: coinCost } },
        });
      }

      // Zorunlu malzeme tüketimi: tek updateMany
      if (requiredCosts.length > 0) {
        await tx.inventoryItem.updateMany({
          where: {
            ownerId: playerId,
            itemName: { in: requiredCosts.map((c) => c.itemName) },
          },
          data: { quantity: { decrement: matRequirement } },
        });
      }

      // ── Ek item bonusları tüketimi: tek updateMany ────────────────────────
      if (itemNames.length > 0) {
        await tx.inventoryItem.updateMany({
          where: {
            ownerId: playerId,
            itemName: { in: itemNames },
          },
          data: { quantity: { decrement: 1 } },
        });
      }

      const itemBonus = itemNames.reduce((sum, n) => sum + (UPGRADE_ITEM_BONUS[n] ?? 0), 0);

      // Aktif upgrade buff'larını al (diminishing returns uygulanmış)
      const buffEffects = await getBuffEffects(prisma, playerId, 'upgrade');

      // Consumable (Bileme Taşı) bonusu — Redis'ten oku
      // Not: redis upgrade.ts'e geçilmediği için prisma.$transaction dışında kontrol edilemez
      // Bu yüzden consumable bonus'u itemBonus'a ekliyoruz (transaction öncesi hesaplanır)
      const totalItemBonus = itemBonus + buffEffects.upgradeBonus + consumableBonus;

      const chance    = upgradeChance(UPGRADE_BASE_CHANCE, player.level, totalItemBonus, oldValue);
      const success   = Math.random() * 100 < chance;

      let newValue = oldValue;
      if (success) {
        newValue = oldValue + 1;
      } else if (
        player.level >= UPGRADE_ENDGAME_LEVEL
      ) {
        // Downgrade shield buff'u varsa şansı azalt
        const effectiveDowngradeRate = UPGRADE_FAIL_DOWNGRADE_RATE * buffEffects.downgradeShield;
        if (Math.random() * 100 < effectiveDowngradeRate) {
          newValue = Math.max(1, oldValue - 1);
        }
      }

      await tx.owl.update({ where: { id: owlId }, data: { [field]: newValue } });

      if (redis) {
        await applyOwlStatUpdate(redis, playerId, owlId, { [field]: newValue } as Partial<{
          statGaga: number; statGoz: number; statKulak: number; statKanat: number; statPence: number;
        }>);
      }

      // Upgrade buff charge'ını tüket (transaction dışında — lock yeterli)
      drainBuffCharge(prisma, playerId, 'upgrade').catch(() => null);

      return { success, chance, oldValue, newValue };
    });
  });
}
