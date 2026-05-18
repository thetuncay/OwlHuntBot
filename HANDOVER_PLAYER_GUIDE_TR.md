# 🦉 OwlHuntBot — Tam Oyuncu Kılavuzu

> Bu kılavuz gerçek kaynak kodundan üretilmiştir. Tüm komut adları, item isimleri ve mekanikler doğrudan koddan alınmıştır.

---

## 1. Oyun Nedir?

OwlHuntBot, Discord üzerinde oynanan bir **baykuş terbiyecisi RPG**'sidir. Oyunun temel fikri şudur: bir baykuşa sahip olursun, onu avlanmaya gönderirsin, güçlendirirsin, yeni baykuşlar evcilleştirirsin ve diğer oyuncularla rekabet edersin.

### Gameplay Loop (Oyun Döngüsü)

```
Hunt (Av) → Av hayvanı / Materyal kazan
     ↓
Sell (Sat) → Coin kazan
     ↓
Upgrade → Baykuşunu güçlendir
     ↓
Tame (Evcilleştir) → Yeni baykuş kazan
     ↓
Prestige → Kalıcı bonus kazan, sıfırdan başla
     ↓
(Döngü tekrar)
```

Bunların yanında:
- **PvP** ile diğer oyuncularla dövüşebilirsin
- **Market** üzerinden item alıp satabilirsin
- **Crafting** ile materyal birleştirip yeni item üretebilirsin
- **Daily Quest** ile günlük görevleri tamamlayıp bonus kazanabilirsin
- **Lootbox** açarak geçici güç artışı sağlayan buff item'ları kazanabilirsin

### Amaç Ne?

Kısa vadede: Baykuşunu güçlendirmek, coin biriktirmek, liderboard'a girmek.

Uzun vadede: Prestige yaparak kalıcı bonuslar kazanmak ve en güçlü baykuşa sahip olmak.

### Endgame Nedir?

- Tüm stat'ları maksimuma yakın bir baykuş
- Birden fazla prestige seviyesi (+%5 XP ve +2 stat cap her seviye)
- Liderboard'da üst sıralarda yer almak
- God Roll kalitesinde nadir baykuşlara sahip olmak

---

Bölüm 1 hazır. Devam edeyim mi? (Bölüm 2: Başlangıç Rehberi)

---

## 2. Başlangıç Rehberi

### İlk Yapılacaklar

Oyuna ilk girdiğinde bir kayıt butonu göreceksin. Buna tıklayarak hesabını oluşturursun. Kayıt olmadan hiçbir komut çalışmaz.

Kayıt sonrası sana otomatik olarak bir başlangıç baykuşu verilir: **Kukumav baykusu** (Tier 8, Common kalite). Bu baykuş zayıftır ama başlamak için yeterlidir.

### İlk Komutlar (Sırayla Yap)

**1. Baykuşunu gör:**
```
owl stats
```
Baykuşunun stat'larını, HP'sini ve trait'lerini gösterir.

**2. İlk avını yap:**
```
owl hunt
```
Sana bir biyom seçim menüsü çıkar. Başlangıçta **Kasaba Civarı** seç — ücretsizdir. 30 dakika boyunca bu biyomda kalırsın ve istediğin kadar hunt atabilirsin. Cooldown: **7 saniye**.

**3. Avladıklarını sat:**
```
owl sell
```
Tüm av hayvanlarını satar. Tek bir hayvan satmak için: `owl sell fare`

**4. Bakiyeni kontrol et:**
```
owl cash
```

**5. Envanterini gör:**
```
owl inventory
```

**6. Günlük görevleri kontrol et:**
```
owl quests
```
Her gün 4 görev gelir. Tamamlayınca coin + XP kazanırsın.

### İlk Para Kazanma Yöntemleri

- **Hunt + Sell döngüsü:** En temel yöntem. 7 saniyede bir hunt at, avları sat.
- **Daily Quest:** Günde ~2.900 coin bonus (4 görevi tamamlarsan).
- **Dismantle:** Av hayvanlarını parçalayarak upgrade materyali üret, markette sat.

### Başlangıç Hataları

❌ **Hemen upgrade yapmaya çalışmak** — Önce coin biriktir, upgrade malzeme gerektirir.

❌ **Biome giriş ücretini görmezden gelmek** — Derin Orman'a girmek 2.500 coin ister. Başlangıçta Kasaba Civarı'nda kal.

❌ **Prestige'i erken yapmak** — Prestige için Lv.30 ve baykuş ort. stat 80+ gerekir. Acele etme.

❌ **Tüm materyalleri satmak** — Upgrade için Kemik Tozu, Parlak Tüy gibi materyaller gerekir. Bir kısmını sakla.

❌ **Gambling'e coin harcamak** — Blackjack, coinflip ve slot uzun vadede kaybettirir. Başlangıçta uzak dur.

### Yeni Oyuncular İçin Öneriler

