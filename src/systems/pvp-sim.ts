// ============================================================
// pvp-sim.ts — Simüle PvP Sistemi (Bot Duel)
// Gerçek oyuncu verisi ASLA değiştirilmez.
// Sahte rakip üretilir, savaş simüle edilir, sadece oyuncu güncellenir.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import {
  OWL_SPECIES,
  PVP_EXECUTE_DAMAGE,
  PVP_EXECUTE_HP_THRESH,
  PVP_EXECUTE_STAM_THRESH,
  PVP_MAX_TURNS,
  PVP_RNG_WEIGHT,
  PVP_STAM_DAMAGE_MIN,
  PVP_STAM_DAMAGE_PEN,
  PVP_STAM_DODGE_MIN,
  PVP_STAM_DODGE_PEN,
  PVP_STAM_FATIGUE_PEN,
  PVP_STAM_FULL_MIN,
  PVP_STAT_WEIGHT,
  PVP_STREAK_MIN_OPPONENT_RATIO,
  SIM_PVP_DIFFICULTY_TABLE,
  SIM_PVP_FAKE_NAMES,
  SIM_PVP_FAKE_SPECIES,
  SIM_PVP_LOSE_XP,
  SIM_PVP_WIN_COINS,
  SIM_PVP_WIN_XP,
  XP_PVP_LOSE,
} from '../config';
import { damageMultiplier, statEffect } from '../utils/math';
import { addXP } from './xp';
import { recordCoinsEarned, recordPvpWin, refreshPowerScore } from './leaderboard';
import {
  applyStreakXpBonus,
  getStreakCoinBonus,
  getStreakXpBonus,
  getMilestoneMsg,
} from './pvp-streak';
import type { PvpTurnEvent } from '../utils/pvp-ux';
import { weightedRandom } from '../utils/rng';

// ── Tipler ───────────────────────────────────────────────────────────────────

export interface FakeOpponent {
  /** Görüntülenen isim */
  name: string;
  /** Baykuş türü adı (görsel) */
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
}

export interface SimPvpResult {
  playerWon: boolean;
  turns: number;
  events: PvpTurnEvent[];
  /** Oyuncunun kazandığı XP */
  xpGained: number;
  /** Oyuncunun kazandığı coin */
  coinsGained: number;
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

interface BattleState {
  id: string;
  hp: number;
  stamina: number;
  power: number;
  hpMax: number;
}

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

/**
 * Sahte rakip üretir. Oyuncu gücüne göre ölçeklenir.
 * Hiçbir gerçek veri kullanılmaz.
 */
export function generateFakeOpponent(playerPower: number): FakeOpponent {
  const difficulty = pickDifficulty();

  // Güç: oyuncu gücü × zorluk oranı × küçük rastgele varyasyon (±8%)
  const variation = 0.92 + Math.random() * 0.16;
  const targetPower = playerPower * difficulty.powerRatio * variation;

  // HP: güce orantılı, 80–200 arası
  const hpMax = clamp(80, 200, Math.round(targetPower * 2.5 + rand(10, 30)));

  // Stamina: 60–100 arası
  const stamina = rand(60, 100);

  // İsim ve tür
  const name    = SIM_PVP_FAKE_NAMES[rand(0, SIM_PVP_FAKE_NAMES.length - 1)]!;
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
  };
}

// ── Savaş Motoru ─────────────────────────────────────────────────────────────

interface TurnResult {
  damage: number;
  isCrit: boolean;
  isExecute: boolean;
}

function resolveTurn(
  attacker: BattleState,
  defender: BattleState,
  turn: number,
): TurnResult {
  const rng = Math.random() * attacker.power;
  let damage =
    (attacker.power * PVP_STAT_WEIGHT + rng * PVP_RNG_WEIGHT) * damageMultiplier(turn);
  let dodgeBonus = 0;

  if (attacker.stamina < PVP_STAM_FULL_MIN && attacker.stamina >= PVP_STAM_DODGE_MIN) {
    dodgeBonus = PVP_STAM_DODGE_PEN;
  } else if (attacker.stamina < PVP_STAM_DODGE_MIN && attacker.stamina >= PVP_STAM_DAMAGE_MIN) {
    damage += damage * PVP_STAM_DAMAGE_PEN;
  } else if (attacker.stamina < PVP_STAM_DAMAGE_MIN) {
    damage += damage * PVP_STAM_FATIGUE_PEN;
  }

  const isExecute =
    defender.hp <= defender.hpMax * PVP_EXECUTE_HP_THRESH &&
    defender.stamina < PVP_EXECUTE_STAM_THRESH;

  if (isExecute) damage = PVP_EXECUTE_DAMAGE;

  const effectiveDamage = Math.max(1, Math.round(damage + dodgeBonus));
  const isCrit = !isExecute && effectiveDamage > attacker.power * 1.5;

  defender.hp = Math.max(0, defender.hp - effectiveDamage);
  attacker.stamina = Math.max(0, attacker.stamina - 10);

  return { damage: effectiveDamage, isCrit, isExecute };
}

