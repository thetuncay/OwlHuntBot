// ============================================================
// encounter-ux.ts — Yabani Baykuş Karşılaşma UI Katmanı
// ============================================================

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { resolveTraits } from '../systems/traits';
import type { StoredTrait } from '../systems/traits';
import type { LootboxDrop } from '../types';

export interface EncounterFightPreview {
  coinMin: number;
  coinMax: number;
  xpMin: number;
  xpMax: number;
  materialHint: string;
  buffChance: number;
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
  enemyTier:    number;
  enemyQuality: string;
  enemyLevel:   number;
  winChance:    number;
}

const QUALITY_EMOJI: Record<string, string> = {
  Trash:    '⬛',
  Common:   '⬜',
  Good:     '🟩',
  Rare:     '🟦',
  Elite:    '🟪',
  'God Roll': '🌟',
};

const TIER_LABEL: Record<number, string> = {
  1: 'Blakiston', 2: 'Puhu', 3: 'Kar', 4: 'Boynuzlu',
  5: 'Büyük Boz', 6: 'Ural', 7: 'Peçeli', 8: 'Kukumav',
};

function statBar(value: number, max = 100, length = 8): string {
  const filled = Math.round((value / max) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function statDiff(a: number, b: number): string {
  const diff = a - b;
  if (diff > 10) return '🔺';
  if (diff > 0)  return '▲';
  if (diff < -10) return '🔻';
  if (diff < 0)  return '▼';
  return '═';
}

function totalPower(d: EncounterOwlData | PlayerOwlData): number {
  return d.statGaga + d.statGoz + d.statKulak + d.statKanat + d.statPence;
}

function formatLootLines(items: EncounterFightLootItem[]): string {
  if (items.length === 0) return '';
  return items.map((i) => {
    const icon = i.emoji ?? (i.itemType === 'Buff' ? '🧪' : i.itemType === 'Kutu' ? '📦' : '🔩');
    const qty = i.quantity > 1 ? ` x${i.quantity}` : '';
    return `${icon} **${i.itemName}**${qty}`;
  }).join('\n');
}

export function buildEncounterEmbed(
  wild: EncounterOwlData,
  player: PlayerOwlData,
  fightPreview: EncounterFightPreview,
): EmbedBuilder {
  const wildPower   = totalPower(wild);
  const playerPower = totalPower(player);
  const powerDiff   = wildPower - playerPower;
  const estimate    = fightPreview;

  const wildQEmoji   = QUALITY_EMOJI[wild.quality]   ?? '⬜';
  const playerQEmoji = QUALITY_EMOJI[player.quality] ?? '⬜';

  const resolvedTraits = resolveTraits(wild.traits);
  const traitLines = resolvedTraits.length > 0
    ? resolvedTraits.map((t) => `${t.name}\n> *${t.description}*`).join('\n')
    : '*Trait yok*';

  const stats: [string, number, number][] = [
    ['Gaga',  wild.statGaga,  player.statGaga],
    ['Göz',   wild.statGoz,   player.statGoz],
    ['Kulak', wild.statKulak, player.statKulak],
    ['Kanat', wild.statKanat, player.statKanat],
    ['Pençe', wild.statPence, player.statPence],
  ];

  const statLines = stats.map(([name, w, p]) =>
    `\`${name.padEnd(5)}\` ${statBar(w)} **${w}** ${statDiff(w, p)} *(senin: ${p})*`,
  ).join('\n');

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
  const color = tierColors[wild.tier] ?? 0x5865f2;

  const coinMin = estimate.coinMin.toLocaleString('tr-TR');
  const coinMax = estimate.coinMax.toLocaleString('tr-TR');
  const xpMin   = estimate.xpMin.toLocaleString('tr-TR');
  const xpMax   = estimate.xpMax.toLocaleString('tr-TR');

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🦉 Yabani Baykuş Göründü!')
    .setDescription(
      `> **${wild.species}** ormanın derinliklerinden çıktı!\n` +
      `> ${wildQEmoji} **${wild.quality}** · Tier ${wild.tier} (${TIER_LABEL[wild.tier] ?? '?'})`,
    )
    .addFields(
      {
        name: '📊 Yabani Baykuş Statları',
        value: statLines,
        inline: false,
      },
      {
        name: '✨ Trait\'ler',
        value: traitLines,
        inline: false,
      },
      {
        name: '⚖️ Güç Karşılaştırması',
        value: [
          `Yabani: **${wildPower}** güç`,
          `Senin (${playerQEmoji} ${player.species}): **${playerPower}** güç`,
          `Fark: **${powerDiff > 0 ? '+' : ''}${powerDiff}**`,
          powerSummary,
        ].join('\n'),
        inline: false,
      },
      {
        name: '⚔️ Savaş Ödülü (kazanırsan)',
        value: [
          `💰 **${coinMin}–${coinMax}** coin`,
          `✨ **${xpMin}–${xpMax}** XP`,
          `📦 **${estimate.materialHint}** (tier/kaliteye göre)`,
          `🧪 Buff şansı: **~%${estimate.buffChance}**`,
          `🎁 Kutu şansı (günlük cap)`,
          '',
          '*Evcilleştirme baykuş verir · Savaş loot verir*',
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: '60 saniye içinde seçim yapmazsan baykuş kaçar.' });
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
    `**${TIER_LABEL[result.enemyTier] ?? 'Baykuş'}** (${result.enemyQuality}) yendin!`,
    '',
    '**Ödüller**',
    `💰 **+${result.rewardCoins.toLocaleString('tr-TR')}** coin`,
    `✨ **+${result.rewardXP.toLocaleString('tr-TR')}** XP`,
  ];
  if (lootBlock) {
    lines.push('', '**Ganimet**', lootBlock);
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
