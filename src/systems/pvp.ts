import type { Prisma, PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  PVP_EXECUTE_POWER_MULT,
  PVP_EXECUTE_HP_THRESH,
  PVP_EXECUTE_STAM_THRESH,
  PVP_DAMAGE_SCALE,
  PVP_EXECUTE_DAMAGE_SCALE,
  PVP_EXECUTE_MAX_HP_FRAC,
  PVP_MAX_TURNS,
  PVP_RNG_WEIGHT,
  PVP_STAM_DAMAGE_MIN,
  PVP_STAM_DAMAGE_PEN,
  PVP_STAM_DODGE_MIN,
  PVP_STAM_DODGE_PEN,
  PVP_STAM_FATIGUE_PEN,
  PVP_STAM_FULL_MIN,
  PVP_STAT_WEIGHT,
  PVP_DUEL_INVITE_TTL_MS,
  XP_PVP_LOSE,
  XP_PVP_WIN,
  BOND_GAIN_PER_PVP_WIN,
  BOND_MAX,
} from '../config';
import type { PvpSimResult } from '../types';
import type { PvpBattleData, PvpTurnEvent } from '../utils/pvp-ux';
import { damageMultiplier, statEffect } from '../utils/math';
import { getEffectiveStats } from '../utils/owl-stats';
import { acquireLock, releaseLock, withLock } from '../utils/lock';
import { addXP } from './xp';
import { recordPvpWin, refreshPowerScore } from './leaderboard';
import { updatePvpStreak, applyStreakXpBonus } from './pvp-streak';
import { getBuffEffects, drainBuffCharge } from './items';
import { rollPvpLootboxDrop } from './drops';
import { applyCoinDeltaInRedis, applyOwlStatUpdate, syncPlayerStateAfterPgWrite } from '../state/player-state';
import { fireQuest, trackEarnCoinsQuests, fireQuestBatch } from './quest-tracker';
import { mergeQuestNotices } from './daily-quests';
import { runDetached } from '../utils/async';

interface BattleState {
  playerId: string;
  hp: number;
  stamina: number;
  power: number;
  hpMax: number;
  /** Buff'tan gelen hasar çarpanı (1.0 = etki yok) */
  buffDamageMult: number;
  /** Buff'tan gelen dodge bonus (0 = etki yok) */
  buffDodgeBonus: number;
}

// Turn event'lerini toplamak için genişletilmiş log
interface TurnResult {
  damage: number;
  isCrit: boolean;
  isExecute: boolean;
}

/**
 * PvP oturumu olusturur.
 */
export async function startPvP(
  prisma: PrismaClient,
  challengerId: string,
  defenderId: string,
): Promise<string> {
  const session = await prisma.pvpSession.create({
    data: {
      challengerId,
      defenderId,
      status: 'pending',
    },
    select: { id: true },
  });
  return session.id;
}

type PvpDb = PrismaClient | Prisma.TransactionClient;

/** Süresi dolmuş / terk edilmiş pending davetleri kapatır. */
export async function closeStalePendingPvpSessions(prisma: PvpDb): Promise<number> {
  const cutoff = new Date(Date.now() - PVP_DUEL_INVITE_TTL_MS - 5_000);
  const result = await prisma.pvpSession.updateMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    data: { status: 'finished', finishedAt: new Date() },
  });
  return result.count;
}

/** Davet iptal / timeout / hata sonrası pending oturumu kapatır. */
export async function closePvpSessionIfPending(prisma: PvpDb, sessionId: string): Promise<void> {
  await prisma.pvpSession.updateMany({
    where: { id: sessionId, status: 'pending' },
    data: { status: 'finished', finishedAt: new Date() },
  });
}

/** setmain vb. için: gerçekten devam eden PvP var mı? */
export async function isPlayerBlockedForMainSwitch(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
): Promise<boolean> {
  if (await redis.get(`pvp:active:${userId}`)) return true;

  await closeStalePendingPvpSessions(prisma);

  const session = await prisma.pvpSession.findFirst({
    where: {
      OR: [{ challengerId: userId }, { defenderId: userId }],
      status: { in: ['pending', 'active'] },
    },
    select: { id: true },
  });
  return !!session;
}

/**
 * Aktif PvP oturumunu simule eder.
 */
