# SYSTEM_AUDIT.md — OwlHuntBot Sistem Denetimi

> Tarih: 2026-05-18 | Denetçi: Senior Backend / Economy / Security Engineer

---

## ÖZET PUAN KARTI

| Alan | Durum | Kritiklik |
|------|-------|-----------|
| Gameplay Loop | ⚠️ Kısmen tamamlanmış | P1 |
| Economy | 🔴 Ciddi açıklar | P0 |
| Concurrency | 🟡 Çoğunlukla güvenli | P1 |
| Production Readiness | 🔴 Eksikler var | P0 |
| Feature Completeness | 🟡 Bazı sistemler yarım | P2 |
| Security / Anti-Abuse | 🟡 Temel korumalar var | P1 |

---

## 1. KRİTİK (P0) — ÜRETİM ENGELLEYİCİLER

### 1.1 Economy: Coin Negatife Düşebilir
**Dosya:** `src/systems/pvp.ts`, `src/systems/gambling.ts`
**Sorun:** `coins: { decrement: bet }` işlemi, transaction içinde bakiye kontrolü yapılıyor ancak `gambling.ts`'deki `settleGamble` fonksiyonunda `player.coins < bet` kontrolü yapılıyor. Ancak `pvp.ts`'de kazanan için `coins: { increment: 100 }` sabit değer kullanılıyor — bu değer config'den gelmiyor ve `PVP_WIN_COINS` sabiti yok.
**Exploit:** Eş zamanlı iki PvP oturumu başlatılırsa (farklı challenger'lar aynı defender'ı hedef alırsa) defender'ın coin'i iki kez düşebilir.
**Düzeltme:** `simulatePvP`'de defender için de lock alınıyor ama `startPvP` lock almıyor — iki farklı challenger aynı anda `startPvP` çağırabilir.

### 1.2 Economy: PvP Kazanma Ödülü Sabit Hardcode
**Dosya:** `src/systems/pvp.ts` satır ~180
**Sorun:** `coins: { increment: 100 }` — bu değer config'de `SIM_PVP_WIN_COINS = 60` olarak tanımlı ama gerçek PvP için ayrı bir sabit yok. Değer doğrudan kodda gömülü.
**Risk:** Balance değişikliği için kod değişikliği gerekiyor.

### 1.3 Transaction Timeout: Atlas M0 Uyumsuzluğu
**Dosya:** `src/systems/tame.ts`
**Sorun:** `attemptTame` fonksiyonu kasıtlı olarak transaction kullanmıyor ("Atlas M0 timeout sorununu önler" yorumu var). Ancak bu, item tüketimi ile owl oluşturma arasında partial state riski yaratıyor.
**Senaryo:** Item tüketildi, owl oluşturma başarısız oldu → item kayboldu, owl yok.
**Düzeltme:** `withLock` zaten var, ancak atomiklik garanti edilmiyor.

### 1.4 Race Condition: Tame Mini-PvP Bot Oyuncu Birikimi
**Dosya:** `src/systems/tame.ts`
**Sorun:** Her başarısız tame denemesinde `wild:*` prefix'li bot oyuncu oluşturuluyor. Cleanup job 24 saatte bir çalışıyor. Yoğun kullanımda binlerce bot oyuncu birikebilir.
**Risk:** MongoDB collection şişmesi, sorgu yavaşlaması.
**Mevcut Durum:** `cleanupOrphanBotPlayers` var ama 24 saatlik interval çok uzun.

### 1.5 DB-Queue: Graceful Degradation Sessiz Veri Kaybı
**Dosya:** `src/utils/db-queue.ts` satır ~130
**Sorun:** Queue başlatılmamışsa `console.warn` yazıp `return` yapıyor — veri sessizce kayboluyor.
```typescript
if (!queue) {
  console.warn('[Queue] Queue başlatılmamış, direkt yazma yapılıyor.');
  return; // VERİ KAYBI!
}
```
**Risk:** Bot restart sırasında envanter item'ları kaybolabilir.

