/**
 * Hunt av serisi kilometre taşları — sayılar yalnızca burada.
 *
 * Her av sayacı +1. Hedef: 25 → 50 → sonra artan adım.
 * Hareketsizlikte Redis TTL ile sessiz sıfırlanır (uyarı yok).
 */

/** Redis: hunt:milestone:{userId} */
export const HUNT_MILESTONE_REDIS_PREFIX = 'hunt:milestone:';

/** Bu süre av atılmazsa seri sıfır (saniye). */
export const HUNT_MILESTONE_INACTIVITY_SEC = 24 * 60 * 60;

/** İlk hedef. */
export const HUNT_MILESTONE_FIRST_TARGET = 25;

/** İkinci hedef (25 sonrası). */
export const HUNT_MILESTONE_SECOND_TARGET = 50;

/** 50’den sonraki taban adım (sonra +5 büyür). */
export const HUNT_MILESTONE_BASE_GAP = 25;

/** Her ek kilometre taşında adıma eklenen artış. */
export const HUNT_MILESTONE_GAP_GROWTH = 5;

/** Kilometre taşı XP: base + (claimedIndex-1)*perTier */
export const HUNT_MILESTONE_XP_BASE = 80;
export const HUNT_MILESTONE_XP_PER_TIER = 40;

/**
 * C5 — milestone XP, tipik hunt XP'nin 2 katını aşmasın.
 * Deci 1999: büyük dış ödül hunt keyfini gölgeler.
 */
export const HUNT_MILESTONE_XP_MAX_MULT = 2;

/** Her kilometre taşında eşya kutusu. */
export const HUNT_MILESTONE_LOOTBOX_ID = 'ec' as const;

/** Her N. kilometre taşında ek silah kutusu (0 = kapalı). */
export const HUNT_MILESTONE_WEAPON_EVERY = 3;
export const HUNT_MILESTONE_WEAPON_LOOTBOX_ID = 'wc' as const;

/**
 * Hedefe kalan av sayısı bu değere ≤ olduğunda hunt mesajında yaklaşım vurgusu (A2).
 * Locke & Latham proximal goal + curiosity teaser.
 * Kalan avlar bu eşiğin üstünde ise mevcut ince satır render edilir.
 */
export const HUNT_MILESTONE_APPROACH_THRESHOLD = 3;

/**
 * Av serisi XP çarpanı (eski oturum bonusu — aynı sayaçta birleşti).
 * count ≥ 25 → +%5, count ≥ 50 → +%10.
 */
export const HUNT_SERIES_XP_MULT_25 = 1.05;
export const HUNT_SERIES_XP_MULT_50 = 1.1;
