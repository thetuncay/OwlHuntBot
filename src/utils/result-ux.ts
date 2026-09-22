/**
 * result-ux.ts — OwlHunt v2.0 sonuç teması (Hunt / Duel / Kumar / Ödül)
 * ┃ pipe sütunu · düz metin · embed yok · hızlı okunur
 */

import { COIN_EMOJI, formatCoinLabel, formatXpCoinPair, XP_EMOJI } from '../config/ui-emojis';
import { chargeBar } from './theme';
import { getXpProgressView } from './xp-ux';

export const RESULT_COL = '┃';

export function resultPipe(text: string): string {
  return `${RESULT_COL} ${text}`;
}

export function formatSignedAmount(n: number): string {
  const v = Math.trunc(n);
  const abs = Math.abs(v).toLocaleString('tr-TR');
  return v >= 0 ? `+${abs}` : `-${abs}`;
}

/** ┃ ✦ +67 XP    💰 +130 Coin */
export function formatSignedRewardLine(xp: number, coin: number): string {
  return resultPipe(
    `${XP_EMOJI} ${formatSignedAmount(xp)} XP    ${COIN_EMOJI} ${formatSignedAmount(coin)} Coin`,
  );
}

/** ┃ 💰 +130 Coin */
export function formatSignedCoinLine(coin: number): string {
  return resultPipe(`${COIN_EMOJI} ${formatSignedAmount(coin)} Coin`);
}

/** Hunt tarzı mutlak ödül */
export function formatAbsoluteRewardLine(xp: number, coin: number): string {
  return resultPipe(formatXpCoinPair(xp, coin));
}

/** ┃ ⭐ Lv.12 ▰▰▰▰▰▰▰▱▱▱ 11.060 / 12.669 */
export function formatResultLevelLine(level: number, currentXp: number): string {
  const { requiredXp } = getXpProgressView(level, currentXp);
  const bar = chargeBar(currentXp, requiredXp, 10);
  return resultPipe(
    `⭐ Lv.${level} ${bar} ${currentXp.toLocaleString('tr-TR')} / ${requiredXp.toLocaleString('tr-TR')}`,
  );
}

export interface ResultStreakView {
  newStreak: number;
  oldStreak: number;
  streakCounted: boolean;
  xpBonusPct?: number;
  bonusCoins?: number;
}

/** ┃ 🔥 Streak ×2 (+1) — +10% XP · +40 coin */
export function formatResultStreakLine(streak: ResultStreakView): string | null {
  if (!streak.streakCounted || streak.newStreak < 1) return null;
  if (streak.newStreak <= streak.oldStreak) return null;
  let line = resultPipe(`🔥 Streak ×${streak.newStreak} (+1)`);
  if ((streak.xpBonusPct && streak.xpBonusPct > 0) || (streak.bonusCoins && streak.bonusCoins > 0)) {
    const bits: string[] = [];
    if (streak.xpBonusPct && streak.xpBonusPct > 0) bits.push(`+${streak.xpBonusPct}% XP`);
    if (streak.bonusCoins && streak.bonusCoins > 0) bits.push(`+${streak.bonusCoins} coin`);
    line += ` — ${bits.join(' · ')}`;
  }
  return line;
}

/** ┃ ⚔️ 4 Tur */
export function formatResultTurnsLine(turns: number): string {
  return resultPipe(`⚔️ ${turns} Tur`);
}

export interface RewardClaimView {
  headline: string;
  xp?: number;
  coin?: number;
  level?: number;
  currentXp?: number;
  sections?: { label: string; lines: string[] }[];
  extras?: string[];
  footer?: string;
}

/** Günlük ödül, görev, satış vb. */
export function buildRewardClaimMessage(view: RewardClaimView): string {
  const lines: string[] = [view.headline, ''];

  for (const section of view.sections ?? []) {
    lines.push(resultPipe(section.label));
    for (const line of section.lines) {
      lines.push(resultPipe(line));
    }
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const xp = view.xp ?? 0;
  const coin = view.coin ?? 0;
  if (xp !== 0 || coin !== 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    if (xp !== 0 && coin !== 0) {
      lines.push(formatAbsoluteRewardLine(xp, coin));
    } else if (coin !== 0) {
      lines.push(resultPipe(formatCoinLabel(coin)));
    } else {
      lines.push(resultPipe(`${XP_EMOJI} ${formatSignedAmount(xp)} XP`));
    }
  }

  if (view.level != null && view.currentXp != null) {
    lines.push(formatResultLevelLine(view.level, view.currentXp));
  }

  for (const extra of view.extras ?? []) {
    lines.push(extra.startsWith(RESULT_COL) ? extra : resultPipe(extra));
  }

  if (view.footer) {
    lines.push('', view.footer);
  }

  return lines.join('\n');
}

export type BlackjackOutcome =
  | 'blackjack'
  | 'win'
  | 'dealer_bust'
  | 'lose'
  | 'bust'
  | 'tie';

const BJ_OUTCOME_LABEL: Record<BlackjackOutcome, string> = {
  blackjack: 'Blackjack',
  win: 'Kazandın',
  dealer_bust: 'Kazandın',
  lose: 'Kaybettin',
  bust: 'Bust',
  tie: 'Berabere',
};

/** Blackjack el sonu — buildScreen note alanı */
export function buildBlackjackResultNote(
  outcome: BlackjackOutcome,
  deltaCoins: number,
  finalCoins?: number,
): string {
  const lines: string[] = [
    '',
    resultPipe('🎯 Sonuç'),
    resultPipe(BJ_OUTCOME_LABEL[outcome]),
    '',
    formatSignedCoinLine(deltaCoins),
  ];
  if (finalCoins != null) {
    lines.push(resultPipe(`🏦 ${formatCoinLabel(finalCoins)}`));
  }
  return lines.join('\n');
}

/** PvP kumar — kazanan odaklı kısa sonuç */
export function buildPvpWinResultMessage(params: {
  winnerName: string;
  loserName: string;
  coinDelta: number;
  detailLines?: string[];
  extras?: string[];
}): string {
  const lines = [
    `🏆 ${params.winnerName} kazandı.`,
    '',
    resultPipe('⚔️ Rakip'),
    resultPipe(`☠️ ${params.loserName}`),
    '',
  ];
  if (params.detailLines?.length) {
    for (const d of params.detailLines) lines.push(resultPipe(d));
    lines.push('');
  }
  lines.push(formatSignedCoinLine(params.coinDelta));
  for (const extra of params.extras ?? []) {
    lines.push(extra.startsWith(RESULT_COL) ? extra : resultPipe(extra));
  }
  return lines.join('\n');
}
