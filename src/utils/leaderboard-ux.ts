// ============================================================
// leaderboard-ux.ts — Liderboard Embed Olusturucu
// Temiz, motive edici, rekabetci UI
// ============================================================

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { COLOR_INFO } from '../config';
import { ROLE_DEFINITIONS } from '../systems/roles';
import type { LeaderboardCategory, LeaderboardEntry, LeaderboardResult } from '../systems/leaderboard.ts.bak';

// --- KATEGORI META ---

interface CategoryMeta {
  emoji: string;
  title: string;
  scoreLabel: string;
  color: number;
}

const CATEGORY_META: Record<LeaderboardCategory, CategoryMeta> = {
  power:  { emoji: '🏆', title: 'Güç Sıralaması',    scoreLabel: 'Güç',    color: 0xf39c12 },
  hunt:   { emoji: '🎯', title: 'Av Ustası',          scoreLabel: 'Av',     color: 0x27ae60 },
  relic:  { emoji: '💎', title: 'Hazine Avcısı',      scoreLabel: 'Nadir',  color: 0x9b59b6 },
  arena:  { emoji: '⚔️', title: 'Arena Hakimi',       scoreLabel: 'Galibiyet', color: 0xe74c3c },
  wealth: { emoji: '💰', title: 'Servet Sıralaması',  scoreLabel: 'Kazanç', color: 0xf1c40f },
};

// --- RANK ROZETI ---

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `**#${rank}**`;
}

// --- SKOR FORMATLAMA ---

function formatScore(score: number, category: LeaderboardCategory): string {
  if (category === 'wealth') return `${score.toLocaleString('tr-TR')} 💰`;
  if (category === 'power')  return score.toLocaleString('tr-TR');
  return score.toLocaleString('tr-TR');
}

// --- ANA EMBED OLUSTURUCU ---

/**
 * Liderboard embed'ini olusturur.
 * Top 3 vurgulu, oyuncu konumu ayri satirda gosterilir.
 */
export function buildLeaderboardEmbed(
  result: LeaderboardResult,
  viewerId?: string,
): EmbedBuilder {
  const meta = CATEGORY_META[result.category];
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} ${meta.title}`)
    .setFooter({ text: `Sezon: ${result.seasonId} · Her 2 dakikada güncellenir` })
    .setTimestamp(result.updatedAt);

  // --- TOP 3 VURGULU BLOK ---
  const top3 = result.entries.slice(0, 3);
  const rest  = result.entries.slice(3);

  if (top3.length === 0) {
    embed.setDescription('Henüz sıralama verisi yok. Oynamaya başla!');
    return embed;
  }

  let topBlock = '';
  for (const entry of top3) {
    const isViewer = entry.playerId === viewerId;
    const badge = rankBadge(entry.rank);
    const name = isViewer ? `**→ ${entry.displayName} ←**` : entry.displayName;
    const score = formatScore(entry.score, result.category);
    topBlock += `${badge} ${name}\n`;
    topBlock += `　　${score} · ${entry.detail}\n`;
  }

  embed.addFields({ name: '🏅 Zirve', value: topBlock.trimEnd(), inline: false });

  // --- 4-10 ARASI (varsa) ---
  if (rest.length > 0) {
    let restBlock = '';
    for (const entry of rest) {
      const isViewer = entry.playerId === viewerId;
      const name = isViewer ? `**→ ${entry.displayName} ←**` : entry.displayName;
      const score = formatScore(entry.score, result.category);
      restBlock += `**#${entry.rank}** ${name} — ${score}\n`;
    }
    embed.addFields({ name: '📋 Sıralama', value: restBlock.trimEnd(), inline: false });
  }

  // --- OYUNCU KONUMU (top 10 disindaysa) ---
  if (
    viewerId &&
    result.viewerRank > 0 &&
    !result.entries.slice(0, 10).some((e) => e.playerId === viewerId) &&
    result.viewerContext.length > 0
  ) {
    let ctxBlock = '';
    for (const entry of result.viewerContext) {
      const isViewer = entry.playerId === viewerId;
      const score = formatScore(entry.score, result.category);
      if (isViewer) {
        ctxBlock += `▶ **#${entry.rank} ${entry.displayName}** — ${score}\n`;
      } else {
        ctxBlock += `　 #${entry.rank} ${entry.displayName} — ${score}\n`;
      }
    }
    embed.addFields({
      name: `📍 Senin Konumun (#${result.viewerRank})`,
      value: ctxBlock.trimEnd(),
      inline: false,
    });
  } else if (viewerId && result.viewerRank === -1) {
    embed.addFields({
      name: '📍 Senin Konumun',
      value: 'Henüz sıralamada değilsin. Oynamaya başla!',
      inline: false,
    });
  }

  // --- ODUL ROLLERI (varsa) ---
  const roleNames = ROLE_DEFINITIONS
    .filter((d) => d.category === result.category)
    .sort((a, b) => a.rank - b.rank)
    .map((d) => `#${d.rank} → ${d.name}`);

  if (roleNames.length > 0) {
    embed.addFields({ name: '🎖️ Ödül Rolleri', value: roleNames.join('\n'), inline: false });
  }

  return embed;
}

