import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  DAILY_LOGIN_BASE_COIN,
  DAILY_LOGIN_BASE_XP,
  DAILY_LOGIN_COIN_CAP,
  DAILY_LOGIN_COOLDOWN_MS,
  DAILY_LOGIN_EQUIPMENT_CRATE_NAME,
  DAILY_LOGIN_LOOTBOX_EVERY_DAYS,
  DAILY_LOGIN_STREAK_COIN_GROWTH,
  DAILY_LOGIN_STREAK_WINDOW_MS,
  DAILY_LOGIN_STREAK_GRACE_MS,
  DAILY_LOGIN_STREAK_XP_GROWTH,
  DAILY_LOGIN_WEAPON_CRATE_EVERY_DAYS,
  DAILY_LOGIN_WEAPON_CRATE_NAME,
  DAILY_LOGIN_XP_CAP,
  DAILY_LOGIN_MILESTONES,
} from '../config';
import { addXP } from './xp';
import { withLock } from '../utils/lock';
import { applyCoinDeltaInRedis, syncPlayerStateAfterPgWrite } from '../state/player-state';

export interface DailyLoginReward {
  streak: number;
  coins: number;
  xp: number;
  equipmentCrate: number;
  weaponCrate: number;
  milestoneCoins: number;
  milestoneXp: number;
  streakGraceUsed: boolean;
  levelUp?: Awaited<ReturnType<typeof addXP>>['levelUp'];
  levelAfter: number;
  xpAfter: number;
  nextClaimAt: Date;
}

export function calcDailyLoginCoins(streak: number): number {
  return Math.min(DAILY_LOGIN_BASE_COIN + streak * DAILY_LOGIN_STREAK_COIN_GROWTH, DAILY_LOGIN_COIN_CAP);
}

export function calcDailyLoginXp(streak: number): number {
  return Math.min(DAILY_LOGIN_BASE_XP + streak * DAILY_LOGIN_STREAK_XP_GROWTH, DAILY_LOGIN_XP_CAP);
}

export function calcDailyLoginItems(streak: number): { equipmentCrate: number; weaponCrate: number } {
  if (streak <= 0) return { equipmentCrate: 0, weaponCrate: 0 };
  if (streak % DAILY_LOGIN_WEAPON_CRATE_EVERY_DAYS === 0) {
    return { equipmentCrate: 0, weaponCrate: 1 };
  }
  if (streak % DAILY_LOGIN_LOOTBOX_EVERY_DAYS === 0) {
    return { equipmentCrate: 1, weaponCrate: 0 };
  }
  return { equipmentCrate: 0, weaponCrate: 0 };
}

export function computeNextStreak(
  loginStreak: number,
  lastDailyClaimAt: Date | null,
  now: Date,
): number {
  if (!lastDailyClaimAt) return 1;
  const elapsed = now.getTime() - lastDailyClaimAt.getTime();
  if (elapsed <= DAILY_LOGIN_STREAK_WINDOW_MS + DAILY_LOGIN_STREAK_GRACE_MS) {
    return loginStreak + 1;
  }
  return 1;
}

function isStreakGraceUsed(lastDailyClaimAt: Date | null, now: Date): boolean {
  if (!lastDailyClaimAt) return false;
  const elapsed = now.getTime() - lastDailyClaimAt.getTime();
  return elapsed > DAILY_LOGIN_STREAK_WINDOW_MS && elapsed <= DAILY_LOGIN_STREAK_WINDOW_MS + DAILY_LOGIN_STREAK_GRACE_MS;
}

function calcDailyLoginMilestone(streak: number): { coins: number; xp: number } {
  const hit = DAILY_LOGIN_MILESTONES.find((m) => m.streak === streak);
  if (!hit) return { coins: 0, xp: 0 };
  return { coins: hit.bonusCoins, xp: hit.bonusXp };
}

export function dailyLoginCooldownRemainingMs(lastDailyClaimAt: Date | null, now: Date): number {
  if (!lastDailyClaimAt) return 0;
  const elapsed = now.getTime() - lastDailyClaimAt.getTime();
  return Math.max(0, DAILY_LOGIN_COOLDOWN_MS - elapsed);
}

