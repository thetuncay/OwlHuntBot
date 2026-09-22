/**
 * engagement-metrics.ts — Anonim agregat sayaçlar (L1 · P1–P4).
 *
 * Kişisel profil yok. Redis INCR + gün anahtarı.
 */

import type { Redis } from 'ioredis';
import {
  ENGAGEMENT_COUNTER_TTL_SEC,
  ENGAGEMENT_REDIS_PREFIX,
  HUNT_P95_BUDGET_MS,
  SESSION_GAP_MS,
} from '../config/engagement';

export type EngagementKind =
  | 'session_start'
  | 'session_touch'
  | 'return_d1'
  | 'frustration_cooldown'
  | 'frustration_error'
  | 'quest_complete'
  | 'quest_claim'
  | 'milestone_claim'
  | 'hunt_over_budget';

function dayStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function counterKey(kind: EngagementKind, day = dayStamp()): string {
  return `${ENGAGEMENT_REDIS_PREFIX}${kind}:${day}`;
}

async function incr(redis: Redis, kind: EngagementKind): Promise<void> {
  const k = counterKey(kind);
  await redis.incr(k);
  await redis.expire(k, ENGAGEMENT_COUNTER_TTL_SEC);
}

const SESSION_PREFIX = `${ENGAGEMENT_REDIS_PREFIX}sess:`;

/**
 * Oturum dokunuşu — boşluktan sonra yeni oturum sayar (P1).
 *
 * @param redis Redis
 * @param userId Oyuncu (hash'lenmez; key kısa ömürlü, değer yok)
 */
export async function touchEngagementSession(redis: Redis, userId: string): Promise<void> {
  const k = `${SESSION_PREFIX}${userId}`;
  const prev = await redis.get(k);
  const now = Date.now();
  await redis.set(k, String(now), 'EX', 60 * 60);
  await incr(redis, 'session_touch');
  if (!prev || now - Number(prev) > SESSION_GAP_MS) {
    await incr(redis, 'session_start');
  }
}

/**
 * Hunt süresi bütçeyi aştıysa say (L1).
 *
 * @param redis Redis
 * @param durationMs Hunt komut süresi
 */
export async function recordHuntBudgetSample(redis: Redis, durationMs: number): Promise<void> {
  if (durationMs > HUNT_P95_BUDGET_MS) {
    await incr(redis, 'hunt_over_budget');
  }
}

export async function recordFrustrationCooldown(redis: Redis): Promise<void> {
  await incr(redis, 'frustration_cooldown');
}

export async function recordFrustrationError(redis: Redis): Promise<void> {
  await incr(redis, 'frustration_error');
}

export async function recordQuestComplete(redis: Redis): Promise<void> {
  await incr(redis, 'quest_complete');
}

export async function recordQuestClaim(redis: Redis): Promise<void> {
  await incr(redis, 'quest_claim');
}

export async function recordMilestoneClaim(redis: Redis): Promise<void> {
  await incr(redis, 'milestone_claim');
}

export async function recordReturnD1(redis: Redis): Promise<void> {
  await incr(redis, 'return_d1');
}

export interface EngagementSnapshot {
  day: string;
  counts: Partial<Record<EngagementKind, number>>;
}

/**
 * Bugünün agregat sayaçları (ops / test).
 *
 * @param redis Redis
 */
export async function readEngagementSnapshot(redis: Redis): Promise<EngagementSnapshot> {
  const kinds: EngagementKind[] = [
    'session_start',
    'session_touch',
    'return_d1',
    'frustration_cooldown',
    'frustration_error',
    'quest_complete',
    'quest_claim',
    'milestone_claim',
    'hunt_over_budget',
  ];
  const day = dayStamp();
  const values = await redis.mget(...kinds.map((k) => counterKey(k, day)));
  const counts: Partial<Record<EngagementKind, number>> = {};
  kinds.forEach((kind, i) => {
    counts[kind] = Number(values[i] ?? 0);
  });
  return { day, counts };
}
