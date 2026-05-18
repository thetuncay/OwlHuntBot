# SYSTEM_AUDIT.md — OwlHuntBot Sistem Denetimi

> Tarih: 2026-05-18 | Denetçi: Principal Engineer Audit
> Metodoloji: Kaynak kodu doğrudan okundu, hiçbir yorum/belge güvenilmedi.

---

## ÖZET PUAN KARTI

| Alan | Durum | Risk |
|---|---|---|
| Gameplay Loop | ⚠️ Kısmen Tamamlanmış | Orta |
| Ekonomi | 🔴 Kritik Sorunlar | Yüksek |
| Kod Kalitesi | ⚠️ Kabul Edilebilir | Orta |
| Üretim Hazırlığı | ⚠️ Eksikler Var | Orta-Yüksek |
| Oyuncu Deneyimi | ⚠️ Tutarsızlıklar | Orta |
| Güvenlik | 🔴 Exploit Vektörleri | Yüksek |

---

## 1. GAMEPLAY LOOP ANALİZİ

### 1.1 Ana Döngü Haritası

```
Hunt → Av/Materyal → Upgrade/Craft → Güçlü Baykuş → Tame → Prestige
         ↓                                                      ↓
      Market ←──────────────────────────────────────────── Sıfırla
         ↓
      PvP / Gambling
```

**Döngü tamamlanmış mı?** Kısmen. Temel döngü çalışıyor ama birkaç kritik bağlantı kopuk.

### 1.2 Kopuk Bağlantılar

**SORUN S-01: Trait sistemi tamamen pasif — hiçbir yerde uygulanmıyor**
- Severity: YÜKSEK
- `OWL_TRAITS` config'de 15 trait tanımlı, `rollTraits` ve `parseStoredTraits` çalışıyor
- Ancak `hunt.ts`, `pvp.ts`, `tame.ts` içinde trait etkileri (`bonusType`, `penaltyType`) **hiçbir yerde uygulanmıyor**
- Oyuncular trait'leri görüyor ama hiçbir etkisi yok — bu bir **feature illusion**
- Root Cause: Trait etki uygulama kodu hiç yazılmamış
- Exploitability: Yok (ama oyuncu güveni kaybı)
- Fix: Her aktivitede trait bonuslarını/cezalarını uygulayan `applyTraitEffects()` fonksiyonu

**SORUN S-02: Biome sistemi yarım — giriş ücreti alınmıyor**
- Severity: YÜKSEK
- `BIOMES` config'de 3 biome tanımlı, `hunt.ts` biome modifier'larını uyguluyor
- Ancak `entryCost` hiçbir yerde tahsil edilmiyor — Derin Orman (2500 coin) ücretsiz
- `biome-session.ts` dosyası var ama `hunt.ts` içinde kullanılmıyor
- Root Cause: Biome session yönetimi hunt akışına entegre edilmemiş
- Exploitability: Yüksek — oyuncular ücretsiz %30 loot bonus alıyor
- Fix: Hunt başında biome session kontrolü + giriş ücreti tahsilatı

**SORUN S-03: Maintenance sistemi çağrılmıyor**
- Severity: ORTA
- `dailyMaintenance()` fonksiyonu `economy.ts`'de var
- `index.ts`'de hiçbir scheduler bunu çağırmıyor
- Baykuşlar hiç bakım gerektirmiyor, effectiveness asla düşmüyor
- Root Cause: Scheduler eklenmemiş
- Exploitability: Orta — ekonomi sink çalışmıyor

**SORUN S-04: Passive training XP çok düşük, anlamsız**
- Severity: DÜŞÜK
- `PASSIVE_TRAINING_XP_PER_HOUR = 5` — saatte 5 XP
- Level 1→2 için 250 XP gerekiyor → 50 saat training
- Kimse kullanmaz, dead feature
- Fix: Saatte 20-50 XP veya tier bazlı ölçekleme

**SORUN S-05: Prestige sonrası inventory sıfırlanmıyor**
- Severity: ORTA
- `performAscension()` level, xp, mainOwlId sıfırlıyor
- Envanter, coin, diğer baykuşlar **korunuyor**
- Prestige'in anlamı azalıyor — oyuncu tüm materyallerini saklayıp prestige yapabilir
- Root Cause: Tasarım kararı mı yoksa eksiklik mi belirsiz
- Fix: Tasarım kararını netleştir ve belgeye yaz

**SORUN S-06: Leaderboard'da kullanılmayan importlar**
- Severity: DÜŞÜK
- `index.ts`'de `getLeaderboard`, `currentSeasonId`, `seasonEndDate`, `LeaderboardCategory` import edilmiş ama kullanılmıyor
- TypeScript hint olarak işaretlemiş

---

## 2. KOD KALİTESİ

### 2.1 Mimari Sorunlar

**SORUN K-01: `any` cast'ler Prisma modellerinde**
- `items.ts`: `type AnyPrisma = PrismaClient & Record<string, any>` — PlayerBuff modeli için
- `tame.ts`: `as any` cast'ler encounter ve owl create'de
- Root Cause: Prisma schema'da bazı alanlar `Json` tipinde, TypeScript bunu doğrudan desteklemiyor
- Risk: Runtime type hataları sessizce geçebilir