/**
 * Savaşı tamamen bellekte simüle eder. DB'ye hiçbir şey yazmaz.
 */
function simulateBattle(
  playerId: string,
  playerPower: number,
  playerHp: number,
  playerStamina: number,
  opponent: FakeOpponent,
): { events: PvpTurnEvent[]; playerWon: boolean; turns: number } {
  const player: BattleState = {
    id: playerId,
    hp: playerHp,
    hpMax: playerHp,
    stamina: playerStamina,
    power: playerPower,
  };
  const enemy: BattleState = {
    id: 'bot',
    hp: opponent.hp,
    hpMax: opponent.hpMax,
    stamina: opponent.stamina,
    power: opponent.power,
  };

  const events: PvpTurnEvent[] = [];
  let turns = 0;

  while (player.hp > 0 && enemy.hp > 0 && turns < PVP_MAX_TURNS) {
    // Oyuncu saldırır
    turns += 1;
    const r1 = resolveTurn(player, enemy, turns);
    events.push({
      turn: turns,
      attackerId: playerId,
      defenderId: 'bot',
      damage: r1.damage,
      attackerHp: player.hp,
      defenderHp: enemy.hp,
      attackerHpMax: player.hpMax,
      defenderHpMax: enemy.hpMax,
      isCrit: r1.isCrit,
      isExecute: r1.isExecute,
      isLastHit: enemy.hp <= 0,
    });
    if (enemy.hp <= 0) break;

    // Düşman saldırır
    turns += 1;
    const r2 = resolveTurn(enemy, player, turns);
    events.push({
      turn: turns,
      attackerId: 'bot',
      defenderId: playerId,
      damage: r2.damage,
      attackerHp: enemy.hp,
      defenderHp: player.hp,
      attackerHpMax: enemy.hpMax,
      defenderHpMax: player.hpMax,
      isCrit: r2.isCrit,
      isExecute: r2.isExecute,
      isLastHit: player.hp <= 0,
    });
  }

  const playerWon = player.hp >= enemy.hp;
  return { events, playerWon, turns };
}

// ── Ana Fonksiyon ─────────────────────────────────────────────────────────────

/**
 * Simüle PvP'yi çalıştırır.
 * - Sahte rakip üretir
 * - Savaşı bellekte simüle eder
 * - SADECE oyuncunun verisini günceller (XP, coin, streak)
 * - Gerçek PvP tablosuna hiçbir şey yazmaz
 */
export async function runSimulatedPvP(
  prisma: PrismaClient,
  playerId: string,
): Promise<SimPvpResult> {
  // Oyuncunun main baykuşunu çek
  const [player, mainOwl] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: {
        level: true,
        pvpStreak: true,
        pvpBestStreak: true,
      },
    }),
    prisma.owl.findFirst({
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
  const playerPower = statEffect(mainOwl.statGaga + mainOwl.statPence + mainOwl.statKanat);

  // Sahte rakip üret
  const opponent = generateFakeOpponent(playerPower);

  // Savaşı simüle et (saf hesaplama, DB yok)
  const { events, playerWon, turns } = simulateBattle(
    playerId,
    playerPower,
    mainOwl.hp,
    mainOwl.staminaCur,
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

  // ── DB güncelle (SADECE oyuncu) ───────────────────────────────────────────
  await prisma.player.update({
    where: { id: playerId },
    data: {
      pvpStreak:     newStreak,
      pvpBestStreak: newBest,
      pvpCount:      { increment: 1 },
      ...(playerWon
        ? { pvpStreakLoss: 0, coins: { increment: coinsGained } }
        : { pvpStreakLoss: { increment: 1 } }),
    },
  });

  // XP ekle
  await addXP(prisma, playerId, xpGained, playerWon ? 'pvpWin' : 'pvpLose');

  // Liderboard — sadece kazanınca
  if (playerWon) {
    recordPvpWin(prisma, playerId).catch(() => null);
    recordCoinsEarned(prisma, playerId, coinsGained).catch(() => null);
  }
  refreshPowerScore(prisma, playerId).catch(() => null);

  return {
    playerWon,
    turns,
    events,
    xpGained,
    coinsGained,
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
