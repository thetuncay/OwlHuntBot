# Gereksinimler Dokümanı

## Giriş

Bu doküman, **OwlHuntBot** Discord botunun production performansını iyileştirmeye yönelik optimizasyon çalışmalarının gereksinimlerini tanımlar. Bot; TypeScript, discord.js v14, Prisma + MongoDB, ioredis ve BullMQ teknoloji yığını üzerine inşa edilmiştir.

Optimizasyonlar 14 ayrı gereksinim grubuna ayrılmıştır: Redis önbellekleme, veritabanı yazma birleştirme, ağ round-trip azaltma, atomik işlemler, statik import optimizasyonu, şema değişiklikleri, eşzamanlı işlem yükseltmeleri, bağlantı havuzu ayarı, Discord API etkileşim optimizasyonu, animasyon hızlandırma, collector yaşam süresi kısaltma, Redis Sorted Set tabanlı liderboard ve MongoDB index ekleme.

---

## Sözlük

- **Cache_Manager**: Redis önbellek okuma/yazma işlemlerini yöneten bileşen.
- **Hunt_System**: `rollHunt` fonksiyonunu barındıran, av turu simülasyonunu gerçekleştiren sistem (`src/systems/hunt.ts`).
- **Transaction_Manager**: Prisma `$transaction` bloklarını yöneten bileşen.
- **Pipeline_Manager**: ioredis pipeline oluşturup çalıştıran bileşen.
- **Rate_Limiter**: `consumeRateLimitToken` Lua script'ini barındıran bileşen (`src/utils/redis.ts`).
- **Import_Loader**: Modül import mekanizmasını temsil eden kavramsal bileşen.
- **Player_Model**: Prisma `Player` şema modelini temsil eder.
- **Upgrade_System**: `attemptUpgrade` ve `getUpgradePreview` fonksiyonlarını barındıran sistem (`src/systems/upgrade.ts`).
- **Connection_Pool**: Prisma MongoDB bağlantı havuzunu temsil eder.
- **Interaction_Handler**: Discord slash komut etkileşimlerini işleyen bileşen.
- **Leaderboard_System**: Liderboard sorgulama ve güncelleme işlemlerini yöneten sistem (`src/systems/leaderboard.ts`).
- **TTL**: Time-To-Live — bir önbellek veya collector girişinin geçerlilik süresi (saniye cinsinden).
- **Pipeline**: ioredis'in birden fazla komutu tek TCP round-trip'te göndermesini sağlayan mekanizma.
- **Sorted_Set**: Redis'in sıralı küme veri yapısı; `ZADD`, `ZREVRANK` komutlarıyla kullanılır.
- **Ephemeral**: Discord'da yalnızca komutu kullanan kişiye görünen, başkalarına görünmeyen mesaj (`flags: 64`).

---

## Gereksinimler

---

### Gereksinim 1: ensureRegisteredForInteraction Redis Önbelleği

**Kullanıcı Hikayesi:** Bir bot kullanıcısı olarak, her komut çağrısında kayıt durumunun veritabanından tekrar sorgulanmasını istemiyorum; böylece komut yanıt süresi azalır.

#### Kabul Kriterleri

1. WHEN `ensureRegisteredForInteraction` çağrıldığında, THE `Cache_Manager` SHALL `reg:{userId}` anahtarını Redis'te kontrol eder.
2. WHEN `reg:{userId}` anahtarı Redis'te mevcutsa, THE `Cache_Manager` SHALL veritabanına sorgu göndermeden `true` döndürür.
3. WHEN `reg:{userId}` anahtarı Redis'te mevcut değilse, THE `Cache_Manager` SHALL veritabanından kayıt durumunu sorgular ve sonucu 60 saniyelik TTL ile Redis'e yazar.
4. IF veritabanı sorgusu başarısız olursa, THEN THE `Cache_Manager` SHALL hatayı çağrıcıya iletir ve önbelleğe herhangi bir değer yazmaz.
5. FOR ALL `userId` değerleri, cache hit ve cache miss durumları SHALL aynı boolean sonucu döndürür (önbellek tutarlılığı).

