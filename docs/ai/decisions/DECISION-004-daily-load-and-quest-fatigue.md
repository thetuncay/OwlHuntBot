# DECISION-004 — Günlük Yük ve Quest Fatigue

- **Durum:** Kısmen Wave 1 (I1 dili) + kısmen Wave 3 (E4 birleşik hedef satırı). Büyük tablo birleşimi DEFER.
- **Tarih:** 2026-09-14
- **Kaynaklar:** [`docs/research/owlhunt-core-design-audit.md §6`](../../research/owlhunt-core-design-audit.md) · Action list A5/E4/I1 · [`DESIGN_CODE_CONFLICTS.md §6`](../analysis/DESIGN_CODE_CONFLICTS.md)

---

## Problem

Üç paralel meta-goal katmanı aktif:

1. **Daily login streak** — 30h cooldown, 24h grace, 200 → 800 coin/gün.
2. **Daily quests** — 4 quest/gün, 3-tier variant.
3. **Hunt milestones** — 25 → 50 → 80 → 115 … silent-reset.

Her biri kendi başına doğru tasarlanmış. Ancak **toplamda** oyuncuya üç ayrı checklist görüntüsü sunuyor: "Login streak? Günlük quest'lerin? Milestone'a yaklaştın mı?"

Audit'in §6 uyarısı:
- Overjustification / undermining riski (Deci 1999, d ≈ −0.40).
- "Chore" pattern (Frommel & Mandryk 2022).
- Katmanlar arası bilgi akışı yok — quest tamamlama milestone'a katkı yapıyor mu? Login streak quest'i etkiliyor mu? UI göstermiyor.

## Existing System

- Daily login: [`systems/daily-login.ts`](../../../src/systems/daily-login.ts) + [`config.ts:1565-`](../../../src/config.ts).
- Daily quests: [`systems/daily-quests.ts`](../../../src/systems/daily-quests.ts) — 4/gün (`DAILY_QUESTS_PER_DAY`), deterministik.
- Hunt milestones: [`systems/hunt-milestones.ts`](../../../src/systems/hunt-milestones.ts) — silent-reset TTL 24h.

Bu üçüne oyuncu ayrı komutlarla erişiyor: `w daily`, `w quest`, `w hunt` (milestone hunt mesajında görünür).

## Proposed Change

### Kısmi paket (Wave 1–3)

**Wave 1 — I1 daily reward hediye dili:**
- Daily login çıktı mesajı "streak +1, +X coin" yerine "🎁 Bugünkü hediye: X coin + kutu" — kelime seçimi extrinsic → intrinsic geçişini destekler.
- Kod: [`systems/daily-login.ts`](../../../src/systems/daily-login.ts) çıktı formatı (mesaj döndüren yer command tarafında, [`commands/owl-daily.ts`](../../../src/commands/owl-daily.ts)).

