# Requirements Document

## Introduction

BaykuşBot için Sosyal PvP Kumar Sistemi; iki Discord kullanıcısının birbirine karşı coin bahis oynayabileceği üç farklı oyun modunu (Coin Flip Duel, Slot Race, Blackjack Pro) kapsar. Sistem, mevcut PvP davet altyapısını, Redis tabanlı durum yönetimini ve Prisma tabanlı kalıcı kayıt mekanizmasını kullanır. Sosyal tutundurma mekanikleri (seri öldürücü duyurusu, kayıp iadesi, seyirci modu) oyuncu bağlılığını artırmayı hedefler.

---

## Glossary

- **PvP_Gambling_System**: Bu spec kapsamındaki tüm sosyal kumar oyunlarını yöneten sistem.
- **Challenger**: Oyun davetini başlatan oyuncu.
- **Defender**: Daveti alan ve kabul/reddeden oyuncu.
- **Invite_Collector**: 30 saniyelik davet süresini yöneten Discord button collector'ı.
- **House_Cut**: Her oyun sonunda kazanan miktardan kesilen vergi yüzdesi.
- **Progressive_House_Cut**: Aynı iki oyuncu arasında 10 ardışık oyun sonrası devreye giren ek vergi artışı.
- **Cooldown_Manager**: `getCooldownRemainingMs()` kullanan Redis tabanlı bekleme süresi denetleyicisi.
- **Lock_Manager**: `withLock()` kullanan Redis tabanlı yarış koşulu koruyucusu.
- **Coin_Flip_Duel**: `owl cf @oyuncu <miktar>` komutuyla başlatılan yazı-tura oyunu.
- **Slot_Race**: `owl slot @oyuncu <miktar>` komutuyla başlatılan eş zamanlı slot makinesi yarışı.
- **Blackjack_Pro**: `owl bj @oyuncu <miktar>` komutuyla başlatılan sıralı tur blackjack oyunu.
- **Seri_Katil**: Coin Flip Duel'de 3 ardışık galibiyet kazanan oyuncuya verilen sosyal duyuru unvanı.
- **Baykus_Tesellisi**: 5 ardışık PvP kaybı sonrası oyuncuya verilen kayıp iadesi ödülü.
- **Spectator**: Blackjack Pro oyununu izleyen, etkileşim yapamayan üçüncü taraf kullanıcı.
- **High_Stakes_Table**: Bahis 50.000 coin'i aştığında kanalda gösterilen yüksek riskli masa uyarısı.
- **Combo_Multiplier**: Slot Race'de her iki oyuncunun aynı sembolü yakalaması durumunda verilen XP bonusu.
- **PvP_Session**: Redis'te geçici olarak saklanan, Prisma'ya sonuç kaydedilen oyun oturumu verisi.

---

## Requirements

### Requirement 1: Genel PvP Kumar Kuralları

**User Story:** Bir oyuncu olarak, rakibimle adil ve tutarlı kurallara göre kumar oynamak istiyorum; böylece sistemin güvenilir olduğunu bilerek bahis yapabilirim.

#### Acceptance Criteria

1. THE PvP_Gambling_System SHALL minimum bahis miktarını 1.000 coin olarak uygulamalıdır.
2. WHEN bir oyuncu minimum bahis miktarının altında bir değer girerse, THE PvP_Gambling_System SHALL oyunu başlatmayı reddetmeli ve minimum bahis miktarını belirten bir hata mesajı döndürmelidir.
3. THE PvP_Gambling_System SHALL oyunlar arasında herhangi bir günlük limit uygulamamalıdır.
4. WHEN bir oyun tamamlanırsa, THE Cooldown_Manager SHALL her iki oyuncu için 15.000 ms (15 saniye) süreyle yeni bir PvP kumar oyunu başlatmayı engelleyen bir cooldown anahtarı set etmelidir.
5. WHEN bir oyuncu aktif cooldown süresi içinde yeni bir oyun başlatmaya çalışırsa, THE PvP_Gambling_System SHALL kalan süreyi saniye cinsinden belirten bir hata mesajı döndürmelidir.
6. THE PvP_Gambling_System SHALL temel House Cut oranını %5 olarak uygulamalıdır.
7. WHEN aynı iki oyuncu arasında 10 ardışık oyun tamamlanırsa, THE PvP_Gambling_System SHALL Progressive_House_Cut'ı devreye sokarak her ek ardışık oyun için House Cut'a %1 daha eklemelidir.
8. WHEN bir oyuncu bahis miktarından fazla coin'e sahip değilse, THE PvP_Gambling_System SHALL oyunu başlatmayı reddetmeli ve yetersiz bakiye hatası döndürmelidir.
9. THE PvP_Gambling_System SHALL her oyun sonucunu Prisma aracılığıyla kalıcı olarak kaydetmelidir.

