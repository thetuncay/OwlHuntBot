# OwlHunt optimizasyon günlüğü

Her oturumun başında bu dosya ve [`OPTIMIZATION_PLAN.md`](OPTIMIZATION_PLAN.md) okunur.

Güven etiketleri: `DOĞRULANDI` (test/ölçüm/kod okuma), `KISMEN DOĞRULANDI`, `DOĞRULANAMADI (neden)`.

---

## Ortam envanteri (Faz 0.1 — 2026-10-08, salt okunur)

| Alan | Değer | Kaynak |
|------|-------|--------|
| OS | Windows 10 Pro 10.0.19045 | `Win32_OperatingSystem` |
| CPU | AMD Ryzen 5 7500F, 6 çekirdek / 12 iş parçacığı | `Win32_Processor` |
| RAM | 15.7 GB toplam, ölçüm anında 4.3 GB boş | `Win32_ComputerSystem` |
| Node | v22.14.0 | `node -v` |
| npm | 10.9.2 | `npm -v` |
| pnpm | 10.33.0 (package.json `packageManager: pnpm@9.15.9`, engines `pnpm <10`) | `pnpm -v`, `package.json` |
| Lockfile | `pnpm-lock.yaml` **ve** `package-lock.json` birlikte var | dosya listesi |
| PM2 | 7.0.3 | global `pm2/package.json` |
| Docker | Server 29.8.0 (Docker Desktop, WSL2) | `docker version` |
| WSL | `docker-desktop` Running v2, `Ubuntu` Stopped v2 | `wsl -l -v` |
| git remote | `origin https://github.com/thetuncay/OwlHuntBot.git` | `git remote -v` |

### Kurulu sürümler (`node_modules/*/package.json`)

| Paket | Sürüm |
|-------|-------|
| discord.js | 14.26.2 |
| @prisma/client / prisma | 6.19.3 |
| bullmq | 5.76.5 |
| ioredis | 5.10.1 |
| zod | 3.25.76 |
| typescript | 5.9.3 (`strict: true`) |
| vitest | 4.1.6 |
| tsx | 4.21.0 |
| mongodb | 7.2.0 (yalnızca `src/scripts` altındaki eski göç betikleri) |

### Dinleyen portlar ve konteynerler

| Port | Sahip | Not |
|------|-------|-----|
| 5433 | `owlhuntbot-postgres-1` (postgres:17-alpine) | OwlHunt DB — **bağlanma yasak** |
| 6380 | `owlhuntbot-redis-1` (redis:7-alpine) | OwlHunt Redis — **bağlanma yasak** |
| 5432 | `wiki-master-db-1` (postgres:15-alpine) | Başka proje |
| 3000 | `wiki-master-app-1` | Başka proje |
| 5434, 6390 | `owlhunt-bench-postgres-bench-1` / `owlhunt-bench-redis-bench-1` | Faz 1’de ayağa kalktı; canlı 5433/6380’e bağlanılmadı |

### Projede hazır olan ölçüm araçları

`PERF_METRICS` env bayrağı, `pnpm perf:report`, `pnpm profile:cpu` (`--cpu-prof`), vitest + fast-check. tinybench/mitata, knip, madge kurulu değil.

---

## Karar Günlüğü

| ID | Tarih | Karar | Kaynak |
|----|-------|-------|--------|
| K1 | 2026-10-08 | Benchmark DB: izole PostgreSQL `5434` + izole Redis `6390`. MongoDB/27018 planı iptal; `mongodb-bench` MCP girdisi kaldırıldı. | Kullanıcı |
| K2 | 2026-10-08 | Production: bu PC, 10 kişilik test ekibi. Ayrı canlı VDS yok. | Kullanıcı |
| K3 | 2026-10-08 | Yük kademeleri: 10 / 100 / 1.000 / 5.000 eşzamanlı sanal oyuncu. | Kullanıcı |
| K4 | 2026-10-08 | Komut dağılımı kaynağı: `logs/bot-out.log` `[Perf] Ozet` satırları, salt okunur. | Kullanıcı |
| K5 | 2026-10-08 | Belirli şikayet yok; hedef genel hız ve verim. Öncelik Faz 0 bulgularına göre. | Kullanıcı |
| K6 | 2026-10-08 | Branch `perf/optimization`. Auto-push askıda (`.git/hooks/post-commit` → `post-commit.disabled-perf`, `auto-push-github.mdc` notu). Commit yalnızca faz onayından sonra. | Kullanıcı |
| K7 | 2026-10-08 | `pnpm-lock.yaml` esas. `package-lock.json` ve pnpm 10/9 uyumsuzluğu yalnızca raporlanır. | Kullanıcı |
| K8 | 2026-10-08 | `.cursor/mcp.json` gitignore'da, commit edilmez; `.cursor/mcp.json.example` şablon. Prisma MCP kullanılmaz. Redis MCP: resmi `mcp/redis` Docker imajı, `host.docker.internal:6390`. | Kullanıcı (önceki tur) |
| K9 | 2026-10-08 | Kullanıcı: onay beklemeden devam. Faz 0 sorularına önerilen cevaplar uygulanır. | Kullanıcı |
| K10 | 2026-10-08 | B1–B4 ayrı bug; Faz 1’de düzeltilmez, yalnızca ölçülür/gözlenir. | Öneri + K9 |
| K11 | 2026-10-08 | Prefix `w lb` `fresh: true` dokunulmaz (kasıt belirsiz). | Öneri + K9 |
| K12 | 2026-10-08 | Faz 1: izole Postgres 5434 + Redis 6390. Wiki ve 5433/6380 durdurulmaz, bağlanılmaz. | Öneri + K9 |
| K13 | 2026-10-08 | Duel baseline: animasyonlu + `SIM_PVP_SKIP_ANIM=1` (yalnız bench process). Canlı `.env` değişmez. | Öneri + K9 |
| K14 | 2026-10-08 | Postgres MCP eklenmez. Redis MCP 6390 ayakta ve izole ise açılabilir. | Öneri + K9 |
| K15 | 2026-10-08 | Redis MCP `redis-bench` `disabled: false` — yalnızca `host.docker.internal:6390`. | K14 + 6390 healthy |

