# Teknik Tasarım: Unified Theme System

## Genel Bakış

BaykusBot'un mevcut kod tabanında her UX dosyası (`stats-ux.ts`, `inventory-ux.ts`, `upgrade-ux.ts`, `pvp-ux.ts`, `hunt-ux.ts`) kendi renk sabitlerini, bar fonksiyonlarını ve format yardımcılarını bağımsız olarak tanımlamaktadır. Merkezi `theme.ts` dosyası mevcut olmakla birlikte bu dosyalar tarafından kullanılmamaktadır.

Bu tasarım, tüm UX dosyalarını tek bir `theme.ts` kaynağından besleyen birleşik bir tema sistemi oluşturur. Hedef: tema değişikliği için yalnızca `theme.ts` dosyasını düzenlemek yeterli olsun.

### Mevcut Durum — Duplicate Definition Analizi

| Tanım | Mevcut Konumlar |
|---|---|
| Renk sabitleri | `stats-ux.ts` (3), `inventory-ux.ts` (3), `upgrade-ux.ts` (5), `pvp-ux.ts` (yerel `hpBar`) |
| `hpBar` / `bar` | `stats-ux.ts`, `upgrade-ux.ts`, `pvp-ux.ts` |
| `chargeBar` | `inventory-ux.ts` |
| `slotBar` | `inventory-ux.ts` |
| `chanceBar` | `upgrade-ux.ts` |
| `toSuperscript` | `inventory-ux.ts` |
| `QUALITY_META` / `TIER_LABEL` | `stats-ux.ts` |
| `RARITY_BADGE` / `RARITY_ORDER` | `inventory-ux.ts` |
| `COLOR_FAIL/INFO/SUCCESS/WARNING` | `config` (embed.ts tarafından import edilir) |

---

## Mimari

### Katman Modeli

```
┌─────────────────────────────────────────────────────────┐
│                    theme.ts (Tek Kaynak)                 │
│  COLORS · Bar Functions · Format Helpers · Badges        │
│  Embed Builders · QUALITY/TIER/RARITY maps               │
└──────────────┬──────────────────────────────────────────┘
               │ import
       ┌───────┴────────────────────────────────┐
       │                                        │
┌──────▼──────┐  ┌──────────────┐  ┌──────────▼──────────┐
│  stats-ux   │  │ inventory-ux │  │    upgrade-ux        │
│  pvp-ux     │  │              │  │    hunt-ux           │
└─────────────┘  └──────────────┘  └─────────────────────┘
       │                                        │
       └────────────────┬───────────────────────┘
                        │ import (embed builders)
                 ┌──────▼──────┐
                 │   embed.ts  │
                 │ (QuickView) │
                 └─────────────┘
```

### Tasarım Kararları

**Karar 1: `theme.ts` genişletilir, yeni dosya oluşturulmaz.**
Mevcut `theme.ts` zaten doğru yapıyı içermektedir. UX dosyaları bu dosyayı import etmek yerine kendi kopyalarını tanımlamıştır. Çözüm: `theme.ts`'i eksik export'larla tamamlamak ve UX dosyalarını refactor etmek.

**Karar 2: `embed.ts` API'si korunur.**
`embed.ts`'deki `QuickView` arayüzü ve `applyQuickView` fonksiyonu değiştirilmez. `embed.ts` yalnızca renk import kaynağını `config`'den `theme.ts`'e taşır.

**Karar 3: Kademeli geçiş desteklenir.**
Her UX dosyası bağımsız olarak geçirilebilir. Tüm dosyaların aynı anda değiştirilmesi zorunlu değildir.

**Karar 4: `as const` ile tip güvenliği.**
`COLORS`, `QUALITY_BADGE`, `QUALITY_COLOR`, `TIER_LABEL`, `RARITY_BADGE`, `RARITY_COLOR` nesneleri `as const` ile export edilir. Bu sayede TypeScript yanlış token kullanımını derleme zamanında tespit eder.

---

## Bileşenler ve Arayüzler

