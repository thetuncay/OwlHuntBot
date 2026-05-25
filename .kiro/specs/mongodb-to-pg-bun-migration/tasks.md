# Uygulama Planı: MongoDB → PostgreSQL + Bun.js Geçişi

## Genel Bakış

Bu plan, OwlHuntBot'un MongoDB tabanlı altyapısından PostgreSQL + Bun.js tabanlı mimariye geçişini altı aşamada uygular. Her aşama bağımsız olarak geri alınabilir; test görevleri isteğe bağlı alt görevler olarak işaretlenmiştir.

## Görevler

- [x] 1. Aşama 0 — MongoDB Yedekleme Betiği
  - [x] 1.1 `src/scripts/backup-mongodb.ts` dosyasını oluştur
    - `BackupResult` ve `BackupReport` arayüzlerini tanımla
    - `buildBackupFileName(collection, timestamp)` fonksiyonunu yaz: `{collection}_{ISO_TIMESTAMP}.json` formatında dosya adı üretir
    - `backupCollection(mongoClient, dbName, collection, outputDir, timestamp)` fonksiyonunu yaz: collection'ı okur, JSON dosyasına yazar, `BackupResult` döndürür
    - `runBackup(outputDir)` fonksiyonunu yaz: Player, Owl, InventoryItem, PvpSession, Encounter, PlayerRegistration, SeasonArchive, Season collection'larını sırayla yedekler, `BackupReport` döndürür
    - Collection okunamıyorsa işlemi durdur ve hangi collection'ın başarısız olduğunu belirten hata mesajı döndür
    - _Gereksinimler: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 `buildBackupFileName` için özellik testi yaz (Özellik 1)
    - **Özellik 1: Yedekleme Dosyası Adı Zaman Damgası İçerir**
    - `fast-check` ile herhangi bir collection adı ve `Date` için dosya adının ISO 8601 zaman damgası içerdiğini doğrula
    - Test dosyası: `src/__tests__/migration.property.test.ts`
    - **Doğrular: Gereksinim 1.2**

  - [x] 1.3 `runBackup` için özellik testi yaz (Özellik 2)
    - **Özellik 2: Yedekleme Raporu Kayıt Sayılarını Doğru Raporlar**
    - Mock collection verisiyle `BackupReport` içindeki kayıt sayılarının doğru olduğunu doğrula
    - **Doğrular: Gereksinim 1.4**

- [x] 2. Aşama 1 — PostgreSQL Şema Geçişi
  - [x] 2.1 `prisma/schema.prisma` dosyasını PostgreSQL'e geçir
    - `datasource db` bloğunu `provider = "postgresql"` olarak güncelle
    - Tüm modellerdeki `@map("_id")` direktiflerini kaldır; `@id @default(uuid())` kullan
    - `Season` modelindeki sabit `"current"` ID stratejisini `@default(uuid())` ile değiştir; `seasonId` alanı ile sorgu yapılacak şekilde güncelle
    - `AuditLog` modelini ekle: `id`, `playerId`, `action`, `before Json`, `after Json`, `createdAt`, `@@index([playerId, createdAt])`
    - `Player` modelinde `totalXP Int @default(0)` alanının mevcut olduğunu doğrula (zaten var, koru)
    - Tüm mevcut `@@index` direktiflerini koru
    - _Gereksinimler: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.2 Prisma migration dosyasını oluştur
    - `prisma migrate dev --name mongodb-to-pg` komutunu çalıştır
    - Migration dosyasının hatasız oluşturulduğunu doğrula
    - _Gereksinimler: 2.5_