---

### Gereksinim 2: Hunt Duplicate Fetch Kaldırma

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, `runHunt` fonksiyonundaki gereksiz `player + owl` ön-fetch'ini kaldırmak istiyorum; böylece her hunt çağrısında fazladan veritabanı round-trip'i ortadan kalkar.

#### Kabul Kriterleri

1. WHEN `runHunt` çağrıldığında, THE `Hunt_System` SHALL `player` ve `owl` verilerini yalnızca `rollHunt` içindeki transaction akışından okur; `rollHunt` öncesinde ayrı bir fetch yapmaz.
2. THE `Hunt_System` SHALL `rollHunt` fonksiyonuna gerekli tüm parametreleri `runHunt` dışından değil, `rollHunt` içinden sağlar.
3. IF `rollHunt` çağrısı öncesinde `player` veya `owl` verisi eksikse, THEN THE `Hunt_System` SHALL `rollHunt` içindeki mevcut hata yönetimi mekanizmasına güvenir.
4. FOR ALL hunt çağrıları, duplicate fetch kaldırıldıktan sonra hunt sonucu SHALL duplicate fetch varken üretilen sonuçla işlevsel olarak eşdeğer olur.

---

### Gereksinim 3: Hunt Write'larını Tek Transaction'a Toplama

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, hunt sırasında gerçekleşen tüm veritabanı yazma işlemlerini tek bir `$transaction` bloğuna toplamak istiyorum; böylece kısmi yazma durumu ortadan kalkar ve atomiklik sağlanır.

#### Kabul Kriterleri

1. WHEN bir hunt turu tamamlandığında, THE `Transaction_Manager` SHALL `addXP`, `inventoryOps`, `player.update` ve `recordHuntStats` yazma işlemlerini tek bir `$transaction` bloğu içinde çalıştırır.
2. THE `Hunt_System` SHALL XP hesaplamasını (level-up mantığı dahil) transaction bloğu dışında saf JavaScript olarak gerçekleştirir; yalnızca hesaplanan son değerleri transaction'a yazar.
3. IF transaction bloğu herhangi bir adımda başarısız olursa, THEN THE `Transaction_Manager` SHALL tüm yazma işlemlerini geri alır ve hiçbir kısmi durum veritabanında kalmaz.
4. FOR ALL hunt transaction'ları, transaction öncesi ve sonrası `player.coins + player.xp + inventory` toplamı SHALL tutarlı bir durum geçişini yansıtır (atomiklik özelliği).

---

### Gereksinim 4: Redis Pipeline ile Round-Trip Azaltma

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, `antiSpam`, `cooldown` ve `lock` için yapılan 7 ayrı Redis çağrısını tek bir pipeline çağrısına indirgemek istiyorum; böylece ağ gecikmesi azalır.

#### Kabul Kriterleri

1. WHEN bir komut etkileşimi işlendiğinde, THE `Pipeline_Manager` SHALL `antiSpam`, `cooldown` ve `lock` kontrollerine ait Redis komutlarını tek bir `pipeline.exec()` çağrısında gönderir.
2. THE `Pipeline_Manager` SHALL pipeline sonucunu sıralı olarak işler; her komutun yanıtı doğru indeksten okunur.
3. IF `pipeline.exec()` `null` döndürürse, THEN THE `Pipeline_Manager` SHALL güvenli varsayılan değerleri kullanır ve işlemi devam ettirir.
4. FOR ALL pipeline çağrıları, pipeline ile gönderilen komutların sonuçları SHALL sıralı ayrı çağrılarla elde edilen sonuçlarla eşdeğer olur (sıra bağımsızlığı özelliği).

---