---

## Kurulum Günlüğü

| Tarih | Ne | Sürüm | Neden | Nasıl kaldırılır |
|-------|----|-------|-------|------------------|
| 2026-10-08 | `docker-compose.bench.yml` (`owlhunt-bench`) | postgres:17-alpine, redis:7-alpine | İzole baseline; port 5434/6390 | `docker compose -f docker-compose.bench.yml down -v` (volume siler) |
| 2026-10-08 | Bench Redis `--maxmemory-policy noeviction`, 512mb | redis:7 | BullMQ allkeys-lru uyarısı; soak evict yasağı | compose `command` satırını geri al, `up -d --force-recreate redis-bench` |
| 2026-10-08 | `.env.bench` (gitignore) | yerel | Prisma/Redis URL kilidi; `connection_limit=8` bot havuzu | dosyayı sil |
| 2026-10-08 | `benchmarks/` harness | tsx | Sahte Discord; `load-bench-env.ts` 5433/6380 reddi | dizini sil |
| 2026-10-08 | Redis MCP `redis-bench` açık | mcp/redis Docker | K14; yalnızca 6390 | `.cursor/mcp.json` `disabled: true` |

---

## Faz 0 bulguları (2026-10-08)

Kaynak koda dokunulmadı. `.env` okunmadı. 5433/6380’e bağlanılmadı.

### Mimari harita

```
Discord Gateway
  → src/index.ts (Client; Windows PM2: tsx src/index.ts)
     prefix: owl.ts → hunt / duel / market / …
     slash: yalnızca /admin (guild-only)
     interactionCreate: trade, market, onboarding
     message collectors: hunt enc_, tame, pvp invite, inventory, …
  → Redis (hot state) → Discord cevap
  → BullMQ Queue "db-writes" (producer, her bot process)
Worker (src/worker.ts, Discord yok)
  → BullMQ consumer + startBackgroundJobs (cron)
Production (ecosystem.config.js, bu PC’de kullanılmıyor)
  → dist/shard.js ShardingManager totalShards:'auto'
  → dist/index.js shard çocukları
  → dist/worker.js + dist/ops-panel.js
  → hepsi: node --import tsx
```

**Entry / çalıştırma**

| Ortam | Entry | NODE_ENV | Shard |
|-------|-------|----------|-------|
| Bu PC (Windows PM2) | `ecosystem.windows.config.js` → `src/index.ts` + `src/worker.ts` | development | yok |
| VDS dokümanı | `ecosystem.config.js` → `dist/shard.js` | production | `totalShards: 'auto'` |
| `pnpm start` | `node --import tsx dist/shard.js` | — | evet |

**Ön bilgiden sapmalar (DOĞRULANDI)**

| Ön bilgi | Gerçek |
|----------|--------|
| MongoDB + Prisma 6 | PostgreSQL (`prisma/schema.prisma` satır 6 `provider = "postgresql"`). `mongodb` paketi yalnızca `src/scripts` göç betikleri |
| 7/24 production VDS | Bu PC tek gerçek ortam (K2) |
| ts-node vs derlenmiş JS | Production PM2 `dist/*.js` ama `--import tsx`. Windows `src/*.ts` + tsx |
| raid / boss | `src/` içinde eşleşme yok |
| Hunt “mesaj → çok edit → final” | Hunt progress mesajı `buildHuntProgressMessage()` **null** döner; veteran hunt tek cevap. Animasyon **duel**’de (PNG + sleep) |

