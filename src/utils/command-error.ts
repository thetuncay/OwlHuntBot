import { discordCountdownFromRemainingMs, discordRelativeTimestamp } from './discord-time';

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

/** OwO tarzi spam uyari mesaji — Discord relative timestamp ile geri sayim. */
export function buildSpamMuteMessage(displayName: string, secondsUntil: number): string {
  const when = discordRelativeTimestamp(secondsUntil);
  return `⏱️ | **${displayName}**, Lutfen yavasla~ Cok hizlisin :c Komutu tekrar dene ${when}`;
}

/** Tek seferlik cooldown — OwO stili canli geri sayim. Sadece Redis PTTL (ms) kullan. */
export function buildCooldownMessage(
  remainingMs: number,
  label = 'bu komutu kullanabilirsin',
): string {
  return `⏰ ${label} ${discordCountdownFromRemainingMs(remainingMs)}`;
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
