// ============================================================
// pvp-sim.ts — Simüle PvP Sistemi (Bot Duel)
// Gerçek oyuncu verisi ASLA değiştirilmez.
// Sahte rakip üretilir, savaş simüle edilir, sadece oyuncu güncellenir.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import {
  DUEL_DAILY_COIN_CAP,
  OWL_SPECIES,
  PVP_STREAK_MIN_OPPONENT_RATIO,
  SIM_PVP_DIFFICULTY_TABLE,
  SIM_PVP_FAKE_NAMES,
  SIM_PVP_FAKE_SPECIES,
  SIM_PVP_NAME_PLACES,
  SIM_PVP_NAME_PREFIXES,
  SIM_PVP_NAME_SUFFIXES,
  SIM_PVP_NAME_TITLES,
  SIM_PVP_LOSE_XP,
  SIM_PVP_PLAYER_OWL_CHANCE,
  SIM_PVP_PLAYER_OWL_FLAVOR,
  SIM_PVP_RECENT_OPPONENT_CAP,
  SIM_PVP_RECENT_OPPONENT_TTL_SEC,
  SIM_PVP_WIN_COINS,
  SIM_PVP_WIN_XP,
  XP_PVP_LOSE,
} from '../config';
import { statEffect } from '../utils/math';
import { getEffectiveStats } from '../utils/owl-stats';
import { fetchPlayerDiscordNames } from '../utils/player-display-name';
import { formatOwlIdentity } from '../utils/owl-display';
import { addXP } from './xp';
import { recordPvpWin, refreshPowerScore } from './leaderboard';
import { fireQuest, trackEarnCoinsQuests } from './quest-tracker';
import { mergeQuestNotices } from './daily-quests';
import {
  applyStreakXpBonus,
  getStreakCoinBonus,
  getStreakXpBonus,
  getMilestoneMsg,
} from './pvp-streak';
import type { PvpTurnEvent } from '../utils/pvp-ux';
import { weightedRandom } from '../utils/rng';
import { applyCoinDeltaInRedis } from '../state/player-state';
import { withLock, grantDuelDailyCoins } from '../utils/lock';
import { pickBattleWinner, runPvpBattleExchanges } from './pvp';
import { runDetached } from '../utils/async';

// ── Tipler ───────────────────────────────────────────────────────────────────

export interface FakeOpponent {
  /** Görüntülenen isim (nickname veya species / sahte isim) */
  name: string;
  /** Bot rakiplerde tür satırı; player rakiplerde subtitle (nickname varken) */
  species: string;
  /** Savaş gücü (statEffect sonucu) */
  power: number;
  /** HP */
  hp: number;
  hpMax: number;
  /** Stamina */
  stamina: number;
  /** Zorluk etiketi */
  difficultyLabel: string;
  /** XP çarpanı */
  xpMult: number;
  /** Rakip kaynağı */
  source: 'bot' | 'player';
  /** Gerçek avcı baykuşu flavor satırı (yalnızca player) */
  flavorLine?: string;
  /** Internal — UI'da gösterilmez */
  ownerId?: string;
}

export interface SimPvpResult {
  playerWon: boolean;
  turns: number;
  events: PvpTurnEvent[];
  /** Oyuncunun kazandığı XP */
  xpGained: number;
  /** Oyuncunun kazandığı coin */
  coinsGained: number;
  /** XP sonrası seviye / çubuk */
  levelAfter: number;
  xpAfter: number;
  /** Streak sonuçları */
  streak: {
    newStreak: number;
    oldStreak: number;
    bestStreak: number;
    isNewRecord: boolean;
    streakCounted: boolean;
    xpBonusPct: number;
    bonusCoins: number;
    milestoneMsg: string | null;
  };
  opponent: FakeOpponent;
}

