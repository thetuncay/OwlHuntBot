# 🧠 AI Zeka Yükseltmesi - Teknik Dokümantasyon

## 🎯 Yapılan İyileştirmeler

### 1. **🎯 Oyuncu Profiline Göre Kişiselleştirme**

AI artık her oyuncunun durumunu analiz ederek özelleştirilmiş cevaplar veriyor.

#### Toplanan Bilgiler:
```typescript
interface PlayerContext {
  level: number;              // Oyuncu seviyesi
  coins: number;              // Mevcut coin
  mainOwlSpecies: string;     // Ana baykuş türü
  mainOwlTier: number;        // Ana baykuş tier'i
  avgStat: number;            // Ortalama stat
  prestigeLevel: number;      // Prestige seviyesi
  hasCompletedTutorial: boolean;
}
```

#### Dinamik Tavsiyeler:

**Seviye Bazlı:**
- **Lv.1-4 (Yeni):** Basit açıklamalar, temel mekanikler
- **Lv.5-14 (Orta):** Stratejik tavsiyeler, ileri mekanikler
- **Lv.15-29 (Deneyimli):** İleri stratejiler, optimizasyon
- **Lv.30+ (Endgame):** Meta stratejiler, prestige optimizasyonu, min-max

**Coin Bazlı:**
- **< 1.000💰:** Para kazanma yöntemlerini vurgula
- **> 50.000💰:** Upgrade ve yatırım önerilerini vurgula

**Stat Bazlı:**
- **Avg < 20:** Upgrade önceliklerini vurgula
- **Avg ≥ 80 + Lv ≥ 30:** Prestige zamanlamasını değerlendir

#### Örnek Çıktı:
```
═══ OYUNCU PROFİLİ ═══
Seviye: 15
Coin: 12.500💰
Baykuş: Ural Baykusu (Tier 6)
Ortalama Stat: 25

💡 Bu oyuncu DENEYİMLİ. İleri stratejiler ve optimizasyon tavsiyeleri ver.
💰 Coin yeterli. Upgrade ve yatırım önerilerini vurgula.
```

---

### 2. **💾 Conversation Memory (Sohbet Hafızası)**

AI artık son 3 soru-cevabı hatırlıyor ve bağlamsal cevaplar veriyor.

#### Özellikler:
- **TTL:** 30 dakika (otomatik temizleme)
- **Kapasite:** Son 3 soru-cevap çifti (6 mesaj)
- **Storage:** Redis (hızlı erişim)

#### Avantajlar:
```
Oyuncu: "upgrade sırası nedir?"
AI: "Pence → Gaga → Kulak → Göz → Kanat"

Oyuncu: "peki pence'yi kaça çıkarmalıyım?"
AI: [Önceki konuşmayı hatırlıyor] "Pence'yi önce 20'ye çıkar..."
```

#### Teknik Detaylar:
```typescript
// Redis key format
ai:conversation:{userId}

// Data structure
[
  { role: 'user', content: 'upgrade sırası nedir?', timestamp: 1234567890 },
  { role: 'assistant', content: 'Pence → Gaga...', timestamp: 1234567891 },
  ...
]
```

---

### 3. **🧠 Multi-Step Reasoning (Adım Adım Düşünme)**

AI artık karmaşık sorular için adım adım düşünüyor.

#### Düşünme Süreci:
```
1. Oyuncunun gerçek ihtiyacını anla (ne soruyor?)
2. Oyuncunun seviyesine uygun cevap ver (profil bilgisini kullan)
3. Somut örnekler ve sayılar ver
4. Alternatif stratejiler öner
5. Sonraki adımları belirt
```

#### Örnek:
**Soru:** "nasıl para kazanırım?"

**Eski Cevap:**
```
Hunt yap ve sat. Daily quest tamamla.
```

**Yeni Cevap (Lv.15 oyuncu için):**
```
💰 Senin seviyende en iyi para kazanma yöntemleri:

1. **Göl Kenarı Hunt** (5.000💰/saat)
   - 1.500💰 giriş, 30dk oturum
   - +%15 yakalama şansı
   - ROI: %433

2. **Daily Quest** (2.900💰/gün)
   - 10 av, 3 craft, 1 tame, 2 market ilanı
   - Garantili gelir

3. **Market Satışı**
   - Nadir materyalleri sat (Orman Yankısı: 800-1.200💰)
   - Yırtıcı İksiri craft et ve sat (1.500-2.000💰)

📊 Hedef: Günde 15.000-20.000💰 kazanabilirsin.
🎯 Sonraki adım: Derin Orman'da materyal kas, markette sat.
```

