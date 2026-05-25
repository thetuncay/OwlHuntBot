# Gereksinimler Belgesi

## Giriş

Bu belge, OwlHuntBot Discord botunun MongoDB tabanlı altyapısından PostgreSQL + Bun.js tabanlı yüksek performanslı mimariye geçişini tanımlar. Geçiş; veri tabanı değişikliği, çalışma zamanı değişikliği (Node.js → Bun.js), geri alma (undo) sistemi, yük dengeleme (load balancing) ve kapsamlı performans optimizasyonlarını kapsar. Tüm geçiş süreci veri kaybı olmadan ve geri alınabilir adımlarla gerçekleştirilecektir.

## Sözlük

- **Migration_Tool**: MongoDB verilerini PostgreSQL'e aktaran `src/scripts/migrate-mongodb-to-pg.ts` betiği
- **Audit_System**: Oyuncu eylemlerini kaydeden ve geri alma işlemlerini yöneten `src/utils/audit.ts` modülü
- **Shard_Manager**: Discord.js ShardingManager'ı yöneten `src/shard-manager.ts` modülü
- **Health_Endpoint**: Bun.serve ile sunulan `/health` HTTP uç noktası
- **Bot**: OwlHuntBot Discord botu uygulaması
- **Prisma**: Veritabanı ORM katmanı
- **Redis**: Önbellek ve oturum yönetimi için kullanılan bellek içi veri deposu
- **PG**: PostgreSQL ilişkisel veritabanı
- **MongoDB**: Mevcut belge tabanlı veritabanı
- **AuditLog**: Oyuncu eylemlerinin denetim kaydı modeli
- **Season_Timer**: Sezon geçişlerini yöneten zamanlayıcı bileşeni
- **Nginx**: Yük dengeleyici ve ters proxy sunucusu
- **Docker_Compose**: Çok konteynerli dağıtım orkestrasyon aracı
- **WAL**: PostgreSQL Write-Ahead Logging — veri kurtarma mekanizması
- **Rollback_Plan**: Geçiş başarısız olduğunda MongoDB'ye geri dönüş prosedürü

---

## Gereksinimler

### Gereksinim 1: Veri Yedekleme

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, geçiş öncesinde tüm MongoDB verilerini yedeklemek istiyorum; böylece geçiş başarısız olursa veri kaybı yaşanmadan geri dönebiliyorum.

#### Kabul Kriterleri

1. WHEN geçiş başlatılmadan önce, THE Migration_Tool SHALL Player, Owl, InventoryItem, PvpSession, Encounter, PlayerRegistration, SeasonArchive ve Season collection'larını JSON formatında dışa aktarır
2. THE Migration_Tool SHALL her collection için ayrı bir JSON dosyası oluşturur ve dosya adlarına zaman damgası ekler
3. IF yedekleme sırasında bir collection okunamıyorsa, THEN THE Migration_Tool SHALL işlemi durdurup hangi collection'ın başarısız olduğunu belirten bir hata mesajı döndürür
4. THE Migration_Tool SHALL yedekleme tamamlandığında toplam kayıt sayısını her collection için raporlar

---

### Gereksinim 2: PostgreSQL Şema Geçişi

**Kullanıcı Hikayesi:** Bir geliştirici olarak, mevcut MongoDB Prisma şemasını PostgreSQL uyumlu hale getirmek istiyorum; böylece tüm veri modelleri ilişkisel veritabanında doğru şekilde temsil edilir.

#### Kabul Kriterleri

1. THE Prisma SHALL `datasource db` bloğunda `provider = "postgresql"` kullanır
2. THE Prisma SHALL Player, AuditLog, SeasonArchive, Season, Owl, InventoryItem, PvpSession, Encounter, PlayerRegistration, PlayerBuff, MarketListing ve DailyQuest modellerini PostgreSQL uyumlu şemada tanımlar
3. THE Prisma SHALL tüm modellerdeki `@map("_id")` direktiflerini kaldırır ve `@id @default(uuid())` ile değiştirir
4. THE Prisma SHALL Player modeline `totalXP Int @default(0)` alanını ekler
5. WHEN `prisma migrate dev` komutu çalıştırıldığında, THE Prisma SHALL hatasız bir migration dosyası oluşturur
6. THE Prisma SHALL mevcut tüm `@@index` direktiflerini PostgreSQL şemasında korur

---

### Gereksinim 3: Veri Aktarım Betiği

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, MongoDB'deki tüm verileri PostgreSQL'e aktarmak istiyorum; böylece hiçbir oyuncu verisi kaybolmadan geçiş tamamlanır.

#### Kabul Kriterleri

