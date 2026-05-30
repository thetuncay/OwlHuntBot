import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  BIOMES,
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
} from '../config';
import type { HuntCatchResult, HuntRunResult, LootboxDrop } from '../types';
import { catchChance, clamp, huntRolls, spawnScore } from '../utils/math';
import { rollPercent, weightedRandom } from '../utils/rng';
import { withLock } from '../utils/lock';
import { enqueueDbWriteBulk, type UpsertInventoryJob } from '../utils/db-queue';
import {
  hydratePlayerState,
  computeXpDelta,
  applyHuntDelta,
  deductCoinsInRedis,
  buildLevelUpRewards,
  type InventoryDeltaItem,
} from '../state/player-state';
import { createEncounter } from './tame';
import { getBuffEffects, drainBuffCharge } from './items';
import { rollHuntLootboxDrop } from './drops';
import { trackQuestProgress } from './daily-quests';
import { getBiomeSession, setBiomeSession } from '../utils/biome-session';
import { parseStoredTraits, resolveTraits, calcTraitEffects } from './traits';
import { writeAudit } from '../utils/audit';
import { consumeConsumableEffect, getConsumableEffectValue } from '../utils/use-items';

/**
 * Hunt sonrasi encounter + lootbox — kullanici cevabini BEKLEMEZ.
 */
export async function runHuntSideEffects(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  player: { level: number; prestigeLevel?: number },
  owl: {
    tier: number; statGoz: number; statKulak: number;
    statGaga: number; statKanat: number; statPence: number;
  },
  hasCritical: boolean,
): Promise<{ encounterId?: string; lootboxDrops?: LootboxDrop[] }> {
  const [lootboxDrops, encounterId] = await Promise.all([
    rollHuntLootboxDrop(prisma, redis, playerId, player.level, hasCritical).catch(() => [] as LootboxDrop[]),
    createEncounter(prisma, playerId, player, owl, redis).catch(() => null),
  ]);
  return {
    encounterId: encounterId ?? undefined,
    lootboxDrops: lootboxDrops.length > 0 ? lootboxDrops : undefined,
  };
}

/**
 * Envanter job'larını PostgreSQL uyumlu upsert işlemleriyle uygular.
 * Aynı (playerId, itemName) çiftleri önce toplanır, ardından her biri için
 * tek bir upsert çalıştırılır — Req 15.1, 15.2.
 *
 * @param prisma   - PrismaClient instance
 * @param playerId - Oyuncunun ID'si (ownerId olarak kullanılır)
 * @param jobs     - UpsertInventoryJob dizisi; boşsa çağrı atlanır
 */
