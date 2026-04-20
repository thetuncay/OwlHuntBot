import { SlashCommandBuilder } from 'discord.js';
import { slot } from '../systems/gambling';
import type { CommandDefinition } from '../types';
import { failEmbed } from '../utils/embed';
import { getCooldownRemainingMs } from '../middleware/cooldown';
import { GAMBLE_SLOT_COOLDOWN_MS } from '../config';

const data = new SlashCommandBuilder()
  .setName('slot')
  .setDescription('Slot kumari')
  .addIntegerOption((opt) => opt.setName('bet').setDescription('Bahis miktari').setRequired(true));

const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🍉', '💎', '⭐', '🔔'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomSymbols(): string[] {
  return [
    SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]!,
    SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]!,
    SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]!,
  ];
}

function renderSlot(symbols: string[]): string {
  return `**═══ SLOTS ═══**\n| ${symbols[0]} | ${symbols[1]} | ${symbols[2]} |`;
}

/**
 * /slot komutunu calistirir.
 */
async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  try {
    const userId      = interaction.user.id;
    const cooldownKey = `cooldown:slot:${userId}`;
    const remaining   = await getCooldownRemainingMs(ctx.redis, cooldownKey, GAMBLE_SLOT_COOLDOWN_MS);
    if (remaining > 0) {
      await interaction.reply({
        content: `⏰ Tekrar slot için **${Math.ceil(remaining / 1000)}s** beklemelisin.`,
        flags: 64,
      });
      return;
    }

    const bet = interaction.options.getInteger('bet', true);
    
    // Sonucu ÖNCE belirle
    const result = await slot(ctx.prisma, interaction.user.id, bet);
    
    // İlk mesaj: spinning
    await interaction.reply({ content: `${interaction.user.username} bet 💎 ${bet}\n\n${renderSlot(['❓', '❓', '❓'])}` });
    
    // Animasyon: 5 spin
    for (let i = 0; i < 5; i++) {
      await sleep(250);
      await interaction.editReply({ content: `${interaction.user.username} bet 💎 ${bet}\n\n${renderSlot(randomSymbols())}` });
    }
    
    // Final sonuç (result.message'da semboller var mı kontrol et, yoksa random göster)
    await sleep(300);
    const finalSymbols = randomSymbols(); // Gerçek sembolleri result'tan çekebilirsin
    let finalText = `${interaction.user.username} bet 💎 ${bet}\n\n${renderSlot(finalSymbols)}\n\n`;
    
    if (result.win) {
      finalText += `✅ **${result.message}**\nKazanc: +${result.deltaCoins} 💰\nBakiye: ${result.finalCoins}`;
    } else {
      finalText += `❌ **${result.message}**\nKayip: ${result.deltaCoins} 💸\nBakiye: ${result.finalCoins}`;
    }
    
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
