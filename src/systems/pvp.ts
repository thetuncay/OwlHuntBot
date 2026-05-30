import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  PVP_EXECUTE_POWER_MULT,
  PVP_EXECUTE_HP_THRESH,
  PVP_EXECUTE_STAM_THRESH,
  PVP_MAX_TURNS,
  PVP_REPAIR_AFTER,
  PVP_REPAIR_LOSS,
  PVP_RNG_WEIGHT,
  PVP_STAM_DAMAGE_MIN,
  PVP_STAM_DAMAGE_PEN,
  PVP_STAM_DODGE_MIN,
  PVP_STAM_DODGE_PEN,
  PVP_STAM_FATIGUE_PEN,
  PVP_STAM_FULL_MIN,
  PVP_STAT_WEIGHT,
  XP_PVP_LOSE,
  XP_PVP_WIN,
  BOND_GAIN_PER_PVP_WIN,
  BOND_MAX,
} from '../config';
import type { PvpSimResult } from '../types';
import type { PvpBattleData, PvpTurnEvent } from '../utils/pvp-ux';
import { damageMultiplier, statEffect } from '../utils/math';
import { acquireLock, releaseLock } from '../utils/lock';
import { addXP } from './xp';
import { recordPvpWin, refreshPowerScore, recordCoinsEarned } from './leaderboard';
import { updatePvpStreak, applyStreakXpBonus } from './pvp-streak';
import { getBuffEffects, drainBuffCharge } from './items';
import { rollPvpLootboxDrop } from './drops';
import { applyCoinDeltaInRedis, applyOwlStatUpdate, syncPlayerStateAfterPgWrite, reloadInventoryFromPg } from '../state/player-state';
import { getConsumableEffectValue, consumeConsumableEffect } from '../utils/use-items';

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

/**
 * Aktif PvP oturumunu simule eder.
 */
