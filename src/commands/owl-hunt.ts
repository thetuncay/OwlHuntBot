/**
 * owl-hunt.ts — /owl hunt komutu + encounter mesajı
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { HUNT_COOLDOWN_MS } from '../config';
import { getCooldownRemainingMs } from '../middleware/cooldown';
import { rollHunt } from '../systems/hunt';
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
import { animateHuntInteraction, animateHuntMessage, compressHuntResult } from '../utils/hunt-ux';
import { listActiveBuffs } from '../systems/items';
import { BUFF_ITEM_MAP } from '../config';
import {
  buildEncounterEmbed,
  buildEncounterActionRow,
  buildEncounterFightEmbed,
  buildEncounterFleeEmbed,
  buildEncounterTimeoutEmbed,
} from '../utils/encounter-ux';
import type { EncounterOwlData, PlayerOwlData } from '../utils/encounter-ux';
import { resolveEncounterFight } from '../systems/encounter-fight';
import { parseStoredTraits } from '../systems/traits';
import type { CommandDefinition } from '../types';
import type { Message } from 'discord.js';

// ─── Slash: /owl hunt ─────────────────────────────────────────────────────────

export async function runHunt(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;
  const cooldownKey = `cooldown:hunt:${userId}`;
  const remaining = await getCooldownRemainingMs(ctx.redis, cooldownKey, HUNT_COOLDOWN_MS);

  if (remaining > 0) {
    await interaction.reply({
      content: `⏰ Tekrar avlanmak icin **${Math.ceil(remaining / 1000)}s** beklemelisin.`,
      flags: 64,
    });
    return;
  }

  await interaction.deferReply();

  const [player, main] = await Promise.all([
    ctx.prisma.player.findUnique({ where: { id: userId } }),
    ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true } }),
  ]);
  if (!player || !main) {
    await interaction.editReply({ content: `❌ **Hata** | Main baykus bulunamadi.` });
    return;
  }

  const result = await rollHunt(ctx.prisma, userId, main.id);
  const compressed = compressHuntResult(result);

  const name = interaction.member && 'displayName' in interaction.member
    ? (interaction.member as { displayName: string }).displayName
    : interaction.user.username;

  await animateHuntInteraction({ editReply: interaction.editReply.bind(interaction) }, name, compressed);

  if (compressed.encounterId) {
    await sendEncounterMessage(
      { followUp: interaction.followUp.bind(interaction) },
      ctx,
      userId,
      compressed.encounterId,
      main,
    );
  }
}

// ─── Prefix: owl hunt ─────────────────────────────────────────────────────────

export async function runHuntMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = message.author.id;
  const cooldownKey = `cooldown:hunt:${userId}`;
  const remaining = await getCooldownRemainingMs(ctx.redis, cooldownKey, HUNT_COOLDOWN_MS);

  if (remaining > 0) {
    let secs = Math.ceil(remaining / 1000);
    const sent = await message.reply(`⏰ Tekrar avlanmak icin **${secs}s** beklemelisin.`);
    const interval = setInterval(async () => {
      secs--;
      if (secs <= 0) {
        clearInterval(interval);
        await sent.delete().catch(() => null);
      } else {
        await sent.edit(`⏰ Tekrar avlanmak icin **${secs}s** beklemelisin.`).catch(() => null);
      }
    }, 1000);
    return;
  }

  const [player, main] = await Promise.all([
    ctx.prisma.player.findUnique({ where: { id: userId } }),
    ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true } }),
  ]);
  if (!player || !main) {
    await message.reply(`❌ **Hata** | Main baykus bulunamadi.`);
    return;
  }

  const result = await rollHunt(ctx.prisma, userId, main.id);
  const compressed = compressHuntResult(result);
  const name = message.member?.displayName ?? message.author.username;

  // Aktif hunt buff'larını çek — hunt satırında göster
  const rawBuffs = await listActiveBuffs(ctx.prisma as any, userId);
  compressed.activeBuffs = rawBuffs
    .filter((b) => b.chargeCur > 0 && b.category === 'hunt')
    .map((b) => ({
      emoji: BUFF_ITEM_MAP[b.buffItemId]?.emoji ?? '✨',
      chargeCur: b.chargeCur,
      chargeMax: b.chargeMax,
    }));

  await animateHuntMessage(message, name, compressed);

  if (compressed.encounterId) {
    await sendEncounterMessage(
      { reply: message.reply.bind(message) },
      ctx,
      userId,
      compressed.encounterId,
      main,
    );
  }
}

// ─── Encounter mesajı ve buton handler ───────────────────────────────────────

export async function sendEncounterMessage(
  sender: { followUp?: Function; reply?: Function },
  ctx: Parameters<CommandDefinition['execute']>[1],
  userId: string,
  encounterId: string,
  playerOwl: {
    species: string; tier: number; quality: string;
    statGaga: number; statGoz: number; statKulak: number;
    statKanat: number; statPence: number; hp: number; hpMax: number;
  },
): Promise<void> {
  const encounter = await ctx.prisma.encounter.findFirst({
    where: { id: encounterId, playerId: userId },
    select: {
      id: true, status: true,
      owlSpecies: true, owlTier: true, owlQuality: true,
      owlStats: true, owlTraits: true,
    } as any,
  }) as any;

  if (!encounter || encounter.status !== 'open') return;

  const rawStats = encounter.owlStats as Record<string, number>;
  const wildData: EncounterOwlData = {
    species:   encounter.owlSpecies,
    tier:      encounter.owlTier,
    quality:   encounter.owlQuality,
    statGaga:  rawStats.gaga  ?? 10,
    statGoz:   rawStats.goz   ?? 10,
    statKulak: rawStats.kulak ?? 10,
    statKanat: rawStats.kanat ?? 10,
    statPence: rawStats.pence ?? 10,
    traits:    parseStoredTraits(encounter.owlTraits),
  };

  const playerData: PlayerOwlData = {
    species:   playerOwl.species,
    tier:      playerOwl.tier,
    quality:   playerOwl.quality,
    statGaga:  playerOwl.statGaga,
    statGoz:   playerOwl.statGoz,
    statKulak: playerOwl.statKulak,
    statKanat: playerOwl.statKanat,
    statPence: playerOwl.statPence,
    hp:        playerOwl.hp,
    hpMax:     playerOwl.hpMax,
  };

  const embed = buildEncounterEmbed(wildData, playerData);
  const row   = buildEncounterActionRow(encounterId);

  const sendFn = sender.followUp ?? sender.reply;
  if (!sendFn) return;

  const sent = await sendFn({ embeds: [embed], components: [row] }) as {
    createMessageComponentCollector: Function;
    edit: Function;
  };

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i: any) => i.user.id === userId && i.customId.startsWith('enc_'),
  });

  collector.on('collect', async (i: any) => {
    const [action, eid] = i.customId.split(':') as [string, string];

    const enc = await ctx.prisma.encounter.findFirst({
      where: { id: eid, playerId: userId },
      select: { status: true },
    });
    if (!enc || enc.status !== 'open') {
      await i.update({ content: '❌ Bu encounter artık aktif değil.', embeds: [], components: [] });
      collector.stop();
      return;
    }

    if (action === 'enc_flee') {
      await ctx.prisma.encounter.update({ where: { id: eid }, data: { status: 'closed' } });
      await i.update({ embeds: [buildEncounterFleeEmbed(wildData.species)], components: [] });
      collector.stop();
      return;
    }

    if (action === 'enc_tame') {
      await i.update({
        embeds: [],
        content: `🦉 Evcilleştirme başlatılıyor...\n\`owl tame ${eid}\` komutunu kullan veya aşağıdaki butona bas.`,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`enc_tame_start:${eid}`)
              .setLabel('🟢 Evcilleştirmeyi Başlat')
              .setStyle(ButtonStyle.Success),
          ),
        ],
      });

      const tameMsg = await i.fetchReply();
      const tameCollector = tameMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (bi: any) => bi.user.id === userId && bi.customId.startsWith('enc_tame_start:'),
      });

      tameCollector.on('collect', async (bi: any) => {
        tameCollector.stop();
        const freshMain = await ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true } });
        if (!freshMain) {
          await bi.update({ content: '❌ Main baykuş bulunamadı.', components: [] });
          return;
        }
        const freshEnc = await ctx.prisma.encounter.findFirst({ where: { id: eid, playerId: userId } });
        if (!freshEnc || freshEnc.status !== 'open') {
          await bi.update({ content: '❌ Encounter artık aktif değil.', components: [] });
          return;
        }

        const state = await createTameSession(
          ctx.redis, eid, userId,
          freshEnc.owlSpecies, freshEnc.owlTier, freshEnc.owlQuality,
          freshMain.statGoz, freshMain.statKulak,
        );
        const narrative = generateNarrative({
          personality: state.personality,
          action: 'silent',
          outcome: 'ongoing' as any,
          turn: state.turn,
          progress: state.progress,
          escapeRisk: state.escapeRisk,
          usedLines: state.usedLines,
        });
        state.usedLines = [...state.usedLines, narrative.reaction, narrative.hint].filter(Boolean).slice(-10);
        await updateTameSession(ctx.redis, state);

        await bi.update({
          content: null,
          embeds: [buildTameEncounterEmbed(state, narrative)],
          components: [buildTameActionRow(eid, state)],
        });

        const tameActionCollector = tameMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 120_000,
          filter: (ti: any) => ti.user.id === userId && ti.customId.startsWith('tame_'),
        });

        tameActionCollector.on('collect', async (ti: any) => {
          const actionMap: Record<string, TameAction> = {
            tame_silent: 'silent', tame_distract: 'distract', tame_advance: 'advance',
          };
          const actionKey = ti.customId.split(':')[0] ?? 'tame_silent';
          const current = await getTameSession(ctx.redis, userId);
          if (!current) {
            await ti.update({ content: '❌ Seans sona erdi.', embeds: [], components: [] });
            tameActionCollector.stop();
            return;
          }

          if (actionKey === 'tame_attempt') {
            tameActionCollector.stop('done');
            await deleteTameSession(ctx.redis, userId);
            const finalChance = calcFinalTameChance(current);
            const success = Math.random() * 100 < finalChance;
            await commitTameResult(ctx.prisma, userId, eid, success);
            const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
            await ti.update({ embeds: [buildTameResultEmbed(current, success, ending)], components: [] });
            return;
          }

          const tameAction = actionMap[actionKey] ?? 'silent';
          const turnResult = resolveTurn(current, tameAction);
          current.progress   = Math.max(0, Math.min(100, current.progress + turnResult.progressDelta));
          current.escapeRisk = Math.max(0, Math.min(100, current.escapeRisk + turnResult.escapeDelta));
          current.turn += 1;

          const tNarrative = generateNarrative({
            personality: current.personality, action: tameAction,
            outcome: turnResult.outcome === 'ongoing' ? 'success' : turnResult.outcome,
            turn: current.turn, progress: current.progress,
            escapeRisk: current.escapeRisk, usedLines: current.usedLines,
          });
          current.usedLines = [...current.usedLines, tNarrative.reaction, tNarrative.continuation, tNarrative.hint]
            .filter(Boolean).slice(-10);

          const isOver = turnResult.escaped || turnResult.tamed || current.turn > current.maxTurns;
          if (isOver) {
            tameActionCollector.stop('done');
            await deleteTameSession(ctx.redis, userId);
            const success = turnResult.tamed;
            await commitTameResult(ctx.prisma, userId, eid, success);
            const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
            await ti.update({ embeds: [buildTameResultEmbed(current, success, ending)], components: [] });
            return;
          }

          await updateTameSession(ctx.redis, current);
          const components: ActionRowBuilder<ButtonBuilder>[] = [buildTameActionRow(eid, current)];
          if (current.progress >= 50) components.push(buildTameFinalRow(eid, current));
          await ti.update({ embeds: [buildTameEncounterEmbed(current, tNarrative)], components });
        });

        tameActionCollector.on('end', async (_: any, reason: string) => {
          if (reason === 'time') {
            await deleteTameSession(ctx.redis, userId);
            await tameMsg.edit({ embeds: [buildTameTimeoutEmbed(state)], components: [] }).catch(() => null);
          }
        });
      });

      tameCollector.on('end', async (_: any, reason: string) => {
        if (reason === 'time') {
          await (tameMsg).edit({ content: '⏰ Süre doldu.', components: [] }).catch(() => null);
        }
      });

      collector.stop();
      return;
    }

    if (action === 'enc_fight') {
      await i.deferUpdate();
      try {
        const fightResult = await resolveEncounterFight(ctx.prisma, userId, eid);
        await i.editReply({ embeds: [buildEncounterFightEmbed(fightResult)], components: [] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bir hata oluştu.';
        await i.editReply({ content: `❌ ${msg}`, embeds: [], components: [] });
      }
      collector.stop();
      return;
    }
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await sent.edit({ embeds: [buildEncounterTimeoutEmbed(wildData.species)], components: [] }).catch(() => null);
      await ctx.prisma.encounter.update({
        where: { id: encounterId },
        data: { status: 'closed' },
      }).catch(() => null);
    }
  });
}
