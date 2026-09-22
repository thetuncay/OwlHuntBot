import { UserFacingError } from './response-suppression';

export { UserFacingError };

/** Spam susturmasi — silent=true iken Discord'a yanit yok, komut islenmez. */
export class SpamBlockedError extends Error {
  constructor(
    message: string,
    readonly silent: boolean,
  ) {
    super(message);
    this.name = 'SpamBlockedError';
  }
}

export const GENERIC_USER_ERROR = 'Şuan bazı **problemlerim** var :< biraz bekler misin?';

const INTERNAL_PATTERNS = [
  /prisma/i,
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i,
  /Invalid `/,
  /Unique constraint|Foreign key/i,
  /Received one or more errors/i,
  /\n\s+at /,
  /lock timeout|LockContention|Race condition/i,
  /redis/i,
  /ioredis/i,
  /NX.*lock/i,
];

export type CooldownAction =
  | 'hunt'
  | 'duel'
  | 'upgrade'
  | 'transfer'
  | 'slot'
  | 'switch'
  | 'blackjack'
  | 'coinflip'
  | 'pvp_gamble'
  | 'generic';

const RETRY_PHRASES: Record<CooldownAction, string> = {
  hunt: 'tekrar avlanabilirsin',
  duel: 'tekrar duel atabilirsin',
  upgrade: 'tekrar upgrade deneyebilirsin',
  transfer: 'tekrar transfer yapabilirsin',
  slot: 'tekrar slot oynayabilirsin',
  switch: 'tekrar main baykuşunu değiştirebilirsin',
  blackjack: 'tekrar blackjack oynayabilirsin',
  coinflip: 'tekrar coinflip oynayabiliriz',
  pvp_gamble: 'tekrar PvP kumar oynayabiliriz',
  generic: 'tekrar deneyebilirsin',
};

const COOLDOWN_BODY: Record<CooldownAction, string> = {
  hunt: '{duration} sonra tekrar avlanabiliriz :<',
  duel: '{duration} sonra tekrar duel atabiliriz :<',
  upgrade: '{duration} sonra tekrar upgrade deneyebiliriz :<',
  transfer: '{duration} sonra tekrar transfer yapabiliriz :<',
  slot: '{duration} sonra tekrar slot oynayabiliriz :<',
  switch: '{duration} sonra main baykuşunu değiştirebilirsin :<',
  blackjack: '{duration} sonra tekrar blackjack oynayabiliriz :<',
  coinflip: '{duration} sonra tekrar coinflip oynayabiliriz :<',
  pvp_gamble: '{duration} sonra tekrar PvP kumar oynayabiliriz :<',
  generic: '{duration} sonra tekrar deneyebilirsin :<',
};

function resolveRetryPhrase(action: CooldownAction | string): string {
  if (action in RETRY_PHRASES) {
    return RETRY_PHRASES[action as CooldownAction];
  }
  const trimmed = action.trim();
  if (/^tekrar /iu.test(trimmed)) {
    return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  }
  if (/^Tekrar /u.test(trimmed)) {
    return `tekrar ${trimmed.slice(7).charAt(0).toLowerCase()}${trimmed.slice(8)}`;
  }
  return `tekrar ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

function resolveActionKind(action: CooldownAction | string): CooldownAction {
  if (action in RETRY_PHRASES) return action as CooldownAction;
  return 'generic';
}

/**
 * Spam susturma mesaji — duz metin sure (Discord <t:R> ms/saniye karisinca "8 saat" gosteriyordu).
 * @param muteSeconds Kalan susturma (saniye). redis.ttl() veya SPAM_MUTE_SECONDS; ms gecirme.
 */
export function buildSpamMuteMessage(displayName: string, muteSeconds: number): string {
  const sec = coerceMuteSeconds(muteSeconds);
  const duration = formatDurationForCooldown(sec * 1000);
  return `⏱️ | **${displayName}**, lütfen yavaşla Çok hızlısın :<  ${duration} bir daha dene lütfen..`;
}

/** Saniye beklenir; 600+ degerler genelde yanlislikla ms (15000 → 15 sn). */
export function coerceMuteSeconds(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 15;
  let sec = Math.ceil(raw);
  if (sec > 600) sec = Math.ceil(sec / 1000);
  return Math.min(Math.max(1, sec), 600);
}

/** Aynı komut hâlâ işlenirken kısa geri bildirim. */
export function buildInflightBusyMessage(displayName?: string): string {
  const name = displayName?.trim() || 'Sen';
  return `⏱️ | **${name}**, bu komut hâlâ çalışıyor biraz bekler misin :<`;
}

export function buildCooldownMessage(
  remainingMs: number,
  action: CooldownAction | string = 'generic',
  displayName?: string,
  maxDisplayMs?: number,
): string {
  const safeMs = Math.max(1_000, Math.floor(remainingMs));
  const displayMs = maxDisplayMs ? Math.min(safeMs, maxDisplayMs) : safeMs;
  const duration = formatDurationForCooldown(displayMs);
  const kind = resolveActionKind(action);

  if (displayName) {
    const template = COOLDOWN_BODY[kind] ?? COOLDOWN_BODY.generic;
    return `⏱️ | **${displayName}**, ${template.replace('{duration}', duration)}`;
  }

  const retryPhrase = resolveRetryPhrase(action);
  return `⏱️ | ${duration} sonra ${retryPhrase}.`;
}

function formatDurationForCooldown(remainingMs: number): string {
  const totalSec = Math.max(1, Math.ceil(remainingMs / 1000));
  if (totalSec < 60) return `**${totalSec} saniye**`;
  const totalMin = Math.ceil(totalSec / 60);
  if (totalMin < 60) return `**${totalMin} dakika**`;
  const totalHour = Math.ceil(totalMin / 60);
  return `**${totalHour} saat**`;
}

/** Kullaniciya Discord'da gosterilecek beklenen mesajlar (oyun kurallari, cooldown, spam). */
export function shouldNotifyUserOnDiscord(error: unknown): boolean {
  if (error instanceof SpamBlockedError) return !error.silent;
  if (error instanceof UserFacingError) return true;
  if (!(error instanceof Error)) return false;

  const msg = error.message;
  if (INTERNAL_PATTERNS.some((p) => p.test(msg))) return false;

  return (
    msg.includes('yoğun') ||
    msg.includes('yoğunluk') ||
    msg.includes('beklemelisin') ||
    msg.includes('Tekrar avlanmak') ||
    msg.includes('yavaşla') ||
    msg.includes('yavasla') ||
    msg.includes('Yetersiz') ||
    msg.includes('bulunamadi') ||
    msg.includes('bulunamadı') ||
    msg.includes('Gecersiz') ||
    msg.includes('Geçersiz') ||
    msg.includes('yasak') ||
    msg.includes('devam ederken') ||
    msg.includes('zaten') ||
    msg.includes('Aktif') ||
    msg.includes('⏰') ||
    msg.includes('⏱️') ||
    msg.includes('Main bayku') ||
    msg.includes('Oyuncu bulunamadi') ||
    msg.includes('Bilinmeyen alt komut') ||
    msg.includes('Gerekli:') ||
    msg.includes('HP %30') ||
    msg.includes('Kendinle') ||
    msg.includes('biyom') ||
    msg.includes('Transfer') ||
    msg.includes('Yetki') ||
    msg.includes('Prefix') ||
    msg.includes('Kullanım') ||
    msg.includes('Kullanim') ||
    msg.includes('Usage:') ||
    msg.includes('Komut eksik') ||
    msg.includes('oyun komutları yalnızca') ||
    msg.startsWith('🦉') ||
    msg.startsWith('⚠️')
  );
}

/** Beklenmeyen hatalari terminale yaz; kullaniciya gosterilecekleri kirletme. */
export function logCommandError(label: string, error: unknown): void {
  if (error instanceof SpamBlockedError && error.silent) return;
  if (shouldNotifyUserOnDiscord(error)) return;
  console.error(`[${label}]`, error);
}

export function buildGenericUserError(displayName?: string | null): string {
  const name = displayName?.trim();
  if (name) return `@${name} ${GENERIC_USER_ERROR}`;
  return GENERIC_USER_ERROR;
}

export function userErrorMessage(error: unknown, displayName?: string | null): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof Error) {
    if (INTERNAL_PATTERNS.some((p) => p.test(error.message))) {
      return buildGenericUserError(displayName);
    }
    if (shouldNotifyUserOnDiscord(error)) return error.message;
    return buildGenericUserError(displayName);
  }
  return buildGenericUserError(displayName);
}
