/**
 * Oyuncu uyarı ve kademeli geçici ban sistemi (Redis).
 *
 * Akış: MOD_WARN_THRESHOLD uyarı → 2 saat ban → (tekrar) → 6 saat ban → 24 saat → 7 gün.
 * Spam: MOD_SPAM_STRIKES_FOR_WARN mute ihlali → 1 uyarı (varsayılan 4 mute = 1 uyarı).
 */

import type { Redis } from 'ioredis';
import {
  MOD_BAN_DURATIONS_SECONDS,
  MOD_SPAM_STRIKE_WINDOW_SECONDS,
  MOD_SPAM_STRIKES_FOR_WARN,
  MOD_WARN_LOG_MAX,
  MOD_WARN_THRESHOLD,
  SPAM_MUTE_ESCALATION_SECONDS,
  SPAM_MUTE_SECONDS,
} from '../config';
import { syncPlayerBanCache } from '../utils/ban-sync';
import { removeBannedPlayerFromLeaderboards } from './leaderboard-write';

export type ModerationSource = 'admin' | 'auto_spam';

export interface WarningRecord {
  reason: string;
  source: ModerationSource;
  issuerId?: string;
  at: string;
}

export type ModerationAction =
  | { type: 'warned'; warnCount: number; threshold: number; reason: string }
  | { type: 'banned'; durationSec: number; banTier: number; reason: string; warnCount: number };

const KEYS = {
  warnCount: (userId: string) => `mod:warn:count:${userId}`,
  banTier: (userId: string) => `mod:ban:tier:${userId}`,
  warnLog: (userId: string) => `mod:warn:log:${userId}`,
  spamViolations: (userId: string) => `mod:spam:viol:${userId}`,
};

