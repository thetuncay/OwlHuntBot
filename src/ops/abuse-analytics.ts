/**
 * abuse-analytics.ts — Observe-only abuse / rate-limit counters (no auto-punish).
 */
import type { Redis } from 'ioredis';
import { opsAbuseTtlSec } from './ops-config';

export type AbuseSignal =
  | 'spam_mute_new'
  | 'spam_mute_active'
  | 'rate_limit'
  | 'gate_rejected'
  | 'transfer_limit'
  | 'abuse_throttle'
  | 'abuse_flood'
  | 'abuse_same_cmd'
  | 'abuse_automation';

function dateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${d}`;
}

function abuseKey(signal: AbuseSignal, date = new Date()): string {
  return `ops:abuse:${signal}:${dateKey(date)}`;
}

/** Increment a daily abuse counter (non-blocking). */
export function recordAbuseSignal(redis: Redis, signal: AbuseSignal): void {
  const key = abuseKey(signal);
  void redis
    .multi()
    .incr(key)
    .expire(key, opsAbuseTtlSec())
    .exec()
    .catch(() => null);
}

export interface AbuseCounts {
  spamMuteNew: number;
  spamMuteActive: number;
  rateLimit: number;
  gateRejected: number;
  transferLimit: number;
  abuseThrottle: number;
  abuseFlood: number;
  abuseSameCmd: number;
  abuseAutomation: number;
}

export async function getAbuseCounts24h(redis: Redis): Promise<AbuseCounts> {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);

  const signals: [keyof AbuseCounts, AbuseSignal][] = [
    ['spamMuteNew', 'spam_mute_new'],
    ['spamMuteActive', 'spam_mute_active'],
    ['rateLimit', 'rate_limit'],
    ['gateRejected', 'gate_rejected'],
    ['transferLimit', 'transfer_limit'],
    ['abuseThrottle', 'abuse_throttle'],
    ['abuseFlood', 'abuse_flood'],
    ['abuseSameCmd', 'abuse_same_cmd'],
    ['abuseAutomation', 'abuse_automation'],
  ];

  const out: AbuseCounts = {
    spamMuteNew: 0,
    spamMuteActive: 0,
    rateLimit: 0,
    gateRejected: 0,
    transferLimit: 0,
    abuseThrottle: 0,
    abuseFlood: 0,
    abuseSameCmd: 0,
    abuseAutomation: 0,
  };

  for (const [field, signal] of signals) {
    const [t, y] = await Promise.all([
      redis.get(abuseKey(signal, today)).catch(() => null),
      redis.get(abuseKey(signal, yesterday)).catch(() => null),
    ]);
    out[field] = (parseInt(t ?? '0', 10) || 0) + (parseInt(y ?? '0', 10) || 0);
  }

  return out;
}

/** Record transfer limit / validation failures (observe-only). */
export function recordTransferLimitHit(redis: Redis): void {
  recordAbuseSignal(redis, 'transfer_limit');
}

export function isTransferLimitMessage(message: string): boolean {
  return (
    message.includes('Günlük transfer limitine') ||
    message.includes('günlük alım limitine') ||
    message.includes('Minimum transfer')
  );
}