1. WHEN `src/scripts/migrate-mongodb-to-pg.ts` çalıştırıldığında, THE Migration_Tool SHALL MongoDB'deki tüm collection kayıtlarını PostgreSQL tablolarına aktarır
2. THE Migration_Tool SHALL aktarım sırasında her model için kayıt sayısını MongoDB ve PostgreSQL arasında karşılaştırır
3. IF MongoDB kayıt sayısı ile PostgreSQL kayıt sayısı eşleşmiyorsa, THEN THE Migration_Tool SHALL uyuşmazlığı raporlar ve işlemi başarısız olarak işaretler
4. THE Migration_Tool SHALL `_id` alanlarını PostgreSQL `id` alanlarına dönüştürür ve ilişkisel referansları korur
5. THE Migration_Tool SHALL aktarımı transaction içinde gerçekleştirir; kısmi yazma durumunda tüm değişiklikleri geri alır
6. WHEN aktarım tamamlandığında, THE Migration_Tool SHALL her tablo için aktarılan kayıt sayısını raporlar

---

### Gereksinim 4: AuditLog Sistemi

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, oyuncu eylemlerini denetim kaydına almak ve son eylemi geri almak istiyorum; böylece hatalı işlemler manuel müdahale olmadan düzeltilebilir.

#### Kabul Kriterleri

1. THE Audit_System SHALL `src/utils/audit.ts` dosyasında `writeAudit(playerId, action, before, after)` fonksiyonunu sağlar
2. WHEN `writeAudit` çağrıldığında, THE Audit_System SHALL AuditLog tablosuna `playerId`, `action`, `before` (JSON), `after` (JSON) ve `createdAt` alanlarıyla bir kayıt yazar
3. THE Audit_System SHALL `undoLastAction(playerId)` fonksiyonunu sağlar
4. WHEN `undoLastAction` çağrıldığında, THE Audit_System SHALL ilgili oyuncunun en son AuditLog kaydını bulur ve `before` durumunu geri yükler
5. IF geri alınacak kayıt bulunamazsa, THEN THE Audit_System SHALL "Geri alınacak işlem bulunamadı" mesajıyla bir hata döndürür
6. THE Audit_System SHALL Hunt ve Gamble sistemlerine audit entegrasyonu sağlar; her başarılı işlem sonrasında `writeAudit` çağrılır
7. THE Prisma SHALL AuditLog modelini `id`, `playerId`, `action`, `before`, `after`, `createdAt` alanlarıyla tanımlar

---

### Gereksinim 5: Admin Undo Komutu

**Kullanıcı Hikayesi:** Bir bot yöneticisi olarak, Discord üzerinden oyuncu eylemlerini geri almak istiyorum; böylece hatalı işlemleri hızlıca düzeltebiliyorum.

#### Kabul Kriterleri

1. THE Bot SHALL `/admin undo <userId>` subcommand'ını destekler
2. WHEN `/admin undo <userId>` çalıştırıldığında, THE Bot SHALL `undoLastAction(userId)` fonksiyonunu çağırır ve sonucu ephemeral mesaj olarak döndürür
3. IF kullanıcı yönetici rolüne sahip değilse, THEN THE Bot SHALL komutu reddeder ve "Bu komutu kullanma yetkiniz yok" mesajını döndürür
4. WHEN geri alma başarılı olduğunda, THE Bot SHALL hangi eylemin geri alındığını ve önceki durumu özetleyen bir mesaj döndürür

---

### Gereksinim 6: AuditLog Temizleme

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, eski denetim kayıtlarının otomatik olarak temizlenmesini istiyorum; böylece veritabanı gereksiz verilerle şişmez.

#### Kabul Kriterleri

1. THE Audit_System SHALL 30 günden eski AuditLog kayıtlarını siler
2. WHEN sezon rollover gerçekleştiğinde, THE Audit_System SHALL 30 günlük temizleme işlemini tetikler
3. THE Audit_System SHALL temizleme işleminde silinen kayıt sayısını loglar

---

### Gereksinim 7: PostgreSQL Yedekleme Altyapısı

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, PostgreSQL verilerinin düzenli olarak yedeklenmesini istiyorum; böylece veri kaybı durumunda kurtarma yapılabilir.

#### Kabul Kriterleri

1. THE PG SHALL WAL (Write-Ahead Logging) arşivleme ile yapılandırılır
2. THE Bot SHALL günlük `pg_dump` yedeklemesini çalıştıran bir cron job ile yapılandırılır
3. WHEN `pg_dump` başarısız olduğunda, THE Bot SHALL hata logunu sistem günlüğüne yazar
4. THE Bot SHALL yedekleme dosyalarını zaman damgalı olarak saklar ve 7 günden eski yedekleri siler