export function formatDurationTr(totalSeconds: number): string {
  const sec = Math.max(0, Math.ceil(totalSeconds));
  if (sec < 60) return `${sec} saniye`;
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins} dakika`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours} saat ${remMins} dk` : `${hours} saat`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} gün ${remHours} saat` : `${days} gün`;
}

function banDurationForTier(tier: number): number {
  const idx = Math.min(tier, MOD_BAN_DURATIONS_SECONDS.length - 1);
  return MOD_BAN_DURATIONS_SECONDS[idx] ?? MOD_BAN_DURATIONS_SECONDS[0]!;
}

function muteDurationForStrike(strike: number): number {
  const idx = Math.min(Math.max(strike - 1, 0), SPAM_MUTE_ESCALATION_SECONDS.length - 1);
  return SPAM_MUTE_ESCALATION_SECONDS[idx] ?? SPAM_MUTE_SECONDS;
}

async function appendWarningLog(redis: Redis, userId: string, record: WarningRecord): Promise<void> {
  const key = KEYS.warnLog(userId);
  await redis.lpush(key, JSON.stringify(record));
  await redis.ltrim(key, 0, MOD_WARN_LOG_MAX - 1);
}

export async function getWarningLog(redis: Redis, userId: string): Promise<WarningRecord[]> {
  const raw = await redis.lrange(KEYS.warnLog(userId), 0, MOD_WARN_LOG_MAX - 1);
  const out: WarningRecord[] = [];
  for (const line of raw) {
    try {
      out.push(JSON.parse(line) as WarningRecord);
    } catch {
      // skip corrupt
    }
  }
  return out;
}

export async function getModerationState(redis: Redis, userId: string): Promise<{
  warnCount: number;
  banTier: number;
  nextBanDurationSec: number;
  warnings: WarningRecord[];
}> {
  const [warnCountRaw, banTierRaw, warnings] = await Promise.all([
    redis.get(KEYS.warnCount(userId)),
    redis.get(KEYS.banTier(userId)),
    getWarningLog(redis, userId),
  ]);
  const warnCount = Number.parseInt(warnCountRaw ?? '0', 10) || 0;
  const banTier = Number.parseInt(banTierRaw ?? '0', 10) || 0;
  return {
    warnCount,
    banTier,
    nextBanDurationSec: banDurationForTier(banTier),
    warnings,
  };
}

export async function applyTempBan(
  redis: Redis,
  userId: string,
  reason: string,
  durationSec: number,
): Promise<void> {
  await redis.set(`ban:${userId}`, reason, 'EX', durationSec);
  syncPlayerBanCache(userId, reason, durationSec);
  await removeBannedPlayerFromLeaderboards(redis, userId);
}

export async function applyPermanentBan(redis: Redis, userId: string, reason: string): Promise<void> {
  await redis.set(`ban:${userId}`, reason);
  syncPlayerBanCache(userId, reason);
  await removeBannedPlayerFromLeaderboards(redis, userId);
}

/**
 * Oyuncuya uyarı ver. Eşik dolunca otomatik geçici ban uygular.
 */
export async function issuePlayerWarning(
  redis: Redis,
  opts: {
    userId: string;
    reason: string;
    source: ModerationSource;
    issuerId?: string;
  },
): Promise<ModerationAction> {
  const reason = opts.reason.trim() || 'Sebep belirtilmedi';
  const record: WarningRecord = {
    reason,
    source: opts.source,
    issuerId: opts.issuerId,
    at: new Date().toISOString(),
  };
  await appendWarningLog(redis, opts.userId, record);

  const warnCount = await redis.incr(KEYS.warnCount(opts.userId));

  if (warnCount < MOD_WARN_THRESHOLD) {
    return {
      type: 'warned',
      warnCount,
      threshold: MOD_WARN_THRESHOLD,
      reason,
    };
  }

  await redis.set(KEYS.warnCount(opts.userId), '0');

  const banTier = await redis.incr(KEYS.banTier(opts.userId));
  const tierIndex = banTier - 1;
  const durationSec = banDurationForTier(tierIndex);
  const banReason =
    `Otomatik ceza (${MOD_WARN_THRESHOLD} uyarı): ${reason}`;

  await applyTempBan(redis, opts.userId, banReason, durationSec);

  return {
    type: 'banned',
    durationSec,
    banTier: tierIndex,
    reason: banReason,
    warnCount: MOD_WARN_THRESHOLD,
  };
}

export async function clearPlayerWarnings(redis: Redis, userId: string): Promise<void> {
  await redis.del(KEYS.warnCount(userId));
}

export async function resetBanTier(redis: Redis, userId: string): Promise<void> {
  await redis.del(KEYS.banTier(userId));
}

/** Spam ihlali kaydı — artan mute + otomatik uyarı. */
export async function recordSpamViolation(
  redis: Redis,
  userId: string,
): Promise<{ muteSeconds: number; moderation: ModerationAction | null }> {
  const key = KEYS.spamViolations(userId);
  const strike = await redis.incr(key);
  if (strike === 1) {
    await redis.expire(key, MOD_SPAM_STRIKE_WINDOW_SECONDS);
  }

  const muteSeconds = muteDurationForStrike(strike);

  let moderation: ModerationAction | null = null;
  if (strike >= MOD_SPAM_STRIKES_FOR_WARN && strike % MOD_SPAM_STRIKES_FOR_WARN === 0) {
    moderation = await issuePlayerWarning(redis, {
      userId,
      reason: 'Komut spam / rate limit ihlali',
      source: 'auto_spam',
    });
  }

  return { muteSeconds, moderation };
}

export function buildBanDeniedMessage(reason: string, ttlSeconds: number, appealUrl?: string | null): string {
  if (ttlSeconds > 0) {
    const base = (
      `🔨 **Geçici olarak engellendin.**\n` +
      `⏱️ Kalan: **${formatDurationTr(ttlSeconds)}**\n` +
      `📝 Sebep: **${reason}**`
    );
    return appealUrl ? `${base}\n🧾 İtiraz bağlantısı: ${appealUrl}` : base;
  }
  const base = `🔨 Bu bottan engellendin.\n📝 Sebep: **${reason}**`;
  return appealUrl ? `${base}\n🧾 İtiraz bağlantısı: ${appealUrl}` : base;
}
