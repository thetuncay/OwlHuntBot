// ============================================================
// config.ts — BaykusBot Sabit ve Formul Merkezi
// Hicbir sayi baska dosyaya gomulemez. Hepsi buradan import edilir.
// ============================================================

// --- BAYKUS TURLERI ---
export const OWL_SPECIES = [
  { name: 'Blakiston balik baykusu', tier: 1, powerMultiplier: 1.5 },
  { name: 'Puhu baykusu', tier: 2, powerMultiplier: 1.35 },
  { name: 'Kar baykusu', tier: 3, powerMultiplier: 1.2 },
  { name: 'Boynuzlu baykus', tier: 4, powerMultiplier: 1.1 },
  { name: 'Buyuk boz baykus', tier: 5, powerMultiplier: 1.0 },
  { name: 'Ural baykusu', tier: 6, powerMultiplier: 0.9 },
  { name: 'Peceli baykus', tier: 7, powerMultiplier: 0.8 },
  { name: 'Kukumav baykusu', tier: 8, powerMultiplier: 0.7 },
] as const;

// --- LEVEL GATING (tier unlock icin minimum oyuncu seviyesi) ---
export const TIER_UNLOCK_LEVEL: Record<number, number> = {
  8: 1,
  7: 5,
  6: 10,
  5: 15,
  4: 20,
  3: 25,
  2: 30,
  1: 40,
};
//porno

// --- EVCILLESTIRME TEMEL SANS ---
export const TAME_BASE_CHANCE: Record<number, number> = {
  8: 70,
  7: 55,
  6: 40,
  5: 30,
  4: 20,
  3: 12,
  2: 6,
  1: 2,
};

// --- KALITE AYARLAMASI (tame sansina eklenir) ---
export const QUALITY_TAME_ADJ: Record<string, number> = {
  Trash: 10,
  Common: 0,
  Good: -5,
  Rare: -15,
  Elite: -25,
  'God Roll': -40,
};

// --- AV HAYVANLARI ---
export const PREY = [
  { name: 'fare',       difficulty: 1, baseChance: 90, xp: 5,  sellPrice: 5   },
  { name: 'serce',      difficulty: 2, baseChance: 85, xp: 6,  sellPrice: 8   },
  { name: 'kurbaga',    difficulty: 2, baseChance: 80, xp: 6,  sellPrice: 8   },
  { name: 'kertenkele', difficulty: 3, baseChance: 75, xp: 7,  sellPrice: 12  },
  { name: 'hamster',    difficulty: 3, baseChance: 75, xp: 7,  sellPrice: 12  },
  { name: 'kostebek',   difficulty: 4, baseChance: 70, xp: 8,  sellPrice: 18  },
  { name: 'yarasa',     difficulty: 4, baseChance: 65, xp: 9,  sellPrice: 20  },
  { name: 'bildircin',  difficulty: 5, baseChance: 60, xp: 10, sellPrice: 28  },
  { name: 'guvercin',   difficulty: 5, baseChance: 60, xp: 10, sellPrice: 28  },
  { name: 'yilan',      difficulty: 6, baseChance: 50, xp: 12, sellPrice: 40  },
  { name: 'sincap',     difficulty: 6, baseChance: 50, xp: 12, sellPrice: 40  },
  { name: 'tavsan',     difficulty: 7, baseChance: 40, xp: 15, sellPrice: 65  },
  { name: 'gelincik',   difficulty: 8, baseChance: 30, xp: 18, sellPrice: 90  },
  { name: 'kirpi',      difficulty: 9, baseChance: 25, xp: 20, sellPrice: 120 },
] as const;

// Tier'a gore avlanabilecek hayvanlar (difficulty <= esik)
export const OWL_PREY_POOL: Record<number, number> = {
  8: 4,
  7: 5,
  6: 6,
  5: 7,
  4: 8,
  3: 9,
  2: 9,
  1: 9,
};

// --- SWITCH SISTEMI ---
export const SWITCH_BASE_COST = 500;
export const SWITCH_TIER_MULTIPLIER = 200;
export const SWITCH_COOLDOWN_MS = 60 * 60 * 1000;
export const SWITCH_HP_THRESHOLD = 0.3;
export const SWITCH_PENALTY_DURATION = 10 * 60 * 1000;
export const SWITCH_PENALTY_DAMAGE = -0.1;
export const SWITCH_PENALTY_DODGE = -0.1;

// --- BOND ---
export const BOND_BONUS_RATE = 0.2;

// --- XP ---
export const XP_LEVEL_FORMULA = (L: number): number =>
  Math.round(100 * Math.pow(L, 1.65) + L * 20);
export const XP_PVP_WIN = 50;
export const XP_PVP_LOSE = 15;
export const XP_TAME = 100;
export const XP_RARE_BONUS = 50;
export const XP_SCALE_RATE = 0.03;
export const XP_COMBO_3 = 10;
export const XP_COMBO_5 = 25;
export const XP_RISK_BONUS_RATE = 0.5;

// --- HUNT ---
export const HUNT_ROLL_BASE = 3;
export const HUNT_ROLL_PER_LEVEL = 5;
export const HUNT_COOLDOWN_MS = 10 * 1000; // 10 saniye
export const HUNT_CRITICAL_RATE = 10;
export const HUNT_INJURY_RATE = 5;
export const HUNT_HIGH_TIER_THRESHOLD = 7;

// Soft level scaling: catchChance += level * bu değer (gizli, kullanıcıya gösterilmez)
export const HUNT_LEVEL_CATCH_BONUS = 0.003; // Lv.10 = +3%, Lv.30 = +9%, max clamp
export const HUNT_LEVEL_CATCH_MAX   = 0.12;  // max +12% bonus

// Fail XP oranı artırıldı: 0.3 → 0.45
export const XP_FAIL_RATIO = 0.45;

// Multi-success bonus XP
export const HUNT_MULTI_BONUS_2 = 5;   // 2 başarı → +5 XP
export const HUNT_MULTI_BONUS_3 = 12;  // 3 başarı → +12 XP
export const HUNT_MULTI_BONUS_5 = 25;  // 5+ başarı → +25 XP

// Pity sistemi: X hunt sonrası nadir şans artışı
export const HUNT_PITY_THRESHOLD  = 8;    // 8 hunt'ta nadir yoksa devreye girer
export const HUNT_PITY_BONUS_RATE = 0.04; // her hunt başına +4% nadir şans
export const HUNT_PITY_MAX_BONUS  = 0.25; // max +25% nadir şans

// Streak sistemi: ardışık başarılı hunt bonusu
export const HUNT_STREAK_BONUS_RATE = 0.05; // her streak için +5% catch chance
export const HUNT_STREAK_MAX_BONUS  = 0.20; // max +20%

// --- CATCH ---
export const CATCH_STAT_PENCE = 0.25;
export const CATCH_STAT_GOZ = 0.15;
export const CATCH_STAT_KANAT = 0.2;
export const CATCH_MIN = 0.05;
export const CATCH_MAX = 0.95;
export const CATCH_TIER_GAP_MIN = 2;
export const CATCH_TIER_GAP_MULT = 0.6;

// --- SPAWN ---
export const SPAWN_GOZ_RATE = 0.03;
export const SPAWN_KULAK_RATE = 0.02;

