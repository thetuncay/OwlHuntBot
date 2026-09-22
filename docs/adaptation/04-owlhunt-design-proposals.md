# OwlHunt Design Proposals (klasik bot Principles, Not Clone)

Her öneri: **klasik bot ilkesi** → **OwlHunt farklılaştırma** → **metrik hedefi**.

---

## 1. Av–Düello Momentum (Combo Chain)

**klasik bot ilkesi:** `hunt → battle` en güçlü geçiş (7,918 kayıt).  
**OwlHunt:** 10 dk içinde `hunt` ardından `duel` → **Momentum +1** (max 3). Her stack: +%3 catch veya +%5 duel loot, tema: “Baykuş avdan döndü, savaşa hazır.”  
**Metrik:** `loop_completion_rate` ≥ %40; duel/hunt oranı +%15.  
**Risk:** Abuse → momentum sadece farklı session tick’lerinde artar.

---

## 2. Yuva Satış Asistanı (QoL, autohunt değil)

**klasik bot ilkesi:** `hunt → sell` ve `sell` kısa gap.  
**OwlHunt:** `/owl sell suggest` — envanterde düşük tier prey listesi + tek mesajda onaylı toplu satış (macro yok, onay zorunlu).  
**Metrik:** sell komut süresi −%30; hunt sonrası 2. komut olarak sell oranı +%10.  
**Fark:** klasik bot autohunt yok; manuel onaylı, ToS-dostu.

---

## 3. Segment Görevleri (Grind / Gamble / Hybrid)

**klasik bot ilkesi:** 84 grind-heavy, 66 gamble-heavy kullanıcı.  
**OwlHunt:** Günlük 3 görev slotu — oyuncunun son 7 gün `playerType`’ına göre havuz (grind: hunt+duel, gamble: cf+bj, hybrid: karışık).  
**Metrik:** D1 retention +%5; `quests` completion ≥ %55.  
**Fark:** Tek daily yerine kişiselleştirilmiş üçlü.

---

## 4. Gamble Yumuşak Decay (Anti-spam)

**klasik bot ilkesi:** cf/bj p50 gap ~19s, kısa cooldown alışkanlığı.  
**OwlHunt:** Aynı 5 dk pencerede 15+ gamble → ödül çarpanı −%2/stack (max −%20); cooldown süresini uzatmaz.  
**Metrik:** cf commands/user/session −%10; ekonomi net_roi −%2..0 bandında.  
**Fark:** Sert ban yerine ekonomik yumuşak fren.

---

## 5. Buff Duaları (Pray Evrimi)

**klasik bot ilkesi:** pray uzun aralık (p50 559s), düşük frekans.  
**OwlHunt:** `buffs` — 8 saatte bir “Dua” seçimi (av / düello / şans); 1 saat küçük buff, görsel custom emoji.  
**Metrik:** buffs kullanım / DAU ≥ %25; ilgili intent ROI +%3.  
**Fark:** klasik bot pray statik; OwlHunt seçimli ve temalı.

---

## 6. Peak Saat Etkinliği (18–21 UTC)

**klasik bot ilkesi:** Peak saatler net.  
**OwlHunt:** “Gece Avı” — UTC 18–21 arası +%10 XP, +%5 nadir şans (cap günlük).  
**Metrik:** Peak saat DAU +%8; off-peak düşüş ≤ %3.  
**Fark:** Global event, pay-to-win değil.

---

## 7. Kısa Prefix Migrasyon UX

**klasik bot ilkesi:** `wh/wb/wcf` baskın.  
**OwlHunt:** Unknown’da `buildAliasMigrationHint` + bir kerelik “komut geçiş” quest (5 hunt, 2 duel) → 500 coin.  
**Metrik:** unknown komut oranı −%40; ilk hafta hunt komutları +%20.  
**Fark:** Ceza değil öğretici ödül.

---

## 8. Duel Günlük Cap Şeffaflığı

**klasik bot ilkesi:** Battle ekonomisi sınırlı olmalı.  
**OwlHunt:** `DUEL_DAILY_COIN_CAP` progress bar embed; cap dolunca duel hâlâ XP verir, coin vermez.  
**Metrik:** cap hit rate %5–15; şikayet/“nerede coin” ticket −%50.  
**Fark:** Gizli cap yerine görünür progression.

---

## 9. Zoo Vitrin (Koleksiyon Sosyal)

**klasik bot ilkesi:** zoo düşük frekans ama koleksiyon segmenti var.  
**OwlHunt:** `/owl zoo` — en nadir 5 prey + “vitrin paylaş” (embed, mention yok).  
**Metrik:** zoo komut / hafta +%30; collection segment retention +%10.  
**Fark:** klasik bot zoo listesi yerine vitrin odaklı.

---

## 10. Hunt Pity Görünürlüği

**klasik bot ilkesi:** Uzun grind, nadir drop beklentisi.  
**OwlHunt:** Mevcut `HUNT_PITY_*` değerlerini oyuncuya “Şans Isıtıcısı 6/8” olarak göster (zaten config’te var).  
**Metrik:** 8+ hunt streak drop-off −%15.  
**Fark:** Gizli pity yerine şeffaflık.

---

## 11. PvP Gamble Evrensel Cooldown Mesajı

**klasik bot ilkesi:** cf spam ve toxic loop.  
**OwlHunt:** Tek satır cooldown (`⏱ | {user}, Biraz yavaşla~ {n} sn sonra`) — tüm gamble/duel/hunt için ortak ton.  
**Metrik:** duplicate spam mesaj −%60; UX tutarlılık anketi ↑.  
**Fark:** klasik bot metninin kopyası değil, aynı sadelik.

---

## 12. Ekonomi Haftalık Rapor (Oyuncuya)

**klasik bot ilkesi:** cash/ekonomi komutları sık.  
**OwlHunt:** `/owl cash weekly` — son 7 gün source/sink özeti (kişisel).  
**Metrik:** cash komut engagement +%20; ekonomi şikayeti −%25.  
**Fark:** Sadece bakiye değil davranış özeti.

---

## Öncelik sırası (uygulama)

| P | Öneri | Efor | Etki |
|---|-------|------|------|
| P0 | #7 Prefix migrasyon, #11 Cooldown UX | Düşük | Yüksek |
| P1 | #1 Momentum, #4 Gamble decay, #10 Pity UI | Orta | Yüksek |
| P2 | #3 Segment quests, #6 Peak event | Orta | Orta |
| P3 | #2 Sell assist, #9 Zoo vitrin, #12 Weekly cash | Orta | Orta |

## Başarı ölçümü (12 hafta)

- D7 retention: +%8
- Core loop (hunt→duel): +%15 transition
- sink/source: 0.9–1.1
- Parser unknown: < %8
