import type Redis from 'ioredis';
import type { CompressedHunt } from './hunt-ux';
import { MARKET_MIN_LEVEL } from '../config';

const DEFAULT_INVITE = 'https://discord.gg/5yQxgQDRHu';

const HINT_KEYS = {
  level5: 'discord:hint:lv5',
  market: 'discord:hint:market',
} as const;

export function getOfficialDiscordInviteUrl(): string {
  return process.env.OFFICIAL_DISCORD_INVITE_URL?.trim() || DEFAULT_INVITE;
}

export function buildRegistrationDiscordBlock(): string {
  const url = getOfficialDiscordInviteUrl();
  return [
    '',
    '💬 **Resmi topluluk**',
    `Duyurular, güncellemeler ve diğer avcılarla tanış: ${url}`,
  ].join('\n');
}

export function buildHelpDiscordFooter(): string {
  return `Resmi Discord: ${getOfficialDiscordInviteUrl()}`;
}

/** İlk kez gösterilecek kısa satır; redis ile tek seferlik. */
async function claimOneTimeHint(
  redis: Redis,
  userId: string,
  hint: keyof typeof HINT_KEYS,
): Promise<boolean> {
  const key = `${HINT_KEYS[hint]}:${userId}`;
  const result = await redis.set(key, '1', 'EX', 60 * 60 * 24 * 365, 'NX');
  return result === 'OK';
}

function buildLevel5HintLine(prefix: string): string {
  return [
    '',
    `🏛️ **Lv.${MARKET_MIN_LEVEL} — Baykuş Pazarı açıldı!** \`${prefix} market\``,
    `💬 Diğer avcılarla tanış: ${getOfficialDiscordInviteUrl()}`,
  ].join('\n');
}

function buildMarketFirstVisitHintLine(): string {
  return [
    '',
    `💬 **İpucu:** Resmi Discord'da duyurular ve pazar sohbeti var.`,
    getOfficialDiscordInviteUrl(),
  ].join('\n');
}

/** Hunt sonucuna Lv.5 milestone ipucu ekle (yılda bir kez). */
export async function maybeAppendLevel5DiscordHint(
  redis: Redis,
  userId: string,
  message: string,
  compressed: CompressedHunt,
  prefix: string,
): Promise<string> {
  const newLevel = compressed.levelUp?.newLevel;
  if (!newLevel || newLevel < MARKET_MIN_LEVEL) return message;

  const claimed = await claimOneTimeHint(redis, userId, 'level5');
  if (!claimed) return message;

  return message + buildLevel5HintLine(prefix);
}

/** Pazar ana sayfasına ilk ziyaret ipucu (yılda bir kez). */
export async function maybeAppendMarketDiscordHint(
  redis: Redis,
  userId: string,
  message: string,
): Promise<string> {
  const claimed = await claimOneTimeHint(redis, userId, 'market');
  if (!claimed) return message;
  return message + buildMarketFirstVisitHintLine();
}
