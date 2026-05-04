/**
 * stats-ux.ts — Owl Stats RPG Panel Builder
 * Sadece görsel katman. Hiçbir oyun lojiğine dokunmaz.
 */

import { EmbedBuilder } from 'discord.js';
import { bondBonus, staminaMax, statEffect } from './math';
import { HUNT_CRITICAL_RATE, HUNT_INJURY_RATE, OWL_SPECIES } from '../config';

// ─── Renkler ─────────────────────────────────────────────────────────────────
const COLOR_NORMAL  = 0x5865f2; // blurple
const COLOR_WARNING = 0xe67e22; // turuncu — düşük HP
const COLOR_ELITE   = 0xf1c40f; // altın — Elite/God Roll

// ─── Kalite meta ─────────────────────────────────────────────────────────────
const QUALITY_META: Record<string, { badge: string; color: number }> = {
  'Trash':    { badge: '⬛ Trash',    color: COLOR_NORMAL  },
  'Common':   { badge: '⬜ Common',   color: COLOR_NORMAL  },
  'Good':     { badge: '🟩 Good',     color: COLOR_NORMAL  },
  'Rare':     { badge: '🟦 Rare',     color: COLOR_NORMAL  },
  'Elite':    { badge: '🟨 Elite',    color: COLOR_ELITE   },
  'God Roll': { badge: '🌟 God Roll', color: COLOR_ELITE   },
};

// ─── Tier etiketi ─────────────────────────────────────────────────────────────
const TIER_LABEL: Record<number, string> = {
  1: 'T1 ◆◆◆◆◆◆◆◆',
  2: 'T2 ◆◆◆◆◆◆◆◇',
  3: 'T3 ◆◆◆◆◆◆◇◇',
  4: 'T4 ◆◆◆◆◆◇◇◇',
  5: 'T5 ◆◆◆◆◇◇◇◇',
  6: 'T6 ◆◆◆◇◇◇◇◇',
  7: 'T7 ◆◆◇◇◇◇◇◇',
  8: 'T8 ◆◇◇◇◇◇◇◇',
};

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

/** 10 segmentli progress bar. */
function bar(current: number, max: number, length = 10): string {
  const ratio  = max > 0 ? Math.min(current / max, 1) : 0;
  const filled = Math.round(ratio * length);
  const empty  = length - filled;
  return `\`${'█'.repeat(filled)}${'░'.repeat(empty)}\``;
}

/** Stat değerini 10 üzerinden görsel bar olarak gösterir (max 100 kabul). */
function statBar(value: number): string {
  return bar(Math.min(value, 100), 100, 8);
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

  const qualityMeta = QUALITY_META[owl.quality] ?? QUALITY_META.Common!;
  const embedColor  = isLowHp ? COLOR_WARNING : qualityMeta.color;

  // Derived stats
  const power   = Math.round(statEffect(owl.statGaga) + statEffect(owl.statPence));
  const sight   = Math.round(statEffect(owl.statGoz)  + statEffect(owl.statKulak));
  const speed   = Math.round(statEffect(owl.statKanat));
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
    `> ${qualityMeta.badge}  ·  ${tierLabel}  ·  Oyuncu Lv.**${player.level}**\n` +
    (isLowHp ? '> ⚠️ **HP kritik seviyede! Avlanmadan önce iyileştir.**\n' : '');

  // ── HP / Stamina ─────────────────────────────────────────────────────────────
  const hpBar   = bar(owl.hp, owl.hpMax);
  const stamBar = bar(owl.staminaCur, staminaMaxVal);
  const survival =
    `❤️ HP     ${hpBar} **${owl.hp}** / ${owl.hpMax}\n` +
    `⚡ Stamina ${stamBar} **${owl.staminaCur}** / ${staminaMaxVal}`;

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
    `✨ Kalite         ${qualityMeta.badge}`;

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
      `🦷 Gaga  softcap: **${statEffect(owl.statGaga).toFixed(2)}**\n` +
      `🦅 Pence softcap: **${statEffect(owl.statPence).toFixed(2)}**\n` +
      `👁️ Göz   softcap: **${statEffect(owl.statGoz).toFixed(2)}**\n` +
      `👂 Kulak softcap: **${statEffect(owl.statKulak).toFixed(2)}**\n` +
      `🪽 Kanat softcap: **${statEffect(owl.statKanat).toFixed(2)}**\n` +
      `💞 Bond bonus:    **+${bondBonus(owl.bond).toFixed(2)} puan**`;

    embed.addFields({
      name: '🔬 Formül Kırılımı',
      value: breakdown,
      inline: false,
    });
  }

  return embed;
}
