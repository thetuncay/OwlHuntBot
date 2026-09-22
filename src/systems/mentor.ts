/**
 * mentor.ts — Asenkron mentor / çırak bağı (G5).
 *
 * Ödül yok: eşleşme yeter. Farming yüzeyi açmamak için coin bağlanmaz.
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { MENTOR_REDIS_PREFIX } from '../config/engagement';
import { isNewbieActive } from './newbie-boost';

const AVAILABLE = `${MENTOR_REDIS_PREFIX}available`;
const PAIR_PREFIX = `${MENTOR_REDIS_PREFIX}pair:`;

export interface MentorPair {
  mentorId: string;
  menteeId: string;
}

function pairKey(menteeId: string): string {
  return `${PAIR_PREFIX}${menteeId}`;
}

/**
 * Mentora açık listeye ekler.
 *
 * @param redis Redis
 * @param mentorId Mentor
 */
export async function offerMentorship(redis: Redis, mentorId: string): Promise<void> {
  await redis.sadd(AVAILABLE, mentorId);
}

/**
 * Çırağı bekleyen bir mentora bağlar. Yalnızca 7 günlük newbie penceresinde.
 *
 * @param redis Redis
 * @param prisma Prisma
 * @param menteeId Çırak
 */
export async function claimMentor(
  redis: Redis,
  prisma: PrismaClient,
  menteeId: string,
): Promise<MentorPair | null> {
  const existing = await redis.get(pairKey(menteeId));
  if (existing) return { mentorId: existing, menteeId };

  const row = await prisma.player.findUnique({
    where: { id: menteeId },
    select: { createdAt: true },
  });
  if (!row || !isNewbieActive(row.createdAt)) return null;

  const mentorId = await redis.spop(AVAILABLE);
  if (!mentorId || mentorId === menteeId) {
    if (mentorId === menteeId) await redis.sadd(AVAILABLE, mentorId);
    return null;
  }
  await redis.set(pairKey(menteeId), mentorId);
  return { mentorId, menteeId };
}

/**
 * Çırağın mentoru.
 *
 * @param redis Redis
 * @param menteeId Çırak
 */
export async function getMentorFor(redis: Redis, menteeId: string): Promise<string | null> {
  return redis.get(pairKey(menteeId));
}
