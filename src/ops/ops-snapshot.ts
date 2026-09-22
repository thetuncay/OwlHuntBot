/**
 * ops-snapshot.ts — Periodic operational metrics blob (worker, 5 min).
 */
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { MAINTENANCE_KEY } from '../utils/admin-access';
import { getQueueHealth, getQueueJobCounts } from '../utils/db-queue';
import {
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_STALE_SEC,
} from '../utils/launch-config';
import { getTelemetrySnapshot } from '../utils/command-telemetry';
import {
  aggregateCommandRollup24h,
  getActiveUsers24h,
  getTopGuildTraffic,
  getTopUserTraffic,
} from './command-analytics';
import { getAbuseCounts24h } from './abuse-analytics';
import {
  OPS_GUILD_COUNT_KEY,
  OPS_GUILD_COUNT_TTL_SEC,
  OPS_SNAPSHOT_KEY,
  OPS_SNAPSHOT_TTL_SEC,
} from './ops-config';
import {
  collectPgOpsMetrics,
  countBannedUsers,
  countMarketRisk24h,
} from './pg-ops-metrics';

export interface OpsSnapshot {
  collectedAt: string;
  players: { total: number; active24h: number };
  guilds: { total: number };
  traffic: {
    total24h: number;
    failed24h: number;
    failRate: number;
    topCommands: { command: string; n: number; fail: number }[];
    topGuilds: { guildId: string; count: number }[];
    topUsers: { userId: string; count: number }[];
  };
  latency: { avgMs: number; p95Ms: number };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    oldestWaitingAgeSec: number | null;
    failedRecent1h: number;
    stalledHint: boolean;
  };
  redis: {
    memoryUsedMb: number | null;
    keys: number;
    connectedClients: number | null;
  };
  postgres: { connections: number; queryMs: number };
  worker: { ok: boolean; heartbeatAgeSec: number | null };
  maintenance: { enabled: boolean };
  banned: { count: number };
  abuse: import('./abuse-analytics').AbuseCounts;
  marketRisk24h: number;
  telemetry: { pending: number; droppedSinceBoot: number };
}

function parseRedisInfoMb(info: string, key: string): number | null {
  const match = info.match(new RegExp(`${key}:(\\d+)`));
  if (!match) return null;
  return Math.round((parseInt(match[1]!, 10) / (1024 * 1024)) * 10) / 10;
}

export async function collectOpsSnapshot(
  prisma: PrismaClient,
  redis: Redis,
): Promise<OpsSnapshot> {
  const [
    playerTotal,
    active24h,
    rollup,
    queueCounts,
    queueHealth,
    pgMetrics,
    marketRisk24h,
    abuse,
    topGuilds,
    topUsers,
    guildTotalRaw,
    telemetry,
  ] = await Promise.all([
    prisma.player.count().catch(() => 0),
    getActiveUsers24h(redis),
    aggregateCommandRollup24h(redis),
    getQueueJobCounts(),
    getQueueHealth(redis),
    collectPgOpsMetrics(prisma),
    countMarketRisk24h(prisma),
    getAbuseCounts24h(redis),
    getTopGuildTraffic(redis, 10),
    getTopUserTraffic(redis, 10),
    redis.get(OPS_GUILD_COUNT_KEY).catch(() => null),
    Promise.resolve(getTelemetrySnapshot()),
  ]);

  let memoryUsedMb: number | null = null;
  let connectedClients: number | null = null;
  let keys = 0;
  try {
    const info = await redis.info('memory');
    memoryUsedMb = parseRedisInfoMb(info, 'used_memory');
    const clients = await redis.info('clients');
    const m = clients.match(/connected_clients:(\d+)/);
    connectedClients = m ? parseInt(m[1]!, 10) : null;
    keys = await redis.dbsize();
  } catch {
    /* optional */
  }

  let workerOk = false;
  let heartbeatAgeSec: number | null = null;
  try {
    const raw = await redis.get(WORKER_HEARTBEAT_KEY);
    if (raw) {
      const ts = Date.parse(raw);
      if (Number.isFinite(ts)) {
        heartbeatAgeSec = Math.round((Date.now() - ts) / 1000);
        workerOk = heartbeatAgeSec <= WORKER_HEARTBEAT_STALE_SEC;
      }
    }
  } catch {
    /* optional */
  }

  let maintenanceEnabled = false;
  try {
    maintenanceEnabled = Boolean(await redis.get(MAINTENANCE_KEY));
  } catch {
    /* optional */
  }

  const bannedCount = await countBannedUsers(redis).catch(() => 0);

  const guildTotal = guildTotalRaw ? parseInt(guildTotalRaw, 10) : 0;
  const failRate =
    rollup.total > 0 ? Math.round((rollup.failed / rollup.total) * 1000) / 1000 : 0;

  return {
    collectedAt: new Date().toISOString(),
    players: { total: playerTotal, active24h },
    guilds: { total: Number.isFinite(guildTotal) ? guildTotal : 0 },
    traffic: {
      total24h: rollup.total,
      failed24h: rollup.failed,
      failRate,
      topCommands: rollup.byCommand.slice(0, 10).map((c) => ({
        command: c.field,
        n: c.n,
        fail: c.fail,
      })),
      topGuilds: topGuilds.map((g) => ({ guildId: g.id, count: g.count })),
      topUsers: topUsers.map((u) => ({ userId: u.id, count: u.count })),
    },
    latency: { avgMs: rollup.avgLatencyMs, p95Ms: rollup.p95LatencyMs },
    queue: {
      waiting: queueCounts.waiting,
      active: queueCounts.active,
      completed: queueCounts.completed,
      failed: queueCounts.failed,
      delayed: queueCounts.delayed,
      paused: queueCounts.paused,
      oldestWaitingAgeSec: queueHealth.oldestWaitingAgeSec,
      failedRecent1h: queueHealth.failedRecent1h,
      stalledHint: queueHealth.stalledHint,
    },
    redis: { memoryUsedMb, keys, connectedClients },
    postgres: pgMetrics,
    worker: { ok: workerOk, heartbeatAgeSec },
    maintenance: { enabled: maintenanceEnabled },
    banned: { count: bannedCount },
    abuse,
    marketRisk24h,
    telemetry,
  };
}

export async function persistOpsSnapshot(
  prisma: PrismaClient,
  redis: Redis,
): Promise<OpsSnapshot> {
  try {
    const snapshot = await collectOpsSnapshot(prisma, redis);
    const written = await redis.set(
      OPS_SNAPSHOT_KEY,
      JSON.stringify(snapshot),
      'EX',
      OPS_SNAPSHOT_TTL_SEC,
    );
    if (written !== 'OK') {
      console.warn('[OpsSnapshot] Redis SET ops:snapshot:v1 beklenmeyen cevap:', written);
    }
    return snapshot;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[OpsSnapshot] Toplanamadi:', msg);
    throw err;
  }
}

export async function getLatestOpsSnapshot(redis: Redis): Promise<OpsSnapshot | null> {
  try {
    const raw = await redis.get(OPS_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OpsSnapshot;
  } catch {
    return null;
  }
}

/** Shard 0 publishes total guild count for worker snapshots. */
export async function publishGuildCount(redis: Redis, total: number): Promise<void> {
  await redis
    .set(OPS_GUILD_COUNT_KEY, String(total), 'EX', OPS_GUILD_COUNT_TTL_SEC)
    .catch(() => null);
}
