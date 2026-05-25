# Tasarım Dokümanı — OwlHuntBot Performans Optimizasyonu

## Genel Bakış

Bu doküman, 14 gereksinimi karşılayan teknik tasarım kararlarını açıklar. Her bölüm hangi dosyanın nasıl değiştirileceğini, neden bu yaklaşımın seçildiğini ve dikkat edilmesi gereken kenar durumları içerir.

---

## 1. ensureRegisteredForInteraction Redis Önbelleği

**Dosya:** `src/systems/onboarding.ts`

**Mevcut durum:** `hasMainOwl()` her çağrıda 2 DB round-trip yapıyor (`player.findUnique` + `owl.findFirst`).

**Tasarım:**
```
ensureRegisteredForInteraction(interaction, ctx)
  → redis.get("reg:{userId}")
    → HIT: return true (0 DB round-trip)
    → MISS: hasMainOwl() → DB (2 round-trip)
              → true ise: redis.set("reg:{userId}", "1", EX 60) → return true
              → false ise: kayıt formu göster → return false
```

`handleRegistrationButton` başarılı kayıt sonrasında `reg:{userId}` anahtarını Redis'e yazar — böylece bir sonraki komutta cache hit olur.

**Kenar durum:** Oyuncu kayıt sildirirse veya main owl silinirse cache 60 saniye boyunca stale kalabilir. Bu kabul edilebilir — 60 saniye sonra otomatik düzelir.

---

## 2. Hunt Duplicate Fetch Kaldırma

**Dosya:** `src/commands/owl-hunt.ts`

**Mevcut durum:** `runHunt` içinde `getPlayerBundle()` çağrısı yapılıyor, ardından `rollHunt` içinde aynı veri tekrar çekiliyor.

**Tasarım:** `owl-hunt.ts`'deki `getPlayerBundle` çağrısı zaten `rollHunt` öncesinde `bundle.mainOwl.id` almak için kullanılıyor. `rollHunt` içinde `getPlayerBundle` (cache-first) zaten çağrılıyor. Dolayısıyla `owl-hunt.ts`'deki `getPlayerBundle` çağrısı kaldırılır; `mainOwl.id` bilgisi `rollHunt`'a parametre olarak geçilmek yerine `rollHunt` içinden alınır.

**Not:** `rollHunt` zaten `getPlayerBundle` kullanıyor ve cache-first çalışıyor. İkinci çağrı cache hit olsa bile gereksiz Redis round-trip'i önlemek için kaldırılır.

---

## 3. Hunt Write'larını Tek Transaction'a Toplama

**Dosya:** `src/systems/hunt.ts`

**Mevcut durum:** `rollHunt` içinde birden fazla ayrı `prisma.player.update` çağrısı var (streak + xp, bond ayrı).

**Tasarım:** XP hesabı (level-up mantığı dahil) transaction dışında pure JS olarak yapılır. Tek `prisma.player.update` çağrısında tüm alanlar birleştirilir:

```typescript
await prisma.player.update({
  where: { id: playerId },
  data: {
    huntComboStreak: newStreak,
    noRareStreak: newNoRareStreak,
    lastHunt: new Date(),
    level: xpResult.levelUp?.newLevel ?? player.level,
    xp: xpResult.levelUp?.remainingXP ?? xpResult.currentXP,
    totalXP: { increment: gainedXP },  // Gereksinim 7 ile birlikte
  },
});
```

Bond güncellemesi `Promise.all` ile paralel çalışmaya devam eder (farklı model, farklı document).

---

## 4. Redis Pipeline

**Dosya:** `src/middleware/cooldown.ts` — `checkKeysPipelined` fonksiyonu zaten mevcut.

**Mevcut durum:** `antiSpam` ve `cooldown` kontrolleri ayrı ayrı Redis çağrısı yapıyor.

**Tasarım:** `enforceAntiSpam` + `getCooldownRemainingMs` çağrıları pipeline'a alınır. `checkKeysPipelined` fonksiyonu genişletilerek `mute`, `rate bucket`, `cooldown` anahtarlarını tek round-trip'te okur.

```typescript
// Yeni: checkCommandPipeline(redis, userId, cooldownKey, cooldownMs)
// → pipeline: GET mute:{userId}, GET rate:{userId}, PTTL cooldown:{key}
// → tek exec() → sonuçları parse et
```

---

## 5. consumeRateLimitToken Lua Script Doğrulama

