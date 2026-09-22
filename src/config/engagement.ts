/**
 * Sosyal, onboarding ve metrik sabitleri (G3 · G5 · H1 · L1 · P1–P5).
 */

/** Kudos (G3). Ödül yok — 20 dk cooldown, kaç kişi attı. */
export const KUDOS_COOLDOWN_MS = 20 * 60 * 1000;
export const KUDOS_COOLDOWN_PREFIX = 'kudos:cd:';
export const KUDOS_PEOPLE_PREFIX = 'kudos:people:';

/** Mentor eşleşmesi (G5) — ödül yok, yalnızca bağ. */
export const MENTOR_REDIS_PREFIX = 'mentor:';

/** İlk 30 dk happy path (H1). */
export const HAPPY_PATH_WINDOW_MS = 30 * 60 * 1000;
export const HAPPY_PATH_FIRST_MILESTONE_HUNTS = 5;
export const HAPPY_PATH_BONUS_XP = 40;
export const HAPPY_PATH_REDIS_PREFIX = 'onboard:happypath:';

/** Rehber baykuş diyalog penceresi (H3) — satır sayısı kadar. */
export const BUDDY_BOOST_HUNT_LIMIT = 2;

/** Hunt p95 bütçesi (L1). */
export const HUNT_P95_BUDGET_MS = 500;

/** Engagement sayaç TTL (90 gün). */
export const ENGAGEMENT_COUNTER_TTL_SEC = 90 * 24 * 60 * 60;
export const ENGAGEMENT_REDIS_PREFIX = 'eng:';

/** Oturum boşluk eşiği — bundan uzun ara yeni oturum (P1). */
export const SESSION_GAP_MS = 15 * 60 * 1000;
