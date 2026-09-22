import {
  EmbedBuilder,
  type Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ButtonInteraction,
} from 'discord.js';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';
import { buildRewardClaimMessage } from '../utils/result-ux';
import { ensureDailyQuests, claimQuestReward, countUnclaimedReadyQuests } from '../systems/daily-quests';
import { fireQuest } from '../systems/quest-tracker';
import { infoEmbed } from '../utils/embed';
import { formatDailyQuestLabel, type DailyQuestType } from '../config';
import type { CommandContext } from '../types';
import { hpBar } from '../utils/theme';
import { formatFlowHint, getFlowHints } from '../utils/alias-command';
import { embedWithLostFooterIfNeeded } from '../utils/flow-helpers';
import { formatQuestReadyBanner } from '../utils/quest-ux';
import type Redis from 'ioredis';
import type { PrismaClient } from '@prisma/client';

const QUEST_COLLECTOR_MS = 120_000;

interface DailyQuestRow {
  id: string;
  type: string;
  target: number;
  current: number;
  rewardCoins: number;
  rewardXp: number;
  isClaimed: boolean;
  meta: string | null;
}

async function claimQuestWithDebounce(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
  questId: string,
): Promise<Awaited<ReturnType<typeof claimQuestReward>>> {
  const claimBusyKey = `quest:claim:busy:${userId}`;
  const busy = await redis.set(claimBusyKey, '1', 'EX', 8, 'NX');
  if (busy !== 'OK') {
    throw new Error('⏳ Ödül işleniyor.');
  }
  try {
    return await claimQuestReward(prisma, userId, questId, redis);
  } finally {
    await redis.del(claimBusyKey).catch(() => null);
  }
}

function buildDailyQuestBoard(
  quests: DailyQuestRow[],
  readyCount: number,
  prefix: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const readyBanner = formatQuestReadyBanner(readyCount, prefix);
  const embed = new EmbedBuilder()
    .setTitle('📅 Günlük Görevler')
    .setColor(0xf1c40f)
    .setFooter({ text: formatFlowHint(getFlowHints().afterQuests, prefix) });

  if (readyBanner) {
    embed.setDescription(readyBanner);
  }

  const row = new ActionRowBuilder<ButtonBuilder>();

  quests.forEach((q, i) => {
    const questType = q.type as DailyQuestType;
    const label = formatDailyQuestLabel(questType, q.target, q.meta);
    const reward =
      `${COIN_EMOJI} **${Math.trunc(q.rewardCoins).toLocaleString('tr-TR')}**` +
      ` · ${XP_EMOJI} **${Math.trunc(q.rewardXp).toLocaleString('tr-TR')}**`;
    const status = q.isClaimed
      ? '✅'
      : q.current >= q.target
        ? '🌟'
        : `\`${hpBar(q.current, q.target, 8)}\` **${q.current}/${q.target}**`;

    embed.addFields({
      name: `${i + 1}. ${label}`,
      value: `${status} · ${reward}`,
      inline: false,
    });

    if (!q.isClaimed && q.current >= q.target && row.components.length < 5) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_quest:${q.id}`)
          .setLabel(`${i + 1}`)
          .setEmoji('🎁')
          .setStyle(ButtonStyle.Success),
      );
    }
  });

  return { embed, row };
}

async function refreshDailyBoard(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  prefix: string,
): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const quests = await prisma.dailyQuest.findMany({
    where: { playerId: userId, resetAt: { gt: new Date() } },
  });
  const readyCount = await countUnclaimedReadyQuests(prisma, userId, redis);
  let { embed, row } = buildDailyQuestBoard(quests, readyCount, prefix);
  embed = await embedWithLostFooterIfNeeded(redis, userId, 'quests', embed);
  return {
    embed,
    components: row.components.length > 0 ? [row] : [],
  };
}

/**
 * /owl quests komutu (UI)
 */
export async function runQuestsMessage(
  message: Message,
  _args: string[],
  ctx: CommandContext,
  prefix: string,
): Promise<void> {
  const userId = message.author.id;

  await ensureDailyQuests(ctx.prisma, userId, ctx.redis);

  const questCount = await ctx.prisma.dailyQuest.count({
    where: { playerId: userId, resetAt: { gt: new Date() } },
  });
  if (questCount === 0) {
    await message.reply({ embeds: [infoEmbed('Günlük Görevler', 'Şu anda aktif görev bulunmuyor.')] });
    return;
  }

  const board = await refreshDailyBoard(ctx.prisma, ctx.redis, userId, prefix);

  const sent = await message.reply({
    embeds: [board.embed],
    components: board.components,
  });

  if (board.components.length === 0) return;

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: QUEST_COLLECTOR_MS,
    filter: (i) => i.user.id === userId && i.customId.startsWith('claim_quest:'),
  });

  collector.on('collect', async (i: ButtonInteraction) => {
    const questId = i.customId.split(':')[1];
    if (!questId) return;

    try {
      const reward = await claimQuestWithDebounce(ctx.redis, ctx.prisma, userId, questId);
      await fireQuest(ctx.prisma, userId, 'daily_claim', 1);

      const refreshed = await refreshDailyBoard(ctx.prisma, ctx.redis, userId, prefix);
      await i.update({
        embeds: [refreshed.embed],
        components: refreshed.components,
      });

      const text = buildRewardClaimMessage({
        headline: '🎁 Görev ödülü alındı.',
        xp: reward.xp,
        coin: reward.coins,
        level: reward.levelAfter,
        currentXp: reward.xpAfter,
        extras: [
          ...(reward.levelUp ? ['🆙 Seviye atladın!'] : []),
          `💡 ${formatFlowHint(getFlowHints().afterQuests, prefix)}`,
        ],
      });
      await i.followUp({ content: text, flags: 64 });

      if (refreshed.components.length === 0) {
        collector.stop('all_claimed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ödül alınamadı.';
      if (msg.includes('Ödül işleniyor')) {
        await i.reply({ content: msg, flags: 64 }).catch(() => null);
      } else {
        await i.reply({ content: `❌ ${msg}`, flags: 64 }).catch(() => null);
      }
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'all_claimed') return;
    sent.edit({ components: [] }).catch(() => null);
  });
}

/**
 * Slash: /owl quests — kaldırıldı; yalnızca prefix.
 */
