/**
 * Tekrarlayan kullanici hatalarinda Discord yanitini bastirir.
 * Ilk gosterim serbest; ayni kullanici + guild + key icinde tekrarlar sessiz.
 * Hot path: yalnizca bellek, Redis/DB yok.
 *
 * TODO(cross-worker): PM2 cok worker'da suppression process-local kalir;
 * worker'lar arasi tutarlilik icin Redis-backed suppression ayri issue'da ele alinmali.
 * Bkz. docs/TODO-cross-worker-suppression.md
 */
import {
  COMMAND_INFLIGHT_TTL_MS,
  FLOW_SUPPRESSION_MIN_INTERVAL_MS,
  RESPONSE_SUPPRESSION_MAX_ENTRIES,
  RESPONSE_SUPPRESSION_TTL_MS,
} from '../config';

export type ResponseSuppressionScope = {
  userId: string;
  guildId?: string | null;
  key: string;
  /** Varsayilan: RESPONSE_SUPPRESSION_TTL_MS */
  ttlMs?: number;
};

type Entry = { expiresAtMs: number; lastShownAtMs?: number };

const entries = new Map<string, Entry>();
const inFlightEntries = new Map<string, Entry>();

/** Intent egitim mesajlari suppression'dan muaf. */
export function isIntentExemptKey(key: string): boolean {
  return key.startsWith('intent:') || key.startsWith('flow:hint:');
}

function scopeKey(scope: ResponseSuppressionScope): string {
  const guild = scope.guildId ?? 'dm';
  return `${scope.userId}:${guild}:${scope.key}`;
}

function nowMs(): number {
  return Date.now();
}

/** true = yanit gonderilebilir; false = min aralik icinde tekrar gosterilmez. */
export function acquireUserResponse(scope: ResponseSuppressionScope): boolean {
  if (isIntentExemptKey(scope.key)) return true;

  const ttl = scope.ttlMs ?? RESPONSE_SUPPRESSION_TTL_MS;
  const minInterval = Math.min(ttl, FLOW_SUPPRESSION_MIN_INTERVAL_MS);
  const key = scopeKey(scope);
  const now = nowMs();
  const existing = entries.get(key);
  if (existing) {
    const sinceLast = now - (existing.lastShownAtMs ?? 0);
    if (sinceLast < minInterval) {
      return false;
    }
  }
  entries.set(key, { expiresAtMs: now + ttl, lastShownAtMs: now });
  if (entries.size > RESPONSE_SUPPRESSION_MAX_ENTRIES) {
    sweepResponseSuppression();
  }
  return true;
}

/** Bastirma aktif mi (yanit gonderme). */
export function isResponseSuppressed(scope: ResponseSuppressionScope): boolean {
  const key = scopeKey(scope);
  const existing = entries.get(key);
  return Boolean(existing && existing.expiresAtMs > nowMs());
}

export function sweepResponseSuppression(): number {
  const now = nowMs();
  let removed = 0;
  for (const [k, v] of entries) {
    if (v.expiresAtMs <= now) {
      entries.delete(k);
      removed++;
    }
  }
  for (const [k, v] of inFlightEntries) {
    if (v.expiresAtMs <= now) {
      inFlightEntries.delete(k);
      removed++;
    }
  }
  if (entries.size > RESPONSE_SUPPRESSION_MAX_ENTRIES) {
    const overflow = entries.size - RESPONSE_SUPPRESSION_MAX_ENTRIES;
    const keys = entries.keys();
    for (let i = 0; i < overflow; i++) {
      const next = keys.next();
      if (next.done) break;
      entries.delete(next.value);
      removed++;
    }
  }
  return removed;
}

export function responseSuppressionCacheSize(): number {
  return entries.size + inFlightEntries.size;
}

/**
 * Eşzamanlı aynı komut yürütmelerini engeller.
 * true: kilit alındı, komut çalışabilir
 * false: aynı kullanıcı+key için aktif çalışma var, sessiz bastır
 */
export function acquireInFlightAction(scope: ResponseSuppressionScope): boolean {
  const ttl = scope.ttlMs ?? COMMAND_INFLIGHT_TTL_MS;
  const key = scopeKey(scope);
  const now = nowMs();
  const existing = inFlightEntries.get(key);
  if (existing && existing.expiresAtMs > now) return false;
  inFlightEntries.set(key, { expiresAtMs: now + ttl });
  return true;
}

