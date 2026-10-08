import type { PrismaClient } from '@prisma/client';
import { formatCoinLabel } from '../config/ui-emojis';
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
  BUFF_ITEM_MAP,
  DEFAULT_HUNT_BIOME_ID,
  HUNT_COOLDOWN_MAX_REMAINING_MS,
  HUNT_COOLDOWN_MS,
  HUNT_WEEKEND_XP_MULT,
  isWeekendHuntBonus,
} from '../config';
import type { HuntCatchResult, HuntRunResult, LootboxDrop } from '../types';
import { catchChance, clamp, huntRolls, spawnScore } from '../utils/math';
import { rollPercent } from '../utils/rng';
import { withLock } from '../utils/lock';
import { armCooldown, peekCooldownBounded } from '../middleware/cooldown-manager';
import { currentLiveOpsModifier } from './liveops-cadence';
import { addXP } from './xp';
import { enqueueDbWrite, type UpsertInventoryJob } from '../utils/db-queue';
import {
  hydratePlayerState,
  computeXpDelta,
  applyHuntDelta,
  deductCoinsInRedis,
  buildLevelUpRewards,
  type InventoryDeltaItem,
} from '../state/player-state';
import { createEncounter } from './tame';
import { getBuffEffects, drainBuffCharge, getCachedHuntBuffDisplay } from './items';
import { rollHuntLootboxDrop } from './drops';
import { applyHuntSeriesXp, tickHuntMilestone } from './hunt-milestones';
import {
  applyTimeOfDayXp,
  guaranteePreyXp,
  resolveHuntTimeBonus,
  tickHuntMicroEvent,
} from './hunt-flavor';
import { getBiomeSession, setBiomeSession } from '../utils/biome-session';
import { parseStoredTraits, resolveTraits, calcTraitEffects } from './traits';
import { writeAudit } from '../utils/audit';
import { runDetached } from '../utils/async';
import { beginHuntHotPathMetrics } from '../utils/hunt-hotpath-metrics.js';
import type { HuntQuestTrackPayload } from './quest-tracker';
import { applyRewardMultiplier } from '../anticheat/reward-throttle';
import { getRetentionBonusSafe } from './retention/retention-modifiers';
import { applyNewbieXpMultiplier, getNewbieLuckBonus } from './newbie-boost';
import { refreshMainOwlVitalsIfNeeded } from '../utils/owl-stats';
import { trackSessionLoss } from './retention/player-activity';

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
    rollHuntLootboxDrop(prisma, redis, playerId, player.level, hasCritical).catch((err) => {
      console.warn(
        '[Hunt] Lootbox drop failed:',
        err instanceof Error ? err.message : err,
      );
      return [] as LootboxDrop[];
    }),
    createEncounter(prisma, playerId, player, owl, redis).catch((err) => {
      console.warn(
        '[Hunt] Encounter spawn failed:',
        err instanceof Error ? err.message : err,
      );
      return null;
    }),
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

type PreyRow = (typeof PREY)[number];

/** Biyom nadir çarpanı + buff flat bonusu (0.35 = +35% spawn ağırlığı). */
export function effectiveHuntRareModifier(
  biomeRareModifier: number,
  rareDropBonus: number,
): number {
  return biomeRareModifier * (1 + Math.max(0, rareDropBonus));
}

