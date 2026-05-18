# PRODUCTION_READINESS.md — OwlHuntBot Üretim Hazırlık Denetimi

> Tarih: 2026-05-18 | Metodoloji: Kaynak kodu, middleware, scheduler ve hata yönetimi analizi.

---

## 1. KRİTİK ÜRETİM BLOKLARI (P0)

### P0-01: DB Queue Veri Kaybı Riski

**Sorun:** `enqueueDbWrite()` queue başlatılmamışsa sessizce `return` yapıyor.
```typescript
// db-queue.ts
if (!queue) {
  console.warn('[Queue] Queue başlatılmamış, direkt yazma yapılıyor.');
  return; // ← VERİ KAYBI! Yazma yapılmıyor.
}
```
**Etki:** Envanter item'ları, XP güncellemeleri kaybolabilir.
**Senaryo:** Process restart sırasında gelen hunt isteği → queue henüz başlatılmamış → item düşmüyor.
**Fix:** Fallback olarak direkt Prisma yazma:
```typescript
if (!queue) {
  // Direkt yaz — queue yoksa bekletme
  await processFallback(job);
  return;
}
```

### P0-02: XP Level-Up Tek Seviye Atlama

**Sorun:** `addXP()` bir çağrıda sadece 1 level atlıyor.
```typescript
// xp.ts — sadece bir kez kontrol ediyor
if (nextXP < required) { /* level-up yok */ }
// Level-up var → newLevel = player.level + 1
// Ama nextXP hâlâ bir sonraki level için yeterliyse? → Kayıp XP
```
**Etki:** Quest ödülü (500 XP) + hunt XP aynı anda gelirse birden fazla level atlanabilir ama kod bunu handle etmiyor. XP kaybolur.
**Fix:** `while (nextXP >= xpRequired(currentLevel))` döngüsü.

### P0-03: Biome Giriş Ücreti Tahsil Edilmiyor

**Sorun:** `hunt.ts`'de biome modifier uygulanıyor ama `entryCost` hiç alınmıyor.
**Etki:** Tasarlanmış en büyük coin sink çalışmıyor. Ekonomi dengesizliği.
**Fix:** Hunt başında biome session kontrolü + coin tahsilatı.

---

## 2. GÜVENLİK VE EXPLOIT RİSKLERİ (P1)

### P1-01: Race Condition — Transfer Cooldown

**Sorun:** Transfer cooldown transaction dışında set ediliyor.
```typescript
// transfer.ts
return withLock(senderId, 'transfer', async () => {
  return prisma.$transaction(async (tx) => {
    // ... transfer işlemi
    return result;
  });
}).then(async (result) => {
  await setTransferCooldown(redis, senderId); // ← Transaction sonrası
  return result;
});
```
**Senaryo:** Transaction başarılı, Redis yazma başarısız → cooldown set edilmez → oyuncu hemen tekrar transfer yapabilir.
**Risk:** Düşük (Redis genellikle güvenilir) ama var.
**Fix:** Cooldown'u transaction içinde veya lock içinde set et.

### P1-02: Alt Hesap Farming

**Sorun:** Level 5 gereksinimi çok düşük, günlük 10.000 coin transfer limiti yüksek.
**Senaryo:**
1. Alt hesap oluştur (1 saat)
2. Alt hesap hunt yap → coin biriktir
3. Ana hesaba transfer et (günlük 10.000 coin, %3 vergi = 300 coin kayıp)
**Etki:** Ekonomi dengesizliği, rekabetçi avantaj.
**Fix:** Transfer minimum level'ı 15'e çıkar, günlük limiti 3.000'e düşür.

### P1-03: Trait Sistemi Etkisiz — Oyuncu Yanıltması

