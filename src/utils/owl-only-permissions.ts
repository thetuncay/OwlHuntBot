import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildTextBasedChannel,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import { BLOCKED_ENTERTAINMENT_BOT_IDS } from '../config';

export type BotChannelPermSyncResult = {
  blocked: { id: string; tag: string }[];
  skippedNoPermission: boolean;
};

type PermManagedChannel = TextChannel | NewsChannel;

function asPermManagedChannel(channel: GuildTextBasedChannel): PermManagedChannel | null {
  if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
    return channel as TextChannel | NewsChannel;
  }
  return null;
}

function targetBotIds(guild: Guild, onlyIds?: readonly string[]): string[] {
  const selfId = guild.client.user?.id;
  const base = onlyIds ?? BLOCKED_ENTERTAINMENT_BOT_IDS;
  return base.filter((id) => id !== selfId);
}

function canManageChannel(guild: Guild, channel: PermManagedChannel): boolean {
  const me = guild.members.me;
  if (!me) return false;
  return (
    me.permissions.has(PermissionFlagsBits.ManageChannels) &&
    channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels) === true
  );
}

/**
 * OwlOnly oyun kanalında bilinen eğlence botlarına ViewChannel: Deny uygular.
 */
export async function applyEntertainmentBotChannelBlocks(
  guild: Guild,
  channel: GuildTextBasedChannel,
  onlyBotIds?: readonly string[],
): Promise<BotChannelPermSyncResult> {
  const result: BotChannelPermSyncResult = { blocked: [], skippedNoPermission: false };
  const permChannel = asPermManagedChannel(channel);
  if (!permChannel) return result;

  if (!canManageChannel(guild, permChannel)) {
    result.skippedNoPermission = true;
    return result;
  }

  for (const botId of targetBotIds(guild, onlyBotIds)) {
    let member;
    try {
      member = guild.members.cache.get(botId) ?? (await guild.members.fetch(botId));
    } catch {
      continue;
    }
    if (!member.user.bot) continue;

    await permChannel.permissionOverwrites.edit(botId, {
      ViewChannel: false,
    });

    result.blocked.push({ id: botId, tag: member.user.tag });
  }

  return result;
}

/** Kanaldan eğlence botu ViewChannel deny kayıtlarını kaldırır. */
export async function clearEntertainmentBotChannelBlocks(
  guild: Guild,
  channel: GuildTextBasedChannel,
): Promise<void> {
  const permChannel = asPermManagedChannel(channel);
  if (!permChannel) return;
  if (!canManageChannel(guild, permChannel)) return;

  for (const botId of targetBotIds(guild)) {
    await permChannel.permissionOverwrites.delete(botId).catch(() => null);
  }
}

export function formatBotPermSyncNote(result: BotChannelPermSyncResult): string {
  if (result.skippedNoPermission) {
    return '\n⚠️ **Kanalları Yönet** yetkisi yok — eğlence botları için izin güncellenemedi. Bot rolüne bu yetkiyi ver ve `/owlonly add` komutunu tekrar çalıştır.';
  }
  if (result.blocked.length === 0) {
    return '\nℹ️ Bu sunucuda engellenecek eğlence botu bulunamadı (henüz ekli değiller).';
  }
  const names = result.blocked.map((b) => b.tag).join(', ');
  return `\n🔒 **${result.blocked.length}** eğlence botu bu kanalı göremez: ${names}`;
}
