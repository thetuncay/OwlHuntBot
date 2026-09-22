/**
 * social-gifs.ts — SFW GIF çekimi + Redis cache.
 *
 * Kaynaklar: otakugifs, nekos.life (SFW), nekos.best.
 * NSFW / hentai / nekobot yok.
 */

import type { Redis } from 'ioredis';
import {
  SOCIAL_GIF_CACHE_CAP,
  SOCIAL_GIF_CACHE_TTL_SEC,
  type SocialActionDef,
  type SocialGifSource,
} from '../config/social-actions';

const FETCH_TIMEOUT_MS = 4_500;

/** nekos.life NSFW kategorileri — asla çağrılmaz. */
const BLOCKED_NEKOSLIFE = new Set([
  'lewd',
  'spank',
  'hentai',
  'anal',
  'blowjob',
  'pussy_jpg',
  'hentai_gif',
  'nsfw_neko_gif',
  'lesbian',
  'kuni',
  'random_hentai_gif',
]);

function cacheKey(actionId: string): string {
  return `social:gif:${actionId}`;
}

function pickTemplate(templates: readonly string[]): string {
  return templates[Math.floor(Math.random() * templates.length)]!;
}

/**
 * Embed author metni.
 *
 * @param def Aksiyon
 * @param actor Gönderen görünen ad
 * @param target Hedef görünen ad
 */
export function formatSocialActionText(
  def: SocialActionDef,
  actor: string,
  target: string,
): string {
  return pickTemplate(def.templates)
    .replaceAll('{actor}', actor)
    .replaceAll('{target}', target);
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function asUrl(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('http') ? value : null;
}

async function fetchFromSource(source: SocialGifSource): Promise<string | null> {
  try {
    switch (source.kind) {
      case 'otakugifs': {
        const data = await fetchJson(
          `https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(source.reaction)}`,
        ) as { url?: string };
        return asUrl(data.url);
      }
      case 'nekoslife': {
        if (BLOCKED_NEKOSLIFE.has(source.category.toLowerCase())) return null;
        const data = await fetchJson(
          `https://nekos.life/api/v2/img/${encodeURIComponent(source.category)}`,
        ) as { url?: string };
        return asUrl(data.url);
      }
      case 'nekosbest': {
        const data = await fetchJson(
          `https://nekos.best/api/v2/${encodeURIComponent(source.category)}`,
        ) as { results?: Array<{ url?: string }> };
        return asUrl(data.results?.[0]?.url);
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function rememberGif(
  redis: Redis | undefined,
  actionId: string,
  url: string,
): Promise<void> {
  if (!redis) return;
  const key = cacheKey(actionId);
  try {
    const pipe = redis.pipeline();
    pipe.lpush(key, url);
    pipe.ltrim(key, 0, SOCIAL_GIF_CACHE_CAP - 1);
    pipe.expire(key, SOCIAL_GIF_CACHE_TTL_SEC);
    await pipe.exec();
  } catch {
    // cache best-effort
  }
}

async function pickCachedGif(
  redis: Redis | undefined,
  actionId: string,
): Promise<string | null> {
  if (!redis) return null;
  try {
    const list = await redis.lrange(cacheKey(actionId), 0, SOCIAL_GIF_CACHE_CAP - 1);
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)] ?? null;
  } catch {
    return null;
  }
}

function shuffleSources(sources: readonly SocialGifSource[]): SocialGifSource[] {
  const order = [...sources];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

/**
 * Aksiyon için SFW GIF URL’si — API + cache.
 *
 * @param def Aksiyon tanımı
 * @param redis Opsiyonel Redis (cache)
 */
export async function resolveSocialGifUrl(
  def: SocialActionDef,
  redis?: Redis,
): Promise<string | null> {
  for (const source of shuffleSources(def.sources)) {
    const url = await fetchFromSource(source);
    if (url) {
      await rememberGif(redis, def.id, url);
      return url;
    }
  }

  return pickCachedGif(redis, def.id);
}
