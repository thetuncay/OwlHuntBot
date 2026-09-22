import { redis } from './redis';
import {
  DAILY_SOFT_CAP_CEILING_MULT,
  DAILY_SOFT_CAP_RATE,
  LOCK_TTL_SECONDS,
} from '../config';
import { randomUUID } from 'node:crypto';

export const LOCK_BUSY_MESSAGES: Record<string, string> = {
  financial: '⏳ İşlemin devam ediyor, bitene kadar bekle.',
  hunt: '⏳ Av işlemin devam ediyor, bitene kadar bekle.',
  duel: '⏳ Düello sonuçlanıyor, bir saniye bekle.',
  sell: '⏳ Satış işlemin devam ediyor.',
  transfer: '⏳ Transfer işleniyor.',
  upgrade: '⏳ Upgrade işleniyor.',
  dismantle: '⏳ Bu eşya zaten işleniyor.',
  buff: '⏳ Buff işlemin devam ediyor.',
  quest_claim: '⏳ Ödül işleniyor.',
  daily_login: '⏳ Günlük ödül işleniyor.',
  market_buy: '⏳ Satın alma işlemin devam ediyor.',
  market_list: '⏳ İlan işlemin devam ediyor.',
  pvp: '⏳ PvP işlemin devam ediyor.',
  pvp_gamble: '⏳ Kumar işlemin devam ediyor.',
  feedback_submit: '⏳ Anket gönderimin işleniyor.',
  feedback_reward: '⏳ Ödül işleniyor.',
};

export class LockContentionError extends Error {
  constructor(
    message: string,
    readonly lockAction: string,
  ) {
    super(message);
    this.name = 'LockContentionError';
  }
}

function lockBusyMessage(action: string): string {
  return LOCK_BUSY_MESSAGES[action] ?? LOCK_BUSY_MESSAGES.financial!;
}

// Lua script: token eşleşiyorsa sil, yoksa 0 döndür (atomic compare-and-delete)
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

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

export async function acquireResourceLock(key: string): Promise<string | null> {
  const token = randomUUID();
  const result = await redis.set(key, token, 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK' ? token : null;
}

export async function releaseLock(playerId: string, action: string, token: string): Promise<void> {
  const key = `lock:${playerId}:${action}`;
  await redis.eval(RELEASE_SCRIPT, 1, key, token);
}

export async function releaseResourceLock(key: string, token: string): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, 1, key, token);
}

export async function withLock<T>(
  playerId: string,
  action: string,
  fn: () => Promise<T>,
  busyMessage?: string,
): Promise<T> {
  const token = await acquireLock(playerId, action);
  if (!token) {
    throw new LockContentionError(busyMessage ?? lockBusyMessage(action), action);
  }
  try {
    return await fn();
  } finally {
    releaseLock(playerId, action, token).catch(() => null);
  }
}

export async function withResourceLock<T>(
  key: string,
  fn: () => Promise<T>,
  busyMessage?: string,
): Promise<T> {
  const token = await acquireResourceLock(key);
  if (!token) {
    throw new LockContentionError(busyMessage ?? lockBusyMessage('financial'), 'resource');
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

export async function withOrderedResourceLocks<T>(
  keys: string[],
  fn: () => Promise<T>,
  busyMessage?: string,
): Promise<T> {
  const orderedKeys = [...new Set(keys)].sort();
  const heldLocks: HeldResourceLock[] = [];

  try {
    for (const key of orderedKeys) {
      const token = await acquireResourceLock(key);
      if (!token) {
        throw new LockContentionError(busyMessage ?? lockBusyMessage('financial'), 'resource');
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

/** Atomik pvp:active kilidi — SET NX EX */
export async function acquirePvpActiveLock(redis: import('ioredis').Redis, userId: string, ttlSec: number): Promise<boolean> {
  const key = `pvp:active:${userId}`;
  const result = await redis.set(key, '1', 'EX', ttlSec, 'NX');
  return result === 'OK';
}

/**
 * Duel gunluk coin cap — atomik INCRBY + softening (I4).
 *
 * Soft cap'e kadar ödül tam verilir. Sonrasında **sıfırlanmaz**, `rate`
 * oranında devam eder; mutlak tavana (`ceil`) kadar. Böylece oyuncu "bu yeter"
 * duvarına çarpmak yerine "bugün için doyum noktası" hissi alır, ama farming
 * de sınırsız kalmaz.
 *
 * Tek istek soft cap sınırını aşabilir; bu yüzden tam ve azaltılmış kısımlar
 * ayrı ayrı hesaplanır.
 */
const DUEL_DAILY_CAP_LUA = `
local key = KEYS[1]
local add = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local rate = tonumber(ARGV[4])
local ceil = tonumber(ARGV[5])
local cur = tonumber(redis.call('GET', key) or '0')
if add <= 0 then return 0 end
if cur >= ceil then return 0 end

local grant = 0
local remaining = add

-- 1) Soft cap'e kadar tam oran
if cur < cap then
  local full = cap - cur
  if full > remaining then full = remaining end
  grant = grant + full
  remaining = remaining - full
  cur = cur + full
end

-- 2) Soft cap ustu azaltilmis oran, mutlak tavana kadar
if remaining > 0 and cur < ceil then
  local soft = math.floor(remaining * rate)
  local room = ceil - cur
  if soft > room then soft = room end
  if soft > 0 then grant = grant + soft end
end

if grant <= 0 then return 0 end
redis.call('INCRBY', key, grant)
redis.call('EXPIRE', key, ttl)
return grant
`;

/**
 * Günlük coin kazancını soft cap + softening ile kredilendirir.
 *
 * @param redis Redis bağlantısı
 * @param dailyKey Günlük sayaç anahtarı
 * @param requested Talep edilen brüt miktar
 * @param cap Soft cap — bu noktaya kadar tam ödeme
 * @param ttlSec Sayaç ömrü
 * @param rate Soft cap üstü ödeme oranı (0–1)
 * @param ceiling Mutlak tavan — kredilendirilen toplam bunu geçmez
 * @returns Gerçekten kredilendirilen miktar
 */
export async function grantDuelDailyCoins(
  redis: import('ioredis').Redis,
  dailyKey: string,
  requested: number,
  cap: number,
  ttlSec: number,
  rate: number = DAILY_SOFT_CAP_RATE,
  ceiling: number = Math.floor(cap * DAILY_SOFT_CAP_CEILING_MULT),
): Promise<number> {
  const grant = await redis.eval(
    DUEL_DAILY_CAP_LUA,
    1,
    dailyKey,
    String(requested),
    String(cap),
    String(ttlSec),
    String(rate),
    String(ceiling),
  ) as number;
  return typeof grant === 'number' ? grant : 0;
}
