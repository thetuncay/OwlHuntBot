import {
  ChannelType,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
  type Message,
} from 'discord.js';
import type { CommandContext } from '../types';
import { failEmbed } from '../utils/embed';
import { replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import {
  addOwlOnlyChannel,
  clearOwlOnlyChannels,
  formatChannelMentions,
  getOwlOnlyChannelIds,
  OWL_ONLY_MAX_CHANNELS,
  removeOwlOnlyChannel,
} from '../utils/owl-only-channels';
import {
  applyEntertainmentBotChannelBlocks,
  clearEntertainmentBotChannelBlocks,
  formatBotPermSyncNote,
} from '../utils/owl-only-permissions';

function isGuildAdministratorMessage(message: Message): boolean {
  if (!message.guildId || !message.guild) return false;
  if (message.guild.ownerId === message.author.id) return true;
  return message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
}

function resolveTextChannelIdFromArgs(message: Message, args: string[]): string | null {
  const channelMention = args.find((a) => /^<#(\d+)>$/.test(a));
  if (channelMention) {
    const id = channelMention.match(/^<#(\d+)>$/)?.[1];
    if (id) return id;
  }
  const idArg = args.find((a) => /^\d{17,20}$/.test(a));
  if (idArg) return idArg;
  if (message.channelId && message.guildId) return message.channelId;
  return null;
}

function resolveGuildTextChannel(
  message: Message,
  channelId: string,
): GuildTextBasedChannel | null {
  const channel = message.guild?.channels.cache.get(channelId);
  if (channel?.isTextBased()) return channel;
  return null;
}

export async function runOwlOnlyMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  if (!message.guildId || !message.guild) {
    await replyWithSuppression(
      message,
      { embeds: [failEmbed('Hata', 'Bu komut yalnızca sunucuda kullanılabilir.')] },
      SuppressionKeys.permission('owlonly-guild'),
    );
    return;
  }

  if (!isGuildAdministratorMessage(message)) {
    await replyWithSuppression(
      message,
      { embeds: [failEmbed('Yetki', 'Bu komutu yalnızca sunucu **Yönetici**leri kullanabilir.')] },
      SuppressionKeys.permission('owlonly-admin'),
    );
    return;
  }

  const sub = (args[0] ?? 'list').toLowerCase();
  const rest = args.slice(1);

  if (sub === 'list') {
    const ids = await getOwlOnlyChannelIds(ctx.redis, message.guildId);
    const lines =
      ids.length === 0
        ? 'Henüz kısıtlama yok — **tüm kanallarda** oyun komutları çalışır.\n`w owlonly add` ile oyun odası ekleyebilirsin.'
        : `Oyun komutları yalnızca şu kanallarda:\n${formatChannelMentions(ids)}\n\nBu kanallarda bilinen **eğlence botları kanalı göremez** (izin kilidi).\nMaks. ${OWL_ONLY_MAX_CHANNELS} kanal.`;
    await replyWithSuppression(
      message,
      { content: `🦉 **OwlOnly**\n${lines}` },
      SuppressionKeys.state('owlonly-list'),
    );
    return;
  }

  if (sub === 'clear') {
    const ids = await getOwlOnlyChannelIds(ctx.redis, message.guildId);
    for (const id of ids) {
      const ch = resolveGuildTextChannel(message, id);
      if (ch) await clearEntertainmentBotChannelBlocks(message.guild, ch);
    }
    await clearOwlOnlyChannels(ctx.redis, message.guildId);
    await replyWithSuppression(
      message,
      {
        content:
          '✅ **OwlOnly kapatıldı** — bot artık bu sunucuda **tüm kanallarda** kullanılabilir.\nEğlence botu kanal izinleri geri alındı.',
      },
      SuppressionKeys.state('owlonly-clear'),
    );
    return;
  }

  if (sub !== 'add' && sub !== 'remove') {
    await replyWithSuppression(
      message,
      {
        content:
          '❌ Kullanım: `w owlonly add [#kanal]`, `w owlonly remove [#kanal]`, `w owlonly list`, `w owlonly clear`',
      },
      SuppressionKeys.usage('owlonly'),
    );
    return;
  }

  const channelId = resolveTextChannelIdFromArgs(message, rest);
  if (!channelId) {
    await replyWithSuppression(
      message,
      { embeds: [failEmbed('Hata', 'Geçerli bir metin kanalı seç veya komutu bir kanalda çalıştır.')] },
      SuppressionKeys.usage('owlonly-channel'),
    );
    return;
  }

  const channel = resolveGuildTextChannel(message, channelId);
  if (!channel) {
    await replyWithSuppression(
      message,
      { embeds: [failEmbed('Hata', 'Yalnızca metin veya duyuru kanalları eklenebilir.')] },
      SuppressionKeys.usage('owlonly-channel-type'),
    );
    return;
  }

  const channelTypeOk =
    channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
  if (!channelTypeOk) {
    await replyWithSuppression(
      message,
      { embeds: [failEmbed('Hata', 'Yalnızca metin veya duyuru kanalları eklenebilir.')] },
      SuppressionKeys.usage('owlonly-channel-type'),
    );
    return;
  }

  if (sub === 'add') {
    try {
      const { added, total } = await addOwlOnlyChannel(ctx.redis, message.guildId, channelId);
      const mention = `<#${channelId}>`;
      const permNote = added
        ? formatBotPermSyncNote(await applyEntertainmentBotChannelBlocks(message.guild, channel))
        : '';
      if (!added) {
        await replyWithSuppression(
          message,
          { content: `ℹ️ ${mention} zaten listede. (Toplam **${total}** kanal)${permNote}` },
          SuppressionKeys.state('owlonly-add-dup'),
        );
        return;
      }
      await replyWithSuppression(
        message,
        {
          content:
            `✅ ${mention} **oyun kanalı** olarak eklendi.\n` +
            `Artık oyun komutları bu sunucuda **yalnızca** izinli kanallarda çalışır. (${total}/${OWL_ONLY_MAX_CHANNELS})` +
            permNote,
        },
        SuppressionKeys.state('owlonly-add'),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await replyWithSuppression(
        message,
        { embeds: [failEmbed('Limit', msg)] },
        SuppressionKeys.state('owlonly-add-err'),
      );
    }
    return;
  }

  const { removed, total } = await removeOwlOnlyChannel(ctx.redis, message.guildId, channelId);
  const mention = `<#${channelId}>`;
  if (removed) {
    await clearEntertainmentBotChannelBlocks(message.guild, channel);
  }
  if (!removed) {
    await replyWithSuppression(
      message,
      { content: `ℹ️ ${mention} listede değildi.` },
      SuppressionKeys.state('owlonly-remove-miss'),
    );
    return;
  }
  const tail =
    total === 0
      ? ' Kısıtlama kalktı — bot yine **tüm kanallarda** kullanılabilir.'
      : ` Kalan kanallar: ${formatChannelMentions(await getOwlOnlyChannelIds(ctx.redis, message.guildId))}`;
  await replyWithSuppression(
    message,
    { content: `✅ ${mention} listeden çıkarıldı. Eğlence botu izinleri geri alındı.${tail}` },
    SuppressionKeys.state('owlonly-remove'),
  );
}
