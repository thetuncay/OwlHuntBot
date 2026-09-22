# DECISION-003 — Pity + Level Softcap Şeffaflığı

- **Durum:** Önerilen (Wave 2 kod uygulaması için hazır)
- **Tarih:** 2026-09-14
- **Kaynaklar:** [`docs/research/owlhunt-core-design-audit.md §3`](../../research/owlhunt-core-design-audit.md) · Action list A4 + D2 · [`DESIGN_CODE_CONFLICTS.md §3`](../analysis/DESIGN_CODE_CONFLICTS.md)

---

## Problem

Hunt sonucu üzerinde oyuncunun **hissettiği** ama **bilmediği** iki modifier var:

1. **Pity mekanizması** — `noRareStreak >= 8` sonrası her hunt başına +4% nadir prey şansı, max +25%. Amaç: bad-luck koruması (gacha standart). Ancak **görünmüyor.**
2. **Level softcap** — Level ≥ 20 sonrası her level başına drop chance −1%, max −30%. Amaç: enflasyon kontrolü. Ancak **görünmüyor.**

Sonuç: sistem adil çalışıyor ama iletemediği için oyuncu "manipülasyon var" sanıyor. Bu ampirik olarak bir kullanıcı şikayetinde ("10 elde 1 kere kazanamadım") görüldü.

## Existing System

- **Pity:** [`src/systems/hunt.ts:278-283`](../../../src/systems/hunt.ts):
  ```
  const noRareStreak = player.noRareStreak;
  const pityBonus = noRareStreak >= HUNT_PITY_THRESHOLD
    ? clamp(0, HUNT_PITY_MAX_BONUS, (noRareStreak - HUNT_PITY_THRESHOLD) * HUNT_PITY_BONUS_RATE)
    : 0;
  ```
  Sabitler [`config.ts:175-177`](../../../src/config.ts) — THRESHOLD=8, RATE=0.04, MAX=0.25.
- **Level softcap:** [`src/systems/drops.ts:37-49`](../../../src/systems/drops.ts):
  ```
  const LEVEL_SOFTCAP_START = 20;
  const LEVEL_SOFTCAP_RATE  = 0.01;
  const LEVEL_SOFTCAP_MAX   = 0.30;
  function levelDropMult(level) { … }
  ```

Her ikisi de kod içinde şeffaf, UX'te tamamen gizli.

## Proposed Change

### 1. Pity satırı (hunt sonucu)

Hunt mesajının son satırlarına ek görünür ipucu. Şart: **sadece pity yaklaşıyorsa göster**, her hunt'ta değil (audit A2 disiplini gibi).

Format önerisi (kalibre edilebilir):

- `noRareStreak == 6 → 8` arasında: `┃ 🎯 Nadir yaklaştı (6/8)` (yumuşak curiosity teaser)
- `noRareStreak >= 8`: `┃ 🎯 Pity aktif — nadir bonus %{X}` (görünür bilgi)

Kod tarafında:
- [`utils/hunt-ux.ts:buildFinalMessage`](../../../src/utils/hunt-ux.ts) — ek satır
- `CompressedHunt` interface'e `pityHint?: string` ekle
- `compressHuntResult`'a `pity` bilgisi geçmek için `HuntRunResult`'a `pityAfter: {streak, bonusPct}` alanı ekle

### 2. `/owl help drops` topic

Yeni help topic'i açılır. İçerik:

- **Drop tablosu (yaklaşık):**
  - Fare, tavşan, gelincik (düşük tier): sık — %30-40 spawn
  - Yaban kedisi, tilki (orta): %20-25
  - Kartal, kurt (yüksek — HIGH_TIER_THRESHOLD üstü): %5-10 (pity ile artabilir)
- **Pity açıklaması:** "8 hunt üst üste nadir çıkmadıysa, her hunt +%4 nadir şansı devreye girer (max +%25)."
- **Level softcap açıklaması:** "Level 20+ sonrası lootbox drop şansı hafifçe düşer (max −%30). Sebep: enflasyon kontrolü."
- **Kalibre notu:** "Oranlar değişebilir; değişiklik olduğunda changelog'da duyurulur." (O2 balance changelog süreci ile bağı)

Yapılacak kod:
- [`commands/owl-help.ts`](../../../src/commands/owl-help.ts) — `HELP_TOPIC_LABELS` + `sections.drops` ekle
- Alias'lar: `drops`, `oran`, `oranlar`, `pity`

