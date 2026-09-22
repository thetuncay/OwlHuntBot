/**
 * ops-config.ts — Phase 1.5 observability env flags and Redis key constants.
 */
import { isProduction } from '../env';

export const OPS_SNAPSHOT_KEY = 'ops:snapshot:v1';
export const OPS_SNAPSHOT_TTL_SEC = 900;
export const OPS_GUILD_COUNT_KEY = 'ops:guilds:total';
export const OPS_GUILD_COUNT_TTL_SEC = 600;
export const OPS_GUILD_DIRECTORY_KEY = 'ops:guilds:directory:v1';
export const OPS_GUILD_DIRECTORY_TTL_SEC = 600;

function intEnvOptional(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Dedicated ops panel HTTP port (PM2 owlhuntbot-ops-panel). */
export function getOpsPanelPort(): number {
  return intEnvOptional('OPS_PANEL_PORT', 3011);
}

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultOn;
  if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no') return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

/** Lightweight rolling command analytics (default on in production). */
export function isOpsAnalyticsEnabled(): boolean {
  return envFlag('OPS_ANALYTICS', isProduction);
}

/** PG CommandEvent batch writes (default off in production). */
export function isCommandTelemetryPgEnabled(): boolean {
  return envFlag('COMMAND_TELEMETRY_PG', !isProduction);
}

export function opsCmdBucketTtlSec(): number {
  return 72 * 3600;
}

export function opsGuildHourTtlSec(): number {
  return 48 * 3600;
}

export function opsUserHourTtlSec(): number {
  return 24 * 3600;
}

export function opsHllUserTtlSec(): number {
  return 8 * 24 * 3600;
}

export function opsAbuseTtlSec(): number {
  return 8 * 24 * 3600;
}
