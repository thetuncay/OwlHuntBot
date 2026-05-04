import type { PrismaClient } from '@prisma/client';
import {
  ITEM_MAX_PER_ATTEMPT,
  OWL_SPECIES,
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
import { rollTraits, parseStoredTraits } from './traits';
import {
  ENCOUNTER_SCALE_THRESHOLD,
  ENCOUNTER_SCALE_RATE,
  ENCOUNTER_SCALE_MAX,
} from '../config';
import { rollEncounterLootboxDrop } from './drops';

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
 */
export async function createEncounter(prisma: PrismaClient, playerId: string): Promise<string | null> {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  const mainOwl = await prisma.owl.findFirst({ where: { ownerId: playerId, isMain: true } });
  if (!player || !mainOwl) {
    throw new Error('Encounter icin oyuncu veya main baykus bulunamadi.');
  }

  // ── Limbo Temizleme ───────────────────────────────────────────────────────
  // Tame session TTL 5 dakika. Session süresi dolunca encounter DB'de "open"
  // kalıyordu. Yeni encounter öncesinde 6+ dakika önce oluşturulmuş open
  // encounter'ları kapat.
  const limboThreshold = new Date(Date.now() - 6 * 60 * 1000); // 6 dakika önce
  await prisma.encounter.updateMany({
    where: {
      playerId,
      status: 'open',
      createdAt: { lt: limboThreshold },
    },
    data: { status: 'closed' },
  });
  // ─────────────────────────────────────────────────────────────────────────

  const chance = encounterChance(player.level, mainOwl.statGoz, mainOwl.statKulak,
    // Scouting modundaki baykuş sayısını say — her biri +%1 encounter şansı verir
    await prisma.owl.count({ where: { ownerId: playerId, passiveMode: 'scouting', isMain: false } }),
  );
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
  const playerPower =
    statEffect(mainOwl.statGaga)  +
    statEffect(mainOwl.statGoz)   +
    statEffect(mainOwl.statKulak) +
    statEffect(mainOwl.statKanat) +
    statEffect(mainOwl.statPence);

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

      await prisma.owl.create({
        data: {
          ownerId:    playerId,
          species:    encounter.owlSpecies,
          tier:       encounter.owlTier,
          quality:    encounter.owlQuality,
          hp:         mainOwl.hpMax,
          hpMax:      mainOwl.hpMax,
          staminaCur: mainOwl.staminaCur,
          statGaga:   stats?.gaga   ?? 1,
          statGoz:    stats?.goz    ?? 1,
          statKulak:  stats?.kulak  ?? 1,
          statKanat:  stats?.kanat  ?? 1,
          statPence:  stats?.pence  ?? 1,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          traits:     traits as any,
        } as any,
      });
      await addXP(prisma, playerId, 100, 'tameSuccess');
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

    // Item kontrolü ve tüketimi
    const itemBonus = itemNames.reduce(
      (sum, itemName) => sum + (TAME_ITEM_BONUS[itemName] ?? TAME_ITEM_BONUS_PER_ITEM), 0,
    );
    for (const name of itemNames) {
      const item = await prisma.inventoryItem.findUnique({
        where: { ownerId_itemName: { ownerId: playerId, itemName: name } },
      });
      if (!item || item.quantity < 1) throw new Error(`Gerekli item bulunamadi: ${name}`);
    }
    for (const name of itemNames) {
      await prisma.inventoryItem.update({
        where: { ownerId_itemName: { ownerId: playerId, itemName: name } },
        data: { quantity: { decrement: 1 } },
      });
    }

    // Şans hesapla
    const baseChance = TAME_BASE_CHANCE[encounter.owlTier];
    if (baseChance === undefined) throw new Error('Tame sans tablosunda tier degeri bulunamadi.');
    const qualityAdj = QUALITY_TAME_ADJ[encounter.owlQuality] ?? 0;
    const failStreakBonus = encounter.failStreak * TAME_FAIL_STREAK_BONUS;
    const repeatPenalty = encounter.tameAttempts >= 1 ? TAME_REPEAT_PENALTY : 0;
    const chance = tameChance(
      baseChance,
      mainOwl.statGoz,
      mainOwl.statKulak,
      itemBonus + failStreakBonus - repeatPenalty,
      qualityAdj,
    );
    const won = Math.random() * 100 < chance;

    // Deneme sayısını güncelle
    await prisma.encounter.update({
      where: { id: encounterId },
      data: {
        tameAttempts: { increment: 1 },
        failStreak: won ? 0 : { increment: 1 },
      },
    });

    if (won) {
      const traits = parseStoredTraits(encounter.owlTraits);
      // FIX: encounter'dan gelen pre-rolled stat'ları kullan
      const stats = encounter.owlStats as { gaga: number; goz: number; kulak: number; kanat: number; pence: number } | null;
      await prisma.owl.create({
        data: {
          ownerId:    playerId,
          species:    encounter.owlSpecies,
          tier:       encounter.owlTier,
          quality:    encounter.owlQuality,
          hp:         mainOwl.hpMax,
          hpMax:      mainOwl.hpMax,
          staminaCur: mainOwl.staminaCur,
          statGaga:   stats?.gaga   ?? 1,
          statGoz:    stats?.goz    ?? 1,
          statKulak:  stats?.kulak  ?? 1,
          statKanat:  stats?.kanat  ?? 1,
          statPence:  stats?.pence  ?? 1,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          traits: traits as any,
        } as any,
      });
      await prisma.encounter.update({ where: { id: encounterId }, data: { status: 'closed' } });
      await addXP(prisma, playerId, 100, 'tameSuccess');

      // Bond artışı: tame başarısında main baykuşun bond'u artar
      if (mainOwl.bond < BOND_MAX) {
        const newBond = Math.min(BOND_MAX, mainOwl.bond + BOND_GAIN_PER_TAME);
        await prisma.owl.update({ where: { id: mainOwl.id }, data: { bond: newBond } });
      }

      // Encounter tame başarısında lootbox drop şansı (en yüksek kaynak)
      const player = await prisma.player.findUnique({ where: { id: playerId }, select: { level: true } });
      if (player) {
        rollEncounterLootboxDrop(prisma, playerId, player.level).catch(() => null);
      }

      return 'Tame basarili, baykus envantere eklendi.';
    }

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
        data: { hp: { decrement: 5 } },
      });
      return 'Tame basarisiz: baykusun yaralandi.';
    }

    return 'Tame basarisiz.';
  });
}
