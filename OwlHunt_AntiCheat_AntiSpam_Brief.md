# OwlHunt — Anti-Cheat & Anti-Spam Koruma Sistemi
## Cursor AI Implementasyon Brief'i

**Hedef stack:** Node.js (JS, ileride TypeScript'e taşınabilir) · discord.js · PostgreSQL (durable veri) · Redis (hot-path sayaçlar, opsiyonel ama önerilir)

**Bu belgenin amacı:** OwO bot ve benzeri "grind/economy" tipi Discord botlarının kamuya açık, gözlemlenebilir koruma davranışlarını referans alarak, OwlHunt'ın pazar/ekonomi sistemini macro, selfbot, spam ve çoklu-hesap istismarına karşı koruyacak; production-ready, katmanlı bir anti-cheat & anti-spam mimarisi tanımlamak. Cursor AI bu dosyayı tek kaynak (single source of truth) olarak kullanıp modülleri sırasıyla kodlayabilir.

---

## 0. Önemli Metodolojik Not

OwO bot **kapalı kaynaktır**; iç algoritmaları, eşik değerleri (threshold) ve skor formülleri yayınlanmamıştır. Aşağıdaki "Araştırma" bölümü, resmi SSS/wiki sayfaları, topluluk gözlemleri ve kullanıcı deneyimlerinden **çıkarılabilen davranışsal kalıpları** özetler — bunlar kesin kaynak kod tasviri değil, **tasarım ilhamı**dır. Bölüm 2'den itibaren olan mimari ise bu kalıplardan ilham alan, sıfırdan tasarlanmış, OwlHunt'a özgü somut bir sistemdir.

---

## 1. Araştırma Özeti — Bilinen Koruma Davranışları

### 1.1 Cooldown / Rate Limiting Katmanı
OwO Bot komut spam'ini önlemek için global ve komut-bazlı kısa bekleme süreleri (cooldown) uygular; örneğin "owo" tetikleyici ödülü yaklaşık 10 saniyede bir verilir, hunt gibi komutlarda saniyenin birkaç katından daha hızlı art arda gönderim anti-spam filtresini tetikleyebilir.OwO Bot imposes short global cooldowns on commands to prevent spam, meaning rapid command input causes the bot to ignore the user briefly or respond with a rate-limit warning, with the "owo" trigger reward limited to roughly every 10 seconds and hunting commands triggering the anti-spam filter if sent faster than about once every 2 seconds.

**Çıkarım:** Cooldown tek başına yeterli değil — sert (hard) cooldown'lar legit kullanıcıyı da yavaşlatır. Bu yüzden yumuşak (soft) ve sert (hard) limit ayrımı gerekir (bkz. Bölüm 5.1).

### 1.2 Macro / Selfbot Tespiti ve Kademeli Ceza
Otomasyon araçları (macro/selfbot) ile komut göndermek otomatik olarak tespit edilir ve geçici veya kalıcı yasaklamayla sonuçlanır; yasak süresi her tekrarda katlanarak (exponential) artar, moderatörler de manuel olarak kalıcı ban uygulayabilir.Macros and bots are automatically detected through the OwO Bot and will result in a temporary or permanent ban from using the bot, with the banned time increasing exponentially and bot mods able to permanently ban a user. Aynı davranış başka bir kaynakta da doğrulanır: the use of macros or self-bots to automate commands is strictly forbidden because the bot actively detects this and will ban users for increasing durations or even permanently.

**Çıkarım:** Ceza sistemi **sayaç hafızalı (stateful)** olmalı — "kaçıncı ihlal" bilgisi kalıcı tutulup süre buna göre üstel olarak büyütülmeli (bkz. Bölüm 5.7).

### 1.3 Doğrulama / Challenge Sistemi
Şüpheli aktivite tespit edildiğinde kullanıcıya DM (özel mesaj) üzerinden bir doğrulama adımı gönderilir; kullanıcı DM'lerini kapalı tutarsa doğrulamayı tamamlayamaz.When verification is triggered, the bot indicates it has sent a DM to verify the user, and the user must have DMs enabled on at least one shared server to receive it.

Kamuya açık bilgi olarak, bu tarz basit görsel/metin doğrulama adımlarını otomatik çözmeye çalışan üçüncü parti araçların var olduğu biliniyor. Bu, tek katmanlı ve statik bir doğrulama adımının zamanla aşılabileceğini, dolayısıyla **doğrulamanın tek başına değil, davranışsal sinyallerle birlikte** kullanılması gerektiğini gösteriyor.

**Çıkarım:** OwlHunt için klasik "resimdeki harfleri yaz" tarzı CAPTCHA yerine **Discord-native interaktif challenge** (buton sırası, select-menu eşleştirme) tercih edilmeli — bkz. Bölüm 5.3'teki gerekçe.

### 1.4 Ödül Throttling — "XP Ban" Modeli
Profil XP'si mesaj başına kazanılır (yaklaşık 10–15 XP/mesaj, dakikalık cooldown ile), ancak spam mesaj, tekrarlayan aynı mesaj veya otomatikleşmiş görünen mesajlaşma kalıpları tespit edildiğinde kullanıcı geçici ve **rastgele süreli** bir "xp ban"a girer.Profile experience is earned through messages at 10-15xp per message per minute, but spamming messages, using the same messages, only using bot commands, or sending messages in an almost automated fashion eventually leads to a temporary "xp ban" where users are unable to gain profile experience for a random and unnoticeable duration. Bu kısıtlama sırasında kullanıcı arayüzünde ban olduğuna dair açık bir gösterge yoktur — kullanıcı yalnızca XP'sinin artmadığını fark ederek şüphelenir.Users can only tell they are xp banned by checking their XP regularly, since if it stops increasing they are likely affected, with channel-switching offered as a community workaround. Aynı throttle mekanizması başka bir kaynakta da "anti-spam XP cezası" olarak doğrulanıyor.OwO has an anti-spam XP penalty known as an "xp ban" that temporarily stops a user from gaining profile XP if they try to game the leveling system.

**Çıkarım:** Bu, anti-cheat tasarımında çok güçlü bir prensip: **"sessiz ceza" (silent throttle)**. Kullanıcıya "tespit edildin" demek yerine ödülü arka planda kısmak, hem kötüye kullanan kişinin sistemi kalibre etmesini zorlaştırır hem de gri-alan (borderline) kullanıcıları doğrudan banlamadan caydırır. OwlHunt'ta bunu **reward throttle** katmanı olarak modelliyoruz (Bölüm 5.4).

### 1.5 Ekonomik İstismara Sıfır Tolerans (RMT)
Sanal para biriminin gerçek parayla alınıp satılması (real-money trading) tespit edildiğinde çok uzun süreli (binlerce saat) banlar uygulandığı bildirilmiştir.Reports surfaced of third-party sellers offering OwO currency for cash, and developers responded by banning anyone involved in real-money trading with notoriously long bans numbering in the tens of thousands of hours.

**Çıkarım:** Ekonomi sistemine bağlı botlarda (OwlHunt'ın pazar/marketplace sistemi dahil) **işlem bazlı anomali tespiti** ayrı bir öncelik olmalı — bkz. Bölüm 5.6'daki pazar-özel istismar senaryoları.

### 1.6 Discord Bot API'sinin Gerçekçi Sınırları (Kritik!)
Discord bot'ları **kullanıcının IP adresine, cihaz parmak izine, tarayıcı bilgisine veya konum verisine erişemez.** Bu veriler yalnızca Discord'un kendi sunucu-taraflı login/web altyapısında bulunur ve hiçbir bot tokenı ile elde edilemez. Bu nedenle:

- "IP bazlı çoklu hesap tespiti" gerçekçi bir hedef **değildir** — bunu vaat eden bir tasarım yanlış beklenti yaratır.
- Çoklu hesap tespiti, yalnızca **bot API'sinden erişilebilen** sinyallere dayanmalıdır: hesap yaşı, sunucuya katılma zamanı korelasyonu, mesaj/komut zamanlama kalıpları, ortak davet kaynağı, pazar işlem grafiği gibi **davranışsal ve sosyal-graf** verileri (bkz. Bölüm 5.6).

---

## 2. Genel Mimari — Katmanlı Savunma (Defense in Depth)

Tek bir "anti-cheat fonksiyonu" yerine, her biri bağımsız çalışabilen ve birlikte güçlenen 7 katman öneriyoruz:

| # | Katman | Amaç | Tepki Hızı |
|---|--------|------|-----------|
| 1 | **Rate Limiter** (Cooldown Engine) | Ham spam'i anlık engelle | Milisaniyeler (Redis) |
| 2 | **Davranışsal Anomali Analizi** | Zamanlama kalıplarından bot/macro şüphesi üret | Saniyeler–dakikalar (rolling window) |
| 3 | **Challenge-Response (Doğrulama)** | Şüpheli kullanıcıyı insan olduğunu kanıtlamaya zorla | Anlık, kullanıcı etkileşimli |
| 4 | **Reward Throttle** ("XP Ban" analogu) | Şüpheliyi banlamadan ödülünü sessizce kıs | Arka planda, kullanıcıya görünmez |
| 5 | **Trust Score Motoru** | Tüm sinyalleri tek bir kompozit skora indirger | Sürekli güncellenen, kalıcı |
| 6 | **Çoklu Hesap / Pazar Anomali Tespiti** | Alt hesap istismarı ve pazar manipülasyonunu yakala | Periyodik batch analiz |
| 7 | **Punishment Engine + Audit + Appeal** | Kademeli ceza uygula, her şeyi logla, itiraz yolu sağla | Anlık ceza + kalıcı log |

Akış şeması (yüksek seviye):

```
Kullanıcı komutu → [1] Rate Limiter ──(limit aşıldı)──► soft warning / hard block
                         │ (geçti)
                         ▼
                   [2] Davranışsal Analiz ──(şüpheli)──► trustScore.penalize()
                         │
                         ▼
                   [5] Trust Score güncellenir
                         │
              ┌──────────┼──────────────┐
       skor düşük    skor orta      skor normal
              │            │              │
              ▼            ▼              ▼
       [3] Challenge   [4] Reward      Komut normal
       tetiklenir      Throttle         şekilde işlenir
       (insan kanıtı)  (sessiz kısıtlama)
              │
       başarısız ──► [7] Punishment Engine (kademeli ceza) + [Audit Log]
```

[6] Çoklu Hesap / Pazar Anomali Tespiti bu akışın **dışında**, periyodik bir batch job olarak çalışır ve bulgularını doğrudan Trust Score'a ve Punishment Engine'e besler.

---

## 3. Veritabanı Şeması

### 3.1 Redis — Hot Path (yüksek frekanslı, geçici veri)
```
ratelimit:{userId}:{commandName}        → token bucket state (TTL ile)
behavior:intervals:{userId}:{command}   → son N komutun timestamp listesi (LIST, capped)
captcha:session:{userId}                → aktif challenge state (TTL: 60-120sn)
trust:cache:{userId}                    → trust score'un sık okunan cache kopyası (TTL: 5dk)
```

### 3.2 PostgreSQL — Durable (kalıcı, sorgulanabilir veri)

```sql
-- Kullanıcı güven skoru ve özet durumu
CREATE TABLE anticheat_trust (
    user_id            BIGINT PRIMARY KEY,
    trust_score        SMALLINT NOT NULL DEFAULT 100,   -- 0-100, 100 = tam güvenilir
    violation_count    INTEGER NOT NULL DEFAULT 0,
    last_violation_at  TIMESTAMPTZ,
    is_reward_throttled BOOLEAN NOT NULL DEFAULT FALSE,
    throttle_until     TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Her şüpheli/ihlal olayının tam kaydı (audit trail)
CREATE TABLE anticheat_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    guild_id        BIGINT,
    event_type      TEXT NOT NULL,      -- 'rate_limit' | 'behavior_anomaly' | 'captcha_failed'
                                         -- | 'reward_throttled' | 'multi_account_flag' | 'manual_review'
    severity        SMALLINT NOT NULL,  -- 1 (bilgi) - 5 (kritik)
    detail          JSONB NOT NULL,     -- ham sinyal verisi (intervals, scores, vs.)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_anticheat_events_user ON anticheat_events (user_id, created_at DESC);

-- Kademeli ceza geçmişi
CREATE TABLE anticheat_punishments (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    tier            SMALLINT NOT NULL,       -- 1=warning .. 5=permaban
    reason          TEXT NOT NULL,
    duration_seconds BIGINT,                 -- NULL = kalıcı
    issued_by       TEXT NOT NULL DEFAULT 'system', -- 'system' | moderator user_id
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,
    appealed        BOOLEAN NOT NULL DEFAULT FALSE,
    overturned      BOOLEAN NOT NULL DEFAULT FALSE
);

-- Pazar/işlem grafiği — alt hesap & manipülasyon tespiti için
CREATE TABLE marketplace_tx_graph (
    id              BIGSERIAL PRIMARY KEY,
    seller_id       BIGINT NOT NULL,
    buyer_id        BIGINT NOT NULL,
    item_id         TEXT NOT NULL,
    price           BIGINT NOT NULL,
    market_avg_price BIGINT,             -- işlem anındaki ortalama fiyat (sapma hesaplamak için)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_pair ON marketplace_tx_graph (seller_id, buyer_id);

-- İtiraz (appeal) kayıtları
CREATE TABLE anticheat_appeals (
    id              BIGSERIAL PRIMARY KEY,
    punishment_id   BIGINT REFERENCES anticheat_punishments(id),
    user_id         BIGINT NOT NULL,
    message         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected'
    reviewed_by     BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);
```

---

## 4. Proje / Modül Yapısı (Node.js + discord.js)

```
src/
  anticheat/
    index.js                  // public API: anticheat.checkCommand(interaction)
    rateLimiter.js             // Katman 1
    behaviorAnalyzer.js        // Katman 2
    captchaManager.js          // Katman 3
    rewardThrottle.js          // Katman 4
    trustScore.js              // Katman 5
    multiAccountHeuristics.js  // Katman 6
    punishmentEngine.js        // Katman 7
    auditLogger.js             // ortak logging
    config/
      thresholds.js            // TÜM eşik değerleri tek dosyada (tuning kolaylığı)
    ui/
      captchaComponents.js     // buton/select-menu challenge UI'ları
      modReviewPanel.js        // moderasyon paneli embed+component'leri
  middleware/
    commandInterceptor.js      // her komuttan önce anticheat.checkCommand() çağırır
  commands/
    mod/
      anticheatReview.js       // /anticheat review @user
      anticheatOverride.js     // /anticheat override @user
    appeal/
      appealModal.js           // itiraz formu (Modal)
```

**Entegrasyon noktası:** Mevcut `renderMarketScreen` mimarinize benzer şekilde, tüm komut işleyicileri `commandInterceptor.js` üzerinden geçmeli. Bu, pazar sisteminizdeki `customId` state-encoding deseniyle tutarlı bir "merkezi giriş noktası" prensibidir — anticheat kontrolü de aynı felsefeyle tek bir merkezi middleware'den geçmelidir.

---

## 5. Bileşen Detayları

### 5.1 Rate Limiter — Token Bucket (Redis)

İki seviyeli limit öneriyoruz: **soft limit** (kullanıcıyı yavaşlatır, ceza yazmaz) ve **hard limit** (anomali sinyali üretir).

```js
// src/anticheat/rateLimiter.js
const COMMAND_LIMITS = {
  hunt:    { capacity: 1, refillMs: 2000,  hardCapacity: 3,  hardWindowMs: 2000 },
  battle:  { capacity: 1, refillMs: 3000,  hardCapacity: 3,  hardWindowMs: 3000 },
  pazar:   { capacity: 2, refillMs: 1000,  hardCapacity: 6,  hardWindowMs: 2000 },
  default: { capacity: 1, refillMs: 1500,  hardCapacity: 4,  hardWindowMs: 1500 },
};

async function checkRateLimit(redis, userId, commandName) {
  const cfg = COMMAND_LIMITS[commandName] ?? COMMAND_LIMITS.default;
  const key = `ratelimit:${userId}:${commandName}`;
  const now = Date.now();

  // Basit token bucket: Redis'te (tokens, lastRefill) tutuyoruz
  const bucket = await redis.hgetall(key);
  let tokens = bucket.tokens ? parseFloat(bucket.tokens) : cfg.capacity;
  const lastRefill = bucket.lastRefill ? parseInt(bucket.lastRefill, 10) : now;

  const elapsed = now - lastRefill;
  const refillRate = cfg.capacity / cfg.refillMs;
  tokens = Math.min(cfg.capacity, tokens + elapsed * refillRate);

  if (tokens < 1) {
    return { allowed: false, level: 'soft', retryAfterMs: (1 - tokens) / refillRate };
  }

  tokens -= 1;
  await redis.hset(key, { tokens, lastRefill: now });
  await redis.pexpire(key, cfg.refillMs * 5);

  // Hard limit: kısa pencerede toplam çağrı sayısı (ayrı sayaç)
  const hardKey = `${key}:hardwindow`;
  const hardCount = await redis.incr(hardKey);
  if (hardCount === 1) await redis.pexpire(hardKey, cfg.hardWindowMs);
  if (hardCount > cfg.hardCapacity) {
    return { allowed: true, level: 'hard_violation' }; // komutu işle ama anomali sinyali döndür
  }

  return { allowed: true, level: 'ok' };
}

module.exports = { checkRateLimit, COMMAND_LIMITS };
```

> **Tasarım notu:** `level: 'hard_violation'` döndüğünde komut yine de çalıştırılır, ama bu olay `behaviorAnalyzer`'a ve `trustScore`'a bir penalty olarak iletilir. Sert blok yerine "işle + işaretle" stratejisi, false-positive durumunda kullanıcı deneyimini bozmaz.

---

### 5.2 Davranışsal Anomali Analizi

İnsan girdisi, zamanlama açısından **değişkendir** (reaction time varyansı). Makrolar/selfbot'lar genellikle **çok düzenli aralıklarla** komut gönderir. Bunu **varyasyon katsayısı (coefficient of variation, CV = standart sapma / ortalama)** ile ölçüyoruz.

```js
// src/anticheat/behaviorAnalyzer.js
const WINDOW_SIZE = 12;          // son N komut aralığını analiz et
const MIN_SAMPLES = 6;           // güvenilir analiz için minimum örnek
const SUSPICIOUS_CV_THRESHOLD = 0.12;  // bu eşiğin ALTI = şüpheli derecede düzenli
const SUSPICIOUS_MEAN_MS_FLOOR = 800;  // ortalama bu kadar düşükse insan-altı hız şüphesi artar

function analyzeIntervals(timestamps) {
  if (timestamps.length < MIN_SAMPLES) return { suspicious: false, reason: 'insufficient_data' };

  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0;

  const tooRegular = cv < SUSPICIOUS_CV_THRESHOLD;
  const tooFast = mean < SUSPICIOUS_MEAN_MS_FLOOR;

  return {
    suspicious: tooRegular && tooFast,
    cv,
    meanMs: mean,
    confidence: tooRegular && tooFast ? 'high' : (tooRegular || tooFast ? 'medium' : 'low'),
  };
}

async function recordAndAnalyze(redis, userId, commandName, now = Date.now()) {
  const key = `behavior:intervals:${userId}:${commandName}`;
  await redis.rpush(key, now);
  await redis.ltrim(key, -WINDOW_SIZE, -1);
  await redis.expire(key, 600); // 10 dk hareketsizlikten sonra sıfırla

  const raw = await redis.lrange(key, 0, -1);
  const timestamps = raw.map(Number);
  return analyzeIntervals(timestamps);
}

module.exports = { recordAndAnalyze, analyzeIntervals };
```

> **Kritik uyarı:** Bu yalnızca **tek bir sinyal**. CV düşük olan ama gerçek bir insan da olabilir (örn. metronom gibi ritmik tıklayan biri). Bu yüzden bu analiz **tek başına ceza tetiklememeli**, yalnızca trust score'u düşürmeli ve diğer katmanlarla (challenge, reward throttle) birleşmeli. OwO'nun gözlemlenen davranışı da budur — anında sert ban yerine kademeli tepki.

---

### 5.3 Challenge-Response (Doğrulama) Sistemi

**Tasarım kararı:** Klasik "resimdeki metni oku" CAPTCHA yerine **Discord-native interaktif challenge** kullanıyoruz. Gerekçe:
1. Görsel CAPTCHA üretimi ek altyapı (image generation) gerektirir.
2. OCR/image-to-text servisleriyle otomatik çözülen araçların var olduğu biliniyor — statik görsel doğrulama, zamanla bypass edilebilir bir tek nokta haline gelir.
3. Discord component state'i (buton tıklama sırası, hangi select-menu seçeneğinin seçildiği) bir mesaj içeriğini OCR ile okumaktan çok daha farklı bir etkileşim modeli gerektirir — basit "mesaj gönder" botlarının taklit etmesi daha zordur.
4. Zaten mevcut UI mimarinizle (embed/button/select/modal) birebir uyumludur.

```js
// src/anticheat/captchaManager.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CHALLENGE_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 2;

function generateSequenceChallenge() {
  // Kullanıcıya 4 emoji gösterilir, doğru sırada tıklaması istenir
  const symbols = ['🦉', '🦊', '🐺', '🦅'];
  const shuffled = [...symbols].sort(() => Math.random() - 0.5);
  const correctOrder = [...symbols].sort(() => Math.random() - 0.5);
  return { displayOrder: shuffled, correctOrder };
}

async function issueChallenge(redis, userId) {
  const { displayOrder, correctOrder } = generateSequenceChallenge();
  const sessionKey = `captcha:session:${userId}`;

  await redis.hset(sessionKey, {
    correctOrder: JSON.stringify(correctOrder),
    progress: JSON.stringify([]),
    attempts: 0,
  });
  await redis.pexpire(sessionKey, CHALLENGE_TIMEOUT_MS);

  const row = new ActionRowBuilder().addComponents(
    displayOrder.map((emoji, i) =>
      new ButtonBuilder()
        .setCustomId(`ac_challenge:${userId}:${i}`)
        .setEmoji(emoji)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return {
    content: 'Devam etmeden önce: gösterilen sembolleri **doğru sırayla** tıkla.',
    components: [row],
    ephemeral: true,
  };
}

async function handleChallengeClick(redis, userId, clickedIndexLabel) {
  const sessionKey = `captcha:session:${userId}`;
  const session = await redis.hgetall(sessionKey);
  if (!session.correctOrder) return { status: 'expired' };

  const correctOrder = JSON.parse(session.correctOrder);
  const progress = JSON.parse(session.progress);
  progress.push(clickedIndexLabel);

  const expectedNext = correctOrder[progress.length - 1];
  if (clickedIndexLabel !== expectedNext) {
    const attempts = parseInt(session.attempts, 10) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await redis.del(sessionKey);
      return { status: 'failed' };
    }
    await redis.hset(sessionKey, { progress: JSON.stringify([]), attempts });
    return { status: 'retry', attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  if (progress.length === correctOrder.length) {
    await redis.del(sessionKey);
    return { status: 'success' };
  }

  await redis.hset(sessionKey, { progress: JSON.stringify(progress) });
  return { status: 'continue' };
}

module.exports = { issueChallenge, handleChallengeClick };
```

**Tetikleme koşulu (Bölüm 5.5'teki trust score ile bağlantılı):**
```js
// trustScore <= 40  →  challenge zorunlu (komut bloklanır, önce challenge çözülmeli)
// trustScore 41-65  →  reward throttle (Bölüm 5.4), komut çalışır ama ödül kısılır
// trustScore > 65   →  normal akış
```

---

### 5.4 Reward Throttle — "Sessiz Ceza" Katmanı

OwO'nun XP-ban modelinden ilham alarak: kullanıcıya **görünür bir hata mesajı göstermeden** ödülleri (XP, cowoncy-benzeri para birimi, drop şansı) arka planda kısıyoruz.

```js
// src/anticheat/rewardThrottle.js
const THROTTLE_LEVELS = {
  none:   { rewardMultiplier: 1.0 },
  light:  { rewardMultiplier: 0.5 },   // %50 ödül
  heavy:  { rewardMultiplier: 0.1 },   // %10 ödül
  frozen: { rewardMultiplier: 0.0 },   // ödül yok ama komut "başarılı" görünür
};

function resolveThrottleLevel(trustScore) {
  if (trustScore <= 25) return 'frozen';
  if (trustScore <= 45) return 'heavy';
  if (trustScore <= 65) return 'light';
  return 'none';
}

function applyThrottle(baseReward, trustScore) {
  const level = resolveThrottleLevel(trustScore);
  const { rewardMultiplier } = THROTTLE_LEVELS[level];
  return {
    finalReward: Math.floor(baseReward * rewardMultiplier),
    level,
  };
}

module.exports = { applyThrottle, resolveThrottleLevel, THROTTLE_LEVELS };
```

> **Neden "kullanıcıya gösterme" stratejisi?** Eğer kullanıcı "ödülün kısıtlandı" mesajı görürse, sistemi hangi davranışın tetiklediğini test ederek kalibre edebilir (tam olarak OwO macro topluluklarının captcha-bypass araçları geliştirmesine yol açan döngü). Sessiz throttle, kötüye kullananın "neyin yanlış gittiğini" anlamasını zorlaştırır; bu arada gerçek kullanıcılar için throttle eşiği yeterince yüksek tutulursa (trustScore > 65 normal) deneyim bozulmaz.

---

### 5.5 Trust Score Motoru

Tüm sinyalleri tek bir 0–100 skoruna indirger. Skor **zamanla kendini onarır** (decay/regen) — yani bir kullanıcı belirli bir süre temiz davranırsa skoru kademeli olarak normale döner. Bu, geçici network gecikmesi/yanlış pozitif gibi durumlarda kullanıcıyı sonsuza dek cezalandırmamak için kritik.

```js
// src/anticheat/trustScore.js
const PENALTIES = {
  rate_limit_hard:      -3,
  behavior_anomaly_low:  -5,
  behavior_anomaly_high: -15,
  captcha_failed:        -20,
  manual_flag:           -25,
};

const REGEN_PER_HOUR_CLEAN = 2;   // her temiz saat başına +2 (max 100'e kadar)

async function applyPenalty(db, userId, penaltyType) {
  const delta = PENALTIES[penaltyType] ?? -5;
  const result = await db.query(
    `INSERT INTO anticheat_trust (user_id, trust_score, violation_count, last_violation_at, updated_at)
     VALUES ($1, GREATEST(0, 100 + $2), 1, now(), now())
     ON CONFLICT (user_id) DO UPDATE SET
       trust_score = GREATEST(0, anticheat_trust.trust_score + $2),
       violation_count = anticheat_trust.violation_count + 1,
       last_violation_at = now(),
       updated_at = now()
     RETURNING trust_score, violation_count`,
    [userId, delta]
  );
  return result.rows[0];
}

async function regenerate(db, userId) {
  // Periyodik cron job (örn. saatlik) tarafından çağrılır
  await db.query(
    `UPDATE anticheat_trust
     SET trust_score = LEAST(100, trust_score + $2),
         updated_at = now()
     WHERE user_id = $1
       AND last_violation_at < now() - interval '1 hour'`,
    [userId, REGEN_PER_HOUR_CLEAN]
  );
}

async function getTrustScore(db, redis, userId) {
  const cached = await redis.get(`trust:cache:${userId}`);
  if (cached !== null) return parseInt(cached, 10);

  const { rows } = await db.query(
    `SELECT trust_score FROM anticheat_trust WHERE user_id = $1`, [userId]
  );
  const score = rows[0]?.trust_score ?? 100;
  await redis.set(`trust:cache:${userId}`, score, 'EX', 300);
  return score;
}

module.exports = { applyPenalty, regenerate, getTrustScore, PENALTIES };
```

---

### 5.6 Çoklu Hesap Tespiti & Pazar-Özel İstismar Analizi

Bölüm 1.6'da belirtildiği gibi IP tabanlı tespit mümkün değil. Bunun yerine **davranışsal korelasyon** ve özellikle **pazar işlem grafiği** kullanıyoruz — bu, yeni redesign edilen pazar sisteminiz için doğrudan uygulanabilir bir savunma:

**Sinyal 1 — Tekrarlayan alıcı-satıcı çifti:**
Aynı iki hesap arasında anormal derecede sık ve hep aynı yönde (A her zaman satıyor, B her zaman alıyor) işlem oluyorsa, bu klasik bir "alt hesaba kaynak aktarma" kalıbıdır.

```js
// src/anticheat/multiAccountHeuristics.js
async function detectSelfTradingPattern(db, lookbackDays = 7) {
  const { rows } = await db.query(`
    SELECT seller_id, buyer_id,
           COUNT(*) AS tx_count,
           AVG(price::numeric / NULLIF(market_avg_price, 0)) AS avg_price_ratio
    FROM marketplace_tx_graph
    WHERE created_at > now() - ($1 || ' days')::interval
    GROUP BY seller_id, buyer_id
    HAVING COUNT(*) >= 5
    ORDER BY tx_count DESC
  `, [lookbackDays]);

  return rows.filter(r => {
    const oneDirectionOnly = true; // sorgu zaten seller→buyer yönlü, ters yön ayrıca kontrol edilebilir
    const suspiciousPricing = r.avg_price_ratio < 0.5 || r.avg_price_ratio > 2.0; // piyasa fiyatından çok sapma
    return r.tx_count >= 5 && suspiciousPricing;
  });
}
```

**Sinyal 2 — Hesap yaşı + katılım zamanı korelasyonu:**
Aynı gün/saat aralığında oluşturulmuş ve aynı sunucuya art arda (saniyeler farkla) katılmış hesaplar arası işlem varsa, flag puanı artar.

**Sinyal 3 — Komut zamanlama korelasyonu:**
İki farklı `userId`'nin komutları sistematik olarak birbirini takip ediyorsa (örn. A her zaman B'den 2-4 saniye sonra komut gönderiyor, gün boyu), bu tek kişinin iki hesabı sırayla kullandığına işaret edebilir (bot hesabı taşıma deseni).

```js
async function flagCorrelatedTiming(db, userIdA, userIdB, windowSeconds = 5) {
  const { rows } = await db.query(`
    SELECT COUNT(*) AS correlated_count
    FROM anticheat_events a
    JOIN anticheat_events b
      ON b.user_id = $2
     AND b.created_at BETWEEN a.created_at AND a.created_at + ($3 || ' seconds')::interval
    WHERE a.user_id = $1
  `, [userIdA, userIdB, windowSeconds]);
  return parseInt(rows[0].correlated_count, 10);
}
```

> **Önemli:** Bu katman **otomatik ban tetiklememeli** — yalnızca `manual_review` event'i oluşturup moderasyon paneline düşürmeli (Bölüm 5.8). Çoklu hesap sinyalleri yanlış pozitif riski en yüksek katmandır (örn. aynı evden iki kardeş oynuyor olabilir); bu yüzden insan onayı şart.

---

### 5.7 Punishment Engine — Kademeli Ceza

OwO'da gözlemlenen "üstel artan ban süresi" prensibini uyguluyoruz:

```js
// src/anticheat/punishmentEngine.js
const BASE_DURATION_SECONDS = 60 * 10;     // ilk ceza: 10 dakika
const EXPONENT_MULTIPLIER = 4;             // her tekrarda x4
const PERMABAN_AFTER_TIER = 5;             // 5. ihlalden sonra kalıcı

function calculatePunishment(violationCount) {
  if (violationCount >= PERMABAN_AFTER_TIER) {
    return { tier: 5, durationSeconds: null, label: 'permanent' };
  }
  const durationSeconds = BASE_DURATION_SECONDS * Math.pow(EXPONENT_MULTIPLIER, violationCount - 1);
  return { tier: violationCount, durationSeconds, label: `temp_${durationSeconds}s` };
}
// violationCount=1 → 10dk, 2 → 40dk, 3 → ~2.6sa, 4 → ~10.6sa, 5+ → kalıcı

async function issuePunishment(db, userId, reason, issuedBy = 'system') {
  const { rows } = await db.query(
    `SELECT violation_count FROM anticheat_trust WHERE user_id = $1`, [userId]
  );
  const violationCount = (rows[0]?.violation_count ?? 0) + 1;
  const punishment = calculatePunishment(violationCount);

  const expiresAt = punishment.durationSeconds
    ? `now() + interval '${punishment.durationSeconds} seconds'`
    : 'NULL';

  await db.query(
    `INSERT INTO anticheat_punishments (user_id, tier, reason, duration_seconds, issued_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, ${expiresAt})`,
    [userId, punishment.tier, reason, punishment.durationSeconds, issuedBy]
  );

  return punishment;
}

module.exports = { calculatePunishment, issuePunishment };
```

**Ceza Tier Tablosu:**

| Tier | Süre | Etki |
|------|------|------|
| 1 | 10 dk | Komutlar geçici devre dışı, kullanıcıya nazik uyarı DM'i |
| 2 | 40 dk | Aynı + reward throttle `heavy` seviyesine sabitlenir |
| 3 | ~2.6 saat | Aynı + moderasyon paneline otomatik flag |
| 4 | ~10.6 saat | Aynı + appeal hakkı (tek seferlik) sunulur |
| 5+ | Kalıcı | Yalnızca moderatör manuel inceleme ile kaldırılabilir |

---

### 5.8 Audit Log + Moderasyon Paneli + İtiraz Akışı

```js
// src/anticheat/auditLogger.js
async function logEvent(db, { userId, guildId, eventType, severity, detail }) {
  await db.query(
    `INSERT INTO anticheat_events (user_id, guild_id, event_type, severity, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, guildId ?? null, eventType, severity, JSON.stringify(detail)]
  );
}
module.exports = { logEvent };
```

**Moderasyon komutu — `/anticheat review @user`:**
- Son 20 `anticheat_events` kaydını, trust score grafiğini ve aktif cezaları tek bir embed'de gösterir.
- "Override" butonu: skoru manuel sıfırlama / cezayı kaldırma (audit log'a `issued_by: moderatorId` ile yazılır).

**İtiraz akışı — kullanıcı tarafı:**
- Tier 4+ cezalarda kullanıcıya bir kerelik `/appeal` slash komutu açılır.
- Modal ile kısa açıklama alınır → `anticheat_appeals` tablosuna düşer → mod paneline bildirim gider.
- Mod onaylarsa: `overturned = true`, trust score kısmen iade edilir (tam 100'e değil, örn. 70'e — "temiz sayfa ama izlemede" mantığı).

Bu katman, OwO'nun "haksız ban" şikayetlerinde topluluk moderatörlerinin manuel müdahale edebildiği gözlemiyle uyumludur — tam otomasyon yerine **insan denetimli son karar** prensibi.

---

## 6. Discord-Native UI Entegrasyonu

Pazar redesign'ınızda kurduğunuz `renderMarketScreen` + `customId` state-encoding deseniyle tutarlı olması için:

- Challenge butonlarının `customId`'si aynı encoding şemasını kullanmalı: `ac_challenge:{userId}:{step}` gibi, mevcut pazar ekranlarınızdaki `market:{screen}:{state}` deseniyle paralel.
- Moderasyon paneli de aynı embed/button/select-menu bileşen kütüphanesini (varsa ortak `UIBuilder` helper'ınızı) yeniden kullanmalı — yeni bir UI sistemi icat etmeyin.
- Reward throttle, kullanıcıya gösterilen embed'lerde **hiçbir farklı görsel ipucu vermemeli** (aynı renk, aynı format) — sessiz ceza prensibinin UI tarafı budur.

---

## 7. Aşamalı Uygulama Planı (6 Faz)

| Faz | Kapsam | Çıktı |
|-----|--------|-------|
| **1** | Temel altyapı | `rateLimiter.js`, `auditLogger.js`, Postgres şeması, Redis bağlantısı, `commandInterceptor.js` middleware iskeleti |
| **2** | Davranışsal katman | `behaviorAnalyzer.js`, `trustScore.js`, cron-based `regenerate()` job |
| **3** | Challenge sistemi | `captchaManager.js`, Discord component UI'ları, customId routing |
| **4** | Ödül & ceza | `rewardThrottle.js`, `punishmentEngine.js`, DM uyarı şablonları |
| **5** | Çoklu hesap & pazar analizi | `multiAccountHeuristics.js`, periyodik batch job, mod-only flag raporu |
| **6** | Moderasyon & itiraz | `/anticheat review`, `/anticheat override`, `/appeal` modal akışı, dokümantasyon |

Her faz, önceki fazın üzerine bağımsız çalışabilir şekilde inşa edilir — Faz 1 tek başına bile temel spam korumasını sağlar.

---

## 8. Test Senaryoları

Cursor AI implementasyon sırasında aşağıdaki senaryoları unit/integration test olarak yazmalı:

1. **Legit power-user:** Düzensiz ama hızlı komut gönderen gerçek kullanıcı (CV > eşik) → trust score düşmemeli.
2. **Klasik macro:** Sabit 1000ms aralıkla komut → birkaç tekrarda `behavior_anomaly_high` tetiklenmeli.
3. **Network burst:** Discord gateway gecikmesi sonrası 3 komutun art arda gelmesi (tek seferlik) → hard rate limit tetiklenebilir ama trust score'da kalıcı hasar olmamalı (tekil olay affedici olmalı).
4. **Challenge timeout:** Kullanıcı challenge'a 45sn içinde yanıt vermezse → session silinmeli, bir sonraki komutta yeni challenge sorulmalı (lockout değil).
5. **Captcha 2x fail:** `MAX_ATTEMPTS` aşımı → otomatik `manual_flag` event'i + trust score -20.
6. **Reward throttle görünmezliği:** `frozen` seviyesinde bile komut yanıtı "başarılı" görünmeli, hata mesajı içermemeli.
7. **Üstel ceza hesaplama:** violationCount 1→5 için `calculatePunishment` çıktıları tabloyla birebir eşleşmeli.
8. **Self-trading tespiti:** Aynı çift arasında piyasa fiyatının %30'una 6 işlem → `detectSelfTradingPattern` sonucunda flag dönmeli.
9. **Appeal akışı:** Tier 4 ceza sonrası appeal açma → mod onayı → trust score'un 100 değil, kısmi (örn. 70) değere dönmesi.
10. **Decay/regen:** 1 saat temiz geçen kullanıcı → trust score +2 (cron job testi).

---

## 9. Gizlilik ve Adillik Notları

- **Veri minimizasyonu:** `anticheat_events.detail` alanına yalnızca analiz için gerekli ham veriyi (zaman damgaları, skor değişimi) yazın; mesaj içeriğini saklamayın.
- **Saklama süresi:** `anticheat_events` için 90 günlük otomatik temizleme (cron) önerilir — sınırsız biriktirme hem gereksiz hem de istenmeyen bir veri yükü oluşturur.
- **Eşik değerlerini gizli tutun:** `config/thresholds.js` içeriğini herkese açık dokümantasyona koymayın (OwO'nun "rastgele ve belirsiz süre" yaklaşımıyla aynı mantık — tersine mühendisliği zorlaştırır).
- **İlk ihlalde asla kalıcı ban yok:** Tier sistemi bunu zaten garanti ediyor, ama kodda bu kuralı bypass edecek bir "hemen permaban" kısayolu eklemeyin.
- **Yanlış pozitif kabulü:** Hiçbir davranışsal sinyal %100 kesin değildir. Sistem tasarımı gereği en ağır otomatik ceza bile (Tier 4) appeal hakkı içerir; Tier 5 (kalıcı) ise yalnızca tekrarlayan, çok sinyalli ihlallerden sonra devreye girer.

---

## 10. Kaynakça

- OwO Bot Wiki — FAQ (macro/bot tespiti, kademeli ban): https://owobot.fandom.com/wiki/FAQ
- OwO Bot Wiki — Profile (XP ban mekanizması): https://owobot.fandom.com/wiki/Profile
- OwO Bot Wiki — Xp ban (topluluk gözlemleri): https://owobot.fandom.com/wiki/Xp_ban
- OwO Bot Wiki — Captcha doğrulama tartışması: https://owobot.fandom.com/f/p/4400000000000038592
- "OwO Discord Bot: Complete Guide to Commands, Economy & Pets" — CommunityOne Blog: https://blog.communityone.io/owo-discord-bot-deepdive/
- "1 Dev for 4M communities" — CommunityOne / Medium: https://luyilousia.medium.com/1-dev-for-4m-communities-exploring-the-owo-discord-bot-gameplay-community-and-more-8351e96916a1

---

**Not:** Bu belge, OwO bot'un kapalı kaynaklı iç sistemini birebir kopyalamaz (bu zaten mümkün değildir); bunun yerine kamuya açık davranışsal gözlemlerden genel prensipler çıkarıp OwlHunt'a özgü, sıfırdan ve sürdürülebilir bir koruma mimarisi tanımlar. Cursor AI'a bu dosyayı verirken "Faz 1'den başla, her fazı ayrı PR/commit olarak ilerlet" talimatı vermenizi öneririm — tıpkı pazar redesign brief'inizdeki altı fazlı yaklaşım gibi.