export async function simulatePvP(
  prisma: PrismaClient,
  sessionId: string,
  redis?: Redis,
  guildId?: string | null,
  options?: { duelBetMode?: boolean },
): Promise<PvpSimResult> {
  const duelBetMode = options?.duelBetMode === true;
  const session = await prisma.pvpSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw new Error('PvP oturumu bulunamadi.');
  }

  const challengerToken = await acquireLock(session.challengerId, 'pvp');
  if (!challengerToken) {
    throw new Error('Challenger su an baska bir PvP isleminde.');
  }

  const defenderToken = await acquireLock(session.defenderId, 'pvp');
  if (!defenderToken) {
    await releaseLock(session.challengerId, 'pvp', challengerToken);
    throw new Error('Defender su an baska bir PvP isleminde.');
  }

  try {
    const [challengerOwl, defenderOwl] = await Promise.all([
      prisma.owl.findFirst({ where: { ownerId: session.challengerId, isMain: true } }),
      prisma.owl.findFirst({ where: { ownerId: session.defenderId, isMain: true } }),
    ]);
    if (!challengerOwl || !defenderOwl) {
      throw new Error('Her iki oyuncunun da main baykusu olmali.');
    }

    const [challengerBuffs, defenderBuffs] = await Promise.all([
      getBuffEffects(prisma, session.challengerId, 'pvp'),
      getBuffEffects(prisma, session.defenderId, 'pvp'),
    ]);

    const chEff = getEffectiveStats(challengerOwl);
    const defEff = getEffectiveStats(defenderOwl);

    const challenger: BattleState = {
      playerId: session.challengerId,
      hp: challengerOwl.hp,
      stamina: challengerOwl.staminaCur,
      power: statEffect(chEff.gaga + chEff.pence + chEff.kanat)
        * Math.max(0.1, challengerOwl.effectiveness / 100)
        * (1 + challengerOwl.bond * 0.002),
      hpMax: challengerOwl.hpMax,
      buffDamageMult: challengerBuffs.pvpDamageMult,
      buffDodgeBonus: challengerBuffs.pvpDodgeBonus,
    };
    const defender: BattleState = {
      playerId: session.defenderId,
      hp: defenderOwl.hp,
      stamina: defenderOwl.staminaCur,
      power: statEffect(defEff.gaga + defEff.pence + defEff.kanat)
        * Math.max(0.1, defenderOwl.effectiveness / 100)
        * (1 + defenderOwl.bond * 0.002),
      hpMax: defenderOwl.hpMax,
      buffDamageMult: defenderBuffs.pvpDamageMult,
      buffDodgeBonus: defenderBuffs.pvpDodgeBonus,
    };

    const { turnEvents, turns, battleLog } = runPvpBattleExchanges(challenger, defender);

    const winner = pickBattleWinner(challenger, defender);
    const loser = winner.playerId === challenger.playerId ? defender : challenger;

    await prisma.$transaction(async (tx) => {
      await tx.pvpSession.update({
        where: { id: sessionId },
        data: {
          status: 'finished',
          winnerId: winner.playerId,
          totalTurns: turns,
          finishedAt: new Date(),
        },
      });

      // Winner + loser güncellemelerini paralel yap
      // Not: pvpStreak pvp-streak.ts tarafından yönetilecek, burada sadece pvpCount
      await Promise.all([
        tx.player.update({
          where: { id: winner.playerId },
          data: {
            ...(redis || duelBetMode ? {} : { coins: { increment: 100 } }),
            pvpCount: { increment: 1 },
          },
        }),
        tx.player.update({
          where: { id: loser.playerId },
          data: { pvpCount: { increment: 1 }, pvpStreakLoss: { increment: 1 } },
        }),
      ]);

    });

  // Streak sistemi — anti-abuse kontrolü dahil
  const streakResult = await updatePvpStreak(prisma, winner.playerId, loser.playerId, {
    skipCoinWrite: !!redis || duelBetMode,
  });

  // XP + Bond + Streak coins — transaction içinde atomik yaz
  const winnerXP = applyStreakXpBonus(XP_PVP_WIN, streakResult.xpBonusPct);
  const totalCoinGain = duelBetMode ? 0 : 100 + streakResult.bonusCoins;

  if (redis && !duelBetMode) {
    await withLock(winner.playerId, 'financial', () =>
      applyCoinDeltaInRedis(redis, winner.playerId, totalCoinGain, prisma),
    );
  }

  const winnerOwlForBond = winner.playerId === session.challengerId ? challengerOwl : defenderOwl;
  const newBond = winnerOwlForBond.bond < BOND_MAX
    ? Math.min(BOND_MAX, winnerOwlForBond.bond + BOND_GAIN_PER_PVP_WIN)
    : winnerOwlForBond.bond;

  await prisma.$transaction(async (tx) => {
    // XP güncelle
    await tx.player.update({
      where: { id: winner.playerId },
      data: { xp: { increment: winnerXP } },
    });
    await tx.player.update({
      where: { id: loser.playerId },
      data: { xp: { increment: XP_PVP_LOSE } },
    });
    // Bond artışı
    if (winnerOwlForBond.bond < BOND_MAX) {
      await tx.owl.update({
        where: { id: winnerOwlForBond.id },
        data: { bond: newBond },
      });
    }
  });

  if (redis) {
    if (winnerOwlForBond.bond < BOND_MAX) {
      await applyOwlStatUpdate(redis, prisma, winner.playerId, winnerOwlForBond.id, { bond: newBond });
    }
    await Promise.all([
      syncPlayerStateAfterPgWrite(redis, prisma, winner.playerId, 'progress'),
      syncPlayerStateAfterPgWrite(redis, prisma, loser.playerId, 'progress'),
    ]);
  }

    // PvP Buff Charge Tüketimi — her iki oyuncu için
    await Promise.all([
      drainBuffCharge(prisma, winner.playerId, 'pvp'),
      drainBuffCharge(prisma, loser.playerId, 'pvp'),
    ]);

    // Liderboard istatistikleri
    if (redis) {
      await recordPvpWin(prisma, winner.playerId, redis, guildId);
    } else {
      await prisma.player.update({
        where: { id: winner.playerId },
        data: { totalPvpWins: { increment: 1 }, totalCoinsEarned: { increment: totalCoinGain } },
      });
    }
    runDetached('pvp-power-score', async () => {
      await Promise.all([
        refreshPowerScore(prisma, winner.playerId),
        refreshPowerScore(prisma, loser.playerId),
      ]);
    });

    const [winnerPlayer, loserPlayer] = await Promise.all([
      prisma.player.findUnique({
        where: { id: winner.playerId },
        select: { level: true, xp: true },
      }),
      prisma.player.findUnique({
        where: { id: loser.playerId },
        select: { level: true, xp: true },
      }),
    ]);

    if (winnerPlayer && !duelBetMode) {
      await rollPvpLootboxDrop(prisma, winner.playerId, winnerPlayer.level, redis);
    }

    const xpByPlayerId: NonNullable<import('../types').PvpSimResult['xpByPlayerId']> = {};
    if (winnerPlayer) {
      xpByPlayerId[winner.playerId] = {
        level: winnerPlayer.level,
        xp: winnerPlayer.xp,
        gainedXp: winnerXP,
      };
    }
    if (loserPlayer) {
      xpByPlayerId[loser.playerId] = {
        level: loserPlayer.level,
        xp: loserPlayer.xp,
        gainedXp: XP_PVP_LOSE,
      };
    }

    runDetached('pvp-quests', async () => {
      await fireQuestBatch(prisma, session.challengerId, [{ type: 'vs_play' }], redis);
      await fireQuestBatch(prisma, session.defenderId, [{ type: 'vs_play' }], redis);
      await mergeQuestNotices(
        await fireQuest(prisma, winner.playerId, 'vs', 1, undefined, redis),
        await trackEarnCoinsQuests(prisma, winner.playerId, totalCoinGain, redis),
      );
      if (streakResult.streakCounted && streakResult.newStreak >= 2) {
        await fireQuest(prisma, winner.playerId, 'pvp_streak', 1, undefined, redis);
      }
      if (duelBetMode) {
        await fireQuest(prisma, session.challengerId, 'duelbet', 1, undefined, redis);
        await fireQuest(prisma, session.defenderId, 'duelbet', 1, undefined, redis);
      }
    });

    return {
      sessionId,
      winnerId: winner.playerId,
      loserId: loser.playerId,
      turns,
      log: battleLog,
      events: turnEvents,
      challengerHpMax: challengerOwl.hpMax,
      defenderHpMax: defenderOwl.hpMax,
      streak: streakResult,
      winnerXP,
      effectivenessWarning: false,
      xpByPlayerId,
    };
  } finally {
    await releaseLock(session.challengerId, 'pvp', challengerToken);
    await releaseLock(session.defenderId, 'pvp', defenderToken);
  }
}

