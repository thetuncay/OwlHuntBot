/**
 * VDS MAX profili — .env ile ayarlanır.
 *
 * Hedef: 12 GB / 6 çekirdek VDS'in ~%98'i (OS için ~256 MB bırakılır)
 *   Bot ~5.25 GB | PostgreSQL ~3.75 GB | Redis ~2.5 GB
 */

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const RUNTIME = {
  dbConnectionLimit: intEnv('DB_CONNECTION_LIMIT', 200),
  dbPoolTimeoutSec: intEnv('DB_POOL_TIMEOUT_SEC', 45),
  dbQueueConcurrency: intEnv('DB_QUEUE_CONCURRENCY', 64),
  playerCacheTtlSec: intEnv('PLAYER_CACHE_TTL_S', 120),
  maintenanceBatchSize: intEnv('MAINTENANCE_BATCH_SIZE', 2000),
  discordCacheMessages: intEnv('DISCORD_CACHE_MESSAGES', 3000),
  discordCacheUsers: intEnv('DISCORD_CACHE_USERS', 50000),
  discordCacheMembers: intEnv('DISCORD_CACHE_MEMBERS', 10000),
  discordMessageSweepLifetimeSec: intEnv('DISCORD_MSG_SWEEP_SEC', 14400),
} as const;
