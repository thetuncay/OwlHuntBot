// placeholder

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { TameSessionState } from '../systems/tame-session';
import type { NarrativeOutput } from './tame-narrative';

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function progressBar(value: number, max: number, length = 12): string {
  const filled = Math.round((value / max) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

// ─── ESCAPE BAR ───────────────────────────────────────────────────────────────
function escapeBar(value: number, length = 12): string {
  const filled = Math.round((value / 100) * length);
  return '🟥'.repeat(Math.min(filled, length)) + '⬛'.repeat(Math.max(0, length - filled));
}

// ─── TURN DOTS ────────────────────────────────────────────────────────────────
function turnDots(current: number, max: number): string {
  return Array.from({ length: max }, (_, i) => i < current ? '🔵' : '⚪').join('');
}

// ─── EMBED COLOR BY PERSONALITY ──────────────────────────────────────────────
const PERSONALITY_COLORS: Record<string, number> = {
  aggressive: 0xe74c3c,
  timid:      0xf1c40f,
  curious:    0x3498db,
  greedy:     0xe67e22,
  wise:       0x9b59b6,
};

// ─── MAIN ENCOUNTER EMBED ────────────────────────────────────────────────────
export function buildTameEncounterEmbed(
  state: TameSessionState,
  narrative: NarrativeOutput,
): EmbedBuilder {
  const color = PERSONALITY_COLORS[state.personality] ?? 0x5865f2;

  const progressVal = Math.max(0, Math.min(100, state.progress));
  const escapeVal   = Math.max(0, Math.min(100, state.escapeRisk));

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🦉 ${state.owlSpecies} · ${state.owlQuality}`)
    .setDescription(
      `> ${narrative.reaction}\n` +
      (narrative.continuation ? `\n*${narrative.continuation}*` : ''),
    )
    .addFields(
      {
        name: '📊 Bağ İlerlemesi',
        value: `\`${progressBar(progressVal, 100)}\` **${progressVal}%**`,
        inline: true,
      },
      {
        name: '💨 Kaçış Riski',
        value: `\`${escapeBar(escapeVal)}\` **${escapeVal}%**`,
        inline: true,
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: true,
      },
      {
        name: '🎯 Tur',
        value: `${turnDots(state.turn, state.maxTurns)} **${state.turn}/${state.maxTurns}**`,
        inline: true,
      },
      {
        name: `${state.personalityEmoji} Kişilik`,
        value: `**${state.personalityLabel}**`,
        inline: true,
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: true,
      },
    );

  if (narrative.hint) {
    embed.setFooter({ text: narrative.hint });
  }

  return embed;
}

// ─── RESULT EMBED ─────────────────────────────────────────────────────────────
export function buildTameResultEmbed(
  state: TameSessionState,
  success: boolean,
  endingText: string,
): EmbedBuilder {
  if (success) {
    return new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`🎉 Evcilleştirme Başarılı!`)
      .setDescription(
        `> *${endingText}*\n\n` +
        `**${state.owlSpecies}** artık seninle. ${state.personalityEmoji} **${state.personalityLabel}** kişiliği korunacak.`,
      )
      .addFields(
        { name: '🦉 Tür',    value: state.owlSpecies,        inline: true },
        { name: '⭐ Kalite', value: state.owlQuality,         inline: true },
        { name: '🏆 Tier',   value: `Tier ${state.owlTier}`, inline: true },
      )
      .setFooter({ text: '+100 XP kazandın · owl inventory ile baykuşunu gör' });
  }

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`💨 Evcilleştirme Başarısız`)
    .setDescription(`> *${endingText}*`)
    .setFooter({ text: 'Encounter kapandı · Bir sonraki avda yeni bir karşılaşma olabilir' });
}

// ─── TIMEOUT EMBED ────────────────────────────────────────────────────────────
export function buildTameTimeoutEmbed(state: TameSessionState): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle('⏰ Süre Doldu')
    .setDescription(
      `**${state.owlSpecies}** beklemeye devam etti — ama sen gelmeyince gitti.\n\n` +
      `> *Orman sessizleşti. Fırsat geçti.*`,
    )
    .setFooter({ text: 'Encounter kapandı · Bir sonraki avda yeni bir karşılaşma olabilir' });
}

// ─── ACTION BUTTONS ───────────────────────────────────────────────────────────
import { ACTION_MODIFIERS, ESCAPE_MODIFIERS } from './tame-narrative';

// Her aksiyonun beklenen progress kazanımını tahmin eder
function estimateProgressGain(
  action: 'silent' | 'distract' | 'advance',
  state: TameSessionState,
): number {
  const actionBonus  = ACTION_MODIFIERS[state.personality][action];
  const expectedRoll = state.baseChance + actionBonus; // variance ortalaması 0

  if (expectedRoll > 60) {
    const base = 20 + Math.floor((state.baseChance / 92) * 20);
    return base + 5; // ortalama +5 random
  } else if (expectedRoll > 35) {
    const base = 10 + Math.floor((state.baseChance / 92) * 10);
    return base + 2;
  } else {
    return -(10 + 5); // ortalama kayıp
  }
}

function actionButtonLabel(
  baseLabel: string,
  action: 'silent' | 'distract' | 'advance',
  state: TameSessionState,
): string {
  const gain        = estimateProgressGain(action, state);
  const escapeDelta = ESCAPE_MODIFIERS[state.personality][action];

  const gainStr  = gain >= 0 ? `+%${gain}` : `-%${Math.abs(gain)}`;
  const escStr   = escapeDelta < 0 ? ` 🛡${Math.abs(escapeDelta)}` : escapeDelta > 0 ? ` ⚠${escapeDelta}` : '';

  return `${baseLabel} [${gainStr}${escStr}]`;
}

// Final tame şansı: progress + baseChance birleşimi
export function calcFinalTameChance(state: TameSessionState): number {
  // Progress katkısı: 50'den sonra her puan +0.5 bonus
  const progressBonus = Math.max(0, (state.progress - 50) * 0.5);
  const raw = state.baseChance + progressBonus;
  return Math.min(95, Math.max(5, Math.round(raw)));
}

export function buildTameActionRow(
  encounterId: string,
  state?: TameSessionState,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  const silent   = state ? actionButtonLabel('🟢 Sessiz',   'silent',   state) : '🟢 Sessiz Yaklaş';
  const distract = state ? actionButtonLabel('🟡 Dikkat',   'distract', state) : '🟡 Dikkatini Çek';
  const advance  = state ? actionButtonLabel('🔴 Üzerine',  'advance',  state) : '🔴 Üzerine Git';

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tame_silent:${encounterId}`)
      .setLabel(silent)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`tame_distract:${encounterId}`)
      .setLabel(distract)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`tame_advance:${encounterId}`)
      .setLabel(advance)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

// %50 üzerinde gösterilen "Evcilleştirmeyi Dene" butonu
export function buildTameFinalRow(
  encounterId: string,
  state: TameSessionState,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  const chance = calcFinalTameChance(state);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tame_attempt:${encounterId}`)
      .setLabel(`✨ Evcilleştirmeyi Dene  [%${chance} şans]`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}