export interface PvpBattlerState {
  playerId: string;
  hp: number;
  stamina: number;
  power: number;
  hpMax: number;
  buffDamageMult: number;
  buffDodgeBonus: number;
}

/** Savaş simülasyonu sonrası kazanan — nakavt kuralı, sonra güç; beraberlikte HP / hpMax. */
export function pickBattleWinner(
  challenger: PvpBattlerState,
  defender: PvpBattlerState,
): PvpBattlerState {
  const chAlive = challenger.hp > 0;
  const defAlive = defender.hp > 0;

  if (chAlive && !defAlive) return challenger;
  if (defAlive && !chAlive) return defender;

  if (challenger.power > defender.power) return challenger;
  if (defender.power > challenger.power) return defender;

  if (challenger.hp > defender.hp) return challenger;
  if (defender.hp > challenger.hp) return defender;

  if (challenger.hpMax > defender.hpMax) return challenger;
  if (defender.hpMax > challenger.hpMax) return defender;
  return challenger;
}

/**
 * PvP dövüş döngüsü — şans yok.
 * Exchange 1: daha güçlü önce vurur; sonraki round'larda sıra alterne.
 */
export function runPvpBattleExchanges(
  challenger: PvpBattlerState,
  defender: PvpBattlerState,
): { turnEvents: PvpTurnEvent[]; turns: number; battleLog: string[] } {
  const battleLog: string[] = [];
  const turnEvents: PvpTurnEvent[] = [];
  let turns = 0;
  let exchange = 0;
  const strongerIsChallenger = challenger.power >= defender.power;
  const challengerFirstInOddExchanges = strongerIsChallenger;

  while (challenger.hp > 0 && defender.hp > 0 && turns < PVP_MAX_TURNS) {
    exchange += 1;
    const challengerFirst = exchange % 2 === 1
      ? challengerFirstInOddExchanges
      : !challengerFirstInOddExchanges;
    const [first, second] = challengerFirst ? [challenger, defender] : [defender, challenger];

    turns += 1;
    const r1 = resolveTurn(first, second, turns, battleLog);
    turnEvents.push({
      turn: turns,
      attackerId: first.playerId,
      defenderId: second.playerId,
      damage: r1.damage,
      attackerHp: first.hp,
      defenderHp: second.hp,
      attackerHpMax: first.hpMax,
      defenderHpMax: second.hpMax,
      isCrit: r1.isCrit,
      isExecute: r1.isExecute,
      isLastHit: second.hp <= 0,
    });
    if (second.hp <= 0) break;

    if (turns >= PVP_MAX_TURNS) break;

    turns += 1;
    const r2 = resolveTurn(second, first, turns, battleLog);
    turnEvents.push({
      turn: turns,
      attackerId: second.playerId,
      defenderId: first.playerId,
      damage: r2.damage,
      attackerHp: second.hp,
      defenderHp: first.hp,
      attackerHpMax: second.hpMax,
      defenderHpMax: first.hpMax,
      isCrit: r2.isCrit,
      isExecute: r2.isExecute,
      isLastHit: first.hp <= 0,
    });
  }

  return { turnEvents, turns, battleLog };
}

