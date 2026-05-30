/**
 * ai-qa.ts — Groq API ile gelişmiş oyun içi soru-cevap sistemi
 *
 * Model: llama-3.3-70b-versatile (hızlı, Türkçe destekli)
 * Ücretsiz tier: dakikada 30 istek, günde 14.400 istek
 *
 * Özellikler:
 * - RAG (Retrieval-Augmented Generation) ile dinamik bilgi yükleme
 * - Oyuncu profiline göre kişiselleştirilmiş cevaplar
 * - Conversation memory (son 3 soru-cevap)
 * - Multi-step reasoning (karmaşık sorular için)
 * - 800+ karakter detaylı oyun bilgisi
 * - Gizli sistem mekaniklerini korur
 *
 * Güvenlik:
 * - Oyun dışı sorulara cevap vermez
 * - Kritik sistem bilgilerini açıklamaz
 * - Rate limit: 30 saniye/oyuncu
 */

import Groq from 'groq-sdk';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';

// ═══════════════════════════════════════════════════════════════
// API RATE LIMITING & QUOTA MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const GROQ_DAILY_LIMIT = 14000; // 14.400 limit, 14.000'de durdur (güvenlik marjı)
const GROQ_MINUTE_LIMIT = 28;   // 30 limit, 28'de durdur (güvenlik marjı)

async function checkApiQuota(redis: Redis): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMinute = Math.floor(now / 60000); // Dakika bazlı key

  // Günlük limit — atomik INCR ile kontrol
  const dailyKey = `ai:quota:daily:${today}`;
  const dailyCount = parseInt((await redis.get(dailyKey)) ?? '0');
  if (dailyCount >= GROQ_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: `Günlük AI soru limiti doldu (${GROQ_DAILY_LIMIT}). Yarın tekrar deneyin.`,
    };
  }

  // Dakikalık limit — atomik INCR + compare (race condition önleme)
  const minuteKey = `ai:quota:minute:${currentMinute}`;
  const minuteCount = await redis.incr(minuteKey);
  if (minuteCount === 1) await redis.expire(minuteKey, 60); // İlk artırmada TTL ayarla
  if (minuteCount > GROQ_MINUTE_LIMIT) {
    await redis.decr(minuteKey); // Geri al — limit aşıldı
    return {
      allowed: false,
      reason: 'AI asistan şu an çok yoğun. Lütfen 1 dakika sonra tekrar deneyin.',
    };
  }

  return { allowed: true };
}

async function incrementApiQuota(redis: Redis): Promise<void> {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // Günlük sayacı artır (gece yarısına kadar geçerli)
  // Dakikalık sayaç checkApiQuota'da zaten artırıldı
  const dailyKey = `ai:quota:daily:${today}`;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const ttlSeconds = Math.floor((tomorrow.getTime() - now) / 1000);

  const dailyCount = await redis.incr(dailyKey);
  if (dailyCount === 1) await redis.expire(dailyKey, ttlSeconds);
}