### Gereksinim 5: consumeRateLimitToken Lua Script Doğrulama

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, `consumeRateLimitToken` fonksiyonundaki `INCR + EXPIRE` işleminin atomik olduğunu doğrulamak istiyorum; böylece race condition riski sıfırlanır.

#### Kabul Kriterleri

1. THE `Rate_Limiter` SHALL `INCR` ve `EXPIRE` komutlarını tek bir Lua script içinde atomik olarak çalıştırır.
2. WHEN `consumeRateLimitToken` eşzamanlı olarak birden fazla kez çağrıldığında, THE `Rate_Limiter` SHALL token sayacının `limit` değerini hiçbir zaman aşmamasını garanti eder.
3. WHEN mevcut Lua script incelendiğinde, THE `Rate_Limiter` SHALL `redis.ts` satır 30-42'deki implementasyonun atomiklik gereksinimini karşıladığını doğrular; eksiklik varsa düzeltir.
4. FOR ALL eşzamanlı `consumeRateLimitToken` çağrıları, onaylanan token sayısı SHALL `limit` değerini aşmaz (atomiklik özelliği).

---

### Gereksinim 6: refreshPowerScore Dinamik Import'tan Statik Import'a Geçiş

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, `refreshPowerScore` içindeki `await import('../utils/math')` dinamik import'unu dosya başına statik import'a taşımak istiyorum; böylece her çağrıda modül çözümleme maliyeti ortadan kalkar.

#### Kabul Kriterleri

1. THE `Import_Loader` SHALL `xpRequired` fonksiyonunu `src/systems/leaderboard.ts` dosyasının başında statik `import` ifadesiyle yükler.
2. WHEN `refreshPowerScore` çağrıldığında, THE `Import_Loader` SHALL `await import(...)` ifadesi kullanmaz; statik olarak yüklenmiş `xpRequired` referansını kullanır.
3. THE `Import_Loader` SHALL `backfillLeaderboardStats` fonksiyonundaki dinamik import'u da statik import'a dönüştürür.
4. FOR ALL `refreshPowerScore` çağrıları, statik import sonrası hesaplanan `powerScore` değeri SHALL dinamik import ile hesaplanan değerle matematiksel olarak eşdeğer olur.

---

### Gereksinim 7: refreshPowerScore XP Loop Kaldırma

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, `refreshPowerScore` içindeki `totalXP` hesaplama döngüsünü kaldırmak istiyorum; bunun yerine `Player` modeline `totalXP` alanı ekleyerek her XP kazanımında artımlı güncelleme yapmak istiyorum.

#### Kabul Kriterleri

1. THE `Player_Model` SHALL `totalXP` adında bir `Int` alanı içerir; varsayılan değeri `0`'dır.
2. WHEN bir oyuncu XP kazandığında, THE `Hunt_System` SHALL `player.totalXP` alanını `{ increment: gainedXP }` ile günceller.
3. WHEN `refreshPowerScore` çağrıldığında, THE `Leaderboard_System` SHALL `totalXP` değerini `Player` modelinden doğrudan okur; level döngüsü hesaplaması yapmaz.
4. IF `totalXP` alanı `0` olan mevcut oyuncular varsa, THEN THE `Player_Model` SHALL backfill mekanizması aracılığıyla `totalXP` değerlerini hesaplanmış değerlerle doldurur.
5. FOR ALL oyuncular, `Player.totalXP` değeri SHALL `sum(xpRequired(l) for l in 1..level-1) + player.xp` formülüyle hesaplanan değerle eşdeğer olur (invariant özelliği).

---

### Gereksinim 8: upgrade.ts Sequential for-await'ten Promise.all + updateMany'e Geçiş

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, `upgrade.ts` içindeki sıralı `for-await` döngülerini `Promise.all` ve `updateMany` ile değiştirmek istiyorum; böylece upgrade işlemi süresi azalır.

#### Kabul Kriterleri

