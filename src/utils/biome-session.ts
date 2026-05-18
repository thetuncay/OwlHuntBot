/**
 * biome-session.ts — Oyuncu biyom oturumu yönetimi
 *
 * Oyuncu bir biyom seçtiğinde Redis'e kaydedilir.
 * Sonraki hunt'larda seçim menüsü gösterilmez, direkt hunt atılır.
 * 30 dakika sonra veya oyuncu çıkış yaparsa oturum silinir.
 */

import type { Redis } from 'ioredis';
import { BIOME_SESSION_TTL_MS } from '../config';

const SESSION_PREFIX = 'biome_session:';

export interface BiomeSession {
  biomeId: string;
  enteredAt: number; // Unix timestamp (ms)
  expiresAt: number; // Unix timestamp (ms)
}

function sessionKey(userId: string): string {
  return `${SESSION_PREFIX}${userId}`;
}

/**
 * Oyuncunun aktif biyom oturumunu döndürür.
 * Yoksa veya süresi dolmuşsa null döner.
 */
export async function getBiomeSession(
  redis: Redis,
  userId: string,
): Promise<BiomeSession | null> {
  try {
    const raw = await redis.get(sessionKey(userId));
    if (!raw) return null;
    const session = JSON.parse(raw) as BiomeSession;
    // Güvenlik: TTL dolmuş ama key hâlâ varsa null döndür
    if (Date.now() > session.expiresAt) {
      await redis.del(sessionKey(userId));
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Oyuncunun biyom oturumunu başlatır veya günceller.
 */
export async function setBiomeSession(
  redis: Redis,
  userId: string,
  biomeId: string,
): Promise<BiomeSession> {
  const now = Date.now();
  const session: BiomeSession = {
    biomeId,
    enteredAt: now,
    expiresAt: now + BIOME_SESSION_TTL_MS,
  };
  try {
    await redis.set(
      sessionKey(userId),
      JSON.stringify(session),
      'PX',
      BIOME_SESSION_TTL_MS,
    );
  } catch {
    // Redis down → sessizce geç, session olmadan devam et
  }
  return session;
}

/**
 * Oyuncunun biyom oturumunu siler (manuel çıkış).
 */
export async function clearBiomeSession(
  redis: Redis,
  userId: string,
): Promise<void> {
  try {
    await redis.del(sessionKey(userId));
  } catch {
    // Redis down → sessizce geç
  }
}

/**
 * Oturumun kalan süresini dakika:saniye formatında döndürür.
 */
export function formatSessionRemaining(session: BiomeSession): string {
  const remainingMs = Math.max(0, session.expiresAt - Date.now());
  const totalSecs = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}d ${secs.toString().padStart(2, '0')}s`;
}
