import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
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
  STAT_ROLL_WEIGHT_LOW,
  STAT_ROLL_WEIGHT_MID,
  STAT_ROLL_WEIGHT_HIGH,
  BOND_GAIN_PER_TAME,
  BOND_MAX,
} from '../config';
import { encounterChance, tameChance, statEffect, clamp } from '../utils/math';
import { withLock } from '../utils/lock';
import { simulatePvP, startPvP } from './pvp';
import { addXP } from './xp';
import { rollTraits, parseStoredTraits, resolveTraits, calcTraitEffects } from './traits';
import {
  ENCOUNTER_SCALE_THRESHOLD,
  ENCOUNTER_SCALE_RATE,
  ENCOUNTER_SCALE_MAX,
} from '../config';
import { rollEncounterLootboxDrop } from './drops';
import { trackQuestProgress } from './daily-quests';
import { setScoutingOwlCount } from '../state/player-state';

type OwlQuality = 'Trash' | 'Common' | 'Good' | 'Rare' | 'Elite' | 'God Roll';

/**
 * Tier'a gore agirlikli stat uretir.
 *
 * Uc bolge tanimlidir:
 *   - Dusuk  (%55): Sik cikan aralik — ortalama baykus buradan gelir
 *   - Orta   (%35): Iyi ama nadir degil
 *   - Yuksek (%10): Nadir — heyecan yaratan kisim
 *
 * Eski sabit aralik yerine bu sistem kullanilir.
 * Mevcut baykuslara dokunmaz — sadece yeni encounter'larda gecer.
 */