1. WHEN `attemptUpgrade` çağrıldığında, THE `Upgrade_System` SHALL birden fazla envanter öğesini güncellemek için sıralı `for-await` döngüsü yerine `updateMany` veya `Promise.all` kullanır.
2. THE `Upgrade_System` SHALL tüm envanter güncellemelerini tek bir veritabanı round-trip'inde tamamlar.
3. IF herhangi bir envanter güncellemesi başarısız olursa, THEN THE `Upgrade_System` SHALL transaction bloğu içinde tüm değişiklikleri geri alır.
4. FOR ALL upgrade işlemleri, `Promise.all` ile gerçekleştirilen güncellemeler SHALL sıralı güncellemelerle aynı nihai envanter durumunu üretir (sıra bağımsızlığı özelliği).

---

### Gereksinim 9: Prisma Bağlantı Havuzu Optimizasyonu

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, Prisma MongoDB bağlantı havuzunu `maxPoolSize=20` ve `pool_timeout=10` parametreleriyle yapılandırmak istiyorum; böylece eşzamanlı yük altında bağlantı kuyruğu azalır.

#### Kabul Kriterleri

1. THE `Connection_Pool` SHALL `maxPoolSize` parametresini `20` olarak yapılandırır (mevcut değer: `10`).
2. THE `Connection_Pool` SHALL `pool_timeout` parametresini `10` saniye olarak yapılandırır.
3. WHEN `appendPoolParams` fonksiyonu çağrıldığında, THE `Connection_Pool` SHALL `DATABASE_URL`'e `maxPoolSize=20&pool_timeout=10` parametrelerini ekler.
4. IF `DATABASE_URL` zaten sorgu parametresi içeriyorsa, THEN THE `Connection_Pool` SHALL parametreleri `&` ile ekler; `?` ile değil.

---

### Gereksinim 10: Ephemeral deferReply Kullanımı

**Kullanıcı Hikayesi:** Bir bot kullanıcısı olarak, hunt, pvp, upgrade, bj, coinflip ve slot komutlarının yanıtlarının yalnızca bana görünmesini istiyorum; böylece kanal rate limit riski sıfırlanır ve diğer kullanıcıların kanalı kalabalıklaşmaz.

#### Kabul Kriterleri

1. WHEN `coinflip` slash komutu çalıştırıldığında, THE `Interaction_Handler` SHALL `deferReply({ flags: 64 })` ile ephemeral yanıt başlatır.
2. WHEN `slot` slash komutu çalıştırıldığında, THE `Interaction_Handler` SHALL `deferReply({ flags: 64 })` ile ephemeral yanıt başlatır.
3. WHEN `bj` slash komutu çalıştırıldığında, THE `Interaction_Handler` SHALL `deferReply({ flags: 64 })` ile ephemeral yanıt başlatır.
4. WHEN `pvp` slash komutu çalıştırıldığında, THE `Interaction_Handler` SHALL `deferReply({ flags: 64 })` ile ephemeral yanıt başlatır.
5. WHILE `leaderboard` komutu çalışırken, THE `Interaction_Handler` SHALL ephemeral flag kullanmaz; liderboard herkese görünür kalır.
6. THE `Interaction_Handler` SHALL `hunt` komutunda mevcut `deferReply({ flags: 64 })` kullanımını korur; değiştirmez.

---

### Gereksinim 11: Coinflip Animasyon Azaltma

**Kullanıcı Hikayesi:** Bir bot kullanıcısı olarak, coinflip animasyonunun daha hızlı tamamlanmasını istiyorum; böylece sonucu daha çabuk görürüm.

#### Kabul Kriterleri

1. THE `Interaction_Handler` SHALL coinflip animasyonunu 5 frame yerine 3 frame ile gerçekleştirir.
2. THE `Interaction_Handler` SHALL her frame arasındaki bekleme süresini 200ms yerine 150ms olarak uygular.
3. WHEN coinflip animasyonu tamamlandığında, THE `Interaction_Handler` SHALL sonuç mesajını (kazanç/kayıp bilgisi dahil) doğru şekilde gösterir.
4. FOR ALL coinflip çağrıları, 3 frame × 150ms animasyon sonrası gösterilen sonuç SHALL 5 frame × 200ms animasyon sonrası gösterilen sonuçla işlevsel olarak eşdeğer olur.

