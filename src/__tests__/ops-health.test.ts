import { describe, it, expect } from 'vitest';
import { healthHttpStatus } from '../utils/ops-health';
import type { OpsHealthReport } from '../utils/ops-health';

function minimalReport(status: OpsHealthReport['status']): OpsHealthReport {
  return {
    status,
    legacyStatus: status === 'critical' ? 'unhealthy' : status === 'warning' ? 'degraded' : 'ok',
    reasons: [],
    uptimeSec: 0,
    timestamp: new Date().toISOString(),
    process: { role: 'test', nodeEnv: 'test', shardCount: 0 },
    checks: {
      redis: { ok: true, latencyMs: 1, memoryUsedMb: null, memoryMaxMb: null, connectedClients: null },
      worker: { ok: true, lastHeartbeatAt: null, ageSec: null, staleThresholdSec: 60 },
      queue: {
        ok: true,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
        oldestWaitingAgeSec: null,
        failedRecent1h: 0,
        stalledHint: false,
      },
      discord: { ok: true, readyShards: 0, totalShards: 0 },
      guilds: { total: 0, maxGuilds: 50, atCap: false },
      gates: { commandsInflight: 0, maxConcurrentCommands: 40 },
      telemetry: { pendingEvents: 0, droppedSinceBoot: 0 },
      maintenance: { enabled: false },
      banCache: { entries: 0, lastWarmAt: null },
    },
    traffic: { total24h: null, failed24h: null, failRate: null },
    latency: { avgMs: null, p95Ms: null },
    abuse: null,
    readiness: { score: 90, level: 'SAFE', reasons: [] },
    snapshot: null,
    failures: [],
  };
}

describe('healthHttpStatus', () => {
  it('returns 503 for critical', () => {
    expect(healthHttpStatus(minimalReport('critical'))).toBe(503);
  });

  it('returns 200 for healthy and warning', () => {
    expect(healthHttpStatus(minimalReport('healthy'))).toBe(200);
    expect(healthHttpStatus(minimalReport('warning'))).toBe(200);
  });
});
