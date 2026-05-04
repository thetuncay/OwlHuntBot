import type { PrismaClient } from '@prisma/client';
import {
  HUNT_CRITICAL_RATE,
  HUNT_HIGH_TIER_THRESHOLD,
  HUNT_INJURY_RATE,
  HUNT_ITEM_DROPS,
  HUNT_LEVEL_CATCH_BONUS,
  HUNT_LEVEL_CATCH_MAX,
  HUNT_MULTI_BONUS_2,
  HUNT_MULTI_BONUS_3,
  HUNT_MULTI_BONUS_5,
  HUNT_PITY_BONUS_RATE,
  HUNT_PITY_MAX_BONUS,
  HUNT_PITY_THRESHOLD,
  HUNT_STREAK_BONUS_RATE,
  HUNT_STREAK_MAX_BONUS,
  OWL_PREY_POOL,
  OWL_SPECIES,
  PREY,
  XP_COMBO_3,
  XP_COMBO_5,
  XP_FAIL_RATIO,
  XP_RISK_BONUS_RATE,
  BOND_GAIN_PER_HUNT,
  BOND_MAX,
} from '../config';
import type { HuntCatchResult, HuntRunResult, LootboxDrop } from '../types';
import { catchChance, clamp, huntRolls, spawnScore } from '../utils/math';
import { rollPercent, weightedRandom } from '../utils/rng';
import { withLock } from '../utils/lock';
import { addXP } from './xp';
import { recordHuntStats, refreshPowerScore } from './leaderboard';
import { createEncounter } from './tame';
import { getBuffEffects, drainBuffCharge } from './items';
import { rollHuntLootboxDrop } from './drops';

/**
 * Oyuncunun ana baykusu ile av turunu simule eder.
 * Rebalanced: minimum guarantee, soft scaling, pity, streak, multi-success bonus.
 */
