import { COIN_EMOJI, formatCoinLabel } from '../config/ui-emojis';
import { resultPipe } from './result-ux';

/** @deprecated COIN_EMOJI kullanın */
export const GAMBLE_COIN_EMOJI = COIN_EMOJI;

export function formatGambleAmount(amount: number): string {
  return formatCoinLabel(amount);
}

/** Gif kendi oynarken minimum süre bekle — edit sayısını 1'de tutar. */
export async function awaitMinGifSpin(startedAt: number, minMs: number): Promise<void> {
  const wait = minMs - (Date.now() - startedAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/**
 * `w kumar` — solo + PvP kumar kısa tanıtım.
 *
 * @param prefix Sunucu prefix
 */
export function buildKumarIntroMessage(prefix: string): string {
  const p = prefix.trim() || 'w';
  return [
    '🎲 Kumar',
    '',
    resultPipe(`Solo — \`${p} cf\` · \`${p} bj\` · \`${p} slot\` + miktar`),
    resultPipe(`PvP — aynı komut + \`@oyuncu\` + miktar`),
    resultPipe(`Bahisli düello — \`${p} duelbet @oyuncu\` + miktar`),
  ].join('\n');
}