export async function buildAndExecuteBulkWrite(
  prisma: PrismaClient,
  playerId: string,
  jobs: UpsertInventoryJob[],
): Promise<void> {
  if (jobs.length === 0) return;

  // Aynı (playerId, itemName) çiftlerini birleştirerek toplam miktarı hesapla
  const aggregated = new Map<string, UpsertInventoryJob & { totalQty: number }>();
  for (const job of jobs) {
    const key = `${job.playerId}:${job.itemName}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.totalQty += job.quantity;
    } else {
      aggregated.set(key, { ...job, totalQty: job.quantity });
    }
  }

  const entries = [...aggregated.values()];

  // Her item için: yoksa oluştur, varsa miktarı artır (upsert)
  await Promise.all(
    entries.map((job) =>
      prisma.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: job.playerId, itemName: job.itemName } },
        create: {
          ownerId: job.playerId,
          itemName: job.itemName,
          itemType: job.itemType,
          rarity: job.rarity,
          quantity: job.totalQty,
        },
        update: {
          quantity: { increment: job.totalQty },
        },
      })
    )
  );
}

/**
 * Oyuncunun ana baykusu ile av turunu simule eder.
 * Rebalanced: minimum guarantee, soft scaling, pity, streak, multi-success bonus.
 *
 * Performans notları:
 *   - Player upsert + Owl fetch + BuffEffects paralel çalışır (3 round-trip → 1)
 *   - addXP player verisini tekrar çekmez (existingPlayer geçilir)
 *   - Encounter player/owl snapshot ile çalışır — ekstra DB sorgusu yok
 *   - Yazma sonrası player cache invalidate edilir
 *   - Bond cap kontrolü tek update'e indirildi
 */
export async function rollHunt(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  owlId: string,
  biomeId = 'b0'
): Promise<HuntRunResult> {
  return withLock(playerId, 'financial', async () => {
    let bundle = await hydratePlayerState(redis, prisma, playerId);
    if (!bundle) {
      await prisma.player.upsert({
        where: { id: playerId },
        create: { id: playerId },
        update: {},
      });
      bundle = await hydratePlayerState(redis, prisma, playerId);
    }
    if (!bundle) throw new Error('Oyuncu olusturulamadi.');

    const buffEffects = await getBuffEffects(prisma, playerId, 'hunt');
    const player = bundle.player;
    let owl = bundle.mainOwl;

    if (!owl || owl.id !== owlId) {
      const dbOwl = await prisma.owl.findUnique({ where: { id: owlId } });
      if (!dbOwl || dbOwl.ownerId !== playerId) throw new Error('Av icin gecersiz baykus.');
      owl = dbOwl as NonNullable<typeof owl>;
    }

    const foundBiome = BIOMES.find(b => b.id === biomeId) || BIOMES[0];
    if (!foundBiome) throw new Error('Biyom bulunamadı.');
    const safeBiome = foundBiome;
    if (player.level < safeBiome.minLevel) {
      throw new Error(`Bu biyoma girmek için en az **${safeBiome.minLevel}** seviye olmalısın.`);
    }

    if (safeBiome.entryCost > 0) {
      const existingSession = await getBiomeSession(redis, playerId);
      const isNewEntry = !existingSession || existingSession.biomeId !== biomeId;
      if (isNewEntry) {
        if (player.coins < safeBiome.entryCost) {
          throw new Error(
            `**${safeBiome.name}** biyomuna girmek için **${safeBiome.entryCost}** 💰 gerekiyor.\n` +
            `Sahip olduğun: **${player.coins}** 💰`,
          );
        }
        await deductCoinsInRedis(redis, playerId, safeBiome.entryCost, prisma);
        player.coins -= safeBiome.entryCost;
        await setBiomeSession(redis, playerId, biomeId);
      }
    }

    const species = OWL_SPECIES.find((s) => s.name === owl.species);
    if (!species) throw new Error('Baykus tur bilgisi bulunamadi.');

    const storedTraits = parseStoredTraits(owl.traits);
    const resolvedTraits = resolveTraits(storedTraits);
    const traitEffects = calcTraitEffects(resolvedTraits);

    // ── Gizli modifierlar ────────────────────────────────────────────────────
    // 1. Soft level scaling (kullanıcıya gösterilmez)
    const levelBonus = clamp(0, HUNT_LEVEL_CATCH_MAX, player.level * HUNT_LEVEL_CATCH_BONUS);

    // 2. Streak bonus (ardışık başarılı hunt)
    const streakBonus = clamp(0, HUNT_STREAK_MAX_BONUS, player.huntComboStreak * HUNT_STREAK_BONUS_RATE);

    // 3. Pity bonus — noRareStreak CachedPlayerData'da gerçek alan olarak var
    const noRareStreak = player.noRareStreak;
    const pityBonus = noRareStreak >= HUNT_PITY_THRESHOLD
      ? clamp(0, HUNT_PITY_MAX_BONUS, (noRareStreak - HUNT_PITY_THRESHOLD) * HUNT_PITY_BONUS_RATE)
      : 0;

    const totalRoll = huntRolls(player.level);
    const catches: HuntCatchResult[] = [];
    const escaped: HuntCatchResult[] = [];
    const injured: HuntCatchResult[] = [];
    let highTierTaken = false;
    let gotRare = false;
    const preyPoolThreshold = OWL_PREY_POOL[owl.tier];
    if (preyPoolThreshold === undefined) throw new Error('Baykus tier av havuzu tanimli degil.');
    const preyCandidates = PREY.filter((p) => p.difficulty <= preyPoolThreshold);
    const consumableCatchBonus = await getConsumableEffectValue(redis, playerId, 'hunt_catch_once');
    const consumableLootBonus = await getConsumableEffectValue(redis, playerId, 'hunt_loot_once');

    for (let i = 0; i < totalRoll; i++) {
      const weighted = preyCandidates.map((prey) => {
        let score = spawnScore(prey.difficulty, owl.statGoz, owl.statKulak);
        // Biyom nadirlik çarpanı
        if (prey.difficulty >= HUNT_HIGH_TIER_THRESHOLD) {
          score *= safeBiome.rareModifier;
        }
        return {
          value: prey,
          weight: score,
        };
      });
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
      // Trait huntCatch çarpanı da uygulanır
      // Consumable (Yırtıcı İksiri) bonusu da eklenir
      const extraBonus = levelBonus + streakBonus + (isRarePrey ? pityBonus : 0) + buffEffects.catchBonus + consumableCatchBonus;
      const finalChance = clamp(0.05, 0.95, (baseChanceVal + extraBonus) * safeBiome.catchModifier * traitEffects.huntCatch);

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

    // Trait xpGain çarpanı uygulanır
    const totalXP = Math.round((successXP + failXP + comboBonus + multiBonus) * traitEffects.xpGain);

    // ── DB / Redis guncelleme (hot path) ─────────────────────────────────────
    const inventoryItems: InventoryDeltaItem[] = [];
    for (const c of catches) {
      inventoryItems.push({
        itemName: c.preyName,
        itemType: 'Av',
        rarity: c.difficulty >= 7 ? 'Rare' : c.difficulty >= 4 ? 'Uncommon' : 'Common',
        quantity: 1,
      });
      for (const drop of HUNT_ITEM_DROPS) {
        if (c.difficulty < drop.minDifficulty) continue;
        const dropChance = (c.critical ? drop.dropChance * 1.5 : drop.dropChance)
          * buffEffects.lootMult
          * (1 + consumableLootBonus)
          * safeBiome.lootModifier;
        if (Math.random() * 100 < dropChance) {
          inventoryItems.push({
            itemName: drop.itemName,
            itemType: drop.itemType,
            rarity: drop.rarity,
            quantity: 1,
          });
        }
      }
    }

    const newStreak = realCatchCount > 0 ? player.huntComboStreak + 1 : 0;
    const newNoRareStreak = gotRare ? 0 : player.noRareStreak + 1;
    const xpResult = computeXpDelta(player, totalXP);
    const levelUpRewards = xpResult.levelUp
      ? buildLevelUpRewards(xpResult.levelUp.oldLevel, xpResult.levelUp.newLevel)
      : undefined;

    const auditBefore: Record<string, unknown> = {
      coins: player.coins,
      xp: player.xp,
      level: player.level,
      huntComboStreak: player.huntComboStreak,
      noRareStreak: player.noRareStreak,
    };

    await applyHuntDelta(redis, prisma, playerId, {
      gainedXP: xpResult.gainedXP,
      newLevel: xpResult.levelUp ? xpResult.levelUp.newLevel : player.level,
      newXp: xpResult.levelUp ? xpResult.levelUp.remainingXP : xpResult.currentXP,
      totalXPGain: xpResult.gainedXP,
      huntComboStreak: newStreak,
      noRareStreak: newNoRareStreak,
      bondGain: realCatchCount > 0 ? BOND_GAIN_PER_HUNT : 0,
      owlId,
      inventoryItems,
      levelUp: xpResult.levelUp,
      levelUpRewards,
    });

    const auditAfter: Record<string, unknown> = {
      coins: player.coins,
      xp: xpResult.levelUp ? xpResult.levelUp.remainingXP : xpResult.currentXP,
      level: xpResult.levelUp ? xpResult.levelUp.newLevel : player.level,
      huntComboStreak: newStreak,
      noRareStreak: newNoRareStreak,
      gainedXP: xpResult.gainedXP,
    };
    writeAudit(prisma, playerId, 'hunt', auditBefore, auditAfter).catch(console.error);

    const rareSuccesses = catches.filter((c) => c.difficulty >= HUNT_HIGH_TIER_THRESHOLD).length;
    if (catches.length > 0 || rareSuccesses > 0) {
      trackQuestProgress(prisma, playerId, 'hunt', catches.length).catch(() => null);
      enqueueDbWriteBulk([{
        type: 'recordStats',
        playerId,
        hunts: catches.length,
        rareFinds: rareSuccesses,
      }]);
    }
    drainBuffCharge(prisma, playerId, 'hunt').catch(() => null);

    if (consumableCatchBonus > 0) {
      await consumeConsumableEffect(redis, playerId, 'hunt_catch_once');
    }
    if (consumableLootBonus > 0) {
      await consumeConsumableEffect(redis, playerId, 'hunt_loot_once');
    }

    // Yem item'ları — av sonunda stamina yenile
    for (const effectType of ['stamina_restore_once', 'stamina_boost_once'] as const) {
      const amount = await getConsumableEffectValue(redis, playerId, effectType);
      if (amount <= 0) continue;
      const owlRow = await prisma.owl.findUnique({ where: { id: owlId }, select: { staminaCur: true, hpMax: true } });
      if (owlRow) {
        const newStamina = Math.min(owlRow.hpMax, owlRow.staminaCur + amount);
        await prisma.owl.update({ where: { id: owlId }, data: { staminaCur: newStamina } });
      }
      await consumeConsumableEffect(redis, playerId, effectType);
    }

    return {
      catches,
      escaped,
      injured,
      totalXP,
      levelUp: xpResult.levelUp,
    };
  });
}
