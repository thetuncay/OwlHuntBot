import { redis } from './redis';
import { LOCK_TTL_SECONDS } from '../config';
import { randomUUID } from 'node:crypto';

// Lua script: token eşleşiyorsa sil, yoksa 0 döndür (atomic compare-and-delete)
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Bir oyuncu icin Redis mutex kilidi alir.
 * Token tabanlı: sahiplik doğrulaması için benzersiz UUID döndürür.
 * Kilit alinamazsa null doner.
 */
export async function acquireLock(playerId: string, action: string): Promise<string | null> {
  const key   = `lock:${playerId}:${action}`;
  const token = randomUUID();
  const result = await redis.set(key, token, 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK' ? token : null;
}

/**
 * Bir oyuncu/islem lock kaydini serbest birakir.
 * Token kontrolü: sadece kilidi alan işlem serbest bırakabilir.
 * Başka bir işlem kilidi almışsa (TTL doldu, yeni işlem aldı) silmez.
 */
export async function releaseLock(playerId: string, action: string, token: string): Promise<void> {
  const key = `lock:${playerId}:${action}`;
  await redis.eval(RELEASE_SCRIPT, 1, key, token);
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
  const token = await acquireLock(playerId, action);
  if (!token) {
    throw new Error('⏳ Zaten bir işlem devam ediyor, lütfen bekle.');
  }
  try {
    return await fn();
  } finally {
    // Token ile serbest bırak — başka işlemin kilidini silmez
    releaseLock(playerId, action, token).catch(() => null);
  }
}
