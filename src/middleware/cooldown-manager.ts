import type { Redis } from 'ioredis';
import {
  checkCooldownRemainingMs,
  getCooldownRemainingMs,
  setCooldown,
} from './cooldown';

type CooldownEntry = {
  expiresAtMs: number;
  warned: boolean;
};

export type CooldownDecision = {
  active: boolean;
  expiresAtMs: number;
  remainingMs: number;
  notify: boolean;
};

export const COOLDOWN_CLEAR_CHANNEL = 'cooldown:clear';

const localCooldowns = new Map<string, CooldownEntry>();

function nowMs(): number {
  return Date.now();
}

function toDecision(active: boolean, expiresAtMs: number, notify: boolean): CooldownDecision {
  const remainingMs = Math.max(0, expiresAtMs - nowMs());
  return {
    active,
    expiresAtMs,
    remainingMs,
    notify: active ? notify : false,
  };
}

function getActiveLocalEntry(key: string): CooldownEntry | null {
  const existing = localCooldowns.get(key);
  if (!existing) return null;
  if (existing.expiresAtMs <= nowMs()) {
    localCooldowns.delete(key);
    return null;
  }
  return existing;
}

function markWarned(key: string, entry: CooldownEntry): CooldownDecision {
  if (entry.warned) return toDecision(true, entry.expiresAtMs, false);
  entry.warned = true;
  localCooldowns.set(key, entry);
  return toDecision(true, entry.expiresAtMs, true);
}

/**
 * Atomik cooldown check-and-set.
 * - Cooldown aktifse sadece ilk ihlalde notify=true döner.
 * - Aktif değilse Redis'te cooldown başlatılır ve active=false döner.
 */
export async function guardCooldown(
  redis: Redis,
  key: string,
  cooldownMs: number,
): Promise<CooldownDecision> {
  const local = getActiveLocalEntry(key);
  if (local) return markWarned(key, local);

  const remainingMs = await getCooldownRemainingMs(redis, key, cooldownMs);
  if (remainingMs > 0) {
    const entry: CooldownEntry = {
      expiresAtMs: nowMs() + remainingMs,
      warned: false,
    };
    localCooldowns.set(key, entry);
    return markWarned(key, entry);
  }

  localCooldowns.set(key, {
    expiresAtMs: nowMs() + cooldownMs,
    warned: false,
  });
  return toDecision(false, nowMs() + cooldownMs, false);
}

/**
 * Cooldown'u sadece kontrol eder, set etmez.
 * - Aktifse ilk ihlalde notify=true döner.
 */
export async function peekCooldown(
  redis: Redis,
  key: string,
): Promise<CooldownDecision> {
  const remainingMs = await checkCooldownRemainingMs(redis, key);

  if (remainingMs <= 0) {
    localCooldowns.delete(key);
    return toDecision(false, 0, false);
  }

  const expiresAtMs = nowMs() + remainingMs;
  const prev = localCooldowns.get(key);
  const entry: CooldownEntry = {
    expiresAtMs,
    // Ayni aktif cooldown suresince ikinci uyariyi gonderme.
    warned: prev?.warned ?? false,
  };
  localCooldowns.set(key, entry);
  return markWarned(key, entry);
}

/**
 * peekCooldown + anormal uzun TTL temizligi.
 * maxRemainingMs ustundeki key'ler bug sayilir ve silinir.
 */
export async function peekCooldownBounded(
  redis: Redis,
  key: string,
  maxRemainingMs: number,
): Promise<CooldownDecision> {
  const remainingMs = await checkCooldownRemainingMs(redis, key);
  if (remainingMs <= 0) {
    localCooldowns.delete(key);
    return toDecision(false, 0, false);
  }
  if (remainingMs > maxRemainingMs) {
    console.warn(
      `[Cooldown] Anormal TTL temizlendi: ${key} (${Math.ceil(remainingMs / 1000)}s > ${Math.ceil(maxRemainingMs / 1000)}s)`,
    );
    await clearCooldown(redis, key);
    return toDecision(false, 0, false);
  }

  const expiresAtMs = nowMs() + remainingMs;
  const prev = localCooldowns.get(key);
  const entry: CooldownEntry = {
    expiresAtMs,
    warned: prev?.warned ?? false,
  };
  localCooldowns.set(key, entry);
  return markWarned(key, entry);
}

/**
 * Pattern ile eslesen cooldown key'lerinde anormal TTL'leri temizler.
 */
export async function purgeCooldownsAboveMax(
  redis: Redis,
  pattern: string,
  maxRemainingMs: number,
): Promise<number> {
  let cursor = '0';
  let purged = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;
    if (keys.length === 0) continue;

    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.pttl(key);
    const results = await pipeline.exec();
    if (!results) continue;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const entry = results[i];
      const ttlMs = entry && !entry[0] ? Math.max(0, entry[1] as number) : 0;
      if (ttlMs <= maxRemainingMs) continue;
      await clearCooldown(redis, key);
      purged++;
    }
  } while (cursor !== '0');

  return purged;
}

/**
 * İşlem başarıyla tamamlandığında cooldown'u başlatır.
 */
export async function armCooldown(
  redis: Redis,
  key: string,
  cooldownMs: number,
): Promise<void> {
  await setCooldown(redis, key, cooldownMs);
  localCooldowns.set(key, {
    expiresAtMs: nowMs() + cooldownMs,
    warned: false,
  });
}

/**
 * Tekil cooldown anahtarını tüm shard/process'lerde temizler.
 */
export async function clearCooldown(
  redis: Redis,
  key: string,
): Promise<void> {
  localCooldowns.delete(key);
  await redis.del(key);
  await redis.publish(COOLDOWN_CLEAR_CHANNEL, key).catch(() => null);
}

/**
 * Admin benzeri toplu resetlerde pattern ile eşleşen cooldownları temizler.
 */
export async function clearCooldownPattern(
  redis: Redis,
  pattern: string,
): Promise<number> {
  let cursor = '0';
  let cleared = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;
    if (keys.length === 0) continue;
    await redis.del(...keys);
    cleared += keys.length;
    for (const key of keys) {
      localCooldowns.delete(key);
      await redis.publish(COOLDOWN_CLEAR_CHANNEL, key).catch(() => null);
    }
  } while (cursor !== '0');

  if (cleared === 0) return 0;
  return cleared;
}

/**
 * Pub/Sub mesajını işleyip local cache'i temizler.
 */
export function handleCooldownClearSignal(key: string): void {
  if (!key) return;
  localCooldowns.delete(key);
}

/**
 * Süresi dolmuş local cooldownları temizler.
 */
export function sweepCooldownCache(): number {
  const now = nowMs();
  let removed = 0;
  for (const [key, entry] of localCooldowns) {
    if (entry.expiresAtMs <= now) {
      localCooldowns.delete(key);
      removed++;
    }
  }
  return removed;
}

export function cooldownCacheSize(): number {
  return localCooldowns.size;
}
