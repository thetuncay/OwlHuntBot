# Gereksinimler Belgesi

## Giriş

BaykusBot, Discord üzerinde çalışan bir oyun botudur. Oyuncular `/hunt` komutuyla av turu başlatır; bu tur sırasında veritabanı (MongoDB/Prisma), önbellek (Redis) ve iş kuyruğu (BullMQ) katmanları devreye girer. Kod analizi, kritik yolda (kullanıcı cevabını bekleyen akış) gereksiz veritabanı round-trip'leri tespit etmiştir. Bu spec, tespit edilen beş darboğazı gidermek için gereksinimleri tanımlar; mevcut iyi pratikler (paralel sorgular, envanter kuyruğu, in-memory buff cache, Redis player cache, withLock, BullMQ) korunur.

**Kapsam dışı:** Yeni oyun mekaniği, Discord API değişikliği, altyapı ölçeklendirmesi.

---

## Sözlük

- **Hunt_System**: `src/systems/hunt.ts` içindeki `rollHunt` fonksiyonu ve çağırdığı tüm alt sistemler.
- **Player_Cache**: `src/utils/player-cache.ts` içindeki Redis tabanlı oyuncu + baykuş önbelleği (`getPlayerBundle`, `setCachedPlayerBundle`, `invalidatePlayerCache`).
- **Buff_Cache**: `src/systems/items.ts` içindeki 30 saniyelik in-memory önbellek (`buffCache` Map).
- **Drain_System**: `src/systems/items.ts` içindeki `drainBuffCharge` fonksiyonu.
- **Drop_System**: `src/systems/drops.ts` içindeki `tryClaimDailyDrop` ve `rollHuntLootboxDrop` fonksiyonları.
- **XP_System**: `src/systems/xp.ts` içindeki `addXP` fonksiyonu.
- **DB_Queue**: `src/utils/db-queue.ts` içindeki BullMQ tabanlı asenkron yazma kuyruğu.
- **Kritik_Yol**: Kullanıcının Discord cevabını beklemek zorunda olduğu senkron akış.
- **Round-Trip**: Uygulama ile MongoDB arasındaki tek bir istek-cevap döngüsü.
- **Upsert**: Kayıt yoksa oluştur, varsa güncelle semantiğine sahip veritabanı işlemi.
- **Fire-and-Forget**: Sonucu beklenmeden başlatılan arka plan işlemi.

---

## Gereksinimler

### Gereksinim 1: rollHunt İçinde Player Okuma Optimizasyonu

**Kullanıcı Hikayesi:** Bir oyuncu olarak, `/hunt` komutunu verdiğimde botun hızlı yanıt vermesini istiyorum; böylece oyun deneyimim kesintisiz olur.

#### Kabul Kriterleri

1. WHEN bir oyuncu `/hunt` komutu verdiğinde, THE Hunt_System SHALL oyuncu verisini `prisma.player.upsert` yerine `getPlayerBundle` ile Player_Cache üzerinden okumalıdır.

2. WHEN Player_Cache'de oyuncu kaydı bulunduğunda, THE Hunt_System SHALL MongoDB'ye ek bir `player` sorgusu göndermemelidir.

3. WHEN Player_Cache'de oyuncu kaydı bulunmadığında (cache miss), THE Hunt_System SHALL `prisma.player.findUnique` ile MongoDB'den okuyup sonucu Player_Cache'e yazmalıdır.

4. WHEN oyuncu kaydı MongoDB'de hiç bulunmadığında (yeni oyuncu), THE Hunt_System SHALL `prisma.player.upsert` ile kaydı oluşturmalı ve ardından Player_Cache'e yazmalıdır.

5. THE Hunt_System SHALL yeni oyuncu oluşturma işlemini (`upsert`) yalnızca Player_Cache miss ve MongoDB miss durumunda gerçekleştirmelidir; normal akışta `upsert` çağrılmamalıdır.

6. WHEN hunt turu tamamlandığında, THE Hunt_System SHALL Player_Cache'i `invalidatePlayerCache` ile geçersiz kılmalıdır.

---

### Gereksinim 2: Günlük Lootbox Drop Kontrolünün Kritik Yol Dışına Alınması

