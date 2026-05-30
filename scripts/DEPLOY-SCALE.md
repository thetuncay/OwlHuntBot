# OwlHuntBot — Redis-First Scale Deploy Checklist

Tek VDS hedefi: Discord shard (bot) + ayri DB worker + Redis hot state + PgBouncer.

## 1. Ortam

```bash
cp .env.example .env
# Duzenle: DISCORD_TOKEN, CLIENT_ID, GUILD_ID
# REDIS_URL=redis://localhost:6380
# DATABASE_URL="postgresql://postgres@localhost:6432/owlhuntbot"
```

## 2. Altyapi

```bash
docker compose up -d postgres redis pgbouncer
docker compose ps
```

## 3. Build ve PM2

```bash
pnpm install
pnpm build
pm2 delete owlhuntbot owlhuntbot-shard owlhuntbot-worker 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
```

## 4. Dogrulama

```bash
# Bot: Discord baglantisi, queue CONSUMER olmamali
pm2 logs owlhuntbot-shard --lines 50

# Worker: BullMQ consumer + cron loglari
pm2 logs owlhuntbot-worker --lines 50

# Redis hit orani
redis-cli -p 6380 INFO stats | grep keyspace

# Postgres baglanti sayisi (dusuk kalmali)
docker exec -it $(docker ps -qf name=postgres) psql -U postgres -d owlhuntbot -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='owlhuntbot';"
```

## 5. Stres testi (manuel)

- 5-10 kullanici ile ard arda `owl hunt`
- Beklenen: hunt cevabi <500ms (encounter followUp ayri gelir)
- `pg_stat_activity` active count spike etmemeli
- Worker logunda `persistPlayer` joblari gorulmeli

## 6. Sorun giderme

| Belirti | Kontrol |
|---------|---------|
| Hunt hala yavas | `REDIS_URL` 6380 mi? Worker calisiyor mu? |
| Coin/envanter kaybi | `pm2 logs owlhuntbot-worker` failed job |
| Cift cron / sezon | Sadece worker'da cron olmali, eski tek-app PM2 silinmeli |
| Redis state kaybi | AOF acik (`appendonly yes`); worker dirty sweep 60s |