### 1.6 Leaderboard: totalCoinsEarned Yanlış Hesaplanıyor
**Dosya:** `src/systems/leaderboard.ts`
**Sorun:** `recordCoinsEarned` sadece gambling kazançlarında ve PvP kazançlarında çağrılıyor. Hunt geliri, quest ödülleri, market satışları bu sayaca dahil edilmiyor. "Wealth" liderboard'u anlamsız.

---

## 2. YÜKSEK ÖNCELİKLİ (P1) — EKONOMİ KIRICI

### 2.1 Maintenance Sistemi Hiç Çağrılmıyor
**Dosya:** `src/systems/economy.ts` — `dailyMaintenance()` fonksiyonu
**Sorun:** Bu fonksiyon hiçbir yerde çağrılmıyor. `index.ts`'de scheduler yok. Effectiveness sistemi çalışmıyor.
**Etki:** Baykuşlar hiç bakım gerektirmiyor → `MAINTENANCE_DAILY_ITEM` (Cig Et) tamamen değersiz → crafting recipe `c000` (Besleyici Karma Yem) anlamsız.

### 2.2 autoSink Hiç Çağrılmıyor
**Dosya:** `src/systems/economy.ts` — `autoSink()` fonksiyonu
**Sorun:** `AUTO_SINK_MODES`, `STACK_LIMITS`, `ITEM_MAX_STACK_SAME` config'de tanımlı ama hiçbir yerde kullanılmıyor. Stack limiti uygulanmıyor.
**Etki:** Oyuncular sınırsız item biriktirebilir → envanter şişmesi → DB büyümesi.