---

### Gereksinim 8: Bun.js Çalışma Zamanı Geçişi

**Kullanıcı Hikayesi:** Bir geliştirici olarak, Node.js çalışma zamanını Bun.js ile değiştirmek istiyorum; böylece başlangıç süresi ve bellek kullanımı iyileşir.

#### Kabul Kriterleri

1. THE Bot SHALL Bun.js çalışma zamanı üzerinde hatasız başlar
2. THE Bot SHALL `package.json` içindeki `dotenv` bağımlılığını kaldırır; Bun.js yerleşik `.env` yükleme mekanizmasını kullanır
3. THE Bot SHALL `src/index.ts` içindeki `dotenv/config` import'unu kaldırır
4. THE Bot SHALL `tsconfig.json` içinde `"module": "ESNext"`, `"moduleResolution": "bundler"` ve `"types": ["bun-types"]` ayarlarını kullanır
5. THE Bot SHALL `src/index.ts` içindeki `pathToFileURL` kullanımını `import.meta.dir` ile değiştirir
6. THE Bot SHALL `pnpm-lock.yaml` dosyasını siler ve `bun install` ile `bun.lockb` oluşturur
7. WHEN `bun run src/index.ts` komutu çalıştırıldığında, THE Bot SHALL 10 saniye içinde Discord'a bağlanır

---

### Gereksinim 9: Statik Import Dönüşümü

**Kullanıcı Hikayesi:** Bir geliştirici olarak, `leaderboard.ts` içindeki dinamik import'ları statik import'a dönüştürmek istiyorum; böylece Bun.js ile uyumluluk sağlanır ve yükleme süresi azalır.

#### Kabul Kriterleri

1. THE Bot SHALL `src/systems/leaderboard.ts` içindeki tüm `await import(...)` çağrılarını dosya başındaki statik `import` ifadeleriyle değiştirir
2. WHEN `bun run src/index.ts` çalıştırıldığında, THE Bot SHALL dinamik import kaynaklı hata üretmez
3. THE Bot SHALL statik import dönüşümü sonrasında leaderboard işlevselliğini korur

---

### Gereksinim 10: Discord.js ShardingManager Kurulumu

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, botun birden fazla shard üzerinde çalışmasını istiyorum; böylece büyük sunucu sayısında Discord API rate limit'leri aşılmaz.

#### Kabul Kriterleri

1. THE Shard_Manager SHALL `src/shard-manager.ts` dosyasında Discord.js `ShardingManager` kullanarak bot shardlarını yönetir
2. THE Shard_Manager SHALL `shardCount: "auto"` ile Discord'un önerdiği shard sayısını kullanır
3. WHEN Season_Timer tetiklendiğinde, THE Season_Timer SHALL yalnızca shard ID 0 üzerinde çalışır
4. IF shard başlatma sırasında hata oluşursa, THEN THE Shard_Manager SHALL hatayı loglar ve 5 saniye sonra yeniden dener
5. THE Shard_Manager SHALL her shard'ın başarıyla başladığını loglar

---

### Gereksinim 11: Redis Connection Pool Optimizasyonu

**Kullanıcı Hikayesi:** Bir geliştirici olarak, Redis bağlantı havuzunu optimize etmek istiyorum; böylece yüksek eşzamanlılık durumunda bağlantı zaman aşımları azalır.

#### Kabul Kriterleri

1. THE Bot SHALL Redis bağlantısını `maxRetriesPerRequest: 3` ve `enableReadyCheck: true` parametreleriyle yapılandırır
2. THE Bot SHALL Prisma `DATABASE_URL` parametrelerine `connection_limit=20` ve `pool_timeout=10` ekler
3. WHILE Redis bağlantısı kesildiğinde, THE Bot SHALL otomatik yeniden bağlanma mekanizmasını kullanır

---

### Gereksinim 12: Nginx Yük Dengeleyici

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, Nginx üzerinden sağlık kontrolü yapılmasını istiyorum; böylece sağlıksız bot instance'ları otomatik olarak devre dışı bırakılır.

#### Kabul Kriterleri

1. THE Bot SHALL `Bun.serve` ile `/health` HTTP uç noktasını sunar ve `{ status: "ok" }` JSON yanıtı döndürür
2. THE Health_Endpoint SHALL 200 HTTP durum kodu ile yanıt verir
3. THE Nginx SHALL `/health` uç noktasına her 10 saniyede bir istek göndererek sağlık kontrolü yapar
4. IF sağlık kontrolü 3 ardışık başarısız olursa, THEN THE Nginx SHALL ilgili upstream'i devre dışı bırakır
5. THE Nginx SHALL gelen istekleri aktif bot instance'ları arasında round-robin yöntemiyle dağıtır