**Oyun sistemleri (repoda var):** hunt, loot/drops, rarity (config), XP, stat/upgrade, inventory, cooldown, crafting/dismantle, market, trade, biome (hunt), daily login/quests, prestige, runes, PvP/duel, gambling (slot/bj/cf), tame (buton), leaderboard, evrim. **Yok:** raid, boss (kod taraması).

---

### Hot path listesi

| Yol | Dosya | Not |
|-----|-------|-----|
| Prefix dağıtım | `src/commands/owl.ts` | Redis inflight + in-memory inflight; sonra `ensureRegistered` |
| Hunt | `owl-hunt.ts` → `systems/hunt.ts` `rollHunt` | Redis financial lock; `applyHuntDelta` Redis; persist kuyruk |
| Duel (sim) | `owl-pvp.ts` `runDuelMessage` 462–499 | **await** `runSimulatedPvP` + **await** `animateSimPvPMessage` |
| PvP vs | `owl-pvp.ts` 354–440 | Invite hemen reply; kabulde `i.update` sonra `simulatePvP`; animasyon fire-and-forget |
| Market/trade | global `interactionCreate` `index.ts` 313–339 | |
| Encounter/tame | `owl-hunt.ts` collector `enc_` / `tame_` | Global handler yok |
| Queue | `utils/db-queue.ts` | Bot: Queue producer; Worker: Worker concurrency `RUNTIME.dbQueueConcurrency` (varsayılan 64) |
| Cron | `jobs/background-jobs.ts` yalnızca worker | Shard’ta `startBackgroundJobs` yok |
| Cache | discord.js `makeCache` `index.ts` 112–135 | Mesaj 3000 / user 50000 / member 10000 (runtime varsayılan) |

---

### Hipotez sonuç tablosu (0.4)

| # | Hipotez | Sonuç | Kanıt | Güven |
|---|---------|-------|-------|-------|
| 1 | Statik oyun verisi her komutta DB/Redis | **Çürütüldü** (katalog). Prey/item `src/config.ts` `PREY` in-process. Oyuncu state Redis/PG. | `config.ts` 65+; `hunt.ts` import | DOĞRULANDI |
| 2 | Hunt animasyonu sleep + kilit | **Çürütüldü** hunt için. `buildHuntProgressMessage` null. Kilit `rollHunt` süresince, cevap öncesi biter. | `flow-intent.ts`; `hunt.ts` 212; `owl-hunt.ts` 199–221 | DOĞRULANDI |
| 3 | Hunt sonuç zamanı | **Önce hesap+yaz, sonra UI.** | `owl-hunt.ts` 199–221 sonra reply | DOĞRULANDI |
| 4 | Cooldown Redis vs DB; çift tık | **Redis TTL.** Hunt: peek sonra `armCooldown` (atomik Lua `guardCooldown` hunt’ta kullanılmıyor). `financial` lock kuyruğunda ikinci hunt cooldown’u yeniden bakmadan çalışabilir. Redis hata → fail-open 0. | `owl-hunt.ts` 118–221; `cooldown.ts` 15–61 | DOĞRULANDI (yarış tasarım boşluğu) |
| 5 | Envanter atomic mi | **Karışık.** Coin: Lua. Hunt inv: RMW Redis, lock altında. Sell: PG transaction sonra Redis mirror. Hunt Redis-first vs sell PG-first yarış riski. | `player-state.ts` 368–478; `owl-misc.ts` sell | KISMEN + bug adayı |
| 6 | Collector vs global | **İkisi de.** Trade/market global; hunt enc/tame/pvp invite collector. `registerCollector` hunt’ta yok. | `index.ts` 313+; `owl-hunt.ts` 412 | DOĞRULANDI |
| 7 | Leaderboard full scan | **Hot path Redis ZSET.** Boş ZSET → PG batch rebuild `findMany` id cursor. Prefix lb `fresh: true` snapshot cache’i bypass. Index: powerScore/totalHunts/coins var. | `leaderboard.ts`; `leaderboard-rebuild.ts`; `schema.prisma` 85–94 | DOĞRULANDI |
| 8 | Bağlantı çarpanı | Bu PC: 1 bot + 1 worker. Prisma bot default `connection_limit` 8, worker 25 (`env.ts` 74–77). ioredis singleton + bot `duplicate()` pub/sub + BullMQ ayrı `connection` objesi (`db-queue.ts` 39–46). Shard manager da producer açıyor. | `redis.ts` 10–24; `db-queue.ts`; `index.ts` 228 | KISMEN (TCP sayısı ölçülmedi; 6380’e bağlanılmadı) |
| 9 | Scheduled iş duplicate | **Çürütüldü shard×cron.** Cron yalnız worker. Shard 0: guild prune, feedback, compensation. Dev’de `SHARD_ID` yok → `isShard0()` true. | `worker.ts` 32–33; `shard.ts` `isShard0` | DOĞRULANDI |
| 10 | discord.js cache | Intent: Guilds, Messages, Members, MessageContent, DM. Reaction/emoji cache 0. Sweepers 300s/3600s. Presence yok. | `index.ts` 100–135 | DOĞRULANDI |
| 11 | Slash deploy her açılış | **Çürütüldü.** Yalnız `src/deploy-commands.ts` / `pnpm deploy:commands`. `index.ts` `loadCommands` lokal Collection. | `deploy-commands.ts` 74–92; `index.ts` 144, 254 | DOĞRULANDI |
| 12 | tsx vs dist; log | Windows: tsx + development. ecosystem.config: dist + tsx import + production. Prisma query log yok. discord.js DEBUG yok. | `ecosystem*.js`; `index.ts` PrismaClient | DOĞRULANDI |
| 13 | max_memory_restart leak mask | Windows 1536M/1024M; VDS 2800M/1600M. Soak yok; leak **ölçülemedi**. | ecosystem dosyaları | DOĞRULANAMADI (ölçüm yok) |
| 14 | İlk yanıt 3s | Slash/component: resmi Discord dokümanı **3 saniye** ilk cevap, token 15 dk. Prefix hunt/duel 3s kuralına tabi değil. Slash sim-duel `deferReply`. Prefix duel: önce `Rakip aranıyor` reply (487), sonra sim+animasyon await. | https://docs.discord.com/developers/interactions/receiving-and-responding ; `owl-pvp.ts` 264–266, 487–499 | DOĞRULANDI (sınır); hunt veteran’da prefix ilk mesaj `rollHunt` sonrası — 3s slash kuralı değil |

