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
  BOND_MAX,
} from '../config';
import type { HuntCatchResult, HuntRunResult, LootboxDrop } from '../types';
import { catchChance, clamp, huntRolls, spawnScore } from '../utils/math';
import { rollPercent, weightedRandom } from '../utils/rng';
import { withLock } from '../utils/lock';
import { invalidatePlayerCache, getPlayerBundle, setCachedPlayerBundle, type CachedPlayerBundle } from '../utils/player-cache';
import { enqueueDbWriteBulk, type UpsertInventoryJob } from '../utils/db-queue';
import { addXP } from './xp';
import { createEncounter } from './tame';
import { getBuffEffects, drainBuffCharge } from './items';
import { rollHuntLootboxDrop } from './drops';
import { trackQuestProgress } from './daily-quests';
import { getBiomeSession, setBiomeSession } from '../utils/biome-session';
import { parseStoredTraits, resolveTraits, calcTraitEffects } from './traits';

/**
 * Envanter job'larını tek bir MongoDB bulkWrite komutuyla uygular.
 * N ayrı upsert yerine tek round-trip — Req 2.1, 2.2, 2.3, 2.4.
 *
 * @param prisma  - PrismaClient instance
 * @param playerId - Oyuncunun ID'si (ownerId olarak kullanılır)
 * @param jobs    - UpsertInventoryJob dizisi; boşsa çağrı atlanır
 */
