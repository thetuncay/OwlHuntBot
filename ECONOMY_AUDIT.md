# ECONOMY_AUDIT.md — OwlHuntBot Ekonomi Denetimi

> Tarih: 2026-05-18 | Metodoloji: Config değerleri + sistem akışları doğrudan analiz edildi.

---

## 1. COIN KAYNAKLARI (ENFLASYON)

### 1.1 Aktif Kaynaklar

| Kaynak | Miktar | Frekans | Günlük Tahmini |
|---|---|---|---|
| Hunt (av satışı) | 5–120 coin/av | 7s cooldown | ~3.000–8.000 coin |
| PvP kazanma | Rakip coin'i | Değişken | Değişken |
| Daily Quest: hunt | 500 coin | Günde 1 | 500 coin |
| Daily Quest: craft | 800 coin | Günde 1 | 800 coin |
| Daily Quest: tame | 1.200 coin | Günde 1 | 1.200 coin |
| Daily Quest: market | 400 coin | Günde 1 | 400 coin |
| Gambling kazanma | Bahis × 1.9–2.5 | Değişken | Değişken |
| Auto-sink | 3 coin/item | Pasif | Düşük |

**Günlük aktif oyuncu coin üretimi (tahmini): ~6.000–12.000 coin**

### 1.2 Sorunlar

**SORUN E-01: Hunt coin üretimi çok yüksek, sink yetersiz**
- Severity: YÜKSEK
- 7 saniye cooldown ile saatte ~514 hunt mümkün (teorik max)
- Gerçekçi: saatte ~200 hunt = ~4.000–16.000 coin/saat
- Mevcut sinkler: upgrade maliyeti, market vergisi (%10), transfer vergisi (%3–12), repair (500 coin)
- Upgrade maliyeti `upgradeCoinCost()` fonksiyonuna bakılmalı — config'de sabit değer yok
- **Uzun vadede coin birikimi kaçınılmaz**

**SORUN E-02: Gambling net negatif değil — slot jackpot exploit**
- `SLOT_TABLE`'da `💎 Elmas Üçlüsü: %0.1 şans, 8x payout`
- Beklenen değer: 0.3×4 + 5×2 + 10×1.5 + 15×1.2 + 0.1×8 + 69.6×0 = 1.2 + 10 + 15 + 18 + 0.8 = 45.0
- Toplam şans: 0.3+5+10+15+0.1+69.6 = 100 ✓
- Beklenen değer: (0.3×4 + 5×2 + 10×1.5 + 15×1.2 + 0.1×8) / 100 = (1.2+10+15+18+0.8)/100 = 0.45
- **Slot beklenen değeri: 0.45 — yani her bahiste %55 kayıp. Bu doğru.**
- Coinflip: %49 kazanma, 1.95x payout → beklenen değer = 0.49×1.95 = 0.9555 → %4.45 house edge ✓
- Blackjack: Normal win 1.9x, BJ 2.5x — house edge hesaplanabilir ama strateji bağımlı

**SORUN E-03: Market vergisi tek yönlü — satıcı kaybediyor, alıcı kazanıyor**
- `MARKET_TAX_RATE = 0.10` — satıcıdan %10 kesilir
- Vergi yakılıyor (ekonomi sink) ✓
- Ancak alıcı tam fiyat ödüyor, satıcı %90 alıyor
- Bu standart bir market mekaniği, sorun değil

**SORUN E-04: Transfer günlük limit çok yüksek**
- `TRANSFER_DAILY_LIMIT = 10.000` coin/gün
- `TRANSFER_DAILY_RECEIVE_LIMIT = 15.000` coin/gün
- Alt hesap farming: Seviye 5 gereksinimi düşük
- Günde 10.000 coin transfer = ana hesaba ciddi kaynak aktarımı
- Vergi %3–12 arası — 10.000 coin transferde max 1.200 coin yakılıyor
- **Alt hesap farming vektörü mevcut**

---

## 2. COIN SİNKLERİ (DEFLASYON)

### 2.1 Aktif Sinkler

| Sink | Miktar | Etkinlik |
|---|---|---|
| Upgrade coin maliyeti | Değişken (stat bazlı) | Orta |
| Market vergisi | %10 | Orta |
| Transfer vergisi | %3–12 | Düşük |
| Repair | 500 coin | Düşük (maintenance çalışmıyor) |
| Biome giriş ücreti | 1.500–2.500 coin | **ÇALIŞMIYOR** |
| Crafting coin maliyeti | 100–1.000 coin | Düşük |
| Switch maliyeti | 1.000+ coin | Düşük |

### 2.2 Kritik Sink Sorunları

**SORUN E-05: Biome giriş ücreti tahsil edilmiyor**
- `BIOMES[1].entryCost = 2500` tanımlı
- `hunt.ts`'de biome modifier uygulanıyor ama giriş ücreti alınmıyor
- Bu en büyük tasarlanmış sink'in çalışmaması demek
- Günlük potansiyel sink: 2.500 × (aktif oyuncu sayısı) coin

**SORUN E-06: Maintenance sink çalışmıyor**
- `dailyMaintenance()` hiç çağrılmıyor
- `MAINTENANCE_DAILY_ITEM = 'Cig Et'` — bu item hunt'tan düşmüyor
- Oyuncular hiç bakım yapmak zorunda değil
- Effectiveness asla düşmüyor → repair hiç gerekmez → 500 coin sink çalışmıyor

