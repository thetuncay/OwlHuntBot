// ============================================================
// encounter-ux.ts — Yabani Baykuş Karşılaşma UI Katmanı
// ============================================================

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { formatCoinLabel, formatCoinRange, formatXpLabel, formatXpRange } from '../config/ui-emojis';
import { renderOwlMoonEmoji } from '../config/custom-emojis';
import { resolveTraits } from '../systems/traits';
import type { StoredTrait } from '../systems/traits';
import type { LootboxDrop } from '../types';
import { formatFlowHint, getFlowHints } from './alias-command';
import { qualityMark, TIER_LABEL } from './theme';
import { formatResultLevelLine, formatAbsoluteRewardLine, resultPipe } from './result-ux';
import { getOwlPrimaryName } from './owl-display';

export interface EncounterFightPreview {
  coinMin: number;
  coinMax: number;
  xpMin: number;
  xpMax: number;
  materialMin: number;
  materialMax: number;
  buffChance: number;
  lootboxChance: number;
}

function formatRewardRange(min: number, max: number, kind: 'coin' | 'xp'): string {
  return kind === 'coin' ? formatCoinRange(min, max) : formatXpRange(min, max);
}

function formatMaterialRange(min: number, max: number): string {
  return min === max ? `**${min}** materyal` : `**${min}–${max}** materyal`;
}

export interface EncounterOwlData {
  species:   string;
  tier:      number;
  quality:   string;
  statGaga:  number;
  statGoz:   number;
  statKulak: number;
  statKanat: number;
  statPence: number;
  traits:    StoredTrait[];
}

export interface PlayerOwlData {
  species:   string;
  nickname?: string | null;
  tier:      number;
  quality:   string;
  statGaga:  number;
  statGoz:   number;
  statKulak: number;
  statKanat: number;
  statPence: number;
  hp:        number;
  hpMax:     number;
}

export interface EncounterFightLootItem {
  itemName: string;
  itemType: string;
  rarity:   string;
  quantity: number;
  emoji?:   string;
}

export interface EncounterFightResult {
  playerWon:    boolean;
  rewardCoins:  number;
  rewardXP:     number;
  lootItems:    EncounterFightLootItem[];
  lootbox?:     LootboxDrop | null;
  /** Şık rün drop satırı (yoksa null). */
  runeDropLine?: string | null;
  enemyTier:    number;
  enemyQuality: string;
  enemySpecies: string;
  enemyLevel:   number;
  winChance:    number;
  playerLevel?: number;
  playerXp?:    number;
}

function totalPower(d: EncounterOwlData | PlayerOwlData): number {
  return d.statGaga + d.statGoz + d.statKulak + d.statKanat + d.statPence;
}

import { resolveGameItemEmoji } from './game-emoji-display';

function formatLootLines(items: EncounterFightLootItem[]): string {
  if (items.length === 0) return '';
  return items.map((i) => {
    const icon = resolveGameItemEmoji(i);
    const qty = i.quantity > 1 ? ` x${i.quantity}` : '';
    return `${icon} **${i.itemName}**${qty}`;
  }).join('\n');
}