### 2.3 repair() Komutu Yok
**Dosya:** `src/systems/economy.ts` — `repair()` fonksiyonu
**Sorun:** Fonksiyon var, `REPAIR_BASE_COST = 500` config'de var, ama hiçbir komut bu fonksiyonu çağırmıyor. Oyuncular baykuşlarını tamir edemez.
**Etki:** Effectiveness düşerse (PvP'den) kalıcı hasar → oyuncu frustration.

### 2.4 XP Level-Up Tek Seferde Sadece 1 Level
**Dosya:** `src/systems/xp.ts`
**Sorun:** `addXP` fonksiyonu tek seferde sadece 1 level atlıyor. Büyük XP kazanımlarında (örn. admin addxp 99999) oyuncu birden fazla level atlaması gerekse de sadece 1 level atlıyor.
**Etki:** Admin XP ekleme komutu yanlış çalışıyor, prestige sonrası büyük XP bonusları kaybolabilir.

### 2.5 Prestige: Envanter Silinmiyor
**Dosya:** `src/systems/prestige.ts`
**Sorun:** Prestige sırasında oyuncunun envanteri temizlenmiyor. Oyuncu Lv.1'e düşüyor ama tüm materyalleri, buff item'ları ve kutularını koruyor.
**Etki:** Prestige'in "reset" anlamı yok → oyuncu avantajlı başlıyor → progression bozuluyor.

### 2.6 Daily Quest: Craft Quest Takibi Bozuk
**Dosya:** `src/systems/crafting.ts` satır ~90
**Sorun:** `trackQuestProgress(tx as any, playerId, 'craft')` — transaction içinde çağrılıyor ama `trackQuestProgress` `prisma.dailyQuest.updateMany` kullanıyor. `tx as any` cast'i tip güvenliğini kırıyor ve transaction rollback'te quest ilerlemesi geri alınmıyor.

### 2.7 PvP Streak: pvp.ts ile pvp-streak.ts Çakışması
**Dosya:** `src/systems/pvp.ts` ve `src/systems/pvp-streak.ts`
**Sorun:** `pvp.ts` transaction içinde `pvpCount: { increment: 1 }` yapıyor. `pvp-streak.ts` ise `pvpStreak: { increment: 1 }` yapıyor. İki ayrı DB yazması — aralarında crash olursa tutarsız state.
**Ayrıca:** `pvp-streak.ts` yorumunda "pvp.ts kazananın pvpStreak'ini ARTIRMIYOR" yazıyor ama `pvp.ts`'de `pvpStreakLoss: { increment: 1 }` var — bu çelişkili.

---

## 3. ORTA ÖNCELİKLİ (P2) — EXPLOIT / GÜVENLİK

### 3.1 Admin Komutları: Hardcoded Admin ID'leri
**Dosya:** `src/commands/admin.ts`
**Sorun:** Admin ID'leri kaynak kodda hardcoded. Yeni admin eklemek için deploy gerekiyor.
**Risk:** Düşük (sadece bot sahibi erişebilir) ama maintainability sorunu.

### 3.2 Market: Kısaltılmış ID ile Arama Güvensiz
**Dosya:** `src/systems/market.ts`
**Sorun:** `findFirst({ where: { id: { startsWith: listingId } } })` — kısaltılmış ID ile arama yapılıyor. İki ilan aynı prefix'e sahipse yanlış ilan satın alınabilir.
**Düzeltme:** Minimum 8 karakter zorunlu kılınmalı veya tam UUID kullanılmalı.

### 3.3 Transfer: Alıcı Günlük Limit Yanlış Kontrol Ediliyor
**Dosya:** `src/systems/transfer.ts`
**Sorun:** `if (received > TRANSFER_DAILY_RECEIVE_LIMIT)` — bu tek transfer için kontrol ediyor, günlük toplam için değil. Oyuncu günde 100 kez 14.999 coin alabilir.
**Exploit:** Alt hesaptan ana hesaba sınırsız coin aktarımı.

### 3.4 Buff Cache: In-Memory Cache Shard Güvensiz
**Dosya:** `src/systems/items.ts`
**Sorun:** `buffCache` in-memory Map. Sharding modunda her shard kendi cache'ine sahip → tutarsız buff durumu.
**Etki:** Shard A buff'ı tüketir, Shard B hala aktif görür → double benefit.

### 3.5 Gambling: Negatif Bahis Kontrolü Eksik
**Dosya:** `src/commands/bj.ts`, `src/commands/slot.ts`, `src/commands/coinflip.ts`
**Sorun:** Komut katmanında `bet <= 0` kontrolü yapılıyor mu? `gambling.ts`'de `player.coins < bet` var ama `bet < 0` kontrolü yok.

### 3.6 PvP Gambling: Coin Freeze Exploit
**Dosya:** `src/systems/PvPGamblingSystem.ts`
**Sorun:** `validateInvite` bakiye kontrolü yapıyor ama oturum oluşturulduktan sonra coin rezerve edilmiyor. Challenger başka bir işlemde coin harcayabilir, sonra PvP kabul edildiğinde yetersiz bakiye.
**Etki:** Transaction'da `decrement` başarısız olur ama hata mesajı kullanıcıya iletilmeyebilir.

---

## 4. DÜŞÜK ÖNCELİKLİ (P3) — RETENTION / GAMEPLAY

### 4.1 Biome Sistemi: Giriş Ücreti Alınmıyor
**Dosya:** `src/systems/hunt.ts`, `src/utils/biome-session.ts`
**Sorun:** `BIOME_SESSION_TTL_MS`, `BiomeDef.entryCost` config'de tanımlı. `biome-session.ts` dosyası var. Ancak `rollHunt` fonksiyonunda `biomeId` parametresi alınıyor ama giriş ücreti hiç kesilmiyor.
**Etki:** Derin Orman (2500 coin giriş) ücretsiz kullanılıyor.

### 4.2 Passive Mode: Scouting Bonusu Çalışıyor Ama Training XP Yok
**Dosya:** `src/index.ts` — `applyPassiveTrainingXP()`
**Sorun:** Training XP scheduler var ve çalışıyor. Ancak `PASSIVE_TRAINING_XP_PER_HOUR = 5` çok düşük — oyuncular bu özelliği kullanmayacak.

### 4.3 Leaderboard: "Relic" Kategorisi Anlamsız
**Dosya:** `src/systems/leaderboard-queries.ts`
**Sorun:** `relic` kategorisi `totalRareFinds` sayıyor. Ancak `totalRareFinds` sadece hunt'ta difficulty >= 7 avlar için artıyor. Tame, market, crafting'den gelen nadir item'lar sayılmıyor.

### 4.4 Crafting: Sadece 3 Tarif
**Dosya:** `src/config.ts`
**Sorun:** `CRAFTING_RECIPES` sadece 3 tarif içeriyor. Bunlardan biri (c000 Karma Yem) maintenance sistemi çalışmadığı için değersiz.

### 4.5 Prestige Bonusu Uygulanmıyor
**Dosya:** `src/utils/math.ts` — `statEffect()`
**Sorun:** `statEffect(stat, prestigeLevel)` prestige bonusunu hesaplıyor. Ancak `pvp-sim.ts`'de `statEffect(mainOwl.statGaga + mainOwl.statPence + mainOwl.statKanat, player?.prestigeLevel ?? 0)` doğru kullanılıyor. `pvp.ts`'de de doğru. Ancak `hunt.ts`'de catchChance hesaplamasında prestige bonusu yok.

---

## 5. POLİŞ / REFACTOR (P4)

### 5.1 Dead Code: COLOR_SUCCESS, COLOR_FAIL, COLOR_INFO, COLOR_WARNING
**Dosya:** `src/config.ts`
**Sorun:** Bu sabitler `embed.ts` tema migrasyonundan sonra artık kullanılmıyor (sadece `roles.ts`'de `COLOR_SUCCESS` kullanılıyor). Temizlenebilir.

### 5.2 Dead Code: SWITCH_* Sabitleri
**Dosya:** `src/config.ts`
**Sorun:** `SWITCH_BASE_COST`, `SWITCH_TIER_MULTIPLIER`, `SWITCH_COOLDOWN_MS`, `SWITCH_HP_THRESHOLD`, `SWITCH_PENALTY_*` — `switchCost()` math.ts'de tanımlı ama hiçbir komut bu fonksiyonu çağırmıyor.

### 5.3 Dead Code: AUTO_SINK_MODES
**Dosya:** `src/config.ts`
**Sorun:** `AUTO_SINK_MODES = ['auto-sell', 'auto-disassemble', 'auto-convert']` — hiçbir yerde kullanılmıyor.

### 5.4 Duplicate: blackjack() ve settleBlackjack()
**Dosya:** `src/systems/gambling.ts`
**Sorun:** İki ayrı blackjack implementasyonu var. `blackjack()` auto-resolve, `settleBlackjack()` interaktif BJ için. `bj.ts` komutu hangisini kullanıyor belirsiz.

### 5.5 Tip Güvensizliği: `as any` Cast'leri
**Dosya:** `src/systems/tame.ts`, `src/systems/items.ts`, `src/systems/crafting.ts`
**Sorun:** Birden fazla `as any` cast var. Prisma tip sistemi bypass ediliyor.

### 5.6 Unused Export: backfillLeaderboardStats
**Dosya:** `src/systems/leaderboard.ts`
**Sorun:** Sadece admin komutundan çağrılıyor. Production'da gereksiz.

---

## 6. SLASH / PREFIX PARİTESİ EKSİKLİKLERİ

| Komut | Prefix | Slash | Durum |
|-------|--------|-------|-------|
| repair | ❌ | ❌ | Hiç yok |
| maintenance | ❌ | ❌ | Hiç yok |
| biome giriş | ❌ | ❌ | Hiç yok |
| setmain | ✅ | ✅ | OK |
| buff | ✅ | ❌ | Slash eksik |
| buffs | ✅ | ❌ | Slash eksik |
| sk/ek | ✅ | ❌ | Slash eksik |
| zoo | ✅ | ❌ | Slash eksik |
| cash | ✅ | ❌ | Slash eksik |
| sell | ✅ | ❌ | Slash eksik |

---

## 7. SCHEDULER / CLEANUP DURUMU

| Job | Interval | Durum |
|-----|----------|-------|
| Season rollover | 1 saat | ✅ Çalışıyor |
| Passive training XP | 1 saat | ✅ Çalışıyor |
| Orphan bot cleanup | 24 saat | ⚠️ Çok seyrek |
| Market cleanup | 10 dakika | ✅ Çalışıyor |
| Daily maintenance | ❌ | 🔴 YOK |
| Auto-sink | ❌ | 🔴 YOK |
| Buff cache temizleme | ❌ | 🔴 YOK (in-memory TTL var) |
