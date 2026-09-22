/**
 * kudos.ts — 20 dakikada bir teşekkür (G3). Oyun-içi ödül yok.
 *
 * `w kudos` kaç kişi attığını gösterir.
 * `w kudos @oyuncu` gönderir; aynı kişi tekrar atsa sayı artmaz.
 */

import type { Redis } from 'ioredis';
import {
  KUDOS_COOLDOWN_MS,
  KUDOS_COOLDOWN_PREFIX,
  KUDOS_PEOPLE_PREFIX,
} from '../config/engagement';

function cooldownKey(fromId: string): string {
  return `${KUDOS_COOLDOWN_PREFIX}${fromId}`;
}

function peopleKey(toId: string): string {
  return `${KUDOS_PEOPLE_PREFIX}${toId}`;
}

export interface KudosResult {
  ok: boolean;
  reason?: 'self' | 'cooldown';
  /** Hedefte kudosu olan benzersiz kişi sayısı. */
  people: number;
  retryAfterMs?: number;
}

/**
 * Kudos gönderir. Cooldown gönderene aittir; sayaç alandaki benzersiz kişilerdir.
 *
 * @param redis Redis
 * @param fromId Gönderen
 * @param toId Alan
 */
export async function sendKudos(
  redis: Redis,
  fromId: string,
  toId: string,
): Promise<KudosResult> {
  if (fromId === toId) {
    return { ok: false, reason: 'self', people: await getKudosPeople(redis, toId) };
  }

  const locked = await redis.set(cooldownKey(fromId), '1', 'PX', KUDOS_COOLDOWN_MS, 'NX');
  if (locked !== 'OK') {
    const ttl = await redis.pttl(cooldownKey(fromId));
    return {
      ok: false,
      reason: 'cooldown',
      people: await getKudosPeople(redis, toId),
      retryAfterMs: Math.max(0, ttl),
    };
  }

  await redis.sadd(peopleKey(toId), fromId);
  return { ok: true, people: await getKudosPeople(redis, toId) };
}

/**
 * Kaç farklı kişinin kudos attığı.
 *
 * @param redis Redis
 * @param userId Alan
 */
export async function getKudosPeople(redis: Redis, userId: string): Promise<number> {
  return redis.scard(peopleKey(userId));
}

/**
 * Kalan cooldown metni (`18 dk`, `45 sn`).
 *
 * @param ms Kalan milisaniye
 */
export function formatKudosCooldown(ms: number): string {
  if (ms <= 0) return 'şimdi';
  const mins = Math.floor(ms / 60_000);
  if (mins <= 0) return `${Math.max(1, Math.ceil(ms / 1000))} sn`;
  return `${mins} dk`;
}