**SORUN K-02: `$runCommandRaw` MongoDB-specific kod**
- `hunt.ts`'de bond güncelleme için `prisma.$runCommandRaw` kullanılıyor
- Bu MongoDB'ye özgü, PostgreSQL'de çalışmaz
- Fallback var ama `.pgdata` klasörü PostgreSQL kullandığını gösteriyor
- Root Cause: Kod MongoDB için yazılmış, PostgreSQL'e geçilmiş ama temizlenmemiş
- Risk: Fallback her zaman çalışıyor ama gereksiz hata logları üretiyor

**SORUN K-03: In-memory buff cache process restart'ta sıfırlanıyor**
- `items.ts`'de `buffCache = new Map()` — process-local
- Sharding veya restart sonrası cache boş, ilk hunt'ta DB'ye gidilir
- Bu kabul edilebilir ama belgelenmemiş

**SORUN K-04: `tame-test.ts` ve `tame-narrative.ts` production'da gereksiz**
- `src/utils/tame-test.ts` — test yardımcısı, production bundle'a giriyor
- `src/utils/tame-narrative.ts` ve `tame-texts.ts` — kullanılıyor mu kontrol edilmeli

**SORUN K-05: `admin-testtame.ts` production'da erişilebilir**
- Admin test komutu production'da aktif
- Güvenlik riski: admin komutları yanlış konfigürasyonda herkese açık olabilir

### 2.2 Async Güvenlik

**SORUN K-06: `trackQuestProgress` transaction içinde `tx as any` cast**
- `market.ts` ve `crafting.ts`'de `trackQuestProgress(tx as any, ...)` çağrısı
- `trackQuestProgress` `PrismaClient` bekliyor, transaction client değil
- Bu çalışıyor ama tip güvensiz — transaction rollback'te quest güncellemesi de geri alınır (bu aslında doğru davranış)

**SORUN K-07: `openAllLootboxes` sequential loop — N+1 problem**
- Her kutu için ayrı `openLootbox()` çağrısı → her biri ayrı lock alıyor
- 50 kutu açmak = 50 ayrı Redis lock + 50 ayrı transaction
- Atlas M0'da timeout riski yüksek

---

## 3. EKSİK ENTEGRASYONLAR

### 3.1 Slash/Prefix Parité

| Komut | Prefix | Slash | Notlar |
|---|---|---|---|
| hunt | ✅ | ✅ | Tam |
| stats | ✅ | ✅ | Tam |
| quests | ✅ | ✅ | Tam |
| market | ✅ | ✅ | Tam |
| crafting | ✅ | ? | Kontrol gerekli |
| tame | ✅ | ✅ | Tam |
| upgrade | ✅ | ✅ | Tam |
| prestige | ✅ | ? | Kontrol gerekli |
| transfer | ✅ | ? | Kontrol gerekli |
| pvp gambling | ? | ? | Belirsiz |

### 3.2 Quest Entegrasyonu

| Aktivite | Quest Takibi | Notlar |
|---|---|---|
| Hunt | ✅ | `trackQuestProgress(prisma, playerId, 'hunt', catches.length)` |
| Craft | ✅ | `trackQuestProgress(tx as any, playerId, 'craft')` |
| Tame | ✅ | Düzeltildi (bu spec) |
| Market | ✅ | `trackQuestProgress(tx as any, sellerId, 'market')` |

Quest sistemi tam entegre görünüyor.

### 3.3 Lootbox Drop Entegrasyonu

| Kaynak | Entegre | Notlar |
|---|---|---|
| Hunt | ✅ | `rollHuntLootboxDrop` |
| PvP | ✅ | `rollPvpLootboxDrop` |
| Encounter/Tame | ✅ | `rollEncounterLootboxDrop` |

---

## 4. ÜRETİM RİSKLERİ

### 4.1 Kritik

**SORUN P-01: DB Queue graceful degradation eksik**
- `enqueueDbWrite` queue başlatılmamışsa `return` yapıyor — veri kaybı
- Envanter item'ları kaybolabilir
- Fix: Fallback olarak direkt Prisma yazma yapılmalı

**SORUN P-02: XP level-up tek seviye atlıyor**
- `addXP` bir çağrıda sadece 1 level atlıyor
- Çok fazla XP gelirse (örn. quest ödülü) birden fazla level atlanabilir ama kod bunu handle etmiyor
- Root Cause: `while (nextXP >= required)` yerine `if` kullanılmış

**SORUN P-03: Transfer cooldown transaction dışında**
- `transferCoins` cooldown'u transaction commit sonrası set ediyor
- Transaction başarılı ama Redis yazma başarısız olursa cooldown set edilmez
- Oyuncu aynı anda iki transfer yapabilir (race window küçük ama var)

---

## 5. FEATURE COMPLETENESS ÖZETI

| Özellik | Var | Erişilebilir | Fonksiyonel | Entegre | Dengeli |
|---|---|---|---|---|---|
| Hunt | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tame/Encounter | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Upgrade | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Crafting | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Market | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Daily Quests | ✅ | ✅ | ✅ | ✅ | ✅ |
| Prestige | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Lootbox | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Buff Items | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| PvP | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| PvP Gambling | ✅ | ? | ? | ? | ? |
| Traits | ✅ | ✅ | ❌ | ❌ | N/A |
| Biomes | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Maintenance | ✅ | ❌ | ❌ | ❌ | N/A |
| Transfer | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Leaderboard | ✅ | ✅ | ✅ | ✅ | ✅ |
