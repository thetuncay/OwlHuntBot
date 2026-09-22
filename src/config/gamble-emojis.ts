/**
 * Kumar / slot animasyon emojileri — Discord application emoji ID'leri.
 */
import { GAMBLE_EMOJI_BY_NAME } from './gamble-emoji-ids';
import { getLiveApplicationEmoji, isApplicationEmojiHydrated } from './emoji-runtime';

export function renderGambleEmoji(name: string, fallback = '❓'): string {
  const live = getLiveApplicationEmoji(name);
  if (live?.id) {
    const tag = live.animated ? 'a' : '';
    return `<${tag}:${name}:${live.id}>`;
  }
  if (isApplicationEmojiHydrated()) return fallback;
  const entry = GAMBLE_EMOJI_BY_NAME[name];
  if (!entry?.id) return fallback;
  const tag = entry.animated ? 'a' : '';
  return `<${tag}:${entry.name}:${entry.id}>`;
}

/** Dönen slot makarası gif */
export function renderSlotsRollingEmoji(fallback = '🎰'): string {
  return renderGambleEmoji('SlotsRolling', fallback);
}

/** Yazı-tura dönen para gif */
export function renderCoinSpinEmoji(fallback = '🪙'): string {
  return renderGambleEmoji('CoinSpin', fallback);
}
