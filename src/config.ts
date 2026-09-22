// ============================================================
// config.ts — BaykusBot Sabit ve Formul Merkezi
// Hicbir sayi baska dosyaya gomulemez. Hepsi buradan import edilir.
// ============================================================
import './load-env';

// --- BAYKUS TURLERI ---
// Tier bazlı base HP ve stamina değerleri
export const OWL_BASE_HP: Record<number, number> = {
  1: 150, 2: 140, 3: 130, 4: 120, 5: 110, 6: 100, 7: 90, 8: 80,
};
export const OWL_BASE_STAMINA: Record<number, number> = {
  1: 120, 2: 115, 3: 110, 4: 105, 5: 100, 6: 95, 7: 90, 8: 85,
};

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

// --- EVCILLESTIRME TEMEL SANS ---
export const TAME_BASE_CHANCE: Record<number, number> = {
  8: 63,
  7: 48,
  6: 34,
  5: 26,
  4: 16,
  3: 8,
  2: 4,
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
/** Bilinmeyen av hayvanı satış fallback'i — PREY tablosu ile uyumlu minimum. */
export const PREY_MIN_SELL_PRICE = 10;

export const PREY = [
  { name: 'fare',       difficulty: 1, baseChance: 90, xp: 5,  sellPrice: 10   },
  { name: 'serce',      difficulty: 2, baseChance: 85, xp: 6,  sellPrice: 16   },
  { name: 'kurbaga',    difficulty: 2, baseChance: 80, xp: 6,  sellPrice: 16   },
  { name: 'yusufcuk',   difficulty: 2, baseChance: 82, xp: 6,  sellPrice: 18   },
  { name: 'kedi',       difficulty: 3, baseChance: 74, xp: 7,  sellPrice: 22   },
  { name: 'kaz',        difficulty: 3, baseChance: 72, xp: 7,  sellPrice: 20   },
  { name: 'kertenkele', difficulty: 3, baseChance: 75, xp: 7,  sellPrice: 24   },
  { name: 'hamster',    difficulty: 3, baseChance: 75, xp: 7,  sellPrice: 24   },
  { name: 'keci',       difficulty: 4, baseChance: 68, xp: 8,  sellPrice: 34   },
  { name: 'kunduz',     difficulty: 4, baseChance: 66, xp: 8,  sellPrice: 38   },
  { name: 'kostebek',   difficulty: 4, baseChance: 70, xp: 8,  sellPrice: 36   },
  { name: 'yarasa',     difficulty: 4, baseChance: 65, xp: 9,  sellPrice: 40   },
  { name: 'yengec',     difficulty: 4, baseChance: 62, xp: 9,  sellPrice: 42   },
  { name: 'bildircin',  difficulty: 5, baseChance: 60, xp: 10, sellPrice: 56   },
  { name: 'guvercin',   difficulty: 5, baseChance: 60, xp: 10, sellPrice: 56   },
  { name: 'koyun',      difficulty: 5, baseChance: 58, xp: 10, sellPrice: 52   },
  { name: 'horoz',      difficulty: 5, baseChance: 55, xp: 11, sellPrice: 60   },
  { name: 'penguen',    difficulty: 5, baseChance: 52, xp: 11, sellPrice: 64   },
  { name: 'yilan',      difficulty: 6, baseChance: 50, xp: 12, sellPrice: 80   },
  { name: 'sincap',     difficulty: 6, baseChance: 50, xp: 12, sellPrice: 70   },
  { name: 'tilki',      difficulty: 6, baseChance: 48, xp: 12, sellPrice: 78   },
  { name: 'kaplumbaga', difficulty: 6, baseChance: 44, xp: 13, sellPrice: 88   },
  { name: 'tavsan',     difficulty: 7, baseChance: 40, xp: 15, sellPrice: 110  },
  { name: 'sansar',     difficulty: 7, baseChance: 38, xp: 15, sellPrice: 105  },
  { name: 'bukelemun',  difficulty: 7, baseChance: 35, xp: 16, sellPrice: 125  },
  { name: 'gelincik',   difficulty: 8, baseChance: 30, xp: 18, sellPrice: 150  },
  { name: 'kurt',       difficulty: 8, baseChance: 28, xp: 18, sellPrice: 145  },
  { name: 'panda',      difficulty: 8, baseChance: 26, xp: 19, sellPrice: 170  },
  { name: 'kirpi',      difficulty: 9, baseChance: 25, xp: 20, sellPrice: 200  },
  { name: 'ayi',        difficulty: 9, baseChance: 22, xp: 22, sellPrice: 230  },
] as const;

// Tier'a gore avlanabilecek hayvanlar (difficulty <= esik)
export const OWL_PREY_POOL: Record<number, number> = {
  8: 5,
  7: 6,
  6: 7,
  5: 8,
  4: 9,
  3: 9,
  2: 9,
  1: 9,
};

// --- SWITCH SISTEMI ---
export const SWITCH_BASE_COST = 250;
export const SWITCH_TIER_MULTIPLIER = 50;
export const SWITCH_COOLDOWN_MS = 20 * 60 * 1000;
export const SWITCH_HP_THRESHOLD = 0.3;
export const SWITCH_PENALTY_DURATION = 10 * 60 * 1000;
export const SWITCH_PENALTY_DAMAGE = -0.1;
export const SWITCH_PENALTY_DODGE = -0.1;

// --- BOND ---
export const BOND_BONUS_RATE = 0.2;
// Bond artış sabitleri — her aktivitede main baykuşun bond'u artar
export const BOND_GAIN_PER_HUNT    = 0.5;  // Her başarılı avda +0.5 bond
export const BOND_GAIN_PER_PVP_WIN = 2;    // PvP kazanınca +2 bond
export const BOND_GAIN_PER_TAME    = 5;    // Tame başarısında +5 bond
export const BOND_MAX              = 100;  // Maksimum bond değeri

// --- PASSIVE MODE ---
// Main olmayan baykuşların pasif mod etkileri
export const PASSIVE_TRAINING_XP_PER_HOUR = 5;    // training: saatte +5 XP (çok yavaş, sadece sembolik)
export const PASSIVE_SCOUTING_ENCOUNTER_BONUS = 0.005; // scouting: encounter şansına +%0.5 eklenir

// --- XP ---
// FIX: XP_LEVEL_FORMULA base artırıldı — level 1→2 artık 500 XP gerektirir
// Eski: round(100 * L^1.65 + L*20) → L=1: 120 XP (30 saniyede geçiliyordu)
// Yeni: round(200 * L^1.65 + L*50) → L=1: 250 XP, L=5: 3.200 XP (daha anlamlı ilerleme)
export const XP_LEVEL_FORMULA = (L: number): number =>
  Math.round(200 * Math.pow(L, 1.65) + L * 50);
export const XP_PVP_WIN = 50;
export const XP_PVP_LOSE = 15;
export const XP_TAME = 100;
export const XP_RARE_BONUS = 50;
export const XP_SCALE_RATE = 0.01;
export const XP_SCALE_MAX_MULT = 1.30;
export const XP_COMBO_3 = 10;
export const XP_COMBO_5 = 25;
export const XP_RISK_BONUS_RATE = 0.5;
export const CHAT_XP_MIN = 15;
export const CHAT_XP_MAX = 30;
export const CHAT_XP_COOLDOWN_MS = 45 * 1000;
export const CHAT_XP_MIN_MESSAGE_LENGTH = 8;

// --- KOMUT KILITLERI ---
/** Ayni komutun eszamanli tekrari — is bitince releaseInFlightAction ile acilir. */
export const COMMAND_INFLIGHT_TTL_MS = 8 * 1000;

// --- HUNT ---
export const HUNT_ROLL_BASE = 4;
export const HUNT_ROLL_PER_LEVEL = 5;
export const HUNT_ROLL_KANAT_PER = 20;      // Her 20 kanat = +1 ek hunt roll
export const HUNT_ROLL_KANAT_MAX_BONUS = 3; // Kanattan maksimum +3 roll
export const HUNT_COOLDOWN_MS = 7 * 1000; // 7 saniye — daha hizli av dongusu
/** Hunt cooldown Redis TTL ust siniri — bundan uzun key otomatik silinir. */
export const HUNT_COOLDOWN_MAX_REMAINING_MS = HUNT_COOLDOWN_MS + 5_000;
/** Cooldown uyarı mesajı kanalda bu süre sonra silinir. */
export const COOLDOWN_NOTICE_AUTO_DELETE_MS = 8_000;
export const HUNT_CRITICAL_RATE = 10;
export const HUNT_INJURY_RATE = 4; // Göl Kenarı civarı — hafif düşük yaralanma
export const DEFAULT_HUNT_BIOME_ID = 'b0';
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

// Streak sistemi: ardışık başarılı hunt bonusu
export const HUNT_STREAK_BONUS_RATE = 0.05; // her streak için +5% catch chance
export const HUNT_STREAK_MAX_BONUS  = 0.20; // max +20%

/** Cumartesi-Pazar av XP / coin çarpanı. */
export const HUNT_WEEKEND_XP_MULT = 1.2;
export const HUNT_WEEKEND_COIN_MULT = 1.2;

export function isWeekendHuntBonus(now = new Date()): boolean {
  const day = now.getDay();
  return day === 0 || day === 6;
}

// ============================================================
// LEVEL UP ÖDÜL SİSTEMİ
// ============================================================
// Her seviye atlandığında oyuncuya coin + özel item verilir.
// Milestone seviyelerde (5, 10, 15...) ekstra ödüller aktif olur.
// ============================================================

export interface LevelUpReward {
  coins: number;
  /** Envantere eklenecek lootbox (opsiyonel) */
  lootbox?: { id: string; name: string; emoji: string; quantity: number };
  /** İkinci lootbox — Lv.4 gibi iki farklı kutu verildiğinde (opsiyonel) */
  lootbox2?: { id: string; name: string; emoji: string; quantity: number };
  /** Envantere eklenecek buff item (opsiyonel) */
  item?: { itemName: string; itemType: string; rarity: string; quantity: number };
  /** Özel mesaj (opsiyonel) */
  message?: string;
}

/**
 * Seviyeye göre ödül hesaplar.
 * Milestone seviyelerde (5'in katları) ekstra ödül verilir.
 *
 * Coin kalibrasyonu:
 *   Aktif oyuncu günde ~3000-8000 coin kazanır (hunt + sell).
 *   Normal seviye ödülü ~1 günlük kazanç, milestone ~3-5 günlük.
 *   Lv.10 büyük milestone ~1 haftalık kazanç hissi verir.
 *
 * Erken seviye (1-4): Lootbox ağırlıklı — yeni oyuncuyu sisteme çek.
 */
export function getLevelUpReward(newLevel: number): LevelUpReward {
  // Temel coin: her seviye için belirgin şekilde artan miktar
  const baseCoins = 1500 + newLevel * 350;

  // ── Erken seviye özel ödülleri (1-4) ──────────────────────────────────────
  if (newLevel === 1) {
    return {
      coins: 1500,
      lootbox: { id: 'ec', name: 'Eşya Kutusu', emoji: '🧰', quantity: 3 },
      item: { itemName: 'Keskin Nişan', itemType: 'Buff', rarity: 'Common', quantity: 1 },
      message: '🎉 Hoş geldin! **3 Eşya Kutusu** + **Keskin Nişan** kazandın — aç ve güçlen!',
    };
  }
  if (newLevel === 2) {
    return {
      coins: 2000,
      lootbox: { id: 'ec', name: 'Eşya Kutusu', emoji: '🧰', quantity: 2 },
      item: { itemName: 'Keskin Nişan', itemType: 'Buff', rarity: 'Common', quantity: 1 },
      message: '🎯 **2 Eşya Kutusu** + **Keskin Nişan** kazandın!',
    };
  }
  if (newLevel === 3) {
    return {
      coins: 2500,
      lootbox: { id: 'ec', name: 'Eşya Kutusu', emoji: '🧰', quantity: 2 },
      item: { itemName: 'Av Kokusu', itemType: 'Buff', rarity: 'Common', quantity: 1 },
      message: '🌿 **2 Eşya Kutusu** + **Av Kokusu** kazandın!',
    };
  }
  if (newLevel === 4) {
    return {
      coins: 3000,
      lootbox: { id: 'ec', name: 'Eşya Kutusu', emoji: '🧰', quantity: 3 },
      message: '💪 **3 Eşya Kutusu** kazandın!',
    };
  }

  // ── Büyük milestone (10'un katları: 10, 20, 30...) ────────────────────────
  if (newLevel % 10 === 0) {
    return {
      coins: baseCoins * 5,
      lootbox: { id: 'ec', name: 'Eşya Kutusu', emoji: '🧰', quantity: 2 },
      item: {
        itemName: newLevel >= 30 ? 'Efsane Av Ruhu' : newLevel >= 20 ? 'Yıldız Tüy' : 'Nadir İz',
        itemType: 'Buff',
        rarity:   newLevel >= 30 ? 'Legendary' : newLevel >= 20 ? 'Epic' : 'Rare',
        quantity: 1,
      },
      message: newLevel >= 30
        ? '🦅 Efsanevi seviye! **Efsane Av Ruhu** + **2 Eşya Kutusu** kazandın!'
        : newLevel >= 20
        ? '⭐ Büyük milestone! **Yıldız Tüy** + **2 Eşya Kutusu** kazandın!'
        : '🔮 Büyük milestone! **Nadir İz** + **2 Eşya Kutusu** kazandın!',
    };
  }

  // ── Küçük milestone (5'in katları: 5, 15, 25, 35...) ─────────────────────
  if (newLevel % 5 === 0) {
    return {
      coins: baseCoins * 3,
      lootbox: { id: 'ec', name: 'Eşya Kutusu', emoji: '🧰', quantity: 1 },
      item: {
        itemName: newLevel >= 15 ? 'Orman Ruhu' : 'Keskin Nişan',
        itemType: 'Buff',
        rarity:   newLevel >= 15 ? 'Rare' : 'Common',
        quantity: 1,
      },
      message: newLevel >= 15
        ? '🌲 Milestone! **Orman Ruhu** + **1 Eşya Kutusu** kazandın!'
        : '🎯 Milestone! **Keskin Nişan** + **1 Eşya Kutusu** kazandın!',
    };
  }

  // ── Normal seviye — sadece coin ───────────────────────────────────────────
  return { coins: baseCoins };
}

// Catch chance stat katkı sabitleri — 0-1 araliginda etki
// Pence=50 → +0.125, Göz=50 → +0.075, Kanat=50 → +0.10
// (Onceden /100 ile bolunuyordu, bu onlari neredeyse sifira indiriyordu)
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

// --- UPGRADE (Garanti V2 — hafif+ maliyet) ---
export const UPGRADE_COIN_BASE = 90;
export const UPGRADE_COIN_EXP = 1.35;
export const UPGRADE_COIN_MULT = 14;
export const UPGRADE_MAT_CAP = 9;
export const UPGRADE_COIN_DISCOUNT_CAP = 0.25;
/** Aktif upgrade_bonus buff başına coin indirimi (cap UPGRADE_COIN_DISCOUNT_CAP). */
export const UPGRADE_BUFF_COIN_DISCOUNT = 0.10;
export const UPGRADE_COOLDOWN_MS = 15 * 1000;
/** Prefix `up <stat> all` / sayı ile tek seferde max eğitim adımı. */
export const UPGRADE_BULK_MAX = 50;

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

/** Materyal useId (021+) — envanter / market referansı */
export const MATERIAL_USE_IDS: Record<string, string> = Object.fromEntries(
  HUNT_ITEM_DROPS.map((d, i) => [d.itemName, String(21 + i).padStart(3, '0')]),
);

/** useId → materyal adı */
export const MATERIAL_USE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MATERIAL_USE_IDS).map(([name, id]) => [id, name]),
);

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
  1: { low: [18, 26], mid: [27, 34], high: [35, 42] }, // Blakiston — en guclu
  2: { low: [16, 24], mid: [25, 32], high: [33, 40] }, // Puhu
  3: { low: [14, 22], mid: [23, 30], high: [31, 38] }, // Kar
  4: { low: [12, 20], mid: [21, 28], high: [29, 36] }, // Boynuzlu
  5: { low: [10, 16], mid: [17, 24], high: [25, 32] }, // Buyuk boz
  6: { low: [8, 14], mid: [15, 22], high: [23, 30] },  // Ural
  7: { low: [6, 12], mid: [13, 20], high: [21, 28] },  // Peceli
  8: { low: [4, 8], mid: [9, 14], high: [15, 20] },    // Kukumav — en zayif
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
export const ENCOUNTER_BASE = 0.32;
export const ENCOUNTER_LEVEL_RATE = 0.028;
export const ENCOUNTER_GOZ_RATE = 0.015;
export const ENCOUNTER_KULAK_RATE = 0.01;
export const ENCOUNTER_MIN = 0.25;
export const ENCOUNTER_MAX = 8;

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
export const TAME_USED_LINES_MAX = 50; // Maximum entries in usedLines[] anti-repetition array
export const TAME_GOZ_RATE = 0.25;
export const TAME_KULAK_RATE = 0.2;
export const TAME_MIN = 2;
export const TAME_MAX = 92;
export const TAME_MAX_ATTEMPTS = 3;
export const TAME_FAIL_STREAK_BONUS = 8;  // +8 her basarisiz denemede (onceden +5, tekrar cezasini gecemiyordu)
export const TAME_REPEAT_PENALTY = 0;    // Tekrar cezasi kaldirildi — fail streak bonusu artik anlamli
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
export const PVP_EXECUTE_POWER_MULT = 8;
/** Normal vuruş ölçeği — 100 HP’de dövüş ~4–8 tur sürsün. */
export const PVP_DAMAGE_SCALE = 0.3;
/** Execute ayrı ölçek + HP tavanı (tek vuruşta bitmesin). */
export const PVP_EXECUTE_DAMAGE_SCALE = 0.45;
export const PVP_EXECUTE_MAX_HP_FRAC = 0.35;
export const PVP_STAM_FULL_MIN = 60;
export const PVP_STAM_DODGE_MIN = 30;
export const PVP_STAM_DAMAGE_MIN = 10;
export const PVP_STAM_DODGE_PEN = -0.1;
export const PVP_STAM_DAMAGE_PEN = -0.15;
export const PVP_STAM_FATIGUE_PEN = -0.25;
/** @deprecated Verim decay kaldırıldı — geriye dönük uyumluluk */
export const PVP_REPAIR_AFTER = 3;
export const PVP_REPAIR_LOSS = 2;
export const PVP_MAX_TURNS = 30;
export const PVP_BASE_HP = 100;

