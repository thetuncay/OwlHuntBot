# 🤖 AI Oyun Asistanı - Teknik Dokümantasyon

## 📋 Genel Bakış

OwlHuntBot'un AI destekli soru-cevap sistemi, oyunculara oyun mekaniği, stratejiler ve komutlar hakkında anlık yardım sağlar.

## 🎯 Özellikler

### ✅ Yapabilecekleri
- Tüm komutları açıklama
- Oyun mekaniklerini anlatma (upgrade, hunt, tame, prestige)
- Stratejik tavsiyeler verme
- Yeni oyunculara rehberlik
- Biyom, stat ve ekonomi hakkında bilgi
- Crafting ve market kullanımı
- PvP ve kumar sistemleri

### ❌ Yapamayacakları (Güvenlik)
- Gizli sistem mekaniklerini açıklama:
  - Hidden scaling formülleri
  - Pity threshold değerleri
  - Streak bonus oranları
  - Exact catch chance formülleri
  - Encounter scaling sabitleri
- Oyun dışı sorulara cevap verme
- Kişisel bilgi paylaşma

## 🔧 Teknik Detaylar

### API
- **Provider:** Groq API
- **Model:** llama-3.3-70b-versatile
- **Dil:** Türkçe
- **Max Tokens:** 600
- **Temperature:** 0.6 (tutarlılık için)

### Rate Limiting
- **Cooldown:** 30 saniye/oyuncu
- **Max Soru Uzunluğu:** 200 karakter
- **API Limit:** 30 istek/dakika, 14.400 istek/gün

### Prompt Yapısı
- **Toplam Boyut:** ~4.500 karakter
- **Bölümler:**
  - Temel oyun döngüsü
  - Baykuş türleri ve tier sistemi
  - Stat sistemi ve bağımlılıklar
  - Biyomlar ve stratejiler
  - Av hayvanları
  - Upgrade materyalleri
  - Tame sistemi
  - Ekonomi ve para kazanma
  - Prestige sistemi
  - Lootbox ve buff'lar
  - Günlük görevler
  - Crafting tarifleri
  - Market sistemi
  - PvP ve kumar
  - Yeni oyuncu ipuçları
  - Tüm komutlar

## 📊 Kullanım İstatistikleri

### Örnek Sorular
```
✅ İyi Sorular:
- "nasıl para kazanırım?"
- "upgrade sırası nedir?"
- "en iyi biome hangisi?"
- "prestige ne zaman yapmalıyım?"
- "tame şansını nasıl artırırım?"
- "hangi statı önce geliştirmeliyim?"

❌ Kötü Sorular:
- "pity threshold kaç?" (gizli mekanik)
- "exact catch chance formülü nedir?" (gizli mekanik)
- "hava durumu nasıl?" (oyun dışı)
```

## 🎨 Kullanıcı Deneyimi

### Komut Kullanımı
```
owl soru <sorunuz>
```

### Embed Formatı
```
🤖 AI Oyun Asistanı
Soru: [kullanıcının sorusu]

💡 Cevap
[AI'ın detaylı cevabı]

Footer: [kullanıcı adı] · Daha fazla soru için: owl soru <soru>
Timestamp: [şu an]
```

### Hata Durumları
- **Soru girilmemişse:** Kullanım örnekleri gösterilir
- **Cooldown aktifse:** Kalan süre gösterilir (4 saniye sonra otomatik silinir)
- **Soru çok uzunsa:** 200 karakter limiti hatırlatılır
- **API hatası:** Kullanıcıya açık hata mesajı + tekrar deneme önerisi

## 🔄 Entegrasyon Noktaları

### 1. Kayıt Sonrası (onboarding.ts)
```typescript
💡 Yeni misin? Oyunla ilgili her şeyi sorabilirsin:
> owl soru nasıl para kazanırım?
> owl soru upgrade sırası nedir?
```

### 2. Bilinmeyen Komut (owl-utils.ts)
```typescript
🤖 AI Asistan
Oyunla ilgili soru sorabilirsin:
owl soru [yanlış komut] nedir?
```

### 3. Yardım Komutu (owl-help.ts)
```typescript
🤖 AI Asistan (YENİ!)
Oyunla ilgili her şeyi sorabilirsin:
• owl soru nasıl para kazanırım?
• owl soru upgrade sırası nedir?
```

### 4. Karmaşık Komutlar
- **Upgrade:** "Upgrade sistemi hakkında soru sorabilirsin"
- **Market:** "Market nasıl kullanılır?"
- **Prestige:** "Prestige ne zaman yapmalıyım?"
- **Hunt Biyom:** "En iyi biome hangisi?"

## 🚀 Gelecek İyileştirmeler

### Potansiyel Eklemeler
- [ ] Conversation history (son 3 soru-cevap)
- [ ] Kullanıcı profiline göre özelleştirilmiş cevaplar
- [ ] Popüler soruların cache'lenmesi
- [ ] Soru-cevap analytics (en çok sorulan sorular)
- [ ] Multi-language support (İngilizce)
- [ ] Slash command desteği (/owl soru)

### Prompt İyileştirmeleri
- [ ] Daha fazla örnek soru-cevap
- [ ] Tier-specific stratejiler
- [ ] Level-based tavsiyeler
- [ ] Meta stratejiler (endgame)

## 📝 Bakım ve Güncelleme

### Prompt Güncellemesi Gerektiğinde
1. `src/systems/ai-qa.ts` dosyasını aç
2. `SYSTEM_PROMPT` sabitini güncelle
3. Yeni mekanikler eklendiğinde ilgili bölümü güncelle
4. Gizli mekanikleri ekleme (ÖNEMLİ!)
5. Test et: `owl soru [yeni mekanik hakkında]`

### Test Senaryoları
```bash
# Temel sorular
owl soru nasıl başlarım?
owl soru para kazanma yöntemleri
owl soru upgrade sırası

# Karmaşık sorular
owl soru prestige ne zaman yapmalıyım?
owl soru en iyi biome hangisi?
owl soru tame şansını nasıl artırırım?

# Gizli mekanik sorguları (CEVAP VERMEMELİ)
owl soru pity threshold kaç?
owl soru hidden scaling formülü nedir?
```

## 🔐 Güvenlik Notları

### Kritik Bilgiler (Asla Açıklanmamalı)
```typescript
// config.ts'den
HUNT_PITY_THRESHOLD = 8
HUNT_PITY_BONUS_RATE = 0.04
HUNT_STREAK_BONUS_RATE = 0.05
ENCOUNTER_SCALE_THRESHOLD = 120
ENCOUNTER_SCALE_RATE = 0.003
// ... ve diğer gizli sabitler
```

### Prompt'ta Açıkça Belirtilen
```
ÖNEMLİ: Oyunun gizli mekaniklerini (hidden scaling, pity threshold, 
streak bonusları, exact formüller) ASLA açıklama. Sadece oyuncuya 
görünen bilgileri ver.
```

## 📞 Destek

Sorun bildirimi veya öneriler için:
- Discord: [Sunucu linki]
- GitHub Issues: [Repo linki]

---

**Son Güncelleme:** 2026-05-20
**Versiyon:** 2.0.0
**Durum:** ✅ Production Ready