function rollStatByTier(tier: number): number {
  const band = STAT_ROLL_BANDS[tier];
  if (!band) {
    // Tanimli tier yoksa guvenli fallback
    return Math.floor(Math.random() * 40) + 10;
  }

  const totalWeight = STAT_ROLL_WEIGHT_LOW + STAT_ROLL_WEIGHT_MID + STAT_ROLL_WEIGHT_HIGH;
  const roll = Math.random() * totalWeight;

  let [min, max]: [number, number] = band.low;
  if (roll >= STAT_ROLL_WEIGHT_LOW + STAT_ROLL_WEIGHT_MID) {
    [min, max] = band.high;
  } else if (roll >= STAT_ROLL_WEIGHT_LOW) {
    [min, max] = band.mid;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function qualityByScore(score: number): OwlQuality {
  if (score < 0.28) return 'Trash';
  if (score < 0.46) return 'Common';
  if (score < 0.62) return 'Good';
  if (score < 0.75) return 'Rare';
  if (score < 0.88) return 'Elite';
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

  const chance = encounterChance(player.level, mainOwl.statGoz, mainOwl.statKulak, scoutingCount);
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

  // ── Hidden Scaling (Matchmaking) ─────────────────────────────────────────
  // Oyuncunun gucunu hesapla (soft cap formulu ile)
  const pLvl = playerSnapshot?.prestigeLevel ?? 0;
  const playerPower =
    statEffect(mainOwl.statGaga, pLvl)  +
    statEffect(mainOwl.statGoz, pLvl)   +
    statEffect(mainOwl.statKulak, pLvl) +
    statEffect(mainOwl.statKanat, pLvl) +
    statEffect(mainOwl.statPence, pLvl);

  // Esigi asan guc icin gizli stat artisi hesapla
  // Oyuncuya hicbir sey gosterilmez — immersion bozulmaz
  const hiddenBonus = clamp(
    0,
    ENCOUNTER_SCALE_MAX,
    Math.max(0, playerPower - ENCOUNTER_SCALE_THRESHOLD) * ENCOUNTER_SCALE_RATE,
  );

  // Stat'lari uret ve hidden scaling uygula
  const applyScaling = (raw: number): number =>
    Math.min(100, Math.round(raw * (1 + hiddenBonus)));

  const statGaga  = applyScaling(rollStatByTier(species.tier));
  const statGoz   = applyScaling(rollStatByTier(species.tier));
  const statKulak = applyScaling(rollStatByTier(species.tier));
  const statKanat = applyScaling(rollStatByTier(species.tier));
  const statPence = applyScaling(rollStatByTier(species.tier));

  const qualityScore = (statGaga + statGoz + statKulak + statKanat + statPence) / 500;
  const quality = qualityByScore(qualityScore);

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
        gaga: statGaga,
        goz: statGoz,
        kulak: statKulak,
        kanat: statKanat,
        pence: statPence,
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
): Promise<void> {
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
    if (!encounter || encounter.status !== 'open') return;

    if (success) {
      const mainOwl = await prisma.owl.findFirst({ where: { ownerId: playerId, isMain: true } });
      if (!mainOwl) return;

      const traits = parseStoredTraits(encounter.owlTraits);
      const stats = encounter.owlStats as { gaga: number; goz: number; kulak: number; kanat: number; pence: number } | null;

      const baseHp = OWL_BASE_HP[encounter.owlTier] ?? 100;
      const baseStamina = OWL_BASE_STAMINA[encounter.owlTier] ?? 100;

      // Atomik: owl create + encounter close tek transaction'da
      // Crash sonrası retry double-owl oluşturmaz
      await prisma.$transaction(async (tx) => {
        await tx.owl.create({
          data: {
            ownerId:    playerId,
            species:    encounter.owlSpecies,
            tier:       encounter.owlTier,
            quality:    encounter.owlQuality,
            hp:         baseHp,
            hpMax:      baseHp,
            staminaCur: baseStamina,
            statGaga:   stats?.gaga   ?? 1,
            statGoz:    stats?.goz    ?? 1,
            statKulak:  stats?.kulak  ?? 1,
            statKanat:  stats?.kanat  ?? 1,
            statPence:  stats?.pence  ?? 1,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            traits:     traits as any,
          } as any,
        });
        await tx.encounter.update({
          where: { id: encounterId },
          data: { status: 'closed' },
        });
      });

      await addXP(prisma, playerId, 100, 'tameSuccess');
      // Quest tracking: encounter butonuyla gelen tame akışı buradan geçer
      trackQuestProgress(prisma, playerId, 'tame', 1).catch(() => null);
      return;
    }

    await prisma.encounter.update({
      where: { id: encounterId },
      data: { status: 'closed' },
    });
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
    await prisma.$transaction(async (tx) => {
      for (const name of itemNames) {
        const item = await tx.inventoryItem.findUnique({
          where: { ownerId_itemName: { ownerId: playerId, itemName: name } },
        });
        if (!item || item.quantity < 1) throw new Error(`Gerekli item bulunamadi: ${name}`);
      }
      for (const name of itemNames) {
        await tx.inventoryItem.update({
          where: { ownerId_itemName: { ownerId: playerId, itemName: name } },
          data: { quantity: { decrement: 1 } },
        });
      }
    });

    // Şans hesapla
    const baseChance = TAME_BASE_CHANCE[encounter.owlTier];
    if (baseChance === undefined) throw new Error('Tame sans tablosunda tier degeri bulunamadi.');
    const qualityAdj = QUALITY_TAME_ADJ[encounter.owlQuality] ?? 0;
    const failStreakBonus = encounter.failStreak * TAME_FAIL_STREAK_BONUS;
    const repeatPenalty = encounter.tameAttempts >= 1 ? TAME_REPEAT_PENALTY : 0;

    // WHY: Trait tameChance çarpanı uygulanıyor.
    // Evcil Ruh (+%28) veya Keskin Göz (-%20) gibi trait'ler artık gerçekten etkili.
    const mainOwlTraits = parseStoredTraits((mainOwl as any).traits);
    const mainOwlTraitEffects = calcTraitEffects(resolveTraits(mainOwlTraits));

    const rawChance = tameChance(
      baseChance,
      mainOwl.statGoz,
      mainOwl.statKulak,
      itemBonus + failStreakBonus - repeatPenalty,
      qualityAdj,
    );
    const chance = rawChance * mainOwlTraitEffects.tameChance;
    const won = Math.random() * 100 < chance;

    if (won) {
      const traits = parseStoredTraits(encounter.owlTraits);
      const stats = encounter.owlStats as { gaga: number; goz: number; kulak: number; kanat: number; pence: number } | null;
      const tameBaseHp = OWL_BASE_HP[encounter.owlTier] ?? 100;
      const tameBaseStamina = OWL_BASE_STAMINA[encounter.owlTier] ?? 100;

      // Atomik: attempt sayacı + owl create + encounter close tek transaction'da
      await prisma.$transaction(async (tx) => {
        await tx.encounter.update({
          where: { id: encounterId },
          data: { tameAttempts: { increment: 1 }, failStreak: 0, status: 'closed' },
        });
        await tx.owl.create({
          data: {
            ownerId:    playerId,
            species:    encounter.owlSpecies,
            tier:       encounter.owlTier,
            quality:    encounter.owlQuality,
            hp:         tameBaseHp,
            hpMax:      tameBaseHp,
            staminaCur: tameBaseStamina,
            statGaga:   stats?.gaga   ?? 1,
            statGoz:    stats?.goz    ?? 1,
            statKulak:  stats?.kulak  ?? 1,
            statKanat:  stats?.kanat  ?? 1,
            statPence:  stats?.pence  ?? 1,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            traits: traits as any,
          } as any,
        });
      });

      await addXP(prisma, playerId, 100, 'tameSuccess');
      trackQuestProgress(prisma, playerId, 'tame', 1).catch(() => null);

      if (mainOwl.bond < BOND_MAX) {
        const newBond = Math.min(BOND_MAX, mainOwl.bond + BOND_GAIN_PER_TAME);
        await prisma.owl.update({ where: { id: mainOwl.id }, data: { bond: newBond } });
      }

      const player = await prisma.player.findUnique({ where: { id: playerId }, select: { level: true } });
      if (player) {
        rollEncounterLootboxDrop(prisma, playerId, player.level).catch(() => null);
      }

      return 'Tame basarili, baykus envantere eklendi.';
    }

    // Başarısız — attempt sayacını güncelle (sadece başarısız durumda)
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
            statGaga:   wildStats?.gaga   ?? 10,
            statGoz:    wildStats?.goz    ?? 10,
            statKulak:  wildStats?.kulak  ?? 10,
            statKanat:  wildStats?.kanat  ?? 10,
            statPence:  wildStats?.pence  ?? 10,
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
      await prisma.owl.update({
        where: { id: mainOwl.id },
        data: { hp: Math.max(0, mainOwl.hp - 5) }, // HP 0'ın altına düşmez
      });
      return 'Tame basarisiz: baykusun yaralandi.';
    }

    return 'Tame basarisiz.';
  });
}
