# 🛡️ AI API Rate Limiting & Quota Management

## 📊 Groq API Limitleri

### Ücretsiz Tier Limitleri:
- **Dakikalık:** 30 istek/dakika
- **Günlük:** 14.400 istek/gün
- **Model:** llama-3.3-70b-versatile

### Güvenlik Marjları:
- **Dakikalık:** 28 istek (2 istek marj)
- **Günlük:** 14.000 istek (400 istek marj)

## 🎯 Implementasyon

### 1. **Quota Kontrolü**

Her API çağrısından önce quota kontrol edilir:

```typescript
async function checkApiQuota(redis: Redis): Promise<{ allowed: boolean; reason?: string }> {
  // Günlük limit kontrolü
  const dailyCount = await redis.get(`ai:quota:daily:${today}`);
  if (dailyCount >= 14000) {
    return { allowed: false, reason: 'Günlük limit doldu' };
  }

  // Dakikalık limit kontrolü
  const minuteCount = await redis.get(`ai:quota:minute:${currentMinute}`);
  if (minuteCount >= 28) {
    return { allowed: false, reason: 'Dakikalık limit doldu' };
  }

  return { allowed: true };
}
```

### 2. **Quota Artırma**

Başarılı API çağrısından sonra sayaçlar artırılır:

```typescript
async function incrementApiQuota(redis: Redis): Promise<void> {
  // Günlük sayaç (gece yarısına kadar geçerli)
  await redis.incr(`ai:quota:daily:${today}`);
  await redis.expire(dailyKey, ttlSeconds);

  // Dakikalık sayaç (60 saniye geçerli)
  await redis.incr(`ai:quota:minute:${currentMinute}`);
  await redis.expire(minuteKey, 60);
}
```

### 3. **Fallback Sistemi**

Quota dolduğunda AI yerine önceden hazırlanmış cevaplar döner:

```typescript
const FALLBACK_RESPONSES = {
  'para|coin|kazanma': `💰 Para Kazanma Yöntemleri: ...`,
  'upgrade|stat': `⚡ Upgrade Sırası: ...`,
  'biome|biyom': `🗺️ Biyom Seçimi: ...`,
  'prestige': `🌟 Prestige Sistemi: ...`,
  'tame': `🎯 Tame Rehberi: ...`,
  'default': `🤖 AI asistan kullanılamıyor. owl yardim yazın.`,
};
```

## 📈 Redis Key Yapısı

### Günlük Quota:
```
Key: ai:quota:daily:2026-05-20
Value: 1234 (istek sayısı)
TTL: Gece yarısına kadar (otomatik)
```

### Dakikalık Quota:
```
Key: ai:quota:minute:28123456 (Unix dakika)
Value: 15 (istek sayısı)
TTL: 60 saniye
```

## 🎮 Kullanıcı Deneyimi

### Quota Dolduğunda:

**Günlük Limit:**
```
⚠️ Günlük AI soru limiti doldu (14.000). Yarın tekrar deneyin.

💰 Para Kazanma Yöntemleri:
1. Hunt + Sell (3.000-8.000💰/saat)
2. Daily Quest (2.900💰/gün)
3. Market Satışı

🎯 Hedef: Günde 15.000-20.000💰
```

**Dakikalık Limit:**
```
⚠️ AI asistan şu an çok yoğun. Lütfen 1 dakika sonra tekrar deneyin.

⚡ Upgrade Sırası:
1. PENCE (temel stat) → 20
2. GAGA + KULAK → 15
3. GÖZ → 10
...
```

**API Hatası:**
```
⚠️ AI asistan geçici olarak kullanılamıyor.

🤖 Yardım kaynakları:
• owl yardim - Tüm komutları gör
• Discord destek kanalı
...
```

## 🔧 Admin Monitoring

### Quota İstatistikleri:
```bash
/admin aiquota
```

**Çıktı:**
```
📊 AI API Kullanım İstatistikleri

Günlük: 8.234 / 14.000 (58%)
Dakikalık: 12 / 28 (42%)

✅ Kullanım normal seviyede
```

**Uyarı Durumu (>80%):**
```
📊 AI API Kullanım İstatistikleri

Günlük: 11.500 / 14.000 (82%)
Dakikalık: 5 / 28 (17%)

⚠️ Günlük limit dolmak üzere!
```

## 📊 Fallback Response Stratejisi

### Anahtar Kelime Eşleştirme:

```typescript
const keywords = {
  'para|coin|kazanma': 'Para kazanma rehberi',
  'upgrade|stat': 'Upgrade rehberi',
  'biome|biyom': 'Biyom rehberi',
  'prestige': 'Prestige rehberi',
  'tame': 'Tame rehberi',
};
```

### Eşleştirme Algoritması:
1. Soruyu küçük harfe çevir
2. Her anahtar kelime grubunu kontrol et
3. Eşleşme varsa ilgili fallback'i döndür
4. Eşleşme yoksa default fallback'i döndür

