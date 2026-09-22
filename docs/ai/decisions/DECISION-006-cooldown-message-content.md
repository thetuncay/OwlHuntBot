# DECISION-006 — Cooldown Mesajı İçerik Tasarımı

- **Durum:** Önerilen (Wave 1 kod uygulaması için hazır)
- **Tarih:** 2026-09-14
- **Kaynaklar:** Action list A3 (FL-4/CO-1 · E1) · [`DESIGN_CODE_CONFLICTS.md §11`](../analysis/DESIGN_CODE_CONFLICTS.md)

---

## Problem

Hunt cooldown mesajı şu an sadece "X sn bekle" bilgisi veriyor. Auto-delete (8 sn) mevcut, iyi bir tampon. Ama:

- Bekleme süresi **bilgilendirici değil** — sadece süre.
- Oyuncu spam yaparken cooldown mesajını gördüğünde motivasyon kırıcı → flow'un "control" kriteri (Sweetser & Wyeth 2005) zayıflıyor.
- Auto-delete tamponu iyi ama **kök çözüm değil** (audit §1 What Doesn't).

## Existing System

- Cooldown enforce: [`commands/owl-hunt.ts:enforceHuntCooldown`](../../../src/commands/owl-hunt.ts).
- Mesaj builder: [`utils/command-error.ts:buildCooldownMessage`](../../../src/utils/command-error.ts).
- Auto-delete: [`config.ts:156`](../../../src/config.ts) `COOLDOWN_NOTICE_AUTO_DELETE_MS=8000`.
- Suppression key: `SuppressionKeys.cooldown(huntCooldownKey(userId))` — spam engelleme.
- Flow reject: `resolveFlowRejectMessage(redis, userId, 'hunt', 'cooldown', base)` — mesaj öncesi flow hint kontrolü.

## Proposed Change

Cooldown mesajına **tek satır** faydalı ipucu ekle. Öncelik zinciri:

1. **Claim edilebilir quest varsa** → "🎯 Hazır görevin var: `w q`"
2. **Milestone'a ≤3 av kaldıysa** → "🏁 Milestone yaklaştı: N/M"
3. **Level-up eşiğine yakın (≤%15 XP kaldıysa)** → "⚡ Level atlamak üzere"
4. **Eksik prey (prey-dex tamamlanmamış)** → "🔎 Katalog eksik: `w z`"
5. **Yoksa** → boş (yalnızca cooldown süresi)

### Format (max 2 satır)

```
⏱️ Hunt cooldown — X sn kaldı
🎯 Hazır görevin var: w q
```

### Kod tarafı

- [`utils/command-error.ts:buildCooldownMessage`](../../../src/utils/command-error.ts) — imza değişir mi? Şu an sync. Eğer async yapılırsa Redis lookup için maliyet.
- **Alternatif:** `enforceHuntCooldown` içinde async ipucu hesabı yap, `buildCooldownMessage`'a param olarak geçir. Sync yapıyı bozmaz.
- Ipucu helper: yeni `src/utils/cooldown-hint.ts` (küçük dosya, ~50 satır — Wave 1'de oluşturulacak) — Redis + basit LRU cache.

### Cache disiplini

- Bir kullanıcı için ipucu hesabı **60 sn cache** — spam eden oyuncuya her cooldown'da PG sorgusu **yasak** (hot path invariant).
- Cache anahtar: `cooldown:hint:{userId}`, TTL 60 sn.
- Cache miss durumunda: basit varsayılan (sadece süre).

## Alternatives

- **(a) Hiçbir şey** — status quo; spam eden oyuncu için can sıkıcı.
- **(b) Sadece süre + auto-delete tamponu** — mevcut; kök çözüm değil.
- **(c) Tek satır ipucu (ÖNERİLEN)** — bilgilendirici + kısa + spam-safe.
- **(d) Rastgele motive edici cümle ("Yakında dönecek!")** — E3 kayma; motivational sos ana yemek sanılırsa undermining riski.
- **(e) Progresif — ilk cooldown detaylı, sonraki cooldown'lar minimal** — complexity yüksek; suppression key zaten benzer efekt sağlıyor.

## Research Evidence

- Sweetser & Wyeth (2005) — GameFlow "concentration" ve "control" kriterleri kesintide zayıflar; kısa bilgilendirici satır kesintiyi anlamlandırır.
- Ryan vd. (2006) — informational feedback intrinsic motivasyonu güçlendirir; motivational sos zayıflatır (Deci vd. 1999).
- Locke & Latham (2002) — proximal goal işaretlemesi (yaklaşan milestone/quest) dikkat yönlendirici etkiye sahip.

## Technical Impact

- Dosyalar: [`utils/command-error.ts`](../../../src/utils/command-error.ts), [`commands/owl-hunt.ts`](../../../src/commands/owl-hunt.ts), yeni `src/utils/cooldown-hint.ts`.
- Complexity: **S–M (yarım gün).**
- Test:
  - `src/__tests__/cooldown-hint.test.ts` (yeni) — çeşitli state'lerde doğru ipucu.
  - Mevcut `cooldown-notice-delete.test.ts` etkilenmez.
- Perf: 60sn cache Redis hit; miss durumunda basit fallback → hot path'e negatif etki yok.

## Design Impact

- Cooldown "cezai bekleme" → "yumuşak anlamlı bekleme".
- Flow'un control kriteri iyileşir.
- Autonomy sıkıntı yok — mesaj öneri, dayatma değil.

## Long-Term Impact

- **Kazanımlar:** Kullanıcı geri bildiriminde "cooldown can sıkıcı" şikayetinin azalması beklenir (metrik).
- **Riskler:** Aşırı motive edici / gürültücü dil E3'e kayar. Kural: dil **bilgilendirici**, "duygu satarak" değil.

## Decision

**IMPLEMENT — Alternatif (c).**

Wave 1 içinde uygula. Basit 5 durum önceliği; 60 sn cache.

## Reason

Kanıt hafif ama tutarlı (flow + informational reward); complexity düşük; risk minimal. Auto-delete ile birlikte kullanıldığında kanal spam'i artmaz.

## Metrikler (Wave 1 sonrası)

- Cooldown mesajı gösterim sayısı (baseline var)
- Cooldown sonrası tetiklenen komut (`w q`, `w z`, hunt) dağılımı
- Feedback survey "cooldown can sıkıcı mı" skoru

## Örnek diyalog (kalibrasyon)

```
User: w hunt
Bot:  ⏱️ Hunt cooldown — 3 sn kaldı
      🎯 Hazır görevin var: w q
```

**Belge sonu.**