---

### Gereksinim 12: Collector TTL Azaltma

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, leaderboard ve blackjack collector'larının yaşam sürelerini kısaltmak istiyorum; böylece bellekte gereksiz yere bekleyen collector sayısı azalır.

#### Kabul Kriterleri

1. THE `Interaction_Handler` SHALL leaderboard collector'ının `time` parametresini 90.000ms yerine 30.000ms olarak ayarlar.
2. THE `Interaction_Handler` SHALL blackjack (bj) collector'ının `time` parametresini 60.000ms yerine 45.000ms olarak ayarlar.
3. WHEN collector süresi dolduğunda, THE `Interaction_Handler` SHALL kullanıcıya süre doldu mesajı gösterir ve bileşenleri devre dışı bırakır.
4. FOR ALL collector örnekleri, TTL azaltıldıktan sonra kullanıcı etkileşim deneyimi SHALL TTL azaltılmadan önceki deneyimle işlevsel olarak eşdeğer olur.

---

### Gereksinim 13: Leaderboard Redis Sorted Set

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, liderboard sıralama sorgularını MongoDB `COUNT` sorgusu yerine Redis Sorted Set ile gerçekleştirmek istiyorum; böylece rank hesaplama süresi O(log N)'e iner.

#### Kabul Kriterleri

1. WHEN bir oyuncunun hunt veya pvp skoru güncellendiğinde, THE `Leaderboard_System` SHALL `ZADD lb:{category} {score} {playerId}` komutuyla Redis Sorted Set'i günceller.
2. WHEN bir oyuncunun sırası sorgulandığında, THE `Leaderboard_System` SHALL `ZREVRANK lb:{category} {playerId}` komutuyla sırayı hesaplar; MongoDB `COUNT` sorgusu kullanmaz.
3. THE `Leaderboard_System` SHALL her kategori için ayrı bir Sorted Set anahtarı kullanır: `lb:power`, `lb:hunt`, `lb:relic`, `lb:arena`, `lb:wealth`.
4. IF Redis'te Sorted Set mevcut değilse, THEN THE `Leaderboard_System` SHALL MongoDB'den mevcut skorları okuyarak Sorted Set'i yeniden oluşturur.
5. FOR ALL oyuncular, Redis Sorted Set'ten hesaplanan rank değeri SHALL MongoDB `COUNT` sorgusuyla hesaplanan rank değeriyle tutarlı olur (tutarlılık özelliği).

---

### Gereksinim 14: MongoDB Index Ekleme

**Kullanıcı Hikayesi:** Bir bot geliştiricisi olarak, liderboard sorgularında kullanılan alanlara MongoDB index eklemek istiyorum; böylece full collection scan ortadan kalkar.

#### Kabul Kriterleri

1. THE `Player_Model` SHALL `totalHunts` alanı için Prisma şemasında `@@index([totalHunts])` tanımı içerir.
2. THE `Player_Model` SHALL `totalPvpWins` alanı için Prisma şemasında `@@index([totalPvpWins])` tanımı içerir.
3. THE `Player_Model` SHALL `powerScore` alanı için Prisma şemasında `@@index([powerScore])` tanımı içerir.
4. THE `Player_Model` SHALL `totalCoinsEarned` alanı için Prisma şemasında `@@index([totalCoinsEarned])` tanımı içerir.
5. WHEN Prisma şeması incelendiğinde, THE `Player_Model` SHALL `prisma/schema.prisma` dosyasında bu dört index'in tamamının tanımlı olduğunu doğrular; eksik olanları ekler.