// --- KUMAR ---
// FIX: Blackjack payout düzeltildi — natural BJ artık normal win'den fazla öder
// Eski: BJ=1.5, WIN=1.9 (ters! BJ daha az ödüyordu)
// Yeni: BJ=2.5, WIN=1.9 (doğru: BJ en iyi el, en yüksek ödül)
export const GAMBLE_BJ_BLACKJACK_PAYOUT = 2.2;  // Natural 21: +%120 kazanç
export const GAMBLE_BJ_WIN_PAYOUT = 1.9;         // Normal win: +%90 kazanç
export const GAMBLE_WIN_CLAMP_MIN = 1;
export const GAMBLE_WIN_CLAMP_MAX = 99;
export const GAMBLE_STREAK_LOSS_3 = 3;
export const GAMBLE_STREAK_LOSS_5 = 5;
export const GAMBLE_STREAK_WIN_3 = -2;
export const GAMBLE_STREAK_WIN_5 = -5;
export const GAMBLE_RICH_PENALTY_MAX = 15;
export const GAMBLE_BET_PENALTY_MULT = 5;

// FIX: GAMBLE_BJ_COOLDOWN_MS yorum düzeltildi (5 saniye, 30 değil)
export const GAMBLE_SLOT_COOLDOWN_MS     = 10 * 1000;   // 10 saniye
export const GAMBLE_BJ_COOLDOWN_MS       = 10 * 1000;   // 10 saniye (interaktif oyun)
export const GAMBLE_COINFLIP_WIN_CHANCE  = 49;
export const GAMBLE_COINFLIP_PAYOUT      = 1.95;
export const GAMBLE_COINFLIP_COOLDOWN_MS = 10 * 1000;
/** Solo coinflip — gif süresi; mesaj edit döngüsü yok */
export const GAMBLE_COINFLIP_SPIN_MS = 2_200;

