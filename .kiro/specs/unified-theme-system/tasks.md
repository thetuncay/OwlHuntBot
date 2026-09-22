# Uygulama Planı: Unified Theme System

## Genel Bakış

`theme.ts` dosyası genişletilerek eksik export'lar eklenir, ardından her UX dosyası bağımsız olarak refactor edilir. Son adımda `embed.ts` renk import kaynağı `config`'den `theme.ts`'e taşınır. Tüm süreç boyunca TypeScript derleme başarısı temel doğrulama kriteridir.

## Görevler

- [x] 1. Test altyapısını kur
  - `pnpm add -D vitest fast-check` ile Vitest ve fast-check'i yükle
  - `vitest.config.ts` dosyasını oluştur: `include: ['src/**/*.test.ts']`, `environment: 'node'`
  - `package.json`'a `"test": "vitest --run"` ve `"test:watch": "vitest"` script'lerini ekle
  - `src/utils/theme.test.ts` dosyasını oluştur (boş test dosyası — sonraki task'larda doldurulacak)
  - _Gereksinimler: 2.1, 6.1 (test altyapısı önkoşulu)_

- [x] 2. `theme.ts`'e `pipeLine` export'unu ekle
  - `theme.ts`'e `pipeLine(msg: string): string` fonksiyonunu ekle — `🌙 | mesaj` formatı
  - `hpBarColored` varsayılan `length` parametresinin 8 olduğunu doğrula (pvp-ux uyumluluğu)
  - _Gereksinimler: 3.5, 8.4_

  - [ ]* 2.1 Format helper birim testlerini yaz
    - `errLine`, `okLine`, `warnLine`, `pipeLine` prefix doğrulamaları
    - `sectionTitle` çıktı formatı kontrolü
    - _Gereksinimler: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. `theme.ts` bar fonksiyonları için property testleri yaz
  - [ ]* 3.1 Property 1: Bar dolu segment round-trip testi
    - `hpBar(current, max, length)` — dolu `'█'` sayısı `Math.round(clamp(current/max) * length)` ile eşleşmeli
    - `fc.integer({min:0})`, `fc.integer({min:1})`, `fc.integer({min:1, max:20})` arbitraries kullan
    - **Property 1: Bar Dolu Segment Round-Trip**
    - **Validates: Requirements 2.1, 9.4**

  - [ ]* 3.2 Property 2: Overflow ve underflow sınır koşulları testi
    - `current > max` → bar yalnızca `'█'` veya `'▰'` içermeli
    - `max === 0` → bar yalnızca `'░'` veya `'▱'` içermeli
    - `hpBar`, `chargeBar`, `slotBar` için ayrı ayrı doğrula
    - **Property 2: Overflow ve Underflow Sınır Koşulları**
    - **Validates: Requirements 2.10, 2.11**

  - [ ]* 3.3 Property 3: `hpBarColored` renk eşiği testi
    - `hp/hpMax > 0.5` → `'🟩'`, `0.25 < ratio ≤ 0.5` → `'🟨'`, `ratio ≤ 0.25` → `'🟥'`
    - `fc.integer({min:1, max:1000})` ile her iki parametre için
    - **Property 3: hpBarColored Renk Eşiği**
    - **Validates: Requirements 2.7, 2.8, 2.9**

  - [ ]* 3.4 Property 4: `toSuperscript` geçerlilik ve sınır testi
    - Her zaman tam 2 karakter uzunluğunda olmalı
    - Her karakter `['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹']` kümesinden olmalı
    - `n > 99` → `'⁹⁹'`, `n === 0` → `'⁰⁰'`
    - `fc.integer({min:0, max:200})` arbitrary kullan
    - **Property 4: toSuperscript Geçerlilik ve Sınır**
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**

- [x] 4. Checkpoint — Tüm testler geçmeli
  - `pnpm test` çalıştır, tüm testlerin geçtiğini doğrula. Sorun varsa kullanıcıya sor.

- [x] 5. `stats-ux.ts`'i tema sistemine geçir
  - Dosyanın başındaki yerel `COLOR_NORMAL`, `COLOR_WARNING`, `COLOR_ELITE` sabitlerini kaldır
  - `QUALITY_META` ve `TIER_LABEL` yerel tanımlarını kaldır
  - Yerel `bar()` ve `statBar()` fonksiyonlarını kaldır
  - `theme.ts`'den `COLORS`, `hpBar`, `QUALITY_BADGE`, `QUALITY_COLOR`, `TIER_LABEL` import et
  - `statBar` fonksiyonunu `hpBar` çağırarak yeniden implement et: `` `\`${hpBar(Math.min(value, 100), 100, 8)}\`` ``
  - `QUALITY_META[q].badge` → `QUALITY_BADGE[q]`, `QUALITY_META[q].color` → `QUALITY_COLOR[q]` olarak güncelle
  - `COLOR_NORMAL` → `COLORS.PRIMARY`, `COLOR_WARNING` → `COLORS.WARNING`, `COLOR_ELITE` → `COLORS.RARE` olarak güncelle
  - `pnpm build` ile TypeScript derleme hatası olmadığını doğrula
  - _Gereksinimler: 7.1, 7.2, 7.3, 8.1, 8.3_

- [x] 6. `inventory-ux.ts`'i tema sistemine geçir
  - Yerel `COLOR_INV`, `COLOR_BUFF`, `COLOR_EMPTY` sabitlerini kaldır
  - Yerel `RARITY_BADGE` nesnesini kaldır (`RARITY_ORDER` kalabilir — sıralama yardımcısı)
  - Yerel `slotBar()`, `chargeBar()`, `toSuperscript()` fonksiyonlarını kaldır
  - `theme.ts`'den `COLORS`, `RARITY_BADGE`, `RARITY_COLOR`, `slotBar`, `chargeBar`, `chargeDot`, `toSuperscript` import et
  - `COLOR_INV` → `COLORS.INVENTORY`, `COLOR_BUFF` → `COLORS.BUFF`, `COLOR_EMPTY` → `COLORS.MUTED` olarak güncelle
  - `buildInventoryText`'teki inline `▰▱` bar hesaplamasını `chargeBar` çağrısıyla değiştir
  - `buildItemDetailEmbed`'deki inline renk değerlerini `RARITY_COLOR` map'inden al
  - `pnpm build` ile TypeScript derleme hatası olmadığını doğrula
  - _Gereksinimler: 7.4, 7.5, 7.6, 8.1, 8.3_

- [x] 7. `upgrade-ux.ts`'i tema sistemine geçir
  - Yerel `COLOR_PANEL`, `COLOR_SUCCESS`, `COLOR_FAIL`, `COLOR_CANCEL`, `COLOR_WARN` sabitlerini kaldır
  - Yerel `bar()` ve `chanceBar()` fonksiyonlarını kaldır
  - `theme.ts`'den `COLORS`, `hpBar`, `chanceBar` import et
  - `COLOR_PANEL` → `COLORS.UPGRADE`, `COLOR_SUCCESS` → `COLORS.SUCCESS`, `COLOR_FAIL` → `COLORS.DANGER`, `COLOR_CANCEL` → `COLORS.MUTED`, `COLOR_WARN` → `COLORS.WARNING` olarak güncelle
  - `bar(value, max, length)` çağrılarını `hpBar(value, max, length)` ile değiştir; backtick wrapping'i koru
  - `chanceBar(chance)` çağrılarını `theme.ts`'den import edilen `chanceBar(chance)` ile değiştir
  - `buildDepBlockedEmbed`'deki inline `0xe67e22` renk değerini `COLORS.WARNING` ile değiştir
  - `pnpm build` ile TypeScript derleme hatası olmadığını doğrula
  - _Gereksinimler: 7.7, 7.8, 8.1, 8.3_

- [x] 8. `pvp-ux.ts`'i tema sistemine geçir
  - Yerel `hpBar(hp, hpMax, len)` fonksiyonunu kaldır
  - `theme.ts`'den `hpBarColored` import et
  - Tüm `hpBar(...)` çağrılarını `hpBarColored(...)` ile değiştir (imza uyumlu: `hp, hpMax, length?`)
  - `pnpm build` ile TypeScript derleme hatası olmadığını doğrula
  - _Gereksinimler: 7.9, 8.1, 8.3_

- [x] 9. `hunt-ux.ts`'i tema sistemine geçir
  - `theme.ts`'den `pipeLine` import et
  - `buildFinalMessage`'daki `🌙 | ...` formatındaki satırları `pipeLine(...)` çağrısıyla değiştir
  - `pnpm build` ile TypeScript derleme hatası olmadığını doğrula
  - _Gereksinimler: 7.10, 8.1, 8.3_

- [x] 10. `embed.ts`'i tema sistemine geçir
  - `import { COLOR_FAIL, COLOR_INFO, COLOR_SUCCESS, COLOR_WARNING } from '../config'` satırını kaldır
  - `import { COLORS } from './theme'` ekle
  - `COLOR_SUCCESS` → `COLORS.SUCCESS`, `COLOR_FAIL` → `COLORS.DANGER`, `COLOR_INFO` → `COLORS.PRIMARY`, `COLOR_WARNING` → `COLORS.WARNING` olarak güncelle
  - `QuickView` arayüzü ve `applyQuickView` fonksiyonuna dokunma
  - `successEmbed`, `failEmbed`, `infoEmbed`, `warningEmbed` fonksiyon imzaları değişmemeli (`QuickView?` parametresi korunmalı)
  - `pnpm build` ile TypeScript derleme hatası olmadığını doğrula
  - _Gereksinimler: 1.4, 5.5, 5.6, 7.11, 8.2_

- [x] 11. Final checkpoint — Tüm testler ve derleme geçmeli
  - `pnpm build` çalıştır, sıfır TypeScript hatası doğrula
  - `pnpm test` çalıştır, tüm property ve birim testlerinin geçtiğini doğrula
  - Hiçbir UX dosyasında yerel renk sabiti, bar fonksiyonu veya `toSuperscript` tanımı kalmadığını doğrula
  - Sorun varsa kullanıcıya sor.

## Notlar

- `*` ile işaretli alt görevler isteğe bağlıdır; MVP için atlanabilir
- Her UX dosyası bağımsız olarak geçirilebilir — tüm dosyaların aynı anda değiştirilmesi zorunlu değil (Gereksinim 8.4)
- `RARITY_ORDER` (`inventory-ux.ts`'deki sıralama map'i) görsel tema değil, sıralama yardımcısıdır — `theme.ts`'e taşınmaz
- Property testleri minimum 100 iterasyon çalıştırılmalıdır (fast-check varsayılanı)
- `embed.ts`'deki `config` import'u kaldırıldıktan sonra `config.ts`'deki renk sabitleri artık kullanılmıyor olabilir; bu kapsam dışıdır