---

### Gereksinim 13: Docker Compose Dağıtımı

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, tüm servisleri tek bir Docker Compose dosyasıyla başlatmak istiyorum; böylece dağıtım tekrarlanabilir ve tutarlı olur.

#### Kabul Kriterleri

1. THE Docker_Compose SHALL bot, postgres, redis ve nginx servislerini tanımlar
2. THE Docker_Compose SHALL bot servisi için `oven/bun:1-alpine` tabanlı Dockerfile kullanır
3. THE Docker_Compose SHALL postgres servisi için kalıcı volume tanımlar
4. WHEN `docker compose up -d` çalıştırıldığında, THE Docker_Compose SHALL tüm servisleri 60 saniye içinde başlatır
5. THE Docker_Compose SHALL servisler arası bağımlılıkları `depends_on` ile tanımlar; postgres ve redis hazır olmadan bot başlamaz
6. THE Dockerfile SHALL `bun install --frozen-lockfile` ile bağımlılıkları yükler ve `bun run src/shard-manager.ts` ile botu başlatır

---

### Gereksinim 14: ensureRegisteredForInteraction Redis Önbelleği

**Kullanıcı Hikayesi:** Bir geliştirici olarak, her Discord etkileşiminde gereksiz veritabanı sorgularını önlemek istiyorum; böylece yanıt süresi azalır.

#### Kabul Kriterleri

1. WHEN `ensureRegisteredForInteraction` çağrıldığında, THE Bot SHALL önce `redis.get("reg:{userId}")` ile önbelleği kontrol eder
2. IF önbellekte kayıt varsa, THEN THE Bot SHALL veritabanı sorgusu yapmadan `true` döndürür
3. IF önbellekte kayıt yoksa, THEN THE Bot SHALL veritabanını sorgular ve sonuç `true` ise `redis.set("reg:{userId}", "1", "EX", 60)` ile önbelleğe yazar
4. WHEN `handleRegistrationButton` başarıyla tamamlandığında, THE Bot SHALL `redis.set("reg:{userId}", "1", "EX", 60)` ile önbelleğe yazar
5. THE Bot SHALL `ensureRegisteredForMessage` fonksiyonuna da aynı önbellek mantığını uygular

---

### Gereksinim 15: Hunt Transaction Optimizasyonu

**Kullanıcı Hikayesi:** Bir geliştirici olarak, hunt işlemindeki veritabanı yazma işlemlerini tek bir transaction'da toplamak istiyorum; böylece veritabanı round-trip sayısı azalır.

#### Kabul Kriterleri

1. THE Bot SHALL `src/systems/hunt.ts` içindeki birden fazla ayrı `prisma.player.update` çağrısını tek bir `prisma.$transaction` bloğunda birleştirir
2. WHEN hunt tamamlandığında, THE Bot SHALL oyuncu istatistikleri, envanter ve XP güncellemelerini tek transaction'da yazar
3. IF transaction sırasında hata oluşursa, THEN THE Bot SHALL tüm değişiklikleri geri alır ve oyuncu verisi tutarlı kalır
4. THE Bot SHALL `totalXP: { increment: gainedXP }` güncellemesini hunt transaction'ına dahil eder

---

### Gereksinim 16: Redis Pipeline Optimizasyonu

**Kullanıcı Hikayesi:** Bir geliştirici olarak, birden fazla Redis komutunu pipeline ile göndermek istiyorum; böylece ağ round-trip sayısı 7'den 2'ye düşer.

#### Kabul Kriterleri

1. THE Bot SHALL ardışık Redis okuma/yazma işlemlerini `redis.pipeline()` ile gruplar
2. THE Bot SHALL pipeline kullanımıyla tek bir ağ isteğinde birden fazla Redis komutu gönderir
3. WHEN pipeline çalıştırıldığında, THE Bot SHALL tüm komutların sonuçlarını tek seferde alır
4. THE Bot SHALL pipeline optimizasyonu sonrasında mevcut işlevselliği korur

---

### Gereksinim 17: Rate Limiter Atomik Lua Script

**Kullanıcı Hikayesi:** Bir geliştirici olarak, `consumeRateLimitToken` fonksiyonunu atomik Lua script ile uygulamak istiyorum; böylece eşzamanlı isteklerde yarış koşulu (race condition) oluşmaz.

#### Kabul Kriterleri

