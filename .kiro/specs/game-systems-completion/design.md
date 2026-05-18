# Design Document — Game Systems Completion

## Genel Bakış

Bu spec, BaykusBot'taki üç küçük ama eksik kalan oyun sistemi parçasını tamamlar. Tüm değişiklikler mevcut dosyalara yerinde düzenleme olarak uygulanır; yeni dosya oluşturulmaz. Değişiklikler birbirinden bağımsızdır ve ayrı ayrı uygulanabilir.

---

## Değişiklik 1 — Prestige XP Bonusu (Deep Stats)

### Sorun

`owl stats deep` komutu `🔬 Formül Kırılımı` alanında prestige'in stat cap etkisini (`+N stat cap`) gösteriyor, ancak XP bonusunu (`+N%`) göstermiyor. Oyuncu prestige yatırımının tam etkisini tek bir ekranda göremez.

### Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/utils/stats-ux.ts` | `PlayerStatsData` arayüzüne `prestigeLevel?: number` eklenir (zaten mevcut); `buildOwlStatsEmbed` deep bloğuna XP bonus satırı eklenir |
| `src/commands/owl-stats.ts` | `PlayerStatsData` nesnesine `prestigeLevel` alanı geçilir (mevcut `prestige` değişkeninden) |

### Veri Modeli Değişikliği

`PlayerStatsData` arayüzü `src/utils/stats-ux.ts` içinde zaten `prestigeLevel?: number` alanına sahiptir. Arayüz değişikliği gerekmez.

```typescript
// Mevcut — değişiklik yok
export interface PlayerStatsData {
  level:          number;
  huntStreak?:    number;
  prestigeLevel?: number;
}
```

### `buildOwlStatsEmbed` Deep Bloğu Değişikliği

`deep` dalındaki `breakdown` string'ine mevcut `🌟 Prestige: +X stat cap` satırının hemen ardından yeni bir satır eklenir:

```typescript
// Mevcut satır (değişmez):
`🌟 Prestige:      **+${prestige * 2} stat cap**\n` +

// Yeni satır (eklenir):
`🌟 Prestige XP:   **+${prestige * 5}%**\n` +
```

`prestige * 5` ifadesi `PRESTIGE_XP_BONUS_PER_LEVEL (0.05) * 100 * prestige` ile eşdeğerdir. Prestige 0 olduğunda `+0%` görüntülenir.

### `owl-stats.ts` Değişikliği

Stats komutunda `player.prestigeLevel` zaten okunmaktadır. `buildOwlStatsEmbed` çağrısına geçilen `PlayerStatsData` nesnesinde `prestigeLevel` alanının doldurulduğu doğrulanır.

---

## Değişiklik 2 — Tame Quest Takibi

### Sorun

`trackQuestProgress` fonksiyonu `src/systems/tame.ts` içinde zaten import edilmiş ve `attemptTame` ile `commitTameResult` içinde çağrılmaktadır. Ancak mevcut çağrılar `amount` parametresini geçmemektedir; `trackQuestProgress` imzası `amount` parametresi bekliyorsa bu eksik olabilir. Ayrıca her iki başarı yolunun da çağrıyı yaptığı doğrulanmalıdır.

### Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/systems/tame.ts` | `commitTameResult` ve `attemptTame` içindeki `trackQuestProgress` çağrılarına `amount: 1` parametresi eklenir |

### `trackQuestProgress` Çağrı Deseni

Her iki başarı yolunda da aynı fire-and-forget deseni kullanılır:

```typescript
// commitTameResult — success === true dalında
trackQuestProgress(prisma, playerId, 'tame', 1).catch(() => null);

// attemptTame — won === true dalında
trackQuestProgress(prisma, playerId, 'tame', 1).catch(() => null);
```

`.catch(() => null)` ile quest takip hataları sessizce bastırılır; tame sonucu hiçbir zaman engellenmez.

### Başarısız Tame Dalları

Kaçış, yaralanma, PvP kaybı ve düz başarısızlık dallarının hiçbirinde `trackQuestProgress` çağrısı yapılmaz. Bu davranış değişmez.