async function upsertCrateInventory(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  playerId: string,
  itemName: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;
  await tx.inventoryItem.upsert({
    where: { ownerId_itemName: { ownerId: playerId, itemName } },
    create: {
      ownerId: playerId,
      itemName,
      itemType: 'Kutu',
      rarity: 'Common',
      quantity,
    },
    update: { quantity: { increment: quantity } },
  });
}

export async function claimDailyLogin(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
): Promise<DailyLoginReward> {
  return withLock(playerId, 'daily_login', async () => {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { id: playerId },
        select: {
          id: true,
          loginStreak: true,
          lastDailyClaimAt: true,
          coins: true,
        },
      });
      if (!player) throw new Error('Oyuncu bulunamadı.');

      const remaining = dailyLoginCooldownRemainingMs(player.lastDailyClaimAt, now);
      if (remaining > 0) {
        const hours = Math.floor(remaining / 3_600_000);
        const mins = Math.ceil((remaining % 3_600_000) / 60_000);
        const timeLabel = hours > 0 ? `${hours} saat ${mins} dk` : `${mins} dk`;
        throw new Error(`⏱️ Günlük ödülün hazır değil. Sıradaki ödül: **${timeLabel}** sonra.`);
      }

      const newStreak = computeNextStreak(player.loginStreak, player.lastDailyClaimAt, now);
      const coins = calcDailyLoginCoins(newStreak);
      const xp = calcDailyLoginXp(newStreak);
      const items = calcDailyLoginItems(newStreak);
      const milestone = calcDailyLoginMilestone(newStreak);
      const streakGraceUsed = isStreakGraceUsed(player.lastDailyClaimAt, now);
      const totalCoins = coins + milestone.coins;
      const totalXp = xp + milestone.xp;

      await tx.player.update({
        where: { id: playerId },
        data: {
          coins: { increment: totalCoins },
          loginStreak: newStreak,
          lastDailyClaimAt: now,
        },
      });

      await upsertCrateInventory(tx, playerId, DAILY_LOGIN_EQUIPMENT_CRATE_NAME, items.equipmentCrate);
      await upsertCrateInventory(tx, playerId, DAILY_LOGIN_WEAPON_CRATE_NAME, items.weaponCrate);

      const xpResult = await addXP(tx as unknown as PrismaClient, playerId, totalXp, 'dailyLogin');

      const nextClaimAt = new Date(now.getTime() + DAILY_LOGIN_COOLDOWN_MS);

      return {
        streak: newStreak,
        coins: totalCoins,
        xp: totalXp,
        equipmentCrate: items.equipmentCrate,
        weaponCrate: items.weaponCrate,
        milestoneCoins: milestone.coins,
        milestoneXp: milestone.xp,
        streakGraceUsed,
        levelUp: xpResult.levelUp,
        levelAfter: xpResult.currentLevel,
        xpAfter: xpResult.currentXP,
        nextClaimAt,
      };
    });

    await applyCoinDeltaInRedis(redis, playerId, result.coins, prisma);
    await syncPlayerStateAfterPgWrite(redis, prisma, playerId, 'progress');

    return result;
  });
}

export function formatDailyLoginStatus(
  loginStreak: number,
  lastDailyClaimAt: Date | null,
  now = new Date(),
): { canClaim: boolean; remainingMs: number; nextStreak: number; graceRemainingMs: number } {
  const remainingMs = dailyLoginCooldownRemainingMs(lastDailyClaimAt, now);
  const nextStreak = computeNextStreak(loginStreak, lastDailyClaimAt, now);
  const elapsed = lastDailyClaimAt ? now.getTime() - lastDailyClaimAt.getTime() : 0;
  const graceRemainingMs = lastDailyClaimAt
    ? Math.max(0, DAILY_LOGIN_STREAK_WINDOW_MS + DAILY_LOGIN_STREAK_GRACE_MS - elapsed)
    : 0;
  return {
    canClaim: remainingMs === 0,
    remainingMs,
    nextStreak: lastDailyClaimAt ? nextStreak : 1,
    graceRemainingMs,
  };
}
