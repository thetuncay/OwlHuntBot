/**
 * Görev tamamlanma bildirimleri — komut çıktılarına eklenir.
 */
import type { QuestCompletionNotice } from '../systems/daily-quests';
import { formatCoinLabel } from '../config/ui-emojis';
import { formatQuestNoticeLabel } from '../systems/daily-quests';

export function formatQuestCompletionLines(
  notices: QuestCompletionNotice[],
  prefix: string,
): string[] {
  if (notices.length === 0) return [];
  return notices.map(
    (n) =>
      `✅ **Görev tamam:** ${formatQuestNoticeLabel(n)} — \`${prefix} q\` ile ${formatCoinLabel(n.rewardCoins)} al`,
  );
}

export function appendQuestCompletionLines(
  content: string,
  notices: QuestCompletionNotice[],
  prefix: string,
): string {
  const lines = formatQuestCompletionLines(notices, prefix);
  if (lines.length === 0) return content;
  return `${content}\n\n${lines.join('\n')}`;
}

export function formatQuestReadyBanner(readyCount: number, prefix: string): string | null {
  if (readyCount <= 0) return null;
  return `🌟 **${readyCount} ödül hazır** — yeşil buton`;
}
