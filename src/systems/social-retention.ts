import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { addXP } from './xp';
import { applyCoinDeltaInRedis } from '../state/player-state';

export interface SocialHuntBonusResult {
  bonusXp: number;
  bonusCoins: number;
  lines: string[];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function weekId(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

export async function applySocialHuntBonuses(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  guildId: string | null,
  channelId: string | null,
  socialMult: number,
): Promise<SocialHuntBonusResult> {
  if (!guildId || !channelId) return { bonusXp: 0, bonusCoins: 0, lines: [] };
  const lines: string[] = [];
  let bonusXp = 0;
  let bonusCoins = 0;

  const lastHunterKey = `social:lastHunter:${guildId}:${channelId}`;
  const prev = await redis.get(lastHunterKey);
  await redis.set(lastHunterKey, userId, 'EX', 10 * 60);
  if (prev && prev !== userId) {
    const pKey = pairKey(prev, userId);
    const dailyKey = `social:pair:${pKey}:${new Date().toISOString().slice(0, 10)}`;
    const marked = await redis.set(dailyKey, '1', 'EX', 36 * 60 * 60, 'NX');
    if (marked === 'OK') {
      const streakKey = `social:friendStreak:${pKey}`;
      const streak = await redis.incr(streakKey);
      await redis.expire(streakKey, 35 * 24 * 60 * 60);
      if (streak % 3 === 0) {
        bonusCoins += Math.round(90 * socialMult);
        lines.push(`👥 Friend streak x${streak} (ortak seri ödülü).`);
      }
    }
  }

  const guildWeeklyKey = `social:guildGoal:${guildId}:${weekId()}`;
  const guildCount = await redis.incr(guildWeeklyKey);
  await redis.expire(guildWeeklyKey, 10 * 24 * 60 * 60);
  if (guildCount === 80 || guildCount === 220 || guildCount === 450) {
    bonusCoins += Math.round(120 * socialMult);
    lines.push(`🏛️ Guild hedef eşiği geçildi (${guildCount}/hafta).`);
  }

  if (bonusCoins > 0) {
    await applyCoinDeltaInRedis(redis, userId, bonusCoins, prisma);
  }
  if (bonusXp > 0) {
    await addXP(prisma, userId, bonusXp, 'socialRetention', undefined, undefined, redis);
  }

  return { bonusXp, bonusCoins, lines };
}
