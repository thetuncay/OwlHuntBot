import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type Message, type ChatInputCommandInteraction } from 'discord.js';
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
    // Onay adımı — geri alınamaz işlem öncesi 30 saniye bekleme
    // ownerId dahil tek sorgu — gereksiz ikinci DB çağrısı yok
    const owl = await ctx.prisma.owl.findUnique({
      where: { id: owlId },
      select: { ownerId: true, species: true, tier: true, statGaga: true, statGoz: true, statKulak: true, statKanat: true, statPence: true },
    });
    if (!owl || owl.ownerId !== userId) {
      await message.reply({ embeds: [failEmbed('Hata', 'Baykuş bulunamadı veya sana ait değil.')] });
      return;
    }
    const avgStat = Math.round((owl.statGaga + owl.statGoz + owl.statKulak + owl.statKanat + owl.statPence) / 5);

    const confirmMsg = await message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('⚠️ ASCENSION ONAYI — GERİ ALINAMAZ!')
        .setDescription(
          `**${owl.species}** (Tier ${owl.tier}) baykuşunu feda etmek üzeresin.\n\n` +
          `📊 Ortalama Stat: **${avgStat}**\n\n` +
          `**Kaybedeceklerin:**\n• Bu baykuş kalıcı olarak silinecek\n• Oyuncu seviyeniz 1'e sıfırlanacak\n\n` +
          `**Kazanacakların:**\n• Kalıcı +%5 XP bonusu\n• Kalıcı +2 stat cap\n\n` +
          `Devam etmek için **30 saniye** içinde ✅ butonuna bas.`
        )],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`prestige_confirm:${owlId}`).setLabel('✅ Evet, Feda Et').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('prestige_cancel').setLabel('❌ İptal').setStyle(ButtonStyle.Secondary),
      )],
    });

    const collector = confirmMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.user.id === userId,
    });

    collector.on('collect', async (i) => {
      collector.stop();
      if (i.customId === 'prestige_cancel') {
        await i.update({ content: '❌ Ascension iptal edildi.', embeds: [], components: [] });
        return;
      }
      await i.update({ content: '⏳ İşleniyor...', embeds: [], components: [] });
      try {
        const { newPrestigeLevel } = await performAscension(ctx.prisma, userId, owlId, ctx.redis);
        await i.editReply({
          content: '',
          embeds: [successEmbed('🌟 ASCENSION TAMAMLANDI!',
            `Baykuşunu feda ettin ve yüceldin.\n\nYeni Prestige Seviyesi: **${newPrestigeLevel}**\nHesabın resetlendi, artık daha hızlı güçleneceksin!`
          )],
        });
      } catch (err: any) {
        await i.editReply({ content: '', embeds: [failEmbed('Hata', err.message)] });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        confirmMsg.edit({ content: '⏰ Süre doldu, ascension iptal edildi.', embeds: [], components: [] }).catch(() => null);
      }
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
    // Onay adımı — geri alınamaz işlem öncesi 30 saniye bekleme
    const owl = await ctx.prisma.owl.findUnique({
      where: { id: owlId },
      select: { ownerId: true, species: true, tier: true, statGaga: true, statGoz: true, statKulak: true, statKanat: true, statPence: true },
    });
    if (!owl || owl.ownerId !== userId) {
      await interaction.editReply({ embeds: [failEmbed('Hata', 'Baykuş bulunamadı veya sana ait değil.')] });
      return;
    }
    const avgStat = Math.round((owl.statGaga + owl.statGoz + owl.statKulak + owl.statKanat + owl.statPence) / 5);

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('⚠️ ASCENSION ONAYI — GERİ ALINAMAZ!')
        .setDescription(
          `**${owl.species}** (Tier ${owl.tier}) baykuşunu feda etmek üzeresin.\n\n` +
          `📊 Ortalama Stat: **${avgStat}**\n\n` +
          `**Kaybedeceklerin:**\n• Bu baykuş kalıcı olarak silinecek\n• Oyuncu seviyeniz 1'e sıfırlanacak\n\n` +
          `**Kazanacakların:**\n• Kalıcı +%5 XP bonusu\n• Kalıcı +2 stat cap\n\n` +
          `Devam etmek için **30 saniye** içinde ✅ butonuna bas.`
        )],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`prestige_confirm:${owlId}`).setLabel('✅ Evet, Feda Et').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('prestige_cancel').setLabel('❌ İptal').setStyle(ButtonStyle.Secondary),
      )],
    });

    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.user.id === userId,
    });

    collector.on('collect', async (i) => {
      collector.stop();
      if (i.customId === 'prestige_cancel') {
        await i.update({ content: '❌ Ascension iptal edildi.', embeds: [], components: [] });
        return;
      }
      await i.update({ content: '⏳ İşleniyor...', embeds: [], components: [] });
      try {
        const { newPrestigeLevel } = await performAscension(ctx.prisma, userId, owlId, ctx.redis);
        await i.editReply({
          content: '',
          embeds: [successEmbed('🌟 ASCENSION TAMAMLANDI!',
            `Baykuşunu feda ettin ve yüceldin.\n\nYeni Prestige Seviyesi: **${newPrestigeLevel}**\nHesabın resetlendi, artık daha hızlı güçleneceksin!`
          )],
        });
      } catch (err: any) {
        await i.editReply({ content: '', embeds: [failEmbed('Hata', err.message)] });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        interaction.editReply({ content: '⏰ Süre doldu, ascension iptal edildi.', embeds: [], components: [] }).catch(() => null);
      }
    });
  } catch (err: any) {
    await interaction.editReply({ embeds: [failEmbed('Hata', err.message)] });
  }
}
