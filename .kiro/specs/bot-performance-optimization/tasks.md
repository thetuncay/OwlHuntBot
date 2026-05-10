# Uygulama Planı: BaykusBot Performans Optimizasyonu

## Genel Bakış

Bu plan, `/hunt` kritik yolundaki MongoDB round-trip sayısını 4–6'dan en fazla 2'ye indirmek için gereken kod değişikliklerini adım adım tanımlar. Her görev bir öncekinin üzerine inşa edilir; son adımda tüm parçalar `rollHunt` içinde birleştirilir.

**Dil:** TypeScript  
**Etkilenen dosyalar:** `src/utils/player-cache.ts`, `src/systems/xp.ts`, `src/systems/drops.ts`, `src/systems/items.ts`, `src/systems/hunt.ts`

---

## Görevler

- [x] 1. `CachedPlayerData` arayüzünü günlük lootbox alanlarıyla genişlet
  - `src/utils/player-cache.ts` dosyasındaki `CachedPlayerData` arayüzüne `dailyLootboxDrops: number` ve `lastLootboxDropDate: string | null` alanlarını ekle
  - `getPlayerBundle` içindeki `prisma.player.findUnique` sorgusunun `select` listesine bu iki alanı ekle; böylece cache'e yazılan bundle günlük drop verisini de taşır
  - `setCachedPlayerBundle` ve `getCachedPlayerBundle` fonksiyonları tip değişikliğini otomatik olarak alır; ek değişiklik gerekmez
  - _Gereksinimler: 2.3_

- [ ] 2. `addXP` fonksiyonuna `skipDbWrite` parametresi ekle
  - [x] 2.1 `src/systems/xp.ts` dosyasındaki `addXP` imzasına opsiyonel `skipDbWrite?: boolean` parametresi ekle
    - `skipDbWrite = true` ve level-up yok ise: `prisma.player.update` yerine `enqueueDbWrite({ type: 'updatePlayer', playerId, data: { xp: nextXP } })` çağır ve hesaplanan değerleri döndür
    - `skipDbWrite = true` ve level-up var ise: senkron `prisma.player.update` yap (level değişimi kritik, arka plana alınamaz)
    - `skipDbWrite = false` veya belirtilmemiş ise: mevcut davranışı koru (geriye dönük uyumluluk)
    - `enqueueDbWrite` import'unu `src/utils/db-queue.ts`'den ekle
    - _Gereksinimler: 4.1, 4.2, 4.3, 4.5_

  - [ ] 2.2 `addXP` için özellik tabanlı test yaz (Özellik 3)
    - **Özellik 3: XP Hesaplama Tutarlılığı**
    - **Doğrular: Gereksinim 4.3**
    - `fast-check` ile `fc.record({ level: fc.integer({min:1,max:100}), xp: fc.integer({min:0,max:10000}), amount: fc.integer({min:1,max:500}) })` üreteci kullan
    - `skipDbWrite=false` ve `skipDbWrite=true` sonuçlarının `gainedXP`, `currentXP`, `currentLevel` alanlarında eşit olduğunu doğrula
    - Prisma mock'u `jest.fn()` ile oluştur; `player.update` çağrı sayısını spy ile izle
    - Minimum 100 iterasyon çalıştır

  - [ ] 2.3 `addXP` için birim testleri yaz
    - `skipDbWrite=true`, level-up yok: `prisma.player.update` çağrılmadığını, `enqueueDbWrite` çağrıldığını doğrula
    - `skipDbWrite=true`, level-up var: `prisma.player.update` senkron çağrıldığını doğrula
    - `existingPlayer` geçildiğinde `prisma.player.findUnique` çağrılmadığını doğrula
    - _Gereksinimler: 4.1, 4.2, 4.4_

- [x] 3. Kontrol noktası — Testler geçiyor mu?
  - Tüm testlerin geçtiğini doğrula; sorun varsa kullanıcıya sor.

