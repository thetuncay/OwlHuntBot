/**
 * owl-tame.ts — /owl tame komutu
 */

import type {
  ActionRowBuilder,
  ButtonBuilder} from 'discord.js';
import {
  ComponentType,
  type Message,
} from 'discord.js';
import { commitTameResult } from '../systems/tame';
import {
  createTameSession,
  getTameSession,
  updateTameSession,
  deleteTameSession,
  resolveTurn,
} from '../systems/tame-session';
import { generateNarrative, generateEnding } from '../utils/tame-narrative';
import type { TameAction } from '../utils/tame-narrative';
import {
  buildTameEncounterEmbed,
  buildTameResultEmbed,
  buildTameTimeoutEmbed,
  buildTameActionRow,
  buildTameFinalRow,
  calcFinalTameChance,
} from '../utils/tame-ux';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';

export async function runTame(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const encounterId = interaction.options.getString('encounter', true).trim();
  const userId      = interaction.user.id;

  const existing = await getTameSession(ctx.redis, userId);
  if (existing && existing.encounterId !== encounterId) {
    await interaction.reply({
      content: `⚠️ Zaten aktif bir evcilleştirme seansın var. Önce onu tamamla.`,
      flags: 64,
    });
    return;
  }

  const encounter = await ctx.prisma.encounter.findFirst({
    where: { id: encounterId, playerId: userId },
  });
  if (!encounter) {
    await interaction.reply({ content: `❌ Encounter bulunamadı. ID'yi kontrol et.`, flags: 64 });
    return;
  }
  if (encounter.status !== 'open') {
    await interaction.reply({ content: `❌ Bu encounter artık aktif değil.`, flags: 64 });
    return;
  }

  const mainOwl = await ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true } });
  if (!mainOwl) {
    await interaction.reply({ embeds: [failEmbed('Hata', 'Main baykuş bulunamadı.')], flags: 64 });
    return;
  }

  const state = existing ?? await createTameSession(
    ctx.redis, encounterId, userId,
    encounter.owlSpecies, encounter.owlTier, encounter.owlQuality,
    mainOwl.statGoz, mainOwl.statKulak,
  );

  const narrative = generateNarrative({
    personality: state.personality,
    action:      'silent',
    outcome:     'ongoing' as any,
    turn:        state.turn,
    progress:    state.progress,
    escapeRisk:  state.escapeRisk,
    usedLines:   state.usedLines,
  });
  state.usedLines = [...state.usedLines, narrative.reaction, narrative.hint].filter(Boolean).slice(-10);
  await updateTameSession(ctx.redis, state);

  await interaction.reply({
    embeds:     [buildTameEncounterEmbed(state, narrative)],
    components: [buildTameActionRow(encounterId, state)],
    flags:      64,
  });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: (i) => i.user.id === userId && i.customId.startsWith('tame_'),
  });

  collector.on('collect', async (i) => {
    const actionMap: Record<string, TameAction> = {
      tame_silent:   'silent',
      tame_distract: 'distract',
      tame_advance:  'advance',
    };
    const actionKey = i.customId.split(':')[0] ?? 'tame_silent';

    const current = await getTameSession(ctx.redis, userId);
    if (!current) {
      await i.update({ content: '❌ Seans sona erdi.', embeds: [], components: [] });
      collector.stop();
      return;
    }

    if (actionKey === 'tame_attempt') {
      collector.stop('done');
      await deleteTameSession(ctx.redis, userId);
      const finalChance = calcFinalTameChance(current);
      const success     = Math.random() * 100 < finalChance;
      await commitTameResult(ctx.prisma, userId, encounterId, success);
      const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
      await i.update({ embeds: [buildTameResultEmbed(current, success, ending)], components: [] });
      return;
    }

    const action     = actionMap[actionKey] ?? 'silent';
    const turnResult = resolveTurn(current, action);

    current.progress   = Math.max(0, Math.min(100, current.progress + turnResult.progressDelta));
    current.escapeRisk = Math.max(0, Math.min(100, current.escapeRisk + turnResult.escapeDelta));
    current.turn      += 1;

    const turnNarrative = generateNarrative({
      personality: current.personality,
      action,
      outcome:     turnResult.outcome === 'ongoing' ? 'success' : turnResult.outcome,
      turn:        current.turn,
      progress:    current.progress,
      escapeRisk:  current.escapeRisk,
      usedLines:   current.usedLines,
    });
    current.usedLines = [
      ...current.usedLines,
      turnNarrative.reaction,
      turnNarrative.continuation,
      turnNarrative.hint,
    ].filter(Boolean).slice(-10);

    const isOver = turnResult.escaped || turnResult.tamed || current.turn > current.maxTurns;

    if (isOver) {
      collector.stop('done');
      await deleteTameSession(ctx.redis, userId);
      const success = turnResult.tamed;
      await commitTameResult(ctx.prisma, userId, encounterId, success);
      const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
      await i.update({ embeds: [buildTameResultEmbed(current, success, ending)], components: [] });
      return;
    }

    await updateTameSession(ctx.redis, current);
    const components: ActionRowBuilder<ButtonBuilder>[] = [buildTameActionRow(encounterId, current)];
    if (current.progress >= 50) components.push(buildTameFinalRow(encounterId, current));
    await i.update({ embeds: [buildTameEncounterEmbed(current, turnNarrative)], components });
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await deleteTameSession(ctx.redis, userId);
      await interaction.editReply({
        embeds:     [buildTameTimeoutEmbed(state)],
        components: [],
      }).catch(() => null);
    }
  });
}