---

### Requirement 2: PvP Davet Akışı

**User Story:** Bir oyuncu olarak, rakibimi bir oyuna davet etmek ve davet süresini yönetmek istiyorum; böylece her iki taraf da oyuna hazır olduğunda başlayabilelim.

#### Acceptance Criteria

1. WHEN bir oyuncu geçerli bir PvP kumar komutu çalıştırırsa, THE PvP_Gambling_System SHALL hedef oyuncuya Kabul / Reddet / İptal butonları içeren bir davet mesajı göndermelidir.
2. THE Invite_Collector SHALL davet mesajını 30.000 ms (30 saniye) boyunca aktif tutmalıdır.
3. WHEN davet süresi 30 saniye içinde yanıtlanmazsa, THE Invite_Collector SHALL daveti iptal etmeli, her iki oyuncunun Redis kilidini serbest bırakmalı ve zaman aşımı mesajı göstermelidir.
4. WHEN Defender daveti reddederse, THE PvP_Gambling_System SHALL oyunu iptal etmeli ve her iki oyuncunun kilidini serbest bırakmalıdır.
5. WHEN Challenger İptal butonuna basarsa, THE PvP_Gambling_System SHALL oyunu iptal etmeli ve Challenger'ın kilidini serbest bırakmalıdır.
6. WHEN bir oyuncunun zaten aktif bir PvP kilidi varsa, THE PvP_Gambling_System SHALL yeni bir davet başlatmayı reddetmeli ve aktif oyun uyarısı göstermelidir.
7. WHEN Defender daveti kabul ederse, THE PvP_Gambling_System SHALL her iki oyuncu için Redis kilidini almalı ve oyunu başlatmalıdır.

---

### Requirement 3: Yarış Koşulu Koruması

**User Story:** Bir sistem yöneticisi olarak, eş zamanlı işlemlerin coin bakiyelerini bozmamasını istiyorum; böylece oyuncular haksız kazanç veya kayıp yaşamasın.

#### Acceptance Criteria

1. WHEN bir oyun sonucu hesaplanırsa, THE Lock_Manager SHALL `withLock()` kullanarak her iki oyuncunun coin güncellemesini atomik bir Prisma transaction içinde gerçekleştirmelidir.
2. IF bir oyuncu için kilit alınamazsa, THEN THE PvP_Gambling_System SHALL işlemi iptal etmeli ve kullanıcıya "Zaten bir işlem devam ediyor" hatası döndürmelidir.
3. THE PvP_Gambling_System SHALL davet aşamasında Challenger'ın kilidini, kabul aşamasında Defender'ın kilidini almalıdır.
4. WHEN bir oyun tamamlanırsa veya iptal edilirse, THE Lock_Manager SHALL her iki oyuncunun kilidini serbest bırakmalıdır.

---

### Requirement 4: Coin Flip Duel

**User Story:** Bir oyuncu olarak, rakibimle hızlı bir yazı-tura oyunu oynamak istiyorum; böylece kısa sürede coin kazanabileyim.

#### Acceptance Criteria

1. WHEN `owl cf @oyuncu <miktar>` komutu çalıştırılırsa, THE PvP_Gambling_System SHALL Coin_Flip_Duel davet akışını başlatmalıdır.
2. WHEN Defender daveti kabul ederse, THE Coin_Flip_Duel SHALL her iki oyuncunun adını ve bahis miktarını gösteren animasyonlu bir embed yayınlamalıdır.
3. THE Coin_Flip_Duel SHALL sonucu %50 Challenger / %50 Defender olasılığıyla belirlemeli ve House_Cut uyguladıktan sonra kazananın bakiyesini güncellemelidir.
4. WHEN bir oyuncu Coin_Flip_Duel'de 3 ardışık galibiyet kazanırsa, THE PvP_Gambling_System SHALL o oyuncunun adını ve "SERİ KATİL" unvanını içeren bir duyuru mesajını kanalda yayınlamalıdır.
5. THE PvP_Gambling_System SHALL Coin_Flip_Duel galibiyet serisini Redis'te oyuncu bazında takip etmelidir.
6. WHEN bir oyuncu Coin_Flip_Duel'de kaybederse, THE PvP_Gambling_System SHALL o oyuncunun Coin_Flip_Duel galibiyet serisini sıfırlamalıdır.

---

### Requirement 5: Slot Race

