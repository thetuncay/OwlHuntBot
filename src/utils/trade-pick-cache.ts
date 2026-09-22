/**
 * trade-pick-cache.ts — Ephemeral grid için item/owl index cache
 */

import type { Redis } from 'ioredis';
import { TRADE_PICK_CACHE_PREFIX, TRADE_PICK_CACHE_TTL_SEC } from '../config/trade';

export type TradePickCat = 'all' | 'mat' | 'buff' | 'av' | 'other' | 'owl';

export interface TradePickCache {
  /** itemName veya `owl:{owlId}` */
  keys: string[];
  cat: TradePickCat;
  page: number;
}

function key(sessionId: string, userId: string): string {
  return `${TRADE_PICK_CACHE_PREFIX}${sessionId}:${userId}`;
}

export function isOwlPickKey(pickKey: string): boolean {
  return pickKey.startsWith('owl:');
}

export function owlIdFromPickKey(pickKey: string): string | null {
  if (!isOwlPickKey(pickKey)) return null;
  return pickKey.slice('owl:'.length) || null;
}

export function owlPickKey(owlId: string): string {
  return `owl:${owlId}`;
}

export async function saveTradePickCache(
  redis: Redis,
  sessionId: string,
  userId: string,
  cache: TradePickCache,
): Promise<void> {
  await redis.set(key(sessionId, userId), JSON.stringify(cache), 'EX', TRADE_PICK_CACHE_TTL_SEC);
}

export async function loadTradePickCache(
  redis: Redis,
  sessionId: string,
  userId: string,
): Promise<TradePickCache | null> {
  const raw = await redis.get(key(sessionId, userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TradePickCache & { names?: string[] };
    const keys = parsed.keys ?? parsed.names;
    if (!Array.isArray(keys)) return null;
    return {
      keys,
      cat: parsed.cat ?? 'all',
      page: Math.max(0, parsed.page ?? 0),
    };
  } catch {
    return null;
  }
}

export async function clearTradePickCache(
  redis: Redis,
  sessionId: string,
  userId: string,
): Promise<void> {
  await redis.del(key(sessionId, userId));
}

export function resolvePickKey(
  cache: TradePickCache,
  absIndex: number,
): string | null {
  if (absIndex < 0 || absIndex >= cache.keys.length) return null;
  return cache.keys[absIndex] ?? null;
}