// --- UPGRADE ---
export const UPGRADE_LEVEL_BONUS = 0.6;
export const UPGRADE_BASE_CHANCE = 65;
export const UPGRADE_STAT_EXP = 1.15;
export const UPGRADE_STAT_MULT = 0.8;
export const UPGRADE_MIN = 5;
export const UPGRADE_MAX = 95;
export const UPGRADE_ENDGAME_LEVEL = 40;
export const UPGRADE_FAIL_DOWNGRADE_RATE = 20;
export const UPGRADE_COOLDOWN_MS = 60 * 1000; // 1 dakika

// Her stat için upgrade maliyeti (item adı → gerekli miktar)
export const UPGRADE_COST: Record<string, { itemName: string; quantity: number }[]> = {
  gaga:  [{ itemName: 'Kemik Tozu',             quantity: 2 }],
  goz:   [{ itemName: 'Av Gözü Kristali',        quantity: 2 }],
  kulak: [{ itemName: 'Kırık Av Zinciri',        quantity: 2 }],
  kanat: [{ itemName: 'Parlak Tüy',              quantity: 2 }],
  pence: [{ itemName: 'Yırtıcı Pençe Parçası',   quantity: 2 }],
};

// Hunt sırasında düşebilecek upgrade materyalleri
// dropChance: 0-100 arası yüzde
export const HUNT_ITEM_DROPS: {
  itemName: string;
  itemType: string;
  rarity: string;
  dropChance: number;          // her başarılı av rolünde bu şans
  minDifficulty: number;       // en az bu zorlukta av gerekli
}[] = [
  { itemName: 'Kemik Tozu',           itemType: 'Materyal', rarity: 'Common',   dropChance: 25, minDifficulty: 1 },
  { itemName: 'Parlak Tüy',           itemType: 'Materyal', rarity: 'Common',   dropChance: 20, minDifficulty: 2 },
  { itemName: 'Kırık Av Zinciri',     itemType: 'Materyal', rarity: 'Uncommon', dropChance: 15, minDifficulty: 3 },
  { itemName: 'Av Gözü Kristali',     itemType: 'Materyal', rarity: 'Uncommon', dropChance: 12, minDifficulty: 4 },
  { itemName: 'Yırtıcı Pençe Parçası',itemType: 'Materyal', rarity: 'Rare',     dropChance: 10, minDifficulty: 4 },
  { itemName: 'Sessizlik Teli',       itemType: 'Materyal', rarity: 'Uncommon', dropChance: 10, minDifficulty: 3 },
  { itemName: 'Orman Yankısı',        itemType: 'Materyal', rarity: 'Rare',     dropChance: 6,  minDifficulty: 6 },
  { itemName: 'Gölge Tüyü',          itemType: 'Materyal', rarity: 'Rare',     dropChance: 5,  minDifficulty: 7 },
];

// --- STAT SOFT CAP ---
export const STAT_SOFTCAP_NUM = 70;
export const STAT_SOFTCAP_DEN = 30;

// ============================================================
// WEIGHTED STAT URETIMI
// ============================================================
//
// Her tier icin 3 bölge tanimlanir: dusuk / orta / yuksek
// Agirliklar: dusuk=%55, orta=%35, yuksek=%10
// Amac: Dusuk degerler sik, yuksek degerler nadir — ama heyecan korunur.
//
// Tier 1 (en guclu tur) → en yuksek araliklar
// Tier 8 (en zayif tur) → en dusuk araliklar
//
// Her satir: [dusukMin, dusukMax, ortaMin, ortaMax, yuksekMin, yuksekMax]

export interface StatRollBand {
  low:  [number, number];  // %55 agirlik
  mid:  [number, number];  // %35 agirlik
  high: [number, number];  // %10 agirlik
}

export const STAT_ROLL_BANDS: Record<number, StatRollBand> = {
  1: { low: [55, 72], mid: [73, 87], high: [88, 100] }, // Blakiston — en guclu
  2: { low: [48, 64], mid: [65, 79], high: [80,  95] }, // Puhu
  3: { low: [40, 56], mid: [57, 71], high: [72,  88] }, // Kar
  4: { low: [32, 48], mid: [49, 63], high: [64,  80] }, // Boynuzlu
  5: { low: [24, 40], mid: [41, 55], high: [56,  72] }, // Buyuk boz
  6: { low: [16, 32], mid: [33, 47], high: [48,  64] }, // Ural
  7: { low: [10, 24], mid: [25, 38], high: [39,  54] }, // Peceli
  8: { low: [ 5, 18], mid: [19, 30], high: [31,  45] }, // Kukumav — en zayif
};

// Agirlik sabitleri (toplam 100)
export const STAT_ROLL_WEIGHT_LOW  = 55;
export const STAT_ROLL_WEIGHT_MID  = 35;
export const STAT_ROLL_WEIGHT_HIGH = 10;

// ============================================================
// TRAIT SISTEMI
// ============================================================
//
// Her yeni baykus 1-2 adet rastgele utility trait alir.
// Kurallar:
//   - Trait'ler ham guc artisi DEGILDIR (stat +X gibi bir sey yok)
//   - Her trait'in bir artisi (bonus) ve bir eksisi (penalty) vardir
//   - Rarity trait'in davranisini etkiler, ham gucu degil
//   - Trait'ler situasyonel avantaj saglar
//
// bonusType / penaltyType degerleri:
//   hunt_reward    → av odul carpani (coin/xp)
//   hunt_catch     → yakalama sansi
//   pvp_damage     → PvP hasar carpani
//   pvp_dodge      → PvP kacis sansi
//   tame_chance    → evcillestirme sansi
//   xp_gain        → kazanilan XP carpani
//   encounter_rate → encounter tetiklenme sansi
//   stamina_regen  → stamina yenilenme hizi
//   hp_max         → maksimum HP carpani
//   cooldown_red   → cooldown suresi azaltma (carpan, 0.8 = %20 azalir)

export interface OwlTrait {
  id:           string;   // benzersiz kimlik
  name:         string;   // oyuncuya gosterilen isim
  description:  string;   // kisa aciklama
  bonusType:    string;   // hangi sistemi etkiler
  bonusValue:   number;   // carpan veya yuzde (1.15 = +%15)
  penaltyType:  string;   // hangi sistemi cezalandirir
  penaltyValue: number;   // carpan veya yuzde (0.85 = -%15)
  weight:       number;   // rastgele secim agirligi (yuksek = daha sik)
}