**User Story:** Bir oyuncu olarak, rakibimle eş zamanlı slot makinesi yarışı yapmak istiyorum; böylece aynı anda şansımı deneyebileyim.

#### Acceptance Criteria

1. WHEN `owl slot @oyuncu <miktar>` komutu çalıştırılırsa, THE PvP_Gambling_System SHALL Slot_Race davet akışını başlatmalıdır.
2. WHEN Defender daveti kabul ederse, THE Slot_Race SHALL her iki oyuncunun slot sonuçlarını tek bir embed içinde yan yana göstermelidir.
3. THE Slot_Race SHALL her iki oyuncunun slot sonucunu eş zamanlı olarak hesaplamalı ve daha yüksek payout'a sahip oyuncuyu kazanan ilan etmelidir.
4. WHEN iki oyuncu da aynı sembolü yakalarsa (kazansalar da kaybetseler de), THE Slot_Race SHALL her iki oyuncuya da `addXP()` aracılığıyla Combo_Multiplier XP bonusu vermelidir.
5. THE PvP_Gambling_System SHALL Combo_Multiplier XP bonus miktarını config'de `PVP_SLOT_COMBO_XP` sabiti olarak tanımlamalıdır.
6. WHEN Slot_Race tamamlanırsa, THE PvP_Gambling_System SHALL House_Cut uyguladıktan sonra kazananın bakiyesini güncellemelidir.
7. WHEN iki oyuncunun slot puanı eşit olursa, THE Slot_Race SHALL bahisleri iade etmeli ve beraberlik sonucu bildirmelidir.

---

### Requirement 6: Blackjack Pro

**User Story:** Bir oyuncu olarak, rakibimle sıralı tur blackjack oynamak istiyorum; böylece strateji kullanarak coin kazanabileyim.

#### Acceptance Criteria

1. WHEN `owl bj @oyuncu <miktar>` komutu çalıştırılırsa, THE PvP_Gambling_System SHALL Blackjack_Pro davet akışını başlatmalıdır.
2. WHEN bahis miktarı 50.000 coin'i aşarsa, THE PvP_Gambling_System SHALL oyunu başlatmadan önce kanalda "YÜKSEK RİSKLİ MASA" uyarısını içeren bir High_Stakes_Table mesajı yayınlamalıdır.
3. WHEN Defender daveti kabul ederse, THE Blackjack_Pro SHALL Challenger'a Hit / Stand butonları sunarak sıralı tur mekaniklerini başlatmalıdır.
4. WHEN Challenger turu tamamlarsa, THE Blackjack_Pro SHALL Defender'a Hit / Stand butonları sunmalıdır.
5. THE Blackjack_Pro SHALL her oyuncunun elini ve mevcut toplam değerini embed içinde göstermelidir.
6. WHEN bir oyuncunun el değeri 21'i aşarsa, THE Blackjack_Pro SHALL o oyuncuyu bust ilan etmeli ve rakibini kazanan olarak belirlemelidir.
7. WHEN her iki oyuncu da Stand seçerse, THE Blackjack_Pro SHALL el değerlerini karşılaştırmalı ve 21'e en yakın oyuncuyu kazanan ilan etmelidir.
8. WHEN iki oyuncunun el değeri eşit olursa, THE Blackjack_Pro SHALL bahisleri iade etmeli ve beraberlik sonucu bildirmelidir.
9. WHEN Blackjack_Pro aktif durumdayken başka bir kullanıcı oyunu izlemek isterse, THE Blackjack_Pro SHALL o kullanıcıya Spectator olarak sadece görüntüleme erişimi sağlamalıdır.
10. THE Blackjack_Pro SHALL Spectator'ların oyun akışını etkileyecek herhangi bir etkileşim yapmasını engellemelidir.
11. WHEN Blackjack_Pro tamamlanırsa, THE PvP_Gambling_System SHALL House_Cut uyguladıktan sonra kazananın bakiyesini güncellemelidir.

---

### Requirement 7: Kayıp İadesi (Baykuş Tesellisi)

**User Story:** Bir oyuncu olarak, uzun kayıp serilerinde küçük bir teselli ödülü almak istiyorum; böylece oynamaya devam etmek için motivasyonum korunsun.

#### Acceptance Criteria

