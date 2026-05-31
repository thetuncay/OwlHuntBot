import type { Redis } from 'ioredis';

/** Tek bir cooldown anahtarina yazilabilecek mutlak ust sinir (1 saat). */
export const MAX_COOLDOWN_TTL_MS = 60 * 60 * 1000;

function clampCooldownMs(cooldownMs: number): number {
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) return 0;
  return Math.min(Math.floor(cooldownMs), MAX_COOLDOWN_TTL_MS);
}

// Lua script: atomik check-and-set
// Tek round-trip ile hem kontrol hem set yapar
// Döner: 0 = cooldown yok (set edildi), >0 = kalan ms
const COOLDOWN_LUA = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 then
  return ttl
end
local result = redis.call('SET', KEYS[1], '1', 'PX', ARGV[1], 'NX')
if result then
  return 0
end
return redis.call('PTTL', KEYS[1])
`;

/**
 * Komut cooldown anahtarini kontrol eder.
 * Lua script ile atomik — 3 Redis call yerine 1 round-trip.
 * Cooldown aktifse kalan sureyi milisaniye cinsinden dondurur.
 * Aktif değilse cooldownMs süresiyle set eder.
 * Redis erişilemezse 0 döner (cooldown'u engelleme).
 */
export async function getCooldownRemainingMs(
  redis: Redis,
  key: string,
  cooldownMs: number,
): Promise<number> {
  const safeMs = clampCooldownMs(cooldownMs);
  if (safeMs <= 0) return 0;
  try {
    const result = await redis.eval(COOLDOWN_LUA, 1, key, String(safeMs)) as number;
    return Math.max(0, result);
  } catch {
    // Redis down GÜVENLİK FİX: Flood'u engellemek için hata fırlat
    throw new Error('⚠️ Cooldown kontrolü yapılamadı (Redis Error). Lütfen az sonra tekrar deneyin.');
  }
}

/**
 * Cooldown anahtarini sadece kontrol eder, set etmez.
 */
export async function checkCooldownRemainingMs(
  redis: Redis,
  key: string,
): Promise<number> {
  try {
    const ttl = await redis.pttl(key);
    return ttl > 0 ? ttl : 0;
  } catch {
    return 0;
  }
}

/**
 * Cooldown anahtarini belirtilen sure ile set eder.
 */
export async function setCooldown(
  redis: Redis,
  key: string,
  cooldownMs: number,
): Promise<void> {
  const safeMs = clampCooldownMs(cooldownMs);
  if (safeMs <= 0) return;
  try {
    // Eski EX/PX key formatlarini temizle — her zaman taze PX yaz
    await redis.del(key);
    await redis.set(key, '1', 'PX', safeMs);
  } catch {
    // Redis down → sessizce geç
  }
}

/**
 * Birden fazla Redis anahtarını tek bir pipeline round-trip'te kontrol eder.
 * Her anahtar için GET ve PTTL komutlarını pipeline'a ekler, exec() ile çalıştırır.
 * exec() null dönerse veya hata oluşursa güvenli varsayılan döner.
 * Requirements: 7.1, 7.2, 7.3
 */
export async function checkKeysPipelined(
  redis: Redis,
  keys: string[],
): Promise<Array<{ value: string | null; ttlMs: number }>> {
  try {
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
      pipeline.pttl(key);
    }
    const results = await pipeline.exec();
    if (!results) return keys.map(() => ({ value: null, ttlMs: 0 }));
    return keys.map((_, i) => {
      const valueEntry = results[i * 2];
      const ttlEntry = results[i * 2 + 1];
      const value = (valueEntry && !valueEntry[0]) ? (valueEntry[1] as string | null) : null;
      const ttlMs = (ttlEntry && !ttlEntry[0]) ? Math.max(0, ttlEntry[1] as number) : 0;
      return { value, ttlMs };
    });
  } catch {
    return keys.map(() => ({ value: null, ttlMs: 0 }));
  }
}