/** Solo kumar minimum bahis */
export const GAMBLE_MIN_BET = 100;

/** Solo kumar maksimum bahis (tek tur) */
export const GAMBLE_MAX_BET = 50_000_000;

/** Idempotent settlement Redis prefix — gamble:settlement:{id} */
export const GAMBLE_SETTLEMENT_REDIS_PREFIX = 'gamble:settlement:';

/** Settlement anahtarı TTL (saniye) */
export const GAMBLE_SETTLEMENT_TTL_SEC = 86_400;

/** Aktif duel/duelbet guard — gamble:duel:{userId} */
export const GAMBLE_DUEL_GUARD_PREFIX = 'gamble:duel:';

/** DuelBet escrow meta — gamble:duelbet:{sessionId} */
export const GAMBLE_DUELBET_REDIS_PREFIX = 'gamble:duelbet:';

/** Solo BJ session — gamble:bj:solo:{userId} */
export const GAMBLE_BJ_SOLO_REDIS_PREFIX = 'gamble:bj:solo:';

/** Solo BJ session TTL (saniye) */
export const GAMBLE_BJ_SOLO_TTL_SEC = 15 * 60;

/** DuelBet davet süresi (ms) */
export const DUELBET_INVITE_TTL_MS = 30_000;

/** DuelBet minimum bahis */
export const DUELBET_MIN_BET = GAMBLE_MIN_BET;

/** DuelBet başarı sonrası cooldown (ms) */
export const DUELBET_COOLDOWN_MS = 10_000;

/** DuelBet pending davet — gamble:duelbet:invite:{inviteId} */
export const GAMBLE_DUELBET_INVITE_PREFIX = 'gamble:duelbet:invite:';

export const SLOT_TABLE = [
  { symbolKey: 'owl', label: 'Baykuş Jackpot', chance: 0.4, payout: 9 },
  { symbolKey: 'diamond', label: 'Elmas Üçlüsü', chance: 2.5, payout: 4 },
  { symbolKey: 'coin', label: 'Coin Üçlüsü', chance: 19, payout: 2.5 },
  { symbolKey: 'poop', label: 'Kayıp', chance: 78.1, payout: 0 },
] as const;

/** Makara durma aralığı — solo + PvP (önceki 900ms, daha hızlı) */
export const SLOT_REEL_STOP_MS = 550;

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
  'Parlak Tüy': 4,
  'Av Gözü Kristali': 5,
  'Sessizlik Teli': 3,
  'Yırtıcı Pençe Parçası': 6,
  'Orman Yankısı': 5,
  'Kırık Av Zinciri': 4,
  'Gölge Tüyü': 2,
};

export const TAME_ITEM_BONUS: Record<string, number> = {
  'Cig Et': 5,
  'Yirtici Yem': 8,
  'Kan Kokusu': 10,
  'Sessiz Yem': 6,
  'Alfa Feromon': 12,
  'Eski Tuy Parcasi': 0,
  'Yırtıcı İksiri': 15, // Hunt catch chance bonus (if used as item, but usually it's a buff)
};

// --- MAINTENANCE ---
export const MAINTENANCE_DAILY_ITEM = 'Cig Et';
export const MAINTENANCE_DAILY_AMT = 1;
export const MAINTENANCE_MISS_EFFECTIVENESS_LOSS = 5;
export const AUTO_SINK_COIN_PER_ITEM = 3;
export const AUTO_SINK_XP_PER_ITEM = 1;