export const OWL_TRAITS: OwlTrait[] = [
  // ── AV ODAKLI TRAIT'LER ──────────────────────────────────────────────────
  {
    id:           't001',
    name:         '🎯 Keskin Göz',
    description:  'Av ödülleri artar ama evcilleştirme zorlaşır.',
    bonusType:    'hunt_reward',
    bonusValue:   1.20,   // +%20 av odulu
    penaltyType:  'tame_chance',
    penaltyValue: 0.80,   // -%20 tame sansi
    weight:       18,
  },
  {
    id:           't002',
    name:         '🌙 Sessiz Kanat',
    description:  'Yakalama şansı yükselir ama PvP hasarı düşer.',
    bonusType:    'hunt_catch',
    bonusValue:   1.18,   // +%18 yakalama sansi
    penaltyType:  'pvp_damage',
    penaltyValue: 0.85,   // -%15 PvP hasar
    weight:       16,
  },
  {
    id:           't003',
    name:         '🦇 Gece Avcısı',
    description:  'XP kazanımı artar ama cooldown uzar.',
    bonusType:    'xp_gain',
    bonusValue:   1.22,   // +%22 XP
    penaltyType:  'cooldown_red',
    penaltyValue: 1.25,   // +%25 cooldown (daha uzun bekler)
    weight:       14,
  },
  {
    id:           't004',
    name:         '⚡ Hızlı Pençe',
    description:  'Cooldown kısalır ama av ödülleri azalır.',
    bonusType:    'cooldown_red',
    bonusValue:   0.78,   // -%22 cooldown (daha hizli)
    penaltyType:  'hunt_reward',
    penaltyValue: 0.82,   // -%18 av odulu
    weight:       15,
  },

  // ── PVP ODAKLI TRAIT'LER ─────────────────────────────────────────────────
  {
    id:           't005',
    name:         '🔥 Saldırgan Ruh',
    description:  'PvP hasarı artar ama HP düşer.',
    bonusType:    'pvp_damage',
    bonusValue:   1.22,   // +%22 PvP hasar
    penaltyType:  'hp_max',
    penaltyValue: 0.82,   // -%18 max HP
    weight:       13,
  },
  {
    id:           't006',
    name:         '🛡️ Demir Deri',
    description:  'Max HP artar ama PvP dodge şansı düşer.',
    bonusType:    'hp_max',
    bonusValue:   1.25,   // +%25 max HP
    penaltyType:  'pvp_dodge',
    penaltyValue: 0.78,   // -%22 dodge sansi
    weight:       12,
  },
  {
    id:           't007',
    name:         '💨 Kaçamak Ustası',
    description:  'PvP dodge şansı yükselir ama hasar azalır.',
    bonusType:    'pvp_dodge',
    bonusValue:   1.25,   // +%25 dodge
    penaltyType:  'pvp_damage',
    penaltyValue: 0.80,   // -%20 hasar
    weight:       11,
  },

  // ── KARMA / UTILITY TRAIT'LER ────────────────────────────────────────────
  {
    id:           't008',
    name:         '🔍 Meraklı Bakış',
    description:  'Encounter şansı artar ama stamina yavaş yenilenir.',
    bonusType:    'encounter_rate',
    bonusValue:   1.30,   // +%30 encounter sansi
    penaltyType:  'stamina_regen',
    penaltyValue: 0.75,   // -%25 stamina yenilenme
    weight:       14,
  },
  {
    id:           't009',
    name:         '🌿 Dingin Ruh',
    description:  'Stamina hızlı yenilenir ama encounter şansı düşer.',
    bonusType:    'stamina_regen',
    bonusValue:   1.30,   // +%30 stamina yenilenme
    penaltyType:  'encounter_rate',
    penaltyValue: 0.75,   // -%25 encounter sansi
    weight:       13,
  },
  {
    id:           't010',
    name:         '🤝 Evcil Ruh',
    description:  'Evcilleştirme şansı artar ama av ödülleri azalır.',
    bonusType:    'tame_chance',
    bonusValue:   1.28,   // +%28 tame sansi
    penaltyType:  'hunt_reward',
    penaltyValue: 0.82,   // -%18 av odulu
    weight:       12,
  },
  {
    id:           't011',
    name:         '📚 Deneyimli',
    description:  'XP kazanımı artar ama PvP hasarı düşer.',
    bonusType:    'xp_gain',
    bonusValue:   1.18,   // +%18 XP
    penaltyType:  'pvp_damage',
    penaltyValue: 0.88,   // -%12 PvP hasar
    weight:       15,
  },
  {
    id:           't012',
    name:         '🪨 Ağır Kanat',
    description:  'Max HP artar ama cooldown uzar.',
    bonusType:    'hp_max',
    bonusValue:   1.20,   // +%20 max HP
    penaltyType:  'cooldown_red',
    penaltyValue: 1.20,   // +%20 cooldown (daha uzun)
    weight:       11,
  },
  {
    id:           't013',
    name:         '👂 Keskin Kulak',
    description:  'Encounter şansı artar ama XP kazanımı azalır.',
    bonusType:    'encounter_rate',
    bonusValue:   1.22,   // +%22 encounter
    penaltyType:  'xp_gain',
    penaltyValue: 0.85,   // -%15 XP
    weight:       13,
  },
  {
    id:           't014',
    name:         '💪 Yorulmaz',
    description:  'Stamina hızlı yenilenir ama evcilleştirme zorlaşır.',
    bonusType:    'stamina_regen',
    bonusValue:   1.25,   // +%25 stamina
    penaltyType:  'tame_chance',
    penaltyValue: 0.82,   // -%18 tame sansi
    weight:       12,
  },
  {
    id:           't015',
    name:         '🏹 Usta Avcı',
    description:  'Yakalama şansı ve av ödülleri artar ama HP düşer.',
    bonusType:    'hunt_catch',
    bonusValue:   1.15,   // +%15 yakalama
    penaltyType:  'hp_max',
    penaltyValue: 0.80,   // -%20 max HP
    weight:       10,     // Daha nadir — cift bonus hissi verir
  },
];

// Bir baykusun kac trait alacagi (min-max)
export const TRAIT_COUNT_MIN = 1;
export const TRAIT_COUNT_MAX = 2;

// Yuksek tier baykuslar ikinci trait icin ek agirlik alir
// (tier 1-3 = daha yuksek ihtimal iki trait)
export const TRAIT_DOUBLE_TIER_THRESHOLD = 3;  // tier <= 3 ise iki trait sansi artar
export const TRAIT_DOUBLE_CHANCE_HIGH    = 65; // tier 1-3: %65 iki trait
export const TRAIT_DOUBLE_CHANCE_LOW     = 35; // tier 4-8: %35 iki trait

// --- ENCOUNTER ---
export const ENCOUNTER_BASE = 0.5;
export const ENCOUNTER_LEVEL_RATE = 0.05;
export const ENCOUNTER_GOZ_RATE = 0.03;
export const ENCOUNTER_KULAK_RATE = 0.02;
export const ENCOUNTER_MIN = 0.5;
export const ENCOUNTER_MAX = 15;

// ============================================================
// ENCOUNTER HIDDEN SCALING (MATCHMAKING)
// ============================================================
//
// Oyuncu guclu oldukca karsisina cikan yabani baykusun stat'lari
// gizlice yukari kayar. Oyuncuya hicbir sey gosterilmez.
//
// Formul:
//   scaledStat = baseStat * (1 + hiddenBonus)
//   hiddenBonus = clamp(0, MAX, (playerPower - THRESHOLD) * RATE)
//
// Ornek:
//   Oyuncu gucu 200, esik 120, oran 0.004
//   hiddenBonus = (200 - 120) * 0.004 = 0.32 → stat'lar %32 daha yuksek
//
// Amac: Guclu oyuncu kolay farming yapmasin, zorluk hep hissedilsin.
// Oyuncuya gosterilmez — immersion bozulmaz.

