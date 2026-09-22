# OwlHuntBot — Controlled Public Launch (50 guilds)

Global economy: one player profile, one market, one leaderboard across all guilds.

## Canonical production deploy: PM2

```bash
docker compose up -d postgres redis pgbouncer   # infra only
pnpm install && pnpm build
pm2 start ecosystem.config.js
pm2 list   # owlhuntbot-shard + owlhuntbot-worker + owlhuntbot-ops-panel must be online
```

Docker Compose can run `bot` + `worker` for full stack; PM2 on the VDS is the supported production path.

## Required environment

| Variable | Purpose |
|----------|---------|
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` | Application ID |
| `GUILD_ID` | Ops guild — `/admin` deploy target only |
| `ADMIN_USER_IDS` | Comma-separated owner IDs (**required** in production) |
| `DATABASE_URL` | PostgreSQL (PgBouncer port 6432 recommended) |
| `REDIS_URL` | Redis + BullMQ |
| `MAX_GUILDS` | Install cap (pilot `50`, 100-profile: `docs/CAPACITY_100_GUILDS.md`) |
| `NODE_ENV` | `production` |

## Discord Developer Portal

- **Privileged intents:** `Message Content` (prefix commands)
- **Scopes for invite:** `bot`, `applications.commands`

Invite URL template (replace `CLIENT_ID` and permission bits as needed):

```text
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=2147567616&scope=bot%20applications.commands
```

## Slash command deploy

```bash
pnpm deploy:commands:prod
```

- All gameplay commands: **global**
- `/admin`: **guild-only** on `GUILD_ID`, `dm_permission: false`

## Health and monitoring

```bash
curl -s http://localhost:3010/health | jq
```

### Yerel ops paneli (sunucu listesi)

PM2 ile sürekli çalışan ayrı process: **`owlhuntbot-ops-panel`** (varsayılan port **3011**).

```bash
pm2 list   # owlhuntbot-ops-panel online olmali
```

Tarayıcı (VDS localhost):

```text
http://127.0.0.1:3011/
```

Public (Caddy reverse proxy, bkz. `docs/CADDY_OPS_PANEL.md`):

```text
https://owlhunt.thetuncay.com/
```

- Health JSON: `http://127.0.0.1:3010/health` (shard manager)
- Panel UI + API: port `OPS_PANEL_PORT` (default 3011)
- Guild listesi: shard 0 her 5 dk Redis'e yazar; panel bot restart'ta da calisir
- `OPS_PANEL_ENABLED=0` panel UI'yi kapatir

Uzak makineden SSH tüneli:

```bash
ssh -L 3011:127.0.0.1:3011 root@SUNUCU_IP
# PC: http://127.0.0.1:3011/
```

Deploy / ilk kurulum:

```bash
pnpm build
pm2 start ecosystem.config.js
# veya sadece panel: pm2 start owlhuntbot-ops-panel
```

Returns detailed JSON:

| Field | Meaning |
|-------|---------|
| `status` | `healthy` \| `warning` \| `critical` |
| `legacyStatus` | `ok` \| `degraded` \| `unhealthy` (backward compatible) |
| `readiness` | `{ score, level: SAFE\|CAUTION\|BLOCKED, reasons[] }` — advisory only |
| `checks.*` | Redis, worker, queue (incl. oldest job age), guilds, gates |
| `traffic` / `latency` | From worker snapshot (24h rollup) |
| `snapshot` | Latest `ops:snapshot:v1` blob |

HTTP **503** when `status` is `critical` (Redis down, worker stale, guild over cap, or readiness BLOCKED).

Discord ops views (ops guild, admin only):

```text
/admin sys ops view:system
/admin sys ops view:traffic
/admin sys ops view:abuse
/admin sys ops view:infra
```

Pilot playbook: [docs/PILOT_LAUNCH.md](PILOT_LAUNCH.md)

Redis footprint audit (read-only):

```bash
npx tsx scripts/redis-footprint-audit.ts
```

### Metrics environment

| Variable | Default (production) | Purpose |
|----------|----------------------|---------|
| `OPS_ANALYTICS` | on | Rolling Redis command/abuse metrics |
| `COMMAND_TELEMETRY_PG` | off | PG `CommandEvent` batch writes |
| `PERF_METRICS` | off | Deep per-minute perf buckets |
| `HEALTH_QUEUE_FAILED_MAX` | 50 | Queue failed threshold for health |

PM2 logs:

```bash
pm2 logs owlhuntbot-shard --lines 100
pm2 logs owlhuntbot-worker --lines 100
grep GuildAudit logs/shard-out.log   # guild join/leave JSON audit lines
```

## Guild cap

When `totalGuilds > MAX_GUILDS`, the bot leaves the newest server and logs `[GuildAudit]` with `event: guild.join.rejected`. Shard 0 prunes excess guilds on startup.

## Backups

```bash
# cron example: scripts/pg-backup-cron.sh
chmod +x scripts/pg-backup-cron.sh
```

Test restore periodically (`scripts/restore-postgres.sh`).

## Pilot checklist

- [ ] `ADMIN_USER_IDS` set; no default admin fallback
- [ ] `pnpm test` and `pnpm build` green
- [ ] `owlhuntbot-shard` + `owlhuntbot-worker` online
- [ ] `deploy:commands:prod` run after deploy
- [ ] `/admin` visible only in ops guild
- [ ] `/health` returns `healthy` with fresh worker heartbeat and `readiness.level: SAFE`
- [ ] `OPS_ANALYTICS=1` in production `.env`
- [ ] `/admin sys ops` works in ops guild
- [ ] Invite 5–10 pilot guilds, then scale toward 50

## Restart (requires explicit approval on production VDS)

```bash
pnpm build
pnpm deploy:commands:prod
pm2 restart owlhuntbot-shard owlhuntbot-worker owlhuntbot-ops-panel
```
