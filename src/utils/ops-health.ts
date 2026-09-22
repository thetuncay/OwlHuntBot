/**
 * ops-health.ts — Lightweight ops health collector for /health and startup logs.
 */
import type { ShardingManager } from 'discord.js';
import type { Redis } from 'ioredis';
import { MAX_CONCURRENT_COMMANDS } from '../config';
import { getAbuseCounts24h } from '../ops/abuse-analytics';
import { evaluateLaunchReadiness } from '../ops/launch-readiness';
import { getLatestOpsSnapshot } from '../ops/ops-snapshot';
import { getBanCacheStats } from './ban-cache';
import {
  getHealthQueueFailedMax,
  getMaxGuilds,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_STALE_SEC,
} from './launch-config';
import { MAINTENANCE_KEY } from './admin-access';
import { getQueueHealth, getQueueJobCounts } from './db-queue';
import { getTelemetrySnapshot } from './command-telemetry';

const INFLIGHT_KEY = 'gate:commands:inflight';

/** Legacy status (backward compatible). */
export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

/** Phase 1.5 top-level health status. */
export type OpsStatus = 'healthy' | 'warning' | 'critical';

export interface OpsHealthReport {
  status: OpsStatus;
  legacyStatus: HealthStatus;
  reasons: string[];
  uptimeSec: number;
  timestamp: string;
  process: {
    role: string;
    nodeEnv: string;
    shardCount: number;
  };
  checks: {
    redis: {
      ok: boolean;
      latencyMs: number;
      memoryUsedMb: number | null;
      memoryMaxMb: number | null;
      connectedClients: number | null;
    };
    worker: {
      ok: boolean;
      lastHeartbeatAt: string | null;
      ageSec: number | null;
      staleThresholdSec: number;
    };
    queue: {
      ok: boolean;
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
    discord: {
      ok: boolean;
      readyShards: number;
      totalShards: number;
    };
    guilds: {
      total: number;
      maxGuilds: number;
      atCap: boolean;
    };
    gates: {
      commandsInflight: number;
      maxConcurrentCommands: number;
    };
    telemetry: {
      pendingEvents: number;
      droppedSinceBoot: number;
    };
    maintenance: {
      enabled: boolean;
    };
    banCache: {
      entries: number;
      lastWarmAt: string | null;
    };
  };
  traffic: {
    total24h: number | null;
    failed24h: number | null;
    failRate: number | null;
  };
  latency: {
    avgMs: number | null;
    p95Ms: number | null;
  };
  abuse: import('../ops/abuse-analytics').AbuseCounts | null;
  readiness: import('../ops/launch-readiness').LaunchReadinessResult;
  snapshot: import('../ops/ops-snapshot').OpsSnapshot | null;
  failures: string[];
}

function parseRedisInfoMb(info: string, key: string): number | null {
  const match = info.match(new RegExp(`${key}:(\\d+)`));
  if (!match) return null;
  const bytes = parseInt(match[1]!, 10);
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

async function getGuildTotalFromManager(manager: ShardingManager): Promise<number> {
  try {
    const counts = await manager.broadcastEval((c) => c.guilds.cache.size) as number[];
    return counts.reduce((sum, n) => sum + n, 0);
  } catch {
    return 0;
  }
}

function countReadyShards(manager: ShardingManager): number {
  let ready = 0;
  for (const shard of manager.shards.values()) {
    if (shard.ready) ready++;
  }
  return ready;
}

function deriveOpsStatus(
  legacy: HealthStatus,
  readiness: import('../ops/launch-readiness').LaunchReadinessResult,
  queueStalled: boolean,
): OpsStatus {
  if (legacy === 'unhealthy' || readiness.level === 'BLOCKED') return 'critical';
  if (legacy === 'degraded' || readiness.level === 'CAUTION' || queueStalled) return 'warning';
  return 'healthy';
}

export async function collectOpsHealth(
  redis: Redis,
  manager?: ShardingManager | null,
): Promise<OpsHealthReport> {
  const failures: string[] = [];
  const reasons: string[] = [];
  const maxGuilds = getMaxGuilds();
  const failedMax = getHealthQueueFailedMax();
  const telemetry = getTelemetrySnapshot();
  const banCache = getBanCacheStats();
  const snapshot = await getLatestOpsSnapshot(redis);

  let redisOk = false;
  let latencyMs = -1;
  let memoryUsedMb: number | null = null;
  let memoryMaxMb: number | null = null;
  let connectedClients: number | null = null;

  const pingStart = Date.now();
  try {
    const pong = await redis.ping();
    latencyMs = Date.now() - pingStart;
    redisOk = pong === 'PONG';
    if (!redisOk) {
      failures.push('redis:ping');
      reasons.push('Redis ping failed');
    }
  } catch {
    latencyMs = Date.now() - pingStart;
    failures.push('redis:ping');
    reasons.push('Redis unreachable');
  }

  if (redisOk) {
    try {
      const info = await redis.info('memory');
      memoryUsedMb = parseRedisInfoMb(info, 'used_memory');
      const maxBytes = parseRedisInfoMb(info, 'maxmemory');
      memoryMaxMb = maxBytes && maxBytes > 0 ? maxBytes : null;
      if (memoryUsedMb != null && memoryMaxMb != null && memoryMaxMb > 0) {
        const pct = memoryUsedMb / memoryMaxMb;
        if (pct > 0.9) reasons.push(`Redis memory ${Math.round(pct * 100)}% of max`);
        else if (pct > 0.8) reasons.push(`Redis memory ${Math.round(pct * 100)}% of max`);
      }
    } catch {
      /* optional */
    }
    try {
      const clients = await redis.info('clients');
      const m = clients.match(/connected_clients:(\d+)/);
      connectedClients = m ? parseInt(m[1]!, 10) : null;
    } catch {
      /* optional */
    }
  }

  let workerOk = false;
  let lastHeartbeatAt: string | null = null;
  let ageSec: number | null = null;

  try {
    const raw = await redis.get(WORKER_HEARTBEAT_KEY);
    if (raw) {
      lastHeartbeatAt = raw;
      const ts = Date.parse(raw);
      if (Number.isFinite(ts)) {
        ageSec = Math.round((Date.now() - ts) / 1000);
        workerOk = ageSec <= WORKER_HEARTBEAT_STALE_SEC;
      }
    }
    if (!workerOk) {
      failures.push('worker:heartbeat');
      reasons.push('Worker heartbeat stale or missing');
    }
  } catch {
    failures.push('worker:heartbeat');
    reasons.push('Worker heartbeat check failed');
  }

  let queueCounts = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
  };
  let queueHealth = {
    oldestWaitingAgeSec: null as number | null,
    failedRecent1h: 0,
    stalledHint: false,
  };
  try {
    queueCounts = await getQueueJobCounts();
    queueHealth = await getQueueHealth(redis);
  } catch {
    failures.push('queue:counts');
    reasons.push('Queue metrics unavailable');
  }
  const queueOk = queueCounts.failed <= failedMax;
  if (!queueOk) {
    failures.push(`queue:failed>${failedMax}`);
    reasons.push(`BullMQ failed jobs: ${queueCounts.failed}`);
  }
  if (queueHealth.stalledHint) {
    reasons.push('Queue backlog with no active workers');
  }
  if (queueCounts.waiting > 200) {
    reasons.push(`Queue waiting: ${queueCounts.waiting}`);
  }

  const totalShards = manager?.shards.size ?? 0;
  const readyShards = manager ? countReadyShards(manager) : 0;
  const uptimeSec = Math.floor(process.uptime());
  const startupGraceSec = 90;
  const discordOk =
    totalShards === 0 ||
    readyShards === totalShards ||
    (uptimeSec < startupGraceSec && totalShards > 0);
  if (!discordOk) {
    reasons.push(`Discord shards ${readyShards}/${totalShards} ready`);
  }

  let guildTotal = snapshot?.guilds.total ?? 0;
  if (manager) {
    guildTotal = await getGuildTotalFromManager(manager);
  }
  const guildsOverCap = guildTotal > maxGuilds;
  if (guildsOverCap) {
    failures.push('guilds:over_cap');
    reasons.push(`Guild count ${guildTotal} exceeds cap ${maxGuilds}`);
  }
  if (guildTotal >= maxGuilds) reasons.push('Guild cap reached');

  let commandsInflight = 0;
  try {
    const raw = await redis.get(INFLIGHT_KEY);
    commandsInflight = raw ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(commandsInflight)) commandsInflight = 0;
  } catch {
    /* optional */
  }