**Kullanıcı Hikayesi:** Bir oyuncu olarak, av sonucunu hızlıca görmek istiyorum; lootbox kontrolü cevap süresini uzatmamalıdır.

#### Kabul Kriterleri

1. WHEN bir hunt turu başladığında, THE Drop_System SHALL `tryClaimDailyDrop` fonksiyonunu Kritik_Yol içinde çağırmamalıdır.

2. WHEN lootbox düşme şansı hesaplandığında ve drop gerçekleştiğinde, THE Drop_System SHALL günlük sayaç güncellemesini (`dailyLootboxDrops`, `lastLootboxDropDate`) DB_Queue aracılığıyla asenkron olarak yazmalıdır.

3. WHEN günlük drop sayacı okunması gerektiğinde, THE Drop_System SHALL sayacı Player_Cache üzerinden okumalı; cache miss durumunda MongoDB'den çekmelidir.

4. IF bir oyuncunun günlük drop sayacı `DAILY_DROP_CAP` değerine ulaşmışsa, THEN THE Drop_System SHALL o hunt turu için lootbox drop hesaplamasını atlamalı ve boş liste döndürmelidir.

5. THE Drop_System SHALL günlük drop sayacı kontrolü için MongoDB'ye `findUnique` + `update` şeklinde iki ayrı Round-Trip göndermemelidir; sayaç güncellemesi tek bir yazma işlemi olarak DB_Queue'ya eklenmelidir.

---

### Gereksinim 3: Buff Charge Tüketiminde Önbellek Kullanımı

**Kullanıcı Hikayesi:** Bir oyuncu olarak, buff'larım olmadığında botun gereksiz veritabanı sorgusu yapmamasını istiyorum; böylece sunucu kaynakları verimli kullanılır.

#### Kabul Kriterleri

1. WHEN `drainBuffCharge` çağrıldığında, THE Drain_System SHALL aktif buff varlığını kontrol etmek için önce Buff_Cache'i sorgulamalıdır.

2. WHEN Buff_Cache'de ilgili kategori için kayıt bulunduğunda ve tüm `effectValue` değerleri sıfırsa (aktif buff yok), THE Drain_System SHALL MongoDB'ye `findMany` sorgusu göndermemelidir.

3. WHEN Buff_Cache'de kayıt bulunmadığında (cache miss), THE Drain_System SHALL MongoDB'den `findMany` ile aktif buff'ları çekmelidir.

4. WHEN `drainBuffCharge` MongoDB'den buff verisi çektiğinde, THE Drain_System SHALL çekilen veriyi Buff_Cache'e yazmalıdır; böylece aynı hunt turu içinde `getBuffEffects` tekrar DB'ye gitmez.

5. WHILE bir oyuncunun aktif buff'ı bulunmadığında, THE Drain_System SHALL `drainBuffCharge` çağrısı başına sıfır MongoDB Round-Trip gerçekleştirmelidir.

6. WHEN buff charge güncelleme işlemleri gerçekleştiğinde, THE Drain_System SHALL Buff_Cache'deki ilgili kategori girişini geçersiz kılmalıdır.

---

### Gereksinim 4: XP Güncellemesinin Kritik Yol Dışına Alınması

**Kullanıcı Hikayesi:** Bir oyuncu olarak, level atlamadığım durumlarda XP güncellemesinin cevap süresini uzatmamasını istiyorum.

#### Kabul Kriterleri

1. WHEN `addXP` çağrıldığında ve hesaplanan yeni XP değeri bir sonraki seviye eşiğinin altında kaldığında, THE XP_System SHALL `prisma.player.update` işlemini DB_Queue'ya `updatePlayer` job'ı olarak eklemeli ve senkron olarak beklememeli.

2. WHEN `addXP` çağrıldığında ve hesaplanan yeni XP değeri bir sonraki seviye eşiğine ulaştığında veya aştığında (level-up), THE XP_System SHALL level ve XP güncellemesini senkron olarak `prisma.player.update` ile gerçekleştirmelidir.

