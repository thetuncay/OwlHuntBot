/**
 * cooldown-hint.ts — Cooldown mesajına eklenen tek satır bilgilendirici ipucu (A3).
 *
 * Amaç: `⏱️ Hunt cooldown — X sn kaldı` mesajının altında, oyuncunun
 * boş beklemesin diye **kısa + faydalı** bir yönlendirme. Örnek: hazır görev varsa.
 *
 * Kurallar:
 * - Hot path'te **PG sorgusu yok** — sadece Redis GET.
 * - Cache miss ise ipucu **boş** döner; arka planda cache doldurulur (detached).
 * - Format: tek satır, motive edici sos değil, informational feedback
 *   (Deci vd. 1999 undermining kaçınımı).
 * - Kural: [`no-hidden-mechanics.mdc`], [`no-ui-noise.mdc`], DDR-006.
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { runDetached } from './async';
import { countUnclaimedReadyQuests } from '../systems/daily-quests';

/** Cache TTL — 60 sn; kısa cooldown pencereleri için tazelik gerekmiyor. */
const HINT_CACHE_TTL_SEC = 60;

/** Cache anahtar prefix — kullanıcı bazlı. */
const HINT_CACHE_KEY_PREFIX = 'cd:hint:ready:';

function cacheKey(userId: string): string {
  return `${HINT_CACHE_KEY_PREFIX}${userId}`;
}

/**
 * Cooldown mesajının altına eklenecek tek satır ipucu.
 * **Sadece Redis GET** — hot path'te PG'ye dokunmaz. Miss ise `null` döner.
 * Cache dolumu için `refreshCooldownHintCache` diğer aksiyonlardan (hunt/quest complete) çağrılır.
 *
 * @param redis   Redis client
 * @param userId  Discord user id
 * @param prefix  Guild prefix (`w` gibi) — komut örneğinde kullanılır
 * @returns Tek satır ipucu veya `null`
 */
export async function getCooldownHint(
  redis: Redis,
  userId: string,
  prefix: string,
): Promise<string | null> {
  const raw = await redis.get(cacheKey(userId)).catch(() => null);

  if (raw === null) return null;

  const readyCount = Number.parseInt(raw, 10);
  if (!Number.isFinite(readyCount) || readyCount <= 0) return null;

  const label = readyCount === 1 ? 'Hazır görevin var' : `${readyCount} görev hazır`;
  return `🎯 ${label}: \`${prefix} q\``;
}

/**
 * Cache'i **eager** günceller — hunt sonucu / quest complete / `w quest` açılışı gibi
 * aksiyonlardan sonra `runDetached` içinde çağrılmalı. PG sorgusu yaptığı için
 * hot path'te doğrudan await edilmez.
 *
 * @param redis   Redis client
 * @param prisma  PG client
 * @param userId  Discord user id
 */
export async function refreshCooldownHintCache(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  try {
    const count = await countUnclaimedReadyQuests(prisma, userId, redis);
    await redis.set(cacheKey(userId), String(count), 'EX', HINT_CACHE_TTL_SEC);
  } catch {
    // Sessiz — cooldown ipucu opsiyonel, hata yayılmaz.
  }
}

/**
 * Detached fire-and-forget helper — hunt/quest tamamlanma sonrası çağrılır.
 * Aynı `runDetached` deseni kod tabanının geri kalanıyla tutarlı.
 */
export function scheduleCooldownHintRefresh(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
): void {
  runDetached('cd-hint-refresh', () => refreshCooldownHintCache(redis, prisma, userId));
}

/**
 * Bir quest claim edildikten sonra cache'i **invalidate** eder.
 * Böylece bir sonraki cooldown mesajı taze sayıyı gösterir.
 * Fail-safe: hata durumu sessizce yutulur (ipucu opsiyonel).
 */
export async function invalidateCooldownHint(redis: Redis, userId: string): Promise<void> {
  try {
    await redis.del(cacheKey(userId));
  } catch {
    /* noop */
  }
}