// Oyuncu gucu bu esigi astiktan sonra scaling devreye girer
// (Guc = statEffect toplamı, yaklasik 5 stat × ortalama 35 = ~175)
export const ENCOUNTER_SCALE_THRESHOLD = 120;

// Her guc puani basina kac % stat artisi (carpan olarak)
export const ENCOUNTER_SCALE_RATE = 0.003;

// Maksimum gizli stat artisi (carpan olarak, 0.45 = max %45)
export const ENCOUNTER_SCALE_MAX = 0.45;

// ============================================================
// RARITY → TRAIT AGIRLIK CARPANLARI
// ============================================================
//
// Rarity artik ham stat'i degil trait davranisini etkiler.
// Yuksek rarity baykuslar daha nadir (yuksek agirlikli) trait'lere
// daha yuksek ihtimalle sahip olur.
//
// Nasil calisir:
//   Her trait'in config'deki weight degeri bu carpanla cogaltilir.
//   Dusuk agirlikli (nadir) trait'ler yuksek rarity'de daha erisebilir olur.
//
// Ornek:
//   God Roll baykus: nadir trait'lerin agirligi x2.5 artar
//   Trash baykus:    nadir trait'lerin agirligi x0.5 azalir
//
// Carpan sadece dusuk agirlikli trait'lere uygulanir (weight <= RARE_WEIGHT_THRESHOLD)

export const RARITY_TRAIT_WEIGHT_MULT: Record<string, number> = {
  'Trash':    0.5,   // Nadir trait'ler daha da nadir
  'Common':   0.8,
  'Good':     1.0,   // Baz deger — degisiklik yok
  'Rare':     1.4,
  'Elite':    1.8,
  'God Roll': 2.5,   // Nadir trait'ler cok daha erisebilir
};

// Bu esik altindaki weight degerine sahip trait'ler "nadir" sayilir
// ve rarity carpani uygulanir
export const RARITY_RARE_WEIGHT_THRESHOLD = 12;

// --- TAME ---
export const TAME_GOZ_RATE = 0.25;
export const TAME_KULAK_RATE = 0.2;
export const TAME_MIN = 2;
export const TAME_MAX = 92;
export const TAME_MAX_ATTEMPTS = 3;
export const TAME_FAIL_STREAK_BONUS = 5;
export const TAME_REPEAT_PENALTY = 10;
export const TAME_MINI_PVP_BONUS = 10;
export const TAME_FAIL_ESCAPE_RATE = 60;
export const TAME_FAIL_ATTACK_RATE = 25;
export const TAME_FAIL_INJURE_RATE = 15;
export const TAME_ITEM_BONUS_PER_ITEM = 5;

// --- PVP ---
export const PVP_STAT_WEIGHT = 0.7;
export const PVP_RNG_WEIGHT = 0.3;
export const PVP_MOMENTUM_RATE = 0.05;
export const PVP_EXECUTE_HP_THRESH = 0.2;
export const PVP_EXECUTE_STAM_THRESH = 30;
export const PVP_EXECUTE_DAMAGE = 999;
export const PVP_STAM_FULL_MIN = 60;
export const PVP_STAM_DODGE_MIN = 30;
export const PVP_STAM_DAMAGE_MIN = 10;
export const PVP_STAM_DODGE_PEN = -0.1;
export const PVP_STAM_DAMAGE_PEN = -0.15;
export const PVP_STAM_FATIGUE_PEN = -0.25;
export const PVP_REPAIR_AFTER = 3;
export const PVP_REPAIR_LOSS = 2;
export const PVP_MAX_TURNS = 30;
export const PVP_BASE_HP = 100;

// --- KUMAR ---
export const GAMBLE_COINFLIP_WIN_CHANCE = 49;
export const GAMBLE_COINFLIP_PAYOUT = 1.95;
export const GAMBLE_BJ_BLACKJACK_PAYOUT = 1.5;
export const GAMBLE_BJ_WIN_PAYOUT = 1.9;
export const GAMBLE_WIN_CLAMP_MIN = 1;
export const GAMBLE_WIN_CLAMP_MAX = 99;
export const GAMBLE_STREAK_LOSS_3 = 3;
export const GAMBLE_STREAK_LOSS_5 = 5;
export const GAMBLE_STREAK_WIN_3 = -2;
export const GAMBLE_STREAK_WIN_5 = -5;
export const GAMBLE_RICH_PENALTY_MAX = 15;
export const GAMBLE_BET_PENALTY_MULT = 5;
export const GAMBLE_SLOT_HIDDEN_JACKPOT = 0.2;

// Kumar cooldown süreleri (ms)
export const GAMBLE_COINFLIP_COOLDOWN_MS = 5 * 1000;   // 5 saniye
export const GAMBLE_SLOT_COOLDOWN_MS     = 5 * 1000;   // 5 saniye
export const GAMBLE_BJ_COOLDOWN_MS       = 5 * 1000;  // 30 saniye (interaktif oyun)

export const SLOT_TABLE = [
  { name: '🦉🦉🦉 Jackpot', chance: 0.3, payout: 4 },
  { name: '🦉 Kuş Üçlüsü', chance: 5, payout: 2 },
  { name: '🐍 Yılan Üçlüsü', chance: 10, payout: 1.5 },
  { name: '🐭 Fare Üçlüsü', chance: 15, payout: 1.2 },
  { name: '💎 Elmas Üçlüsü', chance: 0.1, payout: 8 },
  { name: '💨 Kayıp', chance: 69.6, payout: 0 },
] as const;

// --- ENVANTER ---
export const INVENTORY_BASE_SLOTS = 30;
export const INVENTORY_PER_LEVEL = 2;
export const STACK_LIMITS = {
  Common: 999,
  Uncommon: 200,
  Rare: 50,
  Epic: 10,
  Legendary: 1,
} as const;
export const ITEM_MAX_PER_ATTEMPT = 2;
export const ITEM_MAX_STACK_SAME = 3;
export const AUTO_SINK_MODES = ['auto-sell', 'auto-disassemble', 'auto-convert'] as const;

export const UPGRADE_ITEM_BONUS: Record<string, number> = {
  'Kemik Tozu': 3,
  'Parlak Tuy': 4,
  'Av Gozu Kristali': 5,
  'Sessizlik Teli': 3,
  'Yirtici Pence Parcasi': 6,
  'Orman Yankisi': 5,
  'Kirik Av Zinciri': 4,
  'Golge Tuyu': 2,
};

export const TAME_ITEM_BONUS: Record<string, number> = {
  'Cig Et': 5,
  'Yirtici Yem': 8,
  'Kan Kokusu': 10,
  'Sessiz Yem': 6,
  'Alfa Feromon': 12,
  'Eski Tuy Parcasi': 0,
};

// --- MAINTENANCE ---
export const MAINTENANCE_DAILY_ITEM = 'Cig Et';
export const MAINTENANCE_DAILY_AMT = 1;
export const MAINTENANCE_MISS_EFFECTIVENESS_LOSS = 5;
export const REPAIR_BASE_COST = 250;
export const REPAIR_EFFECTIVENESS_FULL = 100;
export const AUTO_SINK_COIN_PER_ITEM = 3;
export const AUTO_SINK_XP_PER_ITEM = 1;
// --- EMBED RENKLERI ---
export const COLOR_SUCCESS = 0x2ecc71;
export const COLOR_FAIL = 0xe74c3c;
export const COLOR_INFO = 0x3498db;
export const COLOR_WARNING = 0xf1c40f;

