import { EmbedBuilder, type Client } from 'discord.js';
import type { ModerationAction } from '../systems/moderation';
import { formatDurationTr } from '../systems/moderation';
import { COLORS } from './theme';

export async function sendModerationDm(
  client: Client | null | undefined,
  userId: string,
  action: ModerationAction,
): Promise<boolean> {
  if (!client) return false;

  let embed: EmbedBuilder;

  if (action.type === 'warned') {
    embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('⚠️ OwlHunt — Uyarı')
      .setDescription(
        `**${action.warnCount}/${action.threshold}** uyarı aldın.\n\n` +
        `📝 **Sebep:** ${action.reason}\n\n` +
        `${action.threshold}. uyarıda bot erişimin **geçici olarak** kapatılır.`,
      )
      .setTimestamp();
  } else {
    const durationLine =
      action.durationSec > 0
        ? `Bot erişimin **${formatDurationTr(action.durationSec)}** süreyle kapatıldı.`
        : 'Bot erişimin **kalıcı olarak** kapatıldı.';
    embed = new EmbedBuilder()
      .setColor(COLORS.DANGER)
      .setTitle('🔨 OwlHunt — Ceza')
      .setDescription(
        `${durationLine}\n\n` +
        `📝 **Sebep:** ${action.reason}\n\n` +
        (action.durationSec > 0
          ? 'Süre bitince tekrar oynayabilirsin.'
          : 'Engel kaldırılana kadar komut kullanamazsın.'),
      )
      .setTimestamp();
  }

  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

/** Arka planda DM — middleware'den çağrılabilir. */
export function notifyModerationDm(action: ModerationAction | null, userId: string): void {
  if (!action) return;
  const client = (async () => {
    const { getDiscordClient } = await import('./discord-client-ref');
    return getDiscordClient();
  })();
  void client.then((c) => sendModerationDm(c, userId, action));
}
