import type Redis from 'ioredis';

const DEFAULT_PREFIX = 'owl';
const PREFIX_CACHE_TTL_MS = 60_000;
const PREFIX_CACHE_MAX = 5_000;

type PrefixCacheEntry = {
  value: string;
  expiresAtMs: number;
};

const prefixCache = new Map<string, PrefixCacheEntry>();

function keyForGuild(guildId: string): string {
  return `guild:prefix:${guildId}`;
}

export function normalizePrefix(value: string): string {
  return value.trim().toLowerCase();
}

export async function getGuildPrefix(redis: Redis, guildId: string): Promise<string> {
  const cached = prefixCache.get(guildId);
  if (cached && cached.expiresAtMs > Date.now()) return cached.value;
  if (cached && cached.expiresAtMs <= Date.now()) prefixCache.delete(guildId);

  const value = await redis.get(keyForGuild(guildId));
  if (!value) {
    prefixCache.set(guildId, { value: DEFAULT_PREFIX, expiresAtMs: Date.now() + PREFIX_CACHE_TTL_MS });
    if (prefixCache.size > PREFIX_CACHE_MAX) {
      const oldest = prefixCache.keys().next().value;
      if (oldest) prefixCache.delete(oldest);
    }
    return DEFAULT_PREFIX;
  }
  const normalized = normalizePrefix(value);
  const finalPrefix = normalized.length > 0 ? normalized : DEFAULT_PREFIX;
  prefixCache.set(guildId, { value: finalPrefix, expiresAtMs: Date.now() + PREFIX_CACHE_TTL_MS });
  if (prefixCache.size > PREFIX_CACHE_MAX) {
    const oldest = prefixCache.keys().next().value;
    if (oldest) prefixCache.delete(oldest);
  }
  return finalPrefix;
}

export async function setGuildPrefix(redis: Redis, guildId: string, value: string): Promise<string> {
  const normalized = normalizePrefix(value);
  await redis.set(keyForGuild(guildId), normalized);
  prefixCache.set(guildId, { value: normalized, expiresAtMs: Date.now() + PREFIX_CACHE_TTL_MS });
  return normalized;
}

export { DEFAULT_PREFIX };