**SORUN E-07: Auto-sink çok zayıf**
- `AUTO_SINK_COIN_PER_ITEM = 3` — item başına 3 coin
- Yüzlerce item birikiyor ama sink etkisi minimal

---

## 3. ITEM EKONOMİSİ

### 3.1 Item Kaynakları vs Tüketim

**Av hayvanları (fare, serce, vb.):**
- Kaynak: Hunt (her 7 saniyede birden fazla)
- Tüketim: Crafting (fare×20 + serce×10 = Yırtıcı İksiri), Dismantle, Market
- **Sorun: Crafting maliyetleri çok yüksek** — 20 fare + 10 serce + 1.000 coin = 1 Yırtıcı İksiri
- Yırtıcı İksiri'nin değeri: +15% catch chance, Rare rarity
- Bu makul görünüyor

**Upgrade materyalleri:**
- Kaynak: Hunt drop (Kemik Tozu %25, Parlak Tüy %20, vb.)
- Tüketim: Upgrade (2 adet/deneme, `upgradeMaterialRequirement()` ile ölçekleniyor)
- **Sorun: `upgradeMaterialRequirement()` fonksiyonu config'de değil, math.ts'de**
- Yüksek stat'larda materyal gereksinimi artıyor mu? Kontrol gerekli

### 3.2 Dismantle Karlılığı

Örnek: 1 fare → 1 Kemik Tozu
- Fare satış fiyatı: 5 coin
- Kemik Tozu market değeri: belirsiz (market fiyatı oyuncu belirliyor)
- Dismantle vs direkt satış: Dismantle daha karlı olabilir → av hayvanları market'te değersizleşir

**SORUN E-08: Dismantle arbitraj potansiyeli**
- Eğer Kemik Tozu market'te 50+ coin'e satılıyorsa, fare dismantling çok karlı
- Fare hunt'tan çok kolay düşüyor → sonsuz Kemik Tozu → market fiyatı çöker
- Uzun vadede materyal ekonomisi deflasyona girer

---

## 4. DOMINANT STRATEJİLER

### 4.1 Optimal Oyun Yolu (Mevcut Durumda)

1. **Spam hunt** (7s cooldown, minimum guarantee var) → sonsuz av hayvanı
2. **Biome'a gir** (ücretsiz, %30 loot bonus) → daha fazla materyal
3. **Dismantle** av hayvanlarını → upgrade materyali
4. **Upgrade** stat'ları → daha iyi hunt
5. **Daily quest** tamamla → 2.900 coin/gün bonus
6. **Market'e sat** fazla materyalleri → coin
7. **Prestige** yap → +5% XP bonus, stat cap artışı

**Bu döngü çok verimli ve exploit'e açık:**
- Biome ücretsiz → tasarlanmış sink çalışmıyor
- Maintenance yok → baykuş hiç yıpranmıyor
- Trait'ler etkisiz → God Roll baykuş ile Trash baykuş aynı performans

### 4.2 Alt Hesap Farming

**Senaryo:**
1. Alt hesap oluştur (level 5 gereksinimi = ~1 saat)
2. Ana hesaptan 10.000 coin transfer et (günlük limit)
3. Alt hesap market'e ucuz item koy, ana hesap satın alsın (vergi %10 = 1.000 coin kayıp)
4. Veya direkt transfer (vergi %3–12)

**Etkinlik:** Orta — vergi var ama yeterince caydırıcı değil

---

## 5. UZUN VADELİ SÜRDÜRÜLEBİLİRLİK

### 5.1 Enflasyon Projeksiyonu

| Zaman | Durum |
|---|---|
| İlk hafta | Normal, oyuncular harcıyor |
| 1 ay | Aktif oyuncular 50.000+ coin biriktiriyor |
| 3 ay | Market fiyatları şişiyor, yeni oyuncular dezavantajlı |
| 6 ay | Ekonomi çökmüş, eski oyuncular her şeye sahip |

**Temel sorun: Coin üretimi > Coin tüketimi**

### 5.2 Önerilen Acil Sinkler

1. **Biome giriş ücretini aktifleştir** (P0)
2. **Maintenance scheduler'ı ekle** (P1)
3. **Transfer günlük limitini düşür** (5.000 coin) (P1)
4. **Upgrade coin maliyetini artır** (P2)
5. **Prestige maliyeti ekle** (coin sink) (P2)

---

## 6. MARKET MANİPÜLASYON RİSKLERİ

**SORUN E-09: Fiyat manipülasyonu**
- `MARKET_MAX_PRICE = 100.000` — çok yüksek
- Bir oyuncu tüm stoku satın alıp yüksek fiyata satabilir (corner the market)
- Günlük 5 ilan limiti bunu kısmen engelliyor ama yeterli değil

**SORUN E-10: Market listing ID tahmin edilebilir**
- `l.id.split('-')[0]` ile kısaltılmış ID gösteriliyor
- UUID'nin ilk 8 karakteri — brute force ile başka ilanlar bulunabilir
- Pratik risk düşük ama var

**SORUN E-11: Market'te av hayvanı satışı ekonomiyi bozuyor**
- Av hayvanları (fare, serce) market'te satılabiliyor
- Yüksek seviye oyuncular düşük fiyata satarsa yeni oyuncular crafting materyali satın alabilir
- Bu aslında iyi bir özellik ama fiyat tabanı oluşturmak zor