- [x] 3. Aşama 1 — Veri Aktarım Betiği
  - [x] 3.1 `src/scripts/migrate-mongodb-to-pg.ts` dosyasını oluştur
    - `MigrationResult` ve `MigrationReport` arayüzlerini tanımla
    - `transformDocument(doc)` fonksiyonunu yaz: `_id` → `id` dönüşümü yapar, `_id` alanını siler
    - `compareRecordCounts(mongoCount, pgCount)` fonksiyonunu yaz: `matched` ve `discrepancy` döndürür
    - `migrateCollection(mongoCollection, pgInsertFn)` fonksiyonunu yaz: kayıtları aktarır, sayıları karşılaştırır
    - `runMigration()` fonksiyonunu yaz: foreign key sırasına göre (Season → Player → Owl → InventoryItem → PlayerRegistration → PlayerBuff → PvpSession → Encounter → SeasonArchive → MarketListing → DailyQuest) aktarım yapar
    - Aktarımı transaction içinde gerçekleştir; kısmi yazma durumunda tüm değişiklikleri geri al
    - Kayıt sayısı uyuşmazlığında işlemi başarısız işaretle ve raporla
    - _Gereksinimler: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 `compareRecordCounts` için özellik testi yaz (Özellik 3)
    - **Özellik 3: Kayıt Sayısı Karşılaştırması Uyuşmazlıkları Tespit Eder**
    - `fast-check` ile herhangi iki `nat()` çifti için `matched === (mongoCount === pgCount)` doğrula
    - **Doğrular: Gereksinim 3.2, 3.3**

  - [x] 3.3 `transformDocument` için özellik testi yaz (Özellik 4)
    - **Özellik 4: ID Dönüşümü Değeri Korur**
    - `fast-check` ile herhangi bir `_id` içeren belgede `transformed.id === doc._id` ve `'_id' in transformed === false` doğrula
    - **Doğrular: Gereksinim 3.4**

  - [x] 3.4 Veri bütünlüğü doğrulama için özellik testi yaz (Özellik 10)
    - **Özellik 10: Veri Bütünlüğü Doğrulama Uyuşmazlık Tespiti**
    - Eşleşen ve eşleşmeyen kayıt setleri için doğrulama fonksiyonunun doğru sonuç döndürdüğünü doğrula
    - **Doğrular: Gereksinim 21.1, 21.2, 21.3**

- [x] 4. Kontrol Noktası — Tüm testlerin geçtiğinden emin ol
  - Tüm testlerin geçtiğini doğrula, sorular varsa kullanıcıya sor.

- [x] 5. Aşama 2 — AuditLog Sistemi
  - [x] 5.1 `src/utils/audit.ts` dosyasını oluştur
    - `AuditEntry` arayüzünü tanımla
    - `writeAudit(prisma, playerId, action, before, after)` fonksiyonunu yaz: AuditLog tablosuna kayıt yazar
    - `undoLastAction(prisma, playerId)` fonksiyonunu yaz: en son kaydı bulur, `before` durumunu Player tablosuna geri yükler, geri alınan `action` ve `restoredState` döndürür
    - Geri alınacak kayıt yoksa "Geri alınacak işlem bulunamadı" hatası fırlat
    - `cleanupOldAuditLogs(prisma)` fonksiyonunu yaz: 30 günden eski kayıtları siler, silinen kayıt sayısını döndürür
    - _Gereksinimler: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.3_

  - [x] 5.2 `writeAudit` / `undoLastAction` için özellik testi yaz (Özellik 5)
    - **Özellik 5: AuditLog Round-Trip Doğruluğu**
    - Mock Prisma ile herhangi bir `(playerId, action, before, after)` kombinasyonu için `undoLastAction` sonrası `restoredState === before` doğrula
    - **Doğrular: Gereksinim 4.2, 4.3, 4.4**

  - [x] 5.3 `cleanupOldAuditLogs` için özellik testi yaz (Özellik 6)
    - **Özellik 6: AuditLog Temizleme Eşiği**
    - 30 günden eski kayıtların silindiğini, 30 günden yeni kayıtların korunduğunu doğrula
    - **Doğrular: Gereksinim 6.1, 6.2**

  - [x] 5.4 Hunt sistemine audit entegrasyonu ekle
    - `src/systems/hunt.ts` içinde başarılı hunt sonrasında `writeAudit` çağrısı ekle
    - `before` ve `after` olarak oyuncu durumunu kaydet
    - _Gereksinimler: 4.6_

  - [x] 5.5 Gamble sistemine audit entegrasyonu ekle
    - `src/systems/gamble.ts` (veya ilgili dosya) içinde başarılı gamble sonrasında `writeAudit` çağrısı ekle
    - _Gereksinimler: 4.6_

  - [x] 5.6 `/admin undo` subcommand'ını oluştur
    - `src/commands/admin.ts` (veya mevcut admin komutu) içine `undo <userId>` subcommand'ı ekle
    - Yönetici rolü kontrolü yap; yetkisiz kullanıcıya "Bu komutu kullanma yetkiniz yok" mesajı döndür
    - `undoLastAction(userId)` çağır, sonucu ephemeral mesaj olarak döndür
    - Başarılı geri almada hangi eylemin geri alındığını ve önceki durumu özetle
    - _Gereksinimler: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.7 Sezon rollover'a AuditLog temizleme entegrasyonu ekle
    - Season timer / rollover kodunda `cleanupOldAuditLogs` çağrısı ekle
    - Silinen kayıt sayısını logla
    - _Gereksinimler: 6.2, 6.3_

