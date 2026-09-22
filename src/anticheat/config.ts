import { HUNT_COOLDOWN_MS } from '../config';

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultOn;
  if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no') return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

export function isAnticheatEnabled(): boolean {
  return envFlag('ANTICHEAT_ENABLED', true);
}

export function isAnticheatRateLimitEnforceEnabled(): boolean {
  return envFlag('ANTICHEAT_RATE_LIMIT_ENFORCE', true);
}

export function isAnticheatBehaviorLogEnabled(): boolean {
  return envFlag('ANTICHEAT_BEHAVIOR_LOG', true);
}

export function isAnticheatTrustScoreEnabled(): boolean {
  return envFlag('ANTICHEAT_TRUST_SCORE', true);
}

export function isAnticheatCaptchaEnforceEnabled(): boolean {
  return envFlag('ANTICHEAT_CAPTCHA_ENFORCE', false);
}

/** trustScore bu eşiğin altındaysa (enforce açıkken) challenge zorunlu. */
export const CHALLENGE_TRUST_THRESHOLD = 40;

/** Başarılı doğrulama sonrası komut engeli yok (saniye). */
export const CHALLENGE_PASS_GRACE_SEC = 3600;

/** Captcha oturum süresi (saniye) — OwO: 10 dk. */
export const CHALLENGE_TIMEOUT_SEC = 600;

/** Görsel captcha karakter sayısı. */
export const CAPTCHA_CODE_LENGTH = 4;

/** Süre dolunca kaç kez başarısız olunca ceza (OwO: 3). */
export const CAPTCHA_MAX_STRIKES = 3;

export interface CommandRateLimitConfig {
  capacity: number;
  refillMs: number;
  hardCapacity: number;
  hardWindowMs: number;
}

export const COMMAND_RATE_LIMITS: Record<string, CommandRateLimitConfig> = {
  hunt: {
    capacity: 1,
    refillMs: HUNT_COOLDOWN_MS,
    hardCapacity: 3,
    hardWindowMs: 2_000,
  },
  battle: {
    capacity: 1,
    refillMs: 3_000,
    hardCapacity: 3,
    hardWindowMs: 3_000,
  },
  duel: {
    capacity: 1,
    refillMs: 3_000,
    hardCapacity: 3,
    hardWindowMs: 3_000,
  },
  b: {
    capacity: 1,
    refillMs: 3_000,
    hardCapacity: 3,
    hardWindowMs: 3_000,
  },
  d: {
    capacity: 1,
    refillMs: 3_000,
    hardCapacity: 3,
    hardWindowMs: 3_000,
  },
  pazar: {
    capacity: 2,
    refillMs: 1_000,
    hardCapacity: 6,
    hardWindowMs: 2_000,
  },
  market: {
    capacity: 2,
    refillMs: 1_000,
    hardCapacity: 6,
    hardWindowMs: 2_000,
  },
};

export const DEFAULT_COMMAND_RATE_LIMIT: CommandRateLimitConfig = {
  capacity: 1,
  refillMs: 1_500,
  hardCapacity: 4,
  hardWindowMs: 1_500,
};

export function normalizeCommand(command: string): string {
  return command.trim().toLowerCase().slice(0, 32) || 'unknown';
}

export function resolveCommandRateLimit(command: string): CommandRateLimitConfig {
  const norm = normalizeCommand(command);
  return COMMAND_RATE_LIMITS[norm] ?? DEFAULT_COMMAND_RATE_LIMIT;
}

export function rateLimitRedisKey(userId: string, command: string): string {
  return `ratelimit:${userId}:${normalizeCommand(command)}`;
}
