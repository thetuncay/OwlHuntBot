/**
 * gamble-stats-ux.ts — Kumar şeffaflık ekranı (M1).
 *
 * Oyuncunun kendi win/loss oranı + kazanma şansını etkileyen gerçek
 * değiştiriciler. Oran göstermek yeterli değil: oyuncu "neden" sorusunu
 * soracaksa cevabı da aynı ekranda olmalı.
 */

import { EmbedBuilder } from 'discord.js';
import { GAMBLE_COINFLIP_PAYOUT, GAMBLE_COINFLIP_WIN_CHANCE } from '../config';
import { formatCoinLabel } from '../config/ui-emojis';
import {
  winRatePercent,
  type GambleStatsSnapshot,
} from '../systems/gamble/gamble-stats';
import {
  STREAK_LOSS_THRESHOLD_LOW,
  STREAK_WIN_THRESHOLD_LOW,
  explainWinChance,
} from '../systems/gamble/win-chance-explain';
import { COLORS } from './theme';

const GAME_LABELS: Record<string, string> = {
  cf: '🪙 Coinflip',
  bj: '🃏 Gölge 21',
  slot: '🎰 Slot',
};

export interface GambleStatsViewInput {
  username: string;
  stats: GambleStatsSnapshot;
  /** Şans dökümü için anlık durum. */
  coins: number;
  streakWins: number;
  streakLosses: number;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function buildSummaryLines(stats: GambleStatsSnapshot): string[] {
  const rate = winRatePercent(stats);
  if (rate === null) return ['Henüz kumar oynamadın.'];

  return [
    `Oynanan **${stats.plays}** · Kazanç **${stats.wins}** · Kayıp **${stats.losses}**`,
    `Kazanma oranın **${rate.toFixed(1)}%**`,
    `Yatırılan ${formatCoinLabel(stats.wagered)} · Net **${formatSigned(stats.net)}**`,
  ];
}

function buildPerGameLines(stats: GambleStatsSnapshot): string[] {
  const lines: string[] = [];
  for (const [game, label] of Object.entries(GAME_LABELS)) {
    const entry = stats.byGame[game as keyof typeof stats.byGame];
    if (!entry || entry.plays === 0) continue;
    const rate = ((entry.wins / entry.plays) * 100).toFixed(0);
    lines.push(`${label} — ${entry.plays} el · ${rate}% kazanç`);
  }
  return lines.length > 0 ? lines : ['—'];
}

/**
 * Şansı etkileyen değiştiricileri satır satır açıklar.
 *
 * Sadece **aktif olan** değiştiriciler yazılır; sıfır olanı listelemek
 * gürültü olur (`no-ui-noise`).
 */
function buildChanceLines(input: GambleStatsViewInput): string[] {
  const breakdown = explainWinChance({
    baseChance: GAMBLE_COINFLIP_WIN_CHANCE,
    coins: input.coins,
    // Referans bahis: bakiyenin %1'i — bahis cezasının tipik etkisini gösterir.
    bet: Math.max(1, Math.floor(input.coins * 0.01)),
    streakWins: input.streakWins,
    streakLosses: input.streakLosses,
  });

  const lines = [`Coinflip temel şansı **${breakdown.base}%**`];

  if (breakdown.streakRelief > 0) {
    lines.push(
      `🛟 Kötü şans koruması **+${breakdown.streakRelief}** ` +
      `(${STREAK_LOSS_THRESHOLD_LOW}+ kayıp serisinde açılır)`,
    );
  }
  if (breakdown.streakDampener < 0) {
    lines.push(
      `📉 Kazanç serisi frenlemesi **${breakdown.streakDampener}** ` +
      `(${STREAK_WIN_THRESHOLD_LOW}+ kazanç serisinde)`,
    );
  }
  if (breakdown.richPenalty >= 0.5) {
    lines.push(`💰 Zenginlik dengesi **−${breakdown.richPenalty.toFixed(1)}**`);
  }
  lines.push('📈 Bahsin bakiyene oranı büyüdükçe şans biraz düşer.');
  // Temel şans × ödeme oranı = uzun vadede geri dönen miktar.
  const rtp = GAMBLE_COINFLIP_WIN_CHANCE * GAMBLE_COINFLIP_PAYOUT;
  lines.push(`🏦 Uzun vadede geri dönüş **${rtp.toFixed(1)}%** (${GAMBLE_COINFLIP_PAYOUT}× ödeme)`);

  return lines;
}

/**
 * Kumar istatistik + şeffaflık embed'i.
 *
 * @param input Oyuncu adı, sayaçlar ve anlık durum
 */
export function buildGambleStatsEmbed(input: GambleStatsViewInput): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`🎲 ${input.username} · Kumar Kaydı`)
    .setDescription(buildSummaryLines(input.stats).join('\n'))
    .addFields(
      { name: 'Oyun bazında', value: buildPerGameLines(input.stats).join('\n'), inline: false },
      { name: 'Şansını etkileyenler', value: buildChanceLines(input).join('\n'), inline: false },
    )
    .setFooter({ text: 'Sayaçlar takip başladığından beri tutulur.' });
}
