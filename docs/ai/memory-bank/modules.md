# Modules — klasör haritası

Her satır: ne işe yarar + dokunurken ilk bakılacak dosyalar.

## `src/commands/` (~10k satır)

Discord komut girişleri. İnce tutulmalı; iş mantığını `systems`’e bırak.

- Kilit: `owl.ts` (router), `owl-hunt.ts`, `owl-market.ts`, `owl-pvp.ts`, `admin.ts` (büyük), `pvp.ts`, `bj.ts`, `coinflip.ts`
- Prefix alias: `owl-utils.ts`, `utils/alias-command.ts`

## `src/systems/` (~15k satır)

Oyun kuralları: hunt, tame, market, PvP, gambling, XP, quests, retention, lootbox.

- Kilit: `hunt.ts`, `market.ts`, `pvp.ts`, `pvp-sim.ts`, `PvPGamblingSystem.ts`, `gambling.ts`, `tame.ts`, `items.ts`, `economy*.ts`
- Alt: `gamble/` (slot, BJ, escrow), `retention/`, `ai/` (opsiyonel LLM reply)

## `src/state/`

- `player-state.ts` — Redis-first hydrate/mutate/dirty; coin Lua; inventory delta
- `lua/hunt-apply.lua` — hunt atomik apply

## `src/utils/`

UX embed/screen, Redis helpers, locks, db-queue, battle-card, market-screens (büyük), pvp-ux, inventory-ux.

- Kilit: `lock.ts`, `db-queue.ts`, `redis.ts`, `safe-reply.ts`, `embed.ts`

## `src/anticheat/`

Captcha, trust score, rate limiter, punishment, market anomaly. Dosyalar genelde 400 satırın altında — iyi örnek.

## `src/ops/`

Ops HTTP, Discord OAuth web session, copy editor, feedback, analytics, launch readiness.

- Giriş: `ops-panel.ts`, `ops/ops-http-server.ts`, `ops/web-session.ts`

## `src/middleware/`

Komut pipeline: cooldown, load-shed, abuse-breaker, concurrency gate.

## `src/config.ts` + `src/config/`

- `config.ts` — OWL/PREY/tier/XP/fiyat sabitleri (sayı kataloğu)
- `config/copy-catalog*.ts` — düzenlenebilir oyuncu metinleri
- Emoji, quest, feedback survey config

## `src/interactions/`

Market + anticheat Discord component handler’ları.

## `src/jobs/` + `src/worker.ts`

BullMQ / cron arka plan.

## Test

- `src/__tests__/**/*.test.ts`, `src/systems/**/__tests__`, `*.test.ts` yanında
- Çalıştır: `pnpm test`
