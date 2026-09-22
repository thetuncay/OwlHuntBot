# OwlHuntBot — Pilot Launch Playbook

Controlled rollout: **5 → 10 → 25 → 50 → 100** guilds (global economy, guilds are play venues only).

100 sunucu `.env` / Redis / PM2 profili: **`docs/CAPACITY_100_GUILDS.md`**

## Monitoring checklist (every stage)

1. `curl -s http://localhost:3010/health` — `status`, `readiness.level`, `readiness.score`
2. `/admin sys ops view:system` — launch score, guilds, worker
3. `/admin sys ops view:traffic` — commands 24h, p95 latency
4. `/admin sys ops view:abuse` — spam/gate counters (observe-only)
5. `/admin sys ops view:infra` — Redis, queue, PostgreSQL
6. `pm2 logs owlhuntbot-shard --lines 50` and `pm2 logs owlhuntbot-worker --lines 50`
7. Optional deep dive: `npx tsx scripts/redis-footprint-audit.ts`

## Environment (pilot)

```env
OPS_ANALYTICS=1
COMMAND_TELEMETRY_PG=0
# Optional deep traces for one pilot week:
# PERF_METRICS=1
```

---

## Stage 1 — 5 guild pilot

### Expected metrics

| Metric | Typical range |
|--------|----------------|
| Commands / hour | 50–500 |
| Active users 24h | 20–200 |
| Redis memory | 50–300 MB |
| Queue waiting | 0–20 |
| p95 command latency | &lt; 1500 ms |
| Launch readiness score | 88–95 |

### Warning signs

- `readiness.level` = `CAUTION` for &gt; 1 hour
- p95 latency &gt; 3000 ms sustained
- `queue.failed` growing without clearing
- `abuse.spamMuteNew` spike (&gt; 50/h across all guilds)
- Worker heartbeat age &gt; 60s

### Rollback conditions (manual)

- Redis OOM or persistent connection failures
- Worker offline &gt; 5 minutes with queue backlog
- Data corruption / widespread command failures (&gt; 25% fail rate 1h)

**Action:** Stop new invites; maintenance mode; fix infra; do not auto-leave guilds.

### Capacity

- PostgreSQL: light load
- Redis: dominated by `state:player:*` per registered player
- Single worker sufficient

---

## Stage 2 — 10 guild pilot

### Expected metrics

| Metric | Typical range |
|--------|----------------|
| Commands / hour | 200–2000 |
| Active users 24h | 50–500 |
| Redis memory | 100–500 MB |
| Queue waiting | 0–50 |
| p95 latency | &lt; 2000 ms |

### Warning signs

- DBSIZE growth &gt; 20% week-over-week without player growth
- `queue.stalledHint` true
- Telemetry `droppedSinceBoot` increasing

### Rollback conditions

- Same as 5-guild, plus sustained queue waiting &gt; 500

### Capacity

- Review `redis-footprint-audit` weekly
- Confirm `DB_QUEUE_CONCURRENCY` adequate if waiting grows

---

## Stage 3 — 25 guild pilot

### Expected metrics

| Metric | Typical range |
|--------|----------------|
| Commands / hour | 500–8000 |
| Active users 24h | 100–2000 |
| Redis memory | 200–1500 MB |
| Queue waiting | 0–100 |
| p95 latency | &lt; 2500 ms |

### Warning signs

- Redis memory &gt; 80% of `maxmemory`
- PG connections &gt; 50 on snapshot
- Guild cap approaching (`guilds.atCap`)

### Rollback conditions

- Readiness `BLOCKED` for &gt; 30 minutes
- Failed BullMQ jobs &gt; 100 and climbing

### Capacity estimates (Redis)

| Guilds | Players (approx) | Redis keys (order of magnitude) |
|--------|------------------|----------------------------------|
| 10 | 500 | 5k–20k |
| 25 | 2000 | 20k–80k |
| 50 | 5000+ | 50k–200k+ |

Guild count alone does not multiply Redis linearly; **active players** do.

---

## Stage 4 — 50 guild cap (full pilot)

### Expected metrics

| Metric | Target |
|--------|--------|
| Launch readiness score | ≥ 90 |
| `readiness.level` | `SAFE` |
| p95 latency | &lt; 3000 ms |
| Command fail rate 24h | &lt; 5% |
| Queue failed | &lt; `HEALTH_QUEUE_FAILED_MAX` (default 50) |

### Warning signs

- Any `critical` health for &gt; 15 minutes
- Market risk events (`marketRisk24h`) spike without explanation
- Top guild traffic dominated by one ID (possible abuse — observe, investigate)

### Rollback conditions

- Do not exceed `MAX_GUILDS`; pause invites at cap
- Full rollback to 25 guilds only if operator explicitly removes guilds (no auto-prune except cap enforcement)

### Capacity expectations

- PM2: 1 shard manager + 1 worker (current architecture)
- Consider `PERF_METRICS=1` for one week if tuning latency
- PG backup cron must be verified before this stage

---

## Redis capacity reference

Run on demand:

```bash
npx tsx scripts/redis-footprint-audit.ts
```

### Recommended alerts (external / manual)

| Alert | Threshold |
|-------|-----------|
| Redis memory | &gt; 80% maxmemory |
| Health status | `critical` (HTTP 503) |
| Queue waiting | &gt; 200 sustained 10 min |
| Queue failed | &gt; `HEALTH_QUEUE_FAILED_MAX` |
| DBSIZE | +20% week-over-week |
| Launch readiness | `BLOCKED` |

Phase 1.5 does not wire external paging; `/health` JSON is ready for a future webhook.

---

## Scaling decision matrix

| Readiness | Action |
|-----------|--------|
| SAFE, score ≥ 90 | OK to add guilds per stage |
| CAUTION | Hold invites; investigate reasons in `/health` |
| BLOCKED | No new guilds; fix worker/redis/queue first |

Advisory only — gameplay is never auto-stopped by readiness score.

---

## Stage 5 — 100 guild cap

Apply **`docs/CAPACITY_100_GUILDS.md`** before raising `MAX_GUILDS` to 100.

### Expected metrics

| Metric | Target |
|--------|--------|
| Commands / hour | 2000–15000 (traffic-dependent) |
| Active players 24h | 2000–10000 |
| Redis memory | 1–3.5 GB of 4 GB max |
| Queue waiting | &lt; 150 sustained |
| p95 latency | &lt; 3500 ms |
| Readiness | `SAFE`, score ≥ 88 |

### Warning signs

- Redis &gt; 85% of 4 GB maxmemory
- Shard PM2 restarts (OOM) — raise `max_memory_restart` or lower Discord caches
- `gate_rejected` abuse counter climbing with healthy queue

### Rollback

- Pause invites at 80–90 if metrics degrade
- Temporarily `MAX_GUILDS=50` until Redis/queue stable
