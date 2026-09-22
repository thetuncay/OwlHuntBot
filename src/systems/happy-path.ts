/**
 * happy-path.ts — İlk 30 dakika (H1).
 *
 * Ana milestone eğrisine dokunmaz. 5. avda bir kez küçük XP + unvan.
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  HAPPY_PATH_BONUS_XP,
  HAPPY_PATH_FIRST_MILESTONE_HUNTS,
  HAPPY_PATH_REDIS_PREFIX,
  HAPPY_PATH_WINDOW_MS,
} from '../config/engagement';
import { addXP } from './xp';
import { grantCosmeticTitle } from './cosmetics';

const START_PREFIX = `${HAPPY_PATH_REDIS_PREFIX}start:`;
const CLAIM_PREFIX = `${HAPPY_PATH_REDIS_PREFIX}claim:`;

/**
 * Kayıt anında pencereyi başlatır.
 *
 * @param redis Redis
 * @param userId Oyuncu
 */
export async function markHappyPathStart(redis: Redis, userId: string): Promise<void> {
  await redis.set(START_PREFIX + userId, String(Date.now()), 'EX', 7 * 24 * 60 * 60, 'NX');
}

/**
 * 5. avda bir kez küçük ödül — yalnızca 30 dk penceresinde.
 *
 * @param redis Redis
 * @param prisma Prisma
 * @param userId Oyuncu
 * @param huntCount Onboard av sayacı (bu av dahil)
 */
export async function maybeClaimHappyPath(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
  huntCount: number,
): Promise<string | null> {
  if (huntCount !== HAPPY_PATH_FIRST_MILESTONE_HUNTS) return null;
  const startedRaw = await redis.get(START_PREFIX + userId);
  const startedAt = startedRaw ? Number(startedRaw) : 0;
  if (!startedAt || Date.now() - startedAt > HAPPY_PATH_WINDOW_MS) return null;
  const ok = await redis.set(CLAIM_PREFIX + userId, '1', 'EX', 30 * 24 * 60 * 60, 'NX');
  if (ok !== 'OK') return null;
  await addXP(prisma, userId, HAPPY_PATH_BONUS_XP, 'happyPath', undefined, undefined, redis);
  await grantCosmeticTitle(redis, userId, 'iz');
  return `🌱 İlk adımlar · +${HAPPY_PATH_BONUS_XP} XP`;
}