**Dosya:** `src/utils/redis.ts`

**Mevcut durum:** Satır 30-42'de Lua script zaten mevcut ve atomik. `INCR` + `EXPIRE` tek script içinde çalışıyor.

**Tasarım:** Mevcut implementasyon gereksinimi karşılıyor. Doğrulama testi yazılır, kod değişikliği gerekmez.

---

## 6. refreshPowerScore Dinamik Import → Statik Import

**Dosya:** `src/systems/leaderboard.ts`

**Mevcut durum:**
```typescript
const { xpRequired } = await import('../utils/math.js');  // satır 87
```
ve `backfillLeaderboardStats` içinde de aynı dinamik import.

**Tasarım:** Dosya başına statik import eklenir:
```typescript
import { xpRequired } from '../utils/math.js';
```
Her iki dinamik import kaldırılır.

---

## 7. refreshPowerScore XP Loop Kaldırma + Player.totalXP Alanı

**Dosyalar:** `prisma/schema.prisma`, `src/systems/xp.ts`, `src/systems/leaderboard.ts`

**Mevcut durum:** `refreshPowerScore` her çağrıda `for (let l = 1; l < player.level; l++)` döngüsü çalıştırıyor.

**Tasarım:**

1. `prisma/schema.prisma`'ya `totalXP Int @default(0)` alanı eklenir.
2. `src/systems/xp.ts`'deki `addXP` fonksiyonu `player.totalXP` alanını `{ increment: gainedXP }` ile günceller.
3. `refreshPowerScore` döngü yerine `player.totalXP` okur:

```typescript
export async function refreshPowerScore(prisma: PrismaClient, playerId: string): Promise<number> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { level: true, totalXP: true, totalRareFinds: true },
  });
  if (!player) return 0;
  const score = calcPowerScore(player.level, player.totalXP, player.totalRareFinds);
  await prisma.player.update({ where: { id: playerId }, data: { powerScore: score } });
  return score;
}
```

4. `backfillLeaderboardStats` mevcut oyuncular için `totalXP` backfill eder.

---

## 8. upgrade.ts Sequential for-await → Promise.all + updateMany

**Dosya:** `src/systems/upgrade.ts`

**Mevcut durum:** `attemptUpgrade` içinde iki ayrı `for` döngüsü var — biri `findUnique`, biri `update`.

**Tasarım:**

```typescript
// Önce: paralel findUnique
const invChecks = await Promise.all(
  requiredCosts.map(cost =>
    tx.inventoryItem.findUnique({
      where: { ownerId_itemName: { ownerId: playerId, itemName: cost.itemName } }
    })
  )
);

// Sonra: tek updateMany
await tx.inventoryItem.updateMany({
  where: {
    ownerId: playerId,
    itemName: { in: requiredCosts.map(c => c.itemName) },
  },
  data: { quantity: { decrement: matRequirement } },
});
```

Ek item bonusları için de aynı pattern uygulanır.

---

## 9. Prisma Connection Pool Optimizasyonu

**Dosya:** `src/index.ts`

**Mevcut durum:** `appendPoolParams` fonksiyonu `maxPoolSize=10&connectTimeoutMS=10000` ekliyor.

**Tasarım:** `maxPoolSize=20` ve `pool_timeout=10` olarak güncellenir:

