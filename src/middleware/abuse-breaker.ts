import type { Redis } from 'ioredis';
import {
  ABUSE_RAW_REQUESTS,
  ABUSE_SAME_COMMAND,
  ABUSE_THROTTLE_SECONDS,
  ABUSE_WINDOW_SECONDS,
} from '../config';
import { buildSpamMuteMessage, SpamBlockedError } from '../utils/command-error';
import { recordAbuseSignal } from '../ops/abuse-analytics';
import { warnRedisDegradation } from '../utils/redis-degradation';

const RAW_KEY = (userId: string) => `abuse:raw:${userId}`;
const CMD_KEY = (userId: string, cmd: string) => `abuse:cmd:${userId}:${cmd}`;
const THROTTLE_KEY = (userId: string) => `abuse:throttle:${userId}`;
const STRIKE_KEY = (userId: string) => `abuse:strike:${userId}`;

const INCR_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

async function incrWindow(redis: Redis, key: string, windowSec: number): Promise<number> {
  const result = await redis.eval(INCR_WINDOW_LUA, 1, key, String(windowSec)) as number;
  return result;
}

async function readWindowCount(redis: Redis, key: string): Promise<number> {
  const raw = await redis.get(key);
  return parseInt(raw ?? '0', 10) || 0;
}

function normalizeCmd(command: string): string {
  return command.trim().toLowerCase().slice(0, 32) || 'unknown';
}

function throttleDurationForStrike(strike: number): number {
  const idx = Math.min(Math.max(strike - 1, 0), ABUSE_THROTTLE_SECONDS.length - 1);
  return ABUSE_THROTTLE_SECONDS[idx] ?? ABUSE_THROTTLE_SECONDS[0]!;
}

export interface AbuseCheckContext {
  userId: string;
  command: string;
  displayName?: string;
}

/**
 * Pre-handler: aktif throttle + pencere dolu mu (INCR yok).
 * Cooldown / lock / inflight reject'leri buraya gelmeden once pipeline tarafinda elenir.
 */
export async function assertAbuseThrottleGate(
  redis: Redis,
  ctx: AbuseCheckContext,
): Promise<void> {
  const displayName = ctx.displayName?.trim() || 'Sen';
  try {
    const throttleKey = THROTTLE_KEY(ctx.userId);
    const throttleTtl = await redis.ttl(throttleKey);
    if (throttleTtl > 0) {
      recordAbuseSignal(redis, 'abuse_throttle');
      throw new SpamBlockedError(
        buildSpamMuteMessage(displayName, throttleTtl),
        false,
      );
    }

    const rawCount = await readWindowCount(redis, RAW_KEY(ctx.userId));
    const cmdNorm = normalizeCmd(ctx.command);
    const cmdCount = await readWindowCount(redis, CMD_KEY(ctx.userId, cmdNorm));

    if (rawCount >= ABUSE_RAW_REQUESTS) {
      recordAbuseSignal(redis, 'abuse_flood');
      throw new SpamBlockedError(
        `⏱️ | **${displayName}**, cok hizli komut gonderiyorsun. Lutfen ${ABUSE_WINDOW_SECONDS} saniye bekleyip tekrar dene.`,
        false,
      );
    }

    if (cmdCount >= ABUSE_SAME_COMMAND) {
      recordAbuseSignal(redis, 'abuse_same_cmd');
      throw new SpamBlockedError(
        `⏱️ | **${displayName}**, ayni komutu cok hizli tekrarliyorsun. Kisa bir mola ver~`,
        false,
      );
    }
  } catch (err) {
    if (err instanceof SpamBlockedError) throw err;
    warnRedisDegradation('assertAbuseThrottleGate', err);
  }
}

/**
 * Post-success: yalnizca basarili handler sonrasi sayac artir.
 * Limit asilirsa sonraki istekler icin throttle uygular (mevcut istek zaten tamamlandi).
 */
export async function recordAbuseAccountingOnSuccess(
  redis: Redis,
  ctx: AbuseCheckContext,
): Promise<void> {
  try {
    const cmdNorm = normalizeCmd(ctx.command);
    const rawCount = await incrWindow(redis, RAW_KEY(ctx.userId), ABUSE_WINDOW_SECONDS);
    const cmdCount = await incrWindow(redis, CMD_KEY(ctx.userId, cmdNorm), ABUSE_WINDOW_SECONDS);

    if (rawCount > ABUSE_RAW_REQUESTS) {
      recordAbuseSignal(redis, 'abuse_flood');
      await applyThrottle(redis, ctx.userId);
    }

    if (cmdCount > ABUSE_SAME_COMMAND) {
      recordAbuseSignal(redis, 'abuse_same_cmd');
      await applyThrottle(redis, ctx.userId);
    }
  } catch (err) {
    warnRedisDegradation('recordAbuseAccountingOnSuccess', err);
  }
}

/** @deprecated assertAbuseThrottleGate + recordAbuseAccountingOnSuccess kullanin. */
export async function enforceAbuseBreaker(
  redis: Redis,
  ctx: AbuseCheckContext,
): Promise<void> {
  await assertAbuseThrottleGate(redis, ctx);
  await recordAbuseAccountingOnSuccess(redis, ctx);
}

async function applyThrottle(redis: Redis, userId: string): Promise<void> {
  const strike = await redis.incr(STRIKE_KEY(userId));
  if (strike === 1) {
    await redis.expire(STRIKE_KEY(userId), 3600);
  }
  const seconds = throttleDurationForStrike(strike);
  await redis.set(THROTTLE_KEY(userId), '1', 'EX', seconds);
  recordAbuseSignal(redis, 'abuse_throttle');
}

/** AutomationSuspicion — flow-intent tarafindan cagrilir. */
export async function applyAutomationThrottle(redis: Redis, userId: string): Promise<void> {
  try {
    recordAbuseSignal(redis, 'abuse_automation');
    await applyThrottle(redis, userId);
  } catch (err) {
    warnRedisDegradation('applyAutomationThrottle', err);
  }
}
