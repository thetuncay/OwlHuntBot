/**
 * stats-ux.ts — Owl Stats RPG Panel Builder
 * Sadece görsel katman. Hiçbir oyun lojiğine dokunmaz.
 */

import { EmbedBuilder } from 'discord.js';
import type { OwlStatKey } from '../types';
import { bondBonus, huntRollBonusFromKanat, huntRolls, staminaMax, statEffect } from './math';
import { getBaseStats, getTrainedStats, hasSplitStats } from './owl-stats';
import { getStatsUpgradeHints } from './upgrade-deps';
import { HUNT_CRITICAL_RATE, HUNT_INJURY_RATE } from '../config';
import { COLORS, hpBar, QUALITY_BADGE, QUALITY_COLOR } from './theme';
import { formatTierLabel } from './terminology';
import { formatOwlIdentity } from './owl-display';
import { formatStatRole, STATS_EMBED_FOOTER, STATS_SCORE_LEGEND } from './stat-role-ux';
import { formatOwlLevelTierLabel } from '../config/ui-tiers';
import { getMoonTierProgress } from '../config/owl-moon-tier';

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function statBar(value: number): string {
  return `\`${hpBar(Math.min(value, 100), 100, 8)}\``;
}

type StatHint = 'locked' | 'suggest' | null;

function statHintBadge(hint: StatHint): string {
  if (hint === 'locked') return ' 🔒';
  if (hint === 'suggest') return ' 🟢↗';
  return '';
}

function statLine(
  icon: string,
  label: string,
  effective: number,
  trained: number,
  split: boolean,
  hint: StatHint,
  roleLine: string,
): string {
  const header = `${icon} **${label}**${statHintBadge(hint)}`;
  const body = `${statBar(effective)}  **${effective}**`;
  if (!split) return `${header}\n${body}\n${roleLine}`;
  return `${header}\n${body} · +${trained} eğitim\n${roleLine}`;
}

function resolveStatHint(
  stat: OwlStatKey,
  locked: OwlStatKey[],
  suggest: OwlStatKey | null,
): StatHint {
  if (locked.includes(stat)) return 'locked';
  if (suggest === stat) return 'suggest';
  return null;
}

// ─── Veri tipi ───────────────────────────────────────────────────────────────
export interface OwlStatsData {
  species:    string;
  nickname?:  string | null;
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
  statGagaBase?: number;
  statGozBase?: number;
  statKulakBase?: number;
  statKanatBase?: number;
  statPenceBase?: number;
  statGagaTrained?: number;
  statGozTrained?: number;
  statKulakTrained?: number;
  statKanatTrained?: number;
  statPenceTrained?: number;
  bond:       number;
  isMain:     boolean;
}

export interface PlayerStatsData {
  level:       number;
  huntStreak?: number;
  prestigeLevel?: number;
  /** D3 — kazanılmış kozmetik unvan satırı. */
  titleLine?: string;
}