- [x] 6. Aşama 2 — PostgreSQL WAL Yedekleme Altyapısı
  - [x] 6.1 `docker-compose.yml` içinde PostgreSQL WAL yapılandırmasını ekle
    - `wal_level = replica` ve `archive_mode = on` parametrelerini PostgreSQL servisine ekle
    - Yedekleme volume'unu tanımla
    - _Gereksinimler: 7.1_

  - [x] 6.2 Günlük `pg_dump` cron job betiği oluştur
    - `scripts/pg-backup-cron.sh` dosyasını oluştur: zaman damgalı `pg_dump` çalıştırır, 7 günden eski yedekleri siler
    - Hata durumunda sistem günlüğüne yazar
    - _Gereksinimler: 7.2, 7.3, 7.4_

- [x] 7. Kontrol Noktası — Tüm testlerin geçtiğinden emin ol
  - Tüm testlerin geçtiğini doğrula, sorular varsa kullanıcıya sor.

- [x] 8. Aşama 3 — Bun.js Geçişi
  - [x] 8.1 `tsconfig.json` dosyasını Bun.js uyumlu hale getir
    - `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"types": ["bun-types"]` ayarlarını ekle/güncelle
    - _Gereksinimler: 8.4_

  - [x] 8.2 `package.json` bağımlılıklarını güncelle
    - `dotenv` bağımlılığını kaldır
    - `bun-types` devDependency olarak ekle
    - `pnpm-lock.yaml` dosyasını sil, `bun install` ile `bun.lockb` oluştur
    - _Gereksinimler: 8.2, 8.6_

  - [x] 8.3 `src/index.ts` dosyasını Bun.js uyumlu hale getir
    - `import 'dotenv/config'` satırını kaldır
    - `pathToFileURL` kullanımını `import.meta.dir` ile değiştir
    - Komut yükleme döngüsünü Bun uyumlu `join(import.meta.dir, '..', 'commands')` ile güncelle
    - _Gereksinimler: 8.3, 8.5_

  - [x] 8.4 `src/shard.ts` dosyasını `src/shard-manager.ts` olarak yeniden adlandır ve güncelle
    - `import 'dotenv/config'` satırını kaldır
    - `shardCount: "auto"` korunur
    - `isShard0()` yardımcı fonksiyonunu ekle: Season_Timer'ın yalnızca shard 0'da çalışmasını sağlar
    - Hata durumunda 5 saniye sonra yeniden deneme mekanizması ekle
    - Her shard'ın başarıyla başladığını logla
    - _Gereksinimler: 8.1, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 8.5 `src/systems/leaderboard.ts` içindeki dinamik import'ları statik import'a dönüştür
    - Tüm `await import(...)` çağrılarını dosya başındaki statik `import` ifadeleriyle değiştir
    - Leaderboard işlevselliğinin korunduğunu doğrula
    - _Gereksinimler: 9.1, 9.2, 9.3_

  - [x] 8.6 Season_Timer'ı `isShard0()` kontrolüyle güncelle
    - Season timer tetiklendiğinde yalnızca shard ID 0'da çalışacak şekilde `isShard0()` kontrolü ekle
    - _Gereksinimler: 10.3_

