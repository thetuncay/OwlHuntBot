# BaykusBot (OwlHuntBot)

TypeScript production Discord RPG/economy bot — **global economy** (one player profile across all guilds).

## Stack

- TypeScript 5, discord.js v14
- PostgreSQL + Prisma
- Redis (hot state, rate limits, BullMQ)
- PM2: shard manager + background worker

## Quick start (development)

1. `pnpm install`
2. `cp .env.example .env` — fill `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_USER_IDS`, `DATABASE_URL`, `REDIS_URL`
3. `docker compose up -d postgres redis pgbouncer`
4. `pnpm db:setup`
5. `pnpm deploy:commands`
6. `pnpm dev` (single process) or `pnpm start:shard` + `pnpm start:worker`

## Production

See [docs/LAUNCH.md](docs/LAUNCH.md) for controlled public launch (50 guild cap, admin deploy, health checks).

```bash
pnpm build
pm2 start ecosystem.config.js
```

## Commands

- Prefix: `owl hunt`, `owl yardim` (per-guild prefix via `owl prefix` / `/owl prefix`)
- Slash: `/owl`, `/coinflip`, `/slot`, `/bj`, `/top`
- `/admin` — **ops guild only** (`GUILD_ID`), owner allowlist

## Security

- Redis locks on critical paths; atomic coin updates in Redis
- Ban list + maintenance mode in command pipeline
- Ban memory cache when Redis is degraded
- Anti-spam and global command concurrency gate

## Operations and monitoring (Phase 1.5)

- `GET http://localhost:3010/health` — infrastructure + launch readiness score
- `http://127.0.0.1:3011/` — local ops panel (PM2 `owlhuntbot-ops-panel`, localhost only)
- `/admin sys ops` — system, traffic, abuse, infra summaries (ops guild only)
- [docs/PILOT_LAUNCH.md](docs/PILOT_LAUNCH.md) — 5/10/25/50 guild pilot stages
- `npx tsx scripts/redis-footprint-audit.ts` — Redis keyspace report

Set `OPS_ANALYTICS=1` in production (default when `NODE_ENV=production`).

## Layout

- `src/commands` — Discord command handlers
- `src/systems` — game logic
- `src/state` — Redis-first player state
- `src/worker.ts` — BullMQ consumer + cron (single instance)
- `src/ops` — pilot analytics, snapshots, launch readiness
- `docs/ai/` — AI guidelines, memory bank, audit prompts ([AGENTS.md](AGENTS.md))
