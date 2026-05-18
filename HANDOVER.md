# 🦉 BaykusBot - Gameplay Loop Handover Report (Kiro AI İçin)

Bu rapor, BaykusBot üzerinde yapılan kapsamlı "Gameplay Loop & Ekonomi" revizyonunun detaylarını, teknik altyapısını ve mevcut durumu özetler.

---

## 1. TASARIM VİZYONU VE CORE LOOP
Oyun, basit bir "avlan ve sat" modelinden, birbirine bağlı sistemlerin olduğu derin bir RPG döngüsüne dönüştürüldü:
**HUNT (Biomes) ➔ DISMANTLE ➔ CRAFT ➔ UPGRADE / BUFF ➔ PROGRESSION ➔ PRESTIGE ➔ GLOBAL SCALE**

---

## 2. EKLENEN ANA SİSTEMLER

### A) Biyom Sistemi (Strategic Hunting)
- **Mekanik:** Oyuncu artık `owl hunt` yaptığında 3 farklı bölgeden birini seçer:
    - **Kasaba Civarı (b0):** Ücretsiz, standart risk/ödül.
    - **Derin Orman (b1):** 100 💰 giriş, %15 daha zor yakalama, x2 Nadir hayvan şansı, x1.3 Materyal drop.
    - **Göl Kenarı (b2):** 50 💰 giriş, %15 daha kolay yakalama, %20 daha az nadir hayvan şansı.
- **Teknik:** `rollHunt` fonksiyonu `biomeId` parametresi alacak şekilde güncellendi.

### B) Crafting & Dismantle (Material Loop)
- **Dismantle:** Avlanan hayvanlar artık satılmak yerine materyallere dönüştürülebiliyor (Örn: Fare ➔ Kemik Tozu).
- **Crafting:** Toplanan materyaller ve coin ile yeni eşyalar üretiliyor:
    - **Besleyici Karma Yem:** Stamina yeniler (Yeni bir sink).
    - **Bileme Taşı:** Upgrade şansını artırır.
    - **Yırtıcı İksiri:** Yakalama şansını artırır.
- **Komutlar:** `owl craft`, `owl dismantle <esya> <miktar>`.

### C) Global Marketplace (Abuse Controlled)
- **Mekanik:** Oyuncular arası güvenli eşya ticareti.
- **Güvenlik Katmanları:**
    - **Level Gate:** En az Seviye 15 zorunluluğu.
    - **Tax:** Her satıştan %10 vergi kesilir (Coin sink).
    - **Daily Limit:** Günlük max 5 ilan verme sınırı.
    - **Price Corridor:** 50 - 100,000 💰 arası fiyat sınırlaması.
    - **Auto-Cleanup:** Süresi dolan (48sa) ilanlar otomatik silinir ve eşyalar satıcıya iade edilir.
- **Komutlar:** `owl market`, `owl market sat`, `owl market al`.

### D) Ascension / Prestige System
- **Mekanik:** Stat cap'ine (100) yaklaşan oyuncular baykuşlarını feda eder.
- **Gereksinim:** Oyuncu Lv.30+ ve Baykuş ortalama statı 80+.
- **Kazanımlar:**
    - Seviye 1'e döner, baykuş Kukumav'a resetlenir.
    - **Kalıcı Bonuslar:** Her prestige seviyesi başına +%5 Global XP ve +2 Efektif Stat Cap.
- **Teknik:** `statEffect` formülü ve `addXP` fonksiyonu `prestigeLevel` çarpanıyla entegre edildi.

### E) Daily Quests (Retention)
- **Mekanik:** Her gün otomatik atanan 4 görev:
    - 10 Hayvan Avla
    - 3 Eşya Craft Et
    - 1 Baykuş Evcilleştir
    - 2 Market İlanı Koy
- **Ödül:** Coin ve XP. `owl quests` ile takip edilir ve ödüller butonla toplanır.

---

## 3. TEKNİK ALTYAPI VE GÜVENLİK
- **Prisma Schema:** `MarketListing` ve `DailyQuest` modelleri eklendi. `Player` modeline prestige ve market sayaçları eklendi.
- **Race Condition:** Tüm işlemler `withLock` (Redis) ve `Prisma.$transaction` ile atomik hale getirildi. Özellikle Market ve Craft sistemlerinde duplication exploit'leri imkansızdır.
- **Logaritmik Scaling:** Prestige bonusları stat soft-cap formülüne yedirildi, böylece "runaway growth" (kontrolsüz güç artışı) engellendi.
- **Production-Ready:** Hata yönetimleri (failed transactions) ve expired listing cleanup lojikleri kuruldu.

---

## 4. ANALİZ DOKÜMANLARI (Mutlaka Okunmalı)
Proje kökünde Kiro AI'nın inceleyebileceği yeni dosyalar:
1.  **`SYSTEM_DESIGN.md`**: Genel mimari ve loop tasarımı.
2.  **`MARKET_AUDIT.md`**: Market suistimal analizleri.
3.  **`PACING_ANALYSIS.md`**: Oyuncu ilerleme hızı ve zorluk dengesi analizi.
4.  **`simulate_economy.ts`**: Ekonomik dengeyi test eden simülasyon scripti.

---

## 5. ŞU ANKİ DURUM VE GELECEK
- **Statü:** Core Loop (Hunt ➔ Craft ➔ Upgrade ➔ Prestige) tamamen çalışır ve entegre durumdadır.
- **Kiro AI İçin Not:** Yeni eklenecek "Raid" veya "Boss" sistemleri, mevcut `prestigeLevel` ve `crafting` bufflarını parametre olarak almalıdır. Market sistemi için ileride "ortalama fiyat takibi" (price history) eklenmesi manipülasyonu tamamen bitirebilir.

**Her şey hazır, derlenmiş (build) ve lint kontrollerinden geçmiştir.**
