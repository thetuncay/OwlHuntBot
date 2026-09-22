# OwlHunt v2.1 — Production Readiness Hardening CHANGELOG

## Abuse accounting (P0)

- **Before:** `enforceAbuseBreaker` ran before the handler and incremented flood/same-command counters on every pipeline entry, including cooldown, in-flight, and lock rejects.
- **After:** Split into `assertAbuseThrottleGate` (pre-handler, peek-only + active throttle check) and `recordAbuseAccountingOnSuccess` (post-success increment only).
- **Player impact:** Impatient cooldown/in-flight repeats no longer contribute to abuse throttle. Real flood (40+ successful commands / 10s) still throttles.

## Intent — Impatient (P0)

- In-flight busy messages (`notifyInflightBusy`, pipeline gate, Redis in-flight in `owl.ts`) now call `resolveFlowRejectMessage(..., 'inflight')`.
- `LockContentionError` handlers in `guarded-discord.ts` use `resolveLockErrorMessage` when flow context is available (`index.ts` passes `flowCtx`).

## Lost intent scope (P1)

- Lost footer now also on: `inventory`, `yardim`, `quests`, `katalog`, `market` browse/hub (in addition to `stats`, `cash`).

## Tests (P1)

- New: `abuse-breaker.test.ts`, expanded `flow-intent.test.ts`, Redis mock helpers.

## Ops (P2)

- CLI: `npx tsx src/scripts/export-flow-metrics.ts` — 24h intent/flow/abuse counters as JSON.
- Deferred: cross-worker suppression — see `docs/TODO-cross-worker-suppression.md`.

## Deploy

- No Prisma migration.
- PM2 restart required: `pm2 restart owlhuntbot-shard owlhuntbot-worker`