> **Not:** Mevcut `prisma/schema.prisma` incelemesinde `@@index([powerScore])`, `@@index([totalHunts])`, `@@index([totalRareFinds])`, `@@index([totalPvpWins])` ve `@@index([totalCoinsEarned])` tanımlarının zaten mevcut olduğu görülmüştür. Gereksinim 14, bu index'lerin varlığını doğrular ve eksik olanları ekler.

---

## Doğruluk Özellikleri (Property-Based Testing)

Aşağıdaki özellikler, her gereksinim için property-based test kapsamını tanımlar.

### G1 — Önbellek Tutarlılığı (Gereksinim 1)
- **Özellik:** `FOR ALL userId`, `ensureRegisteredForInteraction(userId)` cache hit durumunda döndürdüğü değer, cache miss durumunda veritabanından döndürülen değerle eşit olmalıdır.
- **Test türü:** Round-trip (cache miss → DB → cache set → cache hit → karşılaştır)

### G2 — Hunt Duplicate Fetch Kaldırma (Gereksinim 2)
- **Özellik:** `FOR ALL hunt çağrıları`, duplicate fetch kaldırıldıktan sonra `rollHunt` çıktısı, duplicate fetch varken üretilen çıktıyla işlevsel olarak eşdeğer olmalıdır.
- **Test türü:** Metamorfik (aynı giriş → aynı çıkış, farklı kod yolu)

### G3 — Transaction Atomikliği (Gereksinim 3)
- **Özellik:** `FOR ALL hunt transaction'ları`, transaction başarısız olduğunda veritabanında kısmi yazma kalmamalıdır.
- **Test türü:** Hata koşulu (transaction ortasında hata enjekte et → rollback doğrula)

### G4 — Pipeline Sıra Bağımsızlığı (Gereksinim 4)
- **Özellik:** `FOR ALL Redis komut dizileri`, pipeline ile gönderilen komutların sonuçları sıralı ayrı çağrılarla elde edilen sonuçlarla eşdeğer olmalıdır.
- **Test türü:** Confluence (sıra değişikliği sonucu etkilemez)

### G5 — Rate Limiter Atomikliği (Gereksinim 5)
- **Özellik:** `FOR ALL eşzamanlı consumeRateLimitToken çağrıları`, onaylanan token sayısı `limit` değerini asla aşmamalıdır.
- **Test türü:** İnvaryant (eşzamanlı çağrılar altında sayaç sınırı korunur)

### G6 — Statik Import Eşdeğerliği (Gereksinim 6)
- **Özellik:** `FOR ALL (level, xp, totalRareFinds) üçlüleri`, statik import sonrası `calcPowerScore` çıktısı dinamik import ile hesaplanan değerle matematiksel olarak eşdeğer olmalıdır.
- **Test türü:** Round-trip (dinamik → statik dönüşüm sonrası çıktı karşılaştırması)

### G7 — totalXP İnvaryantı (Gereksinim 7)
- **Özellik:** `FOR ALL oyuncular`, `Player.totalXP` değeri `sum(xpRequired(l) for l in 1..level-1) + player.xp` formülüyle hesaplanan değerle eşit olmalıdır.
- **Test türü:** İnvaryant (her XP kazanımı sonrası alan tutarlılığı)

### G8 — Upgrade Sıra Bağımsızlığı (Gereksinim 8)
- **Özellik:** `FOR ALL upgrade işlemleri`, `Promise.all` ile gerçekleştirilen envanter güncellemeleri sıralı güncellemelerle aynı nihai envanter durumunu üretmelidir.
- **Test türü:** Confluence (güncelleme sırası sonucu etkilemez)

### G13 — Sorted Set Tutarlılığı (Gereksinim 13)
- **Özellik:** `FOR ALL oyuncular`, Redis Sorted Set'ten hesaplanan rank değeri MongoDB `COUNT` sorgusuyla hesaplanan rank değeriyle tutarlı olmalıdır.
- **Test türü:** Model tabanlı test (Redis Sorted Set vs. MongoDB COUNT karşılaştırması)