// ============================================================
// DISMANTLE (PARÇALAMA) — upgrade materyalleri
// ============================================================

/** @deprecated Craft sistemi kaldırıldı; sadece DISMANTLE_TABLE kullanılır */
export const CRAFTING_REMOVED = true as const;

/** Kaldırılan eşyalar — envanterde kalabilir (satılabilir), `w use` ile takılamaz */
export const LEGACY_REMOVED_ITEM_NAMES = [
  // Eski yüklü / consumable item'lar
  'Karma Yem',
  'Bileme Taşı',
  'Yırtıcı İksiri',
  'Savaş İksiri',
  'Gölge Zırhı',
  'Av Trofesi Yağı',
  'Koruyucu Balmumu',
  'Güç Kapsülü',
  // Kaldırılan upgrade buff'ları
  'Berrak Zihin',
  'Koruyucu Talisman',
  'Usta Eli',
  // Kaldırılan PvP buff'ları
  'Savaş Ruhu',
  'Savunma Duruşu',
  'Arena Ustası',
] as const;

export const LEGACY_REMOVED_ITEM_SET = new Set<string>(LEGACY_REMOVED_ITEM_NAMES);

/**
 * Birleşik kullanım ID haritası (owl use 001):
 *   001–006 → Av buff item (lootbox, charge — max 3 aktif)
 */
export const USE_ID_RANGE = {
  buffMin: '001',
  buffMax: '006',
} as const;

/** Aynı anda takılı olabilecek maksimum aktif buff sayısı */
export const MAX_ACTIVE_BUFF_TYPES = 3;

// ============================================================
// BİYOM SİSTEMİ
// ============================================================

export interface BiomeDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  entryCost: number;
  minLevel: number;
  catchModifier: number; // catchChance *= modifier
  lootModifier: number;  // lootChance *= modifier
  rareModifier: number;  // nadir hayvan çıkma şansı *= modifier
}

/** Oyuncunun bir biyomda kalabileceği maksimum süre (ms) */
export const BIOME_SESSION_TTL_MS = 30 * 60 * 1000; // 30 dakika

export const BIOMES: BiomeDef[] = [
  {
    id: 'b0',
    name: 'Av Bölgesi',
    emoji: '🌿',
    description: 'Stabil av — Göl Kenarına yakın, abartısız ödül.',
    entryCost: 0,
    minLevel: 1,
    catchModifier: 1.10, // Göl Kenarı (1.15) hafif altı
    lootModifier: 1.0,
    rareModifier: 0.85,  // Göl Kenarı (0.80) biraz daha yumuşak
  },
  /** @legacy b1/b2 — oyuncu hunt'u her zaman DEFAULT_HUNT_BIOME_ID (b0) kullanır; seçim UI kaldırıldı */
  {
    id: 'b1',
    name: 'Derin Orman',
    emoji: '🌲',
    description: 'Yüksek risk, yüksek nadir drop şansı. Hazırlıklı gelmelisin.',
    entryCost: 2500, // Tek seferlik giriş — 30dk ~7.500 coin kazanç, %20 giriş ücreti
    minLevel: 10,
    catchModifier: 0.85, // %15 daha zor yakalama
    lootModifier: 1.3,   // %30 daha fazla materyal
    rareModifier: 2.0,   // Nadir hayvan şansı x2
  },
  {
    id: 'b2',
    name: 'Göl Kenarı',
    emoji: '🌊',
    description: 'Stabil kazanç arayanlar için. Yakalama şansı yüksektir.',
    entryCost: 1500                                                     , // Tek seferlik giriş — 30dk ~6.500 coin kazanç, %15 giriş ücreti
    minLevel: 5,
    catchModifier: 1.15, // %15 daha kolay yakalama
    lootModifier: 1.0,
    rareModifier: 0.8,   // Nadir hayvan şansı %20 daha düşük
  },
];

export const DISMANTLE_TABLE: Record<string, { itemName: string; min: number; max: number }[]> = {
  fare:       [{ itemName: 'Kemik Tozu', min: 1, max: 1 }],
  serce:      [{ itemName: 'Parlak Tüy', min: 1, max: 1 }],
  kurbaga:    [{ itemName: 'Kemik Tozu', min: 1, max: 2 }],
  kertenkele: [{ itemName: 'Kırık Av Zinciri', min: 1, max: 1 }],
  hamster:    [{ itemName: 'Kemik Tozu', min: 2, max: 3 }],
  kostebek:   [{ itemName: 'Av Gözü Kristali', min: 1, max: 1 }],
  yarasa:     [{ itemName: 'Sessizlik Teli', min: 1, max: 2 }],
  bildircin:  [{ itemName: 'Parlak Tüy', min: 3, max: 5 }],
  guvercin:   [{ itemName: 'Parlak Tüy', min: 3, max: 5 }],
  yilan:      [{ itemName: 'Yırtıcı Pençe Parçası', min: 1, max: 2 }],
  sincap:     [{ itemName: 'Parlak Tüy', min: 5, max: 8 }],
  tavsan:     [{ itemName: 'Yırtıcı Pençe Parçası', min: 2, max: 3 }],
  gelincik:   [{ itemName: 'Orman Yankısı', min: 1, max: 1 }],
  kirpi:      [{ itemName: 'Gölge Tüyü', min: 1, max: 1 }],
  kedi:       [{ itemName: 'Kemik Tozu', min: 1, max: 2 }],
  kaz:        [{ itemName: 'Parlak Tüy', min: 1, max: 2 }],
  keci:       [{ itemName: 'Kemik Tozu', min: 2, max: 3 }],
  kunduz:     [{ itemName: 'Kırık Av Zinciri', min: 1, max: 1 }],
  koyun:      [{ itemName: 'Parlak Tüy', min: 2, max: 4 }],
  tilki:      [{ itemName: 'Yırtıcı Pençe Parçası', min: 1, max: 2 }],
  sansar:     [{ itemName: 'Orman Yankısı', min: 1, max: 1 }],
  kurt:       [{ itemName: 'Gölge Tüyü', min: 1, max: 1 }],
  yusufcuk:   [{ itemName: 'Parlak Tüy', min: 1, max: 2 }],
  yengec:     [{ itemName: 'Kırık Av Zinciri', min: 1, max: 2 }],
  horoz:      [{ itemName: 'Parlak Tüy', min: 2, max: 4 }],
  penguen:    [{ itemName: 'Sessizlik Teli', min: 1, max: 2 }],
  kaplumbaga: [{ itemName: 'Kemik Tozu', min: 3, max: 5 }],
  bukelemun:  [{ itemName: 'Av Gözü Kristali', min: 1, max: 2 }],
  panda:      [{ itemName: 'Orman Yankısı', min: 1, max: 2 }],
  ayi:        [{ itemName: 'Gölge Tüyü', min: 1, max: 2 }],
};

// --- EMBED RENKLERI ---
export const COLOR_SUCCESS = 0x2ecc71;
export const COLOR_FAIL = 0xe74c3c;
export const COLOR_INFO = 0x9b1c1c;
export const COLOR_WARNING = 0xf1c40f;

