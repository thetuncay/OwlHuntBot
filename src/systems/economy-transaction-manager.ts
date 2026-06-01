import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { applyCoinDeltaInRedis, refreshPlayerCoinsInRedis } from '../state/player-state';
import { playerLockKey, withOrderedResourceLocks, withResourceLock } from '../utils/lock';

export interface EconomyTransactionContext {
  prisma: PrismaClient;
  redis?: Redis;
}

export interface CoinDelta {
  playerId: string;
  delta: number;
}

export function financialLockKey(playerId: string): string {
  return playerLockKey(playerId, 'financial');
}

export function listingLockKey(listingId: string): string {
  return `listing:${listingId}:lock`;
}

export async function runWithFinancialLocks<T>(
  playerIds: string[],
  fn: () => Promise<T>,
): Promise<T> {
  return withOrderedResourceLocks(playerIds.map(financialLockKey), fn);
}

export async function runWithListingLock<T>(listingId: string, fn: () => Promise<T>): Promise<T> {
  return withResourceLock(listingLockKey(listingId), fn);
}

export async function syncCoinDeltasInRedis(
  ctx: EconomyTransactionContext,
  deltas: CoinDelta[],
): Promise<void> {
  if (!ctx.redis) return;
  await Promise.all(
    deltas.map((delta) =>
      applyCoinDeltaInRedis(ctx.redis!, delta.playerId, delta.delta, ctx.prisma),
    ),
  );
}

export async function refreshCoinSnapshotsInRedis(
  ctx: EconomyTransactionContext,
  playerIds: string[],
): Promise<void> {
  if (!ctx.redis) return;
  const results = await Promise.allSettled(
    [...new Set(playerIds)].map((playerId) =>
      refreshPlayerCoinsInRedis(ctx.redis!, ctx.prisma, playerId),
    ),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[EconomyTransactionManager] Redis coin snapshot sync failed:', result.reason);
    }
  }
}
