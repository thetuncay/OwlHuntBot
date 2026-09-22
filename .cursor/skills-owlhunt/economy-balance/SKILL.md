---
name: economy-balance
description: Yeni bir coin/XP sink veya source eklenirken çalıştırılacak checklist. Girdi: feature adı + sink/source değişikliği. Çıktı: ekonomi risk raporu ve önerilen kalibrasyon.
---

# Skill: economy-balance

## Ne zaman kullan

- Yeni bir source (coin/XP/item üreten yer) ekleniyor.
- Yeni bir sink (coin/XP/item yok eden yer) ekleniyor.
- Mevcut bir sabit değişecek (tax, RTP, cap).
- Feature ekonomik yönünü değerlendirmesi bekleniyor (FEATURE_PLAN'ın "Economy impact" bölümü).

## Girdi

- `feature_name` — özellik adı.
- `channel` — `source` veya `sink`.
- `estimated_flow_per_day` — bir aktif oyuncu için beklenen günlük coin/XP/item akışı.
- `cap` — günlük tavan var mı?
- `affected_constants` — `config.ts`'te dokunulacak sabitler.

## Çıktı

Ekonomi risk raporu — `docs/ai/analysis/ECONOMY_IMPACT.md`'ye eklenecek bölüm:

```
## Feature <name> ekonomik etkisi

- Kanal: source/sink
- Günlük akış (aktif oyuncu): X
- Cap: var/yok
- Anti-farm: <mekanizma>
- Enflasyon riski: L/M/H
- Alt-account riski: L/M/H
- Kalibrasyon önerisi: ...
```

## Adımlar

### 1. Baseline kontrol

Referans oyuncu profilini oku ([`ECONOMY_IMPACT.md §3`](../../../docs/ai/analysis/ECONOMY_IMPACT.md)):

- 2 saatlik oturum ≈ 50 hunt
- Brüt günlük coin ≈ 3–8k
- Ana sink: upgrade + gambling + market fee (%6 toplam)

Yeni feature'ın etkisi bu tabloya oturmalı.

### 2. Anti-farm checklist

- [ ] Günlük cap var mı? Yoksa gerekçe.
- [ ] Farklı oyuncular arasında pay-out'un dağılımı bilinebilir mi? (Botlanabilir mi?)
- [ ] `applyRewardMultiplier` API'sinden geçiliyor mu?
- [ ] Rate limiter tetiklenebilir mi? (`src/anticheat/rate-limiter.ts`)
- [ ] Multi-account heuristic'e yakalanır mı? (`multi-account-heuristics.ts`)
- [ ] Trust score'a bağlı davranış farklılaşması var mı? (isteğe bağlı)

### 3. Sink / source denge kontrolü

Yeni bir source ekliyorsan **karşılığı bir sink** olup olmadığını değerlendir:

- Coin source → hangi coin sink'i besliyor? (upgrade / market fee / gamble)
- Item source → autosink var mı? Envanter cap zorlanıyor mu?
- XP source → level curve capliyor mu (`XP_SCALE_MAX_MULT`)?

Yeni sink ekliyorsan:

- Oyuncu deneyimi ceza gibi hissetmiyor mu? [`game-design.mdc`](../../rules/game-design.mdc) SDT sorusu.
- Görünür (bilgilendirici) mi? [`no-hidden-mechanics.mdc`](../../rules/no-hidden-mechanics.mdc).

### 4. Newbie / retention ile örtüşme

Yeni source **newbie boost** ile birlikte compound olur mu? Örnek: A7 welcome-back pack + newbie active = çift bonus **YASAK** (kod'da retention-modifier `isNewbieActive` kontrolü örneği).

Yeni sink retention-at-risk oyunculara **ekstra baskı** yapmıyor mu? (`churn-score.ts` tier'ları).

### 5. Metrik önerisi

Feature yayınlandıktan sonra hangi metriklerle takip edilecek?

- Günlük ortalama coin akışı (agregat, oyuncu bazlı)
- Feature spesifik counter (kaç kez kullanıldı, kaç kez cap'e vurdu)
- Retention D1/D7 üzerinde yan etki
- Support ticket sayısı (ekonomi şikayeti)

### 6. Kalibrasyon önerisi

Complexity çokça yüksek olduğu için başlangıç değeri bir tahmin. Rapor formatı:

```
Öneri: <sabit> = <değer>
Gerekçe: <bir cümle>
İlk 2 hafta ölçüm: <metrik>
Ayarlama tetikleyicisi: <eşik ilkesi>
```

Kalibrasyon **playtest sonrası tekrar değerlendirilir** — feature-development.mdc self-critique zinciri.

## Yasak ekleyeceklerin listesi

Feature bu listeye giriyorsa **REJECT** ve DDR'ye gitmez:

- Gerçek para ile RNG loot box
- Alt-account teşvikli login farming
- "Bilerek kazandır" kumar mekaniği
- Kozmetiği yalnızca pay-only satma
- Zorunlu gruplu ekonomi işlemi (yalnız oyuncu dışlanır)

## Hata modları

- Feature ekonomi checklist'ini geçtiği halde bir hafta sonra enflasyon sinyali görünürse: metrik logunu koy, kalibrasyon DDR aç. Kod dokunma paniği yok.
- Yeni sabit `config.ts` dışında yazılırsa: [`AI_GUIDELINES.md §4`](../../../docs/ai/AI_GUIDELINES.md) ihlali, kesinlikle geri çevir.

## Bağı

- [`ECONOMY_IMPACT.md`](../../../docs/ai/analysis/ECONOMY_IMPACT.md) — ekonomi haritası
- [`economy-safety.mdc`](../../rules/economy-safety.mdc) — kural
- [`feature-analysis`](../feature-analysis/SKILL.md) — üst skill
- [`no-hidden-mechanics.mdc`](../../rules/no-hidden-mechanics.mdc) — şeffaflık