1. THE Bot SHALL `consumeRateLimitToken` fonksiyonunu Redis `EVAL` komutu ile atomik Lua script olarak uygular
2. WHEN birden fazla eşzamanlı istek aynı anda `consumeRateLimitToken` çağırdığında, THE Bot SHALL onaylanan token sayısının tanımlı limiti aşmadığını garanti eder
3. THE Bot SHALL Lua script'in atomik çalışmasını sağlar; iki ayrı GET/SET işlemi yerine tek atomik işlem kullanır
4. IF token limiti aşıldıysa, THEN THE Bot SHALL `false` döndürür ve token sayacını değiştirmez

---

### Gereksinim 18: Leaderboard Redis Sorted Set

**Kullanıcı Hikayesi:** Bir geliştirici olarak, leaderboard sıralamalarını Redis Sorted Set üzerinden almak istiyorum; böylece her sıralama sorgusu için veritabanına gidilmez.

#### Kabul Kriterleri

1. THE Bot SHALL `ZADD lb:{category} {score} {playerId}` komutuyla leaderboard skorlarını Redis Sorted Set'e yazar
2. WHEN leaderboard sıralaması istendiğinde, THE Bot SHALL önce `ZREVRANK lb:{category} {playerId}` ile Redis'ten sıralamayı alır
3. IF Redis Sorted Set boşsa, THEN THE Bot SHALL veritabanından verileri çekip `ZADD` ile Sorted Set'i doldurur
4. WHEN `recordHuntStats`, `recordPvpWin` veya `recordCoinsEarned` çağrıldığında, THE Bot SHALL ilgili Sorted Set'i günceller
5. THE Bot SHALL Sorted Set sıralaması ile veritabanı sıralamasının tutarlı olduğunu garanti eder

---

### Gereksinim 19: Upgrade Promise.all Optimizasyonu

**Kullanıcı Hikayesi:** Bir geliştirici olarak, `upgrade.ts` içindeki sıralı döngüleri paralel işleme dönüştürmek istiyorum; böylece upgrade işlem süresi azalır.

#### Kabul Kriterleri

1. THE Bot SHALL `src/systems/upgrade.ts` içindeki malzeme kontrolü için `for` döngüsündeki `findUnique` çağrılarını `Promise.all` ile paralel hale getirir
2. THE Bot SHALL malzeme tüketimi için `for` döngüsündeki `update` çağrılarını tek `updateMany` ile değiştirir
3. WHEN upgrade işlemi tamamlandığında, THE Bot SHALL nihai envanter durumunun sıralı işleme ile aynı olduğunu garanti eder
4. THE Bot SHALL `Promise.all` dönüşümü sonrasında transaction bütünlüğünü korur; hata durumunda tüm değişiklikler geri alınır

---

### Gereksinim 20: Staging Ortamı ve Rollback Planı

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, geçişi önce staging ortamında test etmek ve başarısız olursa MongoDB'ye geri dönmek istiyorum; böylece production ortamında kesinti riski en aza indirilir.

#### Kabul Kriterleri

1. THE Bot SHALL geçiş öncesinde staging ortamında tüm aşamaları test eder
2. WHEN geçiş başarısız olduğunda, THE Bot SHALL MongoDB bağlantısına geri döner ve yedeklenen JSON verilerini geri yükler
3. THE Bot SHALL gece maintenance window sırasında (00:00–04:00 UTC) production geçişini gerçekleştirir
4. THE Migration_Tool SHALL rollback prosedürünü belgeler; her adım için geri alma komutu tanımlanır
5. WHEN rollback tamamlandığında, THE Bot SHALL tüm oyuncu verilerinin yedekten başarıyla geri yüklendiğini doğrular

---

### Gereksinim 21: Veri Bütünlüğü Doğrulama

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, geçiş sonrasında tüm verilerin doğru aktarıldığını doğrulamak istiyorum; böylece oyuncu verisi kaybı veya bozulması tespit edilir.

#### Kabul Kriterleri

1. WHEN veri aktarımı tamamlandığında, THE Migration_Tool SHALL her tablo için MongoDB ve PostgreSQL kayıt sayılarını karşılaştırır
2. THE Migration_Tool SHALL rastgele seçilen 10 oyuncu kaydı için MongoDB ve PostgreSQL verilerini alan bazında karşılaştırır
3. IF herhangi bir alanda uyuşmazlık tespit edilirse, THEN THE Migration_Tool SHALL uyuşmazlığı raporlar ve geçişi başarısız olarak işaretler
4. THE Migration_Tool SHALL ilişkisel referansların (foreign key) doğruluğunu kontrol eder; orphan kayıt bulunmamalıdır
