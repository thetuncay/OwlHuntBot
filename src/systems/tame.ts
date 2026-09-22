import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { syncInventoryQuantitiesInRedis } from '../state/player-state';
import {
  ITEM_MAX_PER_ATTEMPT,
  OWL_SPECIES,
  OWL_BASE_HP,
  OWL_BASE_STAMINA,
  QUALITY_TAME_ADJ,
  TAME_BASE_CHANCE,
  TAME_FAIL_ATTACK_RATE,
  TAME_FAIL_ESCAPE_RATE,
  TAME_FAIL_INJURE_RATE,
  TAME_FAIL_STREAK_BONUS,
  TAME_ITEM_BONUS_PER_ITEM,
  TAME_MAX_ATTEMPTS,
  TAME_MINI_PVP_BONUS,
  TAME_REPEAT_PENALTY,
  TAME_ITEM_BONUS,
  TIER_UNLOCK_LEVEL,
  STAT_ROLL_BANDS,
  BOND_GAIN_PER_TAME,
  BOND_MAX,
} from '../config';
import { encounterChance, tameChance } from '../utils/math';
import { rollBaseStatsForTier, buildOwlStatWriteData } from '../utils/owl-stats';
import { initOwlMoonTierOnCreate } from './owl-moon-evolution';
import { withLock } from '../utils/lock';
import { simulatePvP, startPvP } from './pvp';
import { addXP } from './xp';
import { rollTraits, parseStoredTraits, resolveTraits, calcTraitEffects } from './traits';
import { rollEncounterLootboxDrop } from './drops';
import { trackQuestProgress } from './daily-quests';
import { fireQuest } from './quest-tracker';
import { setScoutingOwlCount } from '../state/player-state';
import { getEffectiveStats } from '../utils/owl-stats';
import { runDetached } from '../utils/async';
import { getRetentionBonusSafe } from './retention/retention-modifiers';
import { trackSessionLoss } from './retention/player-activity';

type OwlQuality = 'Trash' | 'Common' | 'Good' | 'Rare' | 'Elite' | 'God Roll';

function qualityByScore(avgStat: number, tier: number): OwlQuality {
  const band = STAT_ROLL_BANDS[tier];
  const tierMax = band?.high[1] ?? 42;
  const normalized = avgStat / tierMax;
  if (normalized < 0.55) return 'Trash';
  if (normalized < 0.68) return 'Common';
  if (normalized < 0.78) return 'Good';
  if (normalized < 0.88) return 'Rare';
  if (normalized < 0.96) return 'Elite';
  return 'God Roll';
}

/**
 * Oyuncu icin yeni encounter olusturur.
 * Limbo fix: Yeni encounter olusturmadan once oyuncunun suresi dolmus
 * open encounter'larini kapatir — session TTL (5dk) gecmis kayitlar temizlenir.
 *
 * Performans notu: playerSnapshot ve owlSnapshot geçilirse DB sorgusu atlanır.
 * rollHunt gibi zaten bu verilere sahip çağrıcılar için round-trip tasarrufu sağlar.
 */
