import { SlashCommandBuilder } from 'discord.js';
import { coinFlip } from '../systems/gambling';
import type { CommandDefinition } from '../types';
import { failEmbed } from '../utils/embed';
import { getCooldownRemainingMs } from '../middleware/cooldown';
import { GAMBLE_COINFLIP_COOLDOWN_MS } from '../config';

const data = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Coin flip kumari')
  .addIntegerOption((opt) => opt.setName('bet').setDescription('Bahis miktari').setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName('secim')
      .setDescription('Heads veya Tails')
      .setRequired(true)
      .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }),
  );

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * /coinflip komutunu calistirir.
 */
async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  try {
    const userId      = interaction.user.id;
    const cooldownKey = `cooldown:coinflip:${userId}`;
    const remaining   = await getCooldownRemainingMs(ctx.redis, cooldownKey, GAMBLE_COINFLIP_COOLDOWN_MS);
    if (remaining > 0) {
      await interaction.reply({
        content: `⏰ Tekrar coinflip için **${Math.ceil(remaining / 1000)}s** beklemelisin.`,
        flags: 64,
      });
      return;
    }

    const bet = interaction.options.getInteger('bet', true);
    const choice = interaction.options.getString('secim', true);
    
    // Sonucu ÖNCE belirle
    const result = await coinFlip(ctx.prisma, interaction.user.id, bet);
    await interaction.reply({
      content: `${interaction.user.username} spent 💎 ${bet} and chose **${choice}**\nThe coin spins...`,
    });
    
    // Animasyon: flip efekti
    const flipFrames = ['🪙', '🔄', '🪙', '🔄', '🪙'];
    for (const frame of flipFrames) {
      await sleep(200);
      await interaction.editReply({
        content: `${interaction.user.username} spent 💎 ${bet} and chose **${choice}**\nThe coin spins... ${frame}`,
      });
    }
    
    // Final sonuç
    await sleep(300);
    const finalResult = result.win ? choice : choice === 'heads' ? 'tails' : 'heads';
    let finalText = `${interaction.user.username} spent 💎 ${bet} and chose **${choice}**\n`;
    finalText += `The coin spins... 🪙 and you ${result.win ? 'won' : 'lost'} 💎 **${Math.abs(result.deltaCoins)}**!`;
    finalText += `\n\nResult: **${finalResult}**\nBakiye: ${result.finalCoins}`;
    
    await interaction.editReply({ content: finalText });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Bir seyler ters gitti.';
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [failEmbed('Hata', msg)] });
    } else {
      await interaction.reply({ embeds: [failEmbed('Hata', msg)], flags: 64 });
    }
  }
}

export default { data, execute } satisfies CommandDefinition;