// ─── Ana builder ─────────────────────────────────────────────────────────────
export function buildOwlStatsEmbed(
  owl: OwlStatsData,
  player: PlayerStatsData,
  deep = false,
  ownerDisplayName?: string | null,
  _helpPrefix = 'w',
): EmbedBuilder {
  const staminaMaxVal = Math.round(staminaMax(owl.statKanat));
  const hpRatio       = owl.hpMax > 0 ? owl.hp / owl.hpMax : 0;
  const isLowHp       = hpRatio < 0.3;
  const isRare        = owl.quality === 'Elite' || owl.quality === 'God Roll';

  const qualityBadge = QUALITY_BADGE[owl.quality] ?? QUALITY_BADGE['Common']!;
  const qualityColor = QUALITY_COLOR[owl.quality] ?? QUALITY_COLOR['Common']!;
  const embedColor   = isLowHp ? COLORS.WARNING : qualityColor;

  const power   = Math.round(statEffect(owl.statGaga) + statEffect(owl.statPence));
  const sight   = Math.round(statEffect(owl.statGoz)  + statEffect(owl.statKulak));
  const speed   = Math.round(statEffect(owl.statKanat));
  const huntRollBonus = huntRollBonusFromKanat(owl.statKanat);
  const totalHuntRolls = huntRolls(player.level, owl.statKanat);
  const bondPct = bondBonus(owl.bond).toFixed(1);

  const base = getBaseStats(owl);
  const trained = getTrainedStats(owl);
  const effective = {
    gaga: owl.statGaga,
    goz: owl.statGoz,
    kulak: owl.statKulak,
    kanat: owl.statKanat,
    pence: owl.statPence,
  };
  const { locked, suggest } = getStatsUpgradeHints(trained, effective);

  const tierLabel = formatTierLabel(owl.tier);

  const mainBadge = owl.isMain ? ' ★ MAIN' : '';
  const rareBadge = isRare ? ' ✨' : '';
  const warnBadge = isLowHp ? ' ⚠️' : '';

  const identity = formatOwlIdentity(owl, ownerDisplayName);
  const title = `🦉 ${identity.primary}${rareBadge}${warnBadge}${mainBadge}`;
  const playerTierLine = formatOwlLevelTierLabel(player.level);
  const moonProgress = getMoonTierProgress(
    owl.statGaga + owl.statGoz + owl.statKulak + owl.statKanat + owl.statPence,
  );
  const moonLine = moonProgress.atMax || moonProgress.nextThreshold == null
    ? `🌙 ${moonProgress.currentDef.label}`
    : `🌙 ${moonProgress.currentDef.label} \`${hpBar(moonProgress.power, moonProgress.nextThreshold, 8)}\``;
  const desc  =
    (identity.subtitle ? `> *${identity.subtitle}*\n` : '') +
    `> ${qualityBadge} ${owl.quality}  ·  ${tierLabel}  ·  Oyuncu ${playerTierLine}\n` +
    `> ${moonLine}` +
    (player.titleLine ? `  ·  ${player.titleLine}` : '') +
    '\n' +
    (isLowHp ? '> ℹ️ HP yalnızca PvP savaş ekranında kullanılır; tamir komutu yok.\n' : '');

  const hpBarStr   = `\`${hpBar(owl.hp, owl.hpMax)}\``;
  const stamBarStr = `\`${hpBar(owl.staminaCur, staminaMaxVal)}\``;
  const survival =
    `❤️ HP     ${hpBarStr} **${owl.hp}** / ${owl.hpMax}\n` +
    `⚡ Stamina ${stamBarStr} **${owl.staminaCur}** / ${staminaMaxVal}`;

  const split = hasSplitStats(owl);

  const gagaLine  = statLine('🦷', 'Gaga', owl.statGaga, trained.gaga, split, resolveStatHint('gaga', locked, suggest), formatStatRole('gaga'));
  const penceLine = statLine('🦅', 'Pençe', owl.statPence, trained.pence, split, resolveStatHint('pence', locked, suggest), formatStatRole('pence'));
  const gozLine   = statLine('👁️', 'Göz', owl.statGoz, trained.goz, split, resolveStatHint('goz', locked, suggest), formatStatRole('goz'));
  const kulakLine = statLine('👂', 'Kulak', owl.statKulak, trained.kulak, split, resolveStatHint('kulak', locked, suggest), formatStatRole('kulak'));
  const kanatLine = statLine('🪽', 'Kanat', owl.statKanat, trained.kanat, split, resolveStatHint('kanat', locked, suggest), formatStatRole('kanat'));

  const performance =
    `⚔️ Güç Skoru   **${power}**\n` +
    `🔍 Farkındalık **${sight}**\n` +
    `💨 Hız Skoru   **${speed}**\n` +
    `💞 Bond Bonus  **+${bondPct}%**\n` +
    STATS_SCORE_LEGEND;

  const special =
    `🎯 Kritik Şansı  **${HUNT_CRITICAL_RATE}%**\n` +
    `🩹 Yaralanma     **${HUNT_INJURY_RATE}%**\n` +
    `🎲 Av Roll       **${totalHuntRolls}** (kanat bonusu: **+${huntRollBonus}**)\n` +
    `✨ Kalite         ${qualityBadge} ${owl.quality}`;

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
    );

  embed.setFooter({ text: STATS_EMBED_FOOTER });

  if (deep) {
    const breakdown =
      `🦷 Gaga  base **${base.gaga}** + eğitim **${trained.gaga}** → softcap **${statEffect(owl.statGaga).toFixed(2)}**\n` +
      `🦅 Pençe base **${base.pence}** + eğitim **${trained.pence}** → softcap **${statEffect(owl.statPence).toFixed(2)}**\n` +
      `👁️ Göz   base **${base.goz}** + eğitim **${trained.goz}** → softcap **${statEffect(owl.statGoz).toFixed(2)}**\n` +
      `👂 Kulak base **${base.kulak}** + eğitim **${trained.kulak}** → softcap **${statEffect(owl.statKulak).toFixed(2)}**\n` +
      `🪽 Kanat base **${base.kanat}** + eğitim **${trained.kanat}** → softcap **${statEffect(owl.statKanat).toFixed(2)}**\n` +
      `💞 Bond bonus: **+${bondBonus(owl.bond).toFixed(2)} puan**`;

    embed.addFields({
      name: '🔬 Formül Kırılımı',
      value: breakdown,
      inline: false,
    });
  }

  return embed;
}
