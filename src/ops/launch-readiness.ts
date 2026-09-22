/**
 * launch-readiness.ts — Advisory launch score (SAFE / CAUTION / BLOCKED).
 */
import type { OpsHealthReport } from '../utils/ops-health';
import type { OpsSnapshot } from './ops-snapshot';

export type ReadinessLevel = 'SAFE' | 'CAUTION' | 'BLOCKED';

export interface LaunchReadinessResult {
  score: number;
  level: ReadinessLevel;
  reasons: string[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Weighted advisory score — never blocks gameplay.
 */
export function evaluateLaunchReadiness(
  health: OpsHealthReport,
  snapshot: OpsSnapshot | null,
): LaunchReadinessResult {
  const reasons: string[] = [];
  let score = 0;

  // Redis (15)
  if (health.checks.redis.ok) {
    const used = health.checks.redis.memoryUsedMb;
    const max = health.checks.redis.memoryMaxMb;
    if (used != null && max != null && max > 0) {
      const pct = used / max;
      if (pct > 0.9) {
        score += 5;
        reasons.push('redis:memory>90%');
      } else if (pct > 0.8) {
        score += 10;
        reasons.push('redis:memory>80%');
      } else {
        score += 15;
      }
    } else {
      score += 12;
    }
  } else {
    reasons.push('redis:down');
  }

  // Worker (15)
  if (health.checks.worker.ok) {
    score += 15;
  } else {
    reasons.push('worker:heartbeat_stale');
  }

  // Queue (15)
  const q = health.checks.queue;
  if (q.ok && q.waiting < 500) {
    score += 15;
  } else if (q.waiting < 2000) {
    score += 8;
    reasons.push('queue:backlog');
  } else {
    reasons.push('queue:critical_backlog');
  }
  if (q.failed > 0) {
    score -= Math.min(10, Math.floor(q.failed / 10));
    reasons.push(`queue:failed=${q.failed}`);
  }

  // Command fail rate 24h (15)
  const traffic = snapshot?.traffic;
  if (traffic && traffic.total24h > 0) {
    const failRate = traffic.failed24h / traffic.total24h;
    if (failRate > 0.15) {
      reasons.push(`commands:fail_rate=${(failRate * 100).toFixed(1)}%`);
    } else if (failRate > 0.05) {
      score += 8;
      reasons.push(`commands:fail_rate=${(failRate * 100).toFixed(1)}%`);
    } else {
      score += 15;
    }
  } else {
    score += 10;
  }

  // Latency p95 (15)
  const p95 = snapshot?.latency?.p95Ms ?? 0;
  if (p95 > 5000) {
    reasons.push(`latency:p95=${p95}ms`);
  } else if (p95 > 2000) {
    score += 8;
    reasons.push(`latency:p95=${p95}ms`);
  } else if (p95 > 0) {
    score += 15;
  } else {
    score += 12;
  }

  // Guild cap (10)
  const g = health.checks.guilds;
  if (g.atCap) {
    score += 5;
    reasons.push('guilds:at_cap');
  } else if (g.total > g.maxGuilds) {
    reasons.push('guilds:over_cap');
  } else {
    score += 10;
  }

  // PG (10) — only fail when snapshot ran and probe returned -1
  const pgConn = snapshot?.postgres?.connections;
  if (pgConn === undefined) {
    score += 8;
  } else if (pgConn < 0) {
    score += 5;
    reasons.push('postgres:probe_failed');
  } else if (pgConn > 80) {
    score += 5;
    reasons.push(`postgres:connections=${pgConn}`);
  } else {
    score += 10;
  }

  // Telemetry / redis keys (5)
  if (health.checks.telemetry.droppedSinceBoot > 100) {
    reasons.push(`telemetry:dropped=${health.checks.telemetry.droppedSinceBoot}`);
    score += 1;
  } else {
    score += 3;
  }
  const dbSize = snapshot?.redis?.keys ?? 0;
  if (dbSize > 500_000) {
    reasons.push(`redis:keys=${dbSize}`);
    score += 0;
  } else {
    score += 2;
  }

  score = clamp(score, 0, 100);

  let level: ReadinessLevel = 'SAFE';
  if (
    !health.checks.redis.ok ||
    !health.checks.worker.ok ||
    g.total > g.maxGuilds ||
    q.failed > 200
  ) {
    level = 'BLOCKED';
  } else if (score < 75 || reasons.length >= 3) {
    level = 'CAUTION';
  }

  return { score, level, reasons: [...new Set(reasons)] };
}