export type CachedSimMainOwl = {
  hp: number;
  hpMax: number;
  staminaCur: number;
  statGaga: number;
  statPence: number;
  statKanat: number;
};

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(min: number, max: number, val: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Ağırlıklı rastgele zorluk seçer.
 */
function pickDifficulty() {
  return weightedRandom(
    SIM_PVP_DIFFICULTY_TABLE.map((d) => ({ value: d, weight: d.weight })),
  );
}

const recentFakeNames: string[] = [];
const RECENT_FAKE_NAME_CAP = 24;

function rememberFakeName(name: string): void {
  recentFakeNames.push(name);
  if (recentFakeNames.length > RECENT_FAKE_NAME_CAP) recentFakeNames.shift();
}

function firstToken(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/** Hazır liste + önek/sonek + nadir yer+unvan; son 24 isim tekrarlanmaz. */
export function pickFakeOpponentName(): string {
  for (let attempt = 0; attempt < 16; attempt++) {
    const roll = Math.random();
    let name: string;
    if (roll < 0.08) {
      name = `${SIM_PVP_NAME_PLACES[rand(0, SIM_PVP_NAME_PLACES.length - 1)]!} ${SIM_PVP_NAME_TITLES[rand(0, SIM_PVP_NAME_TITLES.length - 1)]!}`;
    } else if (roll < 0.43) {
      name = SIM_PVP_FAKE_NAMES[rand(0, SIM_PVP_FAKE_NAMES.length - 1)]!;
    } else {
      const prefix = SIM_PVP_NAME_PREFIXES[rand(0, SIM_PVP_NAME_PREFIXES.length - 1)]!;
      let suffix = SIM_PVP_NAME_SUFFIXES[rand(0, SIM_PVP_NAME_SUFFIXES.length - 1)]!;
      let guard = 0;
      while (prefix === suffix && guard < 8) {
        suffix = SIM_PVP_NAME_SUFFIXES[rand(0, SIM_PVP_NAME_SUFFIXES.length - 1)]!;
        guard += 1;
      }
      name = `${prefix} ${suffix}`;
    }
    if (recentFakeNames.includes(name)) continue;
    if (recentFakeNames.some((prev) => firstToken(prev) === firstToken(name)) && attempt < 10) continue;
    rememberFakeName(name);
    return name;
  }
  const fallback = SIM_PVP_FAKE_NAMES[rand(0, SIM_PVP_FAKE_NAMES.length - 1)]!;
  rememberFakeName(fallback);
  return fallback;
}

/**
 * Sahte rakip üretir. Oyuncu gücüne göre ölçeklenir.
 * Hiçbir gerçek veri kullanılmaz.
 */
export function generateFakeOpponent(playerPower: number, playerHpMax = 200): FakeOpponent {
  const difficulty = pickDifficulty();

  // Güç: oyuncu gücü × zorluk oranı × küçük rastgele varyasyon (±8%)
  const variation = 0.92 + Math.random() * 0.16;
  const targetPower = playerPower * difficulty.powerRatio * variation;

  // HP: oyuncu havuzuyla orantılı — düşük bot HP ile güç farkı ezilmesin
  const powerRatio = targetPower / Math.max(1, playerPower);
  const hpMax = clamp(80, 600, Math.round(playerHpMax * powerRatio * (0.92 + Math.random() * 0.16)));

  // Stamina: 60–100 arası
  const stamina = rand(60, 100);

  // İsim ve tür
  const name    = pickFakeOpponentName();
  const species = SIM_PVP_FAKE_SPECIES[rand(0, SIM_PVP_FAKE_SPECIES.length - 1)]!;

  return {
    name,
    species,
    power: Math.max(1, targetPower),
    hp: hpMax,
    hpMax,
    stamina,
    difficultyLabel: difficulty.label,
    xpMult: difficulty.xpMult,
    source: 'bot',
  };
}

const PLAYER_OWL_DIFFICULTY = SIM_PVP_DIFFICULTY_TABLE.find((d) => d.label === 'Dengeli')
  ?? SIM_PVP_DIFFICULTY_TABLE[1]!;

/** Sim düello full-stamina tabanı — güncel stamina savaş sonucunu bozmasın. */
const SIM_PVP_FULL_STAMINA = 100;

type OwlPickRow = {
  id: string;
  ownerId: string;
  species: string;
  nickname: string | null;
  hp: number;
  hpMax: number;
  staminaCur: number;
  statGaga: number;
  statPence: number;
  statKanat: number;
};

function recentOpponentsKey(playerId: string): string {
  return `duel:recent:${playerId}`;
}

/**
 * Son gerçek rakipleri okur (tekrar engeli).
 *
 * @param redis Redis istemcisi
 * @param playerId Düello atan oyuncu
 */
export async function loadRecentDuelOpponentIds(
  redis: Redis,
  playerId: string,
): Promise<string[]> {
  try {
    return await redis.lrange(recentOpponentsKey(playerId), 0, SIM_PVP_RECENT_OPPONENT_CAP - 1);
  } catch {
    return [];
  }
}

/**
 * Gerçek rakibi recent listesine yazar (LPUSH + LTRIM + EXPIRE).
 *
 * @param redis Redis istemcisi
 * @param playerId Düello atan oyuncu
 * @param opponentOwnerId Rakip ownerId
 */
export async function rememberDuelOpponent(
  redis: Redis,
  playerId: string,
  opponentOwnerId: string,
): Promise<void> {
  const key = recentOpponentsKey(playerId);
  try {
    const pipe = redis.pipeline();
    pipe.lpush(key, opponentOwnerId);
    pipe.ltrim(key, 0, SIM_PVP_RECENT_OPPONENT_CAP - 1);
    pipe.expire(key, SIM_PVP_RECENT_OPPONENT_TTL_SEC);
    await pipe.exec();
  } catch {
    // recent engeli best-effort — düelloyu bozma
  }
}

function owlRowToOpponent(row: OwlPickRow, ownerDisplayName?: string | null): FakeOpponent {
  const identity = formatOwlIdentity(
    { species: row.species, nickname: row.nickname },
    ownerDisplayName,
  );
  const oppEff = getEffectiveStats(row);
  const power = statEffect(oppEff.gaga + oppEff.pence + oppEff.kanat);
  const flavorLine = SIM_PVP_PLAYER_OWL_FLAVOR[rand(0, SIM_PVP_PLAYER_OWL_FLAVOR.length - 1)]!;

  return {
    name: identity.primary,
    species: identity.subtitle ?? row.species,
    power: Math.max(1, power),
    // Snapshot savaşta full HP — güncel HP adil güç karşılaşmasını bozar
    hp: row.hpMax,
    hpMax: row.hpMax,
    stamina: SIM_PVP_FULL_STAMINA,
    difficultyLabel: PLAYER_OWL_DIFFICULTY.label,
    xpMult: PLAYER_OWL_DIFFICULTY.xpMult,
    source: 'player',
    flavorLine,
    ownerId: row.ownerId,
  };
}

async function queryRandomMainOwl(
  prisma: PrismaClient,
  playerId: string,
  excludeIds: string[],
): Promise<OwlPickRow | null> {
  const cleaned = excludeIds.filter((id) => id && id !== playerId);
  const rows = cleaned.length > 0
    ? await prisma.$queryRaw<OwlPickRow[]>`
        SELECT id, "ownerId", species, nickname, hp, "hpMax", "staminaCur",
               "statGaga", "statPence", "statKanat"
        FROM "Owl"
        WHERE "isMain" = true
          AND "ownerId" != ${playerId}
          AND "ownerId" NOT IN (${Prisma.join(cleaned)})
        ORDER BY RANDOM()
        LIMIT 1
      `
    : await prisma.$queryRaw<OwlPickRow[]>`
        SELECT id, "ownerId", species, nickname, hp, "hpMax", "staminaCur",
               "statGaga", "statPence", "statKanat"
        FROM "Owl"
        WHERE "isMain" = true AND "ownerId" != ${playerId}
        ORDER BY RANDOM()
        LIMIT 1
      `;
  return rows[0] ?? null;
}

/**
 * Başka bir oyuncunun main baykuşunu salt okunur snapshot olarak döndürür.
 * `excludeIds` doluysa önce onları atlar; havuz boşsa engeli gevşetip tekrar dener.
 *
 * @param prisma Prisma istemcisi
 * @param playerId Düello atan oyuncu
 * @param excludeIds Son eşleşen rakip ownerId listesi
 */
export async function pickRandomPlayerOwlOpponent(
  prisma: PrismaClient,
  playerId: string,
  excludeIds: string[] = [],
): Promise<FakeOpponent | null> {
  let row = await queryRandomMainOwl(prisma, playerId, excludeIds);
  if (!row && excludeIds.length > 0) {
    row = await queryRandomMainOwl(prisma, playerId, []);
  }
  if (!row) return null;

  const ownerNames = await fetchPlayerDiscordNames(prisma, [row.ownerId]);
  return owlRowToOpponent(row, ownerNames.get(row.ownerId));
}

// ── Savaş Motoru ─────────────────────────────────────────────────────────────

/**
 * Savaşı tamamen bellekte simüle eder. DB'ye hiçbir şey yazmaz.
 * Gerçek PvP ile aynı exchange sırası ve kazanan seçimi kullanılır.
 */
function simulateBattle(
  playerId: string,
  playerPower: number,
  playerHp: number,
  playerHpMax: number,
  playerStamina: number,
  opponent: FakeOpponent,
): { events: PvpTurnEvent[]; playerWon: boolean; turns: number } {
  const challenger = {
    playerId,
    hp: playerHp,
    hpMax: playerHpMax,
    stamina: playerStamina,
    power: playerPower,
    buffDamageMult: 1,
    buffDodgeBonus: 0,
  };
  const defender = {
    playerId: 'bot',
    hp: opponent.hp,
    hpMax: opponent.hpMax,
    stamina: opponent.stamina,
    power: opponent.power,
    buffDamageMult: 1,
    buffDodgeBonus: 0,
  };

  const { turnEvents, turns } = runPvpBattleExchanges(challenger, defender);
  const winner = pickBattleWinner(challenger, defender);
  return { events: turnEvents, playerWon: winner.playerId === playerId, turns };
}

// ── Ana Fonksiyon ─────────────────────────────────────────────────────────────

/**
 * Simüle PvP'yi çalıştırır.
 * - Sahte rakip üretir
 * - Savaşı bellekte simüle eder
 * - SADECE oyuncunun verisini günceller (XP, coin, streak)
 * - Gerçek PvP tablosuna hiçbir şey yazmaz
 * - Günlük coin kazanç üst sınırını (DUEL_DAILY_COIN_CAP) uygular; XP etkilenmez
 */
export async function runSimulatedPvP(
  prisma: PrismaClient,
  playerId: string,
  redis: Redis,
  cachedMainOwl?: CachedSimMainOwl,
): Promise<SimPvpResult> {
  const [player, mainOwl] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: {
        level: true,
        pvpStreak: true,
        pvpBestStreak: true,
      },
    }),
    cachedMainOwl
      ? Promise.resolve(cachedMainOwl)
      : prisma.owl.findFirst({
          where: { ownerId: playerId, isMain: true },
          select: {
            hp: true, hpMax: true, staminaCur: true,
            statGaga: true, statPence: true, statKanat: true,
          },
        }),
  ]);

  if (!player || !mainOwl) {
    throw new Error('Oyuncu veya main baykuş bulunamadı.');
  }

  // Oyuncu gücü
  const playerEff = getEffectiveStats(mainOwl);
  const playerPower = statEffect(playerEff.gaga + playerEff.pence + playerEff.kanat);

  // Rakip: yüksek şansla gerçek main (recent hariç); yoksa bot
  const rollPlayerOwl = Math.random() * 100 < SIM_PVP_PLAYER_OWL_CHANCE;
  const recentIds = rollPlayerOwl
    ? await loadRecentDuelOpponentIds(redis, playerId)
    : [];
  const opponent = rollPlayerOwl
    ? (await pickRandomPlayerOwlOpponent(prisma, playerId, recentIds))
      ?? generateFakeOpponent(playerPower, mainOwl.hpMax)
    : generateFakeOpponent(playerPower, mainOwl.hpMax);

  if (opponent.source === 'player' && opponent.ownerId) {
    await rememberDuelOpponent(redis, playerId, opponent.ownerId);
  }

  // Full HP / stamina — güncel PvP hasarı sim sonucu bozmasın
  const { events, playerWon, turns } = simulateBattle(
    playerId,
    playerPower,
    mainOwl.hpMax,
    mainOwl.hpMax,
    SIM_PVP_FULL_STAMINA,
    opponent,
  );

  // ── Streak hesapla ────────────────────────────────────────────────────────
  const oldStreak = player.pvpStreak;
  const oldBest   = player.pvpBestStreak;

  // Bot duel'da da anti-abuse kontrolü: rakip gücü oyuncunun %70'inden düşükse streak sayılmaz
  const streakCounted =
    playerWon && opponent.power >= playerPower * PVP_STREAK_MIN_OPPONENT_RATIO;
  const newStreak     = playerWon ? oldStreak + 1 : 0;
  const newBest       = Math.max(oldBest, newStreak);
  const isNewRecord   = newBest > oldBest;
  const xpBonusPct    = playerWon ? getStreakXpBonus(newStreak) : 0;
  const bonusCoins    = playerWon ? getStreakCoinBonus(newStreak) : 0;
  const milestoneMsg  = playerWon ? getMilestoneMsg(newStreak, oldStreak) : null;

  // ── XP ve coin hesapla ────────────────────────────────────────────────────
  let xpGained: number;
  let coinsGained: number;

  if (playerWon) {
    const baseXP = Math.round(SIM_PVP_WIN_XP * opponent.xpMult);
    xpGained    = applyStreakXpBonus(baseXP, xpBonusPct);
    coinsGained = SIM_PVP_WIN_COINS + bonusCoins;
  } else {
    xpGained    = SIM_PVP_LOSE_XP;
    coinsGained = 0;
  }

  // ── Günlük coin üst sınırı (A2 fix) ──────────────────────────────────────
  // XP etkilenmez — sadece coin ödülü sınırlanır.
  let cappedCoins = coinsGained;
  if (playerWon && coinsGained > 0 && redis) {
    const dailyKey = `duel:daily:${playerId}:${new Date().toISOString().slice(0, 10)}`;
    cappedCoins = await grantDuelDailyCoins(
      redis,
      dailyKey,
      coinsGained,
      DUEL_DAILY_COIN_CAP,
      25 * 60 * 60,
    );
  }

  // ── DB güncelle (SADECE oyuncu) ───────────────────────────────────────────
  await prisma.player.update({
    where: { id: playerId },
    data: {
      pvpStreak:     newStreak,
      pvpBestStreak: newBest,
      pvpCount:      { increment: 1 },
      ...(playerWon
        ? { pvpStreakLoss: 0, ...(redis ? {} : { coins: { increment: cappedCoins } }) }
        : { pvpStreakLoss: { increment: 1 } }),
    },
  });

  const [xpResult] = await Promise.all([
    addXP(
      prisma,
      playerId,
      xpGained,
      playerWon ? 'pvpWin' : 'pvpLose',
      undefined,
      undefined,
      redis,
    ),
    playerWon && cappedCoins > 0 && redis
      ? withLock(playerId, 'financial', () =>
          applyCoinDeltaInRedis(redis, playerId, cappedCoins, prisma),
        )
      : Promise.resolve(null),
  ]);

  // Liderboard — sadece kazanınca (kritik yol dışı)
  if (playerWon && redis) {
    runDetached('pvp-record-win', () => recordPvpWin(prisma, playerId, redis));
  } else if (playerWon) {
    await prisma.player.update({
      where: { id: playerId },
      data: {
        totalPvpWins: { increment: 1 },
        totalCoinsEarned: { increment: cappedCoins },
      },
    });
  }
  runDetached('pvp-power-score', () => refreshPowerScore(prisma, playerId));

  if (playerWon) {
    runDetached('pvp-quests', async () => {
      await mergeQuestNotices(
        await fireQuest(prisma, playerId, 'duel', 1, undefined, redis),
        await trackEarnCoinsQuests(prisma, playerId, cappedCoins, redis),
        ...(streakCounted && newStreak >= 2
          ? [await fireQuest(prisma, playerId, 'pvp_streak', 1, undefined, redis)]
          : []),
      );
    });
  }

  return {
    playerWon,
    turns,
    events,
    xpGained,
    coinsGained: cappedCoins,
    levelAfter: xpResult.currentLevel,
    xpAfter: xpResult.currentXP,
    streak: {
      newStreak,
      oldStreak,
      bestStreak: newBest,
      isNewRecord,
      streakCounted,
      xpBonusPct,
      bonusCoins,
      milestoneMsg,
    },
    opponent,
  };
}