### 1. `theme.ts` — Genişletilmiş Export Listesi

Mevcut `theme.ts` zaten şunları export etmektedir:
- `COLORS`, `hpBar`, `hpBarColored`, `chargeBar`, `chanceBar`, `slotBar`
- `sectionTitle`, `errLine`, `okLine`, `warnLine`
- `toSuperscript`, `chargeDot`
- `RARITY_BADGE`, `RARITY_COLOR`, `QUALITY_BADGE`, `QUALITY_COLOR`, `TIER_LABEL`
- `successEmbed`, `failEmbed`, `infoEmbed`, `warningEmbed`

**Eksik olan ve eklenmesi gereken:**
- `pipeLine(msg: string): string` — `🌙 | mesaj` formatı (hunt-ux için)

**Mevcut ama imza uyumsuzluğu olan:**
- `hpBar` — `theme.ts`'de `length` parametresi varsayılan 10, `pvp-ux.ts`'de 8 kullanılıyor. Çözüm: `length` parametresi opsiyonel kalır, çağrı noktasında `hpBarColored(hp, hpMax, 8)` şeklinde geçilir.

### 2. UX Dosyaları — Refactor Planı

#### `stats-ux.ts`
Kaldırılacak yerel tanımlar:
```typescript
// KALDIRILACAK:
const COLOR_NORMAL  = 0x5865f2;
const COLOR_WARNING = 0xe67e22;
const COLOR_ELITE   = 0xf1c40f;
const QUALITY_META: Record<...> = { ... };
const TIER_LABEL: Record<...> = { ... };
function bar(current, max, length): string { ... }
function statBar(value): string { ... }
```
Import edilecekler: `COLORS`, `hpBar`, `QUALITY_BADGE`, `QUALITY_COLOR`, `TIER_LABEL`