1. THE PvP_Gambling_System SHALL her oyuncunun ardışık PvP kumar kaybı sayısını Redis'te takip etmelidir.
2. WHEN bir oyuncu 5 ardışık PvP kumar oyununu kaybederse, THE PvP_Gambling_System SHALL son 5 oyundaki toplam kayıp miktarının %2'sini Baykus_Tesellisi olarak oyuncunun bakiyesine eklemeli ve bu miktarı `recordCoinsEarned()` ile kaydetmelidir.
3. WHEN Baykus_Tesellisi tetiklenirse, THE PvP_Gambling_System SHALL oyuncuya Discord DM aracılığıyla "Moralini bozma, tekrar dene!" mesajını göndermelidir.
4. WHEN Baykus_Tesellisi tetiklenirse, THE PvP_Gambling_System SHALL ardışık kayıp sayacını sıfırlamalıdır.
5. WHEN bir oyuncu PvP kumar oyununu kazanırsa, THE PvP_Gambling_System SHALL o oyuncunun ardışık kayıp sayacını sıfırlamalıdır.
6. THE PvP_Gambling_System SHALL Baykus_Tesellisi iade oranını config'de `PVP_REBATE_RATE` sabiti olarak tanımlamalıdır (varsayılan: 0.02).
7. THE PvP_Gambling_System SHALL Baykus_Tesellisi eşiğini config'de `PVP_REBATE_LOSS_STREAK` sabiti olarak tanımlamalıdır (varsayılan: 5).

---

### Requirement 8: Durum Yönetimi ve Kalıcı Kayıt

**User Story:** Bir sistem yöneticisi olarak, oyun verilerinin güvenilir biçimde saklanmasını ve temizlenmesini istiyorum; böylece Redis bellek sızıntısı veya veri tutarsızlığı oluşmasın.

#### Acceptance Criteria

1. THE PvP_Gambling_System SHALL aktif davet ve oyun oturumu verilerini Redis'te geçici olarak saklamalıdır.
2. THE PvP_Gambling_System SHALL Redis'teki davet anahtarlarına en fazla 60 saniye TTL atamalıdır.
3. THE PvP_Gambling_System SHALL Redis'teki oyun oturumu anahtarlarına en fazla 300 saniye TTL atamalıdır.
4. WHEN bir oyun tamamlanırsa, THE PvP_Gambling_System SHALL oyun sonucunu (kazanan, kaybeden, bahis miktarı, oyun türü, zaman damgası) Prisma aracılığıyla kalıcı olarak kaydetmelidir.
5. WHEN bir oyun tamamlanırsa veya iptal edilirse, THE PvP_Gambling_System SHALL ilgili Redis anahtarlarını temizlemelidir.
6. THE PvP_Gambling_System SHALL Progressive_House_Cut sayacını Redis'te `pvp:gamble:pair:{id1}:{id2}:count` formatında saklamalıdır.
7. THE PvP_Gambling_System SHALL ardışık kayıp sayacını Redis'te `pvp:gamble:loss_streak:{userId}` formatında saklamalıdır.
8. THE PvP_Gambling_System SHALL Coin_Flip_Duel galibiyet serisini Redis'te `pvp:gamble:cf_streak:{userId}` formatında saklamalıdır.

---

### Requirement 9: Mimari ve Dosya Yapısı

**User Story:** Bir geliştirici olarak, sistemin mevcut BaykuşBot mimarisine uygun biçimde yapılandırılmasını istiyorum; böylece bakım ve genişletme kolaylığı sağlansın.

#### Acceptance Criteria

1. THE PvP_Gambling_System SHALL iş mantığını `src/systems/pvp-gambling.ts` dosyasında barındırmalıdır.
2. THE PvP_Gambling_System SHALL UI katmanını (embed, buton, collector) `src/commands/pvp-gambling.ts` dosyasında barındırmalıdır.
3. THE PvP_Gambling_System SHALL tüm sabit değerleri `src/config.ts` dosyasına eklemeli; hiçbir sayısal sabit başka dosyaya gömülmemelidir.
4. THE PvP_Gambling_System SHALL matematiksel hesaplamaları `src/utils/math.ts` dosyasında tanımlamalıdır.
5. THE PvP_Gambling_System SHALL mevcut `withLock()` fonksiyonunu `src/utils/lock.ts`'den import ederek kullanmalıdır.
6. THE PvP_Gambling_System SHALL mevcut `getCooldownRemainingMs()` fonksiyonunu `src/middleware/cooldown.ts`'den import ederek kullanmalıdır.
7. THE PvP_Gambling_System SHALL XP güncellemeleri için mevcut `addXP()` fonksiyonunu `src/systems/xp.ts`'den import ederek kullanmalıdır.
8. THE PvP_Gambling_System SHALL coin kazanç kayıtları için mevcut `recordCoinsEarned()` fonksiyonunu `src/systems/leaderboard.ts`'den import ederek kullanmalıdır.
