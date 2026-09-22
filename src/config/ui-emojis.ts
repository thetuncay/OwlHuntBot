/**
 * UI ikonları — XP yıldızı (xpyildiz), para çantası (paracantasi).
 * Tüm bot çıktılarında COIN_EMOJI / XP_EMOJI kullanın.
 */
import { GAME_ENTITY_EMOJI_BY_NAME } from './game-entity-emoji-ids';
import { getLiveApplicationEmoji, isApplicationEmojiHydrated } from './emoji-runtime';

export const XP_EMOJI_NAME = 'xpyildiz';
export const COIN_EMOJI_NAME = 'paracantasi';

const DEFAULT_XP_ID = '1526675276505813042';
const DEFAULT_COIN_ID = '1526675277827149824';

function uiId(name: string, defaultId: string, envKey: string): string | undefined {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && /^\d+$/.test(fromEnv)) return fromEnv;
  const live = getLiveApplicationEmoji(name);
  if (live?.id) return live.id;
  if (isApplicationEmojiHydrated()) return undefined;
  return GAME_ENTITY_EMOJI_BY_NAME[name]?.id ?? defaultId;
}

export function renderXpEmoji(fallback = '✦'): string {
  if (isApplicationEmojiHydrated() && !getLiveApplicationEmoji(XP_EMOJI_NAME)) return fallback;
  const id = uiId(XP_EMOJI_NAME, DEFAULT_XP_ID, 'EMOJI_XP_YILDIZ');
  if (!id) return fallback;
  const prefix = getLiveApplicationEmoji(XP_EMOJI_NAME)?.animated ? 'a' : '';
  return `<${prefix}:${XP_EMOJI_NAME}:${id}>`;
}

export function renderCoinEmoji(fallback = '💰'): string {
  if (isApplicationEmojiHydrated() && !getLiveApplicationEmoji(COIN_EMOJI_NAME)) return fallback;
  const id = uiId(COIN_EMOJI_NAME, DEFAULT_COIN_ID, 'EMOJI_PARA_CANTASI');
  if (!id) return fallback;
  const prefix = getLiveApplicationEmoji(COIN_EMOJI_NAME)?.animated ? 'a' : '';
  return `<${prefix}:${COIN_EMOJI_NAME}:${id}>`;
}

export function discordXpEmoji(): { id: string; name: string; animated?: boolean } | undefined {
  const id = uiId(XP_EMOJI_NAME, DEFAULT_XP_ID, 'EMOJI_XP_YILDIZ');
  if (!id) return undefined;
  return { id, name: XP_EMOJI_NAME };
}

export function discordCoinEmoji(): { id: string; name: string; animated?: boolean } | undefined {
  const id = uiId(COIN_EMOJI_NAME, DEFAULT_COIN_ID, 'EMOJI_PARA_CANTASI');
  if (!id) return undefined;
  return { id, name: COIN_EMOJI_NAME };
}

function lazyMarkup(render: () => string): string {
  return {
    toString: render,
    valueOf: render,
    [Symbol.toPrimitive]: render,
    includes: (search: string) => render().includes(search),
  } as unknown as string;
}

/** Hydrate sonrası canlı application ID — `${XP_EMOJI}` her seferinde taze markup. */
export const XP_EMOJI = lazyMarkup(renderXpEmoji);
export const COIN_EMOJI = lazyMarkup(renderCoinEmoji);

export function refreshUiEmojis(): void {
  // lazy markup; hydrate sonrası ekstra kopya gerekmez
}

/** **XP: 123** — kalın, arka plan kutusu yok */
export function formatXpLabel(xp: number): string {
  const n = Math.trunc(xp);
  return `${XP_EMOJI} **XP: ${n.toLocaleString('tr-TR')}**`;
}

/** **Coin: 1.234** — kalın, arka plan kutusu yok */
export function formatCoinLabel(coin: number): string {
  const n = Math.trunc(coin);
  return `${COIN_EMOJI} **Coin: ${n.toLocaleString('tr-TR')}**`;
}

/** Hunt / ödül satırı: XP + Coin yan yana */
export function formatXpCoinPair(xp: number, coin: number, separator = '    '): string {
  return `${formatXpLabel(xp)}${separator}${formatCoinLabel(coin)}`;
}

function formatRangeValue(min: number, max: number): string {
  const a = Math.trunc(min).toLocaleString('tr-TR');
  const b = Math.trunc(max).toLocaleString('tr-TR');
  return min === max ? a : `${a}–${b}`;
}

/** Tahmin satırı: emoji **Coin: min–max** */
export function formatCoinRange(min: number, max: number): string {
  return `${COIN_EMOJI} **Coin: ${formatRangeValue(min, max)}**`;
}

/** Tahmin satırı: emoji **XP: min–max** */
export function formatXpRange(min: number, max: number): string {
  return `${XP_EMOJI} **XP: ${formatRangeValue(min, max)}**`;
}
