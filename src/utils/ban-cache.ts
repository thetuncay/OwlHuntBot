/**
 * ban-cache.ts — In-memory ban cache for Redis outage (per process).
 * Negative bans are not cached to avoid stale unban.
 */
import { getBanCacheTtlMs } from './launch-config';

export interface BanCacheEntry {
  reason: string;
  expiresAtMs: number;
}

const cache = new Map<string, BanCacheEntry>();
let lastWarmAt: string | null = null;

export function getBanCacheStats(): { entries: number; lastWarmAt: string | null } {
  pruneExpired();
  return { entries: cache.size, lastWarmAt };
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [userId, entry] of cache) {
    if (entry.expiresAtMs <= now) cache.delete(userId);
  }
}

export function setBanCacheEntry(userId: string, reason: string, ttlMs = getBanCacheTtlMs()): void {
  cache.set(userId, {
    reason,
    expiresAtMs: Date.now() + ttlMs,
  });
}

export function deleteBanCacheEntry(userId: string): void {
  cache.delete(userId);
}

export function refreshBanCacheEntry(userId: string, reason: string, ttlMs?: number): void {
  setBanCacheEntry(userId, reason, ttlMs ?? getBanCacheTtlMs());
}

/** Returns ban reason if cached and valid; otherwise null. */
export function getBanCacheEntry(userId: string): string | null {
  pruneExpired();
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.reason;
}

/** Warm cache from Redis ban keys (userId extracted from ban:{id}). */
export async function warmBanCacheFromKeys(
  keys: string[],
  fetchReason: (key: string) => Promise<string | null>,
  maxKeys = 500,
): Promise<number> {
  const slice = keys.slice(0, maxKeys);
  let warmed = 0;
  for (const key of slice) {
    const userId = key.startsWith('ban:') ? key.slice(4) : key;
    if (!userId) continue;
    const reason = await fetchReason(key);
    if (reason) {
      setBanCacheEntry(userId, reason);
      warmed++;
    }
  }
  if (warmed > 0) {
    lastWarmAt = new Date().toISOString();
  }
  return warmed;
}

export function clearBanCache(): void {
  cache.clear();
  lastWarmAt = null;
}
