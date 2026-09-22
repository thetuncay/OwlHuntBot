import type { Redis } from 'ioredis';
import { isAdmin } from './admin-access';
import { foldTrAscii } from './alias-command';

export const OWL_ONLY_MAX_CHANNELS = 25;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 5_000;

type CacheEntry = {
  channelIds: string[] | null;
  expiresAtMs: number;
};

const channelCache = new Map<string, CacheEntry>();

function redisKey(guildId: string): string {
  return `guild:owlonly:${guildId}`;
}

function touchCache(guildId: string, channelIds: string[] | null): void {
  channelCache.set(guildId, { channelIds, expiresAtMs: Date.now() + CACHE_TTL_MS });
  if (channelCache.size > CACHE_MAX) {
    const oldest = channelCache.keys().next().value;
    if (oldest) channelCache.delete(oldest);
  }
}

export class OwlOnlyChannelDeniedError extends Error {
  constructor(public readonly allowedMentions: string) {
    super(
      `🦉 Bu sunucuda oyun komutları yalnızca şu kanallarda kullanılabilir: ${allowedMentions}`,
    );
    this.name = 'OwlOnlyChannelDeniedError';
  }
}

/** Komutlar kanal kısıtından muaf (ayar, yardım, liderboard). */
export function isExemptFromOwlOnlyChannel(command: string): boolean {
  if (command === 'owlonly' || command === 'admin' || command === 'lb' || command === 'top') {
    return true;
  }
  if (command === 'owl:yardim' || command === 'owl:prefix') return true;
  return false;
}

const PREFIX_EXEMPT = new Set([
  'yardim',
  'yardım',
  'help',
  'komutlar',
  'prefix',
  'admin',
  'ceza',
]);

export function isPrefixExemptFromOwlOnly(firstWord: string): boolean {
  return PREFIX_EXEMPT.has(foldTrAscii(firstWord));
}

export async function getOwlOnlyChannelIds(redis: Redis, guildId: string): Promise<string[]> {
  const cached = channelCache.get(guildId);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.channelIds ?? [];
  }
  if (cached && cached.expiresAtMs <= Date.now()) channelCache.delete(guildId);

  const ids = await redis.smembers(redisKey(guildId));
  touchCache(guildId, ids);
  return ids;
}

export async function addOwlOnlyChannel(
  redis: Redis,
  guildId: string,
  channelId: string,
): Promise<{ added: boolean; total: number }> {
  const key = redisKey(guildId);
  const count = await redis.scard(key);
  if (count >= OWL_ONLY_MAX_CHANNELS) {
    throw new Error(`En fazla ${OWL_ONLY_MAX_CHANNELS} kanal eklenebilir. Önce bir kanal kaldır.`);
  }
  const added = (await redis.sadd(key, channelId)) === 1;
  const total = await redis.scard(key);
  touchCache(guildId, await redis.smembers(key));
  return { added, total };
}

export async function removeOwlOnlyChannel(
  redis: Redis,
  guildId: string,
  channelId: string,
): Promise<{ removed: boolean; total: number }> {
  const key = redisKey(guildId);
  const removed = (await redis.srem(key, channelId)) === 1;
  const total = await redis.scard(key);
  if (total === 0) {
    await redis.del(key);
    touchCache(guildId, null);
  } else {
    touchCache(guildId, await redis.smembers(key));
  }
  return { removed, total };
}

export async function clearOwlOnlyChannels(redis: Redis, guildId: string): Promise<void> {
  await redis.del(redisKey(guildId));
  touchCache(guildId, null);
}

/** Sunucuda kısıtlama varsa ve kanal izinli listede ise true. */
export async function isOwlOnlyGameChannel(
  redis: Redis,
  guildId: string,
  channelId: string,
  parentChannelId?: string | null,
): Promise<boolean> {
  const allowed = await getOwlOnlyChannelIds(redis, guildId);
  if (allowed.length === 0) return false;
  return channelIsAllowed(channelId, parentChannelId, allowed);
}

/** @internal test helper */
export function clearOwlOnlyChannelCacheForTests(): void {
  channelCache.clear();
}

export function formatChannelMentions(channelIds: string[]): string {
  if (channelIds.length === 0) return '*(hiçbiri — tüm kanallar serbest)*';
  return channelIds.map((id) => `<#${id}>`).join(', ');
}

/**
 * Sunucuda owl-only listesi varsa yalnızca o kanallarda oyun komutlarına izin verir.
 * Liste boşsa tüm kanallar serbest. Bot sahibi (ADMIN_USER_IDS) her yerde kullanabilir.
 */
function channelIsAllowed(
  channelId: string,
  parentChannelId: string | null | undefined,
  allowed: string[],
): boolean {
  if (allowed.includes(channelId)) return true;
  if (parentChannelId && allowed.includes(parentChannelId)) return true;
  return false;
}

export async function assertOwlOnlyChannel(
  redis: Redis,
  opts: {
    guildId: string | null | undefined;
    channelId: string | null | undefined;
    parentChannelId?: string | null;
    userId: string;
    exempt: boolean;
  },
): Promise<void> {
  if (opts.exempt || !opts.guildId || !opts.channelId) return;
  if (isAdmin(opts.userId)) return;

  const allowed = await getOwlOnlyChannelIds(redis, opts.guildId);
  if (allowed.length === 0) return;
  if (channelIsAllowed(opts.channelId, opts.parentChannelId, allowed)) return;

  throw new OwlOnlyChannelDeniedError(formatChannelMentions(allowed));
}
