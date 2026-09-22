/**
 * admin-ops-views.ts — Read-only Discord ops summaries for /admin sys ops.
 */
import type { Redis } from 'ioredis';
import type { OpsSnapshot } from './ops-snapshot';
import { getLatestOpsSnapshot } from './ops-snapshot';
import { collectOpsHealth } from '../utils/ops-health';

export type OpsView = 'system' | 'traffic' | 'abuse' | 'infra';

export async function buildOpsViewMessage(
  redis: Redis,
  view: OpsView,
  manager?: import('discord.js').ShardingManager | null,
): Promise<string> {
  const [health, snapshot] = await Promise.all([
    collectOpsHealth(redis, manager ?? null),
    getLatestOpsSnapshot(redis),
  ]);

  switch (view) {
    case 'system':
      return buildSystemView(health, snapshot);
    case 'traffic':
      return buildTrafficView(health, snapshot);
    case 'abuse':
      return buildAbuseView(health, snapshot);
    case 'infra':
      return buildInfraView(health, snapshot);
    default:
      return buildSystemView(health, snapshot);
  }
}

function buildSystemView(
  health: Awaited<ReturnType<typeof collectOpsHealth>>,
  snapshot: OpsSnapshot | null,
): string {
  const r = health.readiness;
  let t = `**Ops — System Summary**\n\n`;
  t += `Health: **${health.status}** (legacy: ${health.legacyStatus})\n`;
  t += `Launch readiness: **${r.level}** (score **${r.score}/100**)\n`;
  if (r.reasons.length > 0) {
    t += `Reasons: ${r.reasons.slice(0, 6).join(', ')}\n`;
  }
  t += `\nGuilds: **${health.checks.guilds.total}** / ${health.checks.guilds.maxGuilds}`;
  t += health.checks.guilds.atCap ? ' (at cap)\n' : '\n';
  t += `Maintenance: **${health.checks.maintenance.enabled ? 'ON' : 'off'}**\n`;
  t += `Worker: **${health.checks.worker.ok ? 'ok' : 'STALE'}**`;
  if (health.checks.worker.ageSec != null) t += ` (${health.checks.worker.ageSec}s)\n`;
  else t += '\n';
  t += `Banned users (Redis): **${snapshot?.banned.count ?? '—'}**\n`;
  t += `Players: **${snapshot?.players.total ?? '—'}** | Active 24h: **${snapshot?.players.active24h ?? '—'}**\n`;
  if (snapshot?.collectedAt) {
    t += `\n_Snapshot: ${snapshot.collectedAt}_`;
  } else {
    t += `\n_No worker snapshot yet — wait ~5 min after worker start._`;
  }
  return t;
}

function buildTrafficView(
  health: Awaited<ReturnType<typeof collectOpsHealth>>,
  snapshot: OpsSnapshot | null,
): string {
  let t = `**Ops — Traffic Summary (24h)**\n\n`;
  if (!snapshot) {
    t += `_No snapshot data. Worker collects every 5 minutes._\n`;
    t += `Health traffic: total=${health.traffic.total24h ?? '—'} failed=${health.traffic.failed24h ?? '—'}`;
    return t;
  }
  const tr = snapshot.traffic;
  t += `Commands: **${tr.total24h}** | Failed: **${tr.failed24h}** | Fail rate: **${(tr.failRate * 100).toFixed(1)}%**\n`;
  t += `Latency avg: **${snapshot.latency.avgMs}ms** | p95: **${snapshot.latency.p95Ms}ms**\n\n`;
  t += `**Top commands**\n`;
  if (tr.topCommands.length === 0) t += `_No data yet_\n`;
  else {
    for (const c of tr.topCommands) {
      t += `• \`${c.command}\` — ${c.n} (fail ${c.fail})\n`;
    }
  }
  t += `\n**Top guilds (current hour)**\n`;
  if (tr.topGuilds.length === 0) t += `_No data yet_\n`;
  else {
    for (const g of tr.topGuilds) {
      t += `• \`${g.guildId}\` — ${g.count}\n`;
    }
  }
  return t;
}

function buildAbuseView(
  health: Awaited<ReturnType<typeof collectOpsHealth>>,
  snapshot: OpsSnapshot | null,
): string {
  const a = snapshot?.abuse ?? health.abuse;
  let t = `**Ops — Abuse Summary (24h, observe-only)**\n\n`;
  if (!a) {
    t += `_Abuse counters unavailable._`;
    return t;
  }
  t += `New spam mutes: **${a.spamMuteNew}**\n`;
  t += `Active mute blocks: **${a.spamMuteActive}**\n`;
  t += `Rate limits: **${a.rateLimit}**\n`;
  t += `Gate rejected: **${a.gateRejected}**\n`;
  t += `Transfer limits: **${a.transferLimit}**\n`;
  t += `Market risk events (24h): **${snapshot?.marketRisk24h ?? '—'}**\n\n`;
  if (snapshot?.traffic.topUsers.length) {
    t += `**Top command users (current hour)**\n`;
    for (const u of snapshot.traffic.topUsers) {
      t += `• <@${u.userId}> — ${u.count}\n`;
    }
  } else {
    t += `_No top-user data yet._`;
  }
  return t;
}

function buildInfraView(
  health: Awaited<ReturnType<typeof collectOpsHealth>>,
  snapshot: OpsSnapshot | null,
): string {
  const q = health.checks.queue;
  const r = health.checks.redis;
  let t = `**Ops — Infrastructure**\n\n`;
  t += `Redis: **${r.ok ? 'ok' : 'DOWN'}** | ${r.latencyMs}ms`;
  if (r.memoryUsedMb != null) t += ` | ${r.memoryUsedMb} MB`;
  if (snapshot?.redis.keys != null) t += ` | keys ~${snapshot.redis.keys}`;
  t += '\n';
  t += `Queue: waiting **${q.waiting}** active **${q.active}** failed **${q.failed}** delayed **${q.delayed}**\n`;
  if (q.oldestWaitingAgeSec != null) {
    t += `Oldest waiting job: **${q.oldestWaitingAgeSec}s**\n`;
  }
  if (q.stalledHint) t += `⚠️ **Stalled queue hint** (backlog + stale worker)\n`;
  t += `Failed (last 1h): **${q.failedRecent1h}**\n`;
  t += `PG connections: **${snapshot?.postgres.connections ?? '—'}** (probe ${snapshot?.postgres.queryMs ?? '—'}ms)\n`;
  t += `Command gate inflight: **${health.checks.gates.commandsInflight}** / ${health.checks.gates.maxConcurrentCommands}\n`;
  t += `Telemetry pending: **${health.checks.telemetry.pendingEvents}** | dropped: **${health.checks.telemetry.droppedSinceBoot}**\n`;
  return t;
}
