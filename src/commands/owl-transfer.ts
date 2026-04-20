/**
 * owl-transfer.ts — /owl ver (coin transfer) komutu
 */

import { EmbedBuilder, type Message } from 'discord.js';
import { transferCoins } from '../systems/transfer';
import { TRANSFER_MIN_AMOUNT } from '../config';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';

// ─── Slash: /owl ver ──────────────────────────────────────────────────────────

export async function runTransfer(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const senderId   = interaction.user.id;
  const target     = interaction.options.getUser('kullanici', true);
  const amount     = interaction.options.getInteger('miktar', true);
  const receiverId = target.id;

  try {
    const result       = await transferCoins(ctx.prisma, ctx.redis, senderId, receiverId, amount);
    const receiverName = target.displayName ?? target.username;
    const taxPct       = Math.round(result.taxRate * 100);
    const dailyLeft    = result.dailyLimit - result.dailySent;

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💸 Transfer Tamamlandı')
      .addFields(
        { name: '📤 Gönderilen',         value: `**${result.sent.toLocaleString('tr-TR')}** 💰`,        inline: true },
        { name: `🏦 Vergi (%${taxPct})`, value: `**-${result.tax.toLocaleString('tr-TR')}** 💰`,        inline: true },
        { name: '📥 Alınan',             value: `**${result.received.toLocaleString('tr-TR')}** 💰`,    inline: true },
        { name: '👤 Alıcı',              value: `<@${receiverId}> (${receiverName})`,                   inline: true },
        { name: '💰 Yeni Bakiyen',       value: `**${result.senderCoins.toLocaleString('tr-TR')}** 💰`, inline: true },
        { name: '📊 Günlük Kalan',       value: `**${dailyLeft.toLocaleString('tr-TR')}** / ${result.dailyLimit.toLocaleString('tr-TR')} 💰`, inline: true },
      )
      .setFooter({ text: 'Vergi ekonomi dengesi için yakılır.' });

    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await interaction.reply({ embeds: [failEmbed('Transfer Hatası', msg)], flags: 64 });
  }
}

// ─── Prefix: owl ver ──────────────────────────────────────────────────────────

export async function runTransferMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const mentionOrId = args[0] ?? '';
  const amountStr   = args[1] ?? '';
  const receiverId  = mentionOrId.replace(/^<@!?(\d+)>$/, '$1') || mentionOrId;

  if (!receiverId || !/^\d+$/.test(receiverId)) {
    await message.reply(
      `❌ **Kullanım:** \`${helpPrefix} ver @kullanıcı <miktar>\`\n` +
      `Örnek: \`${helpPrefix} ver @arkadaş 500\``,
    );
    return;
  }

  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount < TRANSFER_MIN_AMOUNT) {
    await message.reply(`❌ Geçerli bir miktar gir. Minimum: **${TRANSFER_MIN_AMOUNT}** 💰`);
    return;
  }

  try {
    const result    = await transferCoins(ctx.prisma, ctx.redis, message.author.id, receiverId, amount);
    const taxPct    = Math.round(result.taxRate * 100);
    const dailyLeft = result.dailyLimit - result.dailySent;

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💸 Transfer Tamamlandı')
      .addFields(
        { name: '📤 Gönderilen',         value: `**${result.sent.toLocaleString('tr-TR')}** 💰`,        inline: true },
        { name: `🏦 Vergi (%${taxPct})`, value: `**-${result.tax.toLocaleString('tr-TR')}** 💰`,        inline: true },
        { name: '📥 Alınan',             value: `**${result.received.toLocaleString('tr-TR')}** 💰`,    inline: true },
        { name: '👤 Alıcı',              value: `<@${receiverId}>`,                                     inline: true },
        { name: '💰 Yeni Bakiyen',       value: `**${result.senderCoins.toLocaleString('tr-TR')}** 💰`, inline: true },
        { name: '📊 Günlük Kalan',       value: `**${dailyLeft.toLocaleString('tr-TR')}** / ${result.dailyLimit.toLocaleString('tr-TR')} 💰`, inline: true },
      )
      .setFooter({ text: 'Vergi ekonomi dengesi için yakılır.' });

    await message.reply({ embeds: [embed] });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await message.reply({ embeds: [failEmbed('Transfer Hatası', errMsg)] });
  }
}