- [ ] 4. `drainBuffCharge` fonksiyonuna Buff_Cache kontrolü ekle
  - [x] 4.1 `src/systems/items.ts` dosyasındaki `drainBuffCharge` fonksiyonunun başına `buffCache` kontrolü ekle
    - `cacheKey = \`${playerId}:${activityType}\`` ile cache'e bak
    - Cache'de kayıt varsa ve TTL dolmamışsa ve tüm effect değerleri sıfırsa (aktif buff yok): erken `return` yap, `findMany` çağırma
    - Cache'de kayıt yoksa (miss): mevcut `findMany` akışını çalıştır; çekilen veriyi `buffCache.set` ile cache'e yaz (TTL: `BUFF_CACHE_TTL_MS`)
    - Charge güncellemesi sonrası `buffCache.delete(cacheKey)` çağrısını koru (mevcut davranış)
    - Aktif buff kontrolü: `cached.effects.catchBonus > 0 || cached.effects.lootMult > 1.0 || cached.effects.rareDropBonus > 0 || cached.effects.upgradeBonus > 0 || cached.effects.downgradeShield < 1.0 || cached.effects.pvpDamageMult > 1.0 || cached.effects.pvpDodgeBonus > 0`
    - _Gereksinimler: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 4.2 `drainBuffCharge` için özellik tabanlı test yaz (Özellik 6)
    - **Özellik 6: Buff Yokken Sıfır DB Round-Trip**
    - **Doğrular: Gereksinim 3.2, 3.5**
    - `fast-check` ile rastgele `playerId` ve `activityType` üret
    - `buffCache`'e aktif buff olmadığını gösteren bir kayıt yerleştir (tüm effect değerleri sıfır/varsayılan)
    - `drainBuffCharge` çağrısı sonrası `prisma.playerBuff.findMany` çağrılmadığını doğrula
    - Minimum 100 iterasyon çalıştır

  - [ ] 4.3 `drainBuffCharge` için birim testleri yaz
    - Buff_Cache'de aktif buff yokken `findMany` çağrılmadığını doğrula
    - Cache miss durumunda `findMany` çağrıldığını ve sonucun cache'e yazıldığını doğrula
    - Charge güncellemesi sonrası `buffCache.delete` çağrıldığını doğrula
    - _Gereksinimler: 3.1, 3.3, 3.4, 3.6_

- [ ] 5. `tryClaimDailyDrop` ve `rollHuntLootboxDrop` fonksiyonlarını Player_Cache'e taşı
  - [x] 5.1 `src/systems/drops.ts` dosyasındaki `tryClaimDailyDrop` fonksiyonunu `cachedPlayer: CachedPlayerData` parametresi alacak şekilde yeniden yaz
    - Fonksiyon imzasını `tryClaimDailyDrop(prisma, redis, playerId, cachedPlayer)` olarak güncelle
    - Günlük sayaç okuma işlemini `prisma.player.findUnique` yerine `cachedPlayer.dailyLootboxDrops` ve `cachedPlayer.lastLootboxDropDate` üzerinden yap
    - Cap kontrolü senkron (DB yok): `currentCount >= DAILY_DROP_CAP` ise `false` döndür
    - Drop gerçekleşirse: `enqueueDbWrite({ type: 'updatePlayer', playerId, data: { dailyLootboxDrops: ..., lastLootboxDropDate: ... } })` ile DB_Queue'ya yaz (fire-and-forget)
    - `enqueueDbWrite` import'unu `src/utils/db-queue.ts`'den ekle
    - `CachedPlayerData` import'unu `src/utils/player-cache.ts`'den ekle
    - _Gereksinimler: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 5.2 `rollHuntLootboxDrop` imzasını `redis` ve `cachedPlayer` parametrelerini alacak şekilde güncelle
    - Fonksiyon imzasına `redis: Redis` ve `cachedPlayer: CachedPlayerData` parametrelerini ekle
    - `tryClaimDailyDrop` çağrısını yeni imzayla güncelle
    - `addLootboxToInventory` çağrısını `enqueueDbWriteBulk` ile DB_Queue'ya taşı (envanter yazma kritik yol dışı)
    - `ioredis` import'unu ekle
    - _Gereksinimler: 2.1, 2.2, 2.4_

  - [ ] 5.3 `rollHuntLootboxDrop` için özellik tabanlı test yaz (Özellik 5)
    - **Özellik 5: Günlük Drop Cap Koruması**
    - **Doğrular: Gereksinim 2.4**
    - `fast-check` ile `dailyLootboxDrops: fc.integer({min: 5, max: 20})` ve `lastLootboxDropDate: fc.constant(new Date().toISOString())` üret
    - `cachedPlayer` nesnesini bu değerlerle oluştur
    - `rollHuntLootboxDrop` sonucunun boş dizi olduğunu doğrula
    - Minimum 100 iterasyon çalıştır

  - [ ] 5.4 `tryClaimDailyDrop` için birim testleri yaz
    - Cap dolduğunda `false` döndürdüğünü ve DB'ye gitmediğini doğrula
    - Yeni gün başladığında sayacın sıfırlandığını doğrula
    - Drop gerçekleştiğinde `enqueueDbWrite` çağrıldığını doğrula
    - _Gereksinimler: 2.3, 2.4, 2.5_