// --- LOCK & RATE LIMIT ---
export const LOCK_TTL_SECONDS = 5;   // 15s → 5s: hunt ~200ms, pvp ~500ms, upgrade ~300ms için yeterli margin
/** Oyuncu basina izin verilen komut sayisi (token bucket penceresi icinde). */
export const COMMAND_RATE_LIMIT_TOKENS = Number.parseInt(process.env.COMMAND_RATE_LIMIT_TOKENS ?? '8', 10);
export const COMMAND_RATE_LIMIT_WINDOW_SECONDS = Number.parseInt(
  process.env.COMMAND_RATE_LIMIT_WINDOW_SECONDS ?? '12',
  10,
);
export const SPAM_MUTE_SECONDS = Number.parseInt(process.env.SPAM_MUTE_SECONDS ?? '20', 10);
/** Tekrarlayan spam ihlallerinde artan susturma süreleri (saniye). Ilk deger SPAM_MUTE_SECONDS ile hizali. */
function parseSpamMuteEscalation(): readonly number[] {
  const raw = process.env.SPAM_MUTE_ESCALATION_SECONDS?.trim();
  if (raw) {
    const parsed = raw
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsed.length > 0) return parsed;
  }
  return [SPAM_MUTE_SECONDS, 45, 90, 180, 300] as const;
}
export const SPAM_MUTE_ESCALATION_SECONDS = parseSpamMuteEscalation();
/** Ayni kullanici hatasi icin tekrar Discord yaniti bastirma suresi (ms). */
export const RESPONSE_SUPPRESSION_TTL_MS = Number.parseInt(
  process.env.RESPONSE_SUPPRESSION_TTL_MS ?? '45000',
  10,
);
export const RESPONSE_SUPPRESSION_MAX_ENTRIES = Number.parseInt(
  process.env.RESPONSE_SUPPRESSION_MAX_ENTRIES ?? '100000',
  10,
);
export const MAX_CONCURRENT_COMMANDS = Number.parseInt(process.env.MAX_CONCURRENT_COMMANDS ?? '70', 10);
export const COMMAND_GATE_TTL_SECONDS = Number.parseInt(process.env.COMMAND_GATE_TTL_SECONDS ?? '15', 10);

// --- MODERASYON / UYARI-CEZA ---
/** Bu kadar uyari sonrasi otomatik gecici ban. */
export const MOD_WARN_THRESHOLD = Number.parseInt(process.env.MOD_WARN_THRESHOLD ?? '3', 10);
/** Kademeli ban sureleri (saniye): 2h, 6h, 24h, 7 gun. */
export const MOD_BAN_DURATIONS_SECONDS = [
  7200,
  21_600,
  86_400,
  604_800,
] as const;
export const MOD_WARN_LOG_MAX = 20;
/** Bu kadar spam ihlali (pencere icinde) → otomatik uyari (or. 4 = dort mute sonrasi 1 uyari). */
export const MOD_SPAM_STRIKES_FOR_WARN = Number.parseInt(process.env.MOD_SPAM_STRIKES_FOR_WARN ?? '4', 10);
export const MOD_SPAM_STRIKE_WINDOW_SECONDS = Number.parseInt(
  process.env.MOD_SPAM_STRIKE_WINDOW_SECONDS ?? '14400',
  10,
);

// --- ABUSE BREAKER (v2.1 — flood/makro; normal akista mute/ban yok) ---
export const ABUSE_RAW_REQUESTS = Number.parseInt(process.env.ABUSE_RAW_REQUESTS ?? '40', 10);
export const ABUSE_SAME_COMMAND = Number.parseInt(process.env.ABUSE_SAME_COMMAND ?? '20', 10);
export const ABUSE_WINDOW_SECONDS = Number.parseInt(process.env.ABUSE_WINDOW_SECONDS ?? '10', 10);
/** Abuse throttle suresi (saniye) — kademeli: 1. 15s, 2. 30s, 3. 60s */
export const ABUSE_THROTTLE_SECONDS = [15, 30, 60, 120] as const;
/** Flow mesaj suppression min aralik (ms) — tam sessizlik yok */
export const FLOW_SUPPRESSION_MIN_INTERVAL_MS = Number.parseInt(
  process.env.FLOW_SUPPRESSION_MIN_INTERVAL_MS ?? '15000',
  10,
);
/** Intent davranis hafizasi TTL (saniye) */
export const FLOW_INTENT_TTL_SECONDS = Number.parseInt(
  process.env.FLOW_INTENT_TTL_SECONDS ?? '1800',
  10,
);
/** Impatient: ayni komut kac sn icinde tekrar */
export const FLOW_IMPATIENT_WINDOW_MS = Number.parseInt(
  process.env.FLOW_IMPATIENT_WINDOW_MS ?? '5000',
  10,
);
/** Lost: kac sn icinde kac farkli komut ailesi */
export const FLOW_LOST_WINDOW_MS = Number.parseInt(process.env.FLOW_LOST_WINDOW_MS ?? '60000', 10);
export const FLOW_LOST_MIN_FAMILIES = Number.parseInt(process.env.FLOW_LOST_MIN_FAMILIES ?? '4', 10);
/** Automation: min ornek, max std sapma ms, max ortalama aralik ms */
export const FLOW_AUTOMATION_MIN_SAMPLES = Number.parseInt(
  process.env.FLOW_AUTOMATION_MIN_SAMPLES ?? '5',
  10,
);
export const FLOW_AUTOMATION_MAX_STDEV_MS = Number.parseInt(
  process.env.FLOW_AUTOMATION_MAX_STDEV_MS ?? '100',
  10,
);
export const FLOW_AUTOMATION_MAX_AVG_INTERVAL_MS = Number.parseInt(
  process.env.FLOW_AUTOMATION_MAX_AVG_INTERVAL_MS ?? '400',
  10,
);

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
/** false = otomatik ve admin sezon sıfırlaması kapalı; sıralama puanları kalıcı */
export const LEADERBOARD_SEASON_RESET_ENABLED = false;

// --- LIDERBOARD CACHE (saniye) ---
export const LEADERBOARD_CACHE_TTL = 1800;  // 30 dk — MAX VDS profili
export const LEADERBOARD_TOP_N     = 10;   // Gosterilecek max oyuncu
export const LEADERBOARD_SNAPSHOT_TOP_100  = 100;
export const LEADERBOARD_SNAPSHOT_TOP_1000 = 1000;
export const LEADERBOARD_REBUILD_BATCH     = 500;
export const LEADERBOARD_SEASON_BATCH      = 500;
export const LEADERBOARD_REFRESH_LOCK_TTL  = 15; // saniye — cache singleflight

// --- Adil puanlama ---
export const LB_DAILY_CAP_HUNT = 800;           // günlük hunt LB puan birimi
export const LB_DAILY_CAP_WEALTH = 500_000;     // günlük wealth LB puan birimi (coin)
export const LB_DIMINISHING_HUNT_THRESHOLD = 120; // bu avdan sonra diminishing
export const LB_DIMINISHING_HUNT_FLOOR = 0.15;    // min çarpan

// --- OZEL ROLLER (Discord Role ID'leri) ---
// .env'e ROLE_* olarak eklenebilir; yoksa /admin lb siralama ile otomatik olusturulur

/** Owl Hunt Discord — botun ana sunucusu (admin slash, liderboard rolleri). */
export const OWL_HUNT_GUILD_ID = '1494717650603999373';

export const MAIN_GUILD_ID =
  process.env.MAIN_GUILD_ID?.trim() || OWL_HUNT_GUILD_ID;

export const LEADERBOARD_ROLE_GUILD_ID =
  process.env.LEADERBOARD_ROLE_GUILD_ID?.trim() || MAIN_GUILD_ID;

export const LEADERBOARD_ROLE_STEAL_CHANNEL_ID =
  process.env.LEADERBOARD_ROLE_STEAL_CHANNEL_ID ?? '1516036729730109570';

