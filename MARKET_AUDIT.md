# Marketplace Abuse Audit Report

## 1. Alt-Account Funneling (Yan Hesaplardan Aktarım)
- **Risk:** Oyuncunun yan hesaplarıyla ucuza değerli eşya koyup ana hesabıyla alması.
- **Mevcut Önlemler:**
    - **Min Level (15):** Yan hesapların markete erişmesi için ciddi bir oyun süresi gerekiyor.
    - **Market Tax (%10):** Her işlemde %10 coin sistemden siliniyor, bu da sürekli aktarımı maliyetli kılıyor.
    - **Min/Max Price Corridors:** Eşyalar için belirlenen taban fiyat (50) ucuza aktarımı, tavan fiyat (100k) ise kara para aklamayı zorlaştırıyor.
- **Değerlendirme:** Düşük riskli.

## 2. Fake Price Manipulation (Fiyat Manipülasyonu)
- **Risk:** Piyasayı domine etmek için sahte fiyatlarla ilan girilmesi.
- **Mevcut Önlemler:**
    - **Global Marketplace:** İlanlar herkese açık ve tek havuzda.
    - **Listing Limit (5):** Bir oyuncu aynı anda çok fazla ilanla piyasayı manipüle edemez.
- **Değerlendirme:** Orta riskli. İleride eşya bazlı ortalama fiyat takibi eklenebilir.

## 3. Self-Trading Loops (Kendiyle Takas)
- **Risk:** Aynı oyuncunun farklı hesaplar arasında eşya döndürmesi.
- **Mevcut Önlemler:**
    - `buyListing` fonksiyonunda `listing.sellerId === buyerId` kontrolü var (aynı hesap).
    - Farklı hesaplar için Market Tax bariyeri her döngüde %10 kayıp yaratıyor.
- **Değerlendirme:** Kontrol altında.

## 4. Item Duplication Edge Cases
- **Risk:** Satın alma veya temizleme sırasında eşyaların ikiye katlanması.
- **Mevcut Önlemler:**
    - Tüm market işlemleri `Prisma.$transaction` ve `withLock` (sellerId/buyerId bazlı) ile korunuyor.
    - `marketListing.delete` ve `inventoryItem.upsert` atomik olarak gerçekleşiyor.
- **Değerlendirme:** Güvenli.

## 5. Market Laundering (Para Aklama)
- **Risk:** Yasaklı yollarla elde edilen coinlerin değersiz eşyalar üzerinden aktarılması.
- **Mevcut Önlemler:**
    - Kademeli vergi sistemi ve `MARKET_MAX_PRICE` (100k) limiti bu aktarımı sınırlar.
- **Değerlendirme:** Orta riskli. Admin logları ile takip edilmeli.
