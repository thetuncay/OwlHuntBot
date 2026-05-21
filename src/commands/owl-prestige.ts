import { EmbedBuilder, type Message, type ChatInputCommandInteraction } from 'discord.js';
import { performAscension } from '../systems/prestige';
import { successEmbed, failEmbed, infoEmbed } from '../utils/embed';
import type { CommandContext } from '../types';

/**
 * /owl prestige komutu (UI)
 */
export async function runPrestigeMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string
) {
  const userId = message.author.id;
  const owlId = args[0];

  if (!owlId) {
    const embed = infoEmbed(
      '🌟 Ascension (Prestige)',
      'Baykuşunu feda ederek kalıcı hesap bonusları kazanabilirsin.\n\n' +
      '**Gereksinimler:**\n' +
      '• Oyuncu Seviyesi: **30+**\n' +
      '• Baykuş Ortalama Stat: **80+**\n\n' +
      '**Bonuslar:**\n' +
      '• Her seviye için **+%5 XP**\n' +
      '• Her seviye için **+2 Etkili Stat Cap**\n\n' +
      `**Kullanım:** \`${prefix} prestige <baykus_id>\`\n\n` +
      `💡 **Daha fazla bilgi:** \`${prefix} soru prestige ne zaman yapmalıyım?\`\n\n` +
      '*Dikkat: Baykuşunuz silinecek ve seviyeniz 1\'e sıfırlanacaktır!*'
    );
    await message.reply({ embeds: [embed] });
    return;
  }

  try {
    const { newPrestigeLevel } = await performAscension(ctx.prisma, userId, owlId);
    await message.reply({
      embeds: [successEmbed(
        '🌟 ASCENSION TAMAMLANDI!',
        `Baykuşunu feda ettin ve yüceldin.\n\n` +
        `Yeni Prestige Seviyesi: **${newPrestigeLevel}**\n` +
        `Hesabın resetlendi, artık daha hızlı güçleneceksin!`
      )]
    });
  } catch (err: any) {
    await message.reply({ embeds: [failEmbed('Hata', err.message)] });
  }
}

/**
 * Slash: /owl prestige
 */
export async function runPrestigeSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<any> {
  const userId = interaction.user.id;
  const owlId = interaction.options.getString('baykus');

  if (!owlId) {
    const embed = infoEmbed(
      '🌟 Ascension (Prestige)',
      'Baykuşunu feda ederek kalıcı hesap bonusları kazanabilirsin.\n\n' +
      '**Gereksinimler:**\n' +
      '• Oyuncu Seviyesi: **30+**\n' +
      '• Baykuş Ortalama Stat: **80+**\n\n' +
      '**Bonuslar:**\n' +
      '• Her seviye için **+%5 XP**\n' +
      '• Her seviye için **+2 Etkili Stat Cap**\n\n' +
      `**Kullanım:** \`/owl prestige baykus:<id>\`\n\n` +
      `💡 **Daha fazla bilgi:** Metin komutla \`owl soru prestige ne zaman yapmalıyım?\`\n\n` +
      '*Dikkat: Baykuşunuz silinecek ve seviyeniz 1\'e sıfırlanacaktır!*'
    );
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const { newPrestigeLevel } = await performAscension(ctx.prisma, userId, owlId);
    await interaction.editReply({
      embeds: [successEmbed(
        '🌟 ASCENSION TAMAMLANDI!',
        `Baykuşunu feda ettin ve yüceldin.\n\n` +
        `Yeni Prestige Seviyesi: **${newPrestigeLevel}**\n` +
        `Hesabın resetlendi, artık daha hızlı güçleneceksin!`
      )]
    });
  } catch (err: any) {
    await interaction.editReply({ embeds: [failEmbed('Hata', err.message)] });
  }
}