export const ROLE_IDS = {
  POWER_1:  process.env.ROLE_POWER_1  ?? '',
  ARENA_1:  process.env.ROLE_ARENA_1  ?? '',
  WEALTH_1: process.env.ROLE_WEALTH_1 ?? '',
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

/** Eğitim katmanında statlar arası max fark (fark kilidi). */
export const UPGRADE_SPREAD_MAX = 20;

// ============================================================
// PVP WIN STREAK SISTEMI
// ============================================================

// XP bonus tablosu: streak eşiği → bonus yüzdesi
// Lineer değil, milestone bazlı — daha dramatik hissettiriyor
export const PVP_STREAK_XP_BONUSES: { threshold: number; bonus: number }[] = [
  { threshold: 2,  bonus: 5  },
  { threshold: 3,  bonus: 8  },
  { threshold: 4,  bonus: 10 },
  { threshold: 5,  bonus: 12 },
  { threshold: 7,  bonus: 16 },
  { threshold: 10, bonus: 20 },
];

export const PVP_STREAK_COIN_BONUSES: { threshold: number; coins: number }[] = [
  { threshold: 2,  coins: 20  },
  { threshold: 3,  coins: 30  },
  { threshold: 4,  coins: 40  },
  { threshold: 5,  coins: 55  },
  { threshold: 7,  coins: 75  },
  { threshold: 10, coins: 110 },
];

export const PVP_STREAK_MAX_XP_BONUS = 20;

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

// Zorluk dağılımı: kolay ağırlıklı — botlar genelde yenilir; zorlu nadir
export const SIM_PVP_DIFFICULTY_TABLE: {
  weight: number;
  powerRatio: number;  // oyuncu gücüne oranla düşman gücü
  xpMult: number;      // kazanma XP çarpanı
  label: string;
}[] = [
  { weight: 75, powerRatio: 0.78, xpMult: 0.8,  label: 'Kolay'    },
  { weight: 20, powerRatio: 0.95, xpMult: 1.0,  label: 'Dengeli'  },
  { weight: 5,  powerRatio: 1.08, xpMult: 1.35, label: 'Zorlu'    },
];

// Simüle PvP ödülleri (bot duel — h→b→sell döngüsü için anlamlı farm)
export const SIM_PVP_WIN_COINS  = 130;  // Kazanma coin (bot duel farm — gerçek PvP'den yüksek)
export const SIM_PVP_LOSE_COINS = 0;
export const SIM_PVP_WIN_XP     = 65;   // Kazanma base XP (zorluk çarpanı eklenir)
export const SIM_PVP_LOSE_XP    = 20;   // Kaybetme XP

// Cooldown: aynı oyuncu kaç ms'de bir bot duel yapabilir
export const SIM_PVP_COOLDOWN_MS = HUNT_COOLDOWN_MS;  // Hunt ile aynı

/** Sim PvP animasyon süreleri (ms) — Discord edit’lerin görünmesi için. */
export const SIM_PVP_ANIM_INTRO_MS = 450;
export const SIM_PVP_ANIM_FRAME_MS = 700;
export const SIM_PVP_ANIM_OUTRO_MS = 200;
export const PVP_BATTLE_ANIM_MIN_FRAMES = 3;
export const PVP_BATTLE_ANIM_MAX_FRAMES = 4;
/** true ise animasyon atlanır, doğrudan sonuç ekranı (SIM_PVP_SKIP_ANIM=1). */
export const SIM_PVP_SKIP_ANIM = process.env.SIM_PVP_SKIP_ANIM === '1';

/** Oyuncu vs oyuncu duel davet süresi (ms) */
export const PVP_DUEL_INVITE_TTL_MS = 35_000;

// Günlük bot duel coin kazanç üst sınırı — aşıldığında coin ödülü 0'a düşer, XP etkilenmez
export const DUEL_DAILY_COIN_CAP = 2_200;

/** Bot duel'de gerçek avcı main baykuşu deneme şansı (%). Miss / havuz boş → bot. */
export const SIM_PVP_PLAYER_OWL_CHANCE = 80;

/** Son N gerçek rakip ownerId tekrar edilmez (az oyuncu havuzu). */
export const SIM_PVP_RECENT_OPPONENT_CAP = 5;

/** Recent rakip listesi TTL (saniye). */
export const SIM_PVP_RECENT_OPPONENT_TTL_SEC = 7200;

/** Gerçek avcı baykuşu encounter'ında tek satırlık flavor (owner expose yok). */
export const SIM_PVP_PLAYER_OWL_FLAVOR: string[] = [
  '🏹 Başka bir avcının izine rastladın.',
  '🦉 Bu baykuş başka bir avcıya ait.',
  '📖 Tanıdık bir koku — bu baykuş birçok av görmüş.',
];

// Sahte oyuncu isimleri havuzu
export const SIM_PVP_FAKE_NAMES: string[] = [
  'Karanlık Avcı', 'Gece Baykuşu', 'Orman Efendisi', 'Sessiz Kanat',
  'Yıldırım Pençe', 'Gölge Avcı', 'Dağ Kartalı', 'Fırtına Gözü',
  'Demir Gaga', 'Buz Kulak', 'Ateş Kanat', 'Taş Pençe',
  'Kuzey Rüzgarı', 'Ay Işığı', 'Şimşek Gözü', 'Kara Tüy',
  'Altın Kanat', 'Gümüş Pençe', 'Bronz Gaga', 'Demir Kulak',
  'Çığlık Nöbetçi', 'Sis Bekçisi', 'Ay Tutulması', 'Rüzgar Uluyan',
  'Kaya Pençesi', 'Gece Feneri', 'Yosun Gaga', 'Koru Muhafızı',
  'Pusulu Kanat', 'Yıldız Avcısı', 'Kül Gözü', 'Çam Nöbetçisi',
  'Obsidyen Avcı', 'Şafak Pençesi', 'Alacakaranlık Gözü', 'Kış Uluyan',
  'Kızıl Tüy', 'Soluk Kanat', 'Vahşi Gaga', 'Titrek Fener',
  'Donuk Muhafız', 'Amber Bekçi', 'Zümrüt İz', 'Geceyarısı Yayı',
  'Sonbahar Kartalı', 'Yaz Rüzgarı', 'Keskin Hançer', 'Boğuk Çığlık',
  'Gri Yoldaş', 'Beyaz Nöbetçi', 'Mavi Tılsım', 'Kanlı Yemin',
  'İnce Sır', 'Ulu Koruyucu', 'Puslu Rüya', 'Külgeçit Avcısı',
];

export const SIM_PVP_NAME_PREFIXES: string[] = [
  'Karanlık', 'Gece', 'Sessiz', 'Yıldırım', 'Gölge', 'Dağ', 'Fırtına',
  'Demir', 'Buz', 'Ateş', 'Taş', 'Kuzey', 'Ay', 'Şimşek', 'Kara',
  'Altın', 'Gümüş', 'Bronz', 'Çığlık', 'Sis', 'Rüzgar', 'Kaya',
  'Yosun', 'Koru', 'Puslu', 'Yıldız', 'Kül', 'Çam', 'Kanlı', 'Soluk',
  'Keskin', 'Vahşi', 'Ulu', 'İnce', 'Boğuk', 'Titrek', 'Donuk', 'Kızıl',
  'Mavi', 'Gri', 'Beyaz', 'Obsidyen', 'Amber', 'Zümrüt', 'Geceyarısı',
  'Şafak', 'Alacakaranlık', 'Kış', 'Yaz', 'Sonbahar',
];

export const SIM_PVP_NAME_SUFFIXES: string[] = [
  'Avcı', 'Baykuş', 'Kanat', 'Pençe', 'Gaga', 'Kulak', 'Gözü',
  'Efendisi', 'Nöbetçi', 'Bekçisi', 'Muhafızı', 'Feneri', 'Uluyan',
  'Kartalı', 'Tüyü', 'Işığı', 'Rüzgarı', 'Gölgesi', 'Fırtınası',
  'Koruyucusu', 'Avcısı', 'Yoldaşı', 'Hançeri', 'Kılıcı', 'Yayı',
  'İzi', 'Çığlığı', 'Uykusu', 'Rüyası', 'Pençesi', 'Kanadı',
  'Tılsımı', 'Yemini', 'Sırrı',
];

export const SIM_PVP_NAME_PLACES: string[] = [
  'Aytepe', 'Karlık', 'Sisliova', 'Kuzey Ormanı', 'Külgeçit',
  'Yıldızkuyu', 'Çamlık', 'Gölova', 'Taşburun', 'Rüzgarlıbel',
];

export const SIM_PVP_NAME_TITLES: string[] = [
  'Nöbetçisi', 'Muhafızı', 'Avcısı', 'Bekçisi', 'Koruyucusu',
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
  /** Oyuncunun kullandığı kısa ID: 001–006 */
  useId:       string;
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
   *   upgrade_bonus    → upgrade coin maliyetinde indirim (UPGRADE_BUFF_COIN_DISCOUNT / buff)
   *   downgrade_shield → garanti upgrade'de kullanılmaz (geriye uyumluluk)
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
    useId:        '001',
    name:         'Keskin Nişan',
    emoji:        '🎯',
    description:  'Aktif olduğu sürece yakalama şansı artar.',
    category:     'hunt',
    rarity:       'Common',
    chargeMax:    100,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  0.25,
    effectType:   'catch_bonus',
    tradeoff:     'Charge bitince pasifleşir, item kaybolmaz.',
  },
  {
    id:           'b002',
    useId:        '002',
    name:         'Av Kokusu',
    emoji:        '🌿',
    description:  'Aktif olduğu sürece item drop şansı artar.',
    category:     'hunt',
    rarity:       'Common',
    chargeMax:    80,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  1.90,
    effectType:   'loot_mult',
    tradeoff:     'Charge bitince pasifleşir.',
  },
  {
    id:           'b003',
    useId:        '003',
    name:         'Nadir İz',
    emoji:        '🔮',
    description:  'Aktif olduğu sürece nadir av drop şansı artar.',
    category:     'hunt',
    rarity:       'Rare',
    chargeMax:    60,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  0.35,
    effectType:   'rare_drop_bonus',
    tradeoff:     'Güçlü ama Rare, charge daha az.',
  },
  {
    id:           'b004',
    useId:        '004',
    name:         'Orman Ruhu',
    emoji:        '🌲',
    description:  'Aktif olduğu sürece yakalama ve drop şansı hafifçe artar.',
    category:     'hunt',
    rarity:       'Rare',
    chargeMax:    120,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  0.20,
    effectType:   'catch_bonus',
    tradeoff:     'Çift etki, uzun ömür.',
  },
  {
    id:           'b005',
    useId:        '005',
    name:         'Yıldız Tüy',
    emoji:        '⭐',
    description:  'Aktif olduğu sürece tüm drop şansları büyük ölçüde artar.',
    category:     'hunt',
    rarity:       'Epic',
    chargeMax:    40,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  2.80,
    effectType:   'loot_mult',
    tradeoff:     'Çok güçlü ama Epic, charge az.',
  },
  {
    id:           'b006',
    useId:        '006',
    name:         'Efsane Av Ruhu',
    emoji:        '🦅',
    description:  'Aktif olduğu sürece yakalama ve nadir drop şansı maksimum artar.',
    category:     'hunt',
    rarity:       'Legendary',
    chargeMax:    25,
    huntCost:     1,
    pvpCost:      0,
    upgradeCost:  0,
    effectValue:  0.45,
    effectType:   'catch_bonus',
    tradeoff:     'En güçlü hunt buff, ama çok az charge.',
  },
];

