// ============================================================
// encounter-ux.ts — Yabani Baykuş Karşılaşma UI Katmanı
//
// Sorumluluklar:
//   - Encounter embed'ini oluşturmak (yabani baykuş stats + traits + karşılaştırma)
//   - 3 seçenek butonunu oluşturmak: Evcilleştir / Savaş / Uzaklaş
//   - Savaş sonucu embed'ini oluşturmak
// ============================================================

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { resolveTraits } from '../systems/traits';
import type { StoredTrait } from '../systems/traits';

// ─── TİP TANIMLARI ────────────────────────────────────────────────────────────

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

export interface EncounterFightResult {
  playerWon:   boolean;
  rewardCoins: number;
  rewardXP:    number;
  enemyTier:   number;
  enemyLevel:  number;
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

const QUALITY_EMOJI: Record<string, string> = {
  'Trash':    '⬛',
  'Common':   '⬜',
  'Good':     '🟩',
  'Rare':     '🟦',
  'Elite':    '🟪',
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

// ─── ANA ENCOUNTER EMBED ──────────────────────────────────────────────────────

/**
 * Yabani baykuş karşılaşma embed'i.
 *
 * İçerik:
 *   - Yabani baykuşun stats + traits
 *   - Oyuncunun mevcut baykuşuyla stat karşılaştırması
 *   - Güç farkı özeti
 */
export function buildEncounterEmbed(
  wild: EncounterOwlData,
  player: PlayerOwlData,
): EmbedBuilder {
  const wildPower   = totalPower(wild);
  const playerPower = totalPower(player);
  const powerDiff   = wildPower - playerPower;

  const wildQEmoji   = QUALITY_EMOJI[wild.quality]   ?? '⬜';
  const playerQEmoji = QUALITY_EMOJI[player.quality] ?? '⬜';

  // Trait listesi
  const resolvedTraits = resolveTraits(wild.traits);
  const traitLines = resolvedTraits.length > 0
    ? resolvedTraits.map((t) => `${t.name}\n> *${t.description}*`).join('\n')
    : '*Trait yok*';

  // Stat karşılaştırma satırları
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

  // Güç özeti
  let powerSummary: string;
  if (powerDiff > 30)       powerSummary = '⚠️ Çok güçlü — savaş riskli!';
  else if (powerDiff > 10)  powerSummary = '🔶 Güçlü — dikkatli ol.';
  else if (powerDiff > -10) powerSummary = '⚖️ Dengeli — iyi bir karşılaşma.';
  else if (powerDiff > -30) powerSummary = '🟢 Zayıf — avantajlısın.';
  else                      powerSummary = '💪 Çok zayıf — kolay av.';

  // Embed rengi: tier'a göre
  const tierColors: Record<number, number> = {
    1: 0xe74c3c, 2: 0xe67e22, 3: 0xf1c40f,
    4: 0x2ecc71, 5: 0x3498db, 6: 0x9b59b6,
    7: 0x95a5a6, 8: 0x7f8c8d,
  };
  const color = tierColors[wild.tier] ?? 0x5865f2;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🦉 Yabani Baykuş Göründü!`)
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
    )
    .setFooter({ text: '60 saniye içinde seçim yapmazsan baykuş kaçar.' });
}

// ─── SEÇENEK BUTONLARI ────────────────────────────────────────────────────────

/**
 * 3 seçenek butonu: Evcilleştir / Savaş / Uzaklaş
 *
 * customId formatı: enc_<seçim>:<encounterId>
 */
export function buildEncounterActionRow(encounterId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`enc_tame:${encounterId}`)
      .setLabel('🟢 Evcilleştir')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`enc_fight:${encounterId}`)
      .setLabel('🔴 Savaş')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`enc_flee:${encounterId}`)
      .setLabel('⚪ Uzaklaş')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── SAVAŞ SONUCU EMBED ───────────────────────────────────────────────────────

export function buildEncounterFightEmbed(result: EncounterFightResult): EmbedBuilder {
  if (result.playerWon) {
    return new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('⚔️ Savaş Kazanıldı!')
      .setDescription(
        `Yabani baykuşu yendin ve onu kovaladın!\n\n` +
        `**Ödüller:**\n` +
        `💰 **+${result.rewardCoins} coin**\n` +
        `✨ **+${result.rewardXP} XP**`,
      )
      .setFooter({ text: 'Bir sonraki avda yeni bir karşılaşma olabilir.' });
  }

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⚔️ Savaş Kaybedildi')
    .setDescription(
      `Yabani baykuş seni yendi ve kaçtı.\n\n` +
      `> *Bazen geri çekilmek de bir stratejidir.*`,
    )
    .setFooter({ text: 'HP\'ni kontrol et · Bir sonraki avda yeni bir karşılaşma olabilir.' });
}

// ─── UZAKLAŞ EMBED ────────────────────────────────────────────────────────────

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

// ─── ZAMAN AŞIMI EMBED ───────────────────────────────────────────────────────

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
