# Decisions (kısa ADR)

Spekülasyon yok — bugün kodda geçerli seçimler.

## ADR-1 — PostgreSQL + Prisma

Mongo’dan PG’ye geçildi. Schema `prisma/`; migrate yalnızca açık kullanıcı isteği.

## ADR-2 — Redis hot state + dirty set

Oyuncu hot path Redis’te; dirty set + `db-queue` ile PG’ye yazılır. TTL / hydrate `player-state` içinde.

## ADR-3 — Worker tek instance

BullMQ + cron `owlhuntbot-worker` tek süreç. Çoklu worker varsayımıyla job yazma.

## ADR-4 — Prefix `owl` + slash `/owl`

Per-guild prefix (`owl prefix`). Alias tablosu `alias-command` / help.

## ADR-5 — Copy catalog

Oyuncu görünen metinler `config/copy-catalog*.ts`; ops panel copy editor ile düzenlenebilir önizlemeler.

## ADR-6 — Global ekonomi

Bir Discord kullanıcısı = bir ekonomi profili (tüm guild’ler).

## ADR-7 — Anticheat modüler klasör

`src/anticheat/` ayrı; rate/trust/captcha. Komut pipeline middleware ile birleşir.

## ADR-8 — Vitest

Unit + property (fast-check bazı suite’lerde). Integration testleri Redis mock ile.

## Derin DDR'ler (engagement wave 2026-09-14)

Kısa ADR'ler burada; detaylı gerekçe ve alternatifler [`../decisions/`](../decisions/) altında.

- [`DECISION-001`](../decisions/DECISION-001-daily-maintenance-rework.md) — Daily maintenance ceza → bonus (REWORK, Wave 5)
- [`DECISION-002`](../decisions/DECISION-002-gambling-streak-modifier.md) — Gambling streak modifier kaldır + retention nudge çek (REWORK, Wave 5)
- [`DECISION-003`](../decisions/DECISION-003-pity-and-softcap-transparency.md) — Pity + level softcap görünür (IMPLEMENT, Wave 2)
- [`DECISION-004`](../decisions/DECISION-004-daily-load-and-quest-fatigue.md) — Günlük yük hafifletme (PARTIAL, Wave 1+3)
- [`DECISION-005`](../decisions/DECISION-005-tame-decision-visibility.md) — Tame karar görünürlük (PARTIAL, Wave 4+6)
- [`DECISION-006`](../decisions/DECISION-006-cooldown-message-content.md) — Cooldown mesajı içerik (IMPLEMENT, Wave 1)
- [`DECISION-007`](../decisions/DECISION-007-mcp-scope.md) — MCP scope (REJECT, bu turda ek MCP yok)
