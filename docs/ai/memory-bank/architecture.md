# Architecture (mevcut gerçek)

BaykusBot / OwlHuntBot — TypeScript Discord RPG + global ekonomi botu.

## Stack

- TypeScript 5, discord.js v14
- PostgreSQL + Prisma
- Redis (hot state, rate limit, BullMQ)
- pnpm, Vitest
- PM2 süreçleri: `owlhuntbot-shard`, `owlhuntbot-worker`, (opsiyonel) `owlhuntbot-ops-panel`

## Süreç modeli

```text
Discord Gateway
    → shard (src/shard.ts / shard-manager)
        → commands / interactions / middleware
        → Redis hot state + locks
        → db-queue enqueue
    → worker (src/worker.ts) — BullMQ + cron, tek instance
    → ops-panel (localhost) — kopya editör, analytics, admin HTTP
```

- Shard: Discord I/O ve oyun komutları.
- Worker: arka plan persist, cron, kuyruk tüketicisi — **tek instance** varsayımı.
- Ops: `127.0.0.1` panel; production Discord admin → ops guild + allowlist.

## Veri akışı

1. Okuma/yazım önce **Redis** (`src/state/player-state.ts`).
2. PostgreSQL: hydrate + arka plan persist (`src/utils/db-queue.ts`).
3. Coin mutasyonu: atomic Lua (player-state içinde); yetersiz bakiye → hata, sessiz truncate yok.
4. Oyuncu profili **global** (guild’ler arası tek ekonomi).

## Layout (kısa)

| Yol | Rol |
|-----|-----|
| `src/commands` | Slash/prefix handler |
| `src/systems` | Oyun mantığı |
| `src/state` | Redis-first player/owl/inv |
| `src/utils` | UX, lock, redis, math, screens |
| `src/anticheat` | Rate, trust, captcha, market anomaly |
| `src/ops` | Panel HTTP, OAuth, analytics |
| `src/middleware` | Cooldown, load-shed, abuse |
| `src/config.ts` + `src/config/` | Sayılar + copy catalog |
| `src/interactions` | Button/modal market & anticheat |
| `src/__tests__` | Vitest |

## Ölçek notu

~55k satır non-test TS, ~289 dosya. En büyük yığın: `utils` + `systems` + `commands`. `config.ts` büyük ama **sayı kataloğu**; logic eklenmez.