  let maintenanceEnabled = false;
  try {
    maintenanceEnabled = Boolean(await redis.get(MAINTENANCE_KEY));
  } catch {
    /* optional */
  }
  if (maintenanceEnabled) reasons.push('Maintenance mode enabled');

  let legacyStatus: HealthStatus = 'ok';
  const discordReady = totalShards === 0 || readyShards === totalShards;
  if (!redisOk || !workerOk || guildsOverCap) {
    legacyStatus = 'unhealthy';
  } else if (!queueOk || (!discordReady && uptimeSec >= startupGraceSec)) {
    legacyStatus = 'degraded';
  }

  const abuse = await getAbuseCounts24h(redis).catch(() => null);

  const partialForReadiness: OpsHealthReport = {
    status: 'healthy',
    legacyStatus,
    reasons: [],
    uptimeSec,
    timestamp: new Date().toISOString(),
    process: {
      role:
        process.env.RUN_MODE === 'ops-panel'
          ? 'ops-panel'
          : manager
            ? 'shard-manager'
            : 'bot',
      nodeEnv: process.env.NODE_ENV ?? 'development',
      shardCount: totalShards,
    },
    checks: {
      redis: {
        ok: redisOk,
        latencyMs,
        memoryUsedMb,
        memoryMaxMb,
        connectedClients,
      },
      worker: { ok: workerOk, lastHeartbeatAt, ageSec, staleThresholdSec: WORKER_HEARTBEAT_STALE_SEC },
      queue: { ok: queueOk, ...queueCounts, ...queueHealth },
      discord: { ok: discordOk, readyShards, totalShards },
      guilds: { total: guildTotal, maxGuilds, atCap: guildTotal >= maxGuilds },
      gates: { commandsInflight, maxConcurrentCommands: MAX_CONCURRENT_COMMANDS },
      telemetry: {
        pendingEvents: telemetry.pending,
        droppedSinceBoot: telemetry.droppedSinceBoot,
      },
      maintenance: { enabled: maintenanceEnabled },
      banCache: { entries: banCache.entries, lastWarmAt: banCache.lastWarmAt },
    },
    traffic: {
      total24h: snapshot?.traffic.total24h ?? null,
      failed24h: snapshot?.traffic.failed24h ?? null,
      failRate: snapshot?.traffic.failRate ?? null,
    },
    latency: {
      avgMs: snapshot?.latency.avgMs ?? null,
      p95Ms: snapshot?.latency.p95Ms ?? null,
    },
    abuse,
    readiness: { score: 0, level: 'SAFE', reasons: [] },
    snapshot,
    failures,
  };

  const readiness = evaluateLaunchReadiness(partialForReadiness, snapshot);
  reasons.push(...readiness.reasons);

  const status = deriveOpsStatus(legacyStatus, readiness, queueHealth.stalledHint);

  if (telemetry.droppedSinceBoot > 0) {
    reasons.push(`Telemetry dropped: ${telemetry.droppedSinceBoot}`);
  }

  return {
    ...partialForReadiness,
    status,
    reasons: [...new Set(reasons)],
    readiness,
  };
}

export function healthHttpStatus(report: OpsHealthReport): number {
  return report.status === 'critical' ? 503 : 200;
}
