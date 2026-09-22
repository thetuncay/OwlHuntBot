# FEATURE_PLAN — Düello eşleşme + adil güç

## 1. Problem

Düelloda güncel HP ile savaş + %90 bot + aynı rakip tekrarı → “hep kaybediyorum” ve seyrek gerçek eşleşme.

## 2. Goal

- ~%80 gerçek main denemesi; bot yedek.
- Full HP/stamina sim savaş.
- Son 5 rakip 2 saat tekrar edilmez.
- Bot zorluğu kolay ağırlıklı.

## 3. UX

Değişmez komut: `w duel`. Rakip satırı player/bot aynı.

## 4–5. Systems / modules

`config.ts`, `pvp-sim.ts`, testler.

## 6. Database

Yok.

## 7. Economy

Aynı coin/XP; bot win rate yükselir (farm) — `DUEL_DAILY_COIN_CAP` duruyor.

## 8. Gameplay

Competence + relatedness (gerçek snapshot). Gizli DDA yok.

## 9. Edge

Tek başka oyuncu: exclude gevşer. Hiç oyuncu yok: bot.

## 10. Tests

`pvp-sim-a2` — full HP, exclude fallback, difficulty weights.

## 11. Rollback

Config + pick/HP satırlarını geri al.

## 12. Metrics

`opponent.source` dağılımı (log/quest dışı mevcut sonuç).