---

### Komut dağılımı (K4 — kayan pencere)

Kaynak: `logs/bot-out.log` son `[Perf] Ozet` **2026-09-23 20:01:55**, “son 120 örnek/komut”. Toplam komut sayısı değil; her komutun kendi son 120 örneği.

| Komut | n (pencere) | p50 | p95 | max |
|-------|-------------|-----|-----|-----|
| prefix:hunt | 120 | 427 ms | 1108 ms | 2042 ms |
| prefix:duel | 120 | 699 ms | 7398 ms | 9677 ms |
| prefix:upgrade | 15 | 582 ms | 2210 ms | 2210 ms |
| prefix:use | 5 | 420 ms | 668 ms | 668 ms |
| prefix:yardim | 5 | 572 ms | 1589 ms | 1589 ms |
| diğerleri | 1–3 | ~350–950 ms | — | — |

Önceki oturum (22 Eyl) `prefix:duel` p50 ~5948 ms / p95 ~7676 ms — p50 bu pencerede düşük (çoğu hızlı/cooldown?), kuyruk kuyruğu hâlâ uzun kuyruklu.

**Yorum (ölçüm değil, kod):** `runDuelMessage` animasyonu **await** eder (`owl-pvp.ts` 492–499). Animasyon sleep: intro 450 + 3–4×700 + outro 200 ≈ 2.8–3.5 s **artı** her kare `sharp` PNG (`battle-card.ts` 498–544). Ayrıca rakip `ORDER BY RANDOM()` (`pvp-sim.ts` 302–318). Animasyon zaman çizelgesi Bölüm 6 gereği **kısaltılamaz** (onaysız).

---

### İlk şüpheli noktalar (optimizasyon adayı; henüz değişiklik yok)

1. **Duel handler süresi** — await edilen PNG animasyon (davranış; dokunulmaz) + `ORDER BY RANDOM()` (davranış/RNG; sormadan değiştirilmez) + sharp CPU. Diz noktası adayı. Güven: KISMEN (log + kod; CPU profili yok).
2. **Hunt Redis vs sell PG** — tutarsızlık / kayıp av riski. **Bug adayı, düzeltme yok.**
3. **Hunt cooldown peek+arm** — kilit kuyruğunda ikinci hunt. **Bug adayı.**
4. **LiveOps `addXP` hunt lock dışında** — Redis/PG kayması. **Bug adayı.**
5. **Prefix lb `fresh: true`** — snapshot TTL’yi bypass. Davranış mı kasıtlı? Sorulacak.
6. **`tsx` production’da** — derlenmiş JS’i yine tsx ile yükleme; startup/CPU maliyeti ölçülmedi.
7. **BullMQ ayrı Redis client** + bot `duplicate()` — bağlantı sayısı ölçülmedi.
8. **Sync FS** `battle-card.ts` `existsSync`/`readdirSync` her kare/aday yolda — event loop. Ölçülmedi.
9. **RUNTIME.dbQueueConcurrency default 64** vs Windows `.env` düşük concurrency — worker varsayılanı yüksek; `.env` okunmadı, değer yazılmadı.

---

### 0.5 kalıp taraması (örnekler)