3. WHEN XP güncellemesi DB_Queue'ya alındığında, THE XP_System SHALL çağrıcıya hesaplanan `gainedXP`, `currentXP` ve `currentLevel` değerlerini MongoDB'ye gitmeden döndürmelidir.

4. IF `addXP` çağrısında `existingPlayer` parametresi sağlanmışsa, THEN THE XP_System SHALL MongoDB'ye ek bir `findUnique` sorgusu göndermemelidir.

5. THE XP_System SHALL level-up olmayan durumda Kritik_Yol içinde sıfır MongoDB Round-Trip gerçekleştirmelidir.

---

### Gereksinim 5: Streak ve XP Güncellemelerinin Tek Yazma İşleminde Birleştirilmesi

**Kullanıcı Hikayesi:** Bir oyuncu olarak, av sonucunun mümkün olan en az veritabanı işlemiyle kaydedilmesini istiyorum; böylece bot daha az gecikmeyle yanıt verir.

#### Kabul Kriterleri

1. WHEN bir hunt turu tamamlandığında ve level-up gerçekleşmediğinde, THE Hunt_System SHALL `huntComboStreak`, `noRareStreak`, `lastHunt`, `xp` alanlarını tek bir `prisma.player.update` çağrısında birleştirmelidir.

2. WHEN bir hunt turu tamamlandığında ve level-up gerçekleştiğinde, THE Hunt_System SHALL `huntComboStreak`, `noRareStreak`, `lastHunt`, `level`, `xp` alanlarını tek bir `prisma.player.update` çağrısında birleştirmelidir.

3. THE Hunt_System SHALL streak güncellemesi için ayrı bir `prisma.player.update` çağrısı ve XP güncellemesi için ayrı bir `prisma.player.update` çağrısı yapmak yerine bu iki işlemi tek Round-Trip'e indirmelidir.

4. WHEN birleştirilmiş güncelleme gerçekleştiğinde, THE Hunt_System SHALL `addXP` fonksiyonunu yalnızca level-up hesaplaması ve XP miktarı belirleme amacıyla kullanmalı; DB yazma işlemini `addXP` içinde değil Hunt_System içinde gerçekleştirmelidir.

5. THE Hunt_System SHALL Gereksinim 1–4 uygulandıktan sonra bir hunt turu başına Kritik_Yol içindeki MongoDB Round-Trip sayısını en fazla 2 (player okuma + birleşik yazma) olarak tutmalıdır; baykuş bond güncellemesi bu sayıya dahil değildir ve mevcut paralel yapıda kalabilir.

---

### Gereksinim 6: Mevcut İyi Pratiklerin Korunması

**Kullanıcı Hikayesi:** Bir geliştirici olarak, performans iyileştirmelerinin mevcut güvenlik ve tutarlılık mekanizmalarını bozmadığından emin olmak istiyorum.

#### Kabul Kriterleri

1. THE Hunt_System SHALL `withLock` mekanizmasını aynı oyuncu için eş zamanlı hunt işlemlerini engellemek amacıyla korumaya devam etmelidir.

2. THE Hunt_System SHALL envanter yazma işlemlerini `enqueueDbWriteBulk` ile DB_Queue'ya göndermeye devam etmelidir.

3. THE Buff_Cache SHALL 30 saniyelik TTL politikasını korumaya devam etmelidir; bu süre `getBuffEffects` ve `drainBuffCharge` arasında tutarlı olmalıdır.

4. THE Hunt_System SHALL liderboard istatistik güncellemelerini (`recordStats`) DB_Queue aracılığıyla asenkron olarak göndermeye devam etmelidir.

5. THE Hunt_System SHALL `Promise.all` ile paralel sorgu yapısını korumaya devam etmelidir; sıralı hale getirilmemelidir.

6. IF herhangi bir optimizasyon adımında Redis bağlantısı kullanılamaz hale gelirse, THEN THE Hunt_System SHALL graceful degradation ile MongoDB'den okumaya devam etmeli ve hata fırlatmamalıdır.

7. THE Hunt_System SHALL `invalidatePlayerCache` çağrısını hunt turu sonunda korumaya devam etmelidir; böylece sonraki komutlar güncel veriyi görür.