export async function rollHunt(prisma: PrismaClient, playerId: string, owlId: string): Promise<HuntRunResult> {
  return withLock(playerId, 'hunt', async () => {
    // Transaction yerine direkt sorgular — Atlas M0 transaction timeout'unu önler
    const player = await prisma.player.upsert({
      where: { id: playerId },
      create: { id: playerId },
      update: {},
    });
    const owl = await prisma.owl.findUnique({ where: { id: owlId } });
    if (!owl || owl.ownerId !== playerId) throw new Error('Av icin gecersiz baykus.');

    const species = OWL_SPECIES.find((s) => s.name === owl.species);
    if (!species) throw new Error('Baykus tur bilgisi bulunamadi.');

    // ── Gizli modifierlar ────────────────────────────────────────────────────
    // 1. Soft level scaling (kullanıcıya gösterilmez)
    const levelBonus = clamp(0, HUNT_LEVEL_CATCH_MAX, player.level * HUNT_LEVEL_CATCH_BONUS);

    // 2. Streak bonus (ardışık başarılı hunt)
    const streakBonus = clamp(0, HUNT_STREAK_MAX_BONUS, player.huntComboStreak * HUNT_STREAK_BONUS_RATE);

    // 3. Pity bonus — noRareStreak artık DB'de gerçek alan olarak var
    const noRareStreak = (player as { noRareStreak?: number }).noRareStreak ?? 0;
    const pityBonus = noRareStreak >= HUNT_PITY_THRESHOLD
      ? clamp(0, HUNT_PITY_MAX_BONUS, (noRareStreak - HUNT_PITY_THRESHOLD) * HUNT_PITY_BONUS_RATE)
      : 0;

    // 4. Aktif hunt buff'larını al (diminishing returns uygulanmış)
    const buffEffects = await getBuffEffects(prisma, playerId, 'hunt');

    const totalRoll = huntRolls(player.level);
    const catches: HuntCatchResult[] = [];
    const escaped: HuntCatchResult[] = [];
    const injured: HuntCatchResult[] = [];
    let highTierTaken = false;
    let gotRare = false;

    for (let i = 0; i < totalRoll; i++) {
      const threshold = OWL_PREY_POOL[owl.tier];
      if (threshold === undefined) throw new Error('Baykus tier av havuzu tanimli degil.');

      const candidate = PREY.filter((p) => p.difficulty <= threshold);
      const weighted = candidate.map((prey) => ({
        value: prey,
        weight: spawnScore(prey.difficulty, owl.statGoz, owl.statKulak),
      }));
      const picked = weightedRandom(weighted);

      if (picked.difficulty >= HUNT_HIGH_TIER_THRESHOLD) {
        if (highTierTaken) continue;
        highTierTaken = true;
      }

      // Nadir hayvan için pity bonus eklenir
      const isRarePrey = picked.difficulty >= HUNT_HIGH_TIER_THRESHOLD;
      const baseChanceVal = catchChance(
        picked.baseChance,
        species.powerMultiplier,
        owl.statPence,
        owl.statGoz,
        owl.statKanat,
        owl.tier,
        picked.difficulty,
        owl.bond,
        owl.effectiveness,
      );

      // Gizli modifier'ları uygula
      // Buff catch bonus da eklenir (diminishing returns zaten uygulandı)
      const extraBonus = levelBonus + streakBonus + (isRarePrey ? pityBonus : 0) + buffEffects.catchBonus;
      const finalChance = clamp(0.05, 0.95, baseChanceVal + extraBonus);

      const isSuccess = Math.random() < finalChance;
      const critical = isSuccess && rollPercent(HUNT_CRITICAL_RATE);
      const injury = !isSuccess && rollPercent(HUNT_INJURY_RATE);

      const result: HuntCatchResult = {
        preyName: picked.name,
        difficulty: picked.difficulty,
        success: isSuccess,
        critical,
        xp: critical ? picked.xp * 2 : picked.xp,
      };

      if (isSuccess) {
        catches.push(result);
        if (isRarePrey) gotRare = true;
      } else if (injury) {
        injured.push(result);
      } else {
        escaped.push(result);
      }
    }

    // ── Minimum Guarantee ────────────────────────────────────────────────────
    // Hiç yakalama yoksa en düşük tier'dan 1 hayvan garantile.
    // ÖNEMLI: realCatches streak için kullanılır, guarantee sonrası catches değil.
    // Bu sayede streak sadece gerçek başarılarda artar.
    const realCatchCount = catches.length;

    if (catches.length === 0) {
      const lowestPrey = PREY.find((p) => p.difficulty <= 2) ?? PREY[0];
      catches.push({
        preyName: lowestPrey.name,
        difficulty: lowestPrey.difficulty,
        success: true,
        critical: false,
        xp: lowestPrey.xp,
      });
    }

    // ── XP Hesaplama ─────────────────────────────────────────────────────────
    const successXP = catches.reduce((sum, item) => {
      const riskBonus = item.difficulty >= HUNT_HIGH_TIER_THRESHOLD ? item.xp * XP_RISK_BONUS_RATE : 0;
      return sum + item.xp + Math.round(riskBonus);
    }, 0);

    const failXP = injured.reduce((sum, item) => sum + Math.round(item.xp * XP_FAIL_RATIO), 0);

    // Combo streak — sadece gerçek yakalamalar sayılır (guarantee hariç)
    const comboStreakAfter = realCatchCount > 0 ? player.huntComboStreak + 1 : 0;
    const comboBonus = comboStreakAfter >= 5 ? XP_COMBO_5 : comboStreakAfter >= 3 ? XP_COMBO_3 : 0;

    // Multi-success bonus
    const multiBonus =
      catches.length >= 5 ? HUNT_MULTI_BONUS_5 :
      catches.length >= 3 ? HUNT_MULTI_BONUS_3 :
      catches.length >= 2 ? HUNT_MULTI_BONUS_2 : 0;

    const totalXP = successXP + failXP + comboBonus + multiBonus;

    const xpResult = await addXP(prisma, playerId, totalXP, 'hunt', {
      level: player.level,
      xp: player.xp,
    });

    // ── DB Güncelleme ─────────────────────────────────────────────────────────
    // Player güncelleme + envanter upsert'leri paralel başlat
    const inventoryOps: Promise<unknown>[] = [];

    for (const c of catches) {
      inventoryOps.push(
        prisma.inventoryItem.upsert({
          where: { ownerId_itemName: { ownerId: playerId, itemName: c.preyName } },
          create: {
            ownerId: playerId,
            itemName: c.preyName,
            itemType: 'Av',
            rarity: c.difficulty >= 7 ? 'Rare' : c.difficulty >= 4 ? 'Uncommon' : 'Common',
            quantity: 1,
          },
          update: { quantity: { increment: 1 } },
        }),
      );

      // Item drop şansı (kritik avda 1.5x, buff loot_mult de uygulanır)
      for (const drop of HUNT_ITEM_DROPS) {
        if (c.difficulty < drop.minDifficulty) continue;
        const dropChance = (c.critical ? drop.dropChance * 1.5 : drop.dropChance) * buffEffects.lootMult;
        if (Math.random() * 100 < dropChance) {
          inventoryOps.push(
            prisma.inventoryItem.upsert({
              where: { ownerId_itemName: { ownerId: playerId, itemName: drop.itemName } },
              create: {
                ownerId: playerId,
                itemName: drop.itemName,
                itemType: drop.itemType,
                rarity: drop.rarity,
                quantity: 1,
              },
              update: { quantity: { increment: 1 } },
            }),
          );
        }
      }
    }

    // Player güncelleme + tüm envanter işlemleri paralel
    await Promise.all([
      prisma.player.update({
        where: { id: playerId },
        data: {
          huntComboStreak: realCatchCount > 0 ? { increment: 1 } : 0,
          noRareStreak: gotRare ? 0 : { increment: 1 },
          lastHunt: new Date(),
        },
      }),
      // Bond artışı: gerçek yakalama varsa main baykuşun bond'u artar
      ...(realCatchCount > 0 ? [
        prisma.owl.update({
          where: { id: owlId },
          data: { bond: { increment: BOND_GAIN_PER_HUNT } },
        }).then(async (updated) => {
          if (updated.bond > BOND_MAX) {
            await prisma.owl.update({ where: { id: owlId }, data: { bond: BOND_MAX } });
          }
        }),
      ] : []),
      ...inventoryOps,
    ]);

    // ── Arka Plan İşlemleri (fire-and-forget) ────────────────────────────────
    // Bu işlemler kullanıcı cevabını BEKLETMEZ — arka planda çalışır.
    // Liderboard, buff charge, lootbox, encounter — hepsi sonuç gösterildikten sonra işlenir.
    const rareSuccesses = catches.filter((c) => c.difficulty >= HUNT_HIGH_TIER_THRESHOLD).length;
    const hasCritical = catches.some((c) => c.critical);

    // Lootbox drop — arka planda hesapla
    const lootboxDropsPromise = rollHuntLootboxDrop(prisma, playerId, player.level, hasCritical)
      .catch(() => [] as LootboxDrop[]);

    // Encounter — arka planda oluştur
    const encounterPromise = createEncounter(prisma, playerId).catch(() => null);

    // Liderboard, buff, power score — tamamen fire-and-forget
    recordHuntStats(prisma, playerId, catches.length, rareSuccesses).catch(() => null);
    drainBuffCharge(prisma, playerId, 'hunt').catch(() => null);
    if (xpResult.levelUp) {
      refreshPowerScore(prisma, playerId).catch(() => null);
    }

    // Lootbox ve encounter sonuçlarını bekle (UI için gerekli ama hızlı)
    const [lootboxDrops, encounterId] = await Promise.all([
      lootboxDropsPromise,
      encounterPromise,
    ]);

    return {
      catches,
      escaped,
      injured,
      totalXP,
      levelUp: xpResult.levelUp,
      encounterId: encounterId ?? undefined,
      lootboxDrops: lootboxDrops.length > 0 ? lootboxDrops : undefined,
    };
  });
}
