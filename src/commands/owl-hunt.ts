/**
 * owl-hunt.ts — /owl hunt komutu + encounter mesajı
 *
 * Tek av bölgesi (b0); biyom seçimi yok — cooldown sonrası direkt av.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  type Message,
  type MessageCreateOptions,
  type SendableChannels,
} from 'discord.js';
import { HUNT_COOLDOWN_MS, HUNT_COOLDOWN_MAX_REMAINING_MS, DEFAULT_HUNT_BIOME_ID } from '../config';
import { armCooldown, clearCooldown, peekCooldownBounded } from '../middleware/cooldown-manager';
import { rollHunt, runHuntSideEffects } from '../systems/hunt';
import { commitTameResult } from '../systems/tame';
import {
  createTameSession,
  getTameSession,
  updateTameSession,
  deleteTameSession,
  resolveTurn,
  addUsedLine,
} from '../systems/tame-session';
import { generateNarrative, generateEnding } from '../utils/tame-narrative';
import type { TameAction } from '../utils/tame-narrative';
import {
  buildTameEncounterEmbed,
  buildTameResultMessage,
  buildTameTimeoutEmbed,
  buildTameActionRow,
  buildTameFinalRow,
  calcFinalTameChance,
} from '../utils/tame-ux';
import { maybeAppendLevel5DiscordHint } from '../utils/community-discord';
import { buildFinalMessage, compressHuntResult } from '../utils/hunt-ux';
import {
  formatHuntMilestoneRewardLine,
  huntSeriesXpMult,
} from '../systems/hunt-milestones';
import { safeReply } from '../utils/safe-reply';
import { interactionReplyWithSuppression, replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import {
  logCommandError,
  shouldNotifyUserOnDiscord,
  userErrorMessage,
} from '../utils/command-error';
import { getCooldownHint, scheduleCooldownHintRefresh } from '../utils/cooldown-hint';
import { getGuildPrefix } from '../utils/prefix';
import { runDetached } from '../utils/async';
import { trackHuntQuests, type HuntQuestTrackPayload } from '../systems/quest-tracker';
import { formatQuestCompletionLines } from '../utils/quest-ux';
import {
  buildEncounterEmbed,
  buildEncounterActionRow,
  buildEncounterFightMessage,
  buildEncounterFleeEmbed,
  buildEncounterTimeoutEmbed,
} from '../utils/encounter-ux';
import type { EncounterOwlData, PlayerOwlData } from '../utils/encounter-ux';
import { resolveEncounterFight, estimateEncounterFightRewards } from '../systems/encounter-fight';
import { parseStoredTraits } from '../systems/traits';
import { buildCooldownMessage } from '../utils/command-error';
import { resolveFlowRejectMessage } from '../utils/flow-helpers';
import { buildHuntProgressMessage } from '../middleware/flow-intent';
import { markFirstHuntComplete } from '../systems/onboarding';
import { appendUpgradeHintIfNewbie } from '../utils/newbie-hints';
import { formatNewbieBoostLine } from '../systems/newbie-boost';
import type { CommandDefinition } from '../types';
import type { CachedOwlData } from '../utils/player-cache';
import { retentionTuningForUser } from '../systems/retention/abtest';
import { applySocialHuntBonuses } from '../systems/social-retention';
import { currentLiveOpsModifier } from '../systems/liveops-cadence';
import { addXP } from '../systems/xp';
import { collectHuntExtraLines } from '../utils/hunt-extras';
import { recordHuntBudgetSample, recordFrustrationCooldown, touchEngagementSession } from '../systems/engagement-metrics';
import { performance } from 'node:perf_hooks';

function spawnHuntQuestFollowUp(
  sender: {
    followUp?: Function;
    reply?: Function;
    channelSend?: (text: string) => Promise<unknown>;
  },
  prisma: Parameters<CommandDefinition['execute']>[1]['prisma'],
  redis: Parameters<CommandDefinition['execute']>[1]['redis'],
  userId: string,
  payload: HuntQuestTrackPayload,
  prefix: string,
): void {
  runDetached('hunt-quests', async () => {
    const notices = await trackHuntQuests(prisma, userId, payload, redis);
    if (notices.length === 0) return;
    const text = formatQuestCompletionLines(notices, prefix).join('\n');
    if (sender.channelSend) {
      await sender.channelSend(text).catch(() => null);
      return;
    }
    const sendFn = sender.followUp ?? sender.reply;
    if (sendFn) await sendFn({ content: text }).catch(() => null);
  });
}

function huntCooldownKey(userId: string): string {
  return `cooldown:hunt:${userId}`;
}

/** true = hunt devam edebilir, false = cooldown/spam engeli */
async function enforceHuntCooldown(
  redis: Parameters<CommandDefinition['execute']>[1]['redis'],
  userId: string,
  displayName: string,
  prefix: string,
  notify: (content: string) => Promise<void>,
): Promise<boolean> {
  const cooldown = await peekCooldownBounded(
    redis,
    huntCooldownKey(userId),
    HUNT_COOLDOWN_MAX_REMAINING_MS,
  );
  if (!cooldown.active) return true;
  if (cooldown.remainingMs > HUNT_COOLDOWN_MAX_REMAINING_MS) {
    await clearCooldown(redis, huntCooldownKey(userId));
    return true;
  }
  const base = buildCooldownMessage(cooldown.remainingMs, 'hunt', displayName);
  const hint = await getCooldownHint(redis, userId, prefix);
  const withHint = hint ? `${base}\n${hint}` : base;
  const msg = await resolveFlowRejectMessage(redis, userId, 'hunt', 'cooldown', withHint);
  await notify(msg);
  await recordFrustrationCooldown(redis).catch(() => undefined);
  return false;
}