// --- LOCK & RATE LIMIT ---
export const LOCK_TTL_SECONDS = 3;   // 10s → 3s: lock takılırsa max 3s bekler
export const COMMAND_RATE_LIMIT_TOKENS = 6;
export const COMMAND_RATE_LIMIT_WINDOW_SECONDS = 10;
export const SPAM_MUTE_SECONDS = 30;

// ============================================================
// LIDERBOARD SISTEMI
// ============================================================

// --- GUC SKORU AGIRLIKLARI ---
// Power Score = level*WEIGHT_LEVEL + totalXP*WEIGHT_XP + totalRareFinds*WEIGHT_RARE
export const POWER_WEIGHT_LEVEL = 150;   // Her level 150 puan
export const POWER_WEIGHT_XP    = 0.05;  // Her XP 0.05 puan
export const POWER_WEIGHT_RARE  = 80;    // Her nadir bulgu 80 puan

// --- SEZON AYARLARI ---
export const SEASON_TYPE: 'weekly' | 'monthly' = 'weekly';  // 'weekly' | 'monthly'

// --- LIDERBOARD CACHE (saniye) ---
export const LEADERBOARD_CACHE_TTL = 120;  // 2 dakika cache
export const LEADERBOARD_TOP_N     = 10;   // Gosterilecek max oyuncu

// --- OZEL ROLLER (Discord Role ID'leri) ---
// .env'e ROLE_* olarak eklenebilir; yoksa /admin siralama ile otomatik olusturulur
export const ROLE_IDS = {
  POWER_1:  process.env.ROLE_POWER_1  ?? '',
  POWER_2:  process.env.ROLE_POWER_2  ?? '',
  HUNT_1:   process.env.ROLE_HUNT_1   ?? '',
  HUNT_2:   process.env.ROLE_HUNT_2   ?? '',
  HUNT_3:   process.env.ROLE_HUNT_3   ?? '',
  RELIC_1:  process.env.ROLE_RELIC_1  ?? '',
  RELIC_2:  process.env.ROLE_RELIC_2  ?? '',
  ARENA_1:  process.env.ROLE_ARENA_1  ?? '',
  ARENA_2:  process.env.ROLE_ARENA_2  ?? '',
  WEALTH_1: process.env.ROLE_WEALTH_1 ?? '',
  WEALTH_2: process.env.ROLE_WEALTH_2 ?? '',
} as const;

// ============================================================
// UPGRADE DEPENDENCY SISTEMI
// ============================================================

// Bağımlılık haritası: her stat hangi stata bağlı, oran ne?
// Kural: stat X'i seviye N'e çıkarmak için bağımlı stat >= floor(N × ratio) olmalı
// Oran 0.4–0.6 arası tutuldu (ne çok sert ne çok gevşek)
//
// Bağımlılık zinciri (döngüsüz):
//   pence  → bağımsız (temel stat, hiçbir şeye bağlı değil)
//   gaga   → pence  (saldırı için yakalama gücü gerekir)
//   kulak  → pence  (tespit için temel güç gerekir)
//   goz    → kulak  (görüş için işitme gerekir)
//   kanat  → goz    (hız için görüş gerekir)
//
// Örnek: Gaga Lv.10 → Pence en az Lv.5 (floor(10 × 0.5))
//        Göz  Lv.15 → Kulak en az Lv.7 (floor(15 × 0.45))

export interface UpgradeDependency {
  dependsOn: 'gaga' | 'goz' | 'kulak' | 'kanat' | 'pence' | null;
  ratio: number;   // 0.0 = bağımsız, 0.5 = hedef seviyenin %50'si
}

export const UPGRADE_DEPENDENCIES: Record<string, UpgradeDependency> = {
  pence: { dependsOn: null,    ratio: 0   },   // Temel stat — bağımsız
  gaga:  { dependsOn: 'pence', ratio: 0.5 },   // Gaga 10 → Pence ≥ 5
  kulak: { dependsOn: 'pence', ratio: 0.4 },   // Kulak 10 → Pence ≥ 4
  goz:   { dependsOn: 'kulak', ratio: 0.45 },  // Göz 10 → Kulak ≥ 5 (floor)
  kanat: { dependsOn: 'goz',   ratio: 0.5 },   // Kanat 10 → Göz ≥ 5
} as const;

// Bağımlılık kontrolü devreye girmeye başlayan minimum hedef seviye
// (düşük seviyelerde oyuncuyu erken kısıtlama)
export const UPGRADE_DEP_MIN_LEVEL = 5;

// ============================================================
// PVP WIN STREAK SISTEMI
// ============================================================

// XP bonus tablosu: streak eşiği → bonus yüzdesi
// Lineer değil, milestone bazlı — daha dramatik hissettiriyor
export const PVP_STREAK_XP_BONUSES: { threshold: number; bonus: number }[] = [
  { threshold: 2,  bonus: 3  },   // 🔥 2 streak → +3% XP
  { threshold: 3,  bonus: 5  },   // 🔥 3 streak → +5% XP
  { threshold: 5,  bonus: 8  },   // 🔥 5 streak → +8% XP
  { threshold: 7,  bonus: 10 },   // ⚡ 7 streak → +10% XP
  { threshold: 10, bonus: 12 },   // ⚡ 10 streak → +12% XP
];

// Coin bonus tablosu: streak eşiği → ekstra coin
export const PVP_STREAK_COIN_BONUSES: { threshold: number; coins: number }[] = [
  { threshold: 3,  coins: 15  },  // 3 streak → +15 coin
  { threshold: 5,  coins: 30  },  // 5 streak → +30 coin
  { threshold: 10, coins: 50  },  // 10 streak → +50 coin
];

// Maksimum XP bonus (aşılamaz tavan)
export const PVP_STREAK_MAX_XP_BONUS = 12;   // %12

// Anti-abuse: rakibin gücü oyuncunun gücünün bu oranının altındaysa streak sayılmaz
// Güç = statEffect(gaga + pence + kanat)
export const PVP_STREAK_MIN_OPPONENT_RATIO = 0.70;  // %70

// Milestone mesajları (streak sayısı → mesaj)
export const PVP_STREAK_MILESTONES: Record<number, string> = {
  3:  '🔥 Isınıyor!',
  5:  '🔥🔥 Alev aldı!',
  7:  '⚡ Durdurulamıyor!',
  10: '💀 EFSANEVİ STREAK!',
  15: '👑 TANRI MODU!',
};

// ============================================================
// SIMULATED PVP (BOT DUEL) SISTEMI
// ============================================================

// Zorluk dağılımı: [ağırlık, güç çarpanı, XP çarpanı]
// %60 kolay, %30 dengeli, %10 zor
export const SIM_PVP_DIFFICULTY_TABLE: {
  weight: number;
  powerRatio: number;  // oyuncu gücüne oranla düşman gücü
  xpMult: number;      // kazanma XP çarpanı
  label: string;
}[] = [
  { weight: 60, powerRatio: 0.85, xpMult: 0.8,  label: 'Kolay'    },
  { weight: 30, powerRatio: 1.00, xpMult: 1.0,  label: 'Dengeli'  },
  { weight: 10, powerRatio: 1.20, xpMult: 1.35, label: 'Zorlu'    },
];

