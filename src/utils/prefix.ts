import type Redis from 'ioredis';

const DEFAULT_PREFIX = 'owl';

function keyForGuild(guildId: string): string {
  return `guild:prefix:${guildId}`;
}

export function normalizePrefix(value: string): string {
  return value.trim().toLowerCase();
}

export async function getGuildPrefix(redis: Redis, guildId: string): Promise<string> {
  const value = await redis.get(keyForGuild(guildId));
  if (!value) return DEFAULT_PREFIX;
  const normalized = normalizePrefix(value);
  return normalized.length > 0 ? normalized : DEFAULT_PREFIX;
}

export async function setGuildPrefix(redis: Redis, guildId: string, value: string): Promise<string> {
  const normalized = normalizePrefix(value);
  await redis.set(keyForGuild(guildId), normalized);
  return normalized;
}

export { DEFAULT_PREFIX };
