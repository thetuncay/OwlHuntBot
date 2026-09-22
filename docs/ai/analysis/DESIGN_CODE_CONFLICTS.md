# DESIGN_CODE_CONFLICTS — Belge vs Kod Çelişkileri

> Kaynak öncelik sırası: **kod > schema > test > memory-bank > audit belgesi > action-list > engagement review > varsayım.**
>
> Bu belge audit'te (`owlhunt-core-design-audit.md`) tespit edilen çelişkilere + kod okumasında ek bulunanları ekler. Her çelişki için: **problem tanımı → kod referansı → belge referansı → çözüm önerisi (DDR veya kural).**

---

## 1. Daily maintenance ceza ↔ Milestone silent-reset felsefesi

- **Belge (audit §7 Ç2):** Milestone silent-reset = "grace-friendly"; maintenance = "ceza modeli". İç tutarsızlık.
- **Kod:**
  - Silent-reset: [`hunt-milestones.ts:166`](../../../src/systems/hunt-milestones.ts) — Redis TTL 24h ile sessiz sıfırlanma.
  - Ceza: [`economy.ts:34-49`](../../../src/systems/economy.ts) — `MAINTENANCE_MISS_EFFECTIVENESS_LOSS = 5` kalıcı düşüş.
- **Çözüm:** [`DECISION-001`](../decisions/DECISION-001-daily-maintenance-rework.md) — ceza → bonus.

## 2. Gambling gizli streak modifier ↔ Algılanan adalet

- **Belge (audit §5):** `streakModifier` gizli rubber-band = paternalist tasarım; kullanıcı şikayeti direkt link.
- **Kod:**
  - `streakModifier` [`gambling.ts:32-38`](../../../src/systems/gambling.ts) — WIN_3=-2%, WIN_5=-5%, LOSS_3=+3%, LOSS_5=+5%.
  - Retention nudge aynı satırda: `getGambleRetentionBonusSafe` + `finalWinChance(base, coins, bet, modifier)`.
- **Çözüm:** [`DECISION-002`](../decisions/DECISION-002-gambling-streak-modifier.md) — modifier'ı kaldır veya görünür yap; retention nudge'ı gambling'den çek.

## 3. Gizli pity + level softcap ↔ SDT autonomy

- **Belge (audit §3):** Pity mevcut ve doğru tasarlanmış ama görünmüyor; level softcap da gizli → "haksızlık algısı".
- **Kod:**
  - Pity: [`hunt.ts:278-283`](../../../src/systems/hunt.ts) — `noRareStreak >= HUNT_PITY_THRESHOLD(=8)` ile devreye giriyor, max %25.
  - Level softcap: [`drops.ts:LEVEL_SOFTCAP_START=20`](../../../src/systems/drops.ts) — her level −%1, max −%30.
- **Çözüm:** [`DECISION-003`](../decisions/DECISION-003-pity-and-softcap-transparency.md) — hunt sonucu satırında pity sayacı + `/owl help drops` ile drop tablosu.

## 4. Auto-guarantee (min prey) ↔ Anticipation eğrisi

