---
name: feature-analysis
description: Engagement action-list'ten bir öneri değerlendirirken uygulanır. 6 soruluk zincir + FEATURE_PLAN.md doldurma. Girdi: madde kodu (A1, B4 vb.). Çıktı: `docs/ai/plans/FEATURE_PLAN-<kod>.md`.
---

# Skill: feature-analysis

## Ne zaman kullan

Aşağıdaki durumların **herhangi biri**:

- Engagement action-list'ten (`docs/research/owlhunt-engagement-action-list.md`) yeni bir madde uygulanacak.
- FEATURE_MATRIX'te `DEFER` etiketi olan bir madde tekrar değerlendirilecek.
- Kullanıcı "X özelliğini analiz et" diyor.
- Kullanıcı doğrudan implement etmek istiyor ama önce planlama gerekli.

## Girdi

- `feature_code` — Action list kodu (A1, B4 …) veya belge önerisi.
- `override_priority` (opsiyonel) — Roadmap dalgasını atla iddiası.

## Çıktı

- `docs/ai/plans/FEATURE_PLAN-<feature_code>.md` — [`FEATURE_PLAN_TEMPLATE.md`](../../../docs/ai/templates/FEATURE_PLAN_TEMPLATE.md) doldurulmuş.
- Kod dokunulmaz; sadece plan.

## Adımlar

### 1. Kaynak toplama

Aşağıdaki dosyaları oku (SIRA IL, hepsini değil — ilk üçü zorunlu):

1. [`docs/ai/analysis/FEATURE_MATRIX.md`](../../../docs/ai/analysis/FEATURE_MATRIX.md) — bu madde ne durumda?
2. [`docs/ai/analysis/CORE_LOOP.md`](../../../docs/ai/analysis/CORE_LOOP.md) — loop etkisi.
3. `docs/research/owlhunt-engagement-action-list.md` — orijinal öneri.
4. Etkilenecek `src/` dosyalarını [`FEATURE_MATRIX.md`](../../../docs/ai/analysis/FEATURE_MATRIX.md) "Kanıt" kolonundan al.
5. İlgili memory-bank dosyası ([`docs/ai/memory-bank/INDEX.md`](../../../docs/ai/memory-bank/INDEX.md) sırasıyla).

### 2. 6 soruluk zincir

Aşağıdaki sorulara **SIRAYLA** cevap ver. Zincirde bir tane bile "kırmızı" varsa **DEFER** veya **DDR aç** kararına git.

1. **Core loop etkisi:** güçlendirir mi (+), nötr (0), zayıflatır (−)? Kanıt: [`CORE_LOOP.md`](../../../docs/ai/analysis/CORE_LOOP.md) referansı.
2. **SDT ihtiyaç:** competence / autonomy / relatedness — en az ikisi net "evet" mi?
3. **Ekonomi:** [`economy-safety.mdc`](../../rules/economy-safety.mdc) checklist tamam mı?
4. **Şeffaflık:** yeni gizli mekanik yok mu? [`no-hidden-mechanics.mdc`](../../rules/no-hidden-mechanics.mdc).
5. **Complexity:** S / M / L? Efor 800-satır kuralı ihlal ediyor mu?
6. **Long-term value:** 100 saat sonra hâlâ anlamlı mı? Başka sistemi anlamsızlaştırıyor mu?

### 3. FEATURE_PLAN doldurma

- Şablonu kopyala.
- Her bölüm doldurulmalı; boş bırakma yok.
- Test suite adları önceden belirlenmeli.
- Rollback stratejisi net (data migration varsa).

### 4. Karar

- Zincir yeşilse: **IMPLEMENT** — roadmap dalgasına yerleştir.
- Yeşil ama complexity L: **IWC** + parçalı implementasyon.
- Bir kırmızı: **DEFER** + metrik/DDR gerekçesi.
- İki+ kırmızı: **REJECT** + [`FEATURE_MATRIX.md`](../../../docs/ai/analysis/FEATURE_MATRIX.md) güncelle.

### 5. Rapor

Şu formatta kısa özet döndür:

```
[feature_code] KARAR
- Core loop: +/0/-
- SDT: A/C/R (X/3)
- Ekonomi: OK / risk
- Şeffaflık: OK / gizli mekanik
- Complexity: S/M/L
- LT: H/M/L
- Karar: IMPLEMENT / IWC / DEFER / REJECT
- Sonraki adım: <plan dosyası veya DDR>
```

## Sınırlar

- **Kod yazma** — bu skill sadece plan üretir; kod başka bir turda.
- **DDR yerine geçme** — Bir gizli mekanik / core loop parametre değişikliği önerisiyse skill DDR gerekliğini bildirir, kendisi DDR yazmaz.
- **Belge geliştirme** — Skill yeni analiz dosyası (`FEATURE_MATRIX.md` vb.) oluşturmaz; sadece plan.

## Hata modları

- Aynı feature için farklı FEATURE_PLAN çıktısı yazılırsa: eski dosya adını kontrol et; overwrite yapma, sürüm ekle (`FEATURE_PLAN-B3-v2.md`).
- Skill "IMPLEMENT" dediği halde acceptance kriterleri sağlanmadığında feature bitmemiştir — [`feature-development.mdc`](../../rules/feature-development.mdc) self-critique zincirinde yakalanır.

## Bağı

- [`FEATURE_PLAN_TEMPLATE.md`](../../../docs/ai/templates/FEATURE_PLAN_TEMPLATE.md) — çıktı şablonu
- [`feature-development.mdc`](../../rules/feature-development.mdc) — genel süreç
- [`docs/ai/analysis/`](../../../docs/ai/analysis/) — kaynak analiz belgeleri
