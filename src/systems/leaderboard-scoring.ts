/**
 * leaderboard-scoring.ts — Adil puanlama, günlük kap, diminishing returns
 */
import type Redis from 'ioredis';
import {
  LB_DAILY_CAP_HUNT,
  LB_DAILY_CAP_WEALTH,
  LB_DIMINISHING_HUNT_THRESHOLD,
  LB_DIMINISHING_HUNT_FLOOR,
  POWER_WEIGHT_LEVEL,
  POWER_WEIGHT_RARE,
  POWER_WEIGHT_XP,
} from '../config';
import { dailyCapKey } from './leaderboard-keys';
import type { LeaderboardCategory } from './leaderboard-types';

export function calcPowerScore(level: number, totalXP: number, totalRareFinds: number): number {
  return Math.round(
    level * POWER_WEIGHT_LEVEL +
    totalXP * POWER_WEIGHT_XP +
    totalRareFinds * POWER_WEIGHT_RARE,
  );
}

export function calcNetWealthScore(totalCoinsEarned: number, totalCoinsLost: number): number {
  return Math.max(0, totalCoinsEarned - totalCoinsLost);
}

/** Servet LB: güncel cüzdan bakiyesi (`w cash` ile aynı). */
export function wealthLeaderboardScore(
  _totalCoinsEarned: number,
  _totalCoinsLost: number,
  coins: number,
): number {
  return Math.max(0, coins);
}

/** Hunt skoruna diminishing returns — yüksek günlük av sayısında verim düşer */
export function applyHuntDiminishing(rawHuntCount: number, dailyHuntsSoFar: number): number {
  if (rawHuntCount <= 0) return 0;
  let effective = 0;
  for (let i = 0; i < rawHuntCount; i++) {
    const dayIndex = dailyHuntsSoFar + i + 1;
    if (dayIndex <= LB_DIMINISHING_HUNT_THRESHOLD) {
      effective += 1;
    } else {
      const over = dayIndex - LB_DIMINISHING_HUNT_THRESHOLD;
      const mult = Math.max(LB_DIMINISHING_HUNT_FLOOR, 1 / (1 + over * 0.15));
      effective += mult;
    }
  }
  return Math.max(0, Math.round(effective));
}

async function readDailyCapUsed(
  redis: Redis,
  category: LeaderboardCategory,
  playerId: string,
): Promise<number> {
  const raw = await redis.get(dailyCapKey(category, playerId));
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

async function addDailyCapUsed(
  redis: Redis,
  category: LeaderboardCategory,
  playerId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  const key = dailyCapKey(category, playerId);
  const newVal = await redis.incrby(key, amount);
  if (newVal === amount) {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const ttlSec = Math.max(60, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
    await redis.expire(key, ttlSec);
  }
}

/**
 * Günlük kap uygular; kalan miktarı döndürür (0 = kap dolu).
 */
export async function applyDailyScoreCap(
  redis: Redis,
  category: LeaderboardCategory,
  playerId: string,
  requestedAmount: number,
): Promise<number> {
  const cap = category === 'hunt' ? LB_DAILY_CAP_HUNT
    : category === 'wealth' ? LB_DAILY_CAP_WEALTH
    : 0;
  if (cap <= 0 || requestedAmount <= 0) return requestedAmount;

  const used = await readDailyCapUsed(redis, category, playerId);
  const remaining = Math.max(0, cap - used);
  const granted = Math.min(requestedAmount, remaining);
  if (granted > 0) {
    await addDailyCapUsed(redis, category, playerId, granted);
  }
  return granted;
}

export async function cappedHuntScoreIncrement(
  redis: Redis,
  playerId: string,
  huntCount: number,
): Promise<number> {
  const dailyUsed = await readDailyCapUsed(redis, 'hunt', playerId);
  const diminished = applyHuntDiminishing(huntCount, dailyUsed);
  return applyDailyScoreCap(redis, 'hunt', playerId, diminished);
}

export async function cappedWealthScoreIncrement(
  redis: Redis,
  playerId: string,
  coinDelta: number,
): Promise<number> {
  if (coinDelta <= 0) return coinDelta;
  return applyDailyScoreCap(redis, 'wealth', playerId, coinDelta);
}
