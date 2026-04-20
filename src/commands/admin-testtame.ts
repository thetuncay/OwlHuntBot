/**
 * admin-testtame.ts — /admin testtame handler
 *
 * Encounter oluşturur ve interaktif tame UI'ını başlatır.
 * Sadece admin.ts tarafından çağrılır.
 */

import { ActionRowBuilder, ButtonBuilder, ComponentType } from 'discord.js';
import { OWL_SPECIES } from '../config';
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
import { commitTameResult } from '../systems/tame';
import type { CommandDefinition } from '../types';

export async function handleTestTame(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const targetUser = interaction.options.getUser('kullanici') ?? interaction.user;
  const userId     = targetUser.id;
  const tier       = interaction.options.getInteger('tier', true);
  const quality    = (interaction.options.getString('kalite') ?? 'Common') as
    'Trash' | 'Common' | 'Good' | 'Rare' | 'Elite' | 'God Roll';

  const player = await ctx.prisma.player.findUnique({ where: { id: userId } });
  if (!player) {
    await interaction.reply({ content: `❌ <@${userId}> kayıtlı değil.`, flags: 64 });
    return;
  }
  const mainOwl = await ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true } });
  if (!mainOwl) {
    await interaction.reply({ content: `❌ <@${userId}> main baykuşu yok.`, flags: 64 });
    return;
  }

  const species = OWL_SPECIES.find((s) => s.tier === tier);
  if (!species) {
    await interaction.reply({ content: `❌ Tier ${tier} için tür bulunamadı.`, flags: 64 });
    return;
  }

  const statMin  = Math.max(1, 100 - tier * 12);
  const statMax  = Math.min(100, statMin + 30);
  const rollStat = () => Math.floor(Math.random() * (statMax - statMin + 1)) + statMin;
  const stats    = {
    gaga: rollStat(), goz: rollStat(), kulak: rollStat(),
    kanat: rollStat(), pence: rollStat(),
  };

  const encounter = await ctx.prisma.encounter.create({
    data:   { playerId: userId, owlSpecies: species.name, owlTier: tier, owlQuality: quality, owlStats: stats },
    select: { id: true },
  });

  await deleteTameSession(ctx.redis, userId);

  const state = await createTameSession(
    ctx.redis, encounter.id, userId,
    species.name, tier, quality,
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
    components: [buildTameActionRow(encounter.id, state)],
    flags:      64,
  });

  const msg       = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time:          120_000,
    filter:        (i) => i.user.id === userId && i.customId.startsWith('tame_'),
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
      await commitTameResult(ctx.prisma, userId, encounter.id, success);
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
      await commitTameResult(ctx.prisma, userId, encounter.id, turnResult.tamed);
      const ending = generateEnding(current.personality, turnResult.tamed, current.progress, current.usedLines);
      await i.update({ embeds: [buildTameResultEmbed(current, turnResult.tamed, ending)], components: [] });
      return;
    }

    await updateTameSession(ctx.redis, current);
    const components: ActionRowBuilder<ButtonBuilder>[] = [buildTameActionRow(encounter.id, current)];
    if (current.progress >= 50) components.push(buildTameFinalRow(encounter.id, current));
    await i.update({ embeds: [buildTameEncounterEmbed(current, turnNarrative)], components });
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await deleteTameSession(ctx.redis, userId);
      await interaction.editReply({ embeds: [buildTameTimeoutEmbed(state)], components: [] }).catch(() => null);
    }
  });
}