### 3. Prey drop tablosu üretimi

[`systems/drops.ts`](../../../src/systems/drops.ts) sabitlerinden **statik hesaplanmış özet** üretilecek — dinamik değil (perf koruma). Katalog yapısı:

- Her prey difficulty tier için ortalama spawn oranı hesaplanır (tek biome b0, ortalama owl stat varsayımı).
- Tablo hunt-help topic'inde gösterilir.

## Alternatives

- **(a) Sadece pity satırı, softcap gizli kalır** — Yarı çözüm. Softcap deneyimli oyuncuların şikayet kaynağı; gizli kalırsa "haksızlık algısı" sürer.
- **(b) Sadece help sayfası, hunt sonucunda hiçbir satır** — Bilgi mevcut ama fark edilemeyebilir; anticipation teaser fırsatı kaçırılır.
- **(c) Tam şeffaflık: pity satırı + help sayfası (ÖNERİLEN)** — Audit S1 önerisi ile birebir.
- **(d) İlk pity başında büyük fanfare, sonra silent** — Novelty patlaması ama tekrar edenlerde fade → curiosity ölür.

## Research Evidence

- Loewenstein (1994) — information-gap: pity yaklaşımı gösterilirse "boşluk çözülebilir" hissi verir, curiosity artar.
- Ryan & Deci (2020) — informational reward > tangible reward; pity satırı **informational** kategoriye düşer, competence sinyali güçlenir.
- King, Delfabbro & Griffiths (2010) — pity gibi bad-luck koruması yapısal risk faktörü değil; **gizli olması** manipülasyon kategorisine yaklaştırır.
- Tyack & Mekler (2024) — SDT autonomy: oyuncu sistemin işleyişini bilebilmelidir; gizli mekanik autonomy'yi yıkar.

## Technical Impact

- Dosyalar: [`systems/hunt.ts`](../../../src/systems/hunt.ts) (pity bilgisi return), [`types/*`](../../../src/types) (`HuntRunResult`), [`utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts) (satır), [`commands/owl-help.ts`](../../../src/commands/owl-help.ts) (topic).
- Complexity: **S–M (1 gün).**
- Test:
  - `src/__tests__/hunt-pity-hint.test.ts` (yeni) — 6/7/8/12 streak durumlarında pity satırı doğru mu.
  - `src/__tests__/owl-help.test.ts` — drops topic embed doğru mu.
- 800 satır kontrolü:
  - `hunt.ts` 536 → +5–8 satır, sınır altında.
  - `hunt-ux.ts` 157 → +10 satır, sınır altında.
  - `owl-help.ts` 249 → +30 satır (topic + section), sınır altında.

## Design Impact

- Pity artık bir competence sinyali (informational) — "sistem beni koruyor, biliyorum".
- Curiosity satırı (6/7/8) anticipation'ı besler → auto-guarantee ile birlikte anticipation dengelenir.
- Help sayfası deneyimli oyuncular için "haksızlık" algısını çözer.

## Long-Term Impact

- **Kazanımlar:** Kullanıcı şikayetlerinin bir kısmı kök nedende çözülür. Audit'in "sinsi iyi tasarım" tuzağından çıkış.
- **Riskler:** Oran yayınlandığında **değiştirme özgürlüğü daralır**. Karşı önlem: "yaklaşık" ifadesi + O2 changelog süreci ile önceden duyurma yükümlülüğü.

## Decision

**IMPLEMENT — Alternatif (c) tam şeffaflık.**

Wave 2 içinde: pity satırı + `/owl help drops` topic + O2 changelog süreç başlangıcı.

## Reason

Audit S1 MINIMAL CHANGE 1-3 ile birebir; SDT autonomy + Loewenstein curiosity + informational reward literature aynı yönde. Kod maliyeti düşük; ekonomik risk yok. Kullanıcı şikayeti direct link.

## Metrikler (Wave 2 sonrası)

- "Adalet" feedback survey skoru
- `pity aktif` satırı sonrası hunt-per-session
- `/owl help drops` topic görüntülenme sayısı

## Bağı

- [`DECISION-002-gambling-streak-modifier.md`](DECISION-002-gambling-streak-modifier.md) — aynı şeffaflık disiplini
- [`../../.cursor/rules/no-hidden-mechanics.mdc`](../../../.cursor/rules/no-hidden-mechanics.mdc) — bundan sonra gizli mekanik girişi kural ile blokede

**Belge sonu.**
