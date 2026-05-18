# PUBLIC_RELEASE_CHECKLIST.md — OwlHuntBot Yayın Kontrol Listesi

> Tarih: 2026-05-18 | Acımasız dürüstlük modu aktif.

---

## GENEL DEĞERLENDİRME

**Şu anki durum: KÜÇÜK SUNUCU İÇİN DEPLOY EDİLEBİLİR, BÜYÜK PUBLIC RELEASE İÇİN HAZIR DEĞİL**

Temel oyun döngüsü çalışıyor. Ancak trait sistemi etkisiz, biome ücreti alınmıyor, maintenance çalışmıyor ve ekonomi uzun vadede çöker. Bunlar düzeltilmeden büyük bir sunucuya açmak ekonomiyi mahveder.

---

## P0 — KRİTİK BLOKERLAR (Deploy öncesi zorunlu)

- [ ] **DB Queue veri kaybı fix** — `enqueueDbWrite` fallback ekle
- [ ] **XP multi-level-up fix** — `while` döngüsü ile birden fazla level atlama
- [ ] **Biome giriş ücreti aktifleştir** — `entryCost` tahsilatı + session yönetimi
- [ ] **`$runCommandRaw` kaldır** — PostgreSQL'de her hunt'ta hata logu üretiyor

---

## P1 — EKONOMİ KILICI SORUNLAR (İlk haftada düzeltilmeli)

- [ ] **Maintenance scheduler ekle** — günlük `dailyMaintenance()` çağrısı
- [ ] **Transfer günlük limitini düşür** — 10.000 → 3.000 coin
- [ ] **Transfer minimum level artır** — 5 → 15
- [ ] **Trait sistemi uygula** — `applyTraitEffects()` hunt/pvp/tame'e entegre et
- [ ] **Upgrade coin maliyetini doğrula** — `upgradeCoinCost()` değerleri yeterli mi?

---

## P2 — EXPLOIT / GÜVENLİK (İlk ay düzeltilmeli)

- [ ] **Admin komutları guild/role kontrolü** — `admin-testtame.ts` production'da güvenli mi?
- [ ] **Market ID kısaltması** — `startsWith` araması collision riski
- [ ] **Transfer cooldown race condition** — lock içine al
- [ ] **Lootbox toplu açma N+1** — batch transaction
- [ ] **Alt hesap farming** — daha güçlü anti-abuse

---

## P3 — RETENTION / GAMEPLAY (İlk 3 ayda)

- [ ] **Biome session UI** — oyuncu hangi biome'da olduğunu görmeli
- [ ] **Crafting içerik genişletme** — 3 tarif çok az
- [ ] **Prestige maliyeti** — coin sink ekle
- [ ] **Passive training XP artır** — saatte 5 XP anlamsız
- [ ] **Trait görsel feedback** — trait etkisi aktif olduğunda göster

---

## P4 — POLİSH / REFACTOR (Uzun vadede)

- [ ] **Hata mesajları dil tutarlılığı** — Türkçe veya İngilizce, ikisi birden değil
- [ ] **Log aggregation** — Sentry veya benzeri
- [ ] **`$runCommandRaw` temizliği** — MongoDB kalıntıları
- [ ] **Kullanılmayan importlar** — `index.ts`'deki 4 unused import
- [ ] **`tame-test.ts` production'dan çıkar**
- [ ] **Property testleri genişlet** — sadece `hpBar` test edilmiş

---

## GAMEPLAY DÖNGÜSÜ KONTROL LİSTESİ

- [x] Yeni oyuncu başlayabiliyor (onboarding)
- [x] Hunt çalışıyor
- [x] Av hayvanları envantere giriyor
- [x] Upgrade çalışıyor
- [x] Tame çalışıyor
- [x] Daily quest tamamlanabiliyor
- [x] Market'te alım/satım yapılabiliyor
- [x] PvP çalışıyor
- [x] Lootbox açılabiliyor
- [x] Buff aktifleştirilebiliyor
- [x] Prestige yapılabiliyor
- [ ] Trait etkileri hissediliyor ❌
- [ ] Biome seçimi anlamlı ❌
- [ ] Baykuş bakımı gerekiyor ❌

---

## EKONOMİ KONTROL LİSTESİ

- [x] Coin kaynakları var
- [x] Market vergisi çalışıyor
- [x] Transfer vergisi çalışıyor
- [ ] Biome giriş ücreti çalışıyor ❌
- [ ] Maintenance sink çalışıyor ❌
- [ ] Uzun vadede coin birikimi kontrol altında ❌
- [ ] Alt hesap farming önlendi ❌

---

## ÜRETİM HAZIRLIĞI KONTROL LİSTESİ

- [x] Anti-spam middleware aktif
- [x] Cooldown sistemi çalışıyor
- [x] Redis lock mekanizması var
- [x] Graceful shutdown var
- [x] Market expired cleanup çalışıyor
- [x] Orphan bot cleanup çalışıyor
- [x] Season rollover çalışıyor
- [ ] DB Queue veri kaybı fix ❌
- [ ] XP multi-level-up fix ❌
- [ ] Maintenance scheduler ❌
- [ ] Log aggregation ❌

---

## SONUÇ

**Deploy et mi?**

| Senaryo | Tavsiye |
|---|---|
| Kendi sunucun, < 50 oyuncu | ✅ Deploy edebilirsin |
| Orta ölçekli sunucu, 50–500 oyuncu | ⚠️ P0 sorunlarını çöz, sonra deploy et |
| Büyük public release, 500+ oyuncu | ❌ P0 + P1 sorunlarını çöz, sonra deploy et |

**En kritik 3 şey:**
1. Trait sistemi çalışmıyor — oyuncular aldatılmış hisseder
2. Biome ücreti alınmıyor — ekonomi dengesizliği
3. DB Queue fallback yok — veri kaybı riski
