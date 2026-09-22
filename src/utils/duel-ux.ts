/**
 * duel-ux.ts — Düello sonuç mesajı (v2.0)
 * Ortak tema: result-ux.ts
 */

import {
  buildPvpWinResultMessage,
  formatResultLevelLine,
  formatResultStreakLine,
  formatResultTurnsLine,
  formatSignedRewardLine,
  type ResultStreakView,
} from './result-ux';

export type { ResultStreakView as DuelStreakView };

export interface DuelResultView {
  winnerName: string;
  loserName: string;
  xpGained: number;
  coinsGained: number;
  level: number;
  currentXp: number;
  totalTurns: number;
  streak?: ResultStreakView;
}

export {
  formatSignedRewardLine as formatDuelRewardLine,
  formatResultLevelLine as formatDuelLevelLine,
  formatResultStreakLine as formatDuelStreakLine,
  formatResultTurnsLine as formatDuelTurnsLine,
};

/**
 * Kart görseli rakibi, HP'yi, statları ve tur sayısını zaten gösterdiği için
 * sonuç mesajı tek satırdır. Ödül/seviye dökümü bilinçli olarak gösterilmez.
 */
export function buildDuelResultMessage(view: DuelResultView): string {
  return `🏆 **${view.winnerName}** düelloyu kazandı.`;
}

export { buildPvpWinResultMessage };