export async function createEncounter(
  prisma: PrismaClient,
  playerId: string,
  playerSnapshot?: { level: number; prestigeLevel?: number },
  owlSnapshot?: {
    tier: number; statGoz: number; statKulak: number;
    statGaga: number; statKanat: number; statPence: number;
  },
  redis?: Redis,
): Promise<string | null> {
  // Snapshot geçilmişse DB'ye gitme — round-trip tasarrufu
  const player = playerSnapshot ?? await prisma.player.findUnique({ where: { id: playerId } });
  const mainOwl = owlSnapshot ?? await prisma.owl.findFirst({ where: { ownerId: playerId, isMain: true } });
  if (!player || !mainOwl) {
    throw new Error('Encounter icin oyuncu veya main baykus bulunamadi.');
  }

  const scoutingCount = redis
    ? await setScoutingOwlCount(redis, prisma, playerId)
    : await prisma.owl.count({ where: { ownerId: playerId, passiveMode: 'scouting', isMain: false } });

  const mainEffective = getEffectiveStats(mainOwl);
  const chance = encounterChance(player.level, mainEffective.goz, mainEffective.kulak, scoutingCount);
  if (Math.random() * 100 > chance) {
    return null;
  }

  const unlockedSpecies = OWL_SPECIES.filter((owl) => player.level >= (TIER_UNLOCK_LEVEL[owl.tier] ?? 999));
  if (unlockedSpecies.length === 0) {
    return null;
  }
  const weightedByTierDistance = unlockedSpecies.map((owl) => {
    const diff = Math.abs(mainOwl.tier - owl.tier);
    return {
      owl,
      weight: Math.max(1, 8 - diff),
    };
  });
  const totalWeight = weightedByTierDistance.reduce((sum, row) => sum + row.weight, 0);
  let cursor = Math.random() * totalWeight;
  const selected = weightedByTierDistance.find((row) => {
    cursor -= row.weight;
    return cursor <= 0;
  });
  const fallbackSpecies = weightedByTierDistance.at(-1)?.owl;
  if (!fallbackSpecies) {
    return null;
  }
  const species = selected?.owl ?? fallbackSpecies;

  const baseStats = rollBaseStatsForTier(species.tier);
  const avgStat = (baseStats.gaga + baseStats.goz + baseStats.kulak + baseStats.kanat + baseStats.pence) / 5;
  const quality = qualityByScore(avgStat, species.tier);

  // Rarity-aware trait uretimi: quality bilgisi rollTraits'e gecilir
  // God Roll baykuslar nadir trait'lere daha yuksek ihtimalle sahip olur
  const traits = rollTraits(species.tier, quality);

  const encounter = await prisma.encounter.create({
    data: {
      playerId,
      owlSpecies: species.name,
      owlTier: species.tier,
      owlQuality: quality,
      owlStats: {
        gaga: baseStats.gaga,
        goz: baseStats.goz,
        kulak: baseStats.kulak,
        kanat: baseStats.kanat,
        pence: baseStats.pence,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      owlTraits: traits as any,
    } as any,
    select: { id: true },
  });
  return encounter.id;
}

/**
 * Tame session sonucunu DB'ye yazar.
 * Race condition fix: withLock ile aynı encounter için çift owl oluşturma engellendi.
 */
export async function commitTameResult(
  prisma: PrismaClient,
  playerId: string,
  encounterId: string,
  success: boolean,
  redis?: Redis,
): Promise<{ runeDropLine: string | null }> {
  return withLock(playerId, 'tame', async () => {
    const encounter = await prisma.encounter.findFirst({
      where: { id: encounterId, playerId },
      select: {
        id: true,
        status: true,
        owlSpecies: true,
        owlTier: true,
        owlQuality: true,
        owlTraits: true,
        owlStats: true,
      } as any,
    }) as any;
    if (!encounter || encounter.status !== 'open') {
      return { runeDropLine: null };
    }

    if (success) {
      const mainOwl = await prisma.owl.findFirst({ where: { ownerId: playerId, isMain: true } });
      if (!mainOwl) return { runeDropLine: null };

      const traits = parseStoredTraits(encounter.owlTraits);
      const stats = encounter.owlStats as { gaga: number; goz: number; kulak: number; kanat: number; pence: number } | null;
      const base = stats ?? { gaga: 1, goz: 1, kulak: 1, kanat: 1, pence: 1 };
      const statData = buildOwlStatWriteData(base);

      const baseHp = OWL_BASE_HP[encounter.owlTier] ?? 100;
      const baseStamina = OWL_BASE_STAMINA[encounter.owlTier] ?? 100;

      // Atomik: owl create + encounter close tek transaction'da
      // Crash sonrası retry double-owl oluşturmaz
      await prisma.$transaction(async (tx) => {
        const created = await tx.owl.create({
          data: {
            ownerId:    playerId,
            species:    encounter.owlSpecies,
            tier:       encounter.owlTier,
            quality:    encounter.owlQuality,
            hp:         baseHp,
            hpMax:      baseHp,
            staminaCur: baseStamina,
            ...statData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            traits:     traits as any,
          } as any,
          select: { id: true },
        });
        await tx.encounter.update({
          where: { id: encounterId },
          data: { status: 'closed' },
        });
        const power = base.gaga + base.goz + base.kulak + base.kanat + base.pence;
        await initOwlMoonTierOnCreate(
          tx,
          playerId,
          created.id,
          encounter.owlTier,
          power,
        );
      });

      await addXP(prisma, playerId, 100, 'tameSuccess', undefined, undefined, redis);
      await trackQuestProgress(prisma, playerId, 'tame', 1);
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { level: true },
      });
      if (player) {
        void rollEncounterLootboxDrop(prisma, playerId, player.level, redis).catch(() => null);
      }

      let runeDropLine: string | null = null;
      try {
        const { maybeDropRune } = await import('./runes');
        const drop = await maybeDropRune(
          prisma,
          redis,
          playerId,
          'tame',
          encounter.owlTier,
          encounter.owlQuality,
        );
        runeDropLine = drop?.line ?? null;
      } catch {
        /* rün drop tame’i bozmasın */
      }
      return { runeDropLine };
    }

    await prisma.encounter.update({
      where: { id: encounterId },
      data: { status: 'closed' },
    });
    return { runeDropLine: null };
  });
}