---

### 4. **📊 Gelişmiş Prompt Yapısı**

#### Önceki Prompt:
- **Boyut:** ~400 karakter
- **İçerik:** Temel bilgiler
- **Kişiselleştirme:** Yok

#### Yeni Prompt:
- **Boyut:** ~4.500 karakter + Oyuncu profili
- **İçerik:** Detaylı rehber + Stratejiler + Örnekler
- **Kişiselleştirme:** Seviye, coin, stat bazlı

#### Prompt Bölümleri:
1. Düşünme yöntemi
2. Temel oyun döngüsü
3. Baykuş türleri ve tier sistemi
4. Stat sistemi ve bağımlılıklar
5. Biyomlar ve stratejiler
6. Av hayvanları ve dismantle
7. Upgrade materyalleri ve farm
8. Tame sistemi ve item'lar
9. Ekonomi ve para kazanma
10. Prestige sistemi
11. Lootbox ve buff'lar
12. Günlük görevler
13. Crafting tarifleri
14. Market stratejileri
15. PvP ve kumar
16. Seviye bazlı stratejiler
17. Tüm komutlar
18. **+ Oyuncu profili (dinamik)**

---

## 🚀 Performans Karşılaştırması

### Önceki Sistem:
```
Soru: "nasıl para kazanırım?"
Cevap: "Hunt yap ve sat. Daily quest tamamla."
Karakter: ~50
Kişiselleştirme: Yok
Bağlam: Yok
```

### Yeni Sistem:
```
Soru: "nasıl para kazanırım?"
Cevap: [Oyuncu seviyesine göre detaylı strateji + Somut sayılar + Alternatifler + Sonraki adımlar]
Karakter: ~400-600
Kişiselleştirme: ✅ Seviye, coin, stat
Bağlam: ✅ Son 3 soru-cevap
```

---

## 📈 Zeka Artışı Metrikleri

| Özellik | Önceki | Yeni | Artış |
|---------|--------|------|-------|
| Prompt Boyutu | 400 char | 4.500+ char | **11x** |
| Kişiselleştirme | ❌ | ✅ | **∞** |
| Conversation Memory | ❌ | ✅ 3 soru | **∞** |
| Multi-Step Reasoning | ❌ | ✅ 5 adım | **∞** |
| Oyuncu Profili Analizi | ❌ | ✅ 7 metrik | **∞** |
| Dinamik Tavsiyeler | ❌ | ✅ Seviye bazlı | **∞** |
| Bağlamsal Cevaplar | ❌ | ✅ | **∞** |

---

## 🎯 Kullanım Örnekleri

### Örnek 1: Yeni Oyuncu (Lv.3)
```
Soru: "upgrade nasıl yapılır?"

AI Analizi:
- Seviye: 3 (YENİ)
- Coin: 500💰 (DÜŞÜK)
- Avg Stat: 8 (DÜŞÜK)

Cevap:
"🌱 Yeni oyuncu için upgrade rehberi:

Upgrade yapmak için:
1. owl upgrade <stat> yaz (örnek: owl upgrade pence)
2. Materyal ve coin gerekir
3. Başarı şansı gösterilir

⚠️ ÖNEMLİ: Şu an upgrade yapma! Önce:
- Lv.10'a kadar hunt yap
- Coin biriktir (5.000+)
- Materyal topla

🎯 İlk upgrade: Lv.10'da Pence'yi 10'a çıkar."
```

### Örnek 2: Deneyimli Oyuncu (Lv.25)
```
Soru: "prestige ne zaman yapmalıyım?"

AI Analizi:
- Seviye: 25 (DENEYİMLİ)
- Coin: 45.000💰 (YÜKSEK)
- Avg Stat: 55 (ORTA)
- Prestige: 0

Cevap:
"🌟 Prestige zamanlaması (senin durumun için):

Şu anki durum:
- Seviye: 25/30 ✅
- Avg Stat: 55/80 ❌ (25 puan eksik)

Önerilen plan:
1. Tüm statları 60-70'e çıkar (5-10 level daha)
2. Lv.30'a ulaş
3. Avg stat 80+ olunca prestige yap

⏱️ Tahmini süre: 2-3 hafta
💰 Maliyet: ~150.000💰 (upgrade için)

🎯 Prestige bonusu: +%5 XP, +2 stat cap
📊 ROI: İkinci prestige'de daha hızlı ilerleme"
```

