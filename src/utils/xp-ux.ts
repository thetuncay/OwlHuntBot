/**
 * xp-ux.ts — XP ilerleme çubuğu ve durum metinleri
 */
import { EmbedBuilder } from 'discord.js';
import { formatResultLevelLine } from './result-ux';
import { xpRequired } from './math';
import { COLORS, hpBar } from './theme';
import { resolveOwlLevelTier } from '../config/ui-tiers';

export interface XpProgressView {
  level: number;
  currentXp: number;
  requiredXp: number;
  remainingXp: number;
  percent: number;
}

export function getXpProgressView(level: number, currentXp: number): XpProgressView {
  const requiredXp = xpRequired(level);
  const safeXp = Math.max(0, currentXp);
  const remainingXp = Math.max(0, requiredXp - safeXp);
  const percent = requiredXp > 0 ? Math.min(100, Math.round((safeXp / requiredXp) * 100)) : 100;
  return { level, currentXp: safeXp, requiredXp, remainingXp, percent };
}

export function formatXpBar(level: number, currentXp: number, barLength = 12): string {
  const { requiredXp } = getXpProgressView(level, currentXp);
  return hpBar(currentXp, requiredXp, barLength);
}

/** XP kazanımı sonrası tek satır ilerleme (v2.0) */
export function formatXpGainProgressLine(
  _gainedXp: number,
  level: number,
  currentXp: number,
): string {
  return formatResultLevelLine(level, currentXp);
}

/** Mevcut XP durumu (w xp) */
export function formatXpStatusLine(level: number, currentXp: number): string {
  const { requiredXp, remainingXp, percent } = getXpProgressView(level, currentXp);
  const bar = formatXpBar(level, currentXp, 14);
  return (
    `Lv.**${level}** \`${bar}\` **${percent}%**\n` +
    `**${currentXp.toLocaleString('tr-TR')}** / **${requiredXp.toLocaleString('tr-TR')}** XP · ` +
    `sonraki seviyeye **${remainingXp.toLocaleString('tr-TR')}** XP`
  );
}

export function buildXpStatusEmbed(
  displayName: string,
  level: number,
  currentXp: number,
  totalXp?: number,
): EmbedBuilder {
  const view = getXpProgressView(level, currentXp);
  const tier = resolveOwlLevelTier(level);
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`✨ ${displayName} — XP Durumu`)
    .setDescription(formatXpStatusLine(level, currentXp))
    .addFields(
      { name: 'Seviye', value: `**${level}** · ${tier.emoji} ${tier.label}`, inline: true },
      { name: 'Mevcut XP', value: `**${view.currentXp.toLocaleString('tr-TR')}**`, inline: true },
      { name: 'Kalan', value: `**${view.remainingXp.toLocaleString('tr-TR')}** XP`, inline: true },
    );
  if (totalXp != null && totalXp > 0) {
    embed.addFields({
      name: 'Toplam XP',
      value: `**${totalXp.toLocaleString('tr-TR')}**`,
      inline: true,
    });
  }
  return embed;
}