`statBar` özel bir wrapper'dır (`bar(Math.min(value, 100), 100, 8)`). Bu fonksiyon `stats-ux.ts` içinde kalabilir ancak `hpBar`'ı çağırarak implement edilir:
```typescript
function statBar(value: number): string {
  return `\`${hpBar(Math.min(value, 100), 100, 8)}\``;
}
```

#### `inventory-ux.ts`
Kaldırılacak yerel tanımlar:
```typescript
// KALDIRILACAK:
const COLOR_INV   = 0x5865f2;
const COLOR_BUFF  = 0x9b59b6;
const COLOR_EMPTY = 0x95a5a6;
const RARITY_BADGE: Record<...> = { ... };
const RARITY_ORDER: Record<...> = { ... };
function slotBar(used, total): string { ... }
function chargeBar(cur, max): string { ... }
function toSuperscript(n): string { ... }
```
Import edilecekler: `COLORS`, `RARITY_BADGE`, `RARITY_COLOR`, `slotBar`, `chargeBar`, `chargeDot`, `toSuperscript`

Not: `RARITY_ORDER` (sıralama için kullanılan sayısal map) `inventory-ux.ts`'de kalabilir çünkü bu bir sıralama yardımcısıdır, görsel tema değil.

#### `upgrade-ux.ts`
Kaldırılacak yerel tanımlar:
```typescript
// KALDIRILACAK:
const COLOR_PANEL   = 0x5865f2;
const COLOR_SUCCESS = 0x2ecc71;
const COLOR_FAIL    = 0xe74c3c;
const COLOR_CANCEL  = 0x95a5a6;
const COLOR_WARN    = 0xe67e22;
function bar(value, max, length): string { ... }
function chanceBar(chance): string { ... }
```
Import edilecekler: `COLORS`, `hpBar`, `chanceBar`

#### `pvp-ux.ts`
Kaldırılacak yerel tanımlar:
```typescript
// KALDIRILACAK:
function hpBar(hp, hpMax, len): string { ... }
```
Import edilecekler: `hpBarColored`

#### `hunt-ux.ts`
Eklenecek import: `pipeLine`
`hunt-ux.ts`'deki `🌙 | ...` formatındaki satırlar `pipeLine()` ile üretilecek.

#### `embed.ts`
Değiştirilecek import:
```typescript
// ÖNCE:
import { COLOR_FAIL, COLOR_INFO, COLOR_SUCCESS, COLOR_WARNING } from '../config';
// SONRA:
import { COLORS } from './theme';
```
`COLOR_SUCCESS → COLORS.SUCCESS`, `COLOR_FAIL → COLORS.DANGER`, `COLOR_INFO → COLORS.PRIMARY`, `COLOR_WARNING → COLORS.WARNING`

### 3. `config.ts` — Renk Sabitleri

`config.ts`'deki `COLOR_FAIL`, `COLOR_INFO`, `COLOR_SUCCESS`, `COLOR_WARNING` sabitleri `embed.ts` geçişinden sonra kaldırılabilir. Ancak bu kapsam dışıdır — bu spec yalnızca UX dosyalarını kapsar.

---

## Veri Modelleri

### `COLORS` Nesnesi (Genişletilmiş)

```typescript
export const COLORS = {
  // Temel
  PRIMARY:   0x5865F2, // Discord blurple
  SUCCESS:   0x57F287, // Yeşil
  DANGER:    0xED4245, // Kırmızı
  WARNING:   0xFEE75C, // Sarı
  MUTED:     0x4F545C, // Koyu gri

  // Oyun
  HUNT:      0x2C3E50,
  RARE:      0xF1C40F,
  PVP_WIN:   0xE74C3C,
  PVP_LOSE:  0x95A5A6,
  UPGRADE:   0x5865F2,
  INVENTORY: 0x5865F2,
  STATS:     0x5865F2,
  BUFF:      0x9B59B6,
  TAME:      0x3498DB,
  MARKET:    0x27AE60,
  PRESTIGE:  0xF39C12,

  // Tier renkleri
  TIER: [0, 0xE74C3C, 0xE67E22, 0xF1C40F, 0x2ECC71, 0x3498DB, 0x9B59B6, 0x95A5A6, 0x7F8C8D] as number[],
} as const;
```

### Bar Fonksiyon İmzaları

```typescript
// HP barı — █░ karakterleri, monospace
export function hpBar(current: number, max: number, length?: number): string

// Renkli HP barı — emoji + █░
export function hpBarColored(hp: number, hpMax: number, length?: number): string

// Charge barı — ▰▱ karakterleri
export function chargeBar(current: number, max: number, length?: number): string

// Slot barı — doluluk + ⚠️ uyarısı
export function slotBar(used: number, total: number, length?: number): string

// Şans barı — renk noktası + █░ + yüzde
export function chanceBar(chance: number, length?: number): string
```

### Format Helper İmzaları

```typescript
export function sectionTitle(title: string, width?: number): string  // ══ Title ══
export function errLine(msg: string): string                          // ✗ mesaj
export function okLine(msg: string): string                           // ✓ mesaj
export function warnLine(msg: string): string                         // ⚠ mesaj
export function pipeLine(msg: string): string                         // 🌙 | mesaj
export function toSuperscript(n: number): string                      // 6 → ⁰⁶
export function chargeDot(current: number, max: number): string       // 🟢/🟡/🔴
```

### Badge/Label Nesneleri

```typescript
export const RARITY_BADGE: Record<string, string>   // Legendary → 🟡
export const RARITY_COLOR: Record<string, number>   // Legendary → 0xF1C40F
export const QUALITY_BADGE: Record<string, string>  // God Roll → 🌟
export const QUALITY_COLOR: Record<string, number>  // Elite → COLORS.RARE
export const TIER_LABEL: Record<number, string>     // 3 → 'T3 ◆◆◆◆◆◆◇◇'
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Bu özellik için property-based testing uygundur çünkü bar fonksiyonları ve `toSuperscript` saf fonksiyonlardır, geniş girdi uzayına sahiptirler ve 100+ iterasyon edge case'leri ortaya çıkarabilir.