// Simüle PvP ödülleri
export const SIM_PVP_WIN_COINS  = 60;   // Kazanma coin ödülü (gerçek PvP'den az)
export const SIM_PVP_LOSE_COINS = 0;
export const SIM_PVP_WIN_XP     = 40;   // Kazanma base XP
export const SIM_PVP_LOSE_XP    = 10;   // Kaybetme XP (sıfır değil)

// Cooldown: aynı oyuncu kaç ms'de bir bot duel yapabilir
export const SIM_PVP_COOLDOWN_MS = HUNT_COOLDOWN_MS;  // Hunt ile aynı

// Sahte oyuncu isimleri havuzu
export const SIM_PVP_FAKE_NAMES: string[] = [
  'Karanlık Avcı', 'Gece Baykuşu', 'Orman Efendisi', 'Sessiz Kanat',
  'Yıldırım Pençe', 'Gölge Avcı', 'Dağ Kartalı', 'Fırtına Gözü',
  'Demir Gaga', 'Buz Kulak', 'Ateş Kanat', 'Taş Pençe',
  'Kuzey Rüzgarı', 'Ay Işığı', 'Şimşek Gözü', 'Kara Tüy',
  'Altın Kanat', 'Gümüş Pençe', 'Bronz Gaga', 'Demir Kulak',
];

// Sahte baykuş türleri (görsel için)
export const SIM_PVP_FAKE_SPECIES: string[] = [
  'Kukumav baykusu', 'Peceli baykus', 'Ural baykusu',
  'Buyuk boz baykus', 'Boynuzlu baykus', 'Kar baykusu',
  'Puhu baykusu', 'Blakiston balik baykusu',
];

// ============================================================
// BUFF ITEM & LOOTBOX SISTEMI
// ============================================================
//
// Bu sistem upgrade materyallerinden TAMAMEN AYRIDIR.
// Buff item'ları süreli/kullanım bazlı geçici avantaj sağlar.
// Lootbox'lar hunt/PvP/encounter'dan düşer, satın alınamaz.
//
// Tasarım felsefesi:
//   - Her item bir tradeoff veya sınır içerir
//   - Aynı tip item stack'lenmesi diminishing returns ile zayıflar
//   - PvP boost'ları %20-%85 clamp'i aşamaz
//   - Sistem oyunu hızlandırmaz, karar vermeyi ödüllendirir

// ── BUFF ITEM TİPLERİ ────────────────────────────────────────────────────────

export type BuffItemCategory = 'hunt' | 'upgrade' | 'pvp';
export type BuffItemRarity   = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export interface BuffItemDef {
  id:          string;
  name:        string;
  emoji:       string;
  description: string;
  category:    BuffItemCategory;
  rarity:      BuffItemRarity;
  /**
   * Maksimum charge miktarı.
   * Common: 80–120, Rare: 50–80, Epic: 30–50, Legendary: 20–30
   */
  chargeMax:     number;
  /** Bir hunt'ta tüketilen charge */
  huntCost:      number;
  /** Bir PvP dövüşünde tüketilen charge */
  pvpCost:       number;
  /** Bir upgrade denemesinde tüketilen charge */
  upgradeCost:   number;
  /** Etki değeri — ne anlama geldiği effectType'a göre değişir */
  effectValue: number;
  /**
   * Etki tipi:
   *   catch_bonus      → catchChance'e eklenen flat bonus (0.08 = +8%)
   *   loot_mult        → item drop şansı çarpanı (1.3 = +30%)
   *   rare_drop_bonus  → nadir av drop şansı flat bonus (0.10 = +10%)
   *   upgrade_bonus    → upgradeChance'e eklenen flat puan (+8)
   *   downgrade_shield → başarısız upgrade'de downgrade şansını azaltır (0.5 = %50 azalır)
   *   pvp_damage_mult  → PvP hasar çarpanı (1.12 = +12%)
   *   pvp_dodge_bonus  → dodge şansı flat bonus (0.08 = +8%)
   */
  effectType:  'catch_bonus' | 'loot_mult' | 'rare_drop_bonus' | 'upgrade_bonus' | 'downgrade_shield' | 'pvp_damage_mult' | 'pvp_dodge_bonus';
  /** Tradeoff açıklaması (oyuncuya gösterilir) */
  tradeoff:    string;
}

