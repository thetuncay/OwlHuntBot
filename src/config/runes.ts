/**
 * runes.ts — Rün taşı tanımları ve drop sabitleri.
 *
 * ATK→Pençe, DEF→Gaga, SPD→Kanat, CRT→Göz. Kulak rünle artmaz.
 * Apply upgrade spread kilidinden muaf (kalıcı güç kaynağı; aksi halde
 * yüksek DEF rünleri kullanılamaz hale gelirdi).
 */

import type { OwlStatKey } from '../types';

export type RuneRarity = 'Yaygın' | 'Ender' | 'Nadir' | 'Efsanevi';

/** Envanter rarity alanı (mevcut InventoryItem uyumu). */
export type RuneInventoryRarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary';

export const RUNE_ITEM_TYPE = 'Rün';

export const RUNE_APPLIED_REDIS_PREFIX = 'rune:applied:';

/** Tame başarı sonrası rün düşme kapısı (0–1). */
export const RUNE_DROP_GATE_TAME = 0.08;

/** Encounter savaş kazanma sonrası rün düşme kapısı (0–1). */
export const RUNE_DROP_GATE_FIGHT = 0.1;

/**
 * Gate sonrası rarity ağırlıkları (toplam ~100).
 * Güçlü taşlar daha nadir.
 */
export const RUNE_RARITY_WEIGHTS: Readonly<Record<RuneRarity, number>> = {
  Yaygın: 70,
  Ender: 22,
  Nadir: 7,
  Efsanevi: 1,
};

export const RUNE_RARITY_TO_INVENTORY: Readonly<Record<RuneRarity, RuneInventoryRarity>> = {
  Yaygın: 'Common',
  Ender: 'Uncommon',
  Nadir: 'Rare',
  Efsanevi: 'Legendary',
};

export const RUNE_RARITY_FALLBACK_EMOJI: Readonly<Record<RuneRarity, string>> = {
  Yaygın: '⚪',
  Ender: '🟢',
  Nadir: '🟣',
  Efsanevi: '🌟',
};

/** Rarity başlık emojileri — custom-emojis key. */
export const RUNE_RARITY_EMOJI_KEY: Readonly<Record<RuneRarity, string>> = {
  Yaygın: 'rarity.yaygin',
  Ender: 'rarity.ender',
  Nadir: 'rarity.nadir',
  Efsanevi: 'rarity.efsanevi',
};

/** Bulunmamış rün — klasik `?` yerine. */
export const RUNE_UNKNOWN_EMOJI_KEY = 'ui.soru';

/** Oyuncu ATK/DEF/SPD/CRT → OwlHunt stat anahtarı. */
export const RUNE_STAT_MAP = {
  ATK: 'pence',
  DEF: 'gaga',
  SPD: 'kanat',
  CRT: 'goz',
} as const satisfies Record<'ATK' | 'DEF' | 'SPD' | 'CRT', OwlStatKey>;

export type RuneCombatStat = keyof typeof RUNE_STAT_MAP;

export interface RuneBonuses {
  ATK?: number;
  DEF?: number;
  SPD?: number;
  CRT?: number;
}

export interface RuneDef {
  id: string;
  name: string;
  rarity: RuneRarity;
  bonuses: RuneBonuses;
  /** custom-emojis registry key */
  emojiKey: string;
  fallbackEmoji: string;
}

/**
 * 9 rün — ID 040–048 (ekran / katalog).
 */