/**
 * Tek PvP turunu uygular ve combat log'a yazar.
 * Buff damage/dodge etkileri BattleState üzerinden gelir.
 */
export function resolveTurn(
  attacker: BattleState,
  defender: BattleState,
  turn: number,
  log: string[],
): TurnResult {
  const totalPower = Math.max(1, attacker.power + defender.power);
  const powerShare = (attacker.power / totalPower) * 2;
  let damage =
    attacker.power * (PVP_STAT_WEIGHT + PVP_RNG_WEIGHT) * damageMultiplier(turn) * powerShare;

  damage = damage * PVP_DAMAGE_SCALE * attacker.buffDamageMult;

  let dodgeBonus = 0;

  if (attacker.stamina < PVP_STAM_FULL_MIN && attacker.stamina >= PVP_STAM_DODGE_MIN) {
    dodgeBonus += PVP_STAM_DODGE_PEN;
  } else if (attacker.stamina < PVP_STAM_DODGE_MIN && attacker.stamina >= PVP_STAM_DAMAGE_MIN) {
    damage += damage * PVP_STAM_DAMAGE_PEN;
  } else if (attacker.stamina < PVP_STAM_DAMAGE_MIN) {
    damage += damage * PVP_STAM_FATIGUE_PEN;
  }

  const isExecute =
    defender.hp <= defender.hpMax * PVP_EXECUTE_HP_THRESH &&
    defender.stamina < PVP_EXECUTE_STAM_THRESH;

  if (isExecute) {
    damage = attacker.power * PVP_EXECUTE_POWER_MULT * powerShare * PVP_EXECUTE_DAMAGE_SCALE;
    damage = Math.min(damage, defender.hpMax * PVP_EXECUTE_MAX_HP_FRAC);
  }

  const dodgeMitigation = 1 - Math.min(0.85, defender.buffDodgeBonus);
  const effectiveDamage = Math.max(1, Math.round((damage + dodgeBonus) * dodgeMitigation));
  const finalDamage = effectiveDamage;

  const isCrit = !isExecute && finalDamage > attacker.power * 1.5;

  defender.hp = Math.max(0, defender.hp - finalDamage);
  attacker.stamina = Math.max(0, attacker.stamina - 10);

  log.push(`${attacker.playerId} -> ${defender.playerId}: ${finalDamage} hasar`);

  return { damage: finalDamage, isCrit, isExecute };
}
