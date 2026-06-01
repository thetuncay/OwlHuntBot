import { discordRelativeTimestamp } from './discord-time';

export { UserFacingError } from './response-suppression';

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

const INTERNAL_PATTERNS = [
  /prisma/i,
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i,
  /Invalid `/,
  /Unique constraint|Foreign key/i,
  /Received one or more errors/i,
  /\n\s+at /,
];

export type CooldownAction =
  | 'hunt'
  | 'duel'
  | 'upgrade'
  | 'transfer'
  | 'slot'
  | 'soru'
  | 'switch'
  | 'coinflip'
  | 'blackjack'
  | 'pvp_gamble'
  | 'generic';

const RETRY_PHRASES: Record<CooldownAction, string> = {
  hunt: 'tekrar avlanabilirsin',
  duel: 'tekrar duel atabilirsin',
  upgrade: 'tekrar upgrade deneyebilirsin',
  transfer: 'tekrar transfer yapabilirsin',
  slot: 'tekrar slot oynayabilirsin',
  soru: 'tekrar soru sorabilirsin',
  switch: 'tekrar main baykuşunu değiştirebilirsin',
  coinflip: 'tekrar coinflip oynayabilirsin',
  blackjack: 'tekrar blackjack oynayabilirsin',
  pvp_gamble: 'tekrar PvP kumarı oynayabilirsin',
  generic: 'tekrar deneyebilirsin',
};

const SLOW_OPENERS: Record<CooldownAction, string[]> = {
  hunt: ['biraz yavaşla~', 'çok hızlı avlanıyorsun~', 'henüz dinlenmedim~'],
  duel: ['sakin ol biraz~', 'çok hızlısın~', 'biraz yavaşla~'],
  upgrade: ['acele etme~', 'biraz yavaşla~'],
  transfer: ['biraz yavaşla~', 'çok hızlı transfer ediyorsun~'],
  slot: ['sakin ol~', 'biraz yavaşla~'],
  soru: ['biraz yavaşla~', 'çok hızlı soru soruyorsun~'],
  switch: ['biraz bekle~', 'main değişimi için sakin ol~'],
  coinflip: ['sakin ol~', 'biraz yavaşla~'],
  blackjack: ['sakin ol~', 'biraz yavaşla~'],
  pvp_gamble: ['biraz yavaşla~', 'çok hızlısın~'],
  generic: ['biraz yavaşla~', 'çok hızlısın~'],
};

function pickSlowOpener(seed: string, action: CooldownAction): string {
  const lines = SLOW_OPENERS[action];
  const idx = Math.abs(seed.charCodeAt(0) + seed.length) % lines.length;
  return lines[idx] ?? lines[0] ?? 'biraz yavaşla~';
}

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

/** OwO tarzı spam uyarısı — Discord relative timestamp ile geri sayım. */
export function buildSpamMuteMessage(displayName: string, secondsUntil: number): string {
  const when = discordRelativeTimestamp(secondsUntil);
  return `⏱️ | **${displayName}**, lütfen yavaşla~ Çok hızlısın :c Komutu ${when} tekrar dene`;
}

/**
 * Cooldown mesajı — kullanıcı adı + yumuşak uyarı + kalan süre (düz metin, timestamp bug yok).
 */
export function buildCooldownMessage(
  remainingMs: number,
  action: CooldownAction | string = 'generic',
  displayName?: string,
  maxDisplayMs?: number,
): string {
  const safeMs = Math.max(1_000, Math.floor(remainingMs));
  const displayMs = maxDisplayMs ? Math.min(safeMs, maxDisplayMs) : safeMs;
  const duration = formatDurationForCooldown(displayMs);
  const retryPhrase = resolveRetryPhrase(action);
  const kind = resolveActionKind(action);

  if (displayName) {
    const opener = pickSlowOpener(displayName, kind);
    return `⏱️ | **${displayName}**, ${opener} ${duration} sonra ${retryPhrase} :c`;
  }

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
    msg.startsWith('⚠️')
  );
}

/** Beklenmeyen hatalari terminale yaz; kullaniciya gosterilecekleri kirletme. */
export function logCommandError(label: string, error: unknown): void {
  if (error instanceof SpamBlockedError && error.silent) return;
  if (shouldNotifyUserOnDiscord(error)) return;
  console.error(`[${label}]`, error);
}

export function userErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Islem tamamlanamadi.';
}