**Property Reflection:**
- 2.7, 2.8, 2.9 (hpBarColored renk eşikleri) birleştirilebilir: tek bir property tüm eşik aralıklarını kapsar.
- 2.10 (current > max → tam dolu) ve 9.4 (round-trip) birleştirilebilir: round-trip property current > max durumunu da kapsar.
- 6.1 ve 6.5 (toSuperscript) birleştirilebilir: tek bir property hem uzunluk hem karakter geçerliliğini kapsar.

---

### Property 1: Bar Dolu Segment Round-Trip

*For any* geçerli `(current, max, length)` üçlüsü için, `hpBar(current, max, length)` fonksiyonunun ürettiği `'█'` karakter sayısı, `Math.round(Math.min(Math.max(current / max, 0), 1) * length)` ile eşleşmelidir.

**Validates: Requirements 2.1, 9.4**

---

### Property 2: Overflow ve Underflow Sınır Koşulları

*For any* bar fonksiyonu (`hpBar`, `chargeBar`, `slotBar`) ve herhangi bir `length` değeri için:
- `current > max` olduğunda üretilen bar yalnızca dolu segment karakterleri (`'█'` veya `'▰'`) içermelidir.
- `max === 0` olduğunda üretilen bar yalnızca boş segment karakterleri (`'░'` veya `'▱'`) içermelidir.

**Validates: Requirements 2.10, 2.11**

---

### Property 3: hpBarColored Renk Eşiği

*For any* `(hp, hpMax)` çifti için `hpBarColored(hp, hpMax)` fonksiyonu:
- `hp / hpMax > 0.5` ise `'🟩'` içermelidir.
- `0.25 < hp / hpMax ≤ 0.5` ise `'🟨'` içermelidir.
- `hp / hpMax ≤ 0.25` ise `'🟥'` içermelidir.

**Validates: Requirements 2.7, 2.8, 2.9**

---

### Property 4: toSuperscript Geçerlilik ve Sınır

*For any* tam sayı `n` için:
- `toSuperscript(n)` her zaman tam olarak 2 karakter uzunluğunda olmalıdır.
- Her karakter `['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹']` kümesinden olmalıdır.
- `n > 99` olduğunda sonuç `'⁹⁹'` olmalıdır.
- `n === 0` olduğunda sonuç `'⁰⁰'` olmalıdır.

**Validates: Requirements 6.1, 6.3, 6.4, 6.5**

---

## Hata Yönetimi

### Derleme Zamanı Hataları

TypeScript strict mode ve `as const` kullanımı sayesinde:
- Yanlış `COLORS` token kullanımı (örn. `COLORS.NONEXISTENT`) derleme hatası verir.
- Bar fonksiyonlarına yanlış tip argüman geçilmesi derleme hatası verir.
- UX dosyaları yerel renk sabiti tanımlarsa ve bunları `COLORS` yerine kullanırsa, tip uyumsuzluğu derleme zamanında tespit edilir.

### Çalışma Zamanı Güvenliği

Bar fonksiyonları savunmacı biçimde implement edilmiştir:
- `max === 0` durumunda sıfıra bölme önlenir, boş bar döndürülür.
- `current > max` durumunda oran 1'e kırpılır, tam dolu bar döndürülür.
- `current < 0` durumunda oran 0'a kırpılır, tam boş bar döndürülür.

### Geriye Dönük Uyumluluk

- `embed.ts`'deki `QuickView` arayüzü ve `applyQuickView` fonksiyonu değiştirilmez.
- `embed.ts`'deki `successEmbed`, `failEmbed`, `infoEmbed`, `warningEmbed` fonksiyonları `QuickView` parametresini korur.
- `theme.ts`'deki aynı isimli fonksiyonlar `QuickView` parametresi olmadan çalışır — iki API birbirini tamamlar.

---

## Test Stratejisi

Bu özellik için test framework'ü mevcut değildir (`package.json`'da test runner yok). Tasarım, ileride eklenecek bir test altyapısını göz önünde bulundurarak yazılmıştır.