**Sorun:** Trait'ler gösteriliyor ama hiçbir etkisi yok.
**Etki:** Oyuncular God Roll baykuş için premium ödüyor (market'te) ama fark yok.
**Risk:** Güven kaybı, potansiyel şikayet.

### P1-04: Admin Komutları Production'da Aktif

**Sorun:** `admin-testtame.ts` ve `admin.ts` production bundle'a giriyor.
**Risk:** Yanlış konfigürasyonda admin komutları herkese açık olabilir.
**Fix:** Admin komutlarında guild/role kontrolü doğrula.

### P1-05: Market Listing ID Kısaltması

**Sorun:** UUID'nin ilk 8 karakteri gösteriliyor.
```typescript
value: `💰 **${l.price}** | ID: \`${l.id.split('-')[0]}\``
```
**Risk:** UUID collision olasılığı düşük ama `startsWith` araması yanlış ilan bulabilir.
**Fix:** İlk 8 karakter yerine tam UUID göster veya sequential ID kullan.

---

## 3. ATLAS M0 UYUMLULUĞU

### M0-01: Transaction Timeout Riski

**Sorun:** `openAllLootboxes` sequential loop — 50 kutu = 50 ayrı transaction.
**Atlas M0 limiti:** 5 saniye transaction timeout.
**Risk:** Toplu kutu açma timeout'a düşebilir.
**Fix:** Toplu açma için tek transaction veya batch işleme.

### M0-02: `$runCommandRaw` PostgreSQL'de Hata

**Sorun:** `hunt.ts`'de MongoDB-specific komut kullanılıyor.
```typescript
prisma.$runCommandRaw({ update: 'Owl', ... })
  .catch(() => prisma.owl.update(...)) // Fallback var
```
**Etki:** Her hunt'ta hata logu üretiliyor (fallback çalışıyor ama gürültü var).
**Fix:** `$runCommandRaw` kaldır, direkt `prisma.owl.update` kullan.

### M0-03: Paralel DB Sorguları

**Sorun:** `hunt.ts`'de `Promise.all([bundle, owl, buffEffects])` — 3 paralel sorgu.
**Atlas M0'da:** Bağlantı havuzu küçük, paralel sorgular bağlantı tükenmesine yol açabilir.
**Mevcut durum:** Kabul edilebilir (3 sorgu), ama yük altında izlenmeli.

---

## 4. SCHEDULER GÜVENİLİRLİĞİ

### 4.1 Mevcut Scheduler'lar

| Scheduler | Frekans | Durum |
|---|---|---|
| Season rollover | Saatlik | ✅ Çalışıyor |
| Passive training XP | Saatlik | ✅ Çalışıyor |
| Orphan bot cleanup | Günlük | ✅ Çalışıyor |
| Market cleanup | 10 dakikada bir | ✅ Çalışıyor |
| **Maintenance** | **Günlük** | **❌ YOK** |

### 4.2 Scheduler Sorunları

**SORUN SC-01: Maintenance scheduler eksik**
- `dailyMaintenance()` hiç çağrılmıyor
- Baykuşlar hiç yıpranmıyor

**SORUN SC-02: Scheduler'lar process restart'ta sıfırlanıyor**
- `setInterval` process-local — restart sonrası zamanlama kayıyor
- Örnek: Sezon rollover saatlik çalışıyor ama restart sonrası 1 saat bekliyor
- Mevcut `setTimeout(() => checkSeasonRollover(), 5000)` başlangıç kontrolü var ✓
- Maintenance için de başlangıç kontrolü gerekli

**SORUN SC-03: Passive training XP ölçeklenmiyor**
- Tüm training baykuşlarını tek sorguda çekiyor
- 10.000 training baykuşu olursa → büyük sorgu + 10.000 ayrı XP güncellemesi
- Fix: Batch işleme (100'er gruplar halinde)

---

## 5. BELLEK VE ÖLÇEKLENME

### 5.1 In-Memory State

| Bileşen | Boyut | Risk |
|---|---|---|
| Buff cache (Map) | Oyuncu × kategori | Düşük (30s TTL) |
| Discord.js cache | Sınırlı (makeCache) | Düşük |
| BullMQ queue | Redis'te | Düşük |

### 5.2 Sharding

- `shard.ts` dosyası var — sharding desteği mevcut
- Buff cache process-local → shard'lar arası tutarsızlık olabilir
- Player cache Redis'te → shard'lar arası paylaşılıyor ✓

---

## 6. HATA YÖNETİMİ

### 6.1 İyi Yapılanlar

- `withLock` her kritik işlemde kullanılıyor ✓
- Transaction'lar doğru yerlerde kullanılıyor ✓
- Anti-spam middleware her komutta çalışıyor ✓
- Redis down → hata fırlatıyor (güvenlik öncelikli) ✓
- Graceful shutdown (SIGTERM/SIGINT) ✓

### 6.2 Eksikler

**SORUN H-01: Hata mesajları Türkçe/İngilizce karışık**
- Bazı hatalar Türkçe, bazıları İngilizce
- Oyuncu deneyimi tutarsız

**SORUN H-02: Console.error logları yapılandırılmamış**
- Tüm hatalar `console.error` ile loglanıyor
- Production'da log aggregation yok (Datadog, Sentry vb.)
- Hata takibi manuel

**SORUN H-03: Unknown interaction (10062) sessizce geçiyor**
- Bu doğru davranış ama loglanmıyor
- Yüksek frekansta olursa Discord token sorununu gizleyebilir

---

## 7. GENEL DEĞERLENDİRME

### Üretim İçin Hazır Olanlar ✅
- Temel hunt/tame/pvp döngüsü
- Anti-spam ve cooldown sistemi
- Redis lock mekanizması
- Market ve transfer sistemi
- Daily quest sistemi
- Lootbox sistemi
- Graceful shutdown

### Üretim İçin Hazır Olmayanlar ❌
- Trait sistemi (etkisiz)
- Biome giriş ücreti (çalışmıyor)
- Maintenance scheduler (eksik)
- DB Queue fallback (veri kaybı riski)
- XP multi-level-up (XP kaybı)
- Alt hesap farming koruması (yetersiz)

### Tavsiye

**Şu an için küçük/orta ölçekli bir sunucuda (< 500 aktif oyuncu) deploy edilebilir.**
Büyük ölçekli public release için P0 ve P1 sorunları çözülmeli.
