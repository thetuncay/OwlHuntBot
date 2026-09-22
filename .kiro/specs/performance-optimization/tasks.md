# Görev Listesi — OwlHuntBot Performans Optimizasyonu

## Görevler

- [x] 1. Prisma şemasına totalXP alanı ekle ve index'leri doğrula
  - `prisma/schema.prisma` dosyasında `Player` modeline `totalXP Int @default(0)` alanı ekle
  - `@@index([totalXP])` index'ini Player modeline ekle
  - Mevcut index'lerin (`powerScore`, `totalHunts`, `totalRareFinds`, `totalPvpWins`, `totalCoinsEarned`) varlığını doğrula
  - `pnpm prisma db push` ile şemayı veritabanına uygula
  - **Gereksinim:** 7, 14

- [x] 2. backfillLeaderboardStats fonksiyonunu totalXP backfill için güncelle
  - `src/systems/leaderboard.ts` içindeki `backfillLeaderboardStats` fonksiyonuna `totalXP` backfill mantığı ekle
  - `totalXP === 0` olan oyuncular için `sum(xpRequired(l) for l in 1..level-1) + player.xp` formülüyle hesapla
  - Dinamik import'u (`await import('../utils/math.js')`) statik import'a dönüştür — dosya başına `import { xpRequired } from '../utils/math.js'` ekle
  - `backfillLeaderboardStats` içindeki dinamik import'u kaldır
  - **Gereksinim:** 6, 7

- [x] 3. refreshPowerScore fonksiyonunu totalXP alanını kullanacak şekilde güncelle
  - `src/systems/leaderboard.ts` içindeki `refreshPowerScore` fonksiyonunu güncelle
  - `player.xp` ve level döngüsü yerine `player.totalXP` alanını doğrudan oku
  - `select` bloğuna `totalXP` ekle, `xp` ve level döngüsünü kaldır
  - Dosya başındaki statik import'un (`xpRequired`) artık `refreshPowerScore` tarafından kullanılmadığını doğrula — `backfillLeaderboardStats` hâlâ kullanıyorsa import'u koru
  - **Gereksinim:** 6, 7

- [x] 4. addXP fonksiyonunu totalXP artımlı güncelleme için düzenle
  - `src/systems/xp.ts` içindeki `addXP` fonksiyonunu güncelle
  - Her XP kazanımında `player.totalXP` alanını `{ increment: gainedXP }` ile güncelle
  - `skipDbWrite: true` durumunda caller'ın kendi `player.update` çağrısına `totalXP: { increment: gainedXP }` eklemesi gerektiğini belirt
  - `src/systems/hunt.ts` içindeki birleşik `player.update` çağrısına `totalXP: { increment: totalXP }` ekle
  - **Gereksinim:** 7

- [x] 5. Prisma connection pool parametrelerini güncelle
  - `src/index.ts` içindeki `appendPoolParams` fonksiyonunu güncelle
  - `maxPoolSize=10` → `maxPoolSize=20` olarak değiştir
  - `pool_timeout=10` parametresini ekle (`connectTimeoutMS=10000` korunur)
  - Sonuç URL formatı: `...?maxPoolSize=20&pool_timeout=10&connectTimeoutMS=10000`
  - **Gereksinim:** 9

- [x] 6. ensureRegisteredForInteraction fonksiyonuna Redis önbelleği ekle
  - `src/systems/onboarding.ts` içindeki `ensureRegisteredForInteraction` fonksiyonunu güncelle
  - Fonksiyon başında `redis.get("reg:{userId}")` kontrolü ekle — cache hit ise `true` döndür
  - Cache miss durumunda mevcut `hasMainOwl()` çağrısını yap
  - `hasMainOwl()` `true` döndürürse `redis.set("reg:{userId}", "1", "EX", 60)` ile cache'e yaz
  - `ensureRegisteredForMessage` fonksiyonuna da aynı cache mantığını ekle
  - `handleRegistrationButton` başarılı kayıt sonrasında `redis.set("reg:{userId}", "1", "EX", 60)` yaz
  - `CommandContext` tipine `redis` alanının mevcut olduğunu doğrula
  - **Gereksinim:** 1

- [x] 7. upgrade.ts sequential for-await döngülerini Promise.all + updateMany ile değiştir
  - `src/systems/upgrade.ts` içindeki `attemptUpgrade` fonksiyonunu güncelle
  - Zorunlu malzeme kontrolü için `for` döngüsündeki `tx.inventoryItem.findUnique` çağrılarını `Promise.all` ile paralel hale getir
  - Malzeme tüketimi için `for` döngüsündeki `tx.inventoryItem.update` çağrılarını tek `tx.inventoryItem.updateMany` ile değiştir
  - Ek item bonusları için de aynı pattern'i uygula (`findUnique` → `Promise.all`, `update` → `updateMany`)
  - Transaction bloğu içinde kalmasını sağla — rollback davranışı korunmalı
  - **Gereksinim:** 8