| Kalıp | Kanıt | Güven |
|-------|-------|-------|
| Sequential await (duel sim+anim) | `owl-pvp.ts` 489–499 | DOĞRULANDI |
| SQL `ORDER BY RANDOM()` | `pvp-sim.ts` 302–318 | DOĞRULANDI |
| Sync I/O | `battle-card.ts` existsSync/readdirSync | DOĞRULANDI |
| Collector time limit var | hunt/pvp collectors `time:` | KISMEN (leak soak yok) |
| N+1 hunt katalog | yok; config in-memory | DOĞRULANDI |
| Redis fail-open | cooldown/inflight catch true/0 | DOĞRULANDI |
| Fire-and-forget persist | `enqueuePersistPlayer` hunt | DOĞRULANDI |

---

### Dış kaynak doğrulama

| Konu | Kaynak | Sonuç |
|------|--------|-------|
| Interaction ilk yanıt | Discord docs Receiving and Responding | İlk cevap **3 saniye**; token **15 dakika** |
| Prisma 6 + PG havuzu | kurulu `env.ts` `appendPoolParams` | `connection_limit` bot 8 / worker 25 default; PgBouncer port 6432 → `pgbouncer=true` |
| BullMQ bağlantı | `db-queue.ts` 39–46, 196, 215 | Queue/Worker `connection` düz nesne; paylaşılan `redis` değil |
| discord.js cache | kurulu 14.26.2 + `index.ts` | `Options.cacheWithLimits` + Sweepers |

---

### Bug listesi (optimizasyondan ayrı; düzeltilmedi)

| ID | Özet | Risk | Onay |
|----|------|------|------|
| B1 | Hunt cooldown peek + post-arm; lock kuyruğunda ikinci hunt | Çift hunt / cooldown atlama | **Kapatıldı** — kontrol ve `armCooldown` financial kilit içinde |
| B2 | Hunt Redis inv vs sell PG | Kayıp/çift av, bakiye kayması | **Kapatıldı** — satış önce Redis envanterini PG'ye yazar; persist aynı kilidi kullanır |
| B3 | LiveOps addXP hunt financial lock dışında | XP/level kayması | **Kapatıldı** — bonus kilit içinde, mesaj sadece sonucu yazar |
| B4 | Redis hata fail-open cooldown/inflight | Korumasız burst | **Kapatıldı** — cooldown hata fırlatır, inflight alınamaz |
| B5 | `withLock` `finally` içinde `releaseLock` await edilmiyor (`lock.ts` 90–92) | Hızlı ardışık komutta sahte “işlem devam ediyor” | **Kapatıldı** |

---

### Doğruluk kontrolü (Faz 0)

- Mimari ve 14 hipotez dosya/satır ile bağlandı.
- Komut p50/p95 **log kayan pencere**; gerçek toplam dağılım değil.
- Redis CLIENT LIST, PG `pg_stat_activity`, heap soak **ölçülemedi** (canlı 6380/5433 yasağı).
- `ORDER BY RANDOM()` maliyeti tablosuz EXPLAIN yok.
- Animasyon süresinin p95’e katkısı kodla tutarlı; CPU profili yok.

---

## Faz 1 — izole baseline (2026-10-08)

`src/`, `prisma/`, `package.json`, canlı `.env`, 5433, 6380 dokunulmadı. Prisma `db push` yalnızca `127.0.0.1:5434/owlhunt_bench`. Harness `rollHunt` / `runSimulatedPvP` + `animateSimPvPMessage` + `FakeSentMessage`; Discord Gateway yok.

### Kurulum (DOĞRULANDI)

- Compose `owlhunt-bench`: Postgres `127.0.0.1:5434`, Redis `127.0.0.1:6390` (healthy). Canlı `5433`/`6380` dinlemeye devam etti.
- `.env.bench` `override: true`; `load-bench-env.ts` 5434/`owlhunt_bench` + 6390 zorunlu, 5433/6380 reddi.
- `DATABASE_URL` `connection_limit=8` (bot havuzu). Bench PrismaClient bu URL’yi kullanır.
- Redis bench: `noeviction`, 512mb (BullMQ uyarısı üzerine; canlı Redis değişmedi).
- `prisma db push --skip-generate` hedef: `"owlhunt_bench" at "127.0.0.1:5434"`.
- Seed sonrası bench: 5000 Player, 5000 Owl.
- BullMQ yalnızca producer; consumer yok. Soak sonrası bench Redis `DBSIZE=111555` (kuyruk birikimi, canlı 6380 değil).

### Harness sınırları (ölçüm yanlılığı)

- Prefix router, Discord RTT, hunt peek+arm cooldown (B1) yok.
- Persist job’ları kuyruğa girer, PG’ye işlenmez (hot path; DB lag latency’ye dahil değil).
- `--skip-anim` hâlâ 1 `sharp` PNG (`showSimPvPResultMessage`).
- PowerShell `10,100` virgülü iki argv parçası; parser birleştirir.
- Duel 5000 ve animasyonlu 1000 koşulmadı (1000 skip-anim p50 zaten 12.8s).