### Önerilen Test Altyapısı

**Test runner:** [Vitest](https://vitest.dev/) — TypeScript native, hızlı, Jest uyumlu API.
**Property-based testing:** [fast-check](https://fast-check.io/) — TypeScript için olgun PBT kütüphanesi.

```bash
pnpm add -D vitest fast-check
```

### Birim Testleri (Example-Based)

`COLORS` nesnesinin tüm gerekli token'ları içerdiğini doğrulayan testler:
```typescript
// Feature: unified-theme-system, Example: COLORS tokens
it('COLORS contains all required tokens', () => {
  expect(COLORS.PRIMARY).toBe(0x5865F2);
  expect(COLORS.DANGER).toBe(0xED4245);
  // ...
});
```

Format helper'ların doğru prefix kullandığını doğrulayan testler:
```typescript
it('errLine prefixes with ✗', () => expect(errLine('test')).toBe('✗ test'));
it('okLine prefixes with ✓', () => expect(okLine('test')).toBe('✓ test'));
it('warnLine prefixes with ⚠', () => expect(warnLine('test')).toBe('⚠ test'));
it('pipeLine prefixes with 🌙 |', () => expect(pipeLine('test')).toBe('🌙 | test'));
```

### Property-Based Testler

Her property testi minimum 100 iterasyon çalıştırılmalıdır.

**Property 1: Bar Dolu Segment Round-Trip**
```typescript
// Feature: unified-theme-system, Property 1: bar filled segment round-trip
it.prop([fc.integer({min:0}), fc.integer({min:1}), fc.integer({min:1, max:20})])(
  'hpBar filled count matches expected ratio',
  (current, max, length) => {
    const result = hpBar(current, max, length);
    const filled = (result.match(/█/g) ?? []).length;
    const expected = Math.round(Math.min(Math.max(current / max, 0), 1) * length);
    return filled === expected;
  }
);
```

**Property 2: Overflow ve Underflow**
```typescript
// Feature: unified-theme-system, Property 2: overflow and underflow boundary
it.prop([fc.integer({min:1}), fc.integer({min:1})])(
  'hpBar with current > max returns full bar',
  (extra, max) => {
    const result = hpBar(max + extra, max);
    return !result.includes('░');
  }
);
```

**Property 3: hpBarColored Renk Eşiği**
```typescript
// Feature: unified-theme-system, Property 3: hpBarColored color threshold
it.prop([fc.integer({min:1, max:1000}), fc.integer({min:1, max:1000})])(
  'hpBarColored returns correct color indicator',
  (hp, hpMax) => {
    const ratio = hp / hpMax;
    const result = hpBarColored(hp, hpMax);
    if (ratio > 0.5) return result.includes('🟩');
    if (ratio > 0.25) return result.includes('🟨');
    return result.includes('🟥');
  }
);
```

**Property 4: toSuperscript Geçerlilik**
```typescript
// Feature: unified-theme-system, Property 4: toSuperscript validity and bounds
const SUP_SET = new Set(['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹']);
it.prop([fc.integer({min:0, max:200})])(
  'toSuperscript returns valid 2-char superscript',
  (n) => {
    const result = toSuperscript(n);
    if (n > 99) return result === '⁹⁹';
    return result.length === 2 && [...result].every(c => SUP_SET.has(c));
  }
);
```

### Derleme Doğrulaması (Smoke Test)

```bash
pnpm build  # tsc -p tsconfig.json — sıfır hata beklenir
```

Geçiş tamamlandıktan sonra `tsc --noEmit` çalıştırılarak tüm UX dosyalarının `theme.ts`'den doğru import yaptığı doğrulanır.

### Entegrasyon Doğrulaması

Bot başlatılarak her komutun (`hunt`, `stats`, `inventory`, `upgrade`, `pvp`, `duel`) önceki görsel çıktıyla tutarlı çıktı ürettiği manuel olarak doğrulanır.