// Buff item ID → tanım hızlı erişim haritası
export const BUFF_ITEM_MAP: Record<string, BuffItemDef> = Object.fromEntries(
  BUFF_ITEMS.map((b) => [b.id, b]),
);

// useId → tanım haritası (001, 002... ile erişim)
export const BUFF_ITEM_USE_MAP: Record<string, BuffItemDef> = Object.fromEntries(
  BUFF_ITEMS.map((b) => [b.useId, b]),
);

// ── DİMİNİSHİNG RETURNS ──────────────────────────────────────────────────────
// Aynı kategoriden birden fazla aktif buff varsa etki azalır.
// Örnek: 1. buff → %100, 2. buff → %60, 3. buff → %30
export const BUFF_DIMINISHING_RATES = [1.0, 0.6, 0.3] as const;

// ── LOOTBOX TANIMLARI ────────────────────────────────────────────────────────
//
// İki kutu tipi (ikisi de av buff'ı verir):
//   Eşya Kutusu  (ek / ec) — standart av buff havuzu
//   Silah Kutusu (sk / wc) — nadir av buff ağırlıklı (eski envanter uyumu)
//
// Komutlar:
//   w ek        → 1 eşya kutusu aç
//   w ek all    → tüm eşya kutularını aç
//   w sk        → 1 silah kutusu aç (av buff, nadir ağırlıklı)
//   w sk all    → tüm silah kutularını aç

export type LootboxTier = 'Silah' | 'Eşya';

export interface LootboxDef {
  id:          string;
  name:        string;
  emoji:       string;
  tier:        LootboxTier;
  /** Bu kutunun içerebileceği buff kategorileri */
  categories:  BuffItemCategory[];
  /** Ağırlıklı rarity dağılımı */
  weights:     { rarity: BuffItemRarity; weight: number }[];
  /** Pity: X kutu açmadan Rare+ gelmezse garanti */
  pityThreshold: number;
}

export const LOOTBOX_DEFS: LootboxDef[] = [
  {
    id:         'wc',
    name:       'Silah Kutusu',
    emoji:      '⚔️',
    tier:       'Silah',
    categories: ['hunt'],
    weights:    [
      { rarity: 'Common',    weight: 35 },
      { rarity: 'Rare',      weight: 35 },
      { rarity: 'Epic',      weight: 22 },
      { rarity: 'Legendary', weight: 8  },
    ],
    pityThreshold: 6,
  },
  {
    id:         'ec',
    name:       'Eşya Kutusu',
    emoji:      '🧰',
    tier:       'Eşya',
    categories: ['hunt'],
    weights:    [
      { rarity: 'Common',    weight: 65 },
      { rarity: 'Rare',      weight: 28 },
      { rarity: 'Epic',      weight: 6  },
      { rarity: 'Legendary', weight: 1  },
    ],
    pityThreshold: 8,
  },
];

// Lootbox ID → tanım hızlı erişim haritası
export const LOOTBOX_DEF_MAP: Record<string, LootboxDef> = Object.fromEntries(
  LOOTBOX_DEFS.map((l) => [l.id, l]),
);

// ── LOOTBOX DROP ŞANSLARI ────────────────────────────────────────────────────
// Hunt'tan düşen lootbox şansları (her başarılı av rolünde)
export const LOOTBOX_HUNT_DROP_CHANCE: Record<LootboxTier, number> = {
  Silah:  5,    // %5 — avdan silah kutusu
  Eşya:   12,   // %12 — hunt odaklı, daha sık
};

// Kritik avda çarpan
export const LOOTBOX_CRIT_MULT = 2.0;

// PvP kazanmada lootbox şansı
export const LOOTBOX_PVP_WIN_CHANCE: Record<LootboxTier, number> = {
  Silah:  14,   // %14 — PvP'den silah kutusu
  Eşya:   7,    // %7
};

// Encounter savaş kazanma lootbox şansı (tame'den yüksek — savaş ana ödül yolu)
export const LOOTBOX_ENCOUNTER_FIGHT_CHANCE: Record<LootboxTier, number> = {
  Silah:  18,
  Eşya:   35,
};

// Encounter kazanmada (tame başarısı) lootbox şansı
export const LOOTBOX_ENCOUNTER_WIN_CHANCE: Record<LootboxTier, number> = {
  Silah:  5,    // %5
  Eşya:   12,   // %12 — encounter eşya odaklı
};

// ── PVP BUFF CAP'LERİ ────────────────────────────────────────────────────────
// Buff'lar PvP win chance'i bu sınırları aşamaz
export const PVP_BUFF_DAMAGE_MULT_MAX = 1.20;   // max +20% hasar
export const PVP_BUFF_DODGE_BONUS_MAX = 0.12;   // max +12% dodge

// ============================================================
// TRANSFER (PARA GÖNDERME) SİSTEMİ
// ============================================================

// --- ÖZELLİK KİLİTLERİ (market, transfer, vb.) ---
export const FEATURE_MIN_LEVEL = 5;