- [x] 6. Kontrol noktası — Testler geçiyor mu?
  - Tüm testlerin geçtiğini doğrula; sorun varsa kullanıcıya sor.

- [ ] 7. `rollHunt` içinde player okumayı cache-first stratejisine geçir
  - [x] 7.1 `src/systems/hunt.ts` dosyasındaki `rollHunt` fonksiyonunda `prisma.player.upsert` çağrısını `getPlayerBundle` ile değiştir
    - `getPlayerBundle(redis, prisma, playerId)` çağrısını `prisma.owl.findUnique` ve `getBuffEffects` ile paralel çalıştır (`Promise.all` yapısını koru)
    - `bundle` null ise (yeni oyuncu): `prisma.player.upsert({ where: { id: playerId }, create: { id: playerId }, update: {} })` ile kayıt oluştur, ardından `setCachedPlayerBundle` ile cache'e yaz
    - `bundle` null değilse: `bundle.player` ve `bundle.mainOwl` kullan
    - `getPlayerBundle`, `setCachedPlayerBundle` import'larını `src/utils/player-cache.ts`'den ekle
    - `owlId` parametresi hâlâ `prisma.owl.findUnique` ile doğrulanmalı (bundle'daki `mainOwlId` ile eşleşme kontrolü)
    - _Gereksinimler: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.5, 6.6_

  - [-] 7.2 `getPlayerBundle` için özellik tabanlı test yaz (Özellik 7)
    - **Özellik 7: Graceful Degradation**
    - **Doğrular: Gereksinim 6.6**
    - `fast-check` ile rastgele `playerId` string'i üret
    - Her çağrıda hata fırlatan `brokenRedis` mock'u oluştur
    - `getPlayerBundle(brokenRedis, mockPrisma, playerId)` çağrısının hata fırlatmadığını ve `null` veya geçerli bundle döndürdüğünü doğrula
    - Minimum 100 iterasyon çalıştır

  - [ ] 7.3 `rollHunt` player okuma için birim testleri yaz
    - Cache hit durumunda `prisma.player.upsert` çağrılmadığını doğrula
    - Cache miss + DB hit durumunda `findUnique` çağrıldığını ve cache'e yazıldığını doğrula
    - Cache miss + DB miss durumunda `upsert` çağrıldığını doğrula
    - _Gereksinimler: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 8. `rollHunt` içinde streak ve XP güncellemelerini tek yazma işleminde birleştir
  - [x] 8.1 `src/systems/hunt.ts` dosyasındaki `rollHunt` fonksiyonunda `addXP` ve `prisma.player.update` (streak) çağrılarını yeniden düzenle
    - `addXP` çağrısını `skipDbWrite: true` ile yap; DB yazma işlemini `addXP` içinde değil `rollHunt` içinde gerçekleştir
    - Level-up yoksa: `huntComboStreak`, `noRareStreak`, `lastHunt`, `xp` alanlarını tek `prisma.player.update` çağrısında birleştir
    - Level-up varsa: `huntComboStreak`, `noRareStreak`, `lastHunt`, `level`, `xp` alanlarını tek `prisma.player.update` çağrısında birleştir
    - Mevcut `Promise.all([addXP(...), prisma.player.update(...streak...), ...bond...])` yapısını koru; sadece `addXP` ve streak update'i birleştir, bond update'i paralel bırak
    - `rollHuntLootboxDrop` çağrısını yeni imzayla güncelle (`redis` ve `bundle.player` parametrelerini geç)
    - `invalidatePlayerCache` çağrısını hunt turu sonunda koru
    - _Gereksinimler: 5.1, 5.2, 5.3, 5.4, 5.5, 6.2, 6.4, 6.7_

  - [ ] 8.2 Birleşik yazma için özellik tabanlı test yaz (Özellik 4)
    - **Özellik 4: Birleşik Yazma Bütünlüğü**
    - **Doğrular: Gereksinim 5.1, 5.3**
    - `fast-check` ile level-up gerçekleşmeyen `(level, xp, amount)` üçlüleri üret
    - `prisma.player.update` spy'ı ile çağrı sayısını izle
    - Hunt turu sonunda `huntComboStreak`, `noRareStreak`, `lastHunt`, `xp` alanlarının tek bir `update` çağrısında yazıldığını doğrula (ikinci `update` çağrısı olmamalı)
    - Minimum 100 iterasyon çalıştır

  - [ ] 8.3 `rollHunt` için özellik tabanlı test yaz (Özellik 1 ve 2)
    - **Özellik 1: Player Cache Round-Trip Azaltımı**
    - **Doğrular: Gereksinim 1.2**
    - **Özellik 2: Yeni Oyuncu Upsert Koşulluluğu**
    - **Doğrular: Gereksinim 1.4, 1.5**
    - Cache hit senaryosunda `prisma.player.findUnique` ve `prisma.player.upsert` çağrılmadığını doğrula
    - Cache'de kayıt varken `upsert` çağrılmadığını doğrula; yalnızca cache miss + DB miss durumunda `upsert` çağrıldığını doğrula
    - Minimum 100 iterasyon çalıştır

  - [ ] 8.4 `rollHunt` için entegrasyon testi yaz
    - Prisma mock ile spy kullanarak tam hunt akışında kritik yoldaki `prisma.player.*` çağrı sayısını ölç
    - Cache hit, buff yok, level-up yok senaryosunda en fazla 1 `player` sorgusu (birleşik yazma) olduğunu doğrula
    - Cache miss, buff yok, level-up yok senaryosunda en fazla 2 `player` sorgusu (okuma + birleşik yazma) olduğunu doğrula
    - _Gereksinimler: 5.5_

- [x] 9. Son kontrol noktası — Tüm testler geçiyor mu?
  - Tüm testlerin geçtiğini doğrula; sorun varsa kullanıcıya sor.

---

## Notlar

- `*` ile işaretli görevler isteğe bağlıdır; MVP için atlanabilir
- Her görev belirli gereksinimlere referans verir (izlenebilirlik için)
- Kontrol noktaları artımlı doğrulama sağlar
- Özellik tabanlı testler `fast-check` kütüphanesi ile yazılır (minimum 100 iterasyon)
- Birim testler belirli örnekleri ve kenar durumları doğrular
- `addLootboxToInventory` fonksiyonu `enqueueDbWriteBulk` ile DB_Queue'ya taşındığında `drops.ts` içindeki `prisma.inventoryItem.upsert` çağrısı kaldırılır
- `withLock` mekanizması, `Promise.all` paralel yapısı ve `enqueueDbWriteBulk` envanter yazmaları değiştirilmez (Gereksinim 6)
