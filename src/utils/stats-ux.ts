/**
 * stats-ux.ts — Owl Stats RPG Panel Builder
 * Sadece görsel katman. Hiçbir oyun lojiğine dokunmaz.
 */

import { EmbedBuilder } from 'discord.js';
import { bondBonus, staminaMax, statEffect } from './math';
import { HUNT_CRITICAL_RATE, HUNT_INJURY_RATE, OWL_SPECIES } from '../config';
import { COLORS, hpBar, QUALITY_BADGE, QUALITY_COLOR, TIER_LABEL } from './theme';

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

/** Stat değerini 8 segmentlik görsel bar olarak gösterir (max 100 kabul). */
function statBar(value: number): string {
  return `\`${hpBar(Math.min(value, 100), 100, 8)}\``;
}

/** En yüksek stat key'ini döndürür. */
function topStat(stats: Record<string, number>): string {
  return Object.entries(stats).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

// ─── Veri tipi ───────────────────────────────────────────────────────────────
export interface OwlStatsData {
  species:    string;
  tier:       number;
  quality:    string;
  hp:         number;
  hpMax:      number;
  staminaCur: number;
  statGaga:   number;
  statGoz:    number;
  statKulak:  number;
  statKanat:  number;
  statPence:  number;
  bond:       number;
  isMain:     boolean;
}

export interface PlayerStatsData {
  level:       number;
  huntStreak?: number; // opsiyonel — varsa gösterilir
  prestigeLevel?: number;
}

// ─── Ana builder ─────────────────────────────────────────────────────────────
export function buildOwlStatsEmbed(
  owl: OwlStatsData,
  player: PlayerStatsData,
  deep = false,
): EmbedBuilder {
  const staminaMaxVal = Math.round(staminaMax(owl.statKanat));
  const hpRatio       = owl.hpMax > 0 ? owl.hp / owl.hpMax : 0;
  const isLowHp       = hpRatio < 0.3;
  const isRare        = owl.quality === 'Elite' || owl.quality === 'God Roll';

  const qualityBadge = QUALITY_BADGE[owl.quality] ?? QUALITY_BADGE['Common']!;
  const qualityColor = QUALITY_COLOR[owl.quality] ?? QUALITY_COLOR['Common']!;
  const embedColor   = isLowHp ? COLORS.WARNING : qualityColor;

  // Derived stats
  const prestige = player.prestigeLevel || 0;
  const power   = Math.round(statEffect(owl.statGaga, prestige) + statEffect(owl.statPence, prestige));
  const sight   = Math.round(statEffect(owl.statGoz, prestige)  + statEffect(owl.statKulak, prestige));
  const speed   = Math.round(statEffect(owl.statKanat, prestige));
  const bondPct = bondBonus(owl.bond).toFixed(1);

  // En yüksek stat tespiti
  const rawStats: Record<string, number> = {
    gaga: owl.statGaga, goz: owl.statGoz,
    kulak: owl.statKulak, kanat: owl.statKanat, pence: owl.statPence,
  };
  const best = topStat(rawStats);

  // Tier bilgisi
  const tierLabel = TIER_LABEL[owl.tier] ?? `T${owl.tier}`;

  // ── Header ──────────────────────────────────────────────────────────────────
  const mainBadge = owl.isMain ? ' ★ MAIN' : '';
  const rareBadge = isRare ? ' ✨' : '';
  const warnBadge = isLowHp ? ' ⚠️' : '';

  const title = `🦉 ${owl.species}${rareBadge}${warnBadge}${mainBadge}`;
  const desc  =
    `> ${qualityBadge} ${owl.quality}  ·  ${tierLabel}  ·  Oyuncu Lv.**${player.level}**\n` +
    (isLowHp ? '> ⚠️ **HP kritik seviyede! Avlanmadan önce iyileştir.**\n' : '');

  // ── HP / Stamina ─────────────────────────────────────────────────────────────
  const hpBarStr   = `\`${hpBar(owl.hp, owl.hpMax)}\``;
  const stamBarStr = `\`${hpBar(owl.staminaCur, staminaMaxVal)}\``;
  const survival =
    `❤️ HP     ${hpBarStr} **${owl.hp}** / ${owl.hpMax}\n` +
    `⚡ Stamina ${stamBarStr} **${owl.staminaCur}** / ${staminaMaxVal}`;

  // ── Combat stats ─────────────────────────────────────────────────────────────
  const gagaLine  = `🦷 Gaga  ${statBar(owl.statGaga)}  **${owl.statGaga}**${best === 'gaga'  ? ' ▲' : ''}`;
  const penceLine = `🦅 Pence ${statBar(owl.statPence)} **${owl.statPence}**${best === 'pence' ? ' ▲' : ''}`;

  // ── Awareness stats ───────────────────────────────────────────────────────────
  const gozLine   = `👁️ Göz   ${statBar(owl.statGoz)}   **${owl.statGoz}**${best === 'goz'   ? ' ▲' : ''}`;
  const kulakLine = `👂 Kulak ${statBar(owl.statKulak)} **${owl.statKulak}**${best === 'kulak' ? ' ▲' : ''}`;

  // ── Mobility stat ─────────────────────────────────────────────────────────────
  const kanatLine = `🪽 Kanat ${statBar(owl.statKanat)} **${owl.statKanat}**${best === 'kanat' ? ' ▲' : ''}`;

  // ── Performance ──────────────────────────────────────────────────────────────
  const performance =
    `⚔️ Güç Skoru   **${power}**\n` +
    `🔍 Farkındalık **${sight}**\n` +
    `💨 Hız Skoru   **${speed}**\n` +
    `💞 Bond Bonus  **+${bondPct}%**`;

  // ── Special ──────────────────────────────────────────────────────────────────
  const special =
    `🎯 Kritik Şansı  **${HUNT_CRITICAL_RATE}%**\n` +
    `🩹 Yaralanma     **${HUNT_INJURY_RATE}%**\n` +
    `✨ Kalite         ${qualityBadge} ${owl.quality}`;

  // ── Footer ───────────────────────────────────────────────────────────────────
  const streakText = player.huntStreak != null && player.huntStreak > 0
    ? `🔥 Streak: ${player.huntStreak}  ·  `
    : '';
  const footerText = `${streakText}▲ = En yüksek stat  ·  deep modu için: stats deep`;

  // ── Embed ────────────────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(title)
    .setDescription(desc)
    .addFields(
      {
        name: '❤️ Hayatta Kalma',
        value: survival,
        inline: false,
      },
      {
        name: '⚔️ Saldırı',
        value: `${gagaLine}\n${penceLine}`,
        inline: true,
      },
      {
        name: '🔍 Farkındalık',
        value: `${gozLine}\n${kulakLine}`,
        inline: true,
      },
      {
        name: '💨 Hareket',
        value: kanatLine,
        inline: true,
      },
      {
        name: '📈 Performans',
        value: performance,
        inline: true,
      },
      {
        name: '🎲 Özel',
        value: special,
        inline: true,
      },
    )
    .setFooter({ text: footerText });

  // ── Deep mode ────────────────────────────────────────────────────────────────
  if (deep) {
    const breakdown =
      `🦷 Gaga  softcap: **${statEffect(owl.statGaga, prestige).toFixed(2)}**\n` +
      `🦅 Pence softcap: **${statEffect(owl.statPence, prestige).toFixed(2)}**\n` +
      `👁️ Göz   softcap: **${statEffect(owl.statGoz, prestige).toFixed(2)}**\n` +
      `👂 Kulak softcap: **${statEffect(owl.statKulak, prestige).toFixed(2)}**\n` +
      `🪽 Kanat softcap: **${statEffect(owl.statKanat, prestige).toFixed(2)}**\n` +
      `🌟 Prestige:      **+${prestige * 2} stat cap**\n` +
      `🌟 Prestige XP:   **+${prestige * 5}%**\n` +
      `💞 Bond bonus:    **+${bondBonus(owl.bond).toFixed(2)} puan**`;

    embed.addFields({
      name: '🔬 Formül Kırılımı',
      value: breakdown,
      inline: false,
    });
  }

  return embed;
}