### Hunt kapasite eğrisi (`rollHunt`, eşzamanlı benzersiz oyuncu)

| n | wall ms | p50 | p95 | p99 | max | rss MB | eventLoop p99 ms | ok/n |
|---|---------|-----|-----|-----|-----|--------|------------------|------|
| 10 | 59 | 53 | 58 | 58 | 58 | 172 | 19 | 10/10 |
| 100 | 178 | 144 | 175 | 177 | 178 | 180 | 39 | 100/100 |
| 1000 | 1751 | 1711 | 1723 | 1724 | 1725 | 319 | 392 | 1000/1000 |
| 5000 | 7072 | 6197 | 6892 | 6960 | 6961 | 709 | 646 | 5000/5000 |

Kaynak: `benchmarks/results/baseline-hunt-1791474006750.json`, `...4020731.json`, `...4051599.json`.

Canlı log (2026-09-23, n=120 pencere) hunt p50 **427** / p95 **1108**. Bench n=10 p50 **53**. Fark: Discord + cooldown + reply; düşük yükte bot CPU/PG hunt’ın asıl maliyeti değil.

### Duel skip-anim (`SIM_PVP_SKIP_ANIM=1`, 1 PNG edit)

| n | wall ms | p50 | p95 | edits p50 | rss MB | eventLoop p99 | ok/n |
|---|---------|-----|-----|-----------|--------|---------------|------|
| 10 | 206 | 190 | 206 | 1 | 184 | 26 | 10/10 |
| 100 | 1214 | 1112 | 1201 | 1 | 258 | 28 | 100/100 |
| 1000 | 15401 | 12800 | 15096 | 1 | 561 | 122 | 1000/1000 |

Kaynak: `baseline-duel-skipanim-1791474068461.json`, `...4092813.json`.

### Duel animasyonlu (sleep + çok kare PNG)

| n | wall ms | p50 | p95 | edits p50 | rss MB | eventLoop p99 | ok/n |
|---|---------|-----|-----|-----------|--------|---------------|------|
| 10 | 3187 | 3171 | 3187 | 4 | 219 | 31 | 10/10 |
| 100 | 4911 | 4580 | 4893 | 4 | 331 | 33 | 100/100 |

Kaynak: `baseline-duel-1791474104528.json`, `...4117831.json`.

n=10 p50 **3171 ms** ≈ intro 450 + 3×700 + outro 200 + PNG. Canlı duel p95 **7398** ile uyumlu (Discord RTT + kare sayısı). `editsP50=4` kare sayısını doğrular. Event loop p99 duel’de ~30 ms — sync `existsSync` bu ölçekte p95 değil; süre **await sleep + sharp**.

### Soak (hunt, n=10, 90s + 20s hata örneği)

| Süre | rounds | ok | errors | rss start→end MB | heap end | eventLoop p99 |
|------|--------|----|--------|------------------|----------|---------------|
| 90s | 2620 | 23773 | 2427 | 170→269 | 65 | 27 |
| 20s | 569 | 5121 | 569 | 171→270 | 72 | 30 |

Hata (20s, tek mesaj): `⏳ İşlemin devam ediyor, bitene kadar bekle.` 569 hata / 569 round = **tur başına 1**. `withLock` kilidi tur bitince await edilmeden bırakılıyor; bir sonraki tur aynı oyuncuda NX kaçırıyor. Prod 7s hunt CD bunu gizler.

RSS 90s ve 20s aynı ~270 MB plato — 90s pencerede sınırsız sızıntı **görülmedi**. RSS artışı kısmen harness (BullMQ job birikimi, JIT). Güven: KISMEN (consumer yok; 10 dk+ soak yok).

### Güvenlik / izolasyon

- Dinleyen portlar koşu sonunda: 5433, 6380, 5434, 6390. Bench sorguları yalnızca `owlhunt-bench-*`.
- `.env` okunmadı / yazdırılmadı.

---

## Faz 2 — bulgu kataloğu (2026-10-08, src değişikliği yok)

Öncelik 10 kişilik test ekibi (K2) + ölçülen eğri. Faz 3’te davranış/RNG/index değişen maddeler sorulur.

