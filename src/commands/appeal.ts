import { SlashCommandBuilder } from 'discord.js';
import type { CommandDefinition } from '../types';
import { submitAnticheatAppeal } from '../anticheat/appeal';

const data = new SlashCommandBuilder()
  .setName('appeal')
  .setDescription('Anti-cheat cezası için itiraz gönder')
  .setDMPermission(false)
  .addStringOption((o) =>
    o.setName('gerekce').setDescription('İtiraz açıklaması (en az 10 karakter)').setRequired(true),
  );

async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const reason = interaction.options.getString('gerekce', true);
  const result = await submitAnticheatAppeal(ctx.prisma, interaction.user.id, reason);
  await interaction.reply({ content: result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, flags: 64 });
}

export default { data, execute } satisfies CommandDefinition;