function pickWeightedPrey(
  preyCandidates: PreyRow[],
  owlStatGoz: number,
  owlStatKulak: number,
  rareModifier: number,
  rareDropBonus = 0,
): PreyRow {
  const effectiveRareMod = effectiveHuntRareModifier(rareModifier, rareDropBonus);
  let totalWeight = 0;
  for (const prey of preyCandidates) {
    let score = spawnScore(prey.difficulty, owlStatGoz, owlStatKulak);
    if (prey.difficulty >= HUNT_HIGH_TIER_THRESHOLD) {
      score *= effectiveRareMod;
    }
    totalWeight += score;
  }
  if (totalWeight <= 0) {
    return preyCandidates[Math.floor(Math.random() * preyCandidates.length)] ?? preyCandidates[0]!;
  }
  let threshold = Math.random() * totalWeight;
  for (const prey of preyCandidates) {
    let score = spawnScore(prey.difficulty, owlStatGoz, owlStatKulak);
    if (prey.difficulty >= HUNT_HIGH_TIER_THRESHOLD) {
      score *= effectiveRareMod;
    }
    threshold -= score;
    if (threshold <= 0) return prey;
  }
  return preyCandidates[preyCandidates.length - 1]!;
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
export class HuntCooldownActiveError extends Error {
  constructor(readonly remainingMs: number) {
    super('Hunt cooldown aktif.');
    this.name = 'HuntCooldownActiveError';
  }
}

function huntCooldownKey(playerId: string): string {
  return `cooldown:hunt:${playerId}`;
}

async function resolvePlayerCreatedAt(
  prisma: PrismaClient,
  playerId: string,
  cached: string | null | undefined,
): Promise<Date> {
  if (cached) {
    const parsed = new Date(cached);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const row = await prisma.player.findUnique({
    where: { id: playerId },
    select: { createdAt: true },
  });
  return row?.createdAt ?? new Date(0);
}

export async function rollHunt(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  owlId?: string,
  biomeId = DEFAULT_HUNT_BIOME_ID,
  includeDisplayMeta = false,
  guildId?: string | null,
): Promise<HuntRunResult> {
  return withLock(playerId, 'financial', async () => {
    const metrics = beginHuntHotPathMetrics();
    try {
    const cooldown = await peekCooldownBounded(
      redis,
      huntCooldownKey(playerId),
      HUNT_COOLDOWN_MAX_REMAINING_MS,
    );
    if (cooldown.active && cooldown.remainingMs <= HUNT_COOLDOWN_MAX_REMAINING_MS) {
      throw new HuntCooldownActiveError(cooldown.remainingMs);
    }
    let [bundle, buffEffects] = await Promise.all([
      hydratePlayerState(redis, prisma, playerId, { includeInventory: false, metrics }),
      getBuffEffects(prisma, playerId, 'hunt', metrics),
    ]);
    if (!bundle) {
      metrics?.addPgWrite();
      await prisma.player.upsert({
        where: { id: playerId },
        create: { id: playerId },
        update: {},
      });
      bundle = await hydratePlayerState(redis, prisma, playerId, { includeInventory: false, metrics });
    }
    if (!bundle) throw new Error('Oyuncu olusturulamadi.');
    await refreshMainOwlVitalsIfNeeded(prisma, playerId);
    const player = bundle.player;
    const playerCreatedAt = await resolvePlayerCreatedAt(prisma, playerId, player.createdAt);
    const targetOwlId = owlId ?? bundle.mainOwl?.id;
    if (!targetOwlId) throw new Error('Main baykuş bulunamadı.');
    let owl = bundle.mainOwl;

    if (!owl || owl.id !== targetOwlId) {
      metrics?.addPgRead();
      const dbOwl = await prisma.owl.findUnique({ where: { id: targetOwlId } });
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
      metrics?.addRedisRead();
      const existingSession = await getBiomeSession(redis, playerId);
      const isNewEntry = !existingSession || existingSession.biomeId !== biomeId;
      if (isNewEntry) {
        if (player.coins < safeBiome.entryCost) {
          throw new Error(
            `**${safeBiome.name}** biyomuna girmek için ${formatCoinLabel(safeBiome.entryCost)} gerekiyor.\n` +
            `Sahip olduğun: ${formatCoinLabel(player.coins)}`,
          );
        }
        await deductCoinsInRedis(redis, playerId, safeBiome.entryCost, prisma, metrics, player);
        player.coins -= safeBiome.entryCost;
        metrics?.addRedisWrite();
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

    const newbieLuckBonus = getNewbieLuckBonus(playerCreatedAt);
    const timeBonus = resolveHuntTimeBonus();
    const [retentionBonus, series, microEvent] = await Promise.all([
      getRetentionBonusSafe('hunt', redis, playerId, prisma, playerCreatedAt),
      tickHuntMilestone(redis, prisma, playerId),
      tickHuntMicroEvent(redis, playerId),
    ]);

    const totalRoll = huntRolls(player.level, owl.statKanat) + (isWeekendHuntBonus() ? 1 : 0);
    const catches: HuntCatchResult[] = [];
    const escaped: HuntCatchResult[] = [];
    const injured: HuntCatchResult[] = [];
    let highTierTaken = false;
    const preyPoolThreshold = OWL_PREY_POOL[owl.tier];
    if (preyPoolThreshold === undefined) throw new Error('Baykus tier av havuzu tanimli degil.');
    const preyCandidates = PREY.filter((p) => p.difficulty <= preyPoolThreshold);

    for (let i = 0; i < totalRoll; i++) {
      const picked = pickWeightedPrey(
        preyCandidates,
        owl.statGoz,
        owl.statKulak,
        safeBiome.rareModifier,
        buffEffects.rareDropBonus,
      );

      if (picked.difficulty >= HUNT_HIGH_TIER_THRESHOLD) {
        if (highTierTaken) continue;
        highTierTaken = true;
      }

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

      const extraBonus = levelBonus + streakBonus + retentionBonus + newbieLuckBonus
        + (isRarePrey ? buffEffects.rareDropBonus + timeBonus.rareBonus : 0)
        + buffEffects.catchBonus;
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

    if (realCatchCount === 0) {
      runDetached('pa-loss', () => trackSessionLoss(redis, playerId));
    }

    if (catches.length === 0) {
      const lowestPrey = PREY.find((p) => p.difficulty <= 2) ?? PREY[0];
      catches.push({
        preyName: lowestPrey.name,
        difficulty: lowestPrey.difficulty,
        success: true,
        critical: false,
        xp: guaranteePreyXp(lowestPrey.xp),
        guaranteed: true,
      });
    }

    // ── XP Hesaplama ─────────────────────────────────────────────────────────
    metrics?.beginRewardCalc();
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
    const rawTotalXP = Math.round((successXP + failXP + comboBonus + multiBonus) * traitEffects.xpGain);
    const newbieBoostedXp = applyNewbieXpMultiplier(rawTotalXP, playerCreatedAt);
    const weekendXp = isWeekendHuntBonus()
      ? Math.round(newbieBoostedXp * HUNT_WEEKEND_XP_MULT)
      : newbieBoostedXp;
    const seriesXp = applyHuntSeriesXp(weekendXp, series.count);
    const timedXp = applyTimeOfDayXp(seriesXp, timeBonus.xpMult);
    const flavoredXp = timedXp + microEvent.bonusXp;
    const totalXP = await applyRewardMultiplier(
      prisma,
      { userId: playerId, guildId: guildId ?? null, rewardType: 'hunt_xp' },
      flavoredXp,
    );

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
    const xpResult = computeXpDelta(player, totalXP);
    const levelUpRewards = xpResult.levelUp
      ? buildLevelUpRewards(xpResult.levelUp.oldLevel, xpResult.levelUp.newLevel)
      : undefined;
    metrics?.endRewardCalc();

    const auditBefore: Record<string, unknown> = {
      coins: player.coins,
      xp: player.xp,
      level: player.level,
      huntComboStreak: player.huntComboStreak,
    };

    await applyHuntDelta(redis, prisma, playerId, {
      gainedXP: xpResult.gainedXP,
      newLevel: xpResult.levelUp ? xpResult.levelUp.newLevel : player.level,
      newXp: xpResult.levelUp ? xpResult.levelUp.remainingXP : xpResult.currentXP,
      totalXPGain: xpResult.gainedXP,
      huntComboStreak: newStreak,
      noRareStreak: player.noRareStreak,
      bondGain: realCatchCount > 0 ? BOND_GAIN_PER_HUNT : 0,
      owlId: targetOwlId,
      inventoryItems,
      levelUp: xpResult.levelUp,
      levelUpRewards,
    }, metrics, player);

    const auditAfter: Record<string, unknown> = {
      coins: player.coins,
      xp: xpResult.levelUp ? xpResult.levelUp.remainingXP : xpResult.currentXP,
      level: xpResult.levelUp ? xpResult.levelUp.newLevel : player.level,
      huntComboStreak: newStreak,
      gainedXP: xpResult.gainedXP,
    };
    runDetached('hunt-audit', () => writeAudit(prisma, playerId, 'hunt', auditBefore, auditAfter));

    const rareSuccesses = catches.filter((c) => c.difficulty >= HUNT_HIGH_TIER_THRESHOLD).length;
    if (catches.length > 0 || rareSuccesses > 0) {
      enqueueDbWrite({
        type: 'recordHuntSideEffects',
        playerId,
        preyNames: catches.map((c) => c.preyName),
        hunts: catches.length,
        rareFinds: rareSuccesses,
        guildId: guildId ?? undefined,
      });
      metrics?.addPersistence();
    }
    runDetached('hunt-buff-drain', () => drainBuffCharge(prisma, playerId, 'hunt'));

    let activeBuffs: HuntRunResult['activeBuffs'] | undefined;
    if (includeDisplayMeta) {
      activeBuffs = getCachedHuntBuffDisplay(playerId);
    }

    const levelAfter = xpResult.levelUp ? xpResult.levelUp.newLevel : player.level;
    const xpAfter = xpResult.levelUp ? xpResult.levelUp.remainingXP : xpResult.currentXP;
    const liveOps = currentLiveOpsModifier();
    const liveOpsXp = liveOps.huntBonusRate > 0
      ? Math.round(totalXP * liveOps.huntBonusRate)
      : 0;
    if (liveOpsXp > 0) {
      await addXP(prisma, playerId, liveOpsXp, 'liveOpsHunt', undefined, undefined, redis);
    }
    await armCooldown(redis, huntCooldownKey(playerId), HUNT_COOLDOWN_MS);

    return {
      catches,
      escaped,
      injured,
      totalXP,
      huntComboStreak: newStreak,
      levelUp: xpResult.levelUp,
      levelAfter,
      xpAfter,
      questTrackPayload: {
        catchCount: realCatchCount,
        catches: catches.map((c) => ({ preyName: c.preyName, difficulty: c.difficulty })),
        totalXP,
        hasCritical: catches.some((c) => c.critical),
        huntComboStreak: newStreak,
      } satisfies HuntQuestTrackPayload,
      playerSnapshot: {
        level: player.level,
        prestigeLevel: player.prestigeLevel ?? undefined,
      },
      owlSnapshot: {
        id: owl.id,
        species: owl.species,
        tier: owl.tier,
        quality: owl.quality,
        hp: owl.hp,
        hpMax: owl.hpMax,
        statGoz: owl.statGoz,
        statKulak: owl.statKulak,
        statGaga: owl.statGaga,
        statKanat: owl.statKanat,
        statPence: owl.statPence,
        staminaCur: owl.staminaCur,
      },
      activeBuffs,
      huntMilestone: series,
      timeOfDayLine: timeBonus.line ?? undefined,
      timeXpMult: timeBonus.xpMult,
      timeRareBonus: timeBonus.rareBonus,
      microEventLine: microEvent.line ?? undefined,
      microEventXp: microEvent.bonusXp,
      guaranteedCatch: catches.some((c) => c.guaranteed === true),
      liveOpsXp,
      liveOpsLabel: liveOpsXp > 0 ? liveOps.label : undefined,
    };
    } finally {
      metrics?.finish();
    }
  });
}