// ─── Hunt sonrasi async encounter ────────────────────────────────────────────

function spawnHuntFollowUp(
  sender: { followUp?: Function; reply?: Function },
  ctx: Parameters<CommandDefinition['execute']>[1],
  userId: string,
  player: { level: number; prestigeLevel?: number },
  mainOwl: CachedOwlData,
  hasCritical: boolean,
  prefix = 'w',
  playerDisplayName?: string,
): void {
  void runHuntSideEffects(ctx.prisma, ctx.redis, userId, player, {
    tier: mainOwl.tier,
    statGoz: mainOwl.statGoz,
    statKulak: mainOwl.statKulak,
    statGaga: mainOwl.statGaga,
    statKanat: mainOwl.statKanat,
    statPence: mainOwl.statPence,
  }, hasCritical).then(({ encounterId }) => {
    if (encounterId) {
      void sendEncounterMessage(sender, ctx, userId, encounterId, mainOwl, prefix, playerDisplayName);
    }
  }).catch(() => null);
}

// ─── Prefix: owl hunt ─────────────────────────────────────────────────────────

export async function runHuntMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = message.author.id;
  const huntDisplayName = message.member?.displayName ?? message.author.displayName ?? message.author.username;

  const cooldownPrefix = message.guildId
    ? await getGuildPrefix(ctx.redis, message.guildId).catch(() => 'w')
    : 'w';
  const canHunt = await enforceHuntCooldown(
    ctx.redis,
    userId,
    huntDisplayName,
    cooldownPrefix,
    async (content) => {
      await replyWithSuppression(message, content, SuppressionKeys.cooldown(huntCooldownKey(userId)));
    },
  );
  if (!canHunt) return;

  const huntCountRaw = await ctx.redis.get(`onboard:hunt:${userId}`);
  const huntCount = parseInt(huntCountRaw ?? '0', 10);
  const skipLoading = huntCount >= 5;

  let loadingMsg: Awaited<ReturnType<typeof safeReply>> | null = null;
  try {
    if (!skipLoading) {
      const progressMsg = buildHuntProgressMessage();
      if (progressMsg) {
        loadingMsg = await safeReply(message, progressMsg);
      }
    }
    const huntStartedAt = performance.now();
    const result = await rollHunt(
      ctx.prisma,
      ctx.redis,
      userId,
      undefined,
      DEFAULT_HUNT_BIOME_ID,
      true,
      message.guildId,
    );
    const compressed = compressHuntResult(result);
    const milestone = result.huntMilestone;
    if (milestone) {
      compressed.huntMilestoneProgress = milestone.progressLabel;
      compressed.huntMilestoneApproaching = milestone.approaching;
      const seriesMult = huntSeriesXpMult(milestone.count);
      if (seriesMult > 1) {
        compressed.huntSeriesXpBonusPct = Math.round((seriesMult - 1) * 100);
      }
      if (milestone.reward) {
        compressed.huntMilestoneRewardLine = formatHuntMilestoneRewardLine(milestone.reward);
      }
    }
    await armCooldown(ctx.redis, huntCooldownKey(userId), HUNT_COOLDOWN_MS);
    const prefix = cooldownPrefix;
    const finalText = await maybeAppendLevel5DiscordHint(
      ctx.redis,
      userId,
      buildFinalMessage(huntDisplayName, compressed, prefix),
      compressed,
      prefix,
    );
    const isFirstHunt = await markFirstHuntComplete(ctx.redis, userId);
    const huntCountAfter = huntCount + 1;
    const extraLines = await collectHuntExtraLines(
      ctx.redis,
      ctx.prisma,
      userId,
      result,
      {
        time: {
          window: 'day',
          xpMult: result.timeXpMult ?? 1,
          rareBonus: result.timeRareBonus ?? 0,
          line: result.timeOfDayLine ?? null,
        },
        micro: {
          triggered: Boolean(result.microEventLine),
          bonusXp: result.microEventXp ?? 0,
          line: result.microEventLine ?? null,
        },
        guaranteed: result.guaranteedCatch === true,
      },
      huntCountAfter,
      prefix,
    );
    await touchEngagementSession(ctx.redis, userId).catch(() => undefined);
    await recordHuntBudgetSample(ctx.redis, performance.now() - huntStartedAt).catch(() => undefined);
    let huntText = isFirstHunt
      ? `${finalText}\n\n💡 **İlk av tamam!**\n` +
        `• Coin için: \`${prefix} sell all\`\n` +
        `• Upgrade materyali için: \`${prefix} parçala fare\` (detay: \`${prefix} parçala\`)`
      : finalText;
    huntText = await appendUpgradeHintIfNewbie(ctx.prisma, userId, huntText, prefix, { isFirstHunt });
    const tuning = retentionTuningForUser(userId);
    const liveOps = currentLiveOpsModifier();
    const liveOpsXp = liveOps.huntBonusRate > 0 ? Math.round(result.totalXP * liveOps.huntBonusRate) : 0;
    if (liveOpsXp > 0) {
      await addXP(ctx.prisma, userId, liveOpsXp, 'liveOpsHunt', undefined, undefined, ctx.redis);
      huntText += `\n🎉 ${liveOps.label}: +${liveOpsXp} XP`;
    }
    const social = await applySocialHuntBonuses(
      ctx.prisma,
      ctx.redis,
      userId,
      message.guildId ?? null,
      message.channelId ?? null,
      tuning.socialBonusMult,
    );
    if (social.lines.length > 0) {
      huntText += `\n${social.lines.join('\n')}`;
    }
    const playerMeta = await ctx.prisma.player.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    const newbieLine = playerMeta ? formatNewbieBoostLine(playerMeta.createdAt) : null;
    if (newbieLine) huntText += `\n${newbieLine}`;
    if (extraLines.length > 0) huntText += `\n${extraLines.join('\n')}`;
    if (loadingMsg) {
      await loadingMsg.edit(huntText).catch(() => safeReply(message, huntText));
    } else {
      await safeReply(message, huntText);
    }

    if (result.questTrackPayload) {
      const sendable = message.channel?.isSendable() ? (message.channel as SendableChannels) : null;
      spawnHuntQuestFollowUp(
        sendable
          ? { channelSend: (text: string) => sendable.send(text) }
          : { reply: (payload: unknown) => safeReply(message, payload as Parameters<typeof safeReply>[1]) },
        ctx.prisma,
        ctx.redis,
        userId,
        result.questTrackPayload,
        prefix,
      );
    }

    // Cooldown ipucu cache'ini tazele — bir sonraki cooldown mesajı taze görev
    // sayısını gösterebilsin (A3 / DDR-006). Fire-and-forget.
    scheduleCooldownHintRefresh(ctx.redis, ctx.prisma, userId);

    if (result.playerSnapshot && result.owlSnapshot) {
      spawnHuntFollowUp(
        { reply: (payload: unknown) => safeReply(message, payload as Parameters<typeof safeReply>[1]) },
        ctx,
        userId,
        result.playerSnapshot,
        result.owlSnapshot as CachedOwlData,
        result.catches.some((c) => c.critical),
        prefix,
        huntDisplayName,
      );
    }
  } catch (err: unknown) {
    if (shouldNotifyUserOnDiscord(err)) {
      const text = userErrorMessage(err);
      if (loadingMsg) {
        await loadingMsg.edit(text).catch(() => safeReply(message, { content: text }));
      } else {
        await safeReply(message, { content: text });
      }
    } else {
      logCommandError('Hunt Message Error', err);
      if (loadingMsg) await loadingMsg.delete().catch(() => null);
    }
  }
}

