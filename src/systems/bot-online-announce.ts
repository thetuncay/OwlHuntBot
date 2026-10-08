/**
 * Bot her ClientReady olduğunda ana sunucuda rol etiketleyip "bot aktif" duyurusu.
 */
import type { Client, TextChannel } from 'discord.js';

function envId(key: string, fallback = ''): string {
  const v = process.env[key]?.trim();
  return v && /^\d+$/.test(v) ? v : fallback;
}

/** Şimdilik kapalı: her restart rol etiketli duyuru atıyordu. Geri açmak için false yap. */
function onlineAnnouncePaused(): boolean {
  return true;
}

export async function announceBotOnline(client: Client): Promise<void> {
  if (onlineAnnouncePaused()) {
    console.info('[BotOnline] Duyuru simdilik kapali');
    return;
  }

  const enabled = (process.env.BOT_ONLINE_ANNOUNCE ?? '1').trim() !== '0';
  if (!enabled) return;

  const guildId = envId('BOT_ONLINE_GUILD_ID', envId('MAIN_GUILD_ID'));
  const roleId = envId('BOT_ONLINE_ROLE_ID');
  const channelIdEnv = envId('BOT_ONLINE_CHANNEL_ID');

  if (!guildId || !roleId) {
    console.warn('[BotOnline] BOT_ONLINE_GUILD_ID / BOT_ONLINE_ROLE_ID eksik — duyuru atlandi');
    return;
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    const channelId = channelIdEnv || guild.systemChannelId || '';
    if (!channelId) {
      console.warn('[BotOnline] Kanal yok — BOT_ONLINE_CHANNEL_ID veya system channel gerekli');
      return;
    }

    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      console.warn(`[BotOnline] Kanal metin degil veya bulunamadi: ${channelId}`);
      return;
    }

    const text = (process.env.BOT_ONLINE_MESSAGE?.trim() || '<@&ROLE> bot aktif').replace(
      /<@&ROLE>|\{role\}/gi,
      `<@&${roleId}>`,
    );

    await (channel as TextChannel).send({
      content: text,
      allowedMentions: { roles: [roleId] },
    });
    console.info(`[BotOnline] Duyuru gonderildi (#${channelId})`);
  } catch (err) {
    console.warn('[BotOnline] Duyuru basarisiz:', err instanceof Error ? err.message : err);
  }
}