export function releaseInFlightAction(scope: Pick<ResponseSuppressionScope, 'userId' | 'guildId' | 'key'>): void {
  inFlightEntries.delete(scopeKey(scope));
}

const USER_COMMAND_BUSY_KEY = 'user:command-busy';
/** Aktif komut bitene kadar baska komut (farkli slash/prefix dahil) engellenir. */
export const USER_COMMAND_BUSY_TTL_MS = 60_000;

export function acquireUserCommandBusy(scope: Pick<ResponseSuppressionScope, 'userId' | 'guildId'>): boolean {
  return acquireInFlightAction({
    userId: scope.userId,
    guildId: scope.guildId,
    key: USER_COMMAND_BUSY_KEY,
    ttlMs: USER_COMMAND_BUSY_TTL_MS,
  });
}

export function releaseUserCommandBusy(scope: Pick<ResponseSuppressionScope, 'userId' | 'guildId'>): void {
  releaseInFlightAction({
    userId: scope.userId,
    guildId: scope.guildId,
    key: USER_COMMAND_BUSY_KEY,
  });
}

// ─── Key builders ─────────────────────────────────────────────────────────────

export const SuppressionKeys = {
  usage: (command: string, variant?: string) =>
    variant ? `usage:${command}:${variant}` : `usage:${command}`,
  cooldown: (kind: string) => `cooldown:${kind}`,
  economy: (kind: string) => `economy:${kind}`,
  pvp: (kind: string) => `pvp:${kind}`,
  permission: (action: string) => `permission:${action}`,
  market: (kind: string) => `market:${kind}`,
  inventory: (kind: string) => `inventory:${kind}`,
  interaction: (kind: string) => `interaction:${kind}`,
  state: (kind: string) => `state:${kind}`,
  userCommandBusy: () => USER_COMMAND_BUSY_KEY,
  error: (bucket: string) => `err:${bucket}`,
} as const;

function normalizeForBucket(text: string): string {
  return text
    .toLowerCase()
    .replace(/<@!?\d+>/g, '@user')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<t:\d+:[A-Za-z]>/g, '<t>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function hashBucket(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/** Hata metninden stabil bastirma anahtari (catch bloklari icin). */
export function deriveSuppressionKeyFromError(error: unknown): string {
  if (error instanceof UserFacingError) {
    return error.suppressionKey;
  }
  if (!(error instanceof Error)) {
    return SuppressionKeys.error('generic');
  }

  const m = error.message;
  const norm = normalizeForBucket(m);

  if (/kullan[iı]m|usage:/i.test(m)) {
    const cmd =
      m.match(/owl\s+(\w+)/i)?.[1]
      ?? m.match(/`([^`\s]+)/)?.[1]?.replace(/[^a-z0-9_-]/gi, '')
      ?? 'generic';
    return SuppressionKeys.usage(cmd.toLowerCase(), 'help');
  }
  if (m.includes('⏰') || m.includes('⏱️') || /yava[sş]la/i.test(m) || /tekrar .+ (kullan|oyna|avlan|duel|deneyebilir)/i.test(m)) {
    return SuppressionKeys.cooldown(hashBucket(norm));
  }
  if (/yetersiz/i.test(m)) return SuppressionKeys.economy('insufficient');
  if (/geçersiz|gecersiz/i.test(m)) return SuppressionKeys.error(`invalid:${hashBucket(norm)}`);
  if (/zaten/i.test(m)) return SuppressionKeys.state(hashBucket(norm));
  if (/bulunamad/i.test(m)) return SuppressionKeys.error(`notfound:${hashBucket(norm)}`);
  if (/yetki|yönetici|yonetici/i.test(m)) return SuppressionKeys.permission('admin');
  if (/main bayku/i.test(m)) return SuppressionKeys.pvp('no-main');
  if (/hp %30/i.test(m)) return SuppressionKeys.pvp('hp-low');
  if (/kendinle|kendine meydan/i.test(m)) return SuppressionKeys.pvp('self-target');
  if (/aktif bir pvp/i.test(m)) return SuppressionKeys.pvp('already-active');
  if (/bilinmeyen alt komut/i.test(m)) return SuppressionKeys.usage('unknown');
  if (/spam|yavasla/i.test(m)) return SuppressionKeys.error('spam-mute');

  return SuppressionKeys.error(hashBucket(norm));
}

/** Bilinçli bastirma anahtari ile firlatilan kullanici hatalari. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly suppressionKey: string,
  ) {
    super(message);
    this.name = 'UserFacingError';
  }
}