// --- MARKET SİSTEMİ ---
export const MARKET_MIN_LEVEL = FEATURE_MIN_LEVEL;
export const MARKET_TAX_RATE = 0.05; // %5 satış vergisi
export const MARKET_LISTING_FEE_RATE = 0.01; // %1 listeleme ücreti (iade edilmez)
export const MARKET_MAX_ACTIVE_LISTINGS = 5;
export const MARKET_LISTING_DURATION_MS = 48 * 60 * 60 * 1000; // 48 saat
export const MARKET_PAGE_SIZE = 8;
/** Kategori browse select menüsü — Discord 25 seçenek limitinin altında kalır. */
export const MARKET_BROWSE_PAGE_SIZE = 20;
/** w owllist — kart başına sayfa (Discord 2000 karakter sınırı). */
export const OWLLIST_PAGE_SIZE = 5;
export const MARKET_SUSPICIOUS_THRESHOLD = 50;
/** Günlük limit yerine MARKET_MAX_ACTIVE_LISTINGS kullanılır */
export const MARKET_LISTING_LIMIT_DAILY = 5;

// --- GÜNLÜK LOGIN ÖDÜLÜ (w daily) ---
export const DAILY_LOGIN_COOLDOWN_MS = 20 * 60 * 60 * 1000;
export const DAILY_LOGIN_STREAK_WINDOW_MS = 30 * 60 * 60 * 1000;
export const DAILY_LOGIN_STREAK_GRACE_MS = 24 * 60 * 60 * 1000;
export const DAILY_LOGIN_BASE_COIN = 200;
export const DAILY_LOGIN_STREAK_COIN_GROWTH = 25;
export const DAILY_LOGIN_COIN_CAP = 800;
export const DAILY_LOGIN_BASE_XP = 50;
export const DAILY_LOGIN_STREAK_XP_GROWTH = 15;
export const DAILY_LOGIN_XP_CAP = 300;
export const DAILY_LOGIN_LOOTBOX_EVERY_DAYS = 5;
export const DAILY_LOGIN_WEAPON_CRATE_EVERY_DAYS = 10;
export const DAILY_LOGIN_EQUIPMENT_CRATE_NAME = 'Eşya Kutusu';
export const DAILY_LOGIN_WEAPON_CRATE_NAME = 'Silah Kutusu';
export const DAILY_LOGIN_MILESTONES: ReadonlyArray<{
  streak: number;
  bonusCoins: number;
  bonusXp: number;
}> = [
  { streak: 3, bonusCoins: 150, bonusXp: 40 },
  { streak: 7, bonusCoins: 350, bonusXp: 80 },
  { streak: 14, bonusCoins: 700, bonusXp: 150 },
  { streak: 30, bonusCoins: 1500, bonusXp: 350 },
];

// --- A7 · WELCOME-BACK PAKETİ (ara veren oyuncuyu karşılama) ---
/** Paketin açılması için gereken minimum ara (gün). */
export const WELCOME_BACK_MIN_AWAY_DAYS = 7;
/** Aynı oyuncu bu süre içinde ikinci paket alamaz — login farming'i engeller. */
export const WELCOME_BACK_COOLDOWN_DAYS = 30;
/**
 * Paket kasıtlı olarak **küçük** tutulur.
 * 7 gün düzenli login en az 7 × DAILY_LOGIN_BASE_COIN = 1400 coin getirir;
 * paket bunun çok altında kalmalı ki ara vermek avantajlı olmasın.
 */
export const WELCOME_BACK_COINS = 300;
export const WELCOME_BACK_EQUIPMENT_CRATES = 1;

// --- I4 · GÜNLÜK CAP YERİNE SOFTENING ---
/**
 * Soft cap aşıldıktan sonra ödülün devam ettiği oran.
 * 0 olsaydı hard cap olurdu ("bu yeter"); 1 olsaydı cap işlevsiz kalırdı.
 */
export const DAILY_SOFT_CAP_RATE = 0.25;
/**
 * Mutlak tavan çarpanı — softening sonsuz farming'e dönüşmesin.
 * Kredilendirilen toplam en fazla `cap × bu çarpan` olur.
 */
export const DAILY_SOFT_CAP_CEILING_MULT = 1.5;

// --- YENİ OYUNCU BOOSTU (şeffaf, hesap yaşı) ---
export const NEWBIE_BOOST_DAYS = 7;
export const NEWBIE_XP_MULTIPLIER = 1.12;
export const NEWBIE_LUCK_BONUS = 0.02;

// --- BAŞLANGIÇ PAKETİ ---
export const STARTER_PACK_EQUIPMENT_CRATES = 7;
export const STARTER_PACK_WEAPON_CRATES = 7;

// --- GÖREV SİSTEMİ ---
export {
  DAILY_QUESTS_PER_DAY,
  DAILY_QUEST_POOL,
  DAILY_QUEST_TYPES,
  DAILY_QUEST_VARIANTS,
  formatDailyQuestLabel,
  parseDailyQuestMeta,
  rollQuestMeta,
  type DailyQuestType,
  type DailyQuestVariant,
  type DailyQuestMeta,
} from './config/daily-quest-pool';

/** Gönderici için minimum oyuncu seviyesi */
export const TRANSFER_MIN_LEVEL = FEATURE_MIN_LEVEL;

/**
 * OwlOnly oyun kanallarında ViewChannel kapatılacak bilinen eğlence botları (Discord user ID).
 * Sunucuda yoksa atlanır; yeni katılımda otomatik uygulanır.
 */
export const BLOCKED_ENTERTAINMENT_BOT_IDS: readonly string[] = [
  '408785106165166133', // hayvan av / ekonomi botu (w prefix)
  '270480392019837952', // Dank Memer
  '511072218440667397', // UnbelievaBoat
  '432087489860465378', // Mudae
  '724303066585202688', // Karuta
  '716026485519257601', // Pokétwo
];

/** Tek transferde minimum coin */
export const TRANSFER_MIN_AMOUNT = 10;

/** Günlük maksimum gönderim (gönderici başına) */
// 10.000 coin/gün — aktif oyuncular için daha rahat transfer.
export const TRANSFER_DAILY_LIMIT = 10_000;

/** Günlük maksimum alım (alıcı başına) — iki hesap arası pump'ı önler */
// WHY: 15.000 coin/gün alım limiti anlamsız derecede yüksekti.
// 5.000 ile gönderim limitiyle orantılı hale getirildi.
export const TRANSFER_DAILY_RECEIVE_LIMIT = 5_000;

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
export const PVP_GAMBLE_MIN_BET = GAMBLE_MIN_BET;

/** Oyunlar arası cooldown (ms) — her iki oyuncuya da uygulanır */
export const PVP_GAMBLE_COOLDOWN_MS = 10_000;

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

// ── SLOT YARIŞMASI ────────────────────────────────────────────────────────────

/** Slot Race'de her iki oyuncu aynı sembolü yakalarsa verilen XP bonusu */
export const PVP_SLOT_COMBO_XP_BONUS = 25;

/** Slot Race — makara durma aralığı (solo ile aynı) */
export const PVP_SLOT_REEL_STOP_MS = SLOT_REEL_STOP_MS;

/** PvP Coin Flip — %50 şans, seri katil eşiği */
export const PVP_CF_WIN_CHANCE = 50;
export const PVP_CF_SERIAL_KILLER_STREAK = 3;
export const PVP_GAMBLE_REDIS_CF_STREAK_PREFIX = 'pvp:gamble:cf_streak:';
export const PVP_CF_SPIN_MS = 2_200;

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

/** PvP gambling kayıp serisi prefix'i */
export const PVP_GAMBLE_REDIS_LOSS_STREAK_PREFIX = 'pvp:gamble:loss_streak:';

/** Kayıp iadesi için toplam kayıp takip prefix'i */
export const PVP_GAMBLE_REDIS_LOSS_TOTAL_PREFIX = 'pvp:gamble:loss_total:';

/** Oturum TTL (ms) — Redis'te ne kadar tutulur */
export const PVP_GAMBLE_SESSION_TTL_MS = 10 * 60 * 1_000; // 10 dakika

/** Pair count TTL (ms) — Progressive cut sayacı ne kadar tutulur */
export const PVP_GAMBLE_PAIR_COUNT_TTL_MS = 24 * 60 * 60 * 1_000; // 24 saat

