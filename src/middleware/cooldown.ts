import type { Redis } from 'ioredis';

/**
 * Komut cooldown anahtarini kontrol eder.
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
    const ttl = await redis.pttl(key);
    if (ttl > 0) return ttl;

    const setResult = await redis.set(key, '1', 'PX', cooldownMs, 'NX');
    if (setResult === 'OK') return 0;

    // Başka bir istek aynı anda set ettiyse TTL'yi oku
    const fallbackTtl = await redis.pttl(key);
    return Math.max(0, fallbackTtl);
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