// --- RANK DEGISIM MESAJI ---

/**
 * Rank degisimini kisa ve motive edici sekilde formatlar.
 * Hunt/PvP sonrasi inline gosterim icin.
 */
export function formatRankChange(
  category: LeaderboardCategory,
  oldRank: number,
  newRank: number,
): string {
  const delta = oldRank - newRank;
  const meta = CATEGORY_META[category];

  if (delta > 0) {
    return `${meta.emoji} **${meta.title}** sıralamasında **+${delta}** yükseldin! → **#${newRank}**`;
  }
  if (delta < 0) {
    return `${meta.emoji} **${meta.title}** sıralamasında **${delta}** geriledi → **#${newRank}**`;
  }
  return `${meta.emoji} **${meta.title}** sıralamasında **#${newRank}** konumundasın.`;
}

// --- SEZON ARSIV EMBED ---

export function buildSeasonArchiveEmbed(
  seasonId: string,
  category: LeaderboardCategory,
  entries: Array<{ rank: number; playerId: string; score: number }>,
): EmbedBuilder {
  const meta = CATEGORY_META[category];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`📜 Sezon Arşivi — ${meta.emoji} ${meta.title}`)
    .setFooter({ text: `Sezon: ${seasonId}` });

  if (entries.length === 0) {
    embed.setDescription('Bu sezon için arşiv verisi bulunamadı.');
    return embed;
  }

  const lines = entries
    .map((e) => `${rankBadge(e.rank)} <@${e.playerId}> — ${e.score.toLocaleString('tr-TR')}`)
    .join('\n');

  embed.setDescription(lines);
  return embed;
}

// --- KATEGORI SECIM YARDIMCISI ---

export function categoryFromString(input: string): LeaderboardCategory | null {
  const map: Record<string, LeaderboardCategory> = {
    power: 'power', guc: 'power', güç: 'power',
    hunt: 'hunt', av: 'hunt',
    relic: 'relic', nadir: 'relic', hazine: 'relic',
    arena: 'arena', pvp: 'arena', duello: 'arena',
    wealth: 'wealth', servet: 'wealth', coin: 'wealth', para: 'wealth',
  };
  return map[input.toLowerCase()] ?? null;
}

// --- KATEGORI BUTON SATIRI ---

interface CategoryButton {
  category: LeaderboardCategory;
  label: string;
  emoji: string;
  style: ButtonStyle;
}

const CATEGORY_BUTTONS: CategoryButton[] = [
  { category: 'power',  label: 'Güç',    emoji: '🏆', style: ButtonStyle.Primary   },
  { category: 'hunt',   label: 'Av',     emoji: '🎯', style: ButtonStyle.Success   },
  { category: 'relic',  label: 'Nadir',  emoji: '💎', style: ButtonStyle.Secondary },
  { category: 'arena',  label: 'Arena',  emoji: '⚔️', style: ButtonStyle.Danger    },
  { category: 'wealth', label: 'Servet', emoji: '💰', style: ButtonStyle.Primary   },
];

/**
 * Kategori secim buton satirini olusturur.
 * Aktif kategori disabled + gri stil ile vurgulanir.
 */
export function buildCategoryRow(
  active: LeaderboardCategory,
  allDisabled = false,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  for (const btn of CATEGORY_BUTTONS) {
    const isActive = btn.category === active;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`lb_${btn.category}`)
        .setLabel(btn.label)
        .setEmoji(btn.emoji)
        .setStyle(isActive ? ButtonStyle.Secondary : btn.style)
        .setDisabled(allDisabled || isActive),
    );
  }

  return row;
}
