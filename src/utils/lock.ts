import { redis } from './redis';
import { LOCK_TTL_SECONDS } from '../config';

/**
 * Bir oyuncu icin Redis mutex kilidi alir.
 * Kilit alinamazsa false doner.
 */
export async function acquireLock(playerId: string, action: string): Promise<boolean> {
  const key = `lock:${playerId}:${action}`;
  const result = await redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

/**
 * Bir oyuncu/islem lock kaydini serbest birakir.
 */
export async function releaseLock(playerId: string, action: string): Promise<void> {
  const key = `lock:${playerId}:${action}`;
  await redis.del(key);
}

/**
 * Kilit altinda async fonksiyon calistirir.
 * Lock alinamazsa BEKLEMEZ — aninda kullanici dostu hata firlatir.
 */
export async function withLock<T>(
  playerId: string,
  action: string,
  fn: () => Promise<T>,
): Promise<T> {
  const acquired = await acquireLock(playerId, action);
  if (!acquired) {
    throw new Error('⏳ Zaten bir işlem devam ediyor, lütfen bekle.');
  }
  try {
    return await fn();
  } finally {
    // Fire-and-forget: lock serbest bırakma kritik yolda değil
    releaseLock(playerId, action).catch(() => null);
  }
}
