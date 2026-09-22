# DECISION-001 — Daily Maintenance: Ceza → Bonus Rework

- **Durum:** Önerilen (Wave 5 kod uygulaması onay bekliyor)
- **Tarih:** 2026-09-14
- **Kaynaklar:** [`docs/research/owlhunt-core-design-audit.md §4b`](../../research/owlhunt-core-design-audit.md), P1 (kategori E) · [`ECONOMY_IMPACT.md §5`](../analysis/ECONOMY_IMPACT.md) · [`DESIGN_CODE_CONFLICTS.md §1`](../analysis/DESIGN_CODE_CONFLICTS.md)

---

## Problem

Mevcut günlük bakım ("daily maintenance") sistemi, main baykuşa 1 adet **Cig Et** yedirmeyi zorunlu kılıyor; yoksa main owl'un `effectiveness` değeri **5 puan kalıcı** olarak düşüyor.

Bu sistem üç açıdan problemli:

1. **Loss-aversion / external regulation.** Deci & Ryan 2020 çerçevesinde bu "yaptırım varsa yap" mekaniği intrinsic motivasyonu aşındıran extrinsic regulation kategorisine düşer. Frommel & Mandryk 2022'nin daily-reward dark-pattern taksonomisinde "obligation/chore" pattern'i ile aynı.
2. **İç felsefe çelişkisi.** Bot'un başka her yerinde grace-friendly politika var (milestone silent-reset, daily login 24h grace, newbie ceza yok). Maintenance bu duruşla **çelişir**; oyuncuya karışık mesaj verir.
3. **Kalıcı competence kaybı.** Effectiveness kalıcı düşüşü, kısa süreli ara veren oyuncu için "geri geldiğimde daha zayıfım" hissi yaratır — competence sinyali negatif ivmeli.

## Existing System

- Kod: [`src/systems/economy.ts:dailyMaintenance`](../../../src/systems/economy.ts) — item varsa 1 Cig Et düşer; yoksa `owl.effectiveness -= 5`.
- Config: [`config.ts:817-819`](../../../src/config.ts) — `MAINTENANCE_DAILY_ITEM='Cig Et'`, `MAINTENANCE_DAILY_AMT=1`, `MAINTENANCE_MISS_EFFECTIVENESS_LOSS=5`.
- Cron: [`src/jobs/background-jobs.ts:120`](../../../src/jobs/background-jobs.ts) — batch olarak tüm aktif oyunculara uygulanıyor.

## Proposed Change

**Ceza yerine bonus modeli:**

1. Cig Et harcanırsa oyuncu **küçük bir pozitif buff** alır:
   - `+X% stamina rejen (Y süre)` **veya**
   - `+Z% hunt catch bonus (bir sonraki 5 hunt için)` **veya**
   - `+bond gain rate (1 gün)`.
2. Cig Et harcanmazsa **hiçbir şey olmaz** (nötr baseline). Kalıcı effectiveness kaybı **yok**.
3. Aynı item sink korunur (envanterden 1 Cig Et gider) → ekonomi denge etkilenmez.

**Motivational çerçeve:** "Kayıp korkusu" yerine "kullanınca güçleniyor". Bilgi mesajı: "🍖 Bugün baykuşuna Cig Et verdin — hunt bonusu aktif (5 av)". Item yoksa: "🍖 Cig Et bugün yok — normal baseline sürüyor."

### Buff seçimi önerisi (tartışmaya açık)

| Seçenek | Etki | Yan etki |
|---------|------|----------|
| A. +2% catch bonus, 5 hunt | Hunt loop'a direkt katkı | Rare drop üzerindeki etkisi az |
| B. +5% stamina rejen, 12 saat | Stamina sistem kullanımı artar | Şu an stamina hunt'a direkt etki etmiyor |
| C. Küçük bond gain rate ×1.2, 24 saat | Bond görünürlüğü artar | Uzun vadeli owl büyümesi |
| **D. A + C kombine (öneri)** | Kısa vade hunt hissi + uzun vade owl büyüme | Kalibrasyon gerekiyor |

## Alternatives

- **(a) Tamamen kaldır** — Item sink kaybı; envanterde birikme; item ekonomisi bozulur (Cig Et satılabilir hale gelir).
- **(b) Ceza kalsın, grace ekle** — Ör. haftada 1 gün ceza atlanabilir. Motivasyonel çerçeve hâlâ external regulation → problem çözülmüş olmuyor.
- **(c) Bonus'a çevir (ÖNERİLEN — D kombinasyon)** — Aynı sink, tersine çerçeve.
- **(d) Effectiveness düşüşünü geçici yap** — "24 saat geçici" (sonraki gün bakım yaparsa geri gelir). Complexity yüksek, hâlâ negatif çerçeve.

