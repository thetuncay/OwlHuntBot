/**
 * Trade (P2P) sabitleri — sayılar yalnızca burada.
 */

/** Redis session: trade:session:{id} */
export const TRADE_SESSION_REDIS_PREFIX = 'trade:session:';

/** Aktif trade guard: trade:guard:{userId} → sessionId */
export const TRADE_GUARD_REDIS_PREFIX = 'trade:guard:';

/** Davet: trade:invite:{inviteId} */
export const TRADE_INVITE_REDIS_PREFIX = 'trade:invite:';

/** Taraf başına max unique item tipi (stack tek slot). */
export const TRADE_MAX_SLOTS = 6;

/** Idle / TTL — aktivitede yenilenir (ms). */
export const TRADE_TTL_MS = 10 * 60 * 1000;

/** Confirm aşaması soft iptal (ms). */
export const TRADE_CONFIRM_TTL_MS = 45_000;

/** Davet süresi (ms). */
export const TRADE_INVITE_TTL_MS = 60_000;

/** Ephemeral grid: 3 satır × 5 buton. */
export const TRADE_PANEL_PAGE_SIZE = 15;

/** Miktar preset butonları (Max / Özel ayrı). */
export const TRADE_QTY_PRESETS = [1, 5, 10] as const;

/** Pick panel Redis cache TTL (saniye). */
export const TRADE_PICK_CACHE_TTL_SEC = 300;

/** Redis: trade:pick:{sessionId}:{userId} */
export const TRADE_PICK_CACHE_PREFIX = 'trade:pick:';

/** Baykuş trade açık. */
export const TRADE_ALLOW_OWLS = true;