// ─── Prefix: owl tame ─────────────────────────────────────────────────────────

export async function runTameMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const encounterId = args[0];
  if (!encounterId) {
    await message.reply(`❌ Kullanim: \`${helpPrefix} tame <encounterID>\``);
    return;
  }

  const userId   = message.author.id;
  const existing = await getTameSession(ctx.redis, userId);
  if (existing && existing.encounterId !== encounterId) {
    await message.reply(`⚠️ Zaten aktif bir evcilleştirme seansın var. Önce onu tamamla.`);
    return;
  }

  const encounter = await ctx.prisma.encounter.findFirst({ where: { id: encounterId, playerId: userId } });
  if (!encounter || encounter.status !== 'open') {
    await message.reply(`❌ Encounter bulunamadı veya artık aktif değil.`);
    return;
  }

  const mainOwl = await ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true } });
  if (!mainOwl) { await message.reply(`❌ Main baykuş bulunamadı.`); return; }

  const state = existing ?? await createTameSession(
    ctx.redis, encounterId, userId,
    encounter.owlSpecies, encounter.owlTier, encounter.owlQuality,
    mainOwl.statGoz, mainOwl.statKulak,
  );

  const narrative = generateNarrative({
    personality: state.personality, action: 'silent', outcome: 'ongoing' as any,
    turn: state.turn, progress: state.progress, escapeRisk: state.escapeRisk, usedLines: state.usedLines,
  });
  state.usedLines = [...state.usedLines, narrative.reaction, narrative.hint].filter(Boolean).slice(-10);
  await updateTameSession(ctx.redis, state);

  const sent = await message.reply({
    embeds:     [buildTameEncounterEmbed(state, narrative)],
    components: [buildTameActionRow(encounterId, state)],
  });

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: (i) => i.user.id === userId && i.customId.startsWith('tame_'),
  });

  collector.on('collect', async (i) => {
    const actionMap: Record<string, TameAction> = {
      tame_silent: 'silent', tame_distract: 'distract', tame_advance: 'advance',
    };
    const actionKey = i.customId.split(':')[0] ?? 'tame_silent';
    const current   = await getTameSession(ctx.redis, userId);
    if (!current) {
      await i.update({ content: '❌ Seans sona erdi.', embeds: [], components: [] });
      collector.stop();
      return;
    }

    if (actionKey === 'tame_attempt') {
      collector.stop('done');
      await deleteTameSession(ctx.redis, userId);
      const finalChance = calcFinalTameChance(current);
      const success     = Math.random() * 100 < finalChance;
      await commitTameResult(ctx.prisma, userId, encounterId, success);
      const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
      await i.update({ embeds: [buildTameResultEmbed(current, success, ending)], components: [] });
      return;
    }

    const action     = actionMap[actionKey] ?? 'silent';
    const turnResult = resolveTurn(current, action);
    current.progress   = Math.max(0, Math.min(100, current.progress + turnResult.progressDelta));
    current.escapeRisk = Math.max(0, Math.min(100, current.escapeRisk + turnResult.escapeDelta));
    current.turn      += 1;

    const tNarrative = generateNarrative({
      personality: current.personality, action,
      outcome:     turnResult.outcome === 'ongoing' ? 'success' : turnResult.outcome,
      turn: current.turn, progress: current.progress,
      escapeRisk: current.escapeRisk, usedLines: current.usedLines,
    });
    current.usedLines = [...current.usedLines, tNarrative.reaction, tNarrative.continuation, tNarrative.hint]
      .filter(Boolean).slice(-10);

    const isOver = turnResult.escaped || turnResult.tamed || current.turn > current.maxTurns;
    if (isOver) {
      collector.stop('done');
      await deleteTameSession(ctx.redis, userId);
      await commitTameResult(ctx.prisma, userId, encounterId, turnResult.tamed);
      const ending = generateEnding(current.personality, turnResult.tamed, current.progress, current.usedLines);
      await i.update({ embeds: [buildTameResultEmbed(current, turnResult.tamed, ending)], components: [] });
      return;
    }

    await updateTameSession(ctx.redis, current);
    const components: ActionRowBuilder<ButtonBuilder>[] = [buildTameActionRow(encounterId, current)];
    if (current.progress >= 50) components.push(buildTameFinalRow(encounterId, current));
    await i.update({ embeds: [buildTameEncounterEmbed(current, tNarrative)], components });
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await deleteTameSession(ctx.redis, userId);
      await sent.edit({ embeds: [buildTameTimeoutEmbed(state)], components: [] }).catch(() => null);
    }
  });
}
