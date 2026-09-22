# OwlHuntBot — Leaderboard Refactor Plan

Denetim raporu sonrası uygulanan 6 fazlı refactor. Kod referansları `src/systems/leaderboard-*.ts` altında.

---

## PHASE 1 — Kritik Hatalar (hotfix)

### Yapılacaklar
- Sezon reset'te legacy + yeni ZSET anahtarlarını temizle (`leaderboard-season.ts`).
- `fetchPower` / `fetchWealth` ORDER BY'larını skor alanıyla hizala (`leaderboard-queries.ts`).
- `pvp.ts` ve `gambling.ts` → Redis ZSET canlı güncelleme (`redis` + `guildId` geçir).
- `getRankFromSortedSet` → tam rebuild (`leaderboard-rebuild.ts`), sadece top-100 seed değil.
- Embed footer TTL metnini gerçek değerle hizala (`leaderboard-ux.ts`).

### Risk
- Düşük: davranış düzeltmesi; mevcut sıralama geçici olarak değişebilir.
- ZSET rebuild yoğun Redis/DB yükü (admin backfill ile tetiklenir).

### Tahmini süre
- 1–2 gün (geliştirme + test)

### Rollback
- Git revert + `pnpm build` + onaylı `pm2 restart owlhuntbot-shard owlhuntbot-worker`.
- Redis: `/admin lb cache` veya `scripts/leaderboard-migrate-keys.ts --rebuild-only`.

---

## PHASE 2 — Veri Modeli

### Yapılacaklar
- `LeaderboardScore` tablosu: `(scope, category, period, playerId)` unique, `score BigInt`.
- `Player.totalCoinsLost` — net servet skoru için.
- `@@unique([playerId, type, resetAt])` → `DailyQuest`.
- `@@unique([playerId, seasonId])` → `SeasonArchive`.
- Index: `Player.pvpCount`, `SeasonArchive(seasonId, *Score DESC)`.
- Player `Int` alanları korunur; overflow için `LeaderboardScore.score` BigInt kullanılır.

### Risk
- Orta: migration production'da kilit süresi (küçük tablolar için düşük).
- Unique constraint mevcut duplicate satırlarda migration fail → önce dedup script.

### Tahmini süre
- 2–3 gün (migration + Prisma client + write path)

### Rollback
- Migration geri alma SQL (down migration) veya snapshot restore.
- `LeaderboardScore` okuma kapalı tutulabilir (feature flag yoksa revert).

---

## PHASE 3 — Performans

### Yapılacaklar
- Sezon arşiv + reset: sayfalı batch (`leaderboard-season.ts`, `BATCH_SIZE=500`).
- Rank: `ZREVRANK` tek kaynak; `getRankFromDB` COUNT fallback kaldırıldı.
- Cache stampede: Redis `SET NX` singleflight (`leaderboard-cache.ts`).
- `CommandEvent` partition hazırlığı dokümante (100K+ için opsiyonel SQL).

### Risk
- Düşük–orta: batch reset sırasında kısa tutarsızlık penceresi.

### Tahmini süre
- 2 gün

### Rollback
- Eski `updateMany` path'e revert (tek commit).

---

## PHASE 4 — Cache Sistemi

### Yapılacaklar
- Key şeması: `lb:z:{scope}:{category}:{period}` (ZSET).
- Snapshot: `lb:s:{scope}:{category}:{period}:t{N}` (JSON, TTL 1800s).
- Top 10/100/1000: `ZREVRANGE` + ayrı snapshot boyutları (10, 100, 1000).
- Skor yazımı: atomik pipeline ZADD (tüm period + scope) + PG upsert write-behind.

### Risk
- Orta: key migration sırasında çift yazım gerekir (PHASE 6).

### Tahmini süre
- 3 gün

### Rollback
- Legacy `lb:{category}` rebuild (`scripts/leaderboard-migrate-keys.ts --legacy`).

---

## PHASE 5 — Yeni Leaderboard

### Yapılacaklar
- Guild scope: `/lb kapsam:sunucu` → `scope=g:{guildId}`.
- Period: season (varsayılan), week, month, alltime (admin/API genişletilebilir).
- Net servet: `totalCoinsEarned - totalCoinsLost`.
- Günlük kap + diminishing returns (`leaderboard-scoring.ts`):
  - `LB_DAILY_CAP_HUNT`, `LB_DAILY_CAP_WEALTH` config.
  - Hunt LB skoruna diminishing returns (spam caydırıcı).
- Anti-abuse: mevcut `abuse-analytics` sinyalleri korunur.

### Risk
- Orta: guild leaderboard yeni oyuncular için boş görünebilir (yeni yazımlardan dolar).
- Net wealth mevcut oyuncularda `totalCoinsLost=0` → geçmiş kayıp yansımaz (backfill opsiyonel).

### Tahmini süre
- 3–4 gün

### Rollback
- Komut varsayılanı global scope; guild seçeneği gizlenebilir.

---

## PHASE 6 — Migration

### Yapılacaklar
- `scripts/leaderboard-migrate-keys.ts`:
  - PG → ZSET full rebuild (tüm oyuncular, batch).
  - Legacy `lb:{cat}` → yeni key şeması (opsiyonel `--from-legacy`).
  - `--rebuild-only` / `--dry-run`.
- `/admin lb backfill` → rebuild + backfill entegrasyonu.
- Rollout: deploy → migration SQL → script → PM2 restart (onaylı).

### Risk
- Yüksek: büyük DB'de rebuild süresi; peak saat dışı çalıştır.
- Redis memory spike (tüm ZSET'ler).

### Tahmini süre
- 1 gün script + 1 saat prod pencere

### Rollback
- Eski key formatına rebuild (`--legacy`).
- PG verisi korunur; Redis yeniden seed edilebilir.

---

## Deploy checklist

1. `prisma migrate deploy` (kullanıcı onayı ile)
2. `pnpm build`
3. `pnpm migrate:leaderboard -- --rebuild-only`
4. `pm2 restart owlhuntbot-shard owlhuntbot-worker` (onaylı)
5. `/admin lb cache` veya otomatik snapshot yenileme
6. Smoke: `/lb`, `/lb kapsam:sunucu`, sezon bilgisi `/admin lb season`

---

## Mimari özet

```
Komut (/lb) → getLeaderboard(scope, period)
  → snapshot cache (singleflight)
  → miss: ZREVRANGE lb:z:{scope}:{cat}:{period}
  → viewer rank: ZREVRANK

Skor kazanımı → recordStats / recordPvpWin / recordWealthDelta
  → PG increment (Player)
  → syncLeaderboardScores → ZADD all periods × scopes
  → upsert LeaderboardScore (write-behind)
  → invalidate snapshot keys
```
