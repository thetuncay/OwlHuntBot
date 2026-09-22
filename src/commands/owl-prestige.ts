import { EmbedBuilder, type Message } from 'discord.js';
import { infoEmbed } from '../utils/embed';
import { getGuildPrefix } from '../utils/prefix';
import type { CommandContext } from '../types';

export async function runPrestigeMessage(
  message: Message,
  _args: string[],
  _ctx: CommandContext,
  prefix: string,
): Promise<void> {
  const msg =
    '🌟 **Prestige sistemi kaldırıldı.**\n\n' +
    `İlerlemeni artık **upgrade** (\`${prefix} upgrade\`) ile sürdürürsün. ` +
    'Doğuş gücü (tame) ve eğitim (upgrade) ayrı katmanlarda takip edilir.';
  await message.reply({ embeds: [infoEmbed('Prestige Kaldırıldı', msg)] });
}

export async function runPrestigeSlash(
  interaction: import('discord.js').ChatInputCommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  const prefix = interaction.guildId
    ? await getGuildPrefix(ctx.redis, interaction.guildId)
    : 'w';
  const msg =
    '🌟 **Prestige sistemi kaldırıldı.**\n\n' +
    `İlerlemeni artık **upgrade** (\`${prefix} upgrade\`) ile sürdürürsün. ` +
    'Doğuş gücü (tame) ve eğitim (upgrade) ayrı katmanlarda takip edilir.';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Prestige Kaldırıldı')
    .setDescription(msg);
  await interaction.reply({ embeds: [embed], flags: 64 });
}
