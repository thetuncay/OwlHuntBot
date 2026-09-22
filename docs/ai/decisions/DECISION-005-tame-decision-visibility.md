# DECISION-005 — Tame Karar Görünürlüğü + Prey-Family Derinliği

- **Durum:** Kısmen görünürlük (Wave 4), derinlik DEFER (Wave 6)
- **Tarih:** 2026-09-14
- **Kaynaklar:** [`docs/research/owlhunt-core-design-audit.md §2 & P3`](../../research/owlhunt-core-design-audit.md) · Action list B4 · [`CORE_LOOP.md §2`](../analysis/CORE_LOOP.md)

---

## Problem

Audit'in P3 tespiti: "**Autonomy ekseninin sistematik eksikliği.**" Hunt anında karar yok, evolution otomatik, trait rastgele, build yok. En büyük dokunulabilir alan: **tame**.

Mevcut tame:
- 3 aksiyon (silent / distract / advance) + attempt.
- Personality (aggressive/cautious/patient/greedy) belirleniyor.
- Aksiyon başına progress/escape delta hesabı yapılıyor.

**Ancak:** Oyuncu **prey (owl species) türüne göre farklı strateji kullanması gerekmediğini** öğreniyor. Her tame'de aynı optimal sıralama işe yarıyor. Bu sahte-autonomy (Tyack & Mekler 2024 "illüzyon-seçim" eleştirisi).

## Existing System

- Session: [`src/systems/tame-session.ts`](../../../src/systems/tame-session.ts) — `TameSessionState` içinde personality + progress + escapeRisk.
- Aksiyon → modifier tablosu: [`src/utils/tame-narrative.ts`](../../../src/utils/tame-narrative.ts) — `ACTION_MODIFIERS[personality][action]`.
- Owl personality personality **rastgele roll** ediliyor tame anında (`rollPersonality(tier, quality)`) — prey species'e bağlı değil.
- UX: [`src/utils/tame-ux.ts:buildTameActionRow`](../../../src/utils/tame-ux.ts).

## Proposed Change

### Wave 4 — Görünürlük (küçük dokunuş)

Oyuncuya **hangi personality için hangi aksiyonun avantajlı olduğunu ipucu ver.**

- Örnek: "Aggressive baykuş görülüyor · **distract** iyi çalışır" (tame ekranında personality altı satır).
- Kaynak: mevcut `ACTION_MODIFIERS` tablosundan otomatik en yüksek delta olan aksiyon.
- Format: tek satır, spoiler değil. Oyuncu ipucu görüyor ama uygulamak zorunda değil (autonomy).

Kod:
- [`utils/tame-ux.ts:buildTameEncounterEmbed`](../../../src/utils/tame-ux.ts) — personality altına ipucu.
- Helper: `suggestTameAction(personality): TameAction` — tablo bakışı.

### Wave 6 — Prey-family derinliği (DEFER)

Audit B4 tam öneri:
- Aynı personality farklı prey species için farklı optimal aksiyon → **prey-family bazlı counter tablosu**.
- Örnek: "Rare Owl species X, cautious ve **silent tercih ediyor**"; "Common species Y, cautious ve **distract tercih ediyor**".
- Bu, `ACTION_MODIFIERS[personality][action]` tablosunu `ACTION_MODIFIERS[species_family][personality][action]` matrisine genişletmek demek.

**Karar:** DEFER. Sebepler:
- Complexity yüksek (~5 species family × 4 personality × 3 aksiyon = 60 hücre kalibrasyon).
- Dominant strateji riskine karşı playtest gerekli.
- Wave 4 görünürlük ile "karar hissi" ilk katmanı yeterince test edilecek.

### Trait seçimi (DEFER — audit önerisi)

Tame anında "3 trait önerisi + 1 seçim" (audit §2 MINIMAL CHANGE 1). Bu **kapsam dışı** bu DDR'da; ayrı bir DDR gerektirir (Wave 6+).

## Alternatives

- **(a) Hiçbir şey (status quo)** — autonomy düşük kalır; audit uyarısı sürer.
- **(b) Sadece hint satırı (Wave 4, ÖNERİLEN)** — küçük dokunuş; autonomy iddiası doğal olmaz ama görünürlük artar.
- **(c) Prey-family derinliği (Wave 6)** — gerçek mastery katmanı; complexity + playtest yükü.
- **(d) Rastgele → seçim (`3 personality öner`)** — trait sistemine analog; ayrı DDR.

## Research Evidence

- Ryan vd. (2006) — competence: "hangi aksiyonun neden çalıştığı" bilgisi mastery hissini besler.
- Tyack & Mekler (2024) — SDT autonomy: bilgilendirici sinyal olmadan autonomy sahte kalır.
- Locke & Latham (2002) — proximal goal (aksiyon seçimi) motivasyona pozitif.
- King, Delfabbro & Griffiths (2010) — "manipulation and control features" kriterinde control düşük olan sistem uzun vadede zayıflar.

## Technical Impact

Wave 4:
- Dosyalar: [`utils/tame-ux.ts`](../../../src/utils/tame-ux.ts), [`utils/tame-narrative.ts`](../../../src/utils/tame-narrative.ts) (helper).
- Complexity: **S (saatler).**
- Test: `src/__tests__/tame-hint.test.ts` — personality → önerilen aksiyon eşleşmesi.

Wave 6 (DEFER):
- Yeni config: `src/config/tame-counters.ts` — species family × personality × action matrisi.
- Refactor: `resolveTurn` tablosu `ACTION_MODIFIERS[species_family][personality][action]` şekline dönüşür.
- Complexity: **M-L**; playtest gerekli.

## Design Impact

- Wave 4: Küçük ama gerçek — oyuncu tame'de "neden bunu seçtim" cevabını verebilir.
- Wave 6: Gerçek mastery katmanı; farklı species farklı yaklaşım gerektirir.

## Long-Term Impact

- **Kazanımlar:** Autonomy ekseninin en dokunulabilir noktasında görünürlük.
- **Riskler:** Wave 6'da dominant strateji oluşursa autonomy sahte hale gelir (audit uyarısı). Karşı önlem: kalibrasyon + playtest telemetri.

## Decision

**PARTIAL IMPLEMENT:**

- **Wave 4:** Alternatif (b) — personality altı öneri satırı.
- **Wave 6:** Alternatif (c) DEFER — prey-family derinliği, metrik + playtest sonrası.
- Trait seçimi ayrı DDR (kapsam dışı).

## Reason

Küçük dokunuş anahtar — mevcut sistem üstüne 3 satır kod ekliyor; bilimsel destek (SDT competence + information) güçlü; büyük dönüşüm playtest gerektirir ve bu turda çözülmüş olur olmaz kanıt yok.

## Metrikler (Wave 4 sonrası)

- Tame başarı oranı (personality × action seçimi)
- Feedback survey "tame karar hissi" skoru
- Tame session ortalama tur sayısı (hint verilirse azalabilir — kalibre)

## Bağı

- [`DECISION-003-pity-and-softcap-transparency.md`](DECISION-003-pity-and-softcap-transparency.md) — aynı şeffaflık felsefesi
- [`../analysis/CORE_LOOP.md §2.1`](../analysis/CORE_LOOP.md) — autonomy haritası

**Belge sonu.**