- İlk hedefin: **Lv.10** olmak ve **Göl Kenarı** biyomuna geçmek (min. Lv.5, 1.500 coin giriş).
- Günlük görevleri her gün tamamla — ücretsiz coin ve XP.
- `owl upgrade` yazmadan önce bağımlılık sistemini anla (Bölüm 11'de detaylı).
- `owl owls` ile tüm baykuşlarını listele, en iyi olanı main yap.

---

Bölüm 2 hazır. Devam edeyim mi? (Bölüm 3: Tüm Komutlar)

---

## 3. Tüm Komutlar

> Prefix komutları `owl <komut>` formatında çalışır. Sunucuya özel prefix ayarlanmışsa onu kullan.
> Slash komutları `/owl <komut>` formatındadır.
> Kısaltmalar da çalışır: `owl h` = `owl hunt`, `owl s` = `owl stats` vb.

---

### 🌿 Av & Baykuş Komutları

| Komut | Kısaltma | Açıklama | Cooldown |
|---|---|---|---|
| `owl hunt` | `owl h` | Baykuşunu avlanmaya gönder | 7 saniye |
| `owl tame <encounterID>` | `owl t <id>` | Yabani baykuşu evcilleştir | — |
| `owl stats` | `owl s` | Baykuş istatistiklerini gör | — |
| `owl stats deep` | — | Formül detaylarıyla stats | — |
| `owl owls` | — | Tüm baykuşlarını listele | — |
| `owl setmain <baykuşID>` | `owl sm <id>` | Main baykuşu değiştir | — |
| `owl upgrade <stat>` | `owl up <stat>` | Stat geliştir (gaga/goz/kulak/kanat/pence) | Başarı: 5dk, Başarısız: 1dk |
| `owl sell` | — | Tüm av hayvanlarını sat | — |
| `owl sell <hayvan>` | — | Belirli bir hayvanı sat | — |
| `owl zoo` | `owl z` | Hayvanat bahçeni gör (av envanteri) | — |
| `owl inventory` | `owl inv` | Tüm envanterini gör | — |

**Notlar:**
- `owl hunt` ilk kullanımda biyom seçim menüsü açar. Seçim 30 saniye geçerlidir.
- `owl hunt çık` yazarak aktif biyomdan çıkabilirsin.
- `owl tame` komutu için önce hunt sırasında bir encounter (yabani baykuş) tetiklenmesi gerekir.
- `owl upgrade` yazınca stat seçim paneli açılır, onay butonu ile devam edilir.

---

### ⚔️ PvP Komutları

| Komut | Kısaltma | Açıklama | Cooldown |
|---|---|---|---|
| `owl vs @oyuncu` | — | Gerçek oyuncuya meydan oku | — |
| `owl duel` | `owl d` | Bot ile hızlı duel yap | 7 saniye |

**Notlar:**
- `owl vs` ile gönderilen davet 60 saniye geçerlidir. Karşı taraf kabul, reddet veya iptal edebilir.
- `owl duel` bot ile simüle edilmiş bir dövüştür. Gerçek oyuncu gerekmez.
- PvP sırasında aynı anda başka bir PvP başlatamazsın.

---

### 🎲 Kumar Komutları

| Komut | Açıklama | Cooldown |
|---|---|---|
| `owl bj <miktar>` | Blackjack oyna | 5 saniye |
| `owl cf <miktar>` | Yazı tura (coinflip) | 5 saniye |
| `owl slot <miktar>` | Slot makinesi | 5 saniye |

**Notlar:**
- Coinflip kazanma şansı: **%49**, payout: **1.95x**
- Blackjack normal kazanma: **1.9x**, doğal 21 (blackjack): **2.5x**
- Slot jackpot: **%0.3 şans, 4x payout** — Elmas üçlüsü: **%0.1 şans, 8x payout**
- ⚠️ Uzun vadede tüm kumar oyunları kaybettirir. Dikkatli kullan.

---

### 💰 Ekonomi & Görev Komutları

| Komut | Kısaltma | Açıklama |
|---|---|---|
| `owl cash` | `owl c` | Mevcut coin bakiyeni gör |
| `owl ver @kullanıcı <miktar>` | — | Birine coin gönder |
| `owl quests` | `owl q` | Günlük görevleri gör ve ödül al |
| `owl prestige <baykuşID>` | — | Baykuşu feda et, kalıcı bonus kazan |
| `owl lb` | — | Liderboard sıralamalarını gör |

**Notlar:**
- `owl ver` için minimum Lv.15 gerekir. Günlük limit: **3.000 coin**.
- `owl prestige` için Lv.30+ ve baykuş ort. stat 80+ gerekir.

---

### 🎒 Eşya, Crafting & Market Komutları

| Komut | Açıklama |
|---|---|
| `owl craft` | Crafting menüsünü aç |
| `owl craft <no>` | Belirli tarifi üret (1, 2, 3) |
| `owl dismantle <eşya> [miktar]` | Eşyayı parçala, materyal kazan |
| `owl market` | Global marketi listele |
| `owl market sat <eşya> <miktar> <fiyat>` | Markete eşya koy |
| `owl market al <ilanID>` | Marketten eşya satın al |
| `owl sk` | 1 Silah Kutusu aç |
| `owl sk all` | Tüm Silah Kutularını aç |
| `owl ek` | 1 Eşya Kutusu aç |
| `owl ek all` | Tüm Eşya Kutularını aç |
| `owl aç` | Kutu envanterini gör |
| `owl buff` | Aktif buff item'larını gör |
| `owl buff <item adı>` | Buff item aktifleştir |
| `owl buffs` | Tüm buff rehberini gör |
| `owl buffs hunt` | Sadece av buff'larını gör |
| `owl buffs upgrade` | Sadece upgrade buff'larını gör |
| `owl buffs pvp` | Sadece PvP buff'larını gör |

---

### ⚙️ Yönetici & Ayar Komutları

| Komut | Açıklama | Yetki |
|---|---|---|
| `owl prefix <değer>` | Sunucu prefix'ini değiştir | Yönetici |
| `/owl prefix <değer>` | Slash ile prefix değiştir | Yönetici |

**Not:** Prefix 1-16 karakter, sadece harf ve rakam içerebilir. Örnek: `w`, `baykus`, `oyun`.

---

Bölüm 3 hazır. Devam edeyim mi? (Bölüm 4: Hunt Sistemi — detaylı)

---

## 4. Hunt Sistemi

### Nasıl Çalışır?

`owl hunt` komutunu her kullandığında baykuşun bir av turu yapar. Her turda birden fazla av denemesi yapılır — kaç deneme yapılacağı seviyene göre belirlenir:

```
Deneme sayısı = 3 + floor(seviye / 5)
```

Örnek: Lv.10 → 5 deneme, Lv.20 → 7 deneme.

Her denemede rastgele bir av hayvanı seçilir ve yakalama şansı hesaplanır.

---

### Av Hayvanları ve Zorluk Seviyeleri

| Hayvan | Zorluk | Temel Şans | XP | Satış Fiyatı |
|---|---|---|---|---|
| fare | 1 | %90 | 5 | 5 💰 |
| serce | 2 | %85 | 6 | 8 💰 |
| kurbaga | 2 | %80 | 6 | 8 💰 |
| kertenkele | 3 | %75 | 7 | 12 💰 |
| hamster | 3 | %75 | 7 | 12 💰 |
| kostebek | 4 | %70 | 8 | 18 💰 |
| yarasa | 4 | %65 | 9 | 20 💰 |
| bildircin | 5 | %60 | 10 | 28 💰 |
| guvercin | 5 | %60 | 10 | 28 💰 |
| yilan | 6 | %50 | 12 | 40 💰 |
| sincap | 6 | %50 | 12 | 40 💰 |
| tavsan | 7 | %40 | 15 | 65 💰 |
| gelincik | 8 | %30 | 18 | 90 💰 |
| kirpi | 9 | %25 | 20 | 120 💰 |

Baykuşunun tier'i hangi havuzdan av seçileceğini belirler. Tier 8 (Kukumav) sadece zorluk 1-4 arası avlayabilir. Tier 1 (Blakiston) tüm havuza erişir.

---

### Yakalama Şansı Nasıl Hesaplanır?

Temel formül:

```
finalChance = (baseChance × powerMult / 100)
            + (pence × 0.25) / 100
            + (goz × 0.15) / 100
            + (kanat × 0.20) / 100
            + bondBonus
            + levelBonus
            + streakBonus
            + pityBonus
            + buffBonus
            × biomeModifier
            × traitCatchMult
```

**Clamp:** Minimum %5, maksimum %95 — hiçbir zaman imkânsız veya garantili değil.

**Stat katkıları:**
- **Pence** en güçlü stat: pence=50 → +%12.5 catch
- **Kanat:** kanat=50 → +%10 catch
- **Göz:** goz=50 → +%7.5 catch

---

### Gizli Modifier'lar (Oyuncuya Gösterilmez)

**Level Bonus:** Her seviye +%0.3 catch, maksimum +%12.
**Streak Bonus:** Ardışık başarılı hunt'larda +%5/hunt, maksimum +%20.
**Pity Bonus:** 8 hunt'ta nadir hayvan çıkmazsa devreye girer. Her hunt +%4, maksimum +%25.

---

### Minimum Garanti

Hiç yakalama olmasa bile en düşük zorluktan (fare/serce) 1 hayvan garantilenir. Bu garanti streak sayacını etkilemez.

---

### Kritik Av ve Yaralanma

- **Kritik av:** %10 şans. XP 2 katına çıkar, item drop şansı 1.5x artar.
- **Yaralanma:** Başarısız avda %5 şans. Baykuşun HP'si düşer, az miktarda XP kazanırsın.

---

### XP Sistemi

```
Toplam XP = (başarılı av XP'leri)
           + (yaralanma XP × 0.45)
           + comboBonus
           + multiBonus
           × traitXpMult
           × prestigeBonus
```

**Combo Bonus:** 3+ streak → +10 XP, 5+ streak → +25 XP.
**Multi Bonus:** Aynı turda 2 yakalama → +5 XP, 3+ → +12 XP, 5+ → +25 XP.
**Prestige Bonus:** Her prestige seviyesi +%5 XP.

---

### Item Drop Sistemi

Her başarılı avda upgrade materyali düşme şansı vardır:

| Materyal | Rarity | Drop Şansı | Min. Zorluk |
|---|---|---|---|
| Kemik Tozu | Common | %25 | 1 |
| Parlak Tüy | Common | %20 | 2 |
| Kırık Av Zinciri | Uncommon | %15 | 3 |
| Av Gözü Kristali | Uncommon | %12 | 4 |
| Yırtıcı Pençe Parçası | Rare | %10 | 4 |
| Sessizlik Teli | Uncommon | %10 | 3 |
| Orman Yankısı | Rare | %6 | 6 |
| Gölge Tüyü | Rare | %5 | 7 |

Kritik avda tüm drop şansları **1.5x** artar. Aktif loot buff'u varsa ek çarpan uygulanır.

---

### Lootbox Drop

Her hunt'ta küçük bir şansla kutu düşer:
- **Eşya Kutusu:** %5 şans
- **Silah Kutusu:** %2 şans

Kritik avda bu şanslar **2x** artar. Günlük maksimum **5 kutu** düşebilir (anti-farm koruması).

---

Bölüm 4 hazır. Devam edeyim mi? (Bölüm 5: Biome Sistemi)

---

## 5. Biome Sistemi

### Nasıl Çalışır?

`owl hunt` komutunu ilk kullandığında bir **biyom seçim menüsü** açılır. Seçtiğin biyomda **30 dakika** kalırsın. Bu süre içinde istediğin kadar hunt atabilirsin — her hunt için tekrar ücret ödemezsin.

Biyomdan çıkmak için:
- `owl hunt çık` yaz
- Veya 30 dakika dolmasını bekle (otomatik çıkış)

Biyom değiştirmek istersen önce çıkman, sonra tekrar `owl hunt` yazman gerekir.

---

### Biyomlar

#### 🏘️ Kasaba Civarı (b0)
| Özellik | Değer |
|---|---|
| Giriş Ücreti | **Ücretsiz** |
| Min. Seviye | 1 |
| Yakalama Şansı | Normal (×1.0) |
| Materyal Drop | Normal (×1.0) |
| Nadir Hayvan Şansı | Normal (×1.0) |

**Ne zaman kullanılır?** Başlangıçta ve coin biriktirirken. Risk yok, standart ödül.

---

#### 🌊 Göl Kenarı (b2)
| Özellik | Değer |
|---|---|
| Giriş Ücreti | **1.500 coin** (tek seferlik, 30 dk) |
| Min. Seviye | 5 |
| Yakalama Şansı | **+%15** (×1.15) |
| Materyal Drop | Normal (×1.0) |
| Nadir Hayvan Şansı | **-%20** (×0.8) |

**Ne zaman kullanılır?** Av hayvanı toplamak ve coin kazanmak istediğinde. Yakalama şansı yüksek olduğu için daha fazla hayvan düşer ama nadir hayvan şansı düşüktür.

**Maliyet analizi:** 30 dakikada ~200 hunt → ~6.500 coin kazanç tahmini. Giriş ücreti %23 oranında geri alınır.

---

#### 🌲 Derin Orman (b1)
| Özellik | Değer |
|---|---|
| Giriş Ücreti | **2.500 coin** (tek seferlik, 30 dk) |
| Min. Seviye | 10 |
| Yakalama Şansı | **-%15** (×0.85) |
| Materyal Drop | **+%30** (×1.3) |
| Nadir Hayvan Şansı | **×2.0** |

**Ne zaman kullanılır?** Upgrade materyali toplamak veya nadir hayvan (tavşan, gelincik, kirpi) avlamak istediğinde. Yakalama şansı düşük olduğu için daha fazla kaçış yaşanır ama düşen materyaller ve nadir hayvanlar bunu telafi eder.

**Maliyet analizi:** 30 dakikada ~7.500 coin kazanç tahmini. Giriş ücreti %33 oranında geri alınır. Materyal değeri hesaba katılırsa en karlı biyom.

---

### Biyom Seçim Stratejisi

| Durum | Önerilen Biyom |
|---|---|
| Yeni oyuncu (Lv.1-4) | 🏘️ Kasaba Civarı |
| Coin kasma (Lv.5+) | 🌊 Göl Kenarı |
| Materyal kasma (Lv.10+) | 🌲 Derin Orman |
| Nadir hayvan avı (Lv.10+) | 🌲 Derin Orman |
| Günlük quest tamamlama | 🌊 Göl Kenarı (daha kolay yakalama) |

---

### Önemli Notlar

- Giriş ücreti **30 dakikalık oturum için bir kez** ödenir. Aynı biyomda kaldığın sürece tekrar ödeme yapmazsın.
- Biyom değiştirirsen yeni giriş ücreti ödersin.
- Aktif biyomun ve kalan süren `owl hunt` komutunda gösterilir.
- Lv.5 altındaysan Göl Kenarı'na, Lv.10 altındaysan Derin Orman'a giremezsin.

---

Bölüm 5 hazır. Devam edeyim mi? (Bölüm 6: Baykuş Sistemi — stat'lar, trait'ler, God Roll)

---

## 6. Baykuş Sistemi

### Baykuş Türleri ve Tier'lar

Oyunda 8 baykuş türü vardır. Tier 1 en güçlü, Tier 8 en zayıftır. Yüksek tier baykuşlar daha yüksek stat aralıklarına sahiptir ve daha geniş av havuzuna erişir.

| Tür | Tier | Güç Çarpanı | Min. Oyuncu Seviyesi |
|---|---|---|---|
| Blakiston balık baykusu | 1 | ×1.5 | 40 |
| Puhu baykusu | 2 | ×1.35 | 30 |
| Kar baykusu | 3 | ×1.2 | 25 |
| Boynuzlu baykuş | 4 | ×1.1 | 20 |
| Büyük boz baykuş | 5 | ×1.0 | 15 |
| Ural baykusu | 6 | ×0.9 | 10 |
| Peçeli baykuş | 7 | ×0.8 | 5 |
| Kukumav baykusu | 8 | ×0.7 | 1 |

Başlangıç baykuşun Kukumav'dır (Tier 8). Daha güçlü türleri evcilleştirmek için hem oyuncu seviyesi hem de encounter şansı gerekir.

---

### Baykuş Stat'ları

Her baykuşun 5 stat'ı vardır:

| Stat | Etkisi |
|---|---|
| **Gaga** | PvP hasarını etkiler |
| **Göz** | Encounter şansını ve yakalama şansını etkiler |
| **Kulak** | Encounter şansını ve tame şansını etkiler |
| **Kanat** | Yakalama şansını etkiler |
| **Pence** | Yakalama şansını en çok etkiler (en önemli av stat'ı) |

**Soft Cap Sistemi:** Stat'lar doğrusal değil, logaritmik etki yapar. Formül:
```
statEffect = (stat + prestigeBonus) × 70 / (stat + prestigeBonus + 30)
```
Stat 100'de bile etki %70'i geçemez. Bu yüzden tek bir stat'ı maksimuma çıkarmak yerine dengeli geliştirmek daha verimlidir.

---

### Kalite (Quality) Sistemi

Baykuşun kalitesi 5 stat'ının toplamına göre belirlenir:

| Kalite | Puan Aralığı | Renk |
|---|---|---|
| Trash | < 140 | ⬛ |
| Common | 140–229 | ⬜ |
| Good | 230–309 | 🟩 |
| Rare | 310–374 | 🟦 |
| Elite | 375–439 | 🟪 |
| **God Roll** | 440+ | 🌟 |

God Roll baykuşlar en yüksek stat aralıklarına sahiptir ve nadir trait'lere daha kolay erişir.

---

### Trait Sistemi

Her baykuş doğduğunda **1 veya 2 trait** alır. Trait'ler baykuşun güçlü ve zayıf yönlerini belirler. Her trait'in bir **bonusu** ve bir **cezası** vardır.

**Trait sayısı:**
- Tier 1-3 baykuşlar: %65 ihtimalle 2 trait
- Tier 4-8 baykuşlar: %35 ihtimalle 2 trait

**Tüm Trait'ler:**

| Trait | Bonus | Ceza |
|---|---|---|
| 🎯 Keskin Göz | +%20 av ödülü | -%20 tame şansı |
| 🌙 Sessiz Kanat | +%18 yakalama şansı | -%15 PvP hasar |
| 🦇 Gece Avcısı | +%22 XP | +%25 cooldown (uzar) |
| ⚡ Hızlı Pençe | -%22 cooldown (kısalır) | -%18 av ödülü |
| 🔥 Saldırgan Ruh | +%22 PvP hasar | -%18 max HP |
| 🛡️ Demir Deri | +%25 max HP | -%22 PvP dodge |
| 💨 Kaçamak Ustası | +%25 PvP dodge | -%20 PvP hasar |
| 🔍 Meraklı Bakış | +%30 encounter şansı | -%25 stamina yenilenme |
| 🌿 Dingin Ruh | +%30 stamina yenilenme | -%25 encounter şansı |
| 🤝 Evcil Ruh | +%28 tame şansı | -%18 av ödülü |
| 📚 Deneyimli | +%18 XP | -%12 PvP hasar |
| 🪨 Ağır Kanat | +%20 max HP | +%20 cooldown (uzar) |
| 👂 Keskin Kulak | +%22 encounter şansı | -%15 XP |
| 💪 Yorulmaz | +%25 stamina yenilenme | -%18 tame şansı |
| 🏹 Usta Avcı | +%15 yakalama şansı | -%20 max HP |

**Önemli:** Trait etkileri gerçekten uygulanır. 🎯 Keskin Göz'e sahip bir baykuş avdan daha fazla coin/XP kazanır ama tame yapmak zorlaşır.

---

### En İyi Build'ler

**Av Odaklı Build:**
- Trait: 🌙 Sessiz Kanat + 🏹 Usta Avcı
- Öncelikli stat: Pence → Kanat → Göz
- Biyom: Göl Kenarı veya Derin Orman

**Tame Odaklı Build:**
- Trait: 🤝 Evcil Ruh + 🔍 Meraklı Bakış
- Öncelikli stat: Göz → Kulak → Pence
- Biyom: Derin Orman (nadir encounter şansı yüksek)

**PvP Odaklı Build:**
- Trait: 🔥 Saldırgan Ruh + 💨 Kaçamak Ustası
- Öncelikli stat: Gaga → Pence → Kanat

---

### Bond Sistemi

Her baykuşun bir **bond** değeri vardır (0-100). Bond arttıkça yakalama şansı artar:
- Her başarılı hunt: +0.5 bond
- PvP kazanma: +2 bond
- Tame başarısı: +5 bond

Bond 100'de maksimum +%20 yakalama bonusu sağlar.

---

Bölüm 6 hazır. Devam edeyim mi? (Bölüm 7: Eşya Sistemi — tüm item'lar)

---

## 7. Eşya Sistemi

### Eşya Kategorileri

Oyunda 5 ana eşya kategorisi vardır: **Av hayvanları**, **Upgrade materyalleri**, **Tame item'ları**, **Buff item'ları** ve **Lootbox'lar**.

---

### 🐾 Av Hayvanları

Hunt'tan düşer. Satılabilir veya dismantle edilebilir.

| Hayvan | Satış | Dismantle Çıktısı |
|---|---|---|
| fare | 5 💰 | Kemik Tozu ×1 |
| serce | 8 💰 | Parlak Tüy ×1 |
| kurbaga | 8 💰 | Kemik Tozu ×1-2 |
| kertenkele | 12 💰 | Kırık Av Zinciri ×1 |
| hamster | 12 💰 | Kemik Tozu ×2-3 |
| kostebek | 18 💰 | Av Gözü Kristali ×1 |
| yarasa | 20 💰 | Sessizlik Teli ×1-2 |
| bildircin | 28 💰 | Parlak Tüy ×3-5 |
| guvercin | 28 💰 | Parlak Tüy ×3-5 |
| yilan | 40 💰 | Yırtıcı Pençe Parçası ×1-2 |
| sincap | 40 💰 | Parlak Tüy ×5-8 |
| tavsan | 65 💰 | Yırtıcı Pençe Parçası ×2-3 |
| gelincik | 90 💰 | Orman Yankısı ×1 |
| kirpi | 120 💰 | Gölge Tüyü ×1 |

**Tavsiye:** Gelincik ve kirpi gibi nadir hayvanları dismantle etmek yerine sat — satış fiyatları yüksek.

---

### ⚒️ Upgrade Materyalleri

Hunt'tan drop olarak düşer. Upgrade için zorunludur.

| Materyal | Rarity | Kullanım Alanı | Drop Şansı |
|---|---|---|---|
| Kemik Tozu | Common | Gaga upgrade | %25 |
| Parlak Tüy | Common | Kanat upgrade | %20 |
| Kırık Av Zinciri | Uncommon | Kulak upgrade | %15 |
| Av Gözü Kristali | Uncommon | Göz upgrade | %12 |
| Yırtıcı Pençe Parçası | Rare | Pence upgrade | %10 |
| Sessizlik Teli | Uncommon | Kulak upgrade (ek bonus) | %10 |
| Orman Yankısı | Rare | Upgrade bonus item | %6 |
| Gölge Tüyü | Rare | Upgrade bonus item | %5 |
| Bileme Taşı | Uncommon | Gaga upgrade bonus (+%10 şans) | Craft ile üretilir |

**Upgrade başına gerekli materyal miktarı stat seviyesine göre artar:**
- Stat 1-19: ×2 materyal
- Stat 20-49: ×5 materyal
- Stat 50-79: ×10 materyal
- Stat 80+: ×20 materyal

---

### 🧪 Tame Item'ları

Tame şansını artırmak için kullanılır. `owl tame` sırasında item kullanılabilir.

| Item | Tame Bonus | Nasıl Elde Edilir |
|---|---|---|
| Çiğ Et | +5 | Market / Craft |
| Yırtıcı Yem | +8 | Market |
| Kan Kokusu | +10 | Market |
| Sessiz Yem | +6 | Market |
| Alfa Feromon | +12 | Market |
| Yırtıcı İksiri | +15 | Craft (fare×20 + serce×10 + 1.000💰) |

---

### ✨ Buff Item'ları

Lootbox'tan çıkar. Aktifleştirince belirli sayıda kullanım için etki sağlar.

**Hunt Buff'ları:**

| Item | Rarity | Etki | Charge |
|---|---|---|---|
| 🎯 Keskin Nişan | Common | +%25 yakalama şansı | 100 |
| 🌿 Av Kokusu | Common | +%90 item drop | 80 |
| 🔮 Nadir İz | Rare | +%35 nadir drop | 60 |
| 🌲 Orman Ruhu | Rare | +%20 yakalama & +%40 drop | 120 |
| ⭐ Yıldız Tüy | Epic | +%180 item drop | 40 |
| 🦅 Efsane Av Ruhu | Legendary | +%45 yakalama şansı | 25 |

**Upgrade Buff'ları:**

| Item | Rarity | Etki | Charge |
|---|---|---|---|
| 💡 Berrak Zihin | Common | +15 upgrade başarı puanı | 100 |
| 🛡️ Koruyucu Talisman | Rare | -%80 downgrade riski | 50 |
| 🔨 Usta Eli | Epic | +28 upgrade başarı puanı | 30 |

**PvP Buff'ları:**

| Item | Rarity | Etki | Charge |
|---|---|---|---|
| ⚔️ Savaş Ruhu | Common | +%18 PvP hasar | 80 |
| 🛡️ Savunma Duruşu | Rare | +%18 dodge şansı | 50 |
| 🏆 Arena Ustası | Epic | +%25 hasar & +%15 dodge | 25 |

**Diminishing Returns:** Aynı türden birden fazla buff aktifleştirirsen etki azalır:
- 1. buff → %100 etki
- 2. buff → %60 etki
- 3. buff → %30 etki (maksimum 3 aynı tür)

---

### 📦 Lootbox'lar

Hunt, PvP ve encounter'dan otomatik düşer. Satın alınamaz.

| Kutu | Komut | İçerik | Pity Eşiği |
|---|---|---|---|
| 🗡️ Silah Kutusu | `owl sk` | PvP buff item'ları | 6 kutu |
| 📦 Eşya Kutusu | `owl ek` | Hunt & Upgrade buff item'ları | 8 kutu |

**Pity Sistemi:** X kutu açmadan Rare+ çıkmazsa bir sonraki açılışta Rare veya üstü garanti gelir.

**Rarity Dağılımı (Silah Kutusu):**
- Common: %60
- Rare: %30
- Epic: %9
- Legendary: %1

**Rarity Dağılımı (Eşya Kutusu):**
- Common: %65
- Rare: %28
- Epic: %6
- Legendary: %1

---

Bölüm 7 hazır. Devam edeyim mi? (Bölüm 8: Crafting Sistemi)

---

## 8. Crafting Sistemi

### Nasıl Çalışır?

```
owl craft          → Tarif listesini göster
owl craft <no>     → Belirli tarifi üret (1, 2 veya 3)
/owl craft         → Slash ile butonlu menü
```

Craft yapmak için gerekli materyaller ve coin envanterinde olmalıdır. Eksik malzeme varsa hata verir.

---

### Mevcut Tarifler

#### 1. 🌾 Besleyici Karma Yem
| Alan | Değer |
|---|---|
| Gereksinim | fare ×5, serce ×2, 100 💰 |
| Çıktı | Karma Yem ×1 (Consumable, Common) |
| Kullanım | Baykuşun staminasını yeniler (+50 stamina) |

**Değerlendirme:** fare ve serce satmak yerine craft etmek daha az coin getirir. Stamina kritikse kullanışlı, değilse satmak daha karlı.

---

#### 2. 🪨 Gelişmiş Gaga Bileme Taşı
| Alan | Değer |
|---|---|
| Gereksinim | Kemik Tozu ×10, Parlak Tüy ×5, 500 💰 |
| Çıktı | Bileme Taşı ×1 (Buff, Uncommon) |
| Kullanım | Gaga upgrade başarı şansını +%10 artırır |

**Değerlendirme:** Upgrade başarı şansını artırmak için en erişilebilir yol. Kemik Tozu ve Parlak Tüy bolsa üretmeye değer. Markette de satılabilir.

---

#### 3. 🧪 Yırtıcı İksiri
| Alan | Değer |
|---|---|
| Gereksinim | fare ×20, serce ×10, 1.000 💰 |
| Çıktı | Yırtıcı İksiri ×1 (Buff, Rare) |
| Kullanım | Hunt sırasında yakalama şansını +%15 artırır |

**Değerlendirme:** En değerli craft. Tame item olarak da kullanılabilir (+15 tame bonus). Markette iyi fiyata satılır. fare ve serce bolsa üretmek karlıdır.

---

### Dismantle (Parçalama)

Av hayvanlarını parçalayarak upgrade materyali üretebilirsin:

```
owl dismantle <eşya adı> [miktar]
owl dismantle fare 10
/owl dismantle esya:fare miktar:10
```

Dismantle çıktıları rastgele aralıktadır (min-max). Örnek: 1 fare → 1 Kemik Tozu (sabit), 1 bildircin → 3-5 Parlak Tüy (rastgele).

**En Verimli Dismantle'lar:**
- sincap → Parlak Tüy ×5-8 (en yüksek Parlak Tüy kaynağı)
- bildircin / guvercin → Parlak Tüy ×3-5
- tavsan → Yırtıcı Pençe Parçası ×2-3

---

### Crafting Stratejisi

**Karlı Craft:**
- Yırtıcı İksiri: fare ve serce bolsa üret, markette sat veya tame'de kullan.
- Bileme Taşı: Kemik Tozu fazlaysa üret, upgrade'de kullan.

**Noob Trap:**
- Karma Yem: Stamina nadiren kritik olur. fare ve serce'yi satmak genellikle daha karlıdır.

**Materyal Farm Yolu:**
- Kemik Tozu: fare dismantle (Kasaba Civarı hunt)
- Parlak Tüy: sincap/bildircin dismantle (Derin Orman hunt)
- Yırtıcı Pençe Parçası: yılan/tavsan dismantle (Derin Orman hunt)
- Orman Yankısı / Gölge Tüyü: Doğrudan hunt drop (Derin Orman, Lv.10+)

---

Bölüm 8 hazır. Devam edeyim mi? (Bölüm 9: Marketplace Sistemi)

---

## 9. Marketplace Sistemi

### Nasıl Çalışır?

Market, oyuncular arası eşya alım satımı yapılan global bir platformdur. Minimum **Lv.15** gerektirir.

```
owl market                          → İlanları listele
owl market sat <eşya> <miktar> <fiyat>  → İlan oluştur
owl market al <ilanID>              → İlan satın al
/owl market                         → Slash ile market
```

---

### Vergi Sistemi

Satış gerçekleştiğinde satıcıdan **%10 vergi** kesilir. Bu vergi yakılır — hiçbir yere gitmez (ekonomi sink).

Örnek: 1.000 coin'e sattığın bir eşyadan **900 coin** alırsın, 100 coin yok olur.

---

### Limitler ve Kurallar

| Kural | Değer |
|---|---|
| Minimum fiyat | 50 💰 |
| Maksimum fiyat | 100.000 💰 |
| Günlük ilan limiti | 5 ilan/gün |
| İlan süresi | 48 saat |
| Minimum seviye | Lv.15 |

Süresi dolan ilanlar otomatik olarak satıcıya iade edilir (her 10 dakikada bir kontrol).

---

### İlan ID Sistemi

Market listesinde her ilanın kısaltılmış bir ID'si gösterilir (UUID'nin ilk 8 karakteri). Satın almak için bu ID'yi kullan:

```
owl market al a1b2c3d4
```

---

### En İyi Satış Stratejileri

**Ne satmalısın?**
- Fazla upgrade materyalleri (Yırtıcı Pençe Parçası, Orman Yankısı, Gölge Tüyü)
- Craft edilmiş Yırtıcı İksiri (ham maddeden daha değerli)
- Lootbox'tan çıkan buff item'ları (kullanmayacakların)
- Nadir av hayvanları (gelincik, kirpi)

**Ne almalısın?**
- Eksik upgrade materyalleri (farm etmek yerine satın almak zaman kazandırır)
- Tame item'ları (Alfa Feromon, Kan Kokusu)
- Buff item'ları (hunt veya upgrade için)

---

### Dikkat Edilmesi Gerekenler

⚠️ **Fiyat kontrolü:** Satmadan önce mevcut ilanları kontrol et. Piyasa fiyatının altında satarsan zarar edersin.

⚠️ **Günlük limit:** Günde sadece 5 ilan açabilirsin. Değerli eşyaları önceliklendir.

⚠️ **48 saat TTL:** İlan 48 saat içinde satılmazsa geri döner. Çok yüksek fiyat koyarsan ilan boşa gider.

⚠️ **Kendi ilanını satın alamazsın** — sistem bunu engeller.

---

Bölüm 9 hazır. Devam edeyim mi? (Bölüm 10: Ekonomi Sistemi)

---

## 10. Ekonomi Sistemi

### Para Kaynakları

| Kaynak | Tahmini Kazanç | Notlar |
|---|---|---|
| Hunt + Sell | 3.000–8.000 💰/saat | Ana kaynak |
| Daily Quest (4 görev) | 2.900 💰/gün | Ücretsiz bonus |
| Market satışı | Değişken | Nadir item'lar için |
| PvP kazanma | Rakip coin'i | Risk var |
| Gambling kazanma | Değişken | Uzun vadede kayıp |

---

### Para Sinkleri (Nereye Gidiyor?)

| Sink | Miktar | Notlar |
|---|---|---|
| Upgrade coin maliyeti | Stat bazlı (50–58.000 💰) | En büyük sink |
| Biome giriş ücreti | 1.500–2.500 💰/30dk | Aktif sink |
| Market vergisi | %10 | Her satışta yakılır |
| Transfer vergisi | %3–12 | Miktara göre değişir |
| Crafting maliyeti | 100–1.000 💰 | Küçük sink |
| Repair (tamir) | 500 💰 | Maintenance kaçırılırsa |

---

### Upgrade Coin Maliyeti

Stat seviyesi arttıkça maliyet üstel olarak artar:

| Stat Seviyesi | Yaklaşık Maliyet |
|---|---|
| 1–10 | 50–500 💰 |
| 20 | ~2.000 💰 |
| 50 | ~19.000 💰 |
| 80 | ~40.000 💰 |
| 90 | ~58.000 💰 |

---

### Transfer Vergi Dilimleri

Başka oyuncuya coin gönderirken kademeli vergi uygulanır:

| Miktar | Vergi Oranı |
|---|---|
| 0–500 💰 | %3 |
| 501–2.000 💰 | %5 |
| 2.001–10.000 💰 | %8 |
| 10.000+ 💰 | %12 |

Günlük gönderim limiti: **3.000 💰** (Lv.15+ gerekli).

---

### En İyi Para Kazanma Yöntemleri

**Erken Oyun (Lv.1–15):**
1. Kasaba Civarı'nda hunt spam
2. Tüm avları sat
3. Daily quest tamamla

**Orta Oyun (Lv.15–30):**
1. Göl Kenarı'nda hunt (daha fazla yakalama)
2. Nadir materyalleri markette sat
3. Yırtıcı İksiri craft edip sat
4. Daily quest + market görevi

**İleri Oyun (Lv.30+):**
1. Derin Orman'da hunt (nadir materyal + nadir hayvan)
2. Orman Yankısı / Gölge Tüyü markette sat
3. Buff item'ları markette sat
4. Prestige ile XP bonusu → daha hızlı level → daha fazla hunt roll

---

### Enflasyon Uyarısı

Aktif oyuncular zamanla çok fazla coin biriktirebilir. Bu durumda:
- Market fiyatları şişer
- Yeni oyuncular dezavantajlı kalır
- Upgrade maliyetleri zaten bunu dengelemeye çalışır

**Tavsiye:** Coin biriktirmek yerine upgrade ve biome'a harca — uzun vadede daha güçlü olursun.

---

Bölüm 10 hazır. Devam edeyim mi? (Bölüm 11: Upgrade Sistemi)

---

## 11. Upgrade Sistemi

### Nasıl Çalışır?

```
owl upgrade <stat>     → Stat seçip onay paneli aç
owl upgrade gaga       → Gaga stat'ını geliştir
/owl upgrade stat:pence → Slash ile upgrade
```

Komut yazınca bir panel açılır. Başarı şansı, gerekli malzemeler ve coin maliyeti gösterilir. **"Devam et"** butonuna basınca deneme yapılır. Panel 30 saniye geçerlidir.

---

### Başarı Şansı Formülü

```
şans = 65
     + (oyuncu seviyesi × 0.6)
     + itemBonus
     + buffBonus
     - log(stat + 1) × 12
```

**Clamp:** Minimum %5, maksimum %95.

Örnek: Lv.20, stat=30, item yok → şans ≈ %65 + 12 - 41 = **%36**

Stat yükseldikçe zorluk logaritmik artar — imkânsız olmaz ama çok zorlaşır.

---

### Başarı Şansına Etki Eden Faktörler

| Faktör | Etki |
|---|---|
| Oyuncu seviyesi | Her level +0.6 puan |
| Bileme Taşı | +10 puan |
| Orman Yankısı | +5 puan |
| Gölge Tüyü | +2 puan |
| Sessizlik Teli | +3 puan |
| 💡 Berrak Zihin buff | +15 puan |
| 🔨 Usta Eli buff | +28 puan |

---

### Downgrade Riski

Lv.40+ oyuncular için başarısız upgrade'de **%20 şansla stat 1 düşer**. Lv.40 altında downgrade yoktur.

🛡️ **Koruyucu Talisman** buff'u aktifse downgrade şansı **%80 azalır** (yani %4'e düşer).

---

### Bağımlılık Sistemi

Stat'lar birbirine bağlıdır. Bir stat'ı belirli seviyeye çıkarmak için bağımlı stat'ın yeterli seviyede olması gerekir:

| Stat | Bağımlı Olduğu | Oran |
|---|---|---|
| Pence | Bağımsız | — |
| Gaga | Pence | %50 (Gaga 10 → Pence ≥ 5) |
| Kulak | Pence | %40 (Kulak 10 → Pence ≥ 4) |
| Göz | Kulak | %45 (Göz 10 → Kulak ≥ 5) |
| Kanat | Göz | %50 (Kanat 10 → Göz ≥ 5) |

Bu sistem Lv.5 stat'tan itibaren devreye girer. Bağımlılık karşılanmıyorsa upgrade butonu kilitlenir ve hangi stat'ı önce geliştirmen gerektiği gösterilir.

**Doğru Upgrade Sırası:**
```
Pence → Gaga & Kulak → Göz → Kanat
```

---

### Cooldown

- Başarılı upgrade: **5 dakika** cooldown
- Başarısız upgrade: **1 dakika** cooldown

---

### En Verimli Upgrade Stratejisi

1. **Önce Pence'yi geliştir** — hem av hem bağımlılık için temel stat
2. **Buff kullan** — Berrak Zihin veya Usta Eli ile şansı artır
3. **Lv.40 öncesi agresif upgrade** — downgrade riski yok
4. **Lv.40+ için Koruyucu Talisman** — downgrade'i neredeyse sıfırla
5. **Yüksek stat'larda (50+) sabırlı ol** — şans düşük, malzeme çok gerekir

---

Bölüm 11 hazır. Devam edeyim mi? (Bölüm 12: Prestige / Ascension Sistemi)

---

## 12. Prestige / Ascension Sistemi

### Nasıl Açılır?

```
owl prestige <baykuşID>     → Baykuşu feda et, prestige yap
/owl prestige baykus:<id>   → Slash ile prestige
owl prestige                → Bilgi ekranını göster
```

Prestige yapmak için **iki koşul** aynı anda sağlanmalıdır:

| Koşul | Değer |
|---|---|
| Oyuncu seviyesi | **Lv.30 veya üstü** |
| Baykuş ortalama stat | **80 veya üstü** |

Ortalama stat = (gaga + göz + kulak + kanat + pence) / 5

---

### Prestige Yapınca Ne Olur?

**Sıfırlananlar:**
- Oyuncu seviyesi → **1'e döner**
- XP → **0'a döner**
- Feda edilen baykuş → **silinir**
- mainOwlId → **sıfırlanır**

**Korunanlar:**
- Coin bakiyesi
- Diğer baykuşlar (feda edilmeyen)
- Envanter (materyaller, item'lar)
- Prestige seviyesi (kalıcı olarak artar)

**Verilen:**
- Yeni başlangıç baykuşu: **Kukumav baykusu** (Tier 8, Common, tüm stat'lar 10)

---

### Kalıcı Bonuslar

Her prestige seviyesi için:

| Bonus | Değer |
|---|---|
| XP kazanımı | **+%5** (kümülatif) |
| Stat soft cap artışı | **+2** (kümülatif) |

Örnek: Prestige 3 → +%15 XP, +6 stat cap artışı.

**Stat cap artışı ne demek?** Soft cap formülünde prestige bonusu eklenir:
```
statEffect = (stat + prestige×2) × 70 / (stat + prestige×2 + 30)
```
Prestige 5 ile stat 80'in etkisi, prestige 0'da stat 90'ın etkisine yaklaşır.

---

### Ne Zaman Prestige Yapmalısın?

**Erken prestige (Lv.30, stat 80):** Hızlı XP bonusu kazanmak için iyi. Ama baykuşun zayıfsa ikinci tura daha zor başlarsın.

**Geç prestige (Lv.40+, stat 90+):** Daha güçlü bir baykuşu feda edersin ama kalıcı bonuslar aynı. Fark yok.

**Tavsiye:** Lv.30'a ulaşır ulaşmaz prestige yap. Coin ve materyaller korunduğu için ikinci tur çok daha hızlı geçer.

---

### Prestige Meta

- Prestige 1: +%5 XP → level daha hızlı çıkar → daha fazla hunt roll
- Prestige 2: +%10 XP, +4 stat cap → upgrade daha etkili
- Prestige 3+: Her tur öncekinden daha hızlı tamamlanır

Coin ve materyaller korunduğu için her prestige'de başlangıç avantajın artar. Uzun vadede prestige yapmak her zaman kazançlıdır.

---

Bölüm 12 hazır. Devam edeyim mi? (Bölüm 13: Daily Quest Sistemi)

---

## 13. Daily Quest Sistemi

### Nasıl Çalışır?

```
owl quests     → Görevleri gör, ödül al
owl q          → Kısaltma
/owl quests    → Slash ile
```

Her gün gece yarısı (UTC 00:00) görevler sıfırlanır. Her oyuncu için **4 görev** oluşturulur. Görev tamamlanınca embed'deki butona basarak ödülü alırsın.

---

### Görev Türleri

| Görev | Hedef | Coin Ödülü | XP Ödülü |
|---|---|---|---|
| 10 Hayvan Avla | 10 başarılı av | 500 💰 | 200 XP |
| 3 Eşya Craft Et | 3 craft işlemi | 800 💰 | 300 XP |
| 1 Baykuş Evcilleştir | 1 başarılı tame | 1.200 💰 | 500 XP |
| Markete 2 İlan Koy | 2 market ilanı | 400 💰 | 150 XP |

**Toplam günlük ödül:** 2.900 💰 + 1.150 XP (4 görev tamamlanırsa)

---

### İlerleme Takibi

`owl quests` komutunda her görevin ilerleme çubuğu gösterilir:

```
`██████░░░░` 6/10
```

Görev tamamlandığında `🌟 Tamamlandı` yazar, ödül alındığında `✅ Alındı` yazar.

---

### En Hızlı Tamamlama Yöntemleri

**Hunt görevi (10 av):**
- Kasaba Civarı veya Göl Kenarı'nda hunt spam yap
- Her hunt'ta birden fazla yakalama olabilir — 10 yakalama için 3-5 hunt yeterli olabilir
- Minimum garanti sayesinde her hunt en az 1 hayvan verir

**Craft görevi (3 craft):**
- En ucuz tarif: Karma Yem (fare×5 + serce×2 + 100💰)
- 3 kez Karma Yem üret → görev tamamlanır
- Toplam maliyet: ~300 coin + az miktarda av hayvanı

**Tame görevi (1 tame):**
- En zor görev — encounter tetiklenmesi gerekir
- Derin Orman'da hunt yap (nadir encounter şansı yüksek)
- Tame item kullan (Alfa Feromon +12, Yırtıcı İksiri +15)
- 🤝 Evcil Ruh trait'li baykuş kullan (+%28 tame şansı)

**Market görevi (2 ilan):**
- En kolay görev — herhangi 2 eşyayı markete koy
- Minimum fiyat 50 coin — ucuz item'ları bile koyabilirsin
- İlanın satılması gerekmez, sadece oluşturulması yeterli

---

### Önemli Notlar

- Görevler gece yarısı UTC'de sıfırlanır — Türkiye saatiyle sabah 03:00.
- Ödülü almak için görev tamamlandıktan sonra `owl quests` yazıp butona basmalısın. Otomatik verilmez.
- Tame görevi için encounter tetiklenmesi şansa bağlıdır — her hunt'ta garantili değil.
- Market görevi için Lv.15 gereksinimi var (market kullanımı için).

---

Bölüm 13 hazır. Devam edeyim mi? (Bölüm 14: PvP Sistemi)

---

## 14. PvP Sistemi

### PvP Türleri

Oyunda iki tür PvP vardır:

| Tür | Komut | Açıklama |
|---|---|---|
| Gerçek PvP | `owl vs @oyuncu` | Başka bir oyuncuya meydan okuma |
| Bot Duel | `owl duel` | Simüle edilmiş bot rakip |

---

### Gerçek PvP (owl vs)

1. `owl vs @oyuncu` yaz — karşı tarafa davet gönderilir
2. Rakip **60 saniye** içinde kabul veya reddeder
3. Kabul ederse savaş otomatik simüle edilir
4. Sonuç animasyonlu olarak gösterilir

**Kurallar:**
- Kendinle PvP yapamazsın
- Rakip başka bir PvP'deyse davet gönderilemez
- Davet 60 saniye geçerlidir, sonra otomatik iptal olur

---

### Bot Duel (owl duel)

Gerçek rakip gerekmez. Bot otomatik oluşturulur:
- %60 kolay rakip (güç ×0.85)
- %30 dengeli rakip (güç ×1.0)
- %10 zorlu rakip (güç ×1.2)

Cooldown: **7 saniye** (hunt ile aynı).

---

### Savaş Mekaniği

PvP tamamen otomatik simüle edilir — oyuncu müdahalesi yoktur. Sonuç stat'lara ve RNG'ye göre belirlenir:

```
Kazanma şansı = stat gücü × 0.7 + rastgele × 0.3
```

**Stat etkisi (%70):** Baykuşun toplam stat gücü belirleyicidir.
**RNG etkisi (%30):** Her savaşta şans faktörü vardır — zayıf baykuş da kazanabilir.

**Savaş mekanikleri:**
- Maksimum 30 tur
- Her turda momentum artar (hasar çarpanı +%5/tur)
- HP %20 altında + stamina düşükse execute şansı devreye girer
- Stamina düştükçe hasar ve dodge şansı azalır

---

### PvP Ödülleri

| Sonuç | XP | Notlar |
|---|---|---|
| Kazanma | 50 XP + streak bonusu | Lootbox drop şansı var |
| Kaybetme | 15 XP | — |
| Bot duel kazanma | 40 XP | Gerçek PvP'den az |
| Bot duel kaybetme | 10 XP | — |

**Lootbox Drop (PvP kazanınca):**
- Silah Kutusu: %10 şans
- Eşya Kutusu: %4 şans

---

### Win Streak Sistemi

Ardışık PvP galibiyetleri bonus verir:

| Streak | XP Bonusu | Coin Bonusu |
|---|---|---|
| 2 galibiyet | +%3 XP | — |
| 3 galibiyet | +%5 XP | +15 💰 |
| 5 galibiyet | +%8 XP | +30 💰 |
| 7 galibiyet | +%10 XP | — |
| 10 galibiyet | +%12 XP | +50 💰 |

**Anti-abuse:** Rakibin gücü senin gücünün %70'inden düşükse streak sayılmaz.

**Milestone mesajları:** 3, 5, 7, 10, 15 streak'te özel duyuru yapılır.

---

### PvP Buff Etkileri

Aktif PvP buff'ları savaşı etkiler:

| Buff | Etki | Cap |
|---|---|---|
| ⚔️ Savaş Ruhu | +%18 hasar | Max +%20 |
| 🛡️ Savunma Duruşu | +%18 dodge | Max +%12 |
| 🏆 Arena Ustası | +%25 hasar & +%15 dodge | Her ikisi cap'e tabi |

**Not:** Buff cap'leri aşılamaz — birden fazla PvP buff'u stack'lemek diminishing returns'e tabidir.

---

### PvP Meta Build

**Saldırı odaklı:**
- Trait: 🔥 Saldırgan Ruh + 💨 Kaçamak Ustası
- Stat: Gaga > Pence > Kanat
- Buff: ⚔️ Savaş Ruhu veya 🏆 Arena Ustası

**Savunma odaklı:**
- Trait: 🛡️ Demir Deri + 📚 Deneyimli
- Stat: Pence > Gaga > Kulak
- Buff: 🛡️ Savunma Duruşu

---

Bölüm 14 hazır. Devam edeyim mi? (Bölüm 15: İleri Seviye Stratejiler)

---

## 15. İleri Seviye Stratejiler

### En Hızlı XP Kasma

1. **Prestige bonusu önce** — Her prestige +%5 XP. Mümkün olan en kısa sürede ilk prestige'i yap.
2. **Derin Orman hunt** — Nadir hayvanlar (tavşan, gelincik, kirpi) daha fazla XP verir. Risk bonus da eklenir.
3. **Kritik av** — %10 şansla XP 2 katına çıkar. 🎯 Keskin Nişan buff'u ile kritik avdan daha fazla kazanırsın.
4. **Combo streak koru** — 5+ streak → +25 XP/tur. Hiç başarısız olmamaya çalış.
5. **Multi-success** — Aynı turda 5+ yakalama → +25 XP bonus. Yüksek seviyede (Lv.20+) daha fazla roll var.
6. **🦇 Gece Avcısı trait** — +%22 XP. Cooldown uzar ama XP kazanımı artar.

---

### En Hızlı Para Kasma

1. **Derin Orman + Orman Yankısı/Gölge Tüyü sat** — Nadir materyaller markette yüksek fiyata gider.
2. **Yırtıcı İksiri craft et, sat** — fare ve serce bolsa karlı.
3. **Daily quest her gün tamamla** — 2.900 coin ücretsiz.
4. **Buff item'ları sat** — Lootbox'tan çıkan kullanmayacağın item'ları markete koy.
5. **Göl Kenarı + sell spam** — Yakalama şansı yüksek, çok hayvan düşer, hızlı coin.

---

### Optimal Biome Rotasyonu

```
Sabah: Derin Orman (30 dk) → Materyal topla
Öğle:  Göl Kenarı (30 dk)  → Coin topla
Akşam: Derin Orman (30 dk) → Nadir hayvan + encounter şansı
```

Günlük biyom maliyeti: 2.500 + 1.500 + 2.500 = **6.500 coin**
Günlük tahmini kazanç: ~20.000+ coin (aktif oyuncu için)

---

### İlk 1 Saat

- Kayıt ol, `owl hunt` yaz, Kasaba Civarı seç
- 7 saniyede bir hunt at, avları sat
- `owl quests` ile görevleri kontrol et
- Hunt görevini tamamla (10 av)
- `owl stats` ile baykuşunu tanı

**Hedef:** ~500–1.000 coin biriktir.

---

### İlk 1 Gün

- Lv.5'e ulaş → Göl Kenarı'na geç
- 4 daily quest'i tamamla (+2.900 coin)
- `owl upgrade pence` ile ilk upgrade'i dene
- Fazla materyalleri markete koy (Lv.15 gerekli)
- `owl owls` ile baykuşlarını listele

**Hedef:** Lv.10, 5.000+ coin, pence stat 5+.

---

### İlk 1 Hafta

- Lv.15'e ulaş → Market erişimi
- Derin Orman'a geç (Lv.10)
- Tüm stat'ları 20+ yap
- İlk encounter'ı evcilleştir
- Prestige için Lv.30 ve stat 80 hedefle

**Hedef:** Lv.20+, 20.000+ coin, tüm stat'lar 15+.

---

### Mid-Game Geçişi (Lv.20–30)

- Upgrade'e agresif yatırım yap (Lv.40 öncesi downgrade yok)
- Buff item'ları kullanmaya başla (Berrak Zihin, Usta Eli)
- PvP streak bonuslarından yararlan
- Prestige için baykuş stat'larını 80 ortalamasına çıkar

---

### Endgame Hazırlığı (Lv.30+)

- Prestige yap → Lv.1'den hızlı çık (coin + materyal korunuyor)
- Her prestige turunda daha güçlü başla
- God Roll baykuş için encounter farm yap (Derin Orman)
- Liderboard'a girmek için power score'u artır

---

### F2P Stratejisi (Hiç Gambling Yapmadan)

1. Daily quest her gün → 2.900 coin ücretsiz
2. Derin Orman materyallerini sat → pasif gelir
3. Craft + market → ham maddeden değer üret
4. PvP streak bonusları → ekstra XP ve coin
5. Prestige döngüsü → her tur daha hızlı

---

Bölüm 15 hazır. Devam edeyim mi? (Bölüm 16: Büyük Hatalar)

---

## 16. Oyuncuların Yapacağı Büyük Hatalar

### ❌ Tüm Materyalleri Satmak
Upgrade için Kemik Tozu, Parlak Tüy, Yırtıcı Pençe Parçası gerekir. Hepsini satarsan upgrade yapamaz, geri farm etmek zaman kaybettirir. **Kural:** Her materyalden en az 20-30 adet sakla.

### ❌ Yanlış Stat Sırasıyla Upgrade Yapmak
Bağımlılık sistemi var. Göz'ü geliştirmek istiyorsan önce Kulak yeterli seviyede olmalı. Sırayı bilmeden upgrade yaparsan "kilitli" mesajıyla karşılaşırsın ve malzeme harcamış olursun. **Doğru sıra:** Pence → Gaga & Kulak → Göz → Kanat.

### ❌ Gambling'e Coin Harcamak
Coinflip %49 kazanma şansı, slot uzun vadede %55 kayıp. Başlangıçta gambling oynamak coin birikimini mahveder. **Kural:** Gambling'i sadece fazla coinle oyna, asla ana bütçenden harcama.

### ❌ Prestige'i Çok Geciktirmek
Lv.30 ve stat 80'e ulaşınca prestige yapmak için beklemeye gerek yok. Coin ve materyaller korunuyor. Her geçen gün prestige bonussuz oynamak XP kaybıdır.

### ❌ Biome Ücretsiz Sanmak
Göl Kenarı 1.500 coin, Derin Orman 2.500 coin giriş ücreti alır. Bakiyen yoksa hata verir. Hunt yapmadan önce coin kontrolü yap.

### ❌ Market'te Fiyat Araştırmadan Satmak
Piyasa fiyatının çok altında satarsan zarar edersin. Önce `owl market` ile mevcut ilanları gör, sonra fiyat belirle.

### ❌ Tame'i İtemsiz Denemek
Tier 1-3 baykuşların tame şansı %2-12 gibi çok düşük. İtemsiz denemek neredeyse imkânsız. Alfa Feromon (+12) veya Yırtıcı İksiri (+15) kullan.

### ❌ Aynı Türden 3'ten Fazla Buff Aktifleştirmek
3. buff sadece %30 etki yapar. 4. buff aktifleştirilemez. Farklı kategorilerden buff kullanmak daha verimlidir.

### ❌ Daily Quest'i Unutmak
Günde 2.900 coin + 1.150 XP ücretsiz. Gece yarısı sıfırlanır. Her gün `owl quests` yaz, ödülleri al.

---

## 17. Gizli ve Az Bilinen Mekanikler

### Minimum Garanti
Her hunt'ta hiç yakalama olmasa bile en düşük zorluktan 1 hayvan garantilenir. Bu garanti streak sayacını etkilemez — sadece gerçek yakalamalar streak'i artırır.

### Hidden Scaling (Gizli Matchmaking)
Güçlü oyuncuların karşısına çıkan yabani baykuşların stat'ları gizlice yükseltilir. Oyuncuya gösterilmez. Çok güçlü olunca encounter'lar zorlaşır — bu kasıtlı bir denge mekanizmasıdır.

### Encounter Limbo Temizleme
Tame session'ı 5 dakika içinde tamamlanmazsa encounter "açık" kalır. Yeni hunt yapmadan önce 6+ dakika önce oluşturulmuş açık encounter'lar otomatik kapatılır.

### Scouting Modu
Ana olmayan baykuşları "scouting" moduna alabilirsin. Her scouting baykuşu encounter şansına +%1 ekler. Birden fazla baykuşun varsa scouting'e al.

### Pity Sayacı Redis'te
Lootbox pity sayacı Redis'te tutulur. Bot yeniden başlatılırsa pity sayacı sıfırlanmaz (30 günlük TTL var). Güvenli.

### Bond Bonusu
Bond 100'e ulaşınca yakalama şansına +%20 eklenir. Bu bonus `owl stats` ekranında gösterilmez ama aktiftir.

### Prestige Stat Cap Etkisi
Prestige bonusu soft cap formülüne eklenir. Prestige 5 ile stat 80'in etkisi, prestige 0'da stat 90'ın etkisine yaklaşır. Yani prestige yapmak upgrade'i daha verimli kılar.

### Transfer Cooldown
Transfer yaptıktan sonra 60 saniye cooldown var. Aynı anda iki transfer yapılamaz.

---

## 18. Oyunun Teknik Mantığı

### RNG Nasıl Çalışır?
Tüm şans hesaplamaları sunucu tarafında yapılır. Oyuncu müdahalesi yoktur. `Math.random()` ile 0-1 arası değer üretilir, hesaplanan şansla karşılaştırılır.

### Cooldown Sistemi
Cooldown'lar Redis'te tutulur. Bot yeniden başlatılsa bile cooldown devam eder. Lua script ile atomik check-and-set yapılır — race condition yoktur.

### Rate Limiting (Spam Koruması)
10 saniyede 12 komut limiti vardır. Aşılırsa 15 saniye susturulursun. Redis down olursa sistem hata verir (güvenlik öncelikli).

### Anti-Abuse Sistemleri
- Transfer: Lv.15 minimum, günlük 3.000 coin limit, kademeli vergi
- Market: Günlük 5 ilan limiti, Lv.15 minimum
- Lootbox: Günlük 5 drop cap (anti-farm)
- PvP: Aynı anda tek PvP, streak anti-abuse (%70 güç eşiği)

### Daily Reset
Görevler gece yarısı UTC'de sıfırlanır. Lootbox günlük drop sayacı da gece yarısı sıfırlanır.

### Maintenance Sistemi
Her gece gece yarısı UTC'de aktif oyuncular için günlük bakım çalışır. Baykuşun envanterinde "Çiğ Et" yoksa effectiveness düşer. Effectiveness düşünce catch chance azalır. Tamir için 500 coin gerekir.

---

## 19. En İyi Başlangıç Build'i

### İlk 1 Saat
- Kasaba Civarı'nda hunt spam
- Avları sat, coin biriktir
- Hunt görevini tamamla (10 av → 500 coin)
- `owl stats` ile baykuşunu tanı

### İlk 1 Gün
- Lv.5 → Göl Kenarı'na geç
- 4 daily quest tamamla (+2.900 coin)
- İlk upgrade: `owl upgrade pence`
- Materyal biriktir, satma

### İlk 1 Hafta
- Lv.10 → Derin Orman'a geç
- Pence → Kulak → Göz sırasıyla upgrade
- Market'e nadir materyal sat (Lv.15'te)
- İlk encounter'ı evcilleştir

### Mid-Game (Lv.15–30)
- Buff item kullanmaya başla
- Yırtıcı İksiri craft et, sat veya tame'de kullan
- PvP streak bonuslarından yararlan
- Stat'ları 50+ yap

### Endgame Hazırlığı
- Tüm stat'lar 80 ortalamasına ulaşınca prestige yap
- Prestige sonrası coin + materyal avantajıyla hızlı çık
- God Roll baykuş için Derin Orman encounter farm
- Liderboard hedefle

---

## 20. Sonuç

### Gameplay Loop Özeti

```
Hunt → Av/Materyal → Sell/Craft/Upgrade → Güçlen
  ↓                                          ↓
Daily Quest                              Tame/Encounter
  ↓                                          ↓
Coin Biriktir                           Yeni Baykuş
  ↓                                          ↓
Market/Transfer                         Prestige
  ↓                                          ↓
PvP/Gambling                        Döngü Tekrar
```

### Oyunun Güçlü Yanları
- Derin ekonomi sistemi (crafting, market, transfer, vergi)
- Anlamlı prestige döngüsü (kalıcı bonuslar)
- Trait sistemi (her baykuş farklı)
- Biome çeşitliliği (risk/ödül dengesi)
- Anti-abuse korumaları (rate limit, transfer limit, pity)

### Oyunun Zor Yanları
- Tame şansı düşük tier'larda çok düşük
- Upgrade yüksek stat'larda çok maliyetli
- Prestige için Lv.30 + stat 80 uzun sürebilir
- Market fiyatları oyuncu tarafından belirleniyor — yeni oyuncular dezavantajlı

### Uzun Vadeli Hedef
Birden fazla prestige yaparak kalıcı bonusları biriktirmek, God Roll baykuşlara sahip olmak ve liderboard'da üst sıralara çıkmak. Oyun döngüsü her prestige'de daha hızlı ve daha ödüllendirici hale gelir.

---

*Bu kılavuz OwlHuntBot kaynak kodundan üretilmiştir. Tüm değerler gerçek config dosyalarından alınmıştır.*
