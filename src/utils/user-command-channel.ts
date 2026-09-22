/**
 * Kullanıcı başına komut kanalı sayacı — anket duyurusu hedef kanalı için.
 */
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { MAIN_GUILD_ID } from '../config';
import { getOwlOnlyChannelIds } from './owl-only-channels';

const KEY_PREFIX = 'cmdchan:user:';
const TTL_SEC = 90 * 24 * 3600;

function userKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function fieldKey(guildId: string, channelId: string): string {
  return `${guildId}|${channelId}`;
}

function parseField(field: string): { guildId: string; channelId: string } | null {
  const sep = field.indexOf('|');
  if (sep <= 0) return null;
  const guildId = field.slice(0, sep);
  const channelId = field.slice(sep + 1);
  if (!guildId || !channelId) return null;
  return { guildId, channelId };
}

/** Başarılı komut sonrası kanal sayacını artır (fire-and-forget). */
export async function recordUserCommandChannel(
  redis: Redis,
  params: {
    userId: string;
    guildId?: string | null;
    channelId?: string | null;
    parentChannelId?: string | null;
  },
): Promise<void> {
  const guildId = params.guildId?.trim();
  const channelId = (params.parentChannelId ?? params.channelId)?.trim();
  if (!guildId || !channelId) return;

  const key = userKey(params.userId);
  const field = fieldKey(guildId, channelId);
  await redis
    .multi()
    .hincrby(key, field, 1)
    .expire(key, TTL_SEC)
    .exec()
    .catch(() => null);
}

/** Redis'teki en çok komut atılan kanal. */
export async function resolveUserTopCommandChannel(
  redis: Redis,
  userId: string,
): Promise<{ guildId: string; channelId: string } | null> {
  const raw = await redis.hgetall(userKey(userId)).catch(() => ({}));
  let best: { guildId: string; channelId: string; count: number } | null = null;

  for (const [field, countStr] of Object.entries(raw)) {
    const parsed = parseField(field);
    const count = parseInt(countStr, 10);
    if (!parsed || !Number.isFinite(count) || count <= 0) continue;
    if (!best || count > best.count) {
      best = { ...parsed, count };
    }
  }

  return best ? { guildId: best.guildId, channelId: best.channelId } : null;
}

async function fallbackFromRegistration(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
): Promise<{ guildId: string; channelId: string } | null> {
  const reg = await prisma.playerRegistration.findFirst({
    where: { userId },
    orderBy: { acceptedAt: 'desc' },
    select: { guildId: true },
  });
  if (!reg) return null;

  const explicit = process.env.FEEDBACK_ANNOUNCE_CHANNEL_ID?.trim();
  if (explicit) {
    return { guildId: reg.guildId, channelId: explicit };
  }

  const owlChannels = await getOwlOnlyChannelIds(redis, reg.guildId);
  const channelId = owlChannels[0];
  if (!channelId) return null;
  return { guildId: reg.guildId, channelId };
}

async function fallbackFromEnvGuild(
  redis: Redis,
): Promise<{ guildId: string; channelId: string } | null> {
  const guildId = process.env.FEEDBACK_ANNOUNCE_GUILD_ID?.trim() || MAIN_GUILD_ID;
  if (!guildId) return null;

  const explicit = process.env.FEEDBACK_ANNOUNCE_CHANNEL_ID?.trim();
  if (explicit) return { guildId, channelId: explicit };

  const owlChannels = await getOwlOnlyChannelIds(redis, guildId);
  const channelId = owlChannels[0];
  if (!channelId) return null;
  return { guildId, channelId };
}

/** Anket duyurusu hedef kanalı — önce kullanıcı telemetry, sonra kayıt/env fallback. */
export async function resolveFeedbackAnnounceTarget(
  redis: Redis,
  prisma: PrismaClient | null,
  userId: string,
): Promise<{ guildId: string; channelId: string } | null> {
  const top = await resolveUserTopCommandChannel(redis, userId);
  if (top) return top;

  if (prisma) {
    const fromReg = await fallbackFromRegistration(prisma, redis, userId);
    if (fromReg) return fromReg;
  }

  return fallbackFromEnvGuild(redis);
}
