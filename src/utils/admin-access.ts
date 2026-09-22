import type { Redis } from 'ioredis';
import { warnRedisDegradation } from './redis-degradation';
import {
  deleteBanCacheEntry,
  getBanCacheEntry,
  refreshBanCacheEntry,
} from './ban-cache';
import { buildBanDeniedMessage } from '../systems/moderation';
import { createAppealAccessToken } from '../anticheat/appeal-access';

export const BAN_KEY_PREFIX = 'ban:';
export const MAINTENANCE_KEY = 'system:maintenance';

export function getAdminIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS;
  if (!raw?.trim()) return new Set();
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(ids);
}

export function isAdmin(userId: string): boolean {
  return getAdminIds().has(userId);
}

export function banKey(userId: string): string {
  return `${BAN_KEY_PREFIX}${userId}`;
}

/** Redis KEYS yerine SCAN — production-safe ban listesi. */
export async function scanBanKeys(redis: Redis): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', `${BAN_KEY_PREFIX}*`, 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

export class CommandAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandAccessDeniedError';
  }
}

const REDIS_UNAVAILABLE_MSG =
  '🔧 Sistem geçici olarak kullanılamıyor. Lütfen birkaç dakika sonra tekrar dene.';

function buildAppealUrl(userId: string): string {
  const token = createAppealAccessToken(userId);
  const base = process.env.WEB_PUBLIC_URL?.trim()?.replace(/\/$/, '') ?? 'http://127.0.0.1:3011';
  return `${base}/appeal-access?at=${encodeURIComponent(token)}`;
}

/**
 * Ban ve bakım modu kontrolü.
 * - Admins bypass (ops recovery).
 * - Redis error: maintenance ON for non-admins; bans use memory cache then fail-closed.
 */
export async function assertCommandAccess(redis: Redis, userId: string): Promise<void> {
  if (isAdmin(userId)) return;

  try {
    const banReason = await redis.get(banKey(userId));
    if (banReason) {
      const ttl = await redis.ttl(banKey(userId));
      refreshBanCacheEntry(userId, banReason, ttl > 0 ? ttl * 1000 : undefined);
      throw new CommandAccessDeniedError(buildBanDeniedMessage(banReason, ttl, buildAppealUrl(userId)));
    }

    const maintenance = await redis.get(MAINTENANCE_KEY);
    if (maintenance) {
      throw new CommandAccessDeniedError(
        '🔧 Bot şu anda bakım modunda. Lütfen daha sonra tekrar dene.',
      );
    }
  } catch (err) {
    if (err instanceof CommandAccessDeniedError) throw err;

    warnRedisDegradation('assertCommandAccess', err);

    const cachedBan = getBanCacheEntry(userId);
    if (cachedBan) {
      throw new CommandAccessDeniedError(buildBanDeniedMessage(cachedBan, -1, buildAppealUrl(userId)));
    }

    throw new CommandAccessDeniedError(REDIS_UNAVAILABLE_MSG);
  }
}

/** After admin ban — keep process-local cache in sync. */
export function recordBanInCache(userId: string, reason: string, ttlMs?: number): void {
  refreshBanCacheEntry(userId, reason, ttlMs);
}

/** After admin unban — clear process-local cache. */
export function clearBanFromCache(userId: string): void {
  deleteBanCacheEntry(userId);
}