export const RUNE_DEFS: readonly RuneDef[] = [
  {
    id: '040',
    name: 'Büyülü Tüy',
    rarity: 'Yaygın',
    bonuses: { SPD: 3, DEF: 2 },
    emojiKey: 'rune.buyulu_tuy',
    fallbackEmoji: '🪶',
  },
  {
    id: '041',
    name: 'Kırık Taş',
    rarity: 'Yaygın',
    bonuses: { ATK: 4 },
    emojiKey: 'rune.kirik_tas',
    fallbackEmoji: '🧊',
  },
  {
    id: '042',
    name: 'Kırık Kanat',
    rarity: 'Ender',
    bonuses: { SPD: 5, CRT: 4 },
    emojiKey: 'rune.kirik_kanat',
    fallbackEmoji: '🖤',
  },
  {
    id: '043',
    name: 'Orman Kalbi',
    rarity: 'Ender',
    bonuses: { DEF: 6, ATK: 3 },
    emojiKey: 'rune.orman_kalbi',
    fallbackEmoji: '🍃',
  },
  {
    id: '044',
    name: 'Gece Nefesi',
    rarity: 'Nadir',
    bonuses: { ATK: 6, DEF: 5, SPD: 4, CRT: 4 },
    emojiKey: 'rune.gece_nefesi',
    fallbackEmoji: '🌀',
  },
  {
    id: '045',
    name: 'Son Nefes',
    rarity: 'Nadir',
    bonuses: { ATK: 8, DEF: 2, SPD: 4, CRT: 5 },
    emojiKey: 'rune.son_nefes',
    fallbackEmoji: '🌬️',
  },
  {
    id: '046',
    name: 'Altın Totem',
    rarity: 'Nadir',
    bonuses: { ATK: 5, DEF: 4, SPD: 4, CRT: 1 },
    emojiKey: 'rune.altin_totem',
    fallbackEmoji: '🗿',
  },
  {
    id: '047',
    name: 'Kadim Yumurta',
    rarity: 'Efsanevi',
    bonuses: { DEF: 15, SPD: 10, ATK: 7, CRT: 6 },
    emojiKey: 'rune.kadim_yumurta',
    fallbackEmoji: '🥚',
  },
  {
    id: '048',
    name: 'Hiçlik Özü',
    rarity: 'Efsanevi',
    bonuses: { ATK: 16, CRT: 10, SPD: 9, DEF: 4 },
    emojiKey: 'rune.hiclik_ozu',
    fallbackEmoji: '🕳️',
  },
] as const;

export const RUNE_DEF_BY_ID: ReadonlyMap<string, RuneDef> = new Map(
  RUNE_DEFS.map((d) => [d.id, d]),
);

export const RUNE_DEF_BY_NAME: ReadonlyMap<string, RuneDef> = new Map(
  RUNE_DEFS.map((d) => [d.name.toLocaleLowerCase('tr-TR'), d]),
);

/**
 * Düşman gücüne göre rarity ağırlık çarpanı.
 * Zayıf düşmanda efsanevi hâlâ mümkün ama daha düşük; güçlüde biraz daha az imkânsız.
 *
 * @param tier Encounter owl tier (1 güçlü … 8 zayıf)
 * @param quality Trash … God Roll
 */
export function runeRarityWeightMult(
  tier: number,
  quality: string,
): Record<RuneRarity, number> {
  const strong =
    tier <= 3 || quality === 'Elite' || quality === 'God Roll';
  const weak = tier >= 6 || quality === 'Trash' || quality === 'Common';
  if (strong) {
    return { Yaygın: 0.85, Ender: 1, Nadir: 1.15, Efsanevi: 1.6 };
  }
  if (weak) {
    return { Yaygın: 1.15, Ender: 1, Nadir: 0.85, Efsanevi: 0.55 };
  }
  return { Yaygın: 1, Ender: 1, Nadir: 1, Efsanevi: 1 };
}

/**
 * Bonusu OwlStatKey deltalarına çevirir.
 *
 * @param bonuses Rün bonusları
 */
export function runeBonusesToStatDeltas(
  bonuses: RuneBonuses,
): Partial<Record<OwlStatKey, number>> {
  const out: Partial<Record<OwlStatKey, number>> = {};
  for (const [combat, amount] of Object.entries(bonuses) as [RuneCombatStat, number][]) {
    if (!amount) continue;
    const key = RUNE_STAT_MAP[combat];
    out[key] = (out[key] ?? 0) + amount;
  }
  return out;
}