export async function simulatePvP(
  prisma: PrismaClient,
  sessionId: string,
  redis?: Redis,
): Promise<PvpSimResult> {
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

    const battleLog: string[] = [];
    const turnEvents: PvpTurnEvent[] = [];

    // Buff etkilerini ve oyuncu prestige seviyelerini al (her oyuncu için ayrı)
    const [challengerBuffs, defenderBuffs, challenger, defender, consEffects] = await Promise.all([
      getBuffEffects(prisma, session.challengerId, 'pvp'),
      getBuffEffects(prisma, session.defenderId, 'pvp'),
      prisma.player.findUnique({ where: { id: session.challengerId }, select: { prestigeLevel: true } }),
      prisma.player.findUnique({ where: { id: session.defenderId }, select: { prestigeLevel: true } }),
      redis ? Promise.all([
        getConsumableEffectValue(redis, session.challengerId, 'pvp_damage_once'),
        getConsumableEffectValue(redis, session.challengerId, 'pvp_dodge_equip'),
        getConsumableEffectValue(redis, session.defenderId, 'pvp_damage_once'),
        getConsumableEffectValue(redis, session.defenderId, 'pvp_dodge_equip'),
      ]) : Promise.resolve([0, 0, 0, 0] as const),
    ]);

    const [challengerDmgOnce, challengerDodgeEquip, defenderDmgOnce, defenderDodgeEquip] = consEffects;

    const left: BattleState = {
      playerId: session.challengerId,
      hp: challengerOwl.hp,
      stamina: challengerOwl.staminaCur,
      power: statEffect(challengerOwl.statGaga + challengerOwl.statPence + challengerOwl.statKanat, challenger?.prestigeLevel ?? 0)
        * Math.max(0.1, challengerOwl.effectiveness / 100)
        * (1 + challengerOwl.bond * 0.002),
      hpMax: challengerOwl.hpMax,
      buffDamageMult: challengerBuffs.pvpDamageMult * (1 + challengerDmgOnce),
      buffDodgeBonus: challengerBuffs.pvpDodgeBonus + challengerDodgeEquip,
    };
    const right: BattleState = {
      playerId: session.defenderId,
      hp: defenderOwl.hp,
      stamina: defenderOwl.staminaCur,
      power: statEffect(defenderOwl.statGaga + defenderOwl.statPence + defenderOwl.statKanat, defender?.prestigeLevel ?? 0)
        * Math.max(0.1, defenderOwl.effectiveness / 100)
        * (1 + defenderOwl.bond * 0.002),
      hpMax: defenderOwl.hpMax,
      buffDamageMult: defenderBuffs.pvpDamageMult * (1 + defenderDmgOnce),
      buffDodgeBonus: defenderBuffs.pvpDodgeBonus + defenderDodgeEquip,
    };

    let turns = 0;
    while (left.hp > 0 && right.hp > 0 && turns < PVP_MAX_TURNS) {
      turns += 1;
      const r1 = resolveTurn(left, right, turns, battleLog, challengerOwl.hpMax);
      turnEvents.push({
        turn: turns,
        attackerId: left.playerId,
        defenderId: right.playerId,
        damage: r1.damage,
        attackerHp: left.hp,
        defenderHp: right.hp,
        attackerHpMax: left.hpMax,
        defenderHpMax: right.hpMax,
        isCrit: r1.isCrit,
        isExecute: r1.isExecute,
        isLastHit: right.hp <= 0,
      });
      if (right.hp <= 0) break;
      turns += 1;
      const r2 = resolveTurn(right, left, turns, battleLog, defenderOwl.hpMax);
      turnEvents.push({
        turn: turns,
        attackerId: right.playerId,
        defenderId: left.playerId,
        damage: r2.damage,
        attackerHp: right.hp,
        defenderHp: left.hp,
        attackerHpMax: right.hpMax,
        defenderHpMax: left.hpMax,
        isCrit: r2.isCrit,
        isExecute: r2.isExecute,
        isLastHit: left.hp <= 0,
      });
    }

    const winner = left.hp > right.hp ? left : left.hp < right.hp ? right : (Math.random() < 0.5 ? left : right);
    const loser = winner.playerId === left.playerId ? right : left;

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
            ...(redis ? {} : { coins: { increment: 100 } }),
            pvpCount: { increment: 1 },
          },
        }),
        tx.player.update({
          where: { id: loser.playerId },
          data: { pvpCount: { increment: 1 }, pvpStreakLoss: { increment: 1 } },
        }),
      ]);

      // Effectiveness kontrolü paralel
      await Promise.all(
        [winner.playerId, loser.playerId].map(async (playerId) => {
          const player = await tx.player.findUnique({ where: { id: playerId }, select: { pvpCount: true } });
          if (player && player.pvpCount % PVP_REPAIR_AFTER === 0) {
            const owl = await tx.owl.findFirst({ where: { ownerId: playerId, isMain: true }, select: { id: true } });
            if (owl) {
              await tx.owl.update({
                where: { id: owl.id },
                data: { effectiveness: { decrement: PVP_REPAIR_LOSS } },
              });
            }
          }
        }),
      );
    });

  // Streak sistemi — anti-abuse kontrolü dahil
  const streakResult = await updatePvpStreak(prisma, winner.playerId, loser.playerId, {
    skipCoinWrite: !!redis,
  });

  // XP + Bond + Streak coins — transaction içinde atomik yaz
  const winnerXP = applyStreakXpBonus(XP_PVP_WIN, streakResult.xpBonusPct);
  const totalCoinGain = 100 + streakResult.bonusCoins;

  if (redis) {
    await applyCoinDeltaInRedis(redis, winner.playerId, totalCoinGain, prisma);
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

    // Effectiveness uyarısı: %50 altına düştüyse result'a ekle
    const winnerOwlUpdated = await prisma.owl.findFirst({
      where: { ownerId: winner.playerId, isMain: true },
      select: { effectiveness: true },
    });
    const effectivenessWarning = winnerOwlUpdated && winnerOwlUpdated.effectiveness <= 50;

    // PvP Buff Charge Tüketimi — her iki oyuncu için
    await Promise.all([
      drainBuffCharge(prisma, winner.playerId, 'pvp'),
      drainBuffCharge(prisma, loser.playerId, 'pvp'),
    ]);

    // Tek kullanımlık Savaş İksiri tüketimi
    if (redis) {
      await Promise.all([
        consumeConsumableEffect(redis, session.challengerId, 'pvp_damage_once'),
        consumeConsumableEffect(redis, session.defenderId, 'pvp_damage_once'),
      ]);
    }

    // Liderboard istatistikleri
    await recordPvpWin(prisma, winner.playerId);
    // PvP kazancini ekonomi sayacina ekle (100 coin + streak bonus coin)
    recordCoinsEarned(prisma, winner.playerId, totalCoinGain).catch(() => null);
    // Power score'lari async guncelle
    refreshPowerScore(prisma, winner.playerId).catch(() => null);
    refreshPowerScore(prisma, loser.playerId).catch(() => null);

    // PvP Lootbox Drop — kazanan için şans
    const winnerPlayer = await prisma.player.findUnique({
      where: { id: winner.playerId },
      select: { level: true },
    });
    if (winnerPlayer) {
      const drop = await rollPvpLootboxDrop(prisma, winner.playerId, winnerPlayer.level);
      if (redis && drop) {
        await reloadInventoryFromPg(redis, prisma, winner.playerId);
      }
    }

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
      effectivenessWarning: effectivenessWarning ?? false,
    };
  } finally {
    await releaseLock(session.challengerId, 'pvp', challengerToken);
    await releaseLock(session.defenderId, 'pvp', defenderToken);
  }
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
  defenderHpMax: number,
): TurnResult {
  const rng = Math.random() * attacker.power;
  let damage =
    (attacker.power * PVP_STAT_WEIGHT + rng * PVP_RNG_WEIGHT) * damageMultiplier(turn);

  // Buff hasar çarpanı uygula (cap config'de tanımlı, getBuffEffects'te uygulandı)
  damage = damage * attacker.buffDamageMult;

  let dodgeBonus = 0;  // Attacker dodge penalty (stamina-based)

  if (attacker.stamina < PVP_STAM_FULL_MIN && attacker.stamina >= PVP_STAM_DODGE_MIN) {
    dodgeBonus += PVP_STAM_DODGE_PEN;
  } else if (attacker.stamina < PVP_STAM_DODGE_MIN && attacker.stamina >= PVP_STAM_DAMAGE_MIN) {
    damage += damage * PVP_STAM_DAMAGE_PEN;
  } else if (attacker.stamina < PVP_STAM_DAMAGE_MIN) {
    damage += damage * PVP_STAM_FATIGUE_PEN;
  }

  const isExecute =
    defender.hp <= defenderHpMax * PVP_EXECUTE_HP_THRESH &&
    defender.stamina < PVP_EXECUTE_STAM_THRESH;

  // FIX: Execute artık sabit 999 değil — saldırganın gücüne göre ölçeklenir
  // Eski: damage = 999 (stat farkı önemsiz, her zaman anlık ölüm)
  // Yeni: damage = attacker.power * 8 (güçlü baykuş daha sert execute yapar)
  // Bu sayede stat yatırımı ve buff'lar execute'da da anlam taşır
  if (isExecute) damage = attacker.power * PVP_EXECUTE_POWER_MULT;

  const effectiveDamage = Math.max(1, Math.round(damage + dodgeBonus));

  // Defender dodge check: dodge bonus gives a chance to reduce damage
  const dodgeRoll = Math.random();
  const finalDamage = dodgeRoll < defender.buffDodgeBonus
    ? Math.max(1, Math.round(effectiveDamage * 0.3))  // Dodged: only 30% damage
    : effectiveDamage;

  const isCrit = !isExecute && finalDamage > attacker.power * 1.5;

  defender.hp = Math.max(0, defender.hp - finalDamage);
  attacker.stamina = Math.max(0, attacker.stamina - 10);

  log.push(`${attacker.playerId} -> ${defender.playerId}: ${finalDamage} hasar`);

  return { damage: finalDamage, isCrit, isExecute };
}
