# PHASE 1.5 — Production Hardening Report

## Launch readiness score

| | Score |
|---|-------|
| **Before (Phase 1)** | ~82/100 |
| **After (Phase 1.5)** | ~90–93/100 (when production healthy) |

## Step 1 — Observability audit

### Current (pre-implementation baseline)

- Command pipeline with access, anti-spam, load-shed; perf metrics opt-in (`PERF_METRICS`)
- PG `CommandEvent` for prefix owl subcommands only
- `/health` with Redis, worker, queue, guilds, gates
- Admin `sys info`, `sys perf`; no ops traffic/abuse views

### Missing (addressed in Phase 1.5)

- Unified command analytics (all entrypoints)
- Rolling Redis aggregates with TTL
- Worker ops snapshot (5 min)
- Abuse counters (observe-only)
- Launch readiness gates
- Discord `/admin sys ops` views

### Recommended (implemented)

- Redis-first `OPS_ANALYTICS` (default on in production)
- `COMMAND_TELEMETRY_PG=0` in production to avoid PG spam
- Worker snapshot + expanded `/health`
- `docs/PILOT_LAUNCH.md` + `scripts/redis-footprint-audit.ts`

---

## Metrics added

| Category | Storage | Retention |
|----------|---------|-----------|
| Command success/fail/latency | `ops:cmd:hour:*` | 72h |
| Active users | `ops:hll:user:{date}` | 8d |
| Guild/user traffic | `ops:guild:hour:*`, `ops:user:hour:*` | 24–48h |
| Abuse signals | `ops:abuse:{signal}:{date}` | 8d |
| Ops snapshot | `ops:snapshot:v1` | 15m TTL (refreshed every 5m) |
| Guild total | `ops:guilds:total` | 10m (shard 0) |

---

## Observability improvements

- **Commands:** pipeline hook records all slash + prefix commands
- **Health:** `healthy` / `warning` / `critical` + `readiness` (SAFE/CAUTION/BLOCKED)
- **Admin:** `/admin sys ops` — system, traffic, abuse, infra
- **Worker:** periodic snapshot to Redis for health/admin

---

## Abuse visibility

- Counters: spam mute, rate limit, gate rejected, transfer limits
- Market risk: `MarketSuspiciousLog` count in snapshot (24h)
- Top users/guilds in snapshot (current hour, rolling)

No automatic punishments added.

---

## Queue visibility

- `paused`, oldest waiting job age, failed last 1h, `stalledHint`
- Surfaced in snapshot, `/health`, admin infra view

---

## Redis visibility

- Snapshot: memory, DBSIZE, clients
- Script: `scripts/redis-footprint-audit.ts` for prefix breakdown
- Pilot scaling notes in `docs/PILOT_LAUNCH.md`

---

## Files modified / created

### Created

- `src/ops/ops-config.ts`
- `src/ops/command-analytics.ts`
- `src/ops/abuse-analytics.ts`
- `src/ops/pg-ops-metrics.ts`
- `src/ops/ops-snapshot.ts`
- `src/ops/launch-readiness.ts`
- `src/ops/admin-ops-views.ts`
- `scripts/redis-footprint-audit.ts`
- `docs/PILOT_LAUNCH.md`
- `docs/PHASE_1.5_REPORT.md`
- `src/__tests__/command-analytics.test.ts`
- `src/__tests__/launch-readiness.test.ts`

### Modified

- `src/middleware/command-pipeline.ts`
- `src/middleware/antiSpam.ts`
- `src/middleware/load-shed.ts`
- `src/systems/transfer.ts`
- `src/utils/ops-health.ts`
- `src/utils/db-queue.ts`
- `src/utils/command-telemetry.ts`
- `src/utils/perf-metrics.ts`
- `src/jobs/background-jobs.ts`
- `src/commands/admin.ts`
- `src/index.ts`
- `.env.example`, `docs/LAUNCH.md`, `README.md`

---

## Remaining blockers before 50-guild rollout

- PostgreSQL backup/restore drill
- Clear stale global `/admin` from Discord (`pnpm deploy:commands:prod`)
- External alerting (optional; health JSON ready)
- Operator review of pilot stages in `docs/PILOT_LAUNCH.md`

---

## Rollback

1. Set `OPS_ANALYTICS=0` in `.env`
2. Restart processes (with approval): `pm2 restart owlhuntbot-shard owlhuntbot-worker`
3. Optional: remove rolling keys: `redis-cli --scan --pattern 'ops:*'`

No schema migration required.

---

## Validation

```bash
pnpm build   # OK
pnpm test    # 209/209 passed (+5 new tests)
```

New tests: `command-analytics.test.ts`, `launch-readiness.test.ts`; extended `ops-health.test.ts`.

Manual: `curl /health`, `/admin sys ops`, wait 5m for `ops:snapshot:v1`.