- [x] 8. Leaderboard Redis Sorted Set implementasyonu
  - `src/systems/leaderboard.ts` içine `updateLeaderboardScore(redis, category, playerId, score)` fonksiyonu ekle — `ZADD lb:{category} {score} {playerId}` çalıştırır
  - `getRankFromDB` yerine `getRankFromSortedSet(redis, prisma, category, playerId)` fonksiyonu ekle — önce `ZREVRANK lb:{category} {playerId}` dener, miss durumunda MongoDB'den okuyup Sorted Set'i seed'ler
  - `recordHuntStats` fonksiyonunu güncelle — DB yazmasının yanı sıra `lb:hunt` ve `lb:power` Sorted Set'lerini güncelle
  - `recordPvpWin` fonksiyonunu güncelle — `lb:arena` Sorted Set'ini güncelle
  - `recordCoinsEarned` fonksiyonunu güncelle — `lb:wealth` Sorted Set'ini güncelle
  - `getLeaderboard` içindeki `getRankFromDB` çağrısını `getRankFromSortedSet` ile değiştir
  - Seed mekanizması: Sorted Set boşsa `fetchFromDB` sonuçlarıyla `ZADD` ile doldur
  - **Gereksinim:** 13

- [x] 9. Coinflip komutunu ephemeral + animasyon optimizasyonu için güncelle
  - `src/commands/coinflip.ts` içindeki `execute` fonksiyonunu güncelle
  - `interaction.reply(...)` ile başlayan akışı `await interaction.deferReply({ flags: 64 })` + `await interaction.editReply(...)` pattern'ine dönüştür
  - Animasyon frame sayısını 5'ten 3'e indir: `['🪙', '🔄', '🪙']`
  - Frame arası bekleme süresini 200ms'den 150ms'ye indir
  - Final sonuç mesajının (kazanç/kayıp bilgisi) doğru gösterildiğini doğrula
  - **Gereksinim:** 10, 11

- [x] 10. Slot komutunu ephemeral için güncelle
  - `src/commands/slot.ts` içindeki `execute` fonksiyonunu güncelle
  - `interaction.reply(...)` ile başlayan akışı `await interaction.deferReply({ flags: 64 })` + `await interaction.editReply(...)` pattern'ine dönüştür
  - Animasyon mantığına dokunma — sadece ilk yanıt tipini değiştir
  - **Gereksinim:** 10

- [x] 11. Blackjack komutunu ephemeral + collector TTL için güncelle
  - `src/commands/bj.ts` içindeki slash `execute` fonksiyonunu güncelle
  - `interaction.reply(...)` ile başlayan akışı `await interaction.deferReply({ flags: 64 })` + `await interaction.editReply(...)` pattern'ine dönüştür
  - Collector `time` parametresini 60_000ms'den 45_000ms'ye indir
  - `msg.createMessageComponentCollector` çağrısını `interaction.fetchReply()` sonrasına taşı
  - Anında Blackjack durumunda da ephemeral yanıt kullan
  - **Gereksinim:** 10, 12

- [x] 12. PvP duel komutunu ephemeral için güncelle
  - `src/commands/owl-pvp.ts` içindeki `runDuel` fonksiyonunu güncelle
  - `interaction.deferReply()` → `interaction.deferReply({ flags: 64 })` olarak değiştir
  - `runVs` (davet mesajı) ephemeral yapılmaz — rakibin görmesi gerekiyor
  - **Gereksinim:** 10

- [x] 13. Leaderboard collector TTL'ini azalt
  - `src/commands/leaderboard.ts` içindeki `COLLECTOR_TTL` sabitini 90_000'den 30_000'e indir
  - Hem slash hem text komut collector'larının bu sabiti kullandığını doğrula
  - **Gereksinim:** 12

- [x] 14. PBT testleri: Cache tutarlılığı ve totalXP invariant
  - `src/__tests__/perf-cache.test.ts` dosyası oluştur
  - `fast-check` ile `userId` için arbitrary string üret
  - Cache miss → DB → cache set → cache hit akışında her iki sonucun eşit olduğunu doğrula
  - `src/__tests__/perf-totalxp.test.ts` dosyası oluştur
  - Arbitrary `level` (1-50) ve `xp` değerleri için `Player.totalXP === sum(xpRequired(l) for l in 1..level-1) + xp` invariant'ını doğrula
  - `vitest --run` ile testlerin geçtiğini doğrula
  - **Gereksinim:** 1, 7 (G1, G7 PBT özellikleri)

- [x] 15. PBT testleri: Rate limiter atomikliği ve Sorted Set tutarlılığı
  - `src/__tests__/perf-ratelimit.test.ts` dosyası oluştur
  - `consumeRateLimitToken` için eşzamanlı çağrı simülasyonu yaz — onaylanan token sayısının `limit`'i aşmadığını doğrula
  - `src/__tests__/perf-sortedset.test.ts` dosyası oluştur
  - Mock Redis ile `ZADD`/`ZREVRANK` sonuçlarının MongoDB `COUNT` ile tutarlı olduğunu doğrula
  - `vitest --run` ile testlerin geçtiğini doğrula
  - **Gereksinim:** 5, 13 (G5, G13 PBT özellikleri)

- [x] 16. PBT testleri: Upgrade sıra bağımsızlığı ve transaction atomikliği
  - `src/__tests__/perf-upgrade.test.ts` dosyası oluştur
  - Arbitrary envanter durumu için `Promise.all` ile sıralı güncellemenin aynı nihai durumu ürettiğini doğrula
  - `src/__tests__/perf-transaction.test.ts` dosyası oluştur
  - Hunt transaction ortasında hata enjekte et — kısmi yazma kalmadığını doğrula
  - `vitest --run` ile testlerin geçtiğini doğrula
  - **Gereksinim:** 3, 8 (G3, G8 PBT özellikleri)
