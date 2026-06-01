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
  const key = `lock:${playerId}:${action}`;
  const token = randomUUID();
  const result = await redis.set(key, token, 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK' ? token : null;
}

export interface HeldResourceLock {
  key: string;
  token: string;
}

/**
 * Resource-level lock helper for non-player resources such as market listings.
 * The caller owns the key namespace, e.g. `listing:{id}:lock`.
 */
export async function acquireResourceLock(key: string): Promise<string | null> {
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

export async function releaseResourceLock(key: string, token: string): Promise<void> {
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

export async function withResourceLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const token = await acquireResourceLock(key);
  if (!token) {
    throw new Error('⏳ Zaten bir işlem devam ediyor, lütfen bekle.');
  }
  try {
    return await fn();
  } finally {
    releaseResourceLock(key, token).catch(() => null);
  }
}

async function releaseHeldLocksReverse(heldLocks: HeldResourceLock[]): Promise<void> {
  for (const held of [...heldLocks].reverse()) {
    await releaseResourceLock(held.key, held.token).catch(() => null);
  }
}

/**
 * Acquires multiple resource locks in deterministic key order.
 * If any lock cannot be acquired, all previously acquired locks are released.
 */
export async function withOrderedResourceLocks<T>(
  keys: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const orderedKeys = [...new Set(keys)].sort();
  const heldLocks: HeldResourceLock[] = [];

  try {
    for (const key of orderedKeys) {
      const token = await acquireResourceLock(key);
      if (!token) {
        throw new Error('⏳ Zaten bir işlem devam ediyor, lütfen bekle.');
      }
      heldLocks.push({ key, token });
    }
    return await fn();
  } finally {
    await releaseHeldLocksReverse(heldLocks);
  }
}

export function playerLockKey(playerId: string, action: string): string {
  return `lock:${playerId}:${action}`;
}