### Örnek 3: Bağlamsal Soru
```
1. Soru: "en iyi biome hangisi?"
   Cevap: "Göl Kenarı coin için, Derin Orman materyal için..."

2. Soru: "peki derin orman'da ne kadar kazanırım?"
   AI: [Önceki konuşmayı hatırlıyor]
   Cevap: "Derin Orman'da 30 dakikada:
   - ~6.000💰 (av satışı)
   - ~1.500💰 değerinde materyal
   - Toplam: ~7.500💰
   - Giriş: 2.500💰
   - Net: 5.000💰 (ROI: %200)"
```

---

## 🔧 Teknik Implementasyon

### API Çağrısı Akışı:
```typescript
1. Oyuncu soruyu sorar
   ↓
2. getPlayerContext(prisma, userId)
   → Oyuncu profilini DB'den çek
   ↓
3. buildPlayerContextPrompt(context)
   → Profil bilgisini prompt'a ekle
   ↓
4. getConversationHistory(redis, userId)
   → Son 3 soru-cevabı Redis'ten çek
   ↓
5. Mesajları oluştur:
   - System: SYSTEM_PROMPT + PlayerContext
   - History: Son 3 soru-cevap
   - User: Yeni soru
   ↓
6. Groq API çağrısı (llama-3.3-70b)
   ↓
7. addToConversationHistory()
   → Soru ve cevabı Redis'e kaydet
   ↓
8. Cevabı oyuncuya gönder
```

### Redis Kullanımı:
```typescript
// Conversation memory
Key: ai:conversation:{userId}
TTL: 30 dakika
Data: JSON array (max 6 mesaj)

// Cooldown
Key: cooldown:soru:{userId}
TTL: 30 saniye
```

### Database Kullanımı:
```typescript
// Oyuncu profili
SELECT level, coins, prestigeLevel FROM Player WHERE id = ?
SELECT species, tier, stats FROM Owl WHERE ownerId = ? AND isMain = true
```

---

## 🎓 Gelecek İyileştirmeler

### Kısa Vadeli (1-2 hafta):
- [ ] Slash command desteği (/owl soru)
- [ ] Soru-cevap analytics (en çok sorulan sorular)
- [ ] Popüler soruların cache'lenmesi

### Orta Vadeli (1-2 ay):
- [ ] RAG (Retrieval-Augmented Generation)
  - Oyuncu rehberinden dinamik bilgi çekme
  - Config dosyasından güncel sayıları okuma
- [ ] Görsel cevaplar (grafik, tablo)
- [ ] Multi-language support (İngilizce)

### Uzun Vadeli (3+ ay):
- [ ] Fine-tuned model (oyuna özel)
- [ ] Sesli asistan (Discord voice)
- [ ] Proaktif öneriler (oyuncu aktivitesine göre)

---

## 📊 Başarı Metrikleri

### Ölçülebilir Hedefler:
- **Kullanım Oranı:** +200% (günlük soru sayısı)
- **Memnuniyet:** +150% (pozitif feedback)
- **Retention:** +50% (oyuncu kalma süresi)
- **Support Yükü:** -40% (tekrarlayan sorular)

### Tracking:
```typescript
// Redis analytics
ai:stats:daily:{date}
{
  totalQuestions: number,
  uniqueUsers: number,
  avgResponseTime: number,
  topQuestions: string[],
}
```

---

## 🔐 Güvenlik ve Limitler

### Rate Limiting:
- **Cooldown:** 30 saniye/oyuncu
- **API Limit:** 30 istek/dakika (Groq free tier)
- **Günlük Limit:** 14.400 istek/gün

### Veri Güvenliği:
- Conversation history: 30 dakika TTL
- Oyuncu profili: Sadece gerekli alanlar
- Gizli mekanikler: Prompt'ta açıkça yasaklanmış

---

**Son Güncelleme:** 2026-05-20  
**Versiyon:** 3.0.0 (Intelligence Upgrade)  
**Durum:** ✅ Production Ready