**Wave 3 — E4 bugünkü hedef satırı:**
- `w owl` (panel) ve hunt mesajı başında **tek satır** "🎯 Bugün için önerin: ..." — sistemin en yakın hedefi (en yakın milestone, en yakın quest, en yakın login pencere).
- Öncelik sırası: (a) claim edilebilir quest varsa; (b) milestone'a ≤5 av kaldıysa; (c) daily login hazırsa; (d) yoksa yumuşak "keyfine bak" cümlesi.
- Kod: [`commands/owl-owl.ts`](../../../src/commands/owl-owl.ts), [`utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts) — yeni helper `buildTodayFocusLine(userId)`.

### Büyük tablo (DEFER — Wave 4+)

**Birleşik "bugünkü tablo":**
- Tek komut (`w bugün` veya `w focus`) ile üç katman birlikte görünsün — checklist görüntüsü tek yerde.
- Kod maliyeti: orta (yeni komut + UI birleşimi).
- Risk: audit uyarısı — "checklist" hissini pekiştirebilir. Metrik olmadan kalibrasyon zor.
- **Karar:** Metrik toplandıktan sonra (Wave 3 P3/P4) yeniden değerlendirilecek.

### Login streak tangible ödül eğrisini yumuşat (DEFER)

Audit önerisi: 200 → 800 coin yerine rotasyon (coin ↔ item ↔ küçük cosmetic). Cosmetic layer (D3) yok — Wave 6+.
- **Karar:** DEFER. Şimdilik I1 dili değişimi yeterli.

## Alternatives

- **(a) Bu turda hiçbir şey (DEFER hepsi)** — audit uyarısı bilgi olarak kalır.
- **(b) Sadece I1 dili (Wave 1)** — hafif başlangıç.
- **(c) I1 + E4 hedef satırı (Wave 1 + Wave 3, ÖNERİLEN)** — tetikleyici satır proximal goal (Locke & Latham) tetiği, checklist yükünü azaltmadan proximal odak.
- **(d) Birleşik tablo (Wave 4+)** — büyük refactor, önce metrik.

## Research Evidence

- Locke & Latham (2002) — proximal + spesifik hedef motivasyonu artırır; **tek** proximal hedef görüntüsü, çoklu çeşitten daha etkili.
- Frommel & Mandryk (2022) — daily reward çift doğa (motivasyon vs chore); dil önemlidir.
- Deci vd. (1999) — beklenen tangible ödül undermining; rotasyon (item/coin/cosmetic) undermining'i yumuşatabilir.
- Sailer vd. (2017) — gamification öğelerinin motive edici etkisi hangi ihtiyacı beslediğine bağlı.

## Technical Impact

- Wave 1:
  - [`systems/daily-login.ts`](../../../src/systems/daily-login.ts) veya [`commands/owl-daily.ts`](../../../src/commands/owl-daily.ts) — çıktı mesajı format değişikliği.
  - Copy catalog düzenlemesi: [`config/copy-catalog*.ts`](../../../src/config/copy-catalog.ts).
- Wave 3:
  - [`commands/owl-owl.ts`](../../../src/commands/owl-owl.ts) — panel satırı ekle.
  - [`utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts) — helper.
  - Yeni: `src/utils/today-focus.ts` (küçük) — 3 katmanın en yakınını hesaplar.
- Test:
  - Focus line hesap testleri (`buildTodayFocusLine` çeşitli state'lerde).
  - Daily reward yeni dil embed testleri.

## Design Impact

- Wave 1 sonrası oyuncu daily'yi "checklist" değil "hediye" olarak alır (dil).
- Wave 3 sonrası her hunt/panel başında **tek** proximal odak — çoklu checklist yükü hafifler.

## Long-Term Impact

- **Kazanımlar:** Extrinsic yüklü katmanların "chore" hissi azalır.
- **Riskler:** E4 önerisi çok "yönlendirici" olursa autonomy zıddına döner. Karşı önlem: "önerin" dili ("**yapmalısın**" değil, "**önerin**"); oyuncu kapatabilir olmalı (soft opt-out — Wave 3 kapsamında).

## Decision

**PARTIAL IMPLEMENT — Alternatif (c):**

- Wave 1: I1 daily reward hediye dili.
- Wave 3: E4 bugünkü hedef satırı.
- Wave 4+: birleşik tablo — metrik sonrası yeniden karar.
- Login streak ödül rotasyonu (D3 gerektirir) — Wave 6+.

## Reason

Bilim quest-fatigue riskini destekliyor ama akut hasar kanıtı yok — INSUFFICIENT EVIDENCE seviyesi. Küçük dokunuşlar (dil + tek focus satırı) risk minimum, kazanım proximal-goal literature'ıyla uyumlu. Büyük birleşik tablo hem code hem UX yükü; metrik olmadan yönü yanlış olabilir.

## Metrikler (Wave 3 sonrası)

- Daily quest completion rate (P3 metrik) — hedef %60-80.
- Milestone claim rate — undermining sinyali (çok hızlı çok fazla claim → intrinsic düşüş).
- Focus satırı görüntüsü sonrası hunt-per-session.
- Feedback survey "her şey listeye döndü" skoru.

## Bağı

- [`DECISION-006-cooldown-message-content.md`](DECISION-006-cooldown-message-content.md) — ipucu içerik disiplini
- [`../analysis/FEATURE_MATRIX.md`](../analysis/FEATURE_MATRIX.md) — E4/I1/A5 kararları

**Belge sonu.**