| ID | Öncelik | Bulgu | Kanıt | Davranış riski | Önerilen yön (uygulanmadı) |
|----|---------|-------|-------|----------------|----------------------------|
| O1 | P1 | Duel skip-anim 1000× p50 12.8s vs hunt 1000× 1.7s. Rakip `ORDER BY RANDOM()` (`pvp-sim.ts` 302–318) + havuz 8 + 1 PNG | Faz 1 skip-anim tablosu | Rakip dağılımı değişirse RNG | TABLESAMPLE / önceden seçilmiş havuz / `RANDOM()` yerine indexed örnek — **onaysız yok** |
| O2 | — | Duel handler ~3.2s’i animasyon await’i | n=10 p50 3171, edits 4 | Zaman çizelgesi kilitli | Sleep kısaltılmaz. İnceleme: inflight kilidinin animasyon boyunca tutulması (ayrı UX) |
| O3 | P2 | Hunt n=1000+ p50, PG `connection_limit=8` kuyruğu + event loop 392–646 ms | hunt 1000/5000 satırları | Havuz büyütmek canlı PG’yi etkiler | 10 oyuncu için acil değil. Ölçeklenince bot havuzu / kuyruk ayrımı ölç |
| O4 | P2 | Canlı hunt p50 427 vs bench 53 (n=10) | log vs harness | Yok | Gateway/reply/cooldown enstrümantasyonu; `src` hot path değil |
| O5 | P3 | `battle-card.ts` `existsSync`/`readdirSync` her aday yolda | kod; duel eventLoop ~30 ms | Yol cache davranışı nötr olmalı | Sprite path memo — düşük kazanç bu ölçekte |
| O6 | P3 | `tsx` production `--import tsx` | Faz 0 | Startup | Ayrı startup bench; şimdi değil |
| O7 | P3 | Prefix `w lb` `fresh: true` | Faz 0, K11 | Kasıt belirsiz | Dokunulmaz |
| B1–B4 | bug | Faz 0 listesi | kod | Oyun doğruluğu | Optimizasyon değil; onaylı fix |
| B5 | bug | Unawaited `releaseLock` | soak 1 busy/tur; `lock.ts` 90–92 | Hızlı çift komut | Await finally; B1 ile birlikte düşün |

**10 kişilik ekip için darboğaz sırası:** (1) duel animasyon süresi — kilitli, kullanıcıya görünen p95 bu; (2) duel `ORDER BY RANDOM()` — 10 oyuncuda ihmal, 1000+ sanalda diz; (3) hunt PG havuzu — 10 eşzamanlıda p95 58 ms, sorun değil.

Faz 3 başladı — aşağıdaki bölüm.

---

## Faz 3 — davranış-nötr uygulama (2026-10-08)

Dokunulmadı: animasyon sleep, `ORDER BY RANDOM()`, B1–B4, `w lb` `fresh:true`, 5433/6380, `.env`.

### Uygulanan maddeler

| ID | Değişiklik | Davranış |
|----|------------|----------|
| O5 | `battle-card.ts`: font/path/`readdir` memo + portre PNG buffer cache | Aynı dosya, aynı piksel; event loop FS ve tekrar `sharp` resize yok |
| hunt createdAt | Hydrate Redis’e `createdAt` yazar; `rollHunt` ekstra PG’yi atlar; retention’a tarih geçilir | Formül aynı. Cache’te tarih varsa 2. `findUnique` yok. Eski Redis anahtarları bir kez backfill |
| B5 | `withLock` / `withResourceLock` `finally` içinde `await releaseLock` | Kilit semantiği tasarlandığı gibi; sahte busy azalır |
| hunt parallel | `getRetentionBonusSafe` + `tickHuntMilestone` + no-op microEvent `Promise.all` | Bağımsız I/O; milestone ödülü aynı |

### Yeni bug (düzeltilmedi)

| ID | Özet | Risk |
|----|------|------|
| B6 | `tickHuntMilestone` → `addXP` level-up coin `withLock(financial)` hunt’ın financial kilidi içinde | **Kapatıldı** — aynı çağrı yığınında yeniden girilir (aşağıdaki tablo) |

### Ölçüm (aynı harness, 5434/6390)

Hunt (FLUSHDB sonrası, 10/10 ok): n=10 p50 **48** (baz **53**), p95 **50** (baz 58). n=100 p50 **172** (baz **144**) — iyileşme yok, gürültü / soğuk cache.

Duel skip-anim: n=10 p50 **166** (baz **190**). n=100 p50 **877** (baz **1112**, p95 1201→1004). ~%21 duvar süresi.

Duel animasyonlu n=10 p50 **3157** (baz **3171**) — sleep baskın, beklendiği gibi.

Soak 20s hunt×10: hâlâ lock busy (1780/7670). B5 birim testi geçti; kalan B6 (veteran seed + iç içe kilit). Animasyon/`RANDOM()` yok.

Kaynak: `baseline-hunt-1791487426634.json`, `baseline-hunt-1791487474400.json`, `baseline-duel-skipanim-1791487478228.json`, `baseline-duel-1791487483876.json`.

### Doğruluk

- `ordered-locks`, `retention`, `newbie-boost`: 42 test geçti.
- O1 uygulanmadı (RNG). O2 uygulanmadı (sleep). B1–B4 uygulanmadı.

### Canlı restart + devam (aynı gün)

Her kod değişikliğinden sonra `pm2 restart owlhunt-bot owlhunt-worker`. İkisi de `online`, log: `Bot baglandi: OwlHunt-test`.