### Fallback Kalitesi:
- ✅ Temel bilgiler içerir
- ✅ Somut örnekler verir
- ✅ Komutları gösterir
- ✅ Sayılar ve stratejiler içerir
- ❌ Kişiselleştirilmiş değil
- ❌ Conversation memory yok
- ❌ Oyuncu profiline göre değil

## 🎯 Quota Optimizasyonu

### Kullanım Azaltma Stratejileri:

#### 1. **Cooldown Artırma**
```typescript
// Mevcut: 30 saniye
// Yüksek kullanımda: 60 saniye
const SORU_COOLDOWN_MS = 30_000;
```

#### 2. **Popüler Soruları Cache'leme**
```typescript
// Sık sorulan soruları Redis'te sakla
const cacheKey = `ai:cache:${questionHash}`;
const cached = await redis.get(cacheKey);
if (cached) return cached;
```

#### 3. **Conversation Memory Limiti**
```typescript
// Mevcut: 3 soru-cevap
// Yüksek kullanımda: 2 soru-cevap
const MAX_CONVERSATION_HISTORY = 3;
```

#### 4. **Token Limiti Azaltma**
```typescript
// Mevcut: 600 token
// Yüksek kullanımda: 400 token
max_tokens: 600
```

## 📈 Kullanım Tahminleri

### Günlük Kullanım Senaryoları:

**Düşük Kullanım (100 aktif oyuncu):**
```
Ortalama: 2 soru/oyuncu/gün
Toplam: 200 istek/gün
Quota: %1.4 (çok güvenli)
```

**Orta Kullanım (500 aktif oyuncu):**
```
Ortalama: 3 soru/oyuncu/gün
Toplam: 1.500 istek/gün
Quota: %10.7 (güvenli)
```

**Yüksek Kullanım (1.000 aktif oyuncu):**
```
Ortalama: 5 soru/oyuncu/gün
Toplam: 5.000 istek/gün
Quota: %35.7 (normal)
```

**Çok Yüksek Kullanım (2.000 aktif oyuncu):**
```
Ortalama: 7 soru/oyuncu/gün
Toplam: 14.000 istek/gün
Quota: %100 (limit)
```

### Dakikalık Burst Senaryoları:

**Normal:**
```
10 oyuncu aynı anda soru sorar
Quota: 10/28 (%35)
Durum: ✅ Sorunsuz
```

**Yoğun:**
```
25 oyuncu aynı anda soru sorar
Quota: 25/28 (%89)
Durum: ⚠️ Limit yakın
```

**Aşırı:**
```
30+ oyuncu aynı anda soru sorar
Quota: 28/28 (%100)
Durum: ❌ Fallback devreye girer
```

## 🚨 Acil Durum Planı

### Quota Dolduğunda:

#### Kısa Vadeli (Aynı Gün):
1. ✅ Fallback responses devreye girer
2. ✅ Oyuncular temel bilgileri alır
3. ✅ Sistem çalışmaya devam eder
4. ⚠️ Kişiselleştirme yok

#### Orta Vadeli (Ertesi Gün):
1. Quota otomatik sıfırlanır (gece yarısı)
2. AI asistan normal çalışmaya döner
3. Kullanım istatistikleri analiz edilir

#### Uzun Vadeli (Sürekli Limit):
1. **Ücretli Plan:** Groq Pro'ya geçiş
   - 14.400 → 1.000.000+ istek/gün
   - Maliyet: ~$0.27/1M token
2. **Alternatif API:** OpenAI, Anthropic
3. **Self-Hosted:** Llama 3.3 70B (GPU gerekli)
4. **Hybrid:** Popüler soruları cache'le

## 📊 Monitoring Dashboard (Gelecek)

### Önerilen Metrikler:
```typescript
interface QuotaMetrics {
  dailyUsage: number;
  dailyLimit: number;
  dailyPercent: number;
  minuteUsage: number;
  minuteLimit: number;
  minutePercent: number;
  fallbackCount: number;
  errorCount: number;
  avgResponseTime: number;
  topQuestions: string[];
}
```

### Alert Thresholds:
- **%50:** 📊 Normal kullanım
- **%70:** ⚠️ Yüksek kullanım (izle)
- **%85:** 🚨 Kritik seviye (optimize et)
- **%95:** 🔴 Acil durum (fallback hazır)

## 🔐 Güvenlik

### Rate Limiting Bypass Önleme:
- ✅ User ID bazlı cooldown (30 saniye)
- ✅ Global quota kontrolü
- ✅ Redis atomic operations
- ✅ Fallback sistemi

### Abuse Önleme:
- ✅ Cooldown sistemi
- ✅ Soru uzunluk limiti (200 karakter)
- ✅ Conversation memory limiti (3 soru)
- ✅ Admin monitoring

---

**Son Güncelleme:** 2026-05-20  
**Versiyon:** 1.0.0  
**Durum:** ✅ Production Ready