export const BUFF_ITEMS: BuffItemDef[] = [
  // ── HUNT BUFF'LARI ────────────────────────────────────────────────────────
  {
    id:           'b001',
    name:         'Keskin Nişan',
    emoji:        '🎯',
    description:  'Aktif olduğu sürece yakalama şansı artar.',
    category:     'hunt',
    rarity:       'Common',
    chargeMax:    100,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  0.18,  // +18% catch (eskiden +8%)
    effectType:   'catch_bonus',
    tradeoff:     'Charge bitince pasifleşir, item kaybolmaz.',
  },
  {
    id:           'b002',
    name:         'Av Kokusu',
    emoji:        '🌿',
    description:  'Aktif olduğu sürece item drop şansı artar.',
    category:     'hunt',
    rarity:       'Common',
    chargeMax:    80,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  1.60,  // +60% drop (eskiden +35%)
    effectType:   'loot_mult',
    tradeoff:     'Charge bitince pasifleşir.',
  },
  {
    id:           'b003',
    name:         'Nadir İz',
    emoji:        '🔮',
    description:  'Aktif olduğu sürece nadir av drop şansı artar.',
    category:     'hunt',
    rarity:       'Rare',
    chargeMax:    60,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  0.25,  // +25% nadir drop (eskiden +12%)
    effectType:   'rare_drop_bonus',
    tradeoff:     'Güçlü ama Rare, charge daha az.',
  },
  {
    id:           'b004',
    name:         'Orman Ruhu',
    emoji:        '🌲',
    description:  'Aktif olduğu sürece yakalama ve drop şansı hafifçe artar.',
    category:     'hunt',
    rarity:       'Rare',
    chargeMax:    120,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  0.12,  // +12% catch + %30 loot (eskiden +5%/+20%)
    effectType:   'catch_bonus',
    tradeoff:     'Çift etki, uzun ömür.',
  },
  {
    id:           'b005',
    name:         'Yıldız Tüy',
    emoji:        '⭐',
    description:  'Aktif olduğu sürece tüm drop şansları büyük ölçüde artar.',
    category:     'hunt',
    rarity:       'Epic',
    chargeMax:    40,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  2.20,  // +120% drop (eskiden +60%)
    effectType:   'loot_mult',
    tradeoff:     'Çok güçlü ama Epic, charge az.',
  },
  {
    id:           'b006',
    name:         'Efsane Av Ruhu',
    emoji:        '🦅',
    description:  'Aktif olduğu sürece yakalama ve nadir drop şansı maksimum artar.',
    category:     'hunt',
    rarity:       'Legendary',
    chargeMax:    25,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  0.35,  // +35% catch (eskiden +18%)
    effectType:   'catch_bonus',
    tradeoff:     'En güçlü hunt buff, ama çok az charge.',
  },

  // ── UPGRADE BUFF'LARI ─────────────────────────────────────────────────────
  {
    id:           'b007',
    name:         'Berrak Zihin',
    emoji:        '💡',
    description:  'Aktif olduğu sürece upgrade başarı şansı artar.',
    category:     'upgrade',
    rarity:       'Common',
    chargeMax:    100,
    huntCost:     0,
    pvpCost:      0,
    upgradeCost:  1,
    effectValue:  15,    // +15 puan (eskiden +8)
    effectType:   'upgrade_bonus',
    tradeoff:     'Charge bitince pasifleşir.',
  },
  {
    id:           'b008',
    name:         'Koruyucu Talisman',
    emoji:        '🛡️',
    description:  'Aktif olduğu sürece başarısız upgrade\'de stat düşme şansı azalır.',
    category:     'upgrade',
    rarity:       'Rare',
    chargeMax:    50,
    huntCost:     0,
    pvpCost:      0,
    upgradeCost:  1,
    effectValue:  0.2,   // downgrade şansı %80 azalır (eskiden %50)
    effectType:   'downgrade_shield',
    tradeoff:     'Neredeyse tam koruma.',
  },
  {
    id:           'b009',
    name:         'Usta Eli',
    emoji:        '🔨',
    description:  'Aktif olduğu sürece upgrade başarı şansı önemli ölçüde artar.',
    category:     'upgrade',
    rarity:       'Epic',
    chargeMax:    30,
    huntCost:     0,
    pvpCost:      0,
    upgradeCost:  1,
    effectValue:  28,    // +28 puan (eskiden +15)
    effectType:   'upgrade_bonus',
    tradeoff:     'Güçlü ama Epic, charge az.',
  },

  // ── PVP BUFF'LARI ─────────────────────────────────────────────────────────
  {
    id:           'b010',
    name:         'Savaş Ruhu',
    emoji:        '⚔️',
    description:  'Aktif olduğu sürece PvP hasarı artar.',
    category:     'pvp',
    rarity:       'Common',
    chargeMax:    80,
    huntCost:     0,
    pvpCost:      1,
    upgradeCost:  0,
    effectValue:  1.18,  // +18% hasar (eskiden +8%)
    effectType:   'pvp_damage_mult',
    tradeoff:     'Belirgin etki, uzun ömür.',
  },
  {
    id:           'b011',
    name:         'Savunma Duruşu',
    emoji:        '🛡️',
    description:  'Aktif olduğu sürece PvP dodge şansı artar.',
    category:     'pvp',
    rarity:       'Rare',
    chargeMax:    50,
    huntCost:     0,
    pvpCost:      1,
    upgradeCost:  0,
    effectValue:  0.18,  // +18% dodge (eskiden +8%)
    effectType:   'pvp_dodge_bonus',
    tradeoff:     'Sadece dodge, hasar artmaz.',
  },
  {
    id:           'b012',
    name:         'Arena Ustası',
    emoji:        '🏆',
    description:  'Aktif olduğu sürece hem PvP hasarı hem dodge artar.',
    category:     'pvp',
    rarity:       'Epic',
    chargeMax:    25,
    huntCost:     0,
    pvpCost:      1,
    upgradeCost:  0,
    effectValue:  1.25,  // +25% hasar & +15% dodge (eskiden +12%/+6%)
    effectType:   'pvp_damage_mult',
    tradeoff:     'En güçlü PvP buff, ama az charge.',
  },
];

// Buff item ID → tanım hızlı erişim haritası
export const BUFF_ITEM_MAP: Record<string, BuffItemDef> = Object.fromEntries(
  BUFF_ITEMS.map((b) => [b.id, b]),
);

// ── DİMİNİSHİNG RETURNS ──────────────────────────────────────────────────────
// Aynı kategoriden birden fazla aktif buff varsa etki azalır.
// Örnek: 1. buff → %100, 2. buff → %60, 3. buff → %30
export const BUFF_DIMINISHING_RATES = [1.0, 0.6, 0.3] as const;

// ── LOOTBOX TANIMLARI ────────────────────────────────────────────────────────

export type LootboxTier = 'Ortak' | 'Nadir' | 'Efsane';

export interface LootboxDef {
  id:          string;
  name:        string;
  emoji:       string;
  tier:        LootboxTier;
  /** Kaç item içerir */
  itemCount:   [number, number];  // [min, max]
  /** Ağırlıklı rarity dağılımı */
  weights:     { rarity: BuffItemRarity; weight: number }[];
  /** Pity: X kutu açmadan Rare+ gelmezse garanti */
  pityThreshold: number;
}

export const LOOTBOX_DEFS: LootboxDef[] = [
  {
    id:            'l001',
    name:          'Ortak Kutu',
    emoji:         '📦',
    tier:          'Ortak',
    itemCount:     [1, 2],
    weights:       [
      { rarity: 'Common',    weight: 70 },
      { rarity: 'Rare',      weight: 25 },
      { rarity: 'Epic',      weight: 5  },
      { rarity: 'Legendary', weight: 0  },
    ],
    pityThreshold: 8,   // 8 kutu açmadan Rare+ gelmezse garanti
  },
  {
    id:            'l002',
    name:          'Nadir Kutu',
    emoji:         '🎁',
    tier:          'Nadir',
    itemCount:     [2, 3],
    weights:       [
      { rarity: 'Common',    weight: 40 },
      { rarity: 'Rare',      weight: 45 },
      { rarity: 'Epic',      weight: 14 },
      { rarity: 'Legendary', weight: 1  },
    ],
    pityThreshold: 5,   // 5 kutu açmadan Epic+ gelmezse garanti
  },
  {
    id:            'l003',
    name:          'Efsane Kutu',
    emoji:         '💎',
    tier:          'Efsane',
    itemCount:     [2, 3],
    weights:       [
      { rarity: 'Common',    weight: 20 },
      { rarity: 'Rare',      weight: 45 },
      { rarity: 'Epic',      weight: 30 },
      { rarity: 'Legendary', weight: 5  },
    ],
    pityThreshold: 3,   // 3 kutu açmadan Epic+ gelmezse garanti
  },
];

// Lootbox ID → tanım hızlı erişim haritası
export const LOOTBOX_DEF_MAP: Record<string, LootboxDef> = Object.fromEntries(
  LOOTBOX_DEFS.map((l) => [l.id, l]),
);

// ── LOOTBOX DROP ŞANSLARI ────────────────────────────────────────────────────
// Hunt'tan düşen lootbox şansları (her başarılı av rolünde)
export const LOOTBOX_HUNT_DROP_CHANCE: Record<LootboxTier, number> = {
  Ortak:   4,    // %4 — her avda küçük şans
  Nadir:   0.8,  // %0.8 — nadir
  Efsane:  0.1,  // %0.1 — çok nadir
};

// Kritik avda çarpan
export const LOOTBOX_CRIT_MULT = 2.0;

// PvP kazanmada lootbox şansı
export const LOOTBOX_PVP_WIN_CHANCE: Record<LootboxTier, number> = {
  Ortak:   8,    // %8
  Nadir:   2,    // %2
  Efsane:  0.3,  // %0.3
};

