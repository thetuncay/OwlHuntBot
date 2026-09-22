# 100 sunucu kapasite profili

Bot **tek uygulama**, **global ekonomi**; 100 sunucu = 100 Discord guild, ayrı bot değil.

## Mimari (değişmez)

- `owlhuntbot-shard` → ShardingManager (`totalShards: 'auto'`)
- `owlhuntbot-worker` → tek BullMQ consumer (tüm sunucular)
- Redis + PostgreSQL paylaşımlı

## `.env` — 100 sunucu hedefi

| Değişken | ~50 pilot | 100 profil | Açıklama |
|----------|-----------|------------|----------|
| `MAX_GUILDS` | 50 | **100** | Davet üst sınırı |
| `MAX_CONCURRENT_COMMANDS` | 40 | **80** | Global komut kapısı |
| `DB_QUEUE_CONCURRENCY` | 64 | **80** | Worker DB yazma paralelliği |
| `BOT_DB_POOL_LIMIT` | 8 | **12** | Shard başına PG pool |
| `WORKER_DB_POOL_LIMIT` | 25 | **32** | Worker PG pool |
| `HEALTH_QUEUE_FAILED_MAX` | 50 | **100** | Health uyarı eşiği |
| `DISCORD_CACHE_MESSAGES` | 3000 | **5000** | RAM / prefix |
| `DISCORD_CACHE_USERS` | 50000 | **120000** | Çok guild kullanıcı cache |
| `DISCORD_CACHE_MEMBERS` | 10000 | **25000** | Üye cache |
| `COMMAND_RATE_LIMIT_TOKENS` | 4 | **4** | Spam koruması (oyuncu başına) |

## Redis (Docker)

50 sunucu ~2.4 GB `maxmemory` yeterliydi; 100 sunucu için **~4 GB** hedefleyin:

```yaml
# docker-compose.yml → redis service
--maxmemory 4000mb
mem_limit: 4300m
```

Değişiklikten sonra (kısa kesinti):

```bash
docker compose up -d redis
```

Haftalık: `npx tsx scripts/redis-footprint-audit.ts`

## PM2 bellek

| Process | Eski | 100 profil |
|---------|------|------------|
| `owlhuntbot-shard` | 1500M | **2200M** |
| `owlhuntbot-worker` | 800M | **1200M** |

## Davet stratejisi

100’e **bir günde** çıkmayın. Öneri:

1. `MAX_GUILDS=100` + yukarıdaki `.env`
2. `pnpm build` + `pm2 restart` (bakım penceresi)
3. Redis 4 GB doğrula
4. Kademeli davet: 50 → 65 → 80 → 100 (her adımda `/health` `SAFE`, p95 &lt; 3s)
5. `docs/PILOT_LAUNCH.md` Stage 5 metrikleri

## İzleme (günlük / yoğun gün)

```bash
curl -s http://127.0.0.1:3010/health | jq '.status,.readiness,.checks.queue,.latency'
pm2 list
npx tsx scripts/redis-footprint-audit.ts
```

Discord’da: `/admin sys ops view:system|traffic|infra`

## Ne zaman yeterli değil?

| Belirti | Olası adım |
|---------|------------|
| `queue.waiting` &gt; 200 sürekli | `DB_QUEUE_CONCURRENCY` 96–128, worker CPU |
| Redis &gt; 85% maxmemory | 4→6 GB veya key TTL audit |
| p95 &gt; 4s sürekli | `MAX_CONCURRENT_COMMANDS` 100, VDS CPU |
| Discord 2+ shard + RAM | `NODE_OPTIONS` / shard PM2 limit ↑ |
| Readiness `BLOCKED` | Worker heartbeat, PG, Redis — davet durdur |

İkinci worker veya ikinci VDS yalnızca metrikler 100 profilde **haftalarca** kırmızıysa gündeme alınır.

## Performans SLO (hunt kritik yol)

| Metrik | Hedef (100 guild) | Ölçüm |
|--------|-------------------|-------|
| Hunt p95 (sıcak cache) | &lt; 800 ms | `HUNT_HOTPATH_PROFILE=1`, `ops:hunt:hotpath:v1` |
| Hunt p95 (soğuk / yeni oyuncu) | &lt; 1500 ms | Aynı |
| Sıcak hunt PG reads | 0 | hotpath `pgReads` |
| `queue.waiting` (sürekli) | &lt; 50 | `/health` |
| Komut p95 (genel) | &lt; 3 s | `/health` latency |

Kritik yol: Discord cevabı öncesi Redis state + hunt math; quest, buff drain, prey dex ve stats BullMQ veya `runDetached` ile arka planda.

Profil: `.env` → `HUNT_HOTPATH_PROFILE=1`, yoğun saat sonrası `pnpm perf:report`.

## Rollback

- Davetleri durdur
- `MAX_GUILDS` geçici 50
- Eski `.env` yedek + `pm2 restart`
- Kritikse maintenance (`/admin sys maintenance`)
