# DECISION-007 — MCP Scope: Bu Proje İçin

- **Durum:** Karar verildi — bu turda ek MCP yok
- **Tarih:** 2026-09-14
- **Kaynaklar:** Kullanıcı ana direktifi §11 (MCP kullanımı) · `.cursor/mcp.json` (mevcut boş)

---

## Problem

Cursor MCP altyapısı üzerinden çeşitli entegrasyonlar (documentation lookup, Git/GitHub, web research, academic research, database inspection, testing, browser, project management) eklenebilir. Ancak:

- Kullanıcı direktifi §11: "Rastgele MCP yükleme · Güvenilmeyen MCP kullanma · Gereksiz servis bağımlılığı oluşturma · Gizli credential paylaşma — **yapma**."
- AI-guidelines: "Tek npm paketi kalır. Ayrı package/crate monorepo = over-engineering, yasak (OwlHunt ölçeğinde)."

Bu proje için soru: **Hangi MCP gerçekten değer katar? Hangisi gereksiz karmaşıklıktır?**

## Mevcut durum

- [`.cursor/mcp.json`](../../../.cursor/mcp.json) — 3 byte, essentially `{}`.
- Session'da mevcut: **cursor-ide-browser** (Cursor-owned browser tab + CDP).

Mevcut CLI/tool erişimi:

- **Git:** Terminal + `gh` CLI mevcut.
- **Prisma:** `pnpm prisma studio` mevcut; `scripts/*` altında migrate script'leri.
- **Redis:** `redis-cli` mevcut (VDS).
- **Test:** `pnpm test` mevcut.
- **Deploy:** PM2 CLI mevcut.

## Analiz — Aday MCP'ler

### Reddedilen adaylar

| Aday | Neden reddedildi |
|------|-----------------|
| GitHub MCP (issue/PR) | `gh` CLI + `scripts/push-github.sh` yeter; MCP ek katman |
| Prisma / DB inspection MCP | `pnpm prisma studio` + `psql` yeter; MCP DB'ye extra erişim = risk |
| Docker inspection MCP | `docker ps/logs/inspect` mevcut; write yasak (docker-protection.mdc) |
| PM2 inspection MCP | `pm2 list/logs` mevcut; write yasak (pm2-protection.mdc) |
| Web research MCP (external) | Cursor'un yerleşik `WebSearch/WebFetch` var; ek MCP gerekmez |
| Academic paper fetch MCP | Aynı — WebFetch yeter |
| Project management (Linear/Jira) | Proje bu ekiplere entegre değil; over-engineering |
| Slack/Teams MCP | Proje bunlara entegre değil |
| Datadog/Sentry MCP | Şu an bunlarla entegre değil (ops panel iç metrik) |

### Kabul edilebilir adaylar (ANCAK bu turda değil)

| Aday | Ne katar? | Ne zaman? |
|------|-----------|-----------|
| Filesystem MCP | Sandbox dışı sınırlı erişim | Zaten native filesystem yeter |
| Puppeteer/Playwright MCP | Discord embed görsel testi | Gerekirse browser-use subagent zaten var |

## Proposed Change

**Bu turda ek MCP eklenmez.** `.cursor/mcp.json` boş kalır.

Sebep:
- Mevcut CLI/tool set proje için yeterli.
- Kullanıcı direktifi "gereksiz servis bağımlılığı oluşturma" ile örtüşür.
- AI-guidelines "tek npm paketi" felsefesine paralel.
- Credential/token yönetimi ekstra risk yaratır (özellikle prod DB'ye MCP write hakkı).

## Alternatives

- **(a) Bu turda ek MCP yok (ÖNERİLEN)** — status quo, güvenli.
- **(b) Web research için ek MCP** — Cursor'un yerleşik WebSearch/WebFetch olduğundan gereksiz.
- **(c) Prisma DB inspection MCP** — production DB'ye yeni bir erişim vektörü → risk yüksek; AUDIT MODE dışında read-only olsa bile "database-protection.mdc" kapsamında.
- **(d) Full stack MCP (GitHub + Prisma + Docker)** — over-engineering; kullanıcı direktifi tarafından açıkça reddedilmiş.

## Research Evidence

- Yok — bu bir mühendislik / operasyonel karar. Bilimsel araştırma kapsamı dışı.
- Kullanıcı direktifi §11 doğrudan.

## Technical Impact

- Kod / config dokunulmuyor.
- [`.cursor/mcp.json`](../../../.cursor/mcp.json) boş kalır.
- Yeni bir Cursor rule değinilmesi: `feature-development.mdc` içinde "MCP eklemesi ayrı DDR gerektirir" satırı.

## Design Impact

- Yok (operasyonel).

## Long-Term Impact

- **Kazanım:** Basitlik korunur. Credential yüzeyi genişlemez.
- **Risk:** İhtiyaç doğarsa DDR-007-ext oluşturulup MCP eklenir; şu an "ihtiyaç yok" durumu.

## Decision

**REJECT (bu turda) — Alternatif (a).**

`.cursor/mcp.json` dokunulmaz. Yeni MCP ihtiyacı doğarsa ayrı DDR ile gelecek.

## Reason

Kullanıcı direktifi + AI-guidelines minimalizm ile örtüşük. Mevcut tool set ihtiyacı karşılıyor. Ek MCP hem credential yönetimi hem test yükü getirir.

## SETUP_REQUIRED notu

Bu turda kullanıcının manuel yapması gereken **hiçbir MCP kurulumu / API key yapılandırması yok.** Gelecekte MCP eklenirse bu belgeye setup adımları eklenecek.

**Belge sonu.**