```typescript
function appendPoolParams(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}maxPoolSize=20&pool_timeout=10&connectTimeoutMS=10000`;
}
```

---

## 10. Ephemeral deferReply

**Dosyalar:** `src/commands/coinflip.ts`, `src/commands/slot.ts`, `src/commands/bj.ts`, `src/commands/owl-pvp.ts` (duel)

**Mevcut durum:**
- `coinflip.ts`: `interaction.reply(...)` ile başlıyor — `deferReply` yok.
- `slot.ts`: `interaction.reply(...)` ile başlıyor — `deferReply` yok.
- `bj.ts`: `interaction.reply(...)` ile başlıyor — `deferReply` yok.
- `owl-pvp.ts` `runDuel`: `interaction.deferReply()` var ama `flags: 64` yok.
- `owl-hunt.ts`: Zaten `deferReply({ flags: 64 })` kullanıyor ✓

**Tasarım:**

`coinflip` ve `slot` için: `interaction.reply()` → `await interaction.deferReply({ flags: 64 })` + `await interaction.editReply(...)` pattern'ine geçilir.

`bj` için: İlk `interaction.reply()` → `await interaction.deferReply({ flags: 64 })` + `await interaction.editReply(...)`.

`runDuel` için: `interaction.deferReply()` → `interaction.deferReply({ flags: 64 })`.

`runVs` (PvP davet): Davet mesajı herkese görünür olmalı (rakip görmeli) — ephemeral yapılmaz.

---

## 11. Coinflip Animasyon Azaltma

**Dosya:** `src/commands/coinflip.ts`

**Mevcut durum:** 5 frame × 200ms = 1000ms animasyon süresi.

**Tasarım:** 3 frame × 150ms = 450ms:

```typescript
const flipFrames = ['🪙', '🔄', '🪙'];
for (const frame of flipFrames) {
  await sleep(150);
  await interaction.editReply({ content: `...${frame}` });
}
```

---

## 12. Collector TTL Azaltma

**Dosyalar:** `src/commands/leaderboard.ts`, `src/commands/bj.ts`

**Mevcut durum:**
- `leaderboard.ts`: `COLLECTOR_TTL = 90_000`
- `bj.ts`: `time: 60_000`

**Tasarım:**
- `COLLECTOR_TTL = 30_000` (leaderboard)
- `time: 45_000` (bj)

---

## 13. Leaderboard Redis Sorted Set

**Dosyalar:** `src/systems/leaderboard.ts`, `src/systems/leaderboard-queries.ts`

**Mevcut durum:** `getRankFromDB` MongoDB `COUNT` sorgusu kullanıyor.

**Tasarım:**

```
Key format: lb:{category}  (örn: lb:power, lb:hunt)
ZADD lb:{category} {score} {playerId}   → skor güncelleme
ZREVRANK lb:{category} {playerId}       → rank sorgulama (0-indexed, +1 ile 1-indexed'e çevir)
ZCARD lb:{category}                     → toplam oyuncu sayısı
```

`getRankFromDB` fonksiyonu Redis'e önce bakar, miss durumunda MongoDB'den okuyup Sorted Set'i seed'ler.

`recordHuntStats`, `recordPvpWin`, `recordCoinsEarned` fonksiyonları DB yazmasının yanı sıra Redis Sorted Set'i de günceller.

**Seed mekanizması:** Sorted Set boşsa `fetchFromDB` sonuçlarıyla `ZADD` ile doldurulur.

---

## 14. MongoDB Index Doğrulama

**Dosya:** `prisma/schema.prisma`

**Mevcut durum:** `@@index([powerScore])`, `@@index([totalHunts])`, `@@index([totalRareFinds])`, `@@index([totalPvpWins])`, `@@index([totalCoinsEarned])` zaten mevcut.

**Tasarım:** `totalXP` alanı eklendiğinde `@@index([totalXP])` de eklenir. Mevcut index'ler korunur.

---

## Bağımlılık Sırası

Aşağıdaki sıra uygulamada önemlidir:

1. **Önce schema değişikliği** (Gereksinim 7 — `totalXP` alanı) → `prisma db push`
2. **Sonra backfill** (mevcut oyuncular için `totalXP` doldurma)
3. **Sonra kod değişiklikleri** (diğer tüm gereksinimler bağımsız)

Gereksinimler 5 ve 14 doğrulama gerektiriyor, kod değişikliği yok.

---

## Property-Based Test Stratejisi

Her optimizasyon için `src/__tests__/` altında test dosyaları oluşturulur. `fast-check` kütüphanesi kullanılır (zaten `package.json`'da mevcut).

| Test | Dosya | Strateji |
|------|-------|----------|
| G1 Cache tutarlılığı | `perf-cache.test.ts` | Mock Redis, cache hit/miss karşılaştır |
| G3 Transaction atomikliği | `perf-transaction.test.ts` | Hata enjeksiyonu, rollback doğrula |
| G5 Rate limiter atomikliği | `perf-ratelimit.test.ts` | Eşzamanlı çağrı simülasyonu |
| G7 totalXP invariant | `perf-totalxp.test.ts` | Arbitrary level/xp, formül doğrula |
| G8 Upgrade sıra bağımsızlığı | `perf-upgrade.test.ts` | Promise.all vs sequential karşılaştır |
| G13 Sorted Set tutarlılığı | `perf-sortedset.test.ts` | Mock Redis ZADD/ZREVRANK vs COUNT |