---

## Değişiklik 3 — Quest İlerleme Çubuğu

### Sorun

`owl quests` komutu devam eden görevler için `⏳ 3/10` gibi düz metin gösteriyor. Mevcut `hpBar` yardımcısı kullanılarak görsel bir ilerleme çubuğu eklenebilir.

### Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/commands/owl-quests.ts` | `hpBar` import edilir; `status` string'i devam eden görevler için güncellenir |

### Import Değişikliği

```typescript
// Eklenecek import
import { hpBar } from '../utils/theme';
```

### Status String Değişikliği

Her iki handler'da (`runQuestsMessage` ve `runQuestsSlash`) aynı değişiklik uygulanır:

```typescript
// Mevcut:
const status = q.isClaimed
  ? '✅ Alındı'
  : q.current >= q.target
    ? '🌟 Tamamlandı'
    : `⏳ ${q.current}/${q.target}`;

// Yeni:
const status = q.isClaimed
  ? '✅ Alındı'
  : q.current >= q.target
    ? '🌟 Tamamlandı'
    : `\`${hpBar(q.current, q.target, 10)}\` ${q.current}/${q.target}`;
```

Tamamlanmış (`current >= target`) ve alınmış (`isClaimed`) görevlerin görüntüsü değişmez.

---

## Bileşen Özeti

```
src/utils/stats-ux.ts
  └─ buildOwlStatsEmbed (deep blok)
       └─ "🌟 Prestige XP: +N%" satırı eklenir

src/commands/owl-stats.ts
  └─ PlayerStatsData nesnesinde prestigeLevel doğrulanır

src/systems/tame.ts
  ├─ commitTameResult (success === true)
  │    └─ trackQuestProgress(prisma, playerId, 'tame', 1).catch(() => null)
  └─ attemptTame (won === true)
       └─ trackQuestProgress(prisma, playerId, 'tame', 1).catch(() => null)

src/commands/owl-quests.ts
  ├─ import { hpBar } from '../utils/theme'
  ├─ runQuestsMessage — status string güncellenir
  └─ runQuestsSlash   — status string güncellenir
```

---

## Doğruluk Özellikleri (Property-Based Testing)

Aşağıdaki özellikler `hpBar` fonksiyonunun quest ilerleme çubuğu için doğru çalıştığını garanti eder. Test framework olarak **fast-check** kullanılır.

### Özellik 1 — Çıktı Uzunluğu

**Validates: Requirements 3.6**

`hpBar(current, target, 10)` her zaman tam olarak 10 karakter uzunluğunda bir string döndürür.

```
∀ (current, target) ∈ ℤ²  where  0 ≤ current < target  ∧  target > 0
  hpBar(current, target, 10).length === 10
```

**Generator stratejisi:** `target` 1–1000 arasında rastgele tam sayı; `current` 0 ile `target - 1` arasında rastgele tam sayı.

### Özellik 2 — Dolu Segment Sayısı

**Validates: Requirements 3.7**

`hpBar(current, target, 10)` içindeki `█` karakter sayısı `Math.round((current / target) * 10)` ile eşit olmalıdır.

```
∀ (current, target) ∈ ℤ²  where  0 ≤ current ≤ target  ∧  target > 0
  (hpBar(current, target, 10).match(/█/g) ?? []).length
    === Math.round((current / target) * 10)
```

**Generator stratejisi:** `target` 1–1000 arasında rastgele tam sayı; `current` 0 ile `target` arasında rastgele tam sayı (sınır dahil).

### Özellik 3 — Yalnızca Geçerli Karakterler

`hpBar` çıktısı yalnızca `█` ve `░` karakterlerinden oluşur; başka karakter içermez.

```
∀ (current, target) ∈ ℤ²  where  0 ≤ current ≤ target  ∧  target > 0
  /^[█░]+$/.test(hpBar(current, target, 10)) === true
```

---

## Yeni Dosya Yok

Tüm değişiklikler mevcut dört dosyaya yerinde düzenleme olarak uygulanır. Yeni modül, yardımcı veya tip dosyası oluşturulmaz.
