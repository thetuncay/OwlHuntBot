/**
 * ai-qa.ts — Groq API ile oyun içi soru-cevap sistemi
 *
 * Ücretsiz tier: dakikada 30 istek, günde 14.400 istek
 * Model: llama-3.3-70b-versatile (hızlı, Türkçe destekli)
 */

import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';

const SYSTEM_PROMPT = `Sen OwlHuntBot adlı bir Discord RPG botunun yardımcı asistanısın.
Sadece bu oyunla ilgili sorulara Türkçe cevap verirsin.
Oyunla ilgisi olmayan sorulara "Sadece oyunla ilgili sorulara cevap verebilirim." dersin.
Cevapların kısa ve net olsun (maksimum 400 karakter). Emoji kullanabilirsin.

OYUN BİLGİLERİ:

TEMEL DÖNGÜ: Hunt (av) → Sell (sat) → Upgrade (geliştir) → Tame (evcilleştir) → Prestige

KOMUTLAR:
- owl hunt: Baykuşu avlanmaya gönder (7sn cooldown)
- owl sell: Avları sat
- owl upgrade <stat>: Stat geliştir (gaga/goz/kulak/kanat/pence)
- owl tame <id>: Yabani baykuş evcilleştir
- owl stats: Baykuş istatistikleri
- owl quests: Günlük görevler (günde 2.900 coin + 1.150 XP)
- owl market: Global market (Lv.15 gerekli)
- owl craft: Eşya üret
- owl prestige <id>: Baykuşu feda et, kalıcı bonus kazan
- owl vs @oyuncu: PvP meydan okuma
- owl duel: Bot ile duel
- owl cash: Bakiye gör
- owl sk / owl ek: Lootbox aç
- owl soru <soru>: Oyunla ilgili soru sor

BİYOMLAR:
- Kasaba Civarı: Ücretsiz, standart
- Göl Kenarı: 1.500 coin, +%15 yakalama, Lv.5+
- Derin Orman: 2.500 coin, +%30 materyal, nadir hayvan x2, Lv.10+

STAT'LAR: Pence (yakalama en önemli), Gaga (PvP hasar), Göz (encounter), Kulak (tame), Kanat (yakalama)
UPGRADE SIRASI: Pence → Gaga & Kulak → Göz → Kanat

PARA KAZANMA: Hunt+Sell (3.000-8.000/saat), Daily Quest (2.900/gün), Market satışı

PRESTİGE: Lv.30+ ve baykuş ort.stat 80+ gerekir. Her seviye +%5 XP ve +2 stat cap.
Coin ve materyaller korunur, level ve baykuş sıfırlanır.

LOOTBOX: Hunt'tan %5 (eşya), %2 (silah) şansla düşer. Günlük max 5 kutu.
Pity: 6-8 kutu açmadan Rare+ gelmezse garanti.

DAILY QUEST: 10 av (500💰), 3 craft (800💰), 1 tame (1.200💰), 2 market ilanı (400💰)

CRAFTING: 1-Karma Yem (fare×5+serce×2+100💰), 2-Bileme Taşı (KemikTozu×10+ParlakTüy×5+500💰), 3-Yırtıcı İksiri (fare×20+serce×10+1000💰)`;

let groqClient: Groq | null = null;

function getClient(): Groq {
  if (!groqClient) {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY tanımlı değil.');
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Oyuncu sorusunu Groq'a gönderir ve cevap döndürür.
 */
export async function askGameQuestion(question: string): Promise<string> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: question },
    ],
    max_tokens: 300,
    temperature: 0.7,
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? 'Cevap üretilemedi.';
  return text.length > 1024 ? text.slice(0, 1021) + '...' : text;
}
