# BaykusBot — Kapsamlı Teknik ve Oyun Tasarım Belgesi

> Bu belge projenin tüm sistemlerini, formüllerini, veri modellerini, kod mimarisini ve oyun tasarım kararlarını kapsar. Tek kaynak olarak kullanılmalıdır.

---

## İçindekiler

1. [Genel Bakış](#1-genel-bakış)
2. [Teknoloji Yığını](#2-teknoloji-yığını)
3. [Proje Yapısı](#3-proje-yapısı)
4. [Ortam Değişkenleri ve Yapılandırma](#4-ortam-değişkenleri-ve-yapılandırma)
5. [Veritabanı Modelleri](#5-veritabanı-modelleri)
6. [Bot Başlangıç Akışı](#6-bot-başlangıç-akışı)
7. [Komut Sistemi](#7-komut-sistemi)
8. [Kayıt (Onboarding) Sistemi](#8-kayıt-onboarding-sistemi)
9. [Avlanma (Hunt) Sistemi](#9-avlanma-hunt-sistemi)
10. [XP ve Level Sistemi](#10-xp-ve-level-sistemi)
11. [Baykuş Türleri, Statlar ve Kalite](#11-baykuş-türleri-statlar-ve-kalite)
12. [Trait Sistemi](#12-trait-sistemi)
13. [Stat Yükseltme (Upgrade) Sistemi](#13-stat-yükseltme-upgrade-sistemi)
14. [Evcilleştirme (Tame) Sistemi](#14-evcilleştirme-tame-sistemi)
15. [PvP Sistemi](#15-pvp-sistemi)
16. [Simüle PvP (Bot Duel)](#16-simüle-pvp-bot-duel)
17. [Encounter Fight Sistemi](#17-encounter-fight-sistemi)
18. [Kumar Sistemi](#18-kumar-sistemi)
19. [Buff Item ve Charge Sistemi](#19-buff-item-ve-charge-sistemi)
20. [Lootbox Sistemi](#20-lootbox-sistemi)
21. [Ekonomi Sistemi](#21-ekonomi-sistemi)
22. [Coin Transfer Sistemi](#22-coin-transfer-sistemi)
23. [Liderboard ve Sezon Sistemi](#23-liderboard-ve-sezon-sistemi)
24. [Discord Rol Sistemi](#24-discord-rol-sistemi)
25. [Güvenlik ve Anti-Abuse Katmanları](#25-güvenlik-ve-anti-abuse-katmanları)
26. [Middleware: Cooldown ve Anti-Spam](#26-middleware-cooldown-ve-anti-spam)
27. [Admin Komutları](#27-admin-komutları)
28. [Kurulum ve Çalıştırma](#28-kurulum-ve-çalıştırma)
29. [Mimari Kararlar ve Tasarım Notları](#29-mimari-kararlar-ve-tasarım-notları)

---

## 1. Genel Bakış

BaykusBot, Discord üzerinde çalışan Türkçe bir RPG/Economy oyun botudur. Oyuncular baykuş sahibi olur, avlanır, baykuşlarını geliştirir, diğer oyuncularla PvP yapar ve kumar oyunları oynar.

**Temel oyun döngüsü:**
```
Kayıt → Kukumav baykuşu al → Avlan → Item topla → Stat geliştir
→ Yabani baykuş evcilleştir → PvP kazan → Liderboard'a çık
```

**Tasarım felsefesi:**
- Tüm sayısal değerler tek bir dosyada (`config.ts`) toplanır — hiçbir sabit başka dosyaya gömülmez
- Oyuncuya "ne oldu" gösterilir, "nasıl hesaplandı" değil (gizli modifierlar)
- Ekonomi sink noktaları: upgrade, switch, tamir, transfer vergisi — coin enflasyonu önlenir
- Graceful degradation: Redis down olursa bot çalışmaya devam eder, sadece cooldown/anti-spam devre dışı kalır
- Atlas M0 (ücretsiz MongoDB) uyumlu: transaction timeout sorunları lock + sıralı sorgularla aşılır

---

## 2. Teknoloji Yığını

| Katman     | Teknoloji | Versiyon | Kullanım Amacı |
|--------    |-----------|----------|----------------|
| Dil        | TypeScript | 5.x (strict) | Tip güvenliği, IDE desteği |
| Discord    | discord.js | v14 | Bot API, slash komutlar, butonlar |
| Veritabanı | MongoDB + Prisma | Prisma 6.x | Kalıcı oyuncu/baykuş verisi |
| Cache | Redis (ioredis) | 5.x | Cooldown, anti-spam, prefix, tame session, pity |
| Validasyon | Zod | 3.x | Ortam değişkeni doğrulama |
| Çalıştırma (dev) | tsx | 4.x | TypeScript'i doğrudan çalıştırır |
| Çalıştırma (prod) | PM2 | — | Process yönetimi, otomatik yeniden başlatma |
| Paket Yöneticisi | pnpm | 9.x | Workspace desteği, hızlı kurulum |
| Linting | ESLint + Prettier | 9.x | Kod kalitesi |

**Neden MongoDB?**
Baykuş trait'leri ve encounter stat'ları gibi şemasız JSON alanları için esneklik sağlar. Prisma ORM ile tip güvenli sorgular yazılır.

**Neden Redis?**
- Cooldown: her komut için TTL tabanlı kilit
- Anti-spam: token bucket sayacı
- Prefix cache: her mesajda DB sorgusu yapmamak için
- Tame session: 5 dakika TTL ile geçici oyun durumu
- Lootbox pity: 30 gün TTL ile sayaç
- Liderboard cache: 2 dakika TTL ile DB yükünü azaltma

---

## 3. Proje Yapısı

```
baykusbot/
├── src/
│   ├── index.ts              # Bot giriş noktası — bootstrap, event handler'lar, sezon zamanlayıcı
│   ├── config.ts             # TÜM sabitler ve formüller (1133 satır, tek kaynak)
│   ├── deploy-commands.ts    # Slash komutları Discord'a kayıt eder (bir kez çalıştırılır)
│   ├── types/
│   │   └── index.ts          # Ortak TypeScript tipleri (CommandDefinition, HuntRunResult, vb.)
│   ├── commands/             # Slash + prefix komut tanımları (UI katmanı)
│   │   ├── owl.ts            # Ana oyun komutları — 2700+ satır, tüm oyun UI'ı burada
│   │   ├── admin.ts          # Bot sahibine özel yönetim komutları
│   │   ├── bj.ts             # Blackjack interaktif oyunu (buton tabanlı)
│   │   ├── coinflip.ts       # Yazı-tura slash komutu
│   │   ├── slot.ts           # Slot makinesi slash komutu
│   │   └── leaderboard.ts    # Liderboard görüntüleme
│   ├── systems/              # İş mantığı katmanı — saf fonksiyonlar, DB işlemleri
│   │   ├── hunt.ts           # Avlanma motoru (rollHunt)
│   │   ├── pvp.ts            # Gerçek PvP savaş motoru (simulatePvP, resolveTurn)
│   │   ├── pvp-sim.ts        # Bot duel — sahte rakip üretimi, bellekte simülasyon
│   │   ├── pvp-streak.ts     # PvP kazanma serisi — anti-abuse, milestone, bonus hesabı
│   │   ├── tame.ts           # Evcilleştirme — encounter oluşturma, attemptTame, commitTameResult
│   │   ├── tame-session.ts   # Redis tabanlı tame oturum yönetimi — personality, turn resolution
│   │   ├── upgrade.ts        # Stat yükseltme — bağımlılık kontrolü, materyal tüketimi
│   │   ├── xp.ts             # XP ekleme ve level-up hesabı (addXP)
│   │   ├── gambling.ts       # Kumar oyunları — coinFlip, slot, blackjack, settleBlackjack
│   │   ├── economy.ts        # Tamir (repair), günlük bakım (dailyMaintenance), auto-sink
│   │   ├── items.ts          # Buff item aktifleştirme, charge tüketimi, diminishing returns
│   │   ├── drops.ts          # Lootbox drop şansı hesabı — hunt/pvp/encounter kaynakları
│   │   ├── lootbox.ts        # Lootbox açma — weighted RNG, pity sistemi
│   │   ├── leaderboard.ts    # Liderboard sorguları, power score, sezon yönetimi
│   │   ├── traits.ts         # Trait üretimi (rollTraits), etki hesabı (calcTraitEffects)
│   │   ├── transfer.ts       # Oyuncular arası coin transferi — vergi, günlük limit
│   │   ├── onboarding.ts     # Kayıt akışı — kullanım şartları butonu, starter baykuş
│   │   ├── roles.ts          # Discord rol oluşturma ve senkronizasyonu
│   │   └── encounter-fight.ts# Encounter savaş çözümü — kazanma şansı, ödül hesabı
│   ├── middleware/
│   │   ├── cooldown.ts       # Redis PTTL tabanlı cooldown (getCooldownRemainingMs)
│   │   └── antiSpam.ts       # Token bucket rate limiter (enforceAntiSpam)
│   └── utils/                # Yardımcı araçlar — saf fonksiyonlar, UI builder'lar
│       ├── math.ts           # Tüm oyun formülleri (catchChance, upgradeChance, vb.)
│       ├── redis.ts          # Redis bağlantısı & token bucket (consumeRateLimitToken)
│       ├── lock.ts           # Dağıtık kilit — withLock, acquireLock, releaseLock
│       ├── rng.ts            # Ağırlıklı rastgele seçim (weightedRandom, rollPercent)
│       ├── embed.ts          # Discord embed şablonları (successEmbed, failEmbed, vb.)
│       ├── format.ts         # Süre/sayı formatlama (formatDuration)
│       ├── prefix.ts         # Sunucu bazlı prefix cache (getGuildPrefix, setGuildPrefix)
│       ├── upgrade-deps.ts   # Stat bağımlılık kontrolü (checkUpgradeDep, suggestNextUpgrade)
│       ├── hunt-ux.ts        # Av animasyonu & sonuç embed'i (animateHuntMessage)
│       ├── pvp-ux.ts         # PvP animasyonu & turn event'leri (animatePvPMessage)
│       ├── tame-ux.ts        # Tame UI — progress bar, escape bar, aksiyon butonları
│       ├── tame-narrative.ts # Tame hikaye metinleri — 5 kişilik, 15+ metin havuzu/kişilik
│       ├── stats-ux.ts       # Baykuş stat embed'i (buildOwlStatsEmbed)
│       ├── inventory-ux.ts   # Envanter görsel — grid ve overview modları
│       ├── upgrade-ux.ts     # Upgrade panel — bağımlılık gösterimi, sonuç embed'i
│       ├── encounter-ux.ts   # Encounter embed & butonlar (tame/savaş/kaç)
│       └── leaderboard-ux.ts # Liderboard embed — kategori bazlı görünüm
├── prisma/
│   └── schema.prisma         # MongoDB şema tanımı
├── ecosystem.config.js       # PM2 yapılandırması
├── package.json
├── tsconfig.json
├── .env                      # Ortam değişkenleri (git'e eklenmez)
└── .env.example              # Örnek ortam değişkenleri
```

### Katman Mimarisi

```
Discord Event
    ↓
src/index.ts (event routing)
    ↓
src/commands/*.ts (UI katmanı — embed, buton, animasyon)
    ↓
src/systems/*.ts (iş mantığı — hesaplama, DB işlemleri)
    ↓
src/utils/math.ts (saf formüller — DB bağımlılığı yok)
    ↓
MongoDB (Prisma) + Redis (ioredis)
```

---

## 5. Veritabanı Modelleri

### Player

Oyuncunun tüm ilerlemesi tek modelde tutulur.

```
id                 String   — Discord kullanıcı ID'si (primary key)
coins              Int      — Mevcut coin bakiyesi
level              Int      — Oyuncu seviyesi (1'den başlar)
xp                 Int      — Mevcut seviyedeki XP
mainOwlId          String?  — Aktif baykuşun ID'si
lastHunt           DateTime?— Son av zamanı (cooldown için)
lastSwitch         DateTime?— Son main değişim zamanı
pvpStreak          Int      — Mevcut PvP kazanma serisi
pvpStreakLoss      Int      — Mevcut PvP kaybetme serisi
gambleStreakWins    Int      — Kumar kazanma serisi
gambleStreakLosses  Int      — Kumar kaybetme serisi
huntComboStreak    Int      — Ardışık başarılı av sayısı
pvpCount           Int      — Toplam PvP sayısı
switchPenaltyUntil DateTime?— Switch cezası bitiş zamanı
pvpBestStreak      Int      — Tüm zamanların en yüksek PvP serisi

# Liderboard istatistikleri
totalHunts         Int      — Toplam başarılı av
totalRareFinds     Int      — Toplam Rare+ bulgu
totalPvpWins       Int      — Toplam PvP galibiyeti
totalCoinsEarned   Int      — Toplam kazanılan coin (harcama sayılmaz)
powerScore         Int      — Hesaplanmış güç skoru (cache)

# Günlük limitler
dailyLootboxDrops   Int      — Bugün alınan lootbox sayısı
lastLootboxDropDate DateTime?— Son lootbox drop tarihi
dailyTransferSent   Int      — Bugün gönderilen coin
lastTransferDate    DateTime?— Son transfer tarihi
```

### Owl

```
id            String   — UUID
ownerId       String   — Player.id referansı
species       String   — Tür adı (ör. "Kukumav baykusu")
tier          Int      — 1 (en güçlü) – 8 (en zayıf)
bond          Int      — Bağ seviyesi (0–100)
passiveMode   String   — "idle" | "training" | "scouting"
statGaga      Int      — Gaga stat (1–100)
statGoz       Int      — Göz stat (1–100)
statKulak     Int      — Kulak stat (1–100)
statKanat     Int      — Kanat stat (1–100)
statPence     Int      — Pençe stat (1–100)
quality       String   — "Trash"|"Common"|"Good"|"Rare"|"Elite"|"God Roll"
hp            Int      — Mevcut HP
hpMax         Int      — Maksimum HP
staminaCur    Int      — Mevcut stamina
isMain        Boolean  — Aktif baykuş mu?
effectiveness Int      — Etkinlik (0–100, PvP'de düşer, tamir ile artar)
traits        Json?    — [{ id: string }] formatında trait listesi
```

### InventoryItem

```
id       String — UUID
ownerId  String — Player.id referansı
itemName String — Item adı
itemType String — "Av" | "Materyal" | "Buff" | "Kutu"
rarity   String — "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary"
quantity Int    — Miktar

@@unique([ownerId, itemName])  — Aynı item tek satırda tutulur
```

### PvpSession

```
id           String   — UUID
challengerId String   — Meydan okuyan oyuncu
defenderId   String   — Savunan oyuncu
status       String   — "pending" | "finished"
winnerId     String?  — Kazanan oyuncu ID'si
totalTurns   Int?     — Toplam tur sayısı
createdAt    DateTime
finishedAt   DateTime?
```

### Encounter

```
id           String   — UUID
playerId     String   — Oyuncu ID'si
owlSpecies   String   — Yabani baykuş türü
owlTier      Int      — Tier
owlQuality   String   — Kalite
owlStats     Json     — { gaga, goz, kulak, kanat, pence }
owlTraits    Json?    — Üretilen trait listesi
tameAttempts Int      — Yapılan deneme sayısı (max 3)
failStreak   Int      — Ardışık başarısız deneme sayısı
status       String   — "open" | "closed"
```

### PlayerBuff

```
id          String  — UUID
playerId    String  — Player.id referansı
buffItemId  String  — config.ts'deki BUFF_ITEMS[].id
category    String  — "hunt" | "upgrade" | "pvp"
effectType  String  — "catch_bonus" | "loot_mult" | "upgrade_bonus" | vb.
effectValue Float   — Etki değeri
chargeMax   Int     — Maksimum charge
chargeCur   Int     — Kalan charge (0 = pasif, silinmez)

@@index([playerId, category])
@@index([playerId, effectType])
```

### PlayerRegistration

```
id          String   — UUID
userId      String   — Discord kullanıcı ID'si
username    String   — Discord kullanıcı adı
displayName String?  — Sunucu görünen adı
guildId     String   — Sunucu ID'si
guildName   String   — Sunucu adı
acceptedAt  DateTime — Kullanım şartları kabul tarihi

@@unique([userId, guildId])
```

### Season

```
id         String   — "current" (sabit)
seasonId   String   — "2026-W16" veya "2026-04"
seasonType String   — "weekly" | "monthly"
startedAt  DateTime
endsAt     DateTime
```

### SeasonArchive

Her sezon sonunda tüm oyuncuların anlık snapshot'ı alınır.

```
id               String   — UUID
playerId         String
seasonId         String   — "2026-W16"
seasonType       String
powerScore       Int
totalHunts       Int
totalRareFinds   Int
totalPvpWins     Int
totalCoinsEarned Int
rank             Int      — O sezon sonu sırası
archivedAt       DateTime
```

---

## Komutlar

### Oyun Komutları (`owl` prefix veya `/owl`)

| Komut | Kısayol | Açıklama |
|-------|---------|----------|
| `owl hunt` | `h` | Avlanmaya gönder |
| `owl tame <id>` | `t` | Yabani baykuşu evcilleştir |
| `owl vs @oyuncu` | — | Gerçek PvP meydan oku |
| `owl duel` | `d` | Bot ile simüle duel |
| `owl upgrade <stat>` | `up` | Stat geliştir |
| `owl stats` | `s` | Baykuş istatistikleri |
| `owl inventory` | `inv` | Envanter |
| `owl owls` | — | Tüm baykuşları listele |
| `owl setmain <id>` | `sm` | Main baykuşu değiştir |
| `owl sell [all]` | — | Avları sat |
| `owl zoo` | `z` | Hayvanat bahçesi görünümü |
| `owl cash` | `c` | Bakiye ve seviye |
| `owl ver @oyuncu <miktar>` | `give` | Coin gönder |
| `owl prefix <değer>` | — | Sunucu prefix'i değiştir (admin) |
| `owl yardim` | — | Yardım menüsü |

### Kumar Komutları
- `owl bj <miktar>` — Blackjack (interaktif, butonlu)
- `owl cf <miktar> [h/t]` — Yazı-tura
- `owl slot <miktar>` — Slot makinesi
- `owl lb [kategori]` — Liderboard

## 16. Simüle PvP (Bot Duel)

**Dosya:** `src/systems/pvp-sim.ts` — `runSimulatedPvP(prisma, playerId)`

### Tasarım Prensibi

Gerçek oyuncu verisi **asla değiştirilmez**. Sahte rakip üretilir, savaş tamamen bellekte simüle edilir, sadece oyuncunun verisi güncellenir. PvpSession tablosuna hiçbir şey yazılmaz.

### Zorluk Sistemi

```
%60 Kolay:   rakip gücü = oyuncu gücü × 0.85, XP çarpanı ×0.8
%30 Dengeli: rakip gücü = oyuncu gücü × 1.00, XP çarpanı ×1.0
%10 Zorlu:   rakip gücü = oyuncu gücü × 1.20, XP çarpanı ×1.35
```

Ek olarak ±%8 rastgele varyasyon uygulanır.

### Sahte Rakip Üretimi

```typescript
generateFakeOpponent(playerPower):
  difficulty = weightedRandom(SIM_PVP_DIFFICULTY_TABLE)
  variation = 0.92 + random × 0.16  // ±8%
  targetPower = playerPower × difficulty.powerRatio × variation
  hpMax = clamp(80, 200, round(targetPower × 2.5 + rand(10, 30)))
  stamina = rand(60, 100)
  name = SIM_PVP_FAKE_NAMES[random]  // 20 isim havuzu
  species = SIM_PVP_FAKE_SPECIES[random]  // 8 tür havuzu
```

### Ödüller

```
Kazanma:
  baseXP = round(40 × difficulty.xpMult)
  xpGained = applyStreakXpBonus(baseXP, xpBonusPct)
  coinsGained = 60 + bonusCoins (streak)

Kaybetme:
  xpGained = 10
  coinsGained = 0
```

### Streak Davranışı

Simüle PvP'de anti-abuse kontrolü yoktur — her kazanma streak sayılır. Gerçek PvP'den daha az ödül verir (60 coin vs 100 coin).

---

## 17. Encounter Fight Sistemi

**Dosya:** `src/systems/encounter-fight.ts` — `resolveEncounterFight(prisma, playerId, encounterId)`

Encounter ekranında "Savaş" seçeneği seçildiğinde çalışır. Sonuç önceden hesaplanır (Discord timeout riski yok).

### Kazanma Şansı

```
playerPower = Σ statEffect(her stat)
enemyPower  = Σ statEffect(encounter stat'ları)

hiddenScaling = max(0, (level - 20) × 0.005)  // Level 20+ farming önleme
scaledEnemyPower = enemyPower × (1 + hiddenScaling)

winChance = clamp(20, 85, 50 + (playerPower - scaledEnemyPower) × 0.35)
```

Minimum %20, maksimum %85 — hiçbir zaman garantili kazanma/kaybetme yok.

### Ödül Tablosu

| Tier | Base Coin | Base XP |
|------|-----------|---------|
| 1 | 180 | 90 |
| 2 | 140 | 70 |
| 3 | 110 | 55 |
| 4 | 85 | 42 |
| 5 | 65 | 32 |
| 6 | 50 | 24 |
| 7 | 38 | 18 |
| 8 | 28 | 12 |

**Güç farkı çarpanı:**
```
powerRatio = enemyPower / playerPower
rewardMult = clamp(0.5, 1.5, powerRatio)

Düşman güçlüyse (ratio > 1): ödül artar (max ×1.5)
Düşman çok zayıfsa (ratio < 0.5): ödül azalır (min ×0.5)
```

Kaybedilirse encounter kapanır, ceza yok (kaçmakla aynı sonuç).

---

## Oyun Sistemleri

## 9. Avlanma (Hunt) Sistemi

**Dosya:** `src/systems/hunt.ts` — `rollHunt(prisma, playerId, owlId)`

**Cooldown:** 10 saniye (Redis PTTL)

### Tam Akış

```
1. withLock(playerId, 'hunt') — race condition önleme
2. Player ve Owl verisi çekilir
3. Gizli modifier'lar hesaplanır (level bonus, streak, pity, buff)
4. huntRolls = 3 + floor(level / 5) kadar döngü:
   a. Tier'a göre av havuzu filtrelenir
   b. Ağırlıklı spawn sistemi ile hayvan seçilir
   c. Yakalama şansı hesaplanır
   d. Başarı/kaçış/yaralanma belirlenir
5. Hiç yakalama yoksa minimum 1 hayvan garantilenir (fare veya serçe)
6. XP hesaplanır (başarı + başarısız + combo + multi-success)
7. addXP() çağrılır
8. Envanter upsert'leri paralel çalışır
9. Player güncellenir (huntComboStreak, lastHunt)
10. Liderboard istatistikleri güncellenir
11. Hunt buff charge'ı tüketilir
12. Lootbox drop şansı hesaplanır
13. Encounter tetiklenebilir (createEncounter)
```

### Hunt Roll Sayısı

```
huntRolls = 3 + floor(level / 5)

Level 1  → 3 roll
Level 5  → 4 roll
Level 10 → 5 roll
Level 20 → 7 roll
Level 50 → 13 roll
```

### Spawn Sistemi

Her hayvan için Spawn Score hesaplanır, normalize edilir:

```
Spawn Score = (1 / zorluk) × (1 + göz × 0.03) × (1 + kulak × 0.02)
Spawn Chance = bu hayvanın skoru / tüm uygun hayvanların toplam skoru
```

Göz yüksekse nadir hayvanlar daha sık çıkar. Kulak yüksekse genel encounter sıklığı artar.

**Tier bazlı av havuzu (difficulty ≤ eşik):**

| Tier | Max Zorluk | Erişilebilir Hayvanlar |
|------|-----------|----------------------|
| 8 (Kukumav) | 4 | fare, serçe, kurbağa, kertenkele, hamster, köstebek |
| 7 (Peçeli) | 5 | + yarasa, bıldırcın, güvercin |
| 6 (Ural) | 6 | + yılan, sincap |
| 5 (Büyük boz) | 7 | + tavşan |
| 4–1 | 8–9 | + gelincik, kirpi |

**Nadir hayvan kuralı:** Tek bir av turunda en fazla 1 adet zorluk ≥ 7 hayvan çıkabilir.

### Yakalama Şansı Formülü

```
baseChance = PREY[hayvan].baseChance (config'den)
powerMult  = OWL_SPECIES[tür].powerMultiplier

rawChance = (baseChance × powerMult) / 100
          + (pençe × 0.25) / 100
          + (göz × 0.15) / 100
          + (kanat × 0.20) / 100

Tier farkı cezası: |owlTier - preyDifficulty| >= 2 → rawChance × 0.6

finalChance = clamp(0.05, 0.95, rawChance + gizliModifier'lar)
```

### Gizli Modifier'lar (Oyuncuya Gösterilmez)

| Modifier | Formül | Maksimum |
|----------|--------|---------|
| Level bonus | `level × 0.003` | +%12 |
| Streak bonus | `huntComboStreak × 0.05` | +%20 |
| Pity bonus | `(noRareStreak - 8) × 0.04` (8 hunt sonrası) | +%25 |
| Buff bonus | `buffEffects.catchBonus` | — |

### Av Sonuç Türleri

- **Başarılı:** XP + hayvan envantere eklenir
- **Kritik av (%10 şans):** XP ×2 + item drop şansı ×1.5
- **Kaçtı:** XP yok
- **Yaralandı (%5 şans, başarısız avda):** Base XP'nin %45'i verilir

### XP Hesabı

```
successXP = Σ(hayvan.xp + riskBonus)
  riskBonus = zorluk >= 7 ? hayvan.xp × 0.5 : 0

failXP = Σ(yaralanan.xp × 0.45)

comboBonus = huntComboStreak >= 5 ? 25 : huntComboStreak >= 3 ? 10 : 0

multiBonus = catches >= 5 ? 25 : catches >= 3 ? 12 : catches >= 2 ? 5 : 0

totalXP = successXP + failXP + comboBonus + multiBonus
finalXP = round(totalXP × (1 + level × 0.03))
```

### Item Drop Sistemi

Her başarılı av rolünde upgrade materyali düşebilir:

| Item | Rarity | Drop Şansı | Min Zorluk |
|------|--------|-----------|-----------|
| Kemik Tozu | Common | %25 | 1 |
| Parlak Tüy | Common | %20 | 2 |
| Kırık Av Zinciri | Uncommon | %15 | 3 |
| Av Gözü Kristali | Uncommon | %12 | 4 |
| Yırtıcı Pençe Parçası | Rare | %10 | 4 |
| Sessizlik Teli | Uncommon | %10 | 3 |
| Orman Yankısı | Rare | %6 | 6 |
| Gölge Tüyü | Rare | %5 | 7 |

Kritik avda drop şansı ×1.5. Aktif buff `lootMult` değeri de uygulanır.

### Av Hayvanları Tam Tablosu

| Hayvan | Zorluk | Base Şans | XP | Satış Fiyatı |
|--------|--------|-----------|-----|-------------|
| fare | 1 | %90 | 5 | 5 |
| serçe | 2 | %85 | 6 | 8 |
| kurbağa | 2 | %80 | 6 | 8 |
| kertenkele | 3 | %75 | 7 | 12 |
| hamster | 3 | %75 | 7 | 12 |
| köstebek | 4 | %70 | 8 | 18 |
| yarasa | 4 | %65 | 9 | 20 |
| bıldırcın | 5 | %60 | 10 | 28 |
| güvercin | 5 | %60 | 10 | 28 |
| yılan | 6 | %50 | 12 | 40 |
| sincap | 6 | %50 | 12 | 40 |
| tavşan | 7 | %40 | 15 | 65 |
| gelincik | 8 | %30 | 18 | 90 |
| kirpi | 9 | %25 | 20 | 120 |

### Encounter Tetikleyici

Her av sonunda `createEncounter()` çağrılır. Encounter oluşursa ID, hunt sonucuna eklenir ve UX katmanı butonlu mesaj gönderir.

---

## 10. XP ve Level Sistemi

**Dosya:** `src/systems/xp.ts` — `addXP(prisma, playerId, amount, source)`

### Level Atlama Formülü

```
XP(L → L+1) = round(100 × L^1.65 + L × 20)
```

| Level Geçişi | Gereken XP |
|-------------|-----------|
| 1 → 2 | 120 |
| 2 → 3 | 354 |
| 5 → 6 | 1.523 |
| 10 → 11 | 4.667 |
| 20 → 21 | 14.418 |
| 30 → 31 | 27.968 |
| 40 → 41 | 44.795 |

### XP Ölçekleme

Yüksek level oyuncular daha fazla XP kazanır:

```
finalXP = round(baseXP × (1 + level × 0.03))

Level 1  → ×1.03 (+%3)
Level 10 → ×1.30 (+%30)
Level 20 → ×1.60 (+%60)
Level 40 → ×2.20 (+%120)
```

### XP Kaynakları

| Kaynak | Base XP |
|--------|---------|
| Av (fare) | 5 |
| Av (kirpi) | 20 |
| Başarısız av | base × %45 |
| PvP galibiyeti | 50 (streak bonusu dahil) |
| PvP yenilgisi | 15 |
| Evcilleştirme | 100 |
| Encounter savaşı (kazanma) | 12–90 (tier'a göre) |
| Auto-sink | 1/item |
| Combo bonus (3 ardışık) | +10 |
| Combo bonus (5 ardışık) | +25 |
| Multi-success (2 yakalama) | +5 |
| Multi-success (3 yakalama) | +12 |
| Multi-success (5+ yakalama) | +25 |

### addXP Davranışı

- Prisma transaction içinde çalışır (atomik)
- Level atlanırsa `xp = 0` ve `level += 1` yapılır (tek seferde bir level)
- `LevelUpResult` döndürür: `{ oldLevel, newLevel, remainingXP }`
- Level atlama konsola loglanır: `[XP] playerId kaynak=hunt +28 XP (Lv 5 -> 6)`

---

## 11. Baykuş Türleri, Statlar ve Kalite

### 8 Tür (Tier Sistemi)

Tier numarası küçüldükçe baykuş güçlenir. Yüksek tier baykuşlar daha yüksek level gerektirir.

| Tier | Tür | Power Çarpanı | Unlock Level | Stat Aralığı (Low Band) |
|------|-----|---------------|--------------|------------------------|
| 1 | Blakiston balık baykusu | 1.50 | 40 | 55–72 |
| 2 | Puhu baykusu | 1.35 | 30 | 48–64 |
| 3 | Kar baykusu | 1.20 | 25 | 40–56 |
| 4 | Boynuzlu baykuş | 1.10 | 20 | 32–48 |
| 5 | Büyük boz baykuş | 1.00 | 15 | 24–40 |
| 6 | Ural baykusu | 0.90 | 10 | 16–32 |
| 7 | Peçeli baykuş | 0.80 | 5 | 10–24 |
| 8 | Kukumav baykusu | 0.70 | 1 | 5–18 |

### 5 Stat (1–100 Arası)

| Stat | Avlanmadaki Rolü | PvP'deki Rolü |
|------|-----------------|---------------|
| **Gaga** | Av bitirme gücü, yakalama bonusu | Execute/finishing hasarı |
| **Göz** | Nadir hayvan spawn şansı, encounter şansı | Kritik vuruş şansı |
| **Kulak** | Loot kalitesi, encounter sıklığı | Counter şansı, dodge desteği |
| **Kanat** | Yakalama hızı | Dodge şansı, tur önceliği |
| **Pençe** | Ana av gücü (catch chance'e en büyük katkı) | Ana ham hasar |

### Stat Soft Cap

Stat değeri yükseldikçe etki azalan getiri gösterir:

```
Stat Etkisi = (stat × 70) / (stat + 30)

Stat 10  → %17.5 etki
Stat 30  → %35.0 etki
Stat 50  → %43.8 etki
Stat 70  → %49.0 etki
Stat 100 → %53.8 etki (asimptot: max %70)
```

### Ağırlıklı Stat Üretimi (Yeni Encounter'larda)

Her tier için 3 bölge tanımlanır. Düşük değerler sık, yüksek değerler nadir:

| Bölge | Ağırlık | Açıklama |
|-------|---------|----------|
| Low | %55 | Sık çıkan aralık |
| Mid | %35 | İyi ama nadir değil |
| High | %10 | Nadir, heyecan yaratan |

**Tier 1 (Blakiston) band'ları:**
- Low: 55–72, Mid: 73–87, High: 88–100

**Tier 8 (Kukumav) band'ları:**
- Low: 5–18, Mid: 19–30, High: 31–45

### Kalite Sistemi

Kalite, 5 stat toplamının 500'e oranından hesaplanır:

```
qualityScore = (gaga + göz + kulak + kanat + pençe) / 500

< 0.28  → Trash
< 0.46  → Common
< 0.62  → Good
< 0.75  → Rare
< 0.88  → Elite
≥ 0.88  → God Roll
```

Kalite, tame şansını etkiler (Trash +10, God Roll -40) ve trait seçimini etkiler.

### Main Baykuş Kavramı

- Oyuncunun birden fazla baykuşu olabilir
- Aynı anda yalnızca 1 tanesi "main" (aktif)
- Avlanma, PvP ve XP kazanımı her zaman main baykuş üzerinden işler
- `owl setmain <id>` ile değiştirilir (maliyet + cooldown var)

### Pasif Modlar (Main Olmayan Baykuşlar)

| Mod | Etki |
|-----|------|
| idle | Hiçbir etki yok |
| training | Yavaş XP kazanır |
| scouting | Rare karşılaşma şansı +%1 |

### Main Switch Sistemi

```
Maliyet = 500 + (tüm baykuşların tier toplamı × 200)

Örnek:
  Sadece Kukumav (tier 8): 500 + (8 × 200) = 2100 coin
  Kukumav + Peçeli (8+7):  500 + (15 × 200) = 3500 coin
```

**Switch yasak koşulları:**
- Son değişimden bu yana 1 saat geçmemiş
- Aktif PvP sürüyor
- Main baykuşun HP'si toplam HP'nin %30'unun altında

**Switch sonrası ceza (10 dakika):**
- Hasar -%10
- Dodge -%10

### Bond Sistemi

Her baykuşun 0–100 arası Bond değeri vardır:

```
Bond Bonusu (%) = bond × 0.2

Bond 10  → %2 bonus
Bond 50  → %10 bonus
Bond 100 → %20 bonus
```

Main değiştirilince önceki baykuşla biriktirilen bond o baykusta kalır.

### Effectiveness Sistemi

Her PvP'den sonra effectiveness düşer:

```
Her 3 PvP'de effectiveness -= 2
```

Tamir: 250 coin → effectiveness %100'e döner (`repair()` fonksiyonu)

---

## 13. Stat Yükseltme (Upgrade) Sistemi

**Dosya:** `src/systems/upgrade.ts`

### Genel Akış

```
1. withLock(playerId, 'upgrade')
2. Bağımlılık kontrolü (checkUpgradeDep)
3. Zorunlu materyal kontrolü ve tüketimi
4. Opsiyonel bonus item tüketimi
5. Başarı şansı hesabı
6. Başarı/başarısız/downgrade belirlenir
7. Owl stat güncellenir
8. Upgrade buff charge tüketilir
```

### Başarı Şansı Formülü

```
rawChance = 65 + (level × 0.6) + itemBonus - (statLevel^1.15 × 0.8)
finalChance = clamp(5, 95, rawChance)
```

**Örnek hesaplar:**

| Level | Stat Level | Item Bonus | Şans |
|-------|-----------|-----------|------|
| 1 | 1 | 0 | %64.2 |
| 10 | 5 | 0 | %55.8 |
| 20 | 10 | 5 | %62.4 |
| 40 | 20 | 10 | %47.1 |

### Zorunlu Materyaller

Her stat yükseltme için 2 adet zorunlu materyal gerekir:

| Stat | Zorunlu Materyal |
|------|-----------------|
| Gaga | Kemik Tozu ×2 |
| Göz | Av Gözü Kristali ×2 |
| Kulak | Kırık Av Zinciri ×2 |
| Kanat | Parlak Tüy ×2 |
| Pençe | Yırtıcı Pençe Parçası ×2 |

### Opsiyonel Bonus Item'lar

Tek denemede max 2 farklı item kullanılabilir. Aynı item iki kez kullanılamaz.

| Item | Bonus |
|------|-------|
| Kemik Tozu | +3 |
| Parlak Tüy | +4 |
| Av Gözü Kristali | +5 |
| Sessizlik Teli | +3 |
| Yırtıcı Pençe Parçası | +6 |
| Orman Yankısı | +5 |
| Kırık Av Zinciri | +4 |
| Gölge Tüyü | +2 |

### Bağımlılık Zinciri

Level 5'ten itibaren stat bağımlılıkları devreye girer:

```
pence  → bağımsız (temel stat)
gaga   → pence  (oran: 0.5)  — Gaga Lv.10 → Pençe ≥ Lv.5
kulak  → pence  (oran: 0.4)  — Kulak Lv.10 → Pençe ≥ Lv.4
goz    → kulak  (oran: 0.45) — Göz Lv.10 → Kulak ≥ Lv.5
kanat  → goz    (oran: 0.5)  — Kanat Lv.10 → Göz ≥ Lv.5

Gerekli seviye = floor(hedef × oran)
```

Bağımlılık karşılanmıyorsa `DEP_FAIL:dependsOn:required:current:suggestion` formatında hata fırlatılır. UI katmanı bunu parse ederek açıklayıcı embed gösterir.

### Başarısızlık Davranışı

- **Normal (level < 40):** Stat değişmez, materyal harcanır
- **Endgame (level ≥ 40):** %20 ihtimalle stat 1 düşer (downgrade)
  - Aktif `downgrade_shield` buff'u bu oranı azaltır
  - Stat minimum 1'in altına düşemez

### Cooldown

- Başarılı upgrade → 30 saniye
- Başarısız upgrade → 45 saniye

### Preview Sistemi

`getUpgradePreview()` fonksiyonu upgrade yapmadan önce:
- Mevcut başarı şansını hesaplar
- Bağımlılık durumunu kontrol eder
- Envanterdeki materyal miktarını gösterir
- Öneri stat'ı döndürür (bağımlılık karşılanmıyorsa)

---

## 14. Evcilleştirme (Tame) Sistemi

**Dosyalar:** `src/systems/tame.ts`, `src/systems/tame-session.ts`, `src/utils/tame-narrative.ts`, `src/utils/tame-ux.ts`

### Tam Akış

```
owl hunt
  ↓
createEncounter() — şans kontrolü, yabani baykuş üretimi
  ↓
Encounter embed + 3 buton: [Evcilleştir] [Savaş] [Kaç]
  ↓
Oyuncu "Evcilleştir" seçerse:
  ↓
createTameSession() — Redis'te oturum oluşturulur
  ↓
Tame UI: progress bar, escape risk, kişilik, tur sayacı
  ↓
Oyuncu 3 aksiyon seçer: [Sessiz Yaklaş] [Dikkatini Çek] [Üzerine Git]
  ↓
resolveTurn() — progress/escape delta hesabı
  ↓
Progress ≥ 50 → [Evcilleştirmeyi Dene] butonu açılır
  ↓
commitTameResult() — başarı/başarısız, baykuş oluşturma
```

### Encounter Oluşturma

**Encounter şansı:**
```
raw = 0.5 + (level × 0.05) + (göz × 0.03) + (kulak × 0.02)
    → clamp(0.5, 15)
```

**Tür seçimi:** Oyuncunun level'ına göre unlock edilmiş türler arasından, main baykuşun tier'ına yakın türler daha yüksek ağırlıkla seçilir.

**Hidden Scaling (Matchmaking):**
Oyuncunun gücü 120'yi aştıktan sonra yabani baykuşun stat'ları gizlice artırılır:
```
hiddenBonus = clamp(0, 0.45, (playerPower - 120) × 0.003)
scaledStat = rawStat × (1 + hiddenBonus)
```
Oyuncuya gösterilmez — immersion korunur.

### Tame Şansı Formülü

```
raw = baseTameChance[tier]
    + (göz × 0.25)
    + (kulak × 0.20)
    + itemBonus
    + qualityAdj[kalite]
    → clamp(2, 92)
```

**Base Tame Chance:**

| Tier | Tür | Base Şans |
|------|-----|-----------|
| 8 | Kukumav | %70 |
| 7 | Peçeli | %55 |
| 6 | Ural | %40 |
| 5 | Büyük boz | %30 |
| 4 | Boynuzlu | %20 |
| 3 | Kar | %12 |
| 2 | Puhu | %6 |
| 1 | Blakiston | %2 |

**Kalite Ayarlaması:**

| Kalite | Ayarlama |
|--------|---------|
| Trash | +10 |
| Common | 0 |
| Good | -5 |
| Rare | -15 |
| Elite | -25 |
| God Roll | -40 |

### Tame Item Bonusları

| Item | Bonus |
|------|-------|
| Çiğ Et | +5 |
| Yırtıcı Yem | +8 |
| Kan Kokusu | +10 |
| Sessiz Yem | +6 |
| Alfa Feromon | +12 |

### Başarısızlık Dalları

```
Başarısız tame → branch roll (0–100):
  0–60  (%60): Kaçtı — encounter kapanır
  60–85 (%25): Saldırdı — mini PvP başlar
  85–100 (%15): Yaraladı — main baykuşa -5 HP
```

**Mini PvP (saldırı dalında):**
- Yabani baykuş için geçici bot oyuncu oluşturulur
- Gerçek PvP motoru çalışır
- Oyuncu kazanırsa: sonraki denemede +10 bonus
- Oyuncu kaybederse: encounter kapanır

### Fail Streak ve Tekrar Cezası

```
Fail streak bonusu: her başarısız denemede +5 (sonraki denemeye)
Tekrar cezası: 2. denemeden itibaren -10
Max deneme: 3 (aşılırsa encounter kapanır)
```

### Tame Session Sistemi (Redis)

`createTameSession()` Redis'te 5 dakika TTL ile oturum oluşturur:

```typescript
TameSessionState {
  encounterId, playerId, owlSpecies, owlTier, owlQuality
  personality: 'aggressive' | 'timid' | 'curious' | 'greedy' | 'wise'
  aggression, awareness, patience, greed  // 0–100 kişilik trait'leri
  progress: 0–100    // 100 = tame
  escapeRisk: 0–100  // 100 = kaçtı
  turn: 1–4
  maxTurns: 4
  usedLines: string[] // anti-repetition belleği
  baseChance: number  // hesaplanmış tame şansı
}
```

### Kişilik Sistemi

Her yabani baykuş bir kişilik alır. Kişilik, tier ve kaliteye göre belirlenir:

| Kişilik | Emoji | Tier Eğilimi | Kalite Eğilimi |
|---------|-------|-------------|----------------|
| Saldırgan | 🔴 | Tier 1–3 | — |
| Ürkek | 🟡 | Tier 6–8 | Trash |
| Meraklı | 🔵 | Tier 4–8 | — |
| Açgözlü | 🟠 | — | — |
| Bilge | 🟣 | Tier 1–3 | God Roll/Elite |

### Aksiyon Modifier'ları

Her kişilik için her aksiyon farklı progress ve escape delta üretir:

| Kişilik | Sessiz | Dikkat Çek | Üzerine Git |
|---------|--------|-----------|------------|
| Saldırgan | +8 / -5 | -12 / +15 | +5 / +10 |
| Ürkek | +15 / -10 | -20 / +25 | -10 / +20 |
| Meraklı | -5 / +5 | +15 / -10 | +8 / -5 |
| Açgözlü | -8 / +5 | +10 / -5 | +5 / -8 |
| Bilge | +12 / -8 | -5 / +5 | +3 / +3 |

*(Format: progress modifier / escape modifier)*

### Turn Resolution

```typescript
resolveTurn(state, action):
  actionBonus = ACTION_MODIFIERS[personality][action]
  escapeDelta = ESCAPE_MODIFIERS[personality][action]
  variance = (random - 0.5) × 20  // ±10
  roll = baseChance + actionBonus + variance
  isCritical = random < 0.08  // %8 kritik şans

  if roll > 60:
    progressDelta = 20–40 (tier'a göre) + kritik bonusu
    outcome = 'success' veya 'critical_success'
  elif roll > 35:
    progressDelta = 10–20
    outcome = 'success'
  else:
    progressDelta = -10 ile -40 arası
    outcome = 'fail' veya 'critical_fail'

  Escape check (tur 2+): random < escapeRisk → kaçtı
  Tame eşiği: tier 1 = 80, tier 8 = 50
```

### Final Tame Şansı

"Evcilleştirmeyi Dene" butonuna basıldığında:

```
progressBonus = max(0, (progress - 50) × 0.5)
finalChance = clamp(5, 95, baseChance + progressBonus)
```

### Narrative Sistemi

`src/utils/tame-narrative.ts` — Her kişilik için 15+ metin havuzu:
- Intro metinleri (tur 1)
- Aksiyon tepki metinleri (sessiz/dikkat/yaklaş × kişilik)
- Başarı/başarısız/kritik metinler
- İpucu metinleri
- Bitiş metinleri (başarı/kaçış/gerilim)
- Anti-repetition: kullanılan satırlar `usedLines` listesinde tutulur
- Ultra-rare satırlar (%1 şans): kişiliğe özel efsanevi tepkiler

---

## 15. PvP Sistemi

**Dosyalar:** `src/systems/pvp.ts`, `src/systems/pvp-streak.ts`

### Gerçek PvP Akışı

```
owl vs @oyuncu
  ↓
Davet mesajı gönderilir (60 saniye geçerli)
  ↓
Hedef oyuncu kabul eder
  ↓
startPvP() — PvpSession oluşturulur
  ↓
simulatePvP() — savaş motoru çalışır
  ↓
Sonuç: kazanan +100 coin, XP, streak güncellenir
  ↓
Lootbox drop şansı hesaplanır
```

### Savaş Motoru

Her tur iki hamle içerir (challenger → defender, defender → challenger):

```
power = statEffect(gaga + pençe + kanat)

Hasar = (power × 0.7 + rng × 0.3) × (1 + tur × 0.05) × buffDamageMult
```

**Momentum sistemi:** Tur numarası arttıkça hasar artar:
```
Tur 1: ×1.05
Tur 5: ×1.25
Tur 10: ×1.50
Tur 20: ×2.00
```

### Stamina Sistemi

```
Stamina başlangıcı = baykuşun staminaCur değeri
Her tur: stamina -= 10

Stamina 100–60: Ceza yok
Stamina 60–30:  Dodge -%10 (dodgeBonus += -0.1)
Stamina 30–10:  Hasar -%15 (damage × 0.85)
Stamina < 10:   Fatigue — tüm statlar -%25 (damage × 0.75)
```

### Execute Mekaniği

İki koşul aynı anda sağlanırsa anlık öldürme:
```
Hedef HP < hpMax × 0.20  (HP'nin %20'si altında)
VE
Hedef Stamina < 30
→ damage = 999 (anlık öldürme)
```

### Buff Etkileri

Her oyuncu için `getBuffEffects(prisma, playerId, 'pvp')` çağrılır:
- `pvpDamageMult`: hasar çarpanı (max cap uygulanır)
- `pvpDodgeBonus`: dodge bonus (flat ekleme)

### Savaş Sonucu

```
Kazanan: HP'si daha yüksek olan (veya rakip HP = 0)
Max tur: 30 (aşılırsa HP karşılaştırması)

Kazanan:
  +100 coin
  +50 XP (streak bonusu dahil)
  pvpCount += 1

Kaybeden:
  +15 XP
  pvpCount += 1
  pvpStreakLoss += 1

Her 3 PvP'de: effectiveness -= 2
```

### PvP Streak Sistemi

**Dosya:** `src/systems/pvp-streak.ts`

```
XP Bonus Tablosu:
  2 streak  → +%3 XP
  3 streak  → +%5 XP
  5 streak  → +%8 XP
  7 streak  → +%10 XP
  10 streak → +%12 XP (maksimum)

Coin Bonus Tablosu:
  3 streak  → +15 coin
  5 streak  → +30 coin
  10 streak → +50 coin

Milestone Mesajları:
  3  → 🔥 Isınıyor!
  5  → 🔥🔥 Alev aldı!
  7  → ⚡ Durdurulamıyor!
  10 → 💀 EFSANEVİ STREAK!
  15 → 👑 TANRI MODU!
```

**Anti-abuse kontrolü:**
```
winnerPower = statEffect(gaga + pençe + kanat)
loserPower  = statEffect(gaga + pençe + kanat)

if loserPower < winnerPower × 0.70:
  streakCounted = false  // Streak artmaz ama kazanma geçerli
```

**Best streak:** Tüm zamanların en yüksek streak'i `pvpBestStreak` alanında saklanır.

### Lootbox Drop

PvP kazanma sonrası `rollPvpLootboxDrop()` çağrılır (fire-and-forget, hata hunt'ı engellemez).

---

## 12. Trait Sistemi

**Dosya:** `src/systems/traits.ts`

### Genel Kurallar

- Her yeni baykuş 1–2 adet rastgele trait alır
- Trait'ler ham stat artışı DEĞİLDİR — situasyonel avantaj sağlar
- Her trait'in bir bonusu ve bir cezası vardır (tradeoff tasarımı)
- Rarity, trait seçimini etkiler ama ham stat'ı etkilemez
- DB'de sadece `{ id: string }[]` formatında saklanır (boyut optimizasyonu)

### Trait Sayısı

```
Tier 1–3 (güçlü türler): %65 iki trait, %35 bir trait
Tier 4–8 (zayıf türler): %35 iki trait, %65 bir trait
```

### Rarity → Trait Ağırlık Çarpanı

Nadir trait'ler (weight ≤ 12) için rarity çarpanı uygulanır:

| Kalite | Çarpan | Etki |
|--------|--------|------|
| Trash | 0.5 | Nadir trait'ler daha da nadir |
| Common | 0.8 | Hafif azalma |
| Good | 1.0 | Baz değer |
| Rare | 1.4 | Nadir trait'lere daha kolay erişim |
| Elite | 1.8 | Belirgin artış |
| God Roll | 2.5 | Nadir trait'ler çok daha erişilebilir |

### Tüm Trait'ler (15 Adet)

| ID | İsim | Bonus | Ceza | Ağırlık |
|----|------|-------|------|---------|
| keskin_goz | 🎯 Keskin Göz | Av ödülü +%20 | Tame şansı -%20 | 18 |
| sessiz_kanat | 🌙 Sessiz Kanat | Yakalama şansı +%18 | PvP hasar -%15 | 16 |
| gece_avcisi | 🦇 Gece Avcısı | XP kazanımı +%22 | Cooldown +%25 | 14 |
| hizli_pence | ⚡ Hızlı Pençe | Cooldown -%22 | Av ödülü -%18 | 15 |
| saldirgan_ruh | 🔥 Saldırgan Ruh | PvP hasar +%22 | Max HP -%18 | 13 |
| demir_deri | 🛡️ Demir Deri | Max HP +%25 | PvP dodge -%22 | 12 |
| kacamak_ustasi | 💨 Kaçamak Ustası | PvP dodge +%25 | PvP hasar -%20 | 11 |
| merakli_bakis | 🔍 Meraklı Bakış | Encounter şansı +%30 | Stamina yenilenme -%25 | 14 |
| dingin_ruh | 🌿 Dingin Ruh | Stamina yenilenme +%30 | Encounter şansı -%25 | 13 |
| evcil_ruh | 🤝 Evcil Ruh | Tame şansı +%28 | Av ödülü -%18 | 12 |
| deneyimli | 📚 Deneyimli | XP kazanımı +%18 | PvP hasar -%12 | 15 |
| agir_kanat | 🪨 Ağır Kanat | Max HP +%20 | Cooldown +%20 | 11 |
| keskin_kulak | 👂 Keskin Kulak | Encounter şansı +%22 | XP kazanımı -%15 | 13 |
| yorulmaz | 💪 Yorulmaz | Stamina yenilenme +%25 | Tame şansı -%18 | 12 |
| usta_avci | 🏹 Usta Avcı | Yakalama şansı +%15 | Max HP -%20 | 10 |

### Trait Etki Hesabı

Birden fazla trait aynı sistemi etkiliyorsa çarpanlar **multiplicative** uygulanır (additive değil):

```typescript
// Örnek: İki trait aynı anda hunt_reward etkiliyor
Trait A: huntReward × 1.20
Trait B: huntReward × 0.82
Sonuç:   huntReward × (1.20 × 0.82) = × 0.984
```

### Etki Alanları

| bonusType/penaltyType | Etkilediği Sistem |
|----------------------|------------------|
| hunt_reward | Av coin/XP çarpanı |
| hunt_catch | Yakalama şansı çarpanı |
| pvp_damage | PvP hasar çarpanı |
| pvp_dodge | PvP dodge çarpanı |
| tame_chance | Evcilleştirme şansı çarpanı |
| xp_gain | XP kazanımı çarpanı |
| encounter_rate | Encounter tetiklenme şansı çarpanı |
| stamina_regen | Stamina yenilenme hızı çarpanı |
| hp_max | Maksimum HP çarpanı |
| cooldown_red | Cooldown süresi çarpanı (< 1.0 = daha kısa) |

---

## 18. Kumar Sistemi

**Dosya:** `src/systems/gambling.ts`

### Tasarım Felsefesi

"Kontrollü RNG" — tamamen rastgele değil, tamamen belirlenimci de değil. Uzun vadede ev kazanır. Kısa vadede oyuncu kazanabilir. Zengin oyuncular ve büyük bahisler cezalandırılır.

### Coin Flip

```
Temel kazanma şansı: %49
Ödeme: bahis × 1.95

Gizli modifierlar uygulandıktan sonra gerçek şans değişir.
```

### Slot Makinesi

```
Kombinasyon             Şans    Ödeme
Jackpot (3× baykuş)    %0.3    ×4
Kuş üçlüsü             %5.0    ×2
Yılan üçlüsü           %10.0   ×1.5
Fare üçlüsü            %15.0   ×1.2
Elmas üçlüsü           %0.1    ×8
Kayıp                  %69.6   —

Gizli jackpot katmanı: %0.2 ek şans → ödeme ×2 çarpan
```

### Blackjack

**Kart dağılımı (hafif ev lehine):**
- Oyuncu eli: %62 yüksek kart (10+) olasılığı
- Dealer eli: %54 yüksek kart olasılığı

**Ödemeler:**
```
Blackjack (2 kartla 21): bahis × 1.5
Normal galibiyet:        bahis × 1.9
Beraberlik:              bahis iade
Kayıp:                   bahis gider
```

**Dealer kuralı:** Soft 17'de (As + 6) kart çeker.

**İnteraktif mod (`owl bj`):** Oyuncu "Hit" veya "Stand" butonlarıyla oynayabilir. `settleBlackjack()` fonksiyonu sonucu dışarıdan alır.

### Gizli Win Chance Modifierları

Tüm kumar oyunlarına uygulanır:

```
1. Zenginlik cezası:
   penalty = min(15, log10(1 + max(coins, 0)))
   Win Chance -= penalty

2. Büyük bahis cezası:
   penalty = (bet / max(1, coins)) × 5
   Win Chance -= penalty

3. Kayıp serisi bonusu:
   3 ardışık kayıp → +3
   5 ardışık kayıp → +5

4. Galibiyet serisi cezası:
   3 ardışık galibiyet → -2
   5 ardışık galibiyet → -5

5. Güvenlik sınırı:
   Win Chance = clamp(1, 99, Win Chance)
```

### House Edge Özeti

| Oyun | House Edge | Risk |
|------|-----------|------|
| Coin Flip | %2–4 | Düşük |
| Blackjack | %3–5 | Orta |
| Slot | %5–10 | Yüksek |

### Ekonomi Entegrasyonu

Kumarda kazanılan coinler `recordCoinsEarned()` ile liderboard sayacına eklenir. Kaybedilen coinler sisteme geri döner (ekonomi sink).

---

## 19. Buff Item ve Charge Sistemi

**Dosya:** `src/systems/items.ts`

### Genel Prensipler

- Buff item'lar upgrade materyallerinden **tamamen ayrıdır**
- Charge bazlı çalışır — her aktivitede charge tüketilir
- Charge 0 olunca buff pasifleşir ama **silinmez** (oyuncu görmeye devam eder)
- Aynı effectType'tan max 3 aktif buff
- Diminishing returns: 1. buff %100, 2. buff %60, 3. buff %30 etki

### Buff Kategorileri

| Kategori | Etkilediği Sistem |
|----------|------------------|
| hunt | Avlanma (catch bonus, loot mult, rare drop) |
| upgrade | Stat yükseltme (upgrade bonus, downgrade shield) |
| pvp | PvP (damage mult, dodge bonus) |

### Charge Sistemi

```
chargeMax: Common 80–120, Rare 50–80, Epic 30–50, Legendary 20–30

Her hunt:    huntCost kadar tüketir (genellikle 1)
Her PvP:     pvpCost kadar tüketir (genellikle 1)
Her upgrade: upgradeCost kadar tüketir (genellikle 1)
```

### Diminishing Returns

Aynı effectType'tan birden fazla buff aktifse:

```
1. buff: effectValue × 1.0  (tam etki)
2. buff: effectValue × 0.6  (%60 etki)
3. buff: effectValue × 0.3  (%30 etki)
```

### Buff Etki Türleri

| effectType | Etki | Uygulama |
|-----------|------|---------|
| catch_bonus | Yakalama şansı artışı | Flat ekleme |
| loot_mult | Loot çarpanı | Multiplicative |
| rare_drop_bonus | Nadir drop şansı | Flat ekleme |
| upgrade_bonus | Upgrade şansı artışı | Flat puan |
| downgrade_shield | Downgrade şansı azaltma | Multiplicative (0.5 = %50 azalır) |
| pvp_damage_mult | PvP hasar çarpanı | Multiplicative |
| pvp_dodge_bonus | PvP dodge bonusu | Flat ekleme |

### PvP Buff Cap'leri

```
pvpDamageMult: maksimum cap (config'den)
pvpDodgeBonus: maksimum cap (config'den)
lootMult: clamp(1.0, 3.0)
```

### Özel Buff Davranışları

- **orman_ruhu:** `catch_bonus` türünde ama aynı zamanda `lootMult` de artırır
- **arena_ustasi:** `pvp_damage_mult` türünde ama aynı zamanda `pvpDodgeBonus` de artırır

### Buff Aktivasyon Akışı

```
activateBuff(prisma, playerId, buffItemId):
  1. BUFF_ITEM_MAP'ten tanım al
  2. Envanterde var mı kontrol et
  3. Aynı effectType'tan 3+ aktif buff var mı kontrol et
  4. Envanterden düş (quantity 1 ise sil, değilse azalt)
  5. PlayerBuff kaydı oluştur (chargeMax ile başlar)
```

### Buff Özet Gösterimi

`getBuffSummary()` fonksiyonu hunt/upgrade/pvp mesajlarına eklenir:
```
"🎯 [64/100] · 🌿 [80/80]"
```

---

## 21. Ekonomi Sistemi

**Dosya:** `src/systems/economy.ts`

### Coin Kaynakları

| Kaynak | Miktar |
|--------|--------|
| PvP galibiyeti | +100 |
| Bot duel galibiyeti | +60 |
| PvP streak bonusu | +15/+30/+50 |
| Av satışı | 5–120/hayvan |
| Kumar kazanma | bahis × ödeme |
| Encounter savaşı | 28–180 (tier'a göre) |
| Auto-sink | 3/item |

### Coin Harcamaları (Sink Noktaları)

| Harcama | Miktar |
|---------|--------|
| Stat upgrade materyali | Piyasa değeri |
| Main switch | 500 + (tier toplamı × 200) |
| Tamir | 250 |
| Transfer vergisi | %5–%20 (kademeli) |
| Kumar kaybı | bahis |

### Tamir Sistemi

```
repair(prisma, playerId, owlId):
  1. withLock(playerId, 'repair')
  2. Prisma transaction
  3. coins >= 250 kontrolü
  4. coins -= 250
  5. effectiveness = 100
```

### Günlük Bakım

```
dailyMaintenance(prisma, playerId):
  Envanterde "Çiğ Et" var mı?
    Evet: 1 adet tüket
    Hayır: main baykuşun effectiveness -= 5
```

### Auto-Sink

Stack limiti dolan itemler otomatik coin/XP'ye dönüşür:

```
autoSink(prisma, playerId, itemName, qty):
  item.quantity -= qty
  player.coins += qty × 3
  addXP(prisma, playerId, qty × 1, 'autoSink')
```

**Stack Limitleri:**

| Rarity | Max Stack |
|--------|----------|
| Common | 999 |
| Uncommon | 200 |
| Rare | 50 |
| Epic | 10 |
| Legendary | 1 |

---

## 22. Coin Transfer Sistemi

**Dosya:** `src/systems/transfer.ts`

### Anti-Abuse Katmanları (7 Adet)

1. **Kendi kendine gönderme yasağı** — senderId === receiverId kontrolü
2. **Minimum miktar** — config'den belirlenir
3. **Minimum seviye** — düşük level oyuncular transfer yapamaz
4. **Alıcı kayıtlı olmalı** — kayıtsız oyuncuya transfer yapılamaz
5. **Cooldown** — Redis tabanlı, transfer başarılı olduktan sonra set edilir
6. **Günlük limit** — 24 saatlik pencerede maksimum gönderim
7. **Kademeli vergi** — yakılır, kimseye gitmez (ekonomi sink)

### Vergi Sistemi

```
calcTaxRate(amount):
  Küçük miktarlar → düşük vergi oranı
  Büyük miktarlar → yüksek vergi oranı
  (TRANSFER_TAX_BRACKETS config'den)

tax = ceil(amount × rate)
received = amount - tax
```

### Transfer Akışı

```
transferCoins(prisma, redis, senderId, receiverId, amount):
  1. Temel doğrulamalar (DB'ye gitmeden)
  2. Cooldown kontrolü
  3. withLock(senderId, 'transfer')
  4. Prisma transaction:
     a. Gönderici: level, bakiye, günlük limit kontrolü
     b. Alıcı: kayıtlı mı kontrolü
     c. Vergi hesabı
     d. Gönderici: coins -= amount, günlük sayaç güncelle
     e. Alıcı: coins += received
  5. Transaction başarılı → cooldown set et
```

---

## 23. Liderboard ve Sezon Sistemi

**Dosya:** `src/systems/leaderboard.ts`

### 5 Liderboard Kategorisi

| Kategori | Skor Alanı | Açıklama |
|----------|-----------|----------|
| 👑 Güç (power) | powerScore | level×150 + totalXP×0.05 + nadir×80 |
| 🎯 Av (hunt) | totalHunts | Toplam başarılı av sayısı |
| 💎 Nadir (relic) | totalRareFinds | Toplam Rare+ bulgu |
| ⚔️ Arena (arena) | totalPvpWins | Toplam PvP galibiyeti |
| 💰 Servet (wealth) | totalCoinsEarned | Toplam kazanılan coin |

### Power Score Formülü

```
powerScore = round(
  level × 150 +
  totalXP × 0.05 +
  totalRareFinds × 80
)
```

Hiçbir stat tek başına baskın olamaz; uzun vadede dengeli ölçeklenir.

### Cache Sistemi

```
Redis key: lb:{kategori}:{seasonId}
TTL: 120 saniye (2 dakika)

Cache miss → DB'den çek → Redis'e yaz
Cache hit → direkt döndür
```

### Görüntüleme

- Top 10 oyuncu gösterilir
- Oyuncunun kendi sırası ±2 bağlamla gösterilir (top 10'da değilse DB'den hesaplanır)
- Kategori bazlı ikincil bilgi (Av: "1.234 av", Arena: "45G / 60M · %75")

### Sezon Sistemi

**Sezon tipi:** `weekly` (haftalık) veya `monthly` (aylık) — config'den ayarlanır

**Sezon ID formatı:**
- Haftalık: `2026-W16`
- Aylık: `2026-04`

**Sezon rollover akışı:**
```
checkSeasonRollover() — her saat başında çalışır:
  1. Aktif sezon var mı ve süresi doldu mu?
  2. archiveAndResetSeason():
     a. Tüm oyuncuların anlık snapshot'ı SeasonArchive'e yazılır
     b. Liderboard sayaçları sıfırlanır (totalHunts, totalRareFinds, vb.)
     c. Oyuncu ilerlemesi KORUNUR (level, XP, coin, baykuşlar)
     d. Yeni sezon kaydı oluşturulur
     e. Tüm liderboard cache'leri temizlenir
  3. Discord rolleri senkronize edilir
```

**Önemli:** Sezon sıfırlandığında oyuncu ilerlemesi (level, XP, coin, baykuşlar) korunur. Sadece liderboard istatistik sayaçları sıfırlanır.

### İstatistik Güncelleme

```
recordHuntStats(prisma, playerId, successCount, rareCount)
  → totalHunts += successCount
  → totalRareFinds += rareCount

recordPvpWin(prisma, winnerId)
  → totalPvpWins += 1

recordCoinsEarned(prisma, playerId, amount)
  → totalCoinsEarned += amount

refreshPowerScore(prisma, playerId)
  → totalXP hesaplanır (tüm level'ların XP'si toplanır)
  → powerScore güncellenir
  → (fire-and-forget, kritik yolda değil)
```

### Backfill Sistemi

Yeni eklenen liderboard alanları için mevcut veriden tahmin üretir:
- `totalCoinsEarned = 0` ise → `coins` kullanılır
- `totalPvpWins = 0` ise → `pvpCount × 0.5` kullanılır
- `totalHunts = 0` ise → `(level - 1) × 8` kullanılır
- `totalRareFinds = 0` ise → `(level - 1) × 0.5` kullanılır

---

## 20. Lootbox Sistemi

**Dosyalar:** `src/systems/drops.ts`, `src/systems/lootbox.ts`

### Lootbox Kaynakları

| Kaynak | Drop Şansı | Notlar |
|--------|-----------|--------|
| Hunt (normal) | Düşük | Kritik avda ×2 |
| PvP kazanma | Orta | — |
| Encounter tame başarısı | Yüksek | En iyi kaynak |

### Drop Sistemi (drops.ts)

**Günlük cap:** 24 saatte max 5 lootbox drop (anti-farm)

**Level soft cap:**
```
Level ≤ 20: drop şansı ×1.0 (tam)
Level > 20: her level için -%1 azalır (max -%30)

levelDropMult = max(0.70, 1.0 - (level - 20) × 0.01)
```

**Tier sırası:** Efsane → Nadir → Ortak (ilk eşleşmede dur, tek avda tek lootbox)

### Lootbox Açma (lootbox.ts)

**Pity sistemi:**
- Her lootbox tipi için ayrı Redis sayacı (`pity:{playerId}:{lootboxId}`)
- 30 gün TTL (aktif olmayan oyuncuların pity'si sıfırlanır)
- Pity eşiği aşılırsa bir sonraki açılışta minimum Rare garantisi

| Lootbox Tipi | Pity Eşiği |
|-------------|-----------|
| Ortak Kutu | 8 açılış |
| Nadir Kutu | 5 açılış |
| Efsane Kutu | 3 açılış |

**Açma akışı:**
```
openLootbox(prisma, redis, playerId, lootboxId):
  1. withLock(playerId, 'lootbox')
  2. Envanterde var mı kontrol et
  3. Pity sayacını oku
  4. itemCount = rand(minItems, maxItems)
  5. Her item için:
     - Pity tetiklendiyse: minimum Rare ağırlıklı seçim
     - Normal: weighted RNG ile rarity seç
     - O rarity'deki buff item'lardan rastgele seç
  6. Transaction: lootbox tüket + buff item'ları envantere ekle
  7. Pity sayacını güncelle (Rare+ geldiyse sıfırla, gelmediyse artır)
```

### Lootbox Envanter Yönetimi

- `listLootboxInventory()`: oyuncunun lootbox envanterini döndürür
- `getPityCounts()`: tüm lootbox tipleri için pity sayaçlarını döndürür (UI için)

---

## 6. Bot Başlangıç Akışı

`src/index.ts` dosyası şu sırayla çalışır:

1. **Ortam değişkeni doğrulama** — Zod şeması ile 6 zorunlu değişken kontrol edilir. Eksikse process crash eder.
2. **Redis bağlantısı** — `assertRedisConnection()` ile PING/PONG kontrolü
3. **MongoDB bağlantısı** — `prisma.$connect()`
4. **Komut yükleme** — `dist/commands/` (production) veya `src/commands/` (dev) klasöründen dinamik import
5. **Discord login** — `client.login(token)`
6. **Sezon zamanlayıcı** — Başlangıçta 5 saniye sonra, sonra her saat başında `checkSeasonRollover()` çalışır

### Event Handler'lar

**InteractionCreate:**
- Button interaction → kayıt butonu kontrolü → `handleRegistrationButton()`
- ChatInputCommand → anti-spam kontrolü → `command.execute()`

**MessageCreate:**
- Bot mesajları ve DM'ler görmezden gelinir
- Prefix tespiti (varsayılan `owl`, özel prefix Redis'ten okunur, kısa prefix boşluksuz)
- Komut yönlendirme: `cf/coinflip`, `bj/blackjack/21`, `slot`, `top/lb/leaderboard`, diğerleri → `handleOwlTextCommand()`

**Hata Yönetimi:**
- `error` kodu 10062 (Unknown Interaction — token süresi dolmuş) sessizce geçilir
- Diğer hatalar loglanır, kullanıcıya ephemeral hata mesajı gönderilir
- Yanıt gönderilemezse (ikinci hata) sessizce geçilir

### Graceful Shutdown

`SIGTERM` ve `SIGINT` sinyalleri yakalanır:
1. Discord client destroy
2. Redis quit
3. Prisma disconnect
4. `process.exit(0)`

---

## 7. Komut Sistemi

### Prefix Sistemi

Varsayılan prefix: `owl`. Her sunucu için özelleştirilebilir.

- `/owl prefix <değer>` — Yönetici yetkisi gerekir, 1–16 karakter, harf/rakam
- Prefix Redis'te `prefix:{guildId}` anahtarıyla cache'lenir
- 3 karakter veya daha kısa prefix'ler boşluksuz da çalışır: `w hunt` = `wh`, `w stats` = `ws`

### Komut Alias Haritası

```
inv   → inventory
up    → upgrade
h     → hunt
s     → stats
sm    → setmain
z     → zoo
d     → duel
c     → cash
t     → tame
g/give → ver
```

### Typo Düzeltme

Bilinmeyen komut girildiğinde Levenshtein mesafesi hesaplanır. Mesafe ≤ 2 ise en yakın komut önerilir.

### Tüm Oyun Komutları

| Komut | Kısayol | Cooldown | Açıklama |
|-------|---------|----------|----------|
| `owl hunt` | `h` | 10s | Avlanmaya gönder |
| `owl tame <id>` | `t` | — | Yabani baykuşu evcilleştir |
| `owl vs @oyuncu` | — | — | Gerçek PvP meydan oku (60s kabul süresi) |
| `owl duel` | `d` | 10s | Bot ile simüle duel |
| `owl upgrade <stat>` | `up` | 30s/45s | Stat geliştir (başarı/başarısız) |
| `owl stats [deep]` | `s` | — | Baykuş istatistikleri (deep = formül detayı) |
| `owl inventory` | `inv` | — | Envanter (overview + grid modları) |
| `owl owls` | — | — | Tüm baykuşları listele |
| `owl setmain <id>` | `sm` | 1s | Main baykuşu değiştir |
| `owl sell [all\|<hayvan>]` | — | — | Avları sat |
| `owl zoo` | `z` | — | Hayvanat bahçesi görünümü |
| `owl cash` | `c` | — | Bakiye ve seviye |
| `owl ver @oyuncu <miktar>` | `give` | — | Coin gönder |
| `owl prefix <değer>` | — | — | Sunucu prefix'i değiştir (admin) |
| `owl yardim` | — | — | Yardım menüsü |
| `owl bj <miktar>` | — | — | Blackjack (interaktif butonlu) |
| `owl cf <miktar> [h\|t]` | — | — | Yazı-tura |
| `owl slot <miktar>` | — | — | Slot makinesi |
| `owl lb [kategori]` | `top` | — | Liderboard |

---

## 8. Kayıt (Onboarding) Sistemi

### Akış

1. Oyuncu ilk kez komut kullandığında `ensureRegisteredForMessage()` veya `ensureRegisteredForInteraction()` çağrılır
2. Kayıtlı değilse kullanım şartları metni + "✅ Kullanım Şartlarını Onayla" butonu gönderilir
3. Buton tıklandığında `handleRegistrationButton()` çalışır:
   - Buton sahibi kontrolü (başka oyuncu tıklayamaz)
   - Sunucu eşleşme kontrolü
   - `Player` kaydı oluşturulur (upsert)
   - Starter baykuş oluşturulur: **Kukumav baykusu, Tier 8, Common kalite, 100 HP**
   - `PlayerRegistration` logu kaydedilir (kullanıcı adı, sunucu adı, tarih)
4. Buton mesajı güncellenir: "✅ Kaydın tamamlandı! 🎉"

### Kullanım Şartları İçeriği

- Hile, bug suistimali, üçüncü parti araç yasağı
- Spam/flood yasağı
- Çoklu hesap yasağı
- Güvenlik açığı bildirme yükümlülüğü
- Kural ihlalinde yaptırım uyarısı

---

## 4. Ortam Değişkenleri ve Yapılandırma

### Zorunlu Değişkenler

```env
DISCORD_TOKEN=...        # Bot token (Discord Developer Portal)
CLIENT_ID=...            # Bot uygulama ID'si
GUILD_ID=...             # Botun çalıştığı sunucu ID'si
DATABASE_URL=mongodb://localhost:27017/baykusbot
REDIS_URL=redis://localhost:6379
NODE_ENV=development     # veya production
```

### Opsiyonel — Liderboard Discord Rolleri

```env
ROLE_POWER_1=...   # 👑 Zirvenin Sahibi  (Güç #1)
ROLE_POWER_2=...   # 🔥 Mutlak Hükümdar  (Güç #2)
ROLE_HUNT_1=...    # 🎯 Av Efsanesi      (Av #1)
ROLE_HUNT_2=...    # 🌲 Gölge Avcısı     (Av #2)
ROLE_HUNT_3=...    # 🦉 Gece Yırtıcısı   (Av #3)
ROLE_RELIC_1=...   # 💎 Hazine Efendisi  (Nadir #1)
ROLE_RELIC_2=...   # 🔮 Gizem Avcısı     (Nadir #2)
ROLE_ARENA_1=...   # ⚔️ Arena Efsanesi   (PvP #1)
ROLE_ARENA_2=...   # 🛡️ Savaş Tanrısı    (PvP #2)
ROLE_WEALTH_1=...  # 💰 Altın Baron      (Servet #1)
ROLE_WEALTH_2=...  # 🏦 Servet Mimarı    (Servet #2)
```

Rol ID'leri boş bırakılırsa `/admin siralama` komutu ile otomatik oluşturulur ve Redis'e kaydedilir.

### config.ts — Merkezi Sabitler

`src/config.ts` dosyası 1133 satır olup tüm oyun sabitlerini içerir. Hiçbir sayısal değer başka dosyaya gömülemez. Kategoriler:

- Baykuş türleri ve tier bilgileri
- Level gating (tier unlock seviyeleri)
- Av hayvanları tablosu
- Tüm formül sabitleri (XP, hunt, catch, upgrade, tame, PvP, kumar)
- Stat roll band'ları (tier bazlı ağırlıklı stat üretimi)
- Trait tanımları (15 adet, her biri bonus+ceza çifti)
- Buff item tanımları ve lootbox tanımları
- Liderboard ağırlıkları ve sezon ayarları
- Upgrade bağımlılık haritası
- PvP streak tabloları
- Simüle PvP zorluk tablosu
- Embed renk sabitleri
- Lock ve rate limit sabitleri

---

## 24. Discord Rol Sistemi

**Dosya:** `src/systems/roles.ts`

### 11 Liderboard Rolü

| Key | İsim | Renk | Kategori | Sıra |
|-----|------|------|----------|------|
| POWER_1 | 👑 Zirvenin Sahibi | Altın | Güç | #1 |
| POWER_2 | 🔥 Mutlak Hükümdar | Turuncu | Güç | #2 |
| HUNT_1 | 🎯 Av Efsanesi | Yeşil | Av | #1 |
| HUNT_2 | 🌲 Gölge Avcısı | Açık yeşil | Av | #2 |
| HUNT_3 | 🦉 Gece Yırtıcısı | Teal | Av | #3 |
| RELIC_1 | 💎 Hazine Efendisi | Mor | Nadir | #1 |
| RELIC_2 | 🔮 Gizem Avcısı | Koyu mor | Nadir | #2 |
| ARENA_1 | ⚔️ Arena Efsanesi | Kırmızı | Arena | #1 |
| ARENA_2 | 🛡️ Savaş Tanrısı | Koyu kırmızı | Arena | #2 |
| WEALTH_1 | 💰 Altın Baron | Sarı | Servet | #1 |
| WEALTH_2 | 🏦 Servet Mimarı | Koyu sarı | Servet | #2 |

### Rol ID Saklama

Rol ID'leri önce Redis'te (`lb:role:{KEY}`), yoksa `.env`'de (`ROLE_{KEY}`) aranır.

### Rol Oluşturma

`/admin siralama` komutu:
1. Her rol için sunucuda isim eşleşmesi arar
2. Varsa ID'yi Redis'e kaydeder
3. Yoksa yeni rol oluşturur ve ID'yi Redis'e kaydeder
4. Sonuç embed'i döndürür (oluşturulan/mevcut/başarısız)

### Rol Senkronizasyonu

`syncAllRoles()` — sezon rollover'da ve `/admin lbsyncroles` ile çalışır:

```
Her kategori için:
  1. Liderboard verisini al
  2. Rol tanımlarını filtrele (bu kategoriye ait)
  3. Her rol için:
     a. Eski sahiplerin rollerini kaldır
     b. Yeni sahibe rol ver
```

Hata durumunda sessizce geçer (rol atama başarısız olursa bot çökmez).

---

## 25. Güvenlik ve Anti-Abuse Katmanları

### Dağıtık Kilit (withLock)

**Dosya:** `src/utils/lock.ts`

Kritik işlemlerde race condition önlemek için Redis tabanlı kilit:

```
withLock(playerId, 'hunt', async () => { ... })

Kilit TTL: 3 saniye
Kilit key: lock:{playerId}:{operation}

Aynı oyuncu aynı anda iki hunt yapamaz.
Aynı oyuncu aynı anda hem PvP hem upgrade yapamaz.
```

**Kilit gerektiren işlemler:** hunt, pvp, upgrade, tame, gamble, transfer, repair, maintenance, autosink, buff, lootbox

### Anti-Spam (Token Bucket)

**Dosya:** `src/middleware/antiSpam.ts`

```
Her kullanıcı için:
  - 10 saniyede 6 komut hakkı (token bucket)
  - Limit aşılırsa 30 saniye susturma (mute)
  - Susturulmuş kullanıcı komut kullanamaz

Redis keys:
  rate:{userId}  — token sayacı (10s TTL)
  mute:{userId}  — susturma (30s TTL)
```

Redis down olursa anti-spam atlanır (availability > correctness).

### Cooldown Sistemi

**Dosya:** `src/middleware/cooldown.ts`

```
getCooldownRemainingMs(redis, key, cooldownMs):
  1. redis.pttl(key) — kalan süre var mı?
  2. Varsa: kalan süreyi döndür (komut engellenir)
  3. Yoksa: redis.set(key, '1', 'PX', cooldownMs, 'NX') — atomik set
  4. Başarılıysa: 0 döndür (komut geçer)
  5. Başarısızsa (race condition): tekrar pttl oku
```

Redis down olursa 0 döner (cooldown atlanır, bot çalışmaya devam eder).

### PvP Anti-Abuse

```
Streak sayılma koşulu:
  loserPower >= winnerPower × 0.70

Rakip çok zayıfsa streak artmaz ama kazanma geçerlidir.
```

### Transfer Anti-Abuse

7 katmanlı koruma (bkz. Bölüm 22).

### Lootbox Anti-Farm

```
Günlük cap: 24 saatte max 5 lootbox drop
Level soft cap: Level 20+ sonrası drop şansı azalır (max -%30)
```

### Hata Yönetimi

```
Discord error code 10062 (Unknown Interaction):
  → Token süresi dolmuş, sessizce geç

Diğer hatalar:
  → Konsola logla
  → Kullanıcıya ephemeral hata mesajı gönder
  → Yanıt gönderilemezse sessizce geç (ikinci hata yutulur)
```

---

## 26. Middleware: Cooldown ve Anti-Spam

### Cooldown Anahtarları

| İşlem | Redis Key | Süre |
|-------|-----------|------|
| Hunt | `cooldown:hunt:{userId}` | 10s |
| Upgrade (başarılı) | `cooldown:upgrade:{userId}` | 30s |
| Upgrade (başarısız) | `cooldown:upgrade:{userId}` | 45s |
| Transfer | `cooldown:transfer:{userId}` | config |
| Main switch | `lastSwitch` (DB) | 1s |

### Rate Limit Parametreleri

```
COMMAND_RATE_LIMIT_TOKENS = 6    // 10 saniyede 6 komut
COMMAND_RATE_LIMIT_WINDOW_SECONDS = 10
SPAM_MUTE_SECONDS = 30           // Susturma süresi
LOCK_TTL_SECONDS = 3             // Kilit maksimum bekleme
```

---

## 27. Admin Komutları

**Dosya:** `src/commands/admin.ts`

Sadece bot sahibi kullanabilir (`OWNER_ID` sabit olarak tanımlı).

### Oyuncu Yönetimi

| Komut | Açıklama |
|-------|----------|
| `/admin stats @kullanici` | Oyuncu detaylı bilgi (level, XP, coin, baykuş, item) |
| `/admin resetplayer @kullanici` | Level/XP/coin/streak sıfırla |
| `/admin setlevel @kullanici <seviye>` | Seviye ayarla |
| `/admin setcoins @kullanici <miktar>` | Coin miktarını direkt ayarla |
| `/admin addcoins @kullanici <miktar>` | Coin ekle |
| `/admin addxp @kullanici <miktar>` | XP ekle |

### Baykuş Yönetimi

| Komut | Açıklama |
|-------|----------|
| `/admin healowl @kullanici` | Main baykuşu tam HP/Stamina yap |
| `/admin setstat @kullanici <stat> <değer>` | Baykuş statını ayarla |
| `/admin resetowl @kullanici` | Main baykuşun statlarını sıfırla |

### Envanter Yönetimi

| Komut | Açıklama |
|-------|----------|
| `/admin additem @kullanici <item> <miktar>` | Item ekle |
| `/admin removeitem @kullanici <item>` | Item sil |
| `/admin clearinventory @kullanici` | Envanteri tamamen temizle |

### Cooldown Yönetimi

| Komut | Açıklama |
|-------|----------|
| `/admin clearcooldown @kullanici` | Hunt cooldown temizle |
| `/admin clearallcooldowns` | TÜM hunt cooldown'larını temizle |
| `/admin clearupgradecooldown @kullanici` | Upgrade cooldown temizle |

### Sunucu Yönetimi

| Komut | Açıklama |
|-------|----------|
| `/admin serverinfo` | Oyuncu/baykuş/item/PvP sayıları + top 5 |
| `/admin broadcast <mesaj>` | Tüm kayıtlı oyunculara DM gönder |

### Liderboard Yönetimi

| Komut | Açıklama |
|-------|----------|
| `/admin siralama` | Liderboard rollerini sunucuda otomatik oluştur |
| `/admin lbcache` | Liderboard cache'ini temizle |
| `/admin lbseason` | Mevcut sezon bilgisini göster |
| `/admin lbreset` | Sezonu arşivle ve sıfırla (GERİ ALINAMAZ) |
| `/admin lbsyncroles` | Liderboard rollerini senkronize et |
| `/admin lbrefreshscore @kullanici` | Power score'u yenile |
| `/admin lbbackfill` | Mevcut veriden liderboard sayaçlarını doldur |

### Test Komutları

| Komut | Açıklama |
|-------|----------|
| `/admin testtame <tier> [kalite] [@kullanici]` | Encounter oluştur ve tame UI'ını başlat |

---

## 28. Kurulum ve Çalıştırma

### Gereksinimler

- Node.js ≥ 20.0.0
- pnpm ≥ 9.0.0
- MongoDB (yerel veya Atlas)
- Redis (yerel veya bulut)

### Kurulum Adımları

```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. .env dosyasını oluştur
cp .env.example .env
# .env dosyasını düzenle

# 3. Prisma client oluştur
pnpm prisma:generate

# 4. Veritabanı şemasını uygula
pnpm prisma:db:push

# 5. Slash komutları Discord'a kayıt et (bir kez)
pnpm deploy:commands

# 6. Geliştirme modunda başlat
pnpm dev

# VEYA production build
pnpm build
pnpm start

# VEYA PM2 ile
pm2 start ecosystem.config.js
```

### PM2 Yapılandırması (ecosystem.config.js)

```javascript
{
  name: 'owlhuntbot',
  script: 'src/index.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx/esm',
  env_file: '.env',
  watch: false,
  autorestart: true,
  max_restarts: 10,
  restart_delay: 3000,
}
```

### NPM Script'leri

| Script | Açıklama |
|--------|----------|
| `pnpm dev` | tsx watch ile geliştirme modu |
| `pnpm build` | TypeScript derleme |
| `pnpm start` | Derlenmiş kodu çalıştır |
| `pnpm lint` | ESLint kontrolü |
| `pnpm lint:fix` | ESLint otomatik düzeltme |
| `pnpm format` | Prettier formatlama |
| `pnpm prisma:generate` | Prisma client oluştur |
| `pnpm prisma:db:push` | Şemayı DB'ye uygula |
| `pnpm deploy:commands` | Slash komutları Discord'a kayıt et |

---

## 29. Mimari Kararlar ve Tasarım Notları

### config.ts — Tek Kaynak Prensibi

Tüm sayısal değerler, formüller ve sabitler `src/config.ts`'de tanımlanır. Hiçbir sayı başka dosyaya gömülemez. Bu sayede:
- Denge değişiklikleri tek yerden yapılır
- Formüller belgelenmiş ve yorumlanmış halde tutulur
- Tip güvenliği sağlanır (TypeScript const assertion)

### Transaction vs Lock Kararı

Atlas M0 (ücretsiz MongoDB) transaction timeout sorunları yaşar. Bu nedenle:
- **Hunt:** Transaction yok, lock + sıralı sorgular + paralel envanter upsert'leri
- **Upgrade:** Transaction var (materyal tüketimi atomik olmalı)
- **Gambling:** Transaction var (coin değişimi atomik olmalı)
- **Transfer:** Transaction var (iki taraf aynı anda güncelleniyor)

### Gizli Modifier Felsefesi

Level bonus, pity, hidden scaling gibi değerler oyuncuya gösterilmez. Tasarım gerekçesi:
- Oyuncu "ne oldu" görür, "nasıl hesaplandı" değil
- Immersion korunur
- Denge ayarları oyuncu davranışını etkilemeden yapılabilir

### Graceful Degradation

Redis down olursa:
- Cooldown atlanır (komutlar çalışmaya devam eder)
- Anti-spam atlanır
- Prefix cache miss → DB'den okunur
- Tame session kaybolur (oyuncu yeniden başlatmalı)

Bot hiçbir zaman Redis hatası yüzünden çökmez.

### Async Power Score

Liderboard güç skoru kritik yolda değildir:
```typescript
refreshPowerScore(prisma, playerId).catch(() => null);  // fire-and-forget
```
Hunt/PvP/upgrade sonrası arka planda güncellenir. Hata olursa sessizce geçilir.

### UI Katmanı Ayrımı

`src/commands/` — sadece Discord UI (embed, buton, animasyon, collector)
`src/systems/` — sadece iş mantığı (hesaplama, DB işlemleri)
`src/utils/math.ts` — saf formüller (DB bağımlılığı yok, test edilebilir)

Bu ayrım sayesinde iş mantığı Discord'dan bağımsız test edilebilir.

### Envanter Tasarımı

`[ownerId, itemName]` unique constraint ile aynı item tek satırda tutulur. Bu:
- DB boyutunu minimize eder
- Upsert işlemlerini basitleştirir
- Stack limit kontrolünü kolaylaştırır

### Sezon Tasarımı

Sezon sıfırlandığında oyuncu ilerlemesi (level, XP, coin, baykuşlar) korunur. Sadece liderboard istatistik sayaçları sıfırlanır. Bu sayede:
- Oyuncular emeklerini kaybetmez
- Her sezon yeni bir rekabet başlar
- Veteran oyuncular avantajlı ama yeni oyuncular da rekabet edebilir
