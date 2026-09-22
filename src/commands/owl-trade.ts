/**
 * owl-trade.ts — `owl trade @user` davet akışı
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
} from 'discord.js';
import type { CommandContext } from '../types';
import { TRADE_INVITE_TTL_MS } from '../config/trade';
import { TradeError, createTradeInvite } from '../systems/trade';
import { formatTradeLogLines, listTradeLog } from '../systems/trade-log';
import {
  buildInviteAcceptId,
  buildInviteCancelId,
  buildInviteDeclineId,
} from '../utils/trade-customid';
import { replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';

function inviteRow(inviteId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildInviteAcceptId(inviteId))
      .setLabel('Kabul')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildInviteDeclineId(inviteId))
      .setLabel('Reddet')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildInviteCancelId(inviteId))
      .setLabel('İptal')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Prefix: `owl trade @oyuncu`
 */
export async function runTradeMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  helpPrefix: string,
): Promise<void> {
  const sub = (args[0] ?? '').toLowerCase();
  if (sub === 'log' || sub === 'geçmiş' || sub === 'gecmis') {
    const entries = await listTradeLog(ctx.redis, message.author.id);
    await message.reply(['📜 **Trade geçmişin**', ...formatTradeLogLines(entries)].join('\n'));
    return;
  }

  const target = message.mentions.users.first();
  if (!target || target.bot) {
    await replyWithSuppression(
      message,
      {
        content: `Kullanım: \`${helpPrefix} trade @oyuncu\` · \`${helpPrefix} trade log\``,
      },
      SuppressionKeys.usage('trade', 'mention'),
    );
    return;
  }

  const fromName = message.member?.displayName ?? message.author.displayName ?? message.author.username;
  const toMember = message.guild?.members.cache.get(target.id);
  const toName = toMember?.displayName ?? target.displayName ?? target.username;

  try {
    const invite = await createTradeInvite(ctx.redis, ctx.prisma, {
      fromId: message.author.id,
      fromName,
      toId: target.id,
      toName,
      channelId: message.channelId,
      guildId: message.guildId,
    });

    const ttlSec = Math.ceil(TRADE_INVITE_TTL_MS / 1000);
    await message.reply({
      content: [
        `**${fromName}** → <@${target.id}> trade daveti`,
        `_Kabul için ${ttlSec} sn_`,
      ].join('\n'),
      components: [inviteRow(invite.id)],
    });
  } catch (err) {
    const text = err instanceof TradeError ? err.message : 'Trade daveti gönderilemedi.';
    await replyWithSuppression(
      message,
      { content: text },
      SuppressionKeys.usage('trade', 'error'),
    );
  }
}