// ─── Encounter mesajı ve buton handler ───────────────────────────────────────

export async function sendEncounterMessage(
  sender: { followUp?: Function; reply?: Function },
  ctx: Parameters<CommandDefinition['execute']>[1],
  userId: string,
  encounterId: string,
  playerOwl: {
    species: string; nickname?: string | null; tier: number; quality: string;
    statGaga: number; statGoz: number; statKulak: number;
    statKanat: number; statPence: number; hp: number; hpMax: number;
  },
  prefix = 'w',
  ownerDisplayName?: string | null,
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
    nickname:  playerOwl.nickname ?? null,
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

  const sumStats = (d: EncounterOwlData | PlayerOwlData) =>
    d.statGaga + d.statGoz + d.statKulak + d.statKanat + d.statPence;

  const fightPreview = estimateEncounterFightRewards(
    wildData.tier,
    wildData.quality,
    sumStats(playerData),
    sumStats(wildData),
  );

  const embed = buildEncounterEmbed(wildData, playerData, fightPreview, prefix, ownerDisplayName);
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
      const freshMain = await ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true } });
      if (!freshMain) {
        await i.update({ content: '❌ Main baykuş bulunamadı.', embeds: [], components: [] });
        collector.stop();
        return;
      }
      const freshEnc = await ctx.prisma.encounter.findFirst({ where: { id: eid, playerId: userId } });
      if (!freshEnc || freshEnc.status !== 'open') {
        await i.update({ content: '❌ Encounter artık aktif değil.', embeds: [], components: [] });
        collector.stop();
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
      for (const line of [narrative.reaction, narrative.hint].filter(Boolean)) {
        addUsedLine(state, line);
      }
      await updateTameSession(ctx.redis, state);

      await i.update({
        content: null,
        embeds: [buildTameEncounterEmbed(state, narrative)],
        components: [buildTameActionRow(eid, state)],
      });

      const tameMsg = await i.fetchReply();
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
            await commitTameResult(ctx.prisma, userId, eid, success, ctx.redis);
            const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
            await ti.update({ content: buildTameResultMessage(current, success, prefix), embeds: [], components: [] });
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
          for (const line of [tNarrative.reaction, tNarrative.continuation, tNarrative.hint].filter(Boolean)) {
            addUsedLine(current, line);
          }

          const isOver = turnResult.escaped || turnResult.tamed || current.turn > current.maxTurns;
          if (isOver) {
            tameActionCollector.stop('done');
            await deleteTameSession(ctx.redis, userId);
            const success = turnResult.tamed;
            await commitTameResult(ctx.prisma, userId, eid, success, ctx.redis);
            const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
            await ti.update({ content: buildTameResultMessage(current, success, prefix), embeds: [], components: [] });
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

      collector.stop();
      return;
    }

    if (action === 'enc_fight') {
      await i.deferUpdate();
      try {
        const fightResult = await resolveEncounterFight(ctx.prisma, userId, eid, ctx.redis);
        const actorName = i.member?.displayName ?? i.user?.displayName ?? i.user?.username ?? 'Oyuncu';
        await i.editReply({
          content: buildEncounterFightMessage(fightResult, actorName),
          embeds: [],
          components: [],
        });
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