/**
 * Verilen encounter icin tame denemesi yapar.
 * Transaction kullanmaz — Atlas M0 timeout sorununu önler.
 */
export async function attemptTame(
  prisma: PrismaClient,
  playerId: string,
  encounterId: string,
  itemNames: string[],
  redis?: Redis,
): Promise<string> {
  return withLock(playerId, 'tame', async () => {
    if (itemNames.length > ITEM_MAX_PER_ATTEMPT) {
      throw new Error(`Tek denemede en fazla ${ITEM_MAX_PER_ATTEMPT} farkli item kullanilabilir.`);
    }
    if (new Set(itemNames).size !== itemNames.length) {
      throw new Error('Ayni item bir denemede iki kez kullanilamaz.');
    }

    // Direkt sorgular — transaction yok
    const encounter = await prisma.encounter.findFirst({
      where: { id: encounterId, playerId },
       
      select: {
        id: true,
        status: true,
        owlSpecies: true,
        owlTier: true,
        owlQuality: true,
        owlTraits: true,
        owlStats: true,   // FIX: stat'ları oku
        tameAttempts: true,
        failStreak: true,
      } as any,
    }) as any;
    if (!encounter) throw new Error('Encounter bulunamadi.');
    if (encounter.status !== 'open') throw new Error('Encounter artik aktif degil.');
    if (encounter.tameAttempts >= TAME_MAX_ATTEMPTS) {
      await prisma.encounter.update({ where: { id: encounterId }, data: { status: 'closed' } });
      throw new Error('Maksimum tame denemesi asildi.');
    }

    const mainOwl = await prisma.owl.findFirst({ where: { ownerId: playerId, isMain: true } });
    if (!mainOwl) throw new Error('Main baykus bulunamadi.');

    // Item kontrolü ve tüketimi — tek transaction'da (verify + consume atomik)
    const itemBonus = itemNames.reduce(
      (sum, itemName) => sum + (TAME_ITEM_BONUS[itemName] ?? TAME_ITEM_BONUS_PER_ITEM), 0,
    );
    const tameItemSync = await prisma.$transaction(async (tx) => {
      const syncLines: { itemName: string; quantity: number }[] = [];
      for (const name of itemNames) {
        const item = await tx.inventoryItem.findUnique({
          where: { ownerId_itemName: { ownerId: playerId, itemName: name } },
        });
        if (!item || item.quantity < 1) throw new Error(`Gerekli item bulunamadi: ${name}`);
      }
      for (const name of itemNames) {
        const item = await tx.inventoryItem.findUnique({
          where: { ownerId_itemName: { ownerId: playerId, itemName: name } },
        });
        if (!item) throw new Error(`Gerekli item bulunamadi: ${name}`);
        const remaining = item.quantity - 1;
        if (remaining <= 0) {
          await tx.inventoryItem.delete({
            where: { ownerId_itemName: { ownerId: playerId, itemName: name } },
          });
          syncLines.push({ itemName: name, quantity: 0 });
        } else {
          await tx.inventoryItem.update({
            where: { ownerId_itemName: { ownerId: playerId, itemName: name } },
            data: { quantity: remaining },
          });
          syncLines.push({ itemName: name, quantity: remaining });
        }
      }
      return syncLines;
    });
    if (redis && tameItemSync.length > 0) {
      await syncInventoryQuantitiesInRedis(redis, playerId, tameItemSync);
    }

    // Şans hesapla
    const baseChance = TAME_BASE_CHANCE[encounter.owlTier];
    if (baseChance === undefined) throw new Error('Tame sans tablosunda tier degeri bulunamadi.');
    const qualityAdj = QUALITY_TAME_ADJ[encounter.owlQuality] ?? 0;
    const failStreakBonus = encounter.failStreak * TAME_FAIL_STREAK_BONUS;
    const repeatPenalty = encounter.tameAttempts >= 1 ? TAME_REPEAT_PENALTY : 0;
    const retentionTameBonus = redis
      ? await getRetentionBonusSafe('tame', redis, playerId, prisma)
      : 0;
    const retentionPts = Math.round(retentionTameBonus * 100);

    // WHY: Trait tameChance çarpanı uygulanıyor.
    // Evcil Ruh (+%28) veya Keskin Göz (-%20) gibi trait'ler artık gerçekten etkili.
    const mainOwlTraits = parseStoredTraits((mainOwl as any).traits);
    const mainOwlTraitEffects = calcTraitEffects(resolveTraits(mainOwlTraits));

    const mainEffective = getEffectiveStats(mainOwl);
    const rawChance = tameChance(
      baseChance,
      mainEffective.goz,
      mainEffective.kulak,
      itemBonus + failStreakBonus + retentionPts - repeatPenalty,
      qualityAdj,
    );
    const chance = rawChance * mainOwlTraitEffects.tameChance;
    const won = Math.random() * 100 < chance;

    if (won) {
      const traits = parseStoredTraits(encounter.owlTraits);
      const stats = encounter.owlStats as { gaga: number; goz: number; kulak: number; kanat: number; pence: number } | null;
      const base = stats ?? { gaga: 1, goz: 1, kulak: 1, kanat: 1, pence: 1 };
      const statData = buildOwlStatWriteData(base);
      const tameBaseHp = OWL_BASE_HP[encounter.owlTier] ?? 100;
      const tameBaseStamina = OWL_BASE_STAMINA[encounter.owlTier] ?? 100;

      // Atomik: attempt sayacı + owl create + encounter close tek transaction'da
      await prisma.$transaction(async (tx) => {
        await tx.encounter.update({
          where: { id: encounterId },
          data: { tameAttempts: { increment: 1 }, failStreak: 0, status: 'closed' },
        });
        const created = await tx.owl.create({
          data: {
            ownerId:    playerId,
            species:    encounter.owlSpecies,
            tier:       encounter.owlTier,
            quality:    encounter.owlQuality,
            hp:         tameBaseHp,
            hpMax:      tameBaseHp,
            staminaCur: tameBaseStamina,
            ...statData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            traits: traits as any,
          } as any,
          select: { id: true },
        });
        const power = base.gaga + base.goz + base.kulak + base.kanat + base.pence;
        await initOwlMoonTierOnCreate(tx, playerId, created.id, encounter.owlTier, power);
      });

      const ownedSpecies = await prisma.owl.count({
        where: { ownerId: playerId, species: encounter.owlSpecies },
      });
      const isNewSpecies = ownedSpecies <= 1;

      await addXP(prisma, playerId, 100, 'tameSuccess');
      await trackQuestProgress(prisma, playerId, 'tame', 1);
      if (isNewSpecies) await fireQuest(prisma, playerId, 'new_species', 1);
      await fireQuest(prisma, playerId, 'bond', 1);

      if (mainOwl.bond < BOND_MAX) {
        const newBond = Math.min(BOND_MAX, mainOwl.bond + BOND_GAIN_PER_TAME);
        await prisma.owl.update({ where: { id: mainOwl.id }, data: { bond: newBond } });
      }

      const player = await prisma.player.findUnique({ where: { id: playerId }, select: { level: true } });
      if (player) {
        rollEncounterLootboxDrop(prisma, playerId, player.level, redis).catch(() => null);
      }

      return 'Tame basarili, baykus envantere eklendi.';
    }

    // Başarısız — attempt sayacını güncelle (sadece başarısız durumda)
    if (redis) {
      runDetached('pa-loss', () => trackSessionLoss(redis, playerId));
    }
    await prisma.encounter.update({
      where: { id: encounterId },
      data: {
        tameAttempts: { increment: 1 },
        failStreak: { increment: 1 },
      },
    });

    // Başarısız — branch roll
    const branchRoll = Math.random() * 100;

    if (branchRoll <= TAME_FAIL_ESCAPE_RATE) {
      await prisma.encounter.update({ where: { id: encounterId }, data: { status: 'closed' } });
      return 'Baykus kacti.';
    }

    if (branchRoll <= TAME_FAIL_ESCAPE_RATE + TAME_FAIL_ATTACK_RATE) {
      const attackerBotId = `wild:${encounter.owlSpecies}:${encounter.id}`;
      await prisma.player.upsert({
        where: { id: attackerBotId },
        create: { id: attackerBotId, level: 1, coins: 0, xp: 0 },
        update: {},
      });
      const wildMain = await prisma.owl.findFirst({
        where: { ownerId: attackerBotId, isMain: true },
        select: { id: true },
      });
      if (!wildMain) {
        // FIX: Bot owl'a encounter'ın gerçek stat'larını ver — artık trivial değil
        const wildStats = encounter.owlStats as { gaga: number; goz: number; kulak: number; kanat: number; pence: number } | null;
        const wildBase = wildStats ?? { gaga: 10, goz: 10, kulak: 10, kanat: 10, pence: 10 };
        await prisma.owl.create({
          data: {
            ownerId:    attackerBotId,
            species:    encounter.owlSpecies,
            tier:       encounter.owlTier,
            quality:    encounter.owlQuality,
            hp:         100,
            hpMax:      100,
            staminaCur: 100,
            isMain:     true,
            ...buildOwlStatWriteData(wildBase),
          },
        });
      }
      const fakeSessionId = await startPvP(prisma, playerId, attackerBotId);
      const pvpResult = await simulatePvP(prisma, fakeSessionId);

      // Bot kayıtlarını temizle — DB büyümesini önler
      await prisma.$transaction([
        prisma.owl.deleteMany({ where: { ownerId: attackerBotId } }),
        prisma.pvpSession.deleteMany({ where: { challengerId: attackerBotId } }),
        prisma.player.delete({ where: { id: attackerBotId } }),
      ]).catch(() => null); // Temizleme başarısız olsa da oyun devam eder
      if (pvpResult.winnerId === playerId) {
        await prisma.encounter.update({
          where: { id: encounterId },
          data: { failStreak: { increment: Math.floor(TAME_MINI_PVP_BONUS / TAME_FAIL_STREAK_BONUS) } },
        });
        return 'Tame basarisiz: mini PvP kazanildi, sonraki deneme bonus aldi.';
      }
      await prisma.encounter.update({ where: { id: encounterId }, data: { status: 'closed' } });
      return 'Tame basarisiz: mini PvP kaybedildi ve yabani baykus kacti.';
    }

    if (branchRoll <= TAME_FAIL_ESCAPE_RATE + TAME_FAIL_ATTACK_RATE + TAME_FAIL_INJURE_RATE) {
      return 'Tame basarisiz: baykusun yoruldu.';
    }

    return 'Tame basarisiz.';
  });
}