- [x] 9. Aşama 4 — Altyapı: Docker Compose, Nginx, Dockerfile
  - [x] 9.1 `Dockerfile` oluştur
    - `FROM oven/bun:1-alpine` tabanlı Dockerfile yaz
    - `bun install --frozen-lockfile` ile bağımlılıkları yükle
    - `CMD ["bun", "run", "src/shard-manager.ts"]` ile botu başlat
    - _Gereksinimler: 13.2, 13.6_

  - [x] 9.2 `docker-compose.yml` dosyasını oluştur/güncelle
    - `bot`, `postgres`, `redis`, `nginx` servislerini tanımla
    - `postgres` servisi için kalıcı volume tanımla
    - `depends_on` ile servis bağımlılıklarını tanımla: postgres ve redis hazır olmadan bot başlamaz
    - _Gereksinimler: 13.1, 13.3, 13.4, 13.5_

  - [x] 9.3 `nginx.conf` dosyasını oluştur
    - `upstream bot_cluster` ile round-robin yük dengeleme yapılandır
    - `/health` uç noktasına her 10 saniyede bir sağlık kontrolü ekle
    - 3 ardışık başarısız kontrolde upstream'i devre dışı bırak
    - _Gereksinimler: 12.3, 12.4, 12.5_

  - [x] 9.4 `src/index.ts` veya `src/shard-manager.ts` içine `/health` HTTP uç noktası ekle
    - `Bun.serve` ile `/health` endpoint'i sun: `{ status: "ok" }` JSON yanıtı, HTTP 200
    - _Gereksinimler: 12.1, 12.2_

  - [x] 9.5 Redis bağlantı yapılandırmasını güncelle
    - `src/utils/redis.ts` içinde `maxRetriesPerRequest: 3` ve `enableReadyCheck: true` parametrelerini ayarla
    - Otomatik yeniden bağlanma mekanizmasını doğrula
    - _Gereksinimler: 11.1, 11.3_

  - [x] 9.6 Prisma `DATABASE_URL` bağlantı havuzu parametrelerini ekle
    - `.env.example` ve ilgili yapılandırmaya `connection_limit=20&pool_timeout=10` parametrelerini ekle
    - _Gereksinimler: 11.2_

- [x] 10. Kontrol Noktası — Tüm testlerin geçtiğinden emin ol
  - Tüm testlerin geçtiğini doğrula, sorular varsa kullanıcıya sor.

- [x] 11. Aşama 5 — Performans Optimizasyonları
  - [x] 11.1 Hunt transaction optimizasyonu uygula
    - `src/systems/hunt.ts` içindeki birden fazla ayrı `prisma.player.update` çağrısını tek `prisma.$transaction` bloğunda birleştir
    - `totalXP: { increment: gainedXP }` güncellemesini transaction'a dahil et
    - Transaction hatası durumunda tüm değişiklikleri geri al
    - _Gereksinimler: 15.1, 15.2, 15.3, 15.4_

  - [x] 11.2 `buildAndExecuteBulkWrite` fonksiyonunu PostgreSQL uyumlu hale getir
    - MongoDB `$runCommandRaw` kullanımını kaldır
    - `createMany` / `upsert` ile PostgreSQL uyumlu toplu yazma işlemi uygula
    - _Gereksinimler: 15.1, 15.2_

  - [x] 11.3 Redis pipeline optimizasyonu uygula
    - `src/systems/hunt.ts` ve ilgili dosyalarda ardışık Redis yazma işlemlerini `redis.pipeline()` ile grupla
    - Pipeline çalıştırıldığında tüm komutların sonuçlarını tek seferde al
    - Mevcut işlevselliğin korunduğunu doğrula
    - _Gereksinimler: 16.1, 16.2, 16.3, 16.4_

  - [x] 11.4 Leaderboard Sorted Set entegrasyonunu tamamla
    - `src/systems/leaderboard.ts` içinde `updateLeaderboardScore` → `ZADD lb:{category} {score} {playerId}` kullan
    - `getRankFromSortedSet` → `ZREVRANK lb:{category} {playerId}` kullan; miss durumunda DB'den seed et
    - `recordHuntStats`, `recordPvpWin`, `recordCoinsEarned` fonksiyonlarını Sorted Set güncellemesiyle entegre et
    - _Gereksinimler: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 11.5 Kayıt önbelleği tutarlılığı için özellik testi yaz (Özellik 7)
    - **Özellik 7: Kayıt Önbelleği Tutarlılığı**
    - `ensureRegisteredForInteraction` çağrıldığında önbellekte `reg:{userId}` varsa DB sorgusu yapılmadığını doğrula
    - **Doğrular: Gereksinim 14.1, 14.2**

  - [x] 11.6 Rate limiter atomik limit garantisi için özellik testi yaz (Özellik 8)
    - **Özellik 8: Rate Limiter Atomik Limit Garantisi**
    - `fast-check` ile herhangi bir `limit` ve eşzamanlı istek sayısı için onaylanan token sayısının `limit`'i aşmadığını doğrula
    - **Doğrular: Gereksinim 17.2, 17.3, 17.4**

  - [x] 11.7 Leaderboard Sorted Set tutarlılığı için özellik testi yaz (Özellik 9)
    - **Özellik 9: Leaderboard Sorted Set Tutarlılığı**
    - Redis Sorted Set sıralamasının (`ZREVRANK`) DB sıralamasıyla eşleştiğini doğrula
    - **Doğrular: Gereksinim 18.5**

  - [x] 11.8 `ensureRegisteredForInteraction` Redis önbelleği uygula
    - `src/utils/registration.ts` (veya ilgili dosya) içinde `redis.get("reg:{userId}")` önbellek kontrolü ekle
    - Cache hit'te DB sorgusu yapmadan `true` döndür
    - Cache miss'te DB sorgula, sonuç `true` ise `redis.set("reg:{userId}", "1", "EX", 60)` ile önbelleğe yaz
    - `handleRegistrationButton` başarısında önbelleğe yaz
    - `ensureRegisteredForMessage` fonksiyonuna aynı mantığı uygula
    - _Gereksinimler: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 11.9 Upgrade Promise.all optimizasyonu uygula
    - `src/systems/upgrade.ts` içindeki malzeme kontrolü `for` döngüsünü `Promise.all` ile paralel hale getir
    - Malzeme tüketimi `for` döngüsünü tek `updateMany` ile değiştir
    - Transaction bütünlüğünü koru; hata durumunda tüm değişiklikler geri alınır
    - _Gereksinimler: 19.1, 19.2, 19.3, 19.4_

