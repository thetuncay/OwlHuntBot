/**
 * launch-config.ts — Controlled public launch settings (env-only, no schema).
 */
import { isProduction } from '../env';

export const WORKER_HEARTBEAT_KEY = 'ops:worker:heartbeat';
export const WORKER_HEARTBEAT_TTL_SEC = 90;
export const WORKER_HEARTBEAT_STALE_SEC = 60;

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getMaxGuilds(): number {
  return intEnv('MAX_GUILDS', 50);
}

export function getBanCacheTtlMs(): number {
  return intEnv('BAN_CACHE_TTL_MS', 300_000);
}

export function getHealthQueueFailedMax(): number {
  return intEnv('HEALTH_QUEUE_FAILED_MAX', 50);
}

/**
 * Production boot guard — ADMIN_USER_IDS required; MAX_GUILDS logged.
 */
export function validateLaunchConfig(): void {
  const maxGuilds = getMaxGuilds();
  const adminRaw = process.env.ADMIN_USER_IDS?.trim() ?? '';

  if (isProduction && !adminRaw) {
    throw new Error(
      '[Launch] ADMIN_USER_IDS is required in production. Set comma-separated Discord user IDs.',
    );
  }

  if (!adminRaw && !isProduction) {
    console.warn('[Launch] ADMIN_USER_IDS not set — admin commands will deny all users in dev.');
  }

  console.info(
    `[Launch] maxGuilds=${maxGuilds} production=${isProduction} ` +
      `adminIds=${adminRaw ? adminRaw.split(',').filter(Boolean).length : 0}`,
  );
}
