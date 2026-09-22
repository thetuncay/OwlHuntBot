import { describe, it, expect } from 'vitest';
import { evaluateLaunchReadiness } from '../ops/launch-readiness';
import type { OpsHealthReport } from '../utils/ops-health';

function healthyReport(): OpsHealthReport {
  return {
    status: 'healthy',
    legacyStatus: 'ok',
    reasons: [],
    uptimeSec: 100,
    timestamp: new Date().toISOString(),
    process: { role: 'test', nodeEnv: 'test', shardCount: 1 },
    checks: {
      redis: { ok: true, latencyMs: 1, memoryUsedMb: 10, memoryMaxMb: 100, connectedClients: 2 },
      worker: { ok: true, lastHeartbeatAt: new Date().toISOString(), ageSec: 5, staleThresholdSec: 60 },
      queue: {
        ok: true,
        waiting: 0,
        active: 1,
        completed: 100,
        failed: 0,
        delayed: 0,
        paused: 0,
        oldestWaitingAgeSec: null,
        failedRecent1h: 0,
        stalledHint: false,
      },
      discord: { ok: true, readyShards: 1, totalShards: 1 },
      guilds: { total: 5, maxGuilds: 50, atCap: false },
      gates: { commandsInflight: 0, maxConcurrentCommands: 40 },
      telemetry: { pendingEvents: 0, droppedSinceBoot: 0 },
      maintenance: { enabled: false },
      banCache: { entries: 0, lastWarmAt: null },
    },
    traffic: { total24h: 1000, failed24h: 10, failRate: 0.01 },
    latency: { avgMs: 50, p95Ms: 200 },
    abuse: null,
    readiness: { score: 0, level: 'SAFE', reasons: [] },
    snapshot: null,
    failures: [],
  };
}

describe('launch-readiness', () => {
  it('returns SAFE with high score when healthy', () => {
    const health = healthyReport();
    const result = evaluateLaunchReadiness(health, {
      collectedAt: new Date().toISOString(),
      players: { total: 100, active24h: 50 },
      guilds: { total: 5 },
      traffic: {
        total24h: 1000,
        failed24h: 10,
        failRate: 0.01,
        topCommands: [],
        topGuilds: [],
        topUsers: [],
      },
      latency: { avgMs: 50, p95Ms: 200 },
      queue: {
        waiting: 0,
        active: 1,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
        oldestWaitingAgeSec: null,
        failedRecent1h: 0,
        stalledHint: false,
      },
      redis: { memoryUsedMb: 10, keys: 1000, connectedClients: 2 },
      postgres: { connections: 5, queryMs: 2 },
      worker: { ok: true, heartbeatAgeSec: 5 },
      maintenance: { enabled: false },
      banned: { count: 0 },
      abuse: {
        spamMuteNew: 0,
        spamMuteActive: 0,
        rateLimit: 0,
        gateRejected: 0,
        transferLimit: 0,
        abuseThrottle: 0,
        abuseFlood: 0,
        abuseSameCmd: 0,
        abuseAutomation: 0,
      },
      marketRisk24h: 0,
      telemetry: { pending: 0, droppedSinceBoot: 0 },
    });
    expect(result.level).toBe('SAFE');
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('returns BLOCKED when redis down', () => {
    const health = healthyReport();
    health.checks.redis.ok = false;
    const result = evaluateLaunchReadiness(health, null);
    expect(result.level).toBe('BLOCKED');
  });

  it('does not flag postgres when snapshot is missing', () => {
    const health = healthyReport();
    const result = evaluateLaunchReadiness(health, null);
    expect(result.reasons).not.toContain('postgres:probe_failed');
  });
});