- **Belge (audit §1 What Doesn't):** Auto-guarantee anticipation'ı düzleştiriyor (Loewenstein çelişkisi).
- **Kod:** [`hunt.ts:367-376`](../../../src/systems/hunt.ts) — sıfır yakalama → `PREY.find(p => p.difficulty <= 2)` garanti.
- **Çelişki derecesi:** Orta. Kullanıcı deneyimi "boşa gitti" hissini engelliyor; anticipation kaybı teorik. **INSUFFICIENT EVIDENCE** — audit §12 kabulü.
- **Karar:** Wave'lerde dokunulmayacak; C5 milestone eğrisi kalibrasyonundan sonra P1 telemetri ile yeniden bakılır.

## 5. Retention modifier ↔ Autonomy (gizli “iyileştirme”)

- **Belge (audit §7 Ç4):** Sistem çok yerde oyuncuyu "kendisinden bağımsız" iyileştiriyor.
- **Kod:**
  - Hunt: [`retention-modifiers.ts:22-26`](../../../src/systems/retention/retention-modifiers.ts) — churning tier → +6% + return +2%.
  - Gamble: `getGambleRetentionBonusSafe` — max +6%.
  - Tame: max +7%.
- **Çelişki derecesi:** Yüksek — SDT autonomy yıkıcı.
- **Karar:** [`DECISION-002`](../decisions/DECISION-002-gambling-streak-modifier.md) gambling nudge'ı ayırıyor. Hunt/tame nudge'ları görünür bir "geri döndüğün için bonus var" mesajıyla dönüşebilir — Wave 5 kapsamı.

## 6. Meta-goal 3 katman ↔ Toplam extrinsic yük

- **Belge (audit §6, action-list GO-2):** Login + quest + milestone üç ayrı checklist.
- **Kod:**
  - Login: [`daily-login.ts`](../../../src/systems/daily-login.ts) 200+ satır, milestone bonus tablosu.
  - Quest: [`daily-quests.ts`](../../../src/systems/daily-quests.ts) 4 quest/gün.
  - Milestone: [`hunt-milestones.ts`](../../../src/systems/hunt-milestones.ts) her 25/50/… hunt.
- **Çelişki derecesi:** Orta — teorik risk, deneysel kanıt yok.
- **Karar:** [`DECISION-004`](../decisions/DECISION-004-daily-load-and-quest-fatigue.md) — birleşik "bugünkü tablo" (Wave 3 E4 ile birlikte).

## 7. Trait rastgelelik ↔ Autonomy (build seçimi yok)

- **Belge (audit §2 What Doesn't):** Trait sistemi var, oyuncu seçim yapmıyor.
- **Kod:** [`systems/traits.ts:rollTraits`](../../../src/systems/traits.ts) — tame anında tamamen rastgele.
- **Karar:** Wave 6 tasarım tartışması (P3 autonomy). Küçük bir "3 trait öner, birini seç" değişikliği kod olarak zor değil ama tame UX'i büyük etkiler — DDR-005 kapsamı dışına taşıyor. Şimdilik B4 (tame prey-family) ile ilgili DDR-005'te değinilecek.

## 8. Level-up otomatik ↔ Autonomy

- **Belge (audit §2 Hidden Problem):** Level-up pasif — "yaptım" değil "oldu".
- **Kod:** `buildLevelUpRewards` [`state/player-state.ts`](../../../src/state/player-state.ts) — otomatik coin/kutu ödülü.
- **Karar:** DEFER (Wave 6). "Level-up'ta stat puanı seçimi" C4 skill tree tartışması ile bağlı.

## 9. Prestige kaldırılmış ↔ Endgame boşluğu

- **Belge (audit §2 Long-Term Effect, §12):** Prestige olmadan moon-tier ceiling'i tükenince ne olacak? INSUFFICIENT EVIDENCE.
- **Kod:** [`commands/owl-prestige.ts:6-16`](../../../src/commands/owl-prestige.ts) — pasif "kaldırıldı" mesajı; kod içinde `prestigeLevel` alanı hala var.
- **Karar:** Wave 6+ tartışma. Belge üretimi bu turda yok (kapsam dışı).

## 10. Biome tek (b0) ↔ Autonomy + Novelty

- **Belge (action-list B2, audit çapraz):** Biome seçimi yok → autonomy sıfır.
- **Kod:** [`owl-hunt.ts:191`](../../../src/commands/owl-hunt.ts) — `DEFAULT_HUNT_BIOME_ID` sabit; `BIOMES` array birden fazla eleman içerse de handler seçim vermiyor.
- **Karar:** Wave 6 (P2 skopu). Küçük DDR gelecekte gerekebilir.

## 11. Cooldown mesajı içeriği ↔ Bilgilendirici geri bildirim

- **Belge (action-list A3):** Sadece "X sn bekle" — bilgilendirici değil.
- **Kod:** [`utils/command-error.ts:buildCooldownMessage`](../../../src/utils/command-error.ts).
- **Karar:** [`DECISION-006`](../decisions/DECISION-006-cooldown-message-content.md) + Wave 1 A3.

## 12. Daily quest deterministik seçim ↔ Autonomy (kendi seç)

- **Belge (action-list E3):** Oyuncu 3'ten 2'sini seçsin.
- **Kod:** [`daily-quests.ts:pickDailyQuestTypes`](../../../src/systems/daily-quests.ts) — hash tabanlı deterministik.
- **Karar:** DEFER (Wave 4+). Ekonomik denge ve anti-farm implikasyonu daha derin.

## 13. Level tier etiketi yok ↔ Competence görünürlüğü

- **Belge (action-list A6):** Ölçek anlamlılığı için tier etiketi.
- **Kod:** [`commands/owl-stats.ts`](../../../src/commands/owl-stats.ts) — sadece sayı gösterimi.
- **Karar:** IMPLEMENT (Wave 1). Yeni `src/config/ui-tiers.ts` (Wave 1'de oluşturulacak) — 5–8 tier + eşik → etiket haritalama.

## 14. Welcome-back yok ↔ Grace-friendly retention

- **Belge (action-list A7):** N gün ara veren oyuncu geri döndüğünde tek seferlik hediye.
- **Kod:** Yok. `welcomeback`, `welcome-back`, `welcomeBack` grep boş.
- **Karar:** IMPLEMENT (Wave 2). Redis key `welcomeback:{userId}` + ay içinde max 1.

## 15. Drop rate ilan edilmemiş ↔ Şeffaflık

- **Belge (action-list A4, TR-3):** `/owl help hunt` içinde drop tablosu.
- **Kod:** [`commands/owl-help.ts`](../../../src/commands/owl-help.ts) — drop bilgisi yok.
- **Karar:** IMPLEMENT (Wave 2). Yeni help topic: `drops`.

## 16. Market fiyat sinyali yok ↔ Autonomy + adalet

- **Belge (action-list F2):** İtem tarihsel ortalama fiyat aralığı.
- **Kod:** [`systems/market.ts`](../../../src/systems/market.ts) — MarketListing kayıtları var, ortalama fiyat gösterimi yok.
- **Karar:** IMPLEMENT (Wave 3). MarketListing tarih indeksi mevcut, `market-queries` içine `avgSoldPrice(itemName, window)` eklenebilir.

## 17. Gamble stats görünmüyor ↔ Adalet algısı

- **Belge (action-list M1, TR-1):** Oyuncuya kendi win/loss oranını göster.
- **Kod:** `gambleStreakWins/Losses` state var, listeleme yok.
- **Karar:** IMPLEMENT (Wave 3). `w kumar stats` — kendi geçmişini göster.

## 18. Retention nudge belge dışı ↔ Autonomy zıddı

- **Belge:** Rapor'da retention modifier'ın "kaybeden oyuncuya arka planda +% şansın var" olarak eleştirisi audit §5.
- **Kod:** [`retention-modifiers.ts`](../../../src/systems/retention/retention-modifiers.ts) — churn tier bazlı gizli +%.
- **Karar:** DDR-002 gambling ayrıştırma + Wave 5 sonrasında hunt/tame nudge'ları için görünürlük tartışması.

## 19. Copy catalog editörü ↔ Belge kapsamı dışı

- **Kod:** [`ops-panel.ts`](../../../src/ops-panel.ts) + [`config/copy-catalog.ts`](../../../src/config/copy-catalog.ts) — canlı metin düzenleme sistemi.
- **Belge:** Research/action-list bunu kısaca geçiyor.
- **Karar:** Bilgi olarak `UNDOCUMENTED_SYSTEMS.md`'de yer alacak.

## 20. Anticheat reward-throttle ↔ Ödül kanalı disiplini

- **Kod:** [`anticheat/reward-throttle.ts`](../../../src/anticheat/reward-throttle.ts) — `applyRewardMultiplier` her ödül kanalında zorunlu.
- **Belge:** Research'te geçmiyor.
- **Karar:** `feature-development.mdc` kuralına "yeni ödül kanalı bu API'den geçer" satırı eklenecek.

---

## Çelişki bulguları özeti

| # | Konu | Kategori | Wave |
|---|------|----------|------|
| 1 | Maintenance vs milestone-grace | Design tutarsızlık | 5 (DDR-001) |
| 2 | Gambling streak modifier | Gizli mekanik | 5 (DDR-002) |
| 3 | Pity + softcap görünmez | Şeffaflık | 2 (DDR-003) |
| 4 | Auto-guarantee vs anticipation | Karar açık | Metrik sonrası |
| 5 | Retention modifier gizli | Autonomy zıddı | 5 (DDR-002 kısmi) |
| 6 | 3 meta-goal katmanı yükü | Yük hesaplaması | 3 (DDR-004) |
| 7 | Trait rastgelelik | Autonomy | 6 |
| 8 | Level-up otomatik | Autonomy | 6 |
| 9 | Prestige boşluğu | Endgame | 6+ |
| 10 | Biome tek | Autonomy/Novelty | 6 |
| 11 | Cooldown mesajı içerik | UX | 1 (A3, DDR-006) |
| 12 | Quest kendi seç | Autonomy | 6 |
| 13 | Tier etiketi yok | Competence görünür | 1 (A6) |
| 14 | Welcome-back yok | Retention | 2 (A7) |
| 15 | Drop tablosu ilan yok | Şeffaflık | 2 (A4) |
| 16 | Market fiyat sinyali yok | Autonomy | 3 (F2) |
| 17 | Gamble stats yok | Adalet | 3 (M1) |
| 18 | Retention nudge gizli | Autonomy zıddı | 5 |
| 19 | Copy catalog belge dışı | Belge boşluğu | UNDOC |
| 20 | Reward-throttle API | Süreç kuralı | Kural |

**Belge sonu.** Detay: [`MISSING_FEATURES.md`](MISSING_FEATURES.md), [`UNDOCUMENTED_SYSTEMS.md`](UNDOCUMENTED_SYSTEMS.md).
