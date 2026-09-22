/**
 * leaderboard-cache.ts — Snapshot cache + singleflight stampede koruması
 */
import type Redis from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import { LEADERBOARD_CACHE_TTL, LEADERBOARD_REFRESH_LOCK_TTL } from '../config';
import { refreshLockKey, snapshotKey, zsetKey } from './leaderboard-keys';
import type { LeaderboardCategory, LeaderboardEntry } from './leaderboard-types';
import { entriesFromZsetWithNames } from './leaderboard-queries';

export async function getCachedSnapshot(
  redis: Redis,
  key: string,
): Promise<LeaderboardEntry[] | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LeaderboardEntry[];
  } catch {
    return null;
  }
}

export async function setCachedSnapshot(
  redis: Redis,
  key: string,
  entries: LeaderboardEntry[],
): Promise<void> {
  await redis.set(key, JSON.stringify(entries), 'EX', LEADERBOARD_CACHE_TTL);
}

export async function withSnapshotSingleflight<T>(
  redis: Redis,
  lockKey: string,
  snapKey: string,
  loader: () => Promise<T>,
): Promise<T> {
  const acquired = await redis.set(lockKey, '1', 'EX', LEADERBOARD_REFRESH_LOCK_TTL, 'NX');
  if (acquired === 'OK') {
    try {
      return await loader();
    } finally {
      await redis.del(lockKey).catch(() => null);
    }
  }
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const cached = await getCachedSnapshot(redis, snapKey);
    if (cached) return cached as T;
  }
  return loader();
}

export async function loadTopFromZset(
  redis: Redis,
  prisma: PrismaClient,
  category: LeaderboardCategory,
  zKey: string,
  take: number,
): Promise<LeaderboardEntry[]> {
  const raw = await redis.zrevrange(zKey, 0, take - 1, 'WITHSCORES');
  if (raw.length === 0) return [];
  const pairs: { playerId: string; score: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    pairs.push({ playerId: raw[i]!, score: Number(raw[i + 1]) });
  }
  return entriesFromZsetWithNames(prisma, category, pairs);
}

export async function getOrBuildSnapshot(
  redis: Redis,
  prisma: PrismaClient,
  scopeId: string,
  category: LeaderboardCategory,
  period: string,
  topN: number,
  rebuildIfEmpty?: () => Promise<void>,
): Promise<LeaderboardEntry[]> {
  const snapKey = snapshotKey(scopeId, category, period, topN);
  const cached = await getCachedSnapshot(redis, snapKey);
  if (cached) return cached;

  const lockKey = refreshLockKey(snapKey);
  return withSnapshotSingleflight(redis, lockKey, snapKey, async () => {
    const again = await getCachedSnapshot(redis, snapKey);
    if (again) return again;

    const zKey = zsetKey(scopeId, category, period);
    let entries = await loadTopFromZset(redis, prisma, category, zKey, topN);
    if (entries.length === 0 && rebuildIfEmpty) {
      await rebuildIfEmpty();
      entries = await loadTopFromZset(redis, prisma, category, zKey, topN);
    }
    if (entries.length > 0) {
      await setCachedSnapshot(redis, snapKey, entries);
    }
    return entries;
  });
}

export async function invalidateAllSnapshotsForCategory(
  redis: Redis,
  scopeId: string,
  category: LeaderboardCategory,
  periods: string[],
  topNs: number[],
): Promise<void> {
  const keys: string[] = [];
  for (const period of periods) {
    for (const n of topNs) {
      keys.push(snapshotKey(scopeId, category, period, n));
    }
  }
  if (keys.length > 0) {
    const chunk = 100;
    for (let i = 0; i < keys.length; i += chunk) {
      await redis.del(...keys.slice(i, i + chunk));
    }
  }
}
