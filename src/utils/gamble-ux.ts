import { COIN_EMOJI, formatCoinLabel } from '../config/ui-emojis';

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
