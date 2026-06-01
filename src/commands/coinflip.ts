import { SlashCommandBuilder } from 'discord.js';
import { coinFlip } from '../systems/gambling';
import type { CommandDefinition } from '../types';
import { failEmbed } from '../utils/embed';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import { GAMBLE_COINFLIP_COOLDOWN_MS } from '../config';
import { buildCooldownMessage } from '../utils/command-error';
import { interactionReplyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import { sleep } from '../utils/async';

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
    const cooldown = await peekCooldown(ctx.redis, cooldownKey);
    if (cooldown.active) {
      if (!cooldown.notify) return;
      await interactionReplyWithSuppression(
        interaction,
        {
          content: buildCooldownMessage(
            cooldown.remainingMs,
            'coinflip',
            interaction.member && 'displayName' in interaction.member
              ? (interaction.member as { displayName: string }).displayName
              : interaction.user.username,
          ),
          flags: 64,
        },
        SuppressionKeys.cooldown(cooldownKey),
      );
      return;
    }

    const bet = interaction.options.getInteger('bet', true);
    const choice = interaction.options.getString('secim', true);

    // Ephemeral deferred reply — yalnızca komutu kullanan kişiye görünür
    await interaction.deferReply({ flags: 64 });

    // Sonucu ÖNCE belirle
    const result = await coinFlip(ctx.prisma, interaction.user.id, bet, ctx.redis);
    await armCooldown(ctx.redis, cooldownKey, GAMBLE_COINFLIP_COOLDOWN_MS);
    await interaction.editReply({
      content: `${interaction.user.username} spent 💎 ${bet} and chose **${choice}**\nThe coin spins...`,
    });

    // Animasyon: 3 frame × 150ms = 450ms
    const flipFrames = ['🪙', '🔄', '🪙'];
    for (const frame of flipFrames) {
      await sleep(150);
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
