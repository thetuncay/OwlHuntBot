import type { Redis } from 'ioredis';

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
  try {
    const result = await redis.eval(COOLDOWN_LUA, 1, key, String(cooldownMs)) as number;
    return Math.max(0, result);
  } catch {
    // Redis down → cooldown'u atla, komutu engelleme
    return 0;
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
  try {
    await redis.set(key, '1', 'PX', cooldownMs);
  } catch {
    // Redis down → sessizce geç
  }
}