## Research Evidence

- Deci, Koestner & Ryan (1999) — beklenen tangible ödül intrinsic motivasyonu **azaltır** (d ≈ −0.40). Aynı çalışma **beklenmedik / bilgilendirici** ödülün **artırdığını** gösterir (+0.31).
- Ryan & Deci (2020) — external regulation ↔ integrated regulation ekseninde external en zayıf motivasyon türü. Cezaya bağlı davranış = external.
- Frommel & Mandryk (2022) — daily reward dark-pattern taksonomisi: "obligation, chore, stress" pattern'i.
- Bäcklund vd. (2022) — emotional escape motivasyonu problem gaming ile en güçlü ilişkiye sahip; zorunluluk hissi yaratan mekanikler bu motivasyonu besler.
- Aksi görüş / karşı kanıt: Bazı daily-reward-dependent oyunlarda short-term retention artıyor — ama Frommel & Mandryk'in bulgusu bunun long-term keyif pahasına olduğu.

## Technical Impact

- Dosyalar: [`systems/economy.ts`](../../../src/systems/economy.ts), [`config.ts`](../../../src/config.ts), [`systems/items.ts`](../../../src/systems/items.ts) (buff mekanizması), [`jobs/background-jobs.ts`](../../../src/jobs/background-jobs.ts) (aynı kalıyor).
- Yeni buff tipi: `items.ts` içindeki `getBuffEffects` pipeline'ına ek + `BUFF_ITEM_MAP` genişleme.
- Ekonomi nötr: Cig Et sink aynı, ceza kalksa da denge korunuyor.
- Test: `src/__tests__/economy.test.ts` (yeni) — buff uygulama; effectiveness düşmez.
- Migrations: yok — mevcut kolonlar korunuyor; sadece **davranış değişiyor**.

## Design Impact

- Oyuncu deneyimi: negatif → pozitif çerçeve.
- Bot'un genel grace-friendly duruşu ile **tutarlı** hale geliyor.
- Milestone silent-reset ile artık çelişmiyor.

## Long-Term Impact

- **Riskler:**
  - Cig Et talep düşerse ekonomi item pool'u bozulabilir. Karşı önlem: buff yeterince değerli olmalı ki oyuncu her gün yedirmek istesin (kalibrasyon).
  - Oyuncu buff'ı "farming stratejisi" haline getirebilir. Karşı önlem: buff kısa süreli + hunt-bound.
- **Kazanımlar:**
  - Grace-friendly duruşun taşıyıcı sütununa (milestone silent-reset) uygun.
  - "Bot beni ceza için oynatmıyor, güçlendiriyor" algısı.

## Decision

**REWORK — Seçenek (c) uygula, D kombinasyonu ile.**

Kalıcı effectiveness kaybını kaldır. Cig Et harcanırsa küçük buff (catch bonus + bond gain rate). Harcanmazsa hiçbir şey olmaz.

Kalibrasyon parametreleri Wave 5 implementasyonunda tartışılacak; başlangıç değerleri:

```
MAINTENANCE_BUFF_CATCH_BONUS = 0.02  // +2% catch chance
MAINTENANCE_BUFF_CATCH_HUNTS = 5     // 5 av
MAINTENANCE_BUFF_BOND_MULT   = 1.20  // +20% bond gain rate
MAINTENANCE_BUFF_BOND_HOURS  = 24
```

**Uygulanma turu:** Wave 5 (ayrı kullanıcı onayı bekliyor). Bu turda kod dokunulmuyor.

## Reason

Bilimsel kanıt üç kaynaktan aynı yönde (SDT + daily reward literature + emotional escape research). Botun genel felsefesi ile tutarsızlık kaldırılıyor. Item sink korunuyor — ekonomik risk düşük. Alternatif (a) kaldırma sink'i eritir; (b) grace çözmez; (d) complexity fazla.

## Metrikler (Wave 5 sonrası ölçülecek)

- Günlük Cig Et harcama oranı (öncesi/sonrası)
- 7 gün ara veren oyuncunun geri dönüş oranı
- Feedback survey enjoyment skoru
- Hunt-per-session ortalaması (buff etkisi)

**Belge sonu.**
