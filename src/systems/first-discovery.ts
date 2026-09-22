/**
 * first-discovery.ts — İlk kez yakalanan av kaydı (sessiz).
 *
 * Redis set `preydex:seen:{userId}` — hot path'te Prisma yok.
 * Set boşsa bir kez PG'den doldurulur. Lore satırı üretilmez.
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { PREY } from '../config';

const SEEN_PREFIX = 'preydex:seen:';
const SEEN_TTL_SEC = 30 * 24 * 60 * 60;

function seenKey(userId: string): string {
  return `${SEEN_PREFIX}${userId}`;
}

async function hydrateSeenSet(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const exists = await redis.exists(seenKey(userId));
  if (exists) return;
  const rows = await prisma.playerPreyDex.findMany({
    where: { playerId: userId, totalCaught: { gt: 0 } },
    select: { preyName: true },
  });
  if (rows.length === 0) {
    await redis.sadd(seenKey(userId), '__init__');
    await redis.expire(seenKey(userId), SEEN_TTL_SEC);
    return;
  }
  await redis.sadd(seenKey(userId), ...rows.map((r) => r.preyName), '__init__');
  await redis.expire(seenKey(userId), SEEN_TTL_SEC);
}

/**
 * Bu avda ilk kez kayda geçen türleri Redis'e işler (oyuncuya lore satırı yok).
 *
 * @param redis Redis
 * @param prisma Prisma (yalnızca soğuk hydrate)
 * @param userId Oyuncu
 * @param preyNames Yakalanan av adları
 * @returns Yeni keşif sayısı
 */
export async function markFirstDiscoveries(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
  preyNames: string[],
): Promise<number> {
  if (preyNames.length === 0) return 0;
  await hydrateSeenSet(redis, prisma, userId);
  const unique = [...new Set(preyNames.map((n) => n.toLowerCase()))];
  let newlySeen = 0;
  for (const name of unique) {
    const added = await redis.sadd(seenKey(userId), name);
    if (added === 1) newlySeen += 1;
  }
  await redis.expire(seenKey(userId), SEEN_TTL_SEC);
  return newlySeen;
}

/**
 * @deprecated Lore satırı kaldırıldı — `markFirstDiscoveries` kullan.
 */
export async function takeFirstDiscoveryLines(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
  preyNames: string[],
): Promise<string[]> {
  await markFirstDiscoveries(redis, prisma, userId, preyNames);
  return [];
}

/**
 * Defter tamamen doldu mu?
 *
 * @param redis Redis
 * @param userId Oyuncu
 */
export async function isPreyDexComplete(redis: Redis, userId: string): Promise<boolean> {
  const members = await redis.smembers(seenKey(userId));
  const known = new Set(members.filter((m) => m !== '__init__'));
  return PREY.every((p) => known.has(p.name));
}