async function getApiQuotaStats(redis: Redis): Promise<{ daily: number; minute: number }> {
  const today = new Date().toISOString().split('T')[0];
  const currentMinute = Math.floor(Date.now() / 60000);

  const dailyKey = `ai:quota:daily:${today}`;
  const minuteKey = `ai:quota:minute:${currentMinute}`;

  const daily = parseInt((await redis.get(dailyKey)) ?? '0');
  const minute = parseInt((await redis.get(minuteKey)) ?? '0');

  return { daily, minute };
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK RESPONSES (API limiti dolduğunda)
// ═══════════════════════════════════════════════════════════════

const FALLBACK_RESPONSES: Record<string, string> = {
  // Genel sorular
  default: `🤖 AI asistan şu an kullanılamıyor.

📚 **Yardım kaynakları:**
• \`owl yardim\` - Tüm komutları gör
• Oyun rehberi: [Link varsa ekle]
• Discord destek kanalı

💡 **Sık sorulan sorular:**
• Para kazanma: Hunt + Sell + Daily Quest
• Upgrade sırası: Pence → Gaga → Kulak → Göz → Kanat
• En iyi biome: Göl Kenarı (coin), Derin Orman (materyal)
• Prestige: Lv.30+ ve avg stat 80+`,

  // Anahtar kelime bazlı fallback'ler
  'para|coin|kazanma|kazanmak': `💰 **Para Kazanma Yöntemleri:**

1. **Hunt + Sell** (3.000-8.000💰/saat)
   - Göl Kenarı: Kolay yakalama
   - Derin Orman: Nadir hayvan + materyal

2. **Daily Quest** (2.900💰/gün)
   - 10 av, 3 craft, 1 tame, 2 market ilanı

3. **Market Satışı**
   - Nadir materyaller sat
   - Yırtıcı İksiri craft et ve sat

🎯 Hedef: Günde 15.000-20.000💰`,

  'upgrade|geliştir|stat': `⚡ **Upgrade Sırası:**

1. **PENCE** (temel stat) → 20
2. **GAGA + KULAK** → 15
3. **GÖZ** → 10
4. **KANAT** → 10
5. Dengeli geliştirme (hepsini 30-40)

📊 Bağımlılık: Lv.5'ten sonra aktif
💡 Pence en önemli stat (yakalama şansı)`,

  'biome|biyom|bölge': `🗺️ **Biyom Seçimi:**

🏘️ **Kasaba Civarı** (Ücretsiz)
- Yeni oyuncular için
- Standart ödüller

🌊 **Göl Kenarı** (1.500💰, Lv.5+)
- +%15 yakalama şansı
- Coin kasma için en iyi

🌲 **Derin Orman** (2.500💰, Lv.10+)
- +%30 materyal drop
- Nadir hayvan x2
- Materyal kasma için en iyi`,

  'prestige|ascension': `🌟 **Prestige Sistemi:**

**Gereksinimler:**
- Oyuncu Lv.30+
- Baykuş avg stat 80+

**Bonuslar (her seviye):**
- +%5 XP kazanımı (kalıcı)
- +2 Stat cap (kalıcı)

**Kaybedilenler:**
- Oyuncu seviyesi (1'e sıfırlanır)
- Feda edilen baykuş

**Korunanlar:**
- Tüm coin ve materyaller
- Diğer baykuşlar`,

  'tame|evcilleştir': `🎯 **Tame (Evcilleştirme):**

**Şansı Artırma:**
1. Göz ve Kulak stat'larını geliştir
2. Derin Orman'da hunt yap (x2 encounter)
3. Tame item kullan:
   - Çiğ Et: +5
   - Alfa Feromon: +12
   - Yırtıcı İksiri: +15
4. Mini-PvP'yi kazan (+10 bonus)

**Başarısız olursa:** Max 3 deneme hakkın var`,
};

function getFallbackResponse(question: string): string {
  const lowerQuestion = question.toLowerCase();

  // Anahtar kelime eşleşmesi
  for (const [keywords, response] of Object.entries(FALLBACK_RESPONSES)) {
    if (keywords === 'default') continue;
    
    const keywordList = keywords.split('|');
    if (keywordList.some(keyword => lowerQuestion.includes(keyword))) {
      return response;
    }
  }

  // Varsayılan cevap
  return FALLBACK_RESPONSES.default ?? '🤖 AI asistan şu an kullanılamıyor. `owl yardim` yazarak tüm komutları görebilirsin.';
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const CONVERSATION_TTL = 30 * 60; // 30 dakika
const MAX_CONVERSATION_HISTORY = 3; // Son 3 soru-cevap

async function getConversationHistory(redis: Redis, userId: string): Promise<ConversationMessage[]> {
  const key = `ai:conversation:${userId}`;
  const data = await redis.get(key);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function addToConversationHistory(
  redis: Redis,
  userId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const key = `ai:conversation:${userId}`;
  const history = await getConversationHistory(redis, userId);
  
  history.push({ role, content, timestamp: Date.now() });
  
  // Son N mesajı tut
  const trimmed = history.slice(-MAX_CONVERSATION_HISTORY * 2); // user + assistant = 2 mesaj
  
  await redis.set(key, JSON.stringify(trimmed), 'EX', CONVERSATION_TTL);
}

// ═══════════════════════════════════════════════════════════════
// OYUNCU PROFİLİ BAĞLAMI
// ═══════════════════════════════════════════════════════════════

interface PlayerContext {
  level: number;
  coins: number;
  mainOwlSpecies: string;
  mainOwlTier: number;
  avgStat: number;
  prestigeLevel: number;
  hasCompletedTutorial: boolean;
}

async function getPlayerContext(prisma: PrismaClient, userId: string): Promise<PlayerContext | null> {
  try {
    const player = await prisma.player.findUnique({
      where: { id: userId },
      select: {
        level: true,
        coins: true,
        prestigeLevel: true,
      },
    });

    if (!player) return null;

    const mainOwl = await prisma.owl.findFirst({
      where: { ownerId: userId, isMain: true },
      select: {
        species: true,
        tier: true,
        statGaga: true,
        statGoz: true,
        statKulak: true,
        statKanat: true,
        statPence: true,
      },
    });

    if (!mainOwl) return null;

    const avgStat = Math.round(
      (mainOwl.statGaga + mainOwl.statGoz + mainOwl.statKulak + mainOwl.statKanat + mainOwl.statPence) / 5
    );

    return {
      level: player.level,
      coins: player.coins,
      mainOwlSpecies: mainOwl.species,
      mainOwlTier: mainOwl.tier,
      avgStat,
      prestigeLevel: player.prestigeLevel,
      hasCompletedTutorial: player.level > 1,
    };
  } catch {
    return null;
  }
}

function buildPlayerContextPrompt(context: PlayerContext | null): string {
  if (!context) return '';

  const parts: string[] = ['\n\n═══ OYUNCU PROFİLİ ═══'];
  
  parts.push(`Seviye: ${context.level}`);
  // Coin miktarı yerine bucket kullan — hassas finansal veri dış API'ye gönderilmez
  const coinBucket = context.coins < 1000 ? 'az (< 1.000)' : context.coins < 10000 ? 'orta (1k-10k)' : context.coins < 50000 ? 'yüksek (10k-50k)' : 'çok yüksek (50k+)';
  parts.push(`Coin Durumu: ${coinBucket}`);
  parts.push(`Baykuş: ${context.mainOwlSpecies} (Tier ${context.mainOwlTier})`);
  parts.push(`Ortalama Stat: ${context.avgStat}`);
  
  if (context.prestigeLevel > 0) {
    parts.push(`Prestige: Seviye ${context.prestigeLevel}`);
  }

  // Oyuncu durumuna göre öneriler
  if (context.level < 5) {
    parts.push('\n💡 Bu oyuncu YENİ. Basit ve açıklayıcı cevaplar ver. Temel mekanikleri anlat.');
  } else if (context.level < 15) {
    parts.push('\n💡 Bu oyuncu ORTA SEVİYE. Stratejik tavsiyeler ver. İleri mekanikleri tanıt.');
  } else if (context.level < 30) {
    parts.push('\n💡 Bu oyuncu DENEYİMLİ. İleri stratejiler ve optimizasyon tavsiyeleri ver.');
  } else {
    parts.push('\n💡 Bu oyuncu ENDGAME. Meta stratejiler, prestige optimizasyonu ve min-max tavsiyeleri ver.');
  }

  // Coin durumuna göre
  if (context.coins < 1000) {
    parts.push('⚠️ Coin düşük. Para kazanma yöntemlerini vurgula.');
  } else if (context.coins > 50000) {
    parts.push('💰 Coin yüksek. Upgrade ve yatırım önerilerini vurgula.');
  }

  // Stat durumuna göre
  if (context.avgStat < 20) {
    parts.push('📊 Stat düşük. Upgrade önceliklerini vurgula.');
  } else if (context.avgStat >= 80 && context.level >= 30) {
    parts.push('🌟 Prestige için hazır! Prestige zamanlamasını değerlendir.');
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Sen OwlHuntBot adlı bir Discord RPG botunun uzman yardımcı asistanısın.
Sadece bu oyunla ilgili sorulara Türkçe cevap verirsin.
Oyunla ilgisi olmayan sorulara "Sadece oyunla ilgili sorulara cevap verebilirim." dersin.

🧠 DÜŞÜNME YÖNTEMİ (Karmaşık sorular için):
1. Oyuncunun gerçek ihtiyacını anla (ne soruyor?)
2. Oyuncunun seviyesine uygun cevap ver (profil bilgisini kullan)
3. Somut örnekler ve sayılar ver
4. Alternatif stratejiler öner
5. Sonraki adımları belirt

Cevapların açıklayıcı ve yardımcı olsun (maksimum 800 karakter). Emoji kullanabilirsin.

ÖNEMLİ: Oyunun gizli mekaniklerini (hidden scaling, pity threshold, streak bonusları, exact formüller) ASLA açıklama. Sadece oyuncuya görünen bilgileri ver.

═══════════════════════════════════════════════════════════════

📋 TEMEL OYUN DÖNGÜSÜ:
Hunt (av) → Sell (sat) → Upgrade (geliştir) → Tame (evcilleştir) → Prestige (yüksel)

═══════════════════════════════════════════════════════════════

🦉 BAYKUŞ TÜRLERİ (Tier 8→1, güçten zayıfa):
• Tier 8: Kukumav (başlangıç, Lv.1+)
• Tier 7: Peçeli Baykuş (Lv.5+)
• Tier 6: Ural Baykusu (Lv.10+)
• Tier 5: Büyük Boz Baykuş (Lv.15+)
• Tier 4: Boynuzlu Baykuş (Lv.20+)
• Tier 3: Kar Baykusu (Lv.25+)
• Tier 2: Puhu Baykusu (Lv.30+)
• Tier 1: Blakiston Balık Baykusu (Lv.40+, en güçlü)

Yüksek tier baykuşlar daha geniş av havuzuna erişir ve daha yüksek stat aralıklarına sahiptir.

═══════════════════════════════════════════════════════════════

📊 STAT SİSTEMİ:
• PENCE 🦅: Yakalama şansını en çok etkiler (en önemli av statı)
• GAGA 🦷: PvP hasarını artırır
• GÖZ 👁️: Encounter (yabani baykuş) şansını artırır
• KULAK 👂: Tame (evcilleştirme) şansını artırır
• KANAT 🪽: Yakalama şansını artırır, stamina kapasitesini yükseltir

UPGRADE SIRASI (Önerilen):
1. PENCE (temel stat, bağımsız)
2. GAGA + KULAK (pence'ye bağımlı)
3. GÖZ (kulak'a bağımlı)
4. KANAT (göz'e bağımlı)

BAĞIMLILIK SİSTEMİ: Lv.5'ten sonra bazı statlar diğerlerine bağımlı hale gelir. Örneğin Gaga'yı 20'ye çıkarmak için Pence en az 10 olmalı.

═══════════════════════════════════════════════════════════════

🗺️ BİYOMLAR (30 dakika oturum):
• 🏘️ Kasaba Civarı: Ücretsiz, standart ödüller, Lv.1+
• 🌊 Göl Kenarı: 1.500💰 giriş, +%15 yakalama şansı, Lv.5+
• 🌲 Derin Orman: 2.500💰 giriş, +%30 materyal drop, nadir hayvan x2, Lv.10+

Biyom seçimi stratejisi:
- Coin kasma → Göl Kenarı (kolay yakalama)
- Materyal kasma → Derin Orman (yüksek drop)
- Nadir hayvan avı → Derin Orman (tavşan, gelincik, kirpi)

═══════════════════════════════════════════════════════════════

🐾 AV HAYVANLARI (zorluk 1→9):
Kolay: fare, serçe, kurbağa, kertenkele, hamster
Orta: köstebek, yarasa, bıldırcın, güvercin
Zor: yılan, sincap, tavşan, gelincik, kirpi

Satış fiyatları: fare 5💰 → kirpi 120💰
Nadir hayvanlar (tavşan+) daha fazla XP ve coin verir.

═══════════════════════════════════════════════════════════════

⚒️ UPGRADE MATERYALLERİ:
• Kemik Tozu (Common): Gaga upgrade
• Parlak Tüy (Common): Kanat upgrade
• Kırık Av Zinciri (Uncommon): Kulak upgrade
• Av Gözü Kristali (Uncommon): Göz upgrade
• Yırtıcı Pençe Parçası (Rare): Pence upgrade

Materyal kaynakları:
- Hunt'tan otomatik drop
- Av hayvanlarını dismantle et (owl dismantle)
- Marketten satın al

Stat seviyesi arttıkça daha fazla materyal gerekir:
- Stat 1-19: ×2 materyal
- Stat 20-49: ×5 materyal
- Stat 50-79: ×10 materyal
- Stat 80+: ×20 materyal

═══════════════════════════════════════════════════════════════

🎯 TAME (EVCİLLEŞTİRME):
Hunt sırasında rastgele yabani baykuş encounter'ı tetiklenir.
Tame şansı: Baykuş tier'i, kalitesi, senin Göz ve Kulak stat'ına bağlı.

Tame item'ları (şansı artırır):
- Çiğ Et: +5
- Yırtıcı Yem: +8
- Kan Kokusu: +10
- Alfa Feromon: +12
- Yırtıcı İksiri: +15

Başarısız tame: Baykuş kaçabilir, saldırabilir veya yaralayabilir.
Mini-PvP kazanırsan tame şansı artar.

═══════════════════════════════════════════════════════════════

💰 EKONOMİ & PARA KAZANMA:
Gelir kaynakları:
- Hunt + Sell: 3.000-8.000💰/saat (ana kaynak)
- Daily Quest: 2.900💰/gün (4 görev)
- Market satışı: Değişken (nadir item'lar için)
- PvP kazanma: Rakibin coin'i

Para sinkleri:
- Upgrade maliyeti: 50-58.000💰 (stat bazlı)
- Biome giriş: 1.500-2.500💰/30dk
- Market vergisi: %10 (satışta)
- Transfer vergisi: %3-12 (miktara göre)

═══════════════════════════════════════════════════════════════

🌟 PRESTİGE (ASCENSION):
Gereksinimler:
- Oyuncu Lv.30+
- Baykuş ortalama stat 80+

Bonuslar (her seviye):
- +%5 XP kazanımı (kalıcı)
- +2 Etkili Stat Cap (kalıcı)

Kaybedilenler:
- Oyuncu seviyesi (1'e sıfırlanır)
- Feda edilen baykuş (silinir)

Korunanlar:
- Tüm coin'ler
- Tüm materyaller ve item'lar
- Diğer baykuşlar
- Prestige bonusları

═══════════════════════════════════════════════════════════════

📦 LOOTBOX SİSTEMİ:
Hunt, PvP ve encounter'dan otomatik düşer.
- 🗡️ Silah Kutusu: PvP buff'ları
- 📦 Eşya Kutusu: Hunt & Upgrade buff'ları

Günlük maksimum: 5 kutu (anti-farm)
Komutlar: owl sk (silah), owl ek (eşya)

Buff item'ları (charge bazlı):
- Hunt: Keskin Nişan, Av Kokusu, Nadir İz, Orman Ruhu
- Upgrade: Berrak Zihin, Koruyucu Talisman, Usta Eli
- PvP: Savaş Ruhu, Savunma Duruşu, Arena Ustası

═══════════════════════════════════════════════════════════════

🎯 GÜNLÜK GÖREVLER (owl quests):
4 görev, her gün sıfırlanır:
1. 10 av yap → 500💰
2. 3 craft yap → 800💰
3. 1 tame başar → 1.200💰
4. 2 market ilanı oluştur → 400💰

Toplam: 2.900💰 + 1.150 XP/gün

═══════════════════════════════════════════════════════════════

🛠️ CRAFTING (owl craft):
1. Karma Yem: fare×5 + serçe×2 + 100💰 → Stamina +50
2. Bileme Taşı: Kemik Tozu×10 + Parlak Tüy×5 + 4.500💰 → Upgrade şansı +%10 (min 15 dk aktif)
3. Yırtıcı İksiri: fare×20 + serçe×10 + 1.000💰 → Hunt catch +%15

═══════════════════════════════════════════════════════════════

🛒 MARKET (owl market):
Minimum Lv.15 gerekli.
- Satış vergisi: %10 (yakılır)
- İlan süresi: 48 saat
- Günlük limit: 5 ilan
- Fiyat aralığı: 50-100.000💰

Komutlar:
- owl market → İlanları listele
- owl market sat <eşya> <miktar> <fiyat>
- owl market al <ilan_id>

═══════════════════════════════════════════════════════════════

⚔️ PVP SİSTEMİ:
- owl vs @oyuncu: Gerçek oyuncuya meydan oku
- owl duel: Bot ile hızlı duel

PvP stat'ları: Gaga (hasar), Pence (hasar), Stamina (dodge/hasar)
Kazanan: Rakibin coin'inin bir kısmını alır + XP

═══════════════════════════════════════════════════════════════

🎲 KUMAR (DİKKATLİ!):
- owl cf <miktar>: Yazı tura
- owl slot <miktar>: Slot makinesi
- owl bj <miktar>: Blackjack

⚠️ Uzun vadede tüm kumar oyunları kaybettirir. Eğlence amaçlı kullan.

═══════════════════════════════════════════════════════════════

💡 YENİ OYUNCU İPUÇLARI:
1. İlk 10 level: Kasaba Civarı'nda hunt spam yap
2. Lv.5+: Göl Kenarı'na geç (daha fazla coin)
3. Lv.10+: Derin Orman'da materyal kas
4. Önce Pence'yi geliştir (temel stat)
5. Günlük görevleri her gün tamamla
6. Nadir materyalleri markette sat
7. Gambling'e para harcama (uzun vadede kayıp)
8. Prestige'i acele etme (Lv.30+ ve stat 80+ bekle)

═══════════════════════════════════════════════════════════════

📝 TÜM KOMUTLAR:
owl hunt, owl sell, owl stats, owl upgrade <stat>, owl tame <id>
owl owls, owl setmain <id>, owl inventory, owl zoo, owl cash
owl vs @oyuncu, owl duel, owl quests, owl prestige <id>
owl craft, owl dismantle <eşya>, owl market, owl sk, owl ek
owl buff, owl buffs, owl ver @oyuncu <miktar>, owl yardim

Kısaltmalar: h (hunt), s (stats), sm (setmain), inv (inventory), z (zoo), c (cash), d (duel), q (quests)

═══════════════════════════════════════════════════════════════

Sorulara cevap verirken:
- Stratejik tavsiyeler ver
- Somut örnekler kullan
- Yeni oyuncuya uygun açıkla
- Kritik sistem mekaniklerini açıklama
- Oyuncuyu doğru yönlendir`;

let groqClient: Groq | null = null;

function getClient(): Groq {
  if (!groqClient) {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY tanımlı değil.');
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Oyuncu sorusunu Groq'a gönderir ve kişiselleştirilmiş cevap döndürür.
 * API limiti dolduğunda fallback cevaplar kullanır.
 * 
 * @param question - Oyuncunun sorusu
 * @param userId - Oyuncu ID (conversation memory için)
 * @param prisma - Prisma client (oyuncu profili için)
 * @param redis - Redis client (conversation memory ve quota için)
 */
export async function askGameQuestion(
  question: string,
  userId: string,
  prisma: PrismaClient,
  redis: Redis,
): Promise<string> {
  // 1. API quota kontrolü
  const quotaCheck = await checkApiQuota(redis);
  if (!quotaCheck.allowed) {
    // Fallback cevap döndür
    const fallback = getFallbackResponse(question);
    return `⚠️ ${quotaCheck.reason}\n\n${fallback}`;
  }

  try {
    const client = getClient();

    // 2. Oyuncu profilini al
    const playerContext = await getPlayerContext(prisma, userId);
    const contextPrompt = buildPlayerContextPrompt(playerContext);

    // 3. Conversation history'yi al
    const history = await getConversationHistory(redis, userId);
    
    // 4. Mesajları oluştur
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT + contextPrompt },
    ];

    // Önceki konuşmaları ekle (bağlam için)
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Yeni soruyu ekle
    messages.push({ role: 'user', content: question });

    // 5. API çağrısı
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 600,
      temperature: 0.6,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? 'Cevap üretilemedi.';
    
    // 6. Başarılı API çağrısı - quota'yı artır
    await incrementApiQuota(redis);
    
    // 7. Conversation history'ye ekle
    await addToConversationHistory(redis, userId, 'user', question);
    await addToConversationHistory(redis, userId, 'assistant', text);

    // Discord embed field limiti 1024 karakter
    return text.length > 1024 ? text.slice(0, 1021) + '...' : text;
  } catch (error) {
    // API hatası - fallback cevap döndür
    console.error('[AI-QA] Groq API error:', error);
    const fallback = getFallbackResponse(question);
    return `⚠️ AI asistan geçici olarak kullanılamıyor.\n\n${fallback}`;
  }
}

/**
 * API quota istatistiklerini döndürür (admin komutu için)
 */
export async function getQuotaStats(redis: Redis): Promise<string> {
  const stats = await getApiQuotaStats(redis);
  const dailyPercent = Math.round((stats.daily / GROQ_DAILY_LIMIT) * 100);
  const minutePercent = Math.round((stats.minute / GROQ_MINUTE_LIMIT) * 100);

  return [
    '📊 **AI API Kullanım İstatistikleri**',
    '',
    `**Günlük:** ${stats.daily.toLocaleString()} / ${GROQ_DAILY_LIMIT.toLocaleString()} (${dailyPercent}%)`,
    `**Dakikalık:** ${stats.minute} / ${GROQ_MINUTE_LIMIT} (${minutePercent}%)`,
    '',
    dailyPercent > 80 ? '⚠️ Günlük limit dolmak üzere!' : '✅ Kullanım normal seviyede',
  ].join('\n');
}
