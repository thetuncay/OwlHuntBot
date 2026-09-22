/**
 * Hunt varyasyonu sabitleri (B1 · B3 · N2 · D1).
 *
 * Core loop parametreleri (7 sn cooldown, pity 8, streak %5/%20) burada yok.
 * Bu dosya yalnızca oturum / saat / micro-event katmanını tutar.
 */

/** Oturum av serisi Redis anahtarı. */
export const HUNT_SESSION_REDIS_PREFIX = 'hunt:session:';

/** Oturum hareketsizlik TTL (saniye). Doluysa bonus sessizce düşer — ceza yok. */
export const HUNT_SESSION_IDLE_SEC = 15 * 60;

/** @deprecated Av serisi birleşti — `HUNT_SERIES_*` / milestone sabitleri. */
export const HUNT_SESSION_MILESTONE_25 = 25;
export const HUNT_SESSION_MILESTONE_50 = 50;
export const HUNT_SESSION_XP_MULT_25 = 1.05;
export const HUNT_SESSION_XP_MULT_50 = 1.1;

/** Micro-event sıklığı: her N. avda bir (B1). */
export const HUNT_MICRO_EVENT_EVERY = 12;

/** Micro-event Redis sayacı. */
export const HUNT_MICRO_EVENT_REDIS_PREFIX = 'hunt:micro:';

/** Micro-event ek XP — spike değil, aroma. */
export const HUNT_MICRO_EVENT_BONUS_XP = 8;

/** Tipik bir avın XP'si — milestone tavanı ve D1 kalibrasyonu için. */
export const HUNT_TYPICAL_XP = 70;

/** Garanti av XP tabanı — boş avın cimri hissettirmemesi (D1). */
export const HUNT_GUARANTEE_XP_FLOOR = 8;

/**
 * Sabah penceresi (Europe/Istanbul, UTC+3) — XP hafif artar (N2).
 * Saatler 0–23, İstanbul yerel.
 */
export const HUNT_MORNING_HOUR_START = 6;
export const HUNT_MORNING_HOUR_END = 11;
export const HUNT_MORNING_XP_MULT = 1.05;

/** Gece penceresi — nadir av şansı artar (N2). */
export const HUNT_NIGHT_HOUR_START = 22;
export const HUNT_NIGHT_HOUR_END = 5;
/** Gece nadir av bonus oranı — sabah XP’den daha hissedilir olsun. */
export const HUNT_NIGHT_RARE_BONUS = 0.08;

/** İstanbul UTC ofseti (saat). DST yok sayılır — sabit, şeffaf. */
export const HUNT_ISTANBUL_UTC_OFFSET_HOURS = 3;