// Encounter kazanmada (tame başarısı) lootbox şansı
export const LOOTBOX_ENCOUNTER_WIN_CHANCE: Record<LootboxTier, number> = {
  Ortak:   15,   // %15 — encounter daha ödüllendirici
  Nadir:   4,    // %4
  Efsane:  0.5,  // %0.5
};

// ── PVP BUFF CAP'LERİ ────────────────────────────────────────────────────────
// Buff'lar PvP win chance'i bu sınırları aşamaz
export const PVP_BUFF_DAMAGE_MULT_MAX = 1.20;   // max +20% hasar
export const PVP_BUFF_DODGE_BONUS_MAX = 0.12;   // max +12% dodge

// ============================================================
// TRANSFER (PARA GÖNDERME) SİSTEMİ
// ============================================================

/** Gönderici için minimum oyuncu seviyesi */
export const TRANSFER_MIN_LEVEL = 5;

/** Tek transferde minimum coin */
export const TRANSFER_MIN_AMOUNT = 10;

/** Günlük maksimum gönderim (gönderici başına) */
export const TRANSFER_DAILY_LIMIT = 10_000;

/** Transfer cooldown (ms) */
export const TRANSFER_COOLDOWN_MS = 60 * 1000;  // 60 saniye

/**
 * Kademeli vergi dilimleri.
 * Her dilim: { upTo: üst sınır (dahil), rate: vergi oranı (0.05 = %5) }
 * upTo: Infinity → son dilim (üst sınır yok)
 */
export const TRANSFER_TAX_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 500,       rate: 0.03 },  // 0–500      → %3
  { upTo: 2_000,     rate: 0.05 },  // 501–2000   → %5
  { upTo: 10_000,    rate: 0.08 },  // 2001–10000 → %8
  { upTo: Infinity,  rate: 0.12 },  // 10000+     → %12
];

// ============================================================
// PVP KUMAR SİSTEMİ (Sosyal PvP Gambling)
// ============================================================

// ── GENEL KURALLAR ───────────────────────────────────────────────────────────

/** Minimum bahis miktarı (coin) */
export const PVP_GAMBLE_MIN_BET = 1_000;

/** Oyunlar arası cooldown (ms) — her iki oyuncuya da uygulanır */
export const PVP_GAMBLE_COOLDOWN_MS = 15_000;

/** Davet süresi (ms) — Defender bu süre içinde kabul/reddetmeli */
export const PVP_GAMBLE_INVITE_TTL_MS = 30_000;

/** Temel kasa payı (house cut) oranı — 0.05 = %5 */
export const PVP_GAMBLE_HOUSE_CUT_BASE = 0.05;

/** Aynı iki oyuncu arasında kaç ardışık oyundan sonra progressive cut devreye girer */
export const PVP_GAMBLE_PROGRESSIVE_THRESHOLD = 10;

/** Progressive cut artış miktarı (her ek oyun başına) — 0.01 = %1 */
export const PVP_GAMBLE_PROGRESSIVE_STEP = 0.01;

/** Progressive cut maksimum oranı (temel dahil) — 0.20 = %20 */
export const PVP_GAMBLE_PROGRESSIVE_MAX = 0.20;

// ── KAYIP İADESİ (BAYKUŞ TESELLİSİ) ─────────────────────────────────────────

/** Kaç ardışık PvP kaybından sonra rebate tetiklenir */
export const PVP_GAMBLE_REBATE_LOSS_STREAK = 5;

/** Rebate oranı — kaybedilen toplam miktarın yüzdesi */
export const PVP_GAMBLE_REBATE_RATE = 0.02;

// ── COİN FLİP DÜELLOSU ───────────────────────────────────────────────────────

/** Coin Flip kazanma olasılığı (%) */
export const PVP_CF_WIN_CHANCE = 50;

/** Coin Flip payout çarpanı (bahis × bu değer = brüt kazanç) */
export const PVP_CF_PAYOUT = 2.0;

/** Kaç ardışık galibiyette "SERİ KATİL" duyurusu yapılır */
export const PVP_CF_SERIAL_KILLER_STREAK = 3;

// ── SLOT YARIŞMASI ────────────────────────────────────────────────────────────

/** Slot Race'de her iki oyuncu aynı sembolü yakalarsa verilen XP bonusu */
export const PVP_SLOT_COMBO_XP_BONUS = 25;

/** Slot Race animasyon gecikmesi (ms) — embed güncelleme aralığı */
export const PVP_SLOT_ANIMATION_DELAY_MS = 1_200;

/** Slot Race spin adımı sayısı (animasyon için) */
export const PVP_SLOT_SPIN_STEPS = 3;

// ── BLACKJACK PRO ─────────────────────────────────────────────────────────────

/** Blackjack'te "Yüksek Riskli Masa" uyarısı için minimum bahis */
export const PVP_BJ_HIGH_STAKES_THRESHOLD = 50_000;

/** Blackjack hamle bekleme süresi (ms) — Hit/Stand için */
export const PVP_BJ_TURN_TTL_MS = 60_000;

/** Blackjack Blackjack (21 ilk 2 kart) payout çarpanı */
export const PVP_BJ_BLACKJACK_PAYOUT = 2.5;

/** Blackjack normal kazanma payout çarpanı */
export const PVP_BJ_WIN_PAYOUT = 2.0;

/** Blackjack beraberlik — bahis iade edilir (çarpan 1.0) */
export const PVP_BJ_PUSH_PAYOUT = 1.0;

/** Blackjack Spectator Mode — kaç kişi izleyebilir (0 = sınırsız) */
export const PVP_BJ_MAX_SPECTATORS = 0;

// ── REDİS ANAHTAR ŞEMALARİ ───────────────────────────────────────────────────
// Not: Bunlar string template değil, prefix sabitleridir.
// Kullanım: `${PVP_GAMBLE_REDIS_SESSION_PREFIX}${sessionId}`

/** PvP gambling oturum verisi prefix'i */
export const PVP_GAMBLE_REDIS_SESSION_PREFIX = 'pvp:gamble:session:';

/** Aynı iki oyuncu arasındaki ardışık oyun sayacı prefix'i */
export const PVP_GAMBLE_REDIS_PAIR_COUNT_PREFIX = 'pvp:gamble:pair:';

/** Coin Flip galibiyet serisi prefix'i */
export const PVP_GAMBLE_REDIS_CF_STREAK_PREFIX = 'pvp:gamble:cf_streak:';

/** PvP gambling kayıp serisi prefix'i */
export const PVP_GAMBLE_REDIS_LOSS_STREAK_PREFIX = 'pvp:gamble:loss_streak:';

/** Kayıp iadesi için toplam kayıp takip prefix'i */
export const PVP_GAMBLE_REDIS_LOSS_TOTAL_PREFIX = 'pvp:gamble:loss_total:';

/** Oturum TTL (ms) — Redis'te ne kadar tutulur */
export const PVP_GAMBLE_SESSION_TTL_MS = 10 * 60 * 1_000; // 10 dakika

/** Pair count TTL (ms) — Progressive cut sayacı ne kadar tutulur */
export const PVP_GAMBLE_PAIR_COUNT_TTL_MS = 24 * 60 * 60 * 1_000; // 24 saat