export function buildEncounterEmbed(
  wild: EncounterOwlData,
  player: PlayerOwlData,
  fightPreview: EncounterFightPreview,
  prefix = 'w',
  ownerDisplayName?: string | null,
): EmbedBuilder {
  const wildPower   = totalPower(wild);
  const playerPower = totalPower(player);
  const powerDiff   = wildPower - playerPower;
  const estimate    = fightPreview;

  const wildQEmoji   = qualityMark(wild.quality);
  const playerQEmoji = qualityMark(player.quality);

  const resolvedTraits = resolveTraits(wild.traits);
  const traitLines = resolvedTraits.length > 0
    ? resolvedTraits.map((t) => `${t.name}\n> *${t.description}*`).join('\n')
    : '*Ek özellik yok*';

  let powerSummary: string;
  if (powerDiff > 30)       powerSummary = '⚠️ Çok güçlü — yüksek ödül, yüksek risk!';
  else if (powerDiff > 10)  powerSummary = '🔶 Güçlü — savaşmaya değer.';
  else if (powerDiff > -10) powerSummary = '⚖️ Dengeli — iyi bir karşılaşma.';
  else if (powerDiff > -30) powerSummary = '🟢 Zayıf — kolay loot.';
  else                      powerSummary = '💪 Çok zayıf — düşük ödül.';

  const tierColors: Record<number, number> = {
    1: 0xe74c3c, 2: 0xe67e22, 3: 0xf1c40f,
    4: 0x2ecc71, 5: 0x3498db, 6: 0x9b59b6,
    7: 0x95a5a6, 8: 0x7f8c8d,
  };
  const color = tierColors[wild.tier] ?? 0x9b1c1c;

  const flowHint = formatFlowHint(getFlowHints().encounterLoop, prefix);

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🦉 Yabani Baykuş Göründü!')
    .setDescription(
      `> **${wild.species}** ormanın derinliklerinden çıktı!\n` +
      `> ${wildQEmoji} **${wild.quality}** · ${TIER_LABEL[wild.tier] ?? `T${wild.tier}`}`,
    )
    .addFields(
      {
        name: '✨ Özellikler',
        value: traitLines,
        inline: false,
      },
      {
        name: '⚖️ Güç Karşılaştırması',
        value: [
          `Yabani: **${wildPower}** güç`,
          `Senin (${playerQEmoji} ${ownerDisplayName?.trim() || getOwlPrimaryName(player, ownerDisplayName)}): **${playerPower}** güç`,
          `Fark: **${powerDiff > 0 ? '+' : ''}${powerDiff}**`,
          powerSummary,
        ].join('\n'),
        inline: false,
      },
      {
        name: '⚔️ Savaş Ödülü',
        value: [
          formatRewardRange(estimate.coinMin, estimate.coinMax, 'coin'),
          formatRewardRange(estimate.xpMin, estimate.xpMax, 'xp'),
          `📦 ${formatMaterialRange(estimate.materialMin, estimate.materialMax)}`,
          `🧪 Buff şansı: **~%${estimate.buffChance}**`,
          `🎁 Kutu şansı: **~%${estimate.lootboxChance}**`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: `60 sn · ${flowHint}` });
}

export function buildEncounterActionRow(encounterId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`enc_fight:${encounterId}`)
      .setLabel('⚔️ Savaş · Loot')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`enc_tame:${encounterId}`)
      .setLabel('🟢 Evcilleştir')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`enc_flee:${encounterId}`)
      .setLabel('⚪ Uzaklaş')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildEncounterFightMessage(
  result: EncounterFightResult,
  playerName?: string,
): string {
  const actor = playerName ?? 'Oyuncu';

  if (!result.playerWon) {
    const chance = Math.max(0, Math.min(100, result.winChance));
    const difficultyHint =
      chance <= 25
        ? 'Bu düşman senin için **çok güçlüydü**.'
        : chance <= 50
          ? 'Düşman biraz daha **güçlü çıktı**.'
          : 'Yakın bir mücadeleydi.';

    const enemyEmoji = renderOwlMoonEmoji(result.enemyTier, 1);
    const tierLabel = TIER_LABEL[result.enemyTier] ?? `T${result.enemyTier}`;

    return [
      `⚔️ **${actor}** yabani baykuşa karşı savaşı kaybetti.`,
      '',
      resultPipe('🦉 Düşman'),
      resultPipe(`${enemyEmoji}  ${tierLabel} *${result.enemyQuality}*`),
      resultPipe('📊 Savaş Özeti'),
      resultPipe(`Kazanma şansı: **%${chance}**`),
      resultPipe(difficultyHint),
      '',
      resultPipe('💡 *İpucu*'),
      resultPipe('*Önce evcilleştir veya daha güçlü bir main baykuşla tekrar dene.*'),
    ].join('\n');
  }

  const lootBlock = formatLootLines(result.lootItems);
  const enemyEmoji = renderOwlMoonEmoji(result.enemyTier, 1);
  const tierLabel = TIER_LABEL[result.enemyTier] ?? `T${result.enemyTier}`;
  const lines = [
    `🏆 **${actor}** yabani baykuşu **MAHVETTİ!!**`,
    '',
    resultPipe('🦉 Düşman:'),
    resultPipe(`${enemyEmoji}  ${tierLabel} *${result.enemyQuality}*`),
    formatAbsoluteRewardLine(result.rewardXP, result.rewardCoins),
  ];

  if (lootBlock) {
    lines.push('', resultPipe('📦 Ganimet'));
    for (const row of lootBlock.split('\n')) {
      if (row.trim()) lines.push(resultPipe(row.replace(/^\*\*|\*\*$/g, '').trim()));
    }
  }

  if (result.runeDropLine) {
    lines.push('', result.runeDropLine);
  }

  if (result.playerLevel != null && result.playerXp != null && result.rewardXP > 0) {
    lines.push(formatResultLevelLine(result.playerLevel, result.playerXp));
  }

  return lines.join('\n');
}

/** @deprecated v2.0 için buildEncounterFightMessage kullanın */
export function buildEncounterFightEmbed(result: EncounterFightResult): EmbedBuilder {
  if (!result.playerWon) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('⚔️ Savaş Kaybedildi')
      .setDescription(
        `Yabani baykuş seni yendi ve kaçtı.\n\n` +
        `> Kazanma şansın: **%${result.winChance}**\n` +
        `> *Güçlü düşman = daha iyi loot — bir dahaki sefere!*`,
      )
      .setFooter({ text: 'HP\'ni kontrol et · Bir sonraki avda yeni bir karşılaşma olabilir.' });
  }

  const lootBlock = formatLootLines(result.lootItems);
  const lines = [
    `**T${result.enemyTier}** ${TIER_LABEL[result.enemyTier] ?? ''} (${result.enemyQuality}) yendin!`,
    '',
    '**Ödüller**',
    `${formatCoinLabel(result.rewardCoins)}`,
    `${formatXpLabel(result.rewardXP)}`,
  ];
  if (lootBlock) {
    lines.push('', '**Ganimet**', lootBlock);
  }

  if (result.playerLevel != null && result.playerXp != null && result.rewardXP > 0) {
    lines.push('', formatResultLevelLine(result.playerLevel, result.playerXp));
  }

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('⚔️ Savaş Kazanıldı!')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Kazanma şansı: %${result.winChance} · Loot envanterine eklendi` });
}

export function buildEncounterFleeEmbed(wildSpecies: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle('💨 Uzaklaştın')
    .setDescription(
      `**${wildSpecies}** ormanın derinliklerine geri döndü.\n\n` +
      `> *Bazen en iyi karar, savaşmamaktır.*`,
    )
    .setFooter({ text: 'Bir sonraki avda yeni bir karşılaşma olabilir.' });
}

export function buildEncounterTimeoutEmbed(wildSpecies: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x7f8c8d)
    .setTitle('⏰ Süre Doldu')
    .setDescription(
      `**${wildSpecies}** çok uzun bekledi ve kaçtı.\n\n` +
      `> *Fırsat geçti — bir dahaki sefere daha hızlı karar ver.*`,
    )
    .setFooter({ text: 'Bir sonraki avda yeni bir karşılaşma olabilir.' });
}