export function buildAndExecuteBulkWrite(
  prisma: PrismaClient,
  playerId: string,
  jobs: UpsertInventoryJob[],
): Promise<void> {
  if (jobs.length === 0) return Promise.resolve();

  // DATABASE_URL'den DB adını çıkar: son "/" ile "?" arasındaki segment
  const dbUrl = process.env.DATABASE_URL ?? '';
  const dbName = dbUrl.split('/').pop()?.split('?')[0] ?? 'baykusbot';

  return (prisma.$runCommandRaw({
    bulkWrite: 1,
    nsInfo: [{ ns: `${dbName}.InventoryItem` }],
    ops: jobs.map((job) => ({
      update: {
        filter: { ownerId: job.playerId, itemName: job.itemName },
        updateMods: {
          $inc: { quantity: job.quantity },
          $setOnInsert: {
            ownerId: job.playerId,
            itemName: job.itemName,
            itemType: job.itemType,
            rarity: job.rarity,
          },
        },
        upsert: true,
        multi: false,
      },
    })),
  }) as Promise<unknown>).then(() => undefined).catch((err: Error) => {
    console.error('[Hunt] BulkWrite failed:', err.message);
  });
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
    // ── Paralel veri çekimi ───────────────────────────────────────────────────
    // Player bundle (cache-first) + Owl fetch + BuffEffects aynı anda başlar.
    // Atlas M0'da her round-trip ~50-200ms — paralel yapı korunur.
    // Cache hit → 0 DB round-trip player için; cache miss → DB'den çeker.
    const [bundle, owl, buffEffects] = await Promise.all([
      getPlayerBundle(redis, prisma, playerId),
      prisma.owl.findUnique({ where: { id: owlId } }),
      getBuffEffects(prisma, playerId, 'hunt'),
    ]);

    // Yeni oyuncu: cache miss + DB miss → upsert ile oluştur ve cache'e yaz
    let resolvedBundle: CachedPlayerBundle;
    if (!bundle) {
      const newPlayer = await prisma.player.upsert({
        where: { id: playerId },
        create: { id: playerId },
        update: {},
        select: {
          id: true, level: true, xp: true, coins: true,
          huntComboStreak: true, noRareStreak: true, mainOwlId: true,
          dailyLootboxDrops: true, lastLootboxDropDate: true,
        },
      });
      resolvedBundle = {
        player: {
          ...newPlayer,
          lastLootboxDropDate: newPlayer.lastLootboxDropDate?.toISOString() ?? null,
        },
        mainOwl: null,
      };
      await setCachedPlayerBundle(redis, playerId, resolvedBundle);
    } else {
      resolvedBundle = bundle;
    }

    const player = resolvedBundle.player;

    // Biyom seviye kontrolü
    const foundBiome = BIOMES.find(b => b.id === biomeId) || BIOMES[0];
    if (!foundBiome) throw new Error('Biyom bulunamadı.');
    const safeBiome = foundBiome;
    if (player.level < safeBiome.minLevel) {
      throw new Error(`Bu biyoma girmek için en az **${safeBiome.minLevel}** seviye olmalısın.`);
    }

    // ── Biome Giriş Ücreti ────────────────────────────────────────────────────
    // WHY: entryCost config'de tanımlıydı ama hiç tahsil edilmiyordu.
    // Bu, tasarlanmış en büyük coin sink'in çalışmaması demekti.
    // Çözüm: İlk girişte (session yoksa) entryCost tahsil et, 30dk session başlat.
    // Sonraki hunt'larda aynı biyomda session varsa ücret alınmaz.
    if (safeBiome.entryCost > 0) {
      const existingSession = await getBiomeSession(redis, playerId);
      const isNewEntry = !existingSession || existingSession.biomeId !== biomeId;

      if (isNewEntry) {
        // Coin kontrolü — player.coins cache'de olmayabilir, DB'den çek
        const freshPlayer = await prisma.player.findUnique({
          where: { id: playerId },
          select: { coins: true },
        });
        if (!freshPlayer || freshPlayer.coins < safeBiome.entryCost) {
          throw new Error(
            `**${safeBiome.name}** biyomuna girmek için **${safeBiome.entryCost}** 💰 gerekiyor.\n` +
            `Sahip olduğun: **${freshPlayer?.coins ?? 0}** 💰`,
          );
        }
        // Giriş ücretini tahsil et
        await prisma.player.update({
          where: { id: playerId },
          data: { coins: { decrement: safeBiome.entryCost } },
        });
        // 30 dakikalık session başlat
        await setBiomeSession(redis, playerId, biomeId);
      }
    }

    if (!owl || owl.ownerId !== playerId) throw new Error('Av icin gecersiz baykus.');

    const species = OWL_SPECIES.find((s) => s.name === owl.species);
    if (!species) throw new Error('Baykus tur bilgisi bulunamadi.');

    // ── Trait Etkileri ────────────────────────────────────────────────────────
    // WHY: Trait sistemi config'de tanımlıydı, DB'de saklanıyordu ama hiçbir
    // yerde uygulanmıyordu. God Roll baykuş ile Trash baykuş aynı performansı
    // veriyordu — bu oyuncu güvenini zedeliyor ve God Roll'u değersizleştiriyordu.
    const storedTraits = parseStoredTraits((owl as any).traits);
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

    for (let i = 0; i < totalRoll; i++) {
      const threshold = OWL_PREY_POOL[owl.tier];
      if (threshold === undefined) throw new Error('Baykus tier av havuzu tanimli degil.');

      const candidate = PREY.filter((p) => p.difficulty <= threshold);
      const weighted = candidate.map((prey) => {
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
      const extraBonus = levelBonus + streakBonus + (isRarePrey ? pityBonus : 0) + buffEffects.catchBonus;
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

    // ── DB Güncelleme ─────────────────────────────────────────────────────────
    // Kritik path: sadece player XP + streak güncelleme + bond.
    // Envanter upsert'leri queue'ya alınır — kullanıcı bunları beklemez.
    // addXP'ye mevcut player snapshot'ı geçilir — tekrar DB'ye gitmez.

    // Envanter job'larını hazırla (queue'ya gidecek)
    const inventoryJobs: UpsertInventoryJob[] = [];

    for (const c of catches) {
      inventoryJobs.push({
        type: 'upsertInventory',
        playerId,
        itemName: c.preyName,
        itemType: 'Av',
        rarity: c.difficulty >= 7 ? 'Rare' : c.difficulty >= 4 ? 'Uncommon' : 'Common',
        quantity: 1,
      });

      // Item drop şansı (kritik avda 1.5x, buff loot_mult de uygulanır)
      for (const drop of HUNT_ITEM_DROPS) {
        if (c.difficulty < drop.minDifficulty) continue;
        const dropChance = (c.critical ? drop.dropChance * 1.5 : drop.dropChance) * buffEffects.lootMult * safeBiome.lootModifier;
        if (Math.random() * 100 < dropChance) {
          inventoryJobs.push({
            type: 'upsertInventory',
            playerId,
            itemName: drop.itemName,
            itemType: drop.itemType,
            rarity: drop.rarity,
            quantity: 1,
          });
        }
      }
    }

    // Kritik path: XP hesaplama + bond güncelleme paralel
    // addXP skipDbWrite:true ile çağrılır — hesaplanan değerleri döndürür, DB yazmasını rollHunt üstlenir.
    // Bond artışı paralel bırakılır (streak/xp ile birleştirilmez).
    const newStreak = realCatchCount > 0 ? player.huntComboStreak + 1 : 0;
    const newNoRareStreak = gotRare ? 0 : player.noRareStreak + 1;

    // WHY: $runCommandRaw MongoDB'ye özgüdür, PostgreSQL'de her hunt'ta hata
    // logu üretiyordu. Direkt prisma.owl.update ile aynı sonuç, sıfır hata.
    const bondUpdatePromise = realCatchCount > 0
      ? prisma.owl.update({
          where: { id: owlId },
          data:  { bond: Math.min(BOND_MAX, (owl.bond ?? 0) + BOND_GAIN_PER_HUNT) },
        }).catch(() => null)
      : Promise.resolve(null);

    const [xpResult] = await Promise.all([
      addXP(prisma, playerId, totalXP, 'hunt', {
        level: player.level,
        xp: player.xp,
        prestigeLevel: (player as any).prestigeLevel ?? 0,
      }, true),
      bondUpdatePromise,
    ]);

    // Birleşik player yazma: streak + xp/level tek round-trip'te
    if (xpResult.levelUp) {
      await prisma.player.update({
        where: { id: playerId },
        data: {
          huntComboStreak: newStreak,
          noRareStreak: newNoRareStreak,
          lastHunt: new Date(),
          level: xpResult.levelUp.newLevel,
          xp: xpResult.levelUp.remainingXP,
        },
      });
    } else {
      await prisma.player.update({
        where: { id: playerId },
        data: {
          huntComboStreak: newStreak,
          noRareStreak: newNoRareStreak,
          lastHunt: new Date(),
          xp: xpResult.currentXP,
        },
      });
    }

    // Envanter job'larını tek bulkWrite ile yaz — kullanıcı beklemez (Req 2)
    buildAndExecuteBulkWrite(prisma, playerId, inventoryJobs)
      .catch((err: Error) => console.error('[Hunt] BulkWrite failed:', err.message));

    // ── Arka Plan İşlemleri (fire-and-forget) ────────────────────────────────
    // Bu işlemler kullanıcı cevabını BEKLETMEZ — arka planda çalışır.
    // Liderboard, buff charge, lootbox, encounter — hepsi sonuç gösterildikten sonra işlenir.
    const rareSuccesses = catches.filter((c) => c.difficulty >= HUNT_HIGH_TIER_THRESHOLD).length;
    const hasCritical = catches.some((c) => c.critical);

    // Lootbox drop — arka planda hesapla
    // bundle.player gerçek cache verisi olduğundan tempCachedPlayer'a gerek yok.
    const lootboxDropsPromise = rollHuntLootboxDrop(prisma, redis, playerId, player.level, hasCritical)
      .catch(() => [] as LootboxDrop[]);

    // Encounter — player ve owl snapshot'larını geçerek ekstra DB sorgusunu önle.
    // Sonuç UI için gerekli (buton mesajı), bu yüzden lootbox ile paralel beklenir.
    const encounterPromise = createEncounter(
      prisma,
      playerId,
      { level: player.level },
      {
        tier: owl.tier,
        statGoz: owl.statGoz,
        statKulak: owl.statKulak,
        statGaga: owl.statGaga,
        statKanat: owl.statKanat,
        statPence: owl.statPence,
      },
    ).catch(() => null);

    // Liderboard istatistikleri — queue'ya gönder (DB'ye direkt yazma yok)
    // recordHuntStats yerine enqueueDbWrite kullan — kritik path dışı
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

    // Player cache'i invalidate et — veri değişti, sonraki komut taze çeksin
    invalidatePlayerCache(redis, playerId).catch(() => null);

    // Lootbox ve encounter sonuçlarını paralel bekle (UI için gerekli)
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