| Değişiklik | Ne | Restart |
|------------|----|---------|
| Prestij dex | `recordOwlMoonDexUnlocks` artık `createMany({ skipDuplicates: true })`. `w owls` iki baykuşu paralel yazınca P2002 komutu düşürüyordu. Mevcut satırın tarihi durur. | atıldı, bot bağlandı |
| B6 | `withLock` aynı çağrı yığınında ikinci kez Redis kilidi istemez (av içinden `addXP` level-up coin). İki iç çağrı aynı anda girerse ikincisi yine meşgul. Başka oyuncu/istek hâlâ NX ile bekler. | atıldı |
| Günlük görev | `ensureDailyQuests` `createMany({ skipDuplicates: true })`. Paralel hunt-quests aynı `(playerId,type,resetAt)` upsert’te P2002 atıyordu. Set oyuncu+gün ile aynı; mevcut ilerlemenin üstüne yazılmaz. | atıldı |
| Bot duyurusu | `announceBotOnline` şimdilik kapalı. Restart Discord’a rol etiketi atmaz. | atıldı |
| O1 ölçüldü, uygulanmadı | Bench 5000 main: `ORDER BY RANDOM() LIMIT 1` **1.7 ms** (top-N heapsort). `OFFSET floor(random()*count)` **5.2 ms** (tüm id sıralanıyor). Dağılım aynı olsa da daha yavaş; kod geri alındı. | restart yok |
| Duel okuma | `w duel` / slash duel: HP tamiri + main baykuş tek `findFirst`; cooldown Redis’i aynı anda. İki ayrı PG okuma kalktı. Mesaj sırası aynı: baykuş yoksa hata, sonra cooldown. | atıldı |
| B1 | İkinci av, birincinin kilidi bitmeden peek’i geçmiş olamıyor. Cooldown hâlâ 7 sn, av bittikten sonra kuruluyor. | atıldı |
| B2 | `w sell` financial kilitte `flushRedisInventoryToPg`. Worker persist aynı kilidi ister. | atıldı |
| B3 | LiveOps XP `rollHunt` kilidinin içinde. Satır metni aynı. | atıldı |
| B4 | Cooldown Redis hatası komutu durdurur. Inflight Redis hatasında komut “meşgul” sayılır, serbest kalmaz. | atıldı |
| O2 | Animasyon süreleri aynı. `await` kalktı; komut kilidi kareler bitene kadar tutulmuyor. Ödül ve cooldown animasyondan önce. | atıldı |
| O7 | Prefix `w lb` `fresh: true` kalktı. Sıralama snapshot önbelleğini kullanır. | atıldı |
| O1 | Ölçüldü, daha yavaş alternatif geri alındı. `ORDER BY RANDOM()` duruyor. | — |
| O3 | 10 kişide hunt p95 ~50 ms. Canlı havuz büyütülmedi. | — |
| O6 | Windows bot `src/*.ts` + tsx ile çalışıyor. Derlenmiş girişe geçilmedi. | — |

## Ölçek — yüzlerce eşzamanlı oyuncu (2026-10-08)

10 kişilik ekip varsayımı bırakıldı. Hedef: çok sunucu, aynı anda yüzlerce oyuncu. Animasyon sleep süreleri ve rakip olasılığı aynı.

| Değişiklik | Ne |
|------------|----|
| O3 | `BOT_DB_POOL_LIMIT` / `WORKER_DB_POOL_LIMIT` adresin içindeki `connection_limit` değerini ezer. Windows PM2: bot 16, worker 20. PgBouncer’lı VDS ecosystem dosyasına yazılmadı; oradaki adres limiti durur. |
| Rakip havuzu | Main sahibi `ownerId` Redis SET. Seçim `SRANDMEMBER` + `(ownerId, isMain)` okuması. Havuz boşsa veya Redis yoksa eski `ORDER BY RANDOM() LIMIT 1` yedek. `OFFSET` sorgusu yok. Worker açılışta havuzu doldurur. |
| Kart çizimi | Aynı anda en fazla 8 `sharp` kartı. Kare bekleme süreleri değişmedi; yük altında çizimler sıraya girer. |

Bench 5434/6390, havuz 16, Redis flush sonrası:

| İş | Eşzamanlı | p50 | Duvar | Eski |
|----|-----------|-----|-------|------|
| Av | 200 | 252 ms | 261 ms | n=100 p50 144–172 ms (havuz 8) |
| Av | 500 | 646 ms | 742 ms | n=1000 p50 1711 ms (havuz 8) |
| Düello, animasyonsuz | 100 | 790 ms | 1091 ms | p50 877 ms |
| Düello, animasyonsuz | 200 | 1049 ms | 1583 ms | n=1000 p50 12.8 s |

500 eşzamanlı avın hepsi bitti, event loop p99 235 ms. Düelloda süre hâlâ tek PNG; havuz taraması yedek yolda.