- [x] 12. Kontrol Noktası — Tüm testlerin geçtiğinden emin ol
  - Tüm testlerin geçtiğini doğrula, sorular varsa kullanıcıya sor.

- [x] 13. Aşama 6 — Staging ve Rollback Planı
  - [x] 13.1 Staging ortamı için `docker-compose.staging.yml` oluştur
    - Staging'e özgü ortam değişkenleri ve volume yapılandırması ekle
    - _Gereksinimler: 20.1_

  - [x] 13.2 Rollback betiği oluştur: `scripts/rollback-to-mongodb.sh`
    - Bot'u durdur: `docker compose stop bot`
    - `DATABASE_URL`'yi MongoDB URL'sine çevir
    - Prisma provider'ı `mongodb` olarak geri al
    - `mongoimport` ile yedek JSON'lardan MongoDB'ye geri yükle
    - Bot'u yeniden başlat: `docker compose up -d bot`
    - Kayıt sayılarını karşılaştırarak veri bütünlüğünü doğrula
    - _Gereksinimler: 20.2, 20.4, 20.5_

  - [x] 13.3 Veri bütünlüğü doğrulama fonksiyonunu `migrate-mongodb-to-pg.ts` içine ekle
    - Aktarım sonrası her tablo için MongoDB ve PostgreSQL kayıt sayılarını karşılaştır
    - Rastgele 10 oyuncu kaydı için alan bazında karşılaştırma yap
    - Foreign key (orphan kayıt) kontrolü ekle
    - Uyuşmazlık varsa raporla ve geçişi başarısız işaretle
    - _Gereksinimler: 21.1, 21.2, 21.3, 21.4_

  - [x] 13.4 Maintenance window yapılandırması belgele
    - `scripts/production-migration.sh` dosyasını oluştur: 00:00–04:00 UTC maintenance window için adım adım geçiş komutlarını içerir
    - _Gereksinimler: 20.3_

- [x] 14. Son Kontrol Noktası — Tüm testlerin geçtiğinden emin ol
  - Tüm testlerin geçtiğini doğrula, sorular varsa kullanıcıya sor.

## Notlar

- `*` ile işaretlenmiş görevler isteğe bağlıdır; daha hızlı MVP için atlanabilir
- Her görev izlenebilirlik için ilgili gereksinimlere referans verir
- Kontrol noktaları artımlı doğrulama sağlar
- Özellik testleri evrensel doğruluk özelliklerini, birim testleri ise belirli örnekleri ve sınır durumlarını doğrular
- Tüm özellik testleri `fast-check` ile yazılır ve minimum 100 iterasyon çalıştırılır
- Test dosyası: `src/__tests__/migration.property.test.ts`
