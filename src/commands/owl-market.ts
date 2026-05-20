import { EmbedBuilder, type Message, type ChatInputCommandInteraction } from 'discord.js';
import { fetchListings, createListing, buyListing } from '../systems/market';
import { successEmbed, failEmbed, infoEmbed } from '../utils/embed';
import type { CommandContext } from '../types';

/**
 * /owl market komutu (UI)
 */
export async function runMarketMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string
) {
  const userId = message.author.id;
  const sub = args[0]?.toLowerCase();

  if (sub === 'sat') {
    // owl market sat <eşya> <miktar> <fiyat>
    const itemName = args[1];
    const qty = parseInt(args[2] ?? '1') || 1;
    const price = parseInt(args[3] ?? '0');

    if (!itemName || !price) {
      await message.reply({
        embeds: [failEmbed(
          'Hata',
          `Kullanım: \`${prefix} market sat <eşya> <miktar> <fiyat>\`\n\n` +
          `💡 Market hakkında soru sorabilirsin:\n\`${prefix} soru market nasıl kullanılır?\``
        )]
      });
      return;
    }

    try {
      await createListing(ctx.prisma, userId, itemName, qty, price);
      await message.reply({ embeds: [successEmbed('İlan Oluşturuldu', `**${qty}x ${itemName}** markete **${price}** 💰 fiyatla eklendi.`)] });
    } catch (err: any) {
      await message.reply({ embeds: [failEmbed('Hata', err.message)] });
    }
    return;
  }

  if (sub === 'al') {
    // owl market al <ilanId>
    const listingId = args[1];
    if (!listingId) {
      await message.reply({ embeds: [failEmbed('Hata', `Kullanım: \`${prefix} market al <ilan_id>\``)] });
      return;
    }

    try {
      const { listing, tax, sellerGain } = await buyListing(ctx.prisma, userId, listingId);
      await message.reply({
        embeds: [successEmbed('Satın Alma Başarılı', `**${listing.quantity}x ${listing.itemName}** satın aldın.\n\nÖdenen: **${listing.price}** 💰\nKesilen Vergi: **${tax}** 💰`)]
      });
    } catch (err: any) {
      await message.reply({ embeds: [failEmbed('Hata', err.message)] });
    }
    return;
  }

  // Varsayılan: Market ilanlarını listele
  try {
    const search = args[0];
    const listings = await fetchListings(ctx.prisma, search);

    if (listings.length === 0) {
      await message.reply({ embeds: [infoEmbed('Market', 'Şu anda listelenmiş eşya bulunmuyor.')] });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🛒 Global Marketplace')
      .setDescription(search ? `**"${search}"** araması için sonuçlar:` : 'En ucuz 20 ilan listeleniyor:')
      .setColor(0x3498db);

    listings.forEach((l) => {
      embed.addFields({
        name: `${l.itemName} x${l.quantity}`,
        value: `💰 **${l.price}** | ID: \`${l.id.split('-')[0]}\`\nSatıcı: <@${l.sellerId}>`,
        inline: true
      });
    });

    embed.setFooter({ text: `Satın almak için: ${prefix} market al <id>  ·  Soru: ${prefix} soru market nasıl kullanılır?` });

    await message.reply({ embeds: [embed] });
  } catch (err: any) {
    await message.reply({ embeds: [failEmbed('Hata', err.message)] });
  }
}

/**
 * Slash: /owl market
 */
export async function runMarketSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<any> {
  const userId = interaction.user.id;
  const islem = interaction.options.getString('islem');
  const p1 = interaction.options.getString('param1');
  const p2 = interaction.options.getInteger('param2');
  const p3 = interaction.options.getInteger('param3');

  if (islem === 'sell') {
    if (!p1 || !p2 || !p3) {
      return interaction.reply({ content: '❌ Satış için eşya adı, miktar ve fiyat belirtmelisin.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    try {
      await createListing(ctx.prisma, userId, p1, p2, p3);
      await interaction.editReply({ embeds: [successEmbed('İlan Oluşturuldu', `**${p2}x ${p1}** markete **${p3}** 💰 fiyatla eklendi.`)] });
    } catch (err: any) {
      await interaction.editReply({ embeds: [failEmbed('Hata', err.message)] });
    }
    return;
  }

  if (islem === 'buy') {
    if (!p1) return interaction.reply({ content: '❌ İlan ID belirtmelisin.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    try {
      const { listing, tax } = await buyListing(ctx.prisma, userId, p1);
      await interaction.editReply({
        embeds: [successEmbed('Satın Alma Başarılı', `**${listing.quantity}x ${listing.itemName}** satın aldın.\n\nÖdenen: **${listing.price}** 💰\nKesilen Vergi: **${tax}** 💰`)]
      });
    } catch (err: any) {
      await interaction.editReply({ embeds: [failEmbed('Hata', err.message)] });
    }
    return;
  }

  // Varsayılan: Listele
  await interaction.deferReply({ flags: 64 });
  try {
    const listings = await fetchListings(ctx.prisma, p1 || undefined);
    if (listings.length === 0) {
      return interaction.editReply({ embeds: [infoEmbed('Market', 'Şu anda listelenmiş eşya bulunmuyor.')] });
    }
    const embed = new EmbedBuilder()
      .setTitle('🛒 Global Marketplace')
      .setDescription(p1 ? `**"${p1}"** araması için sonuçlar:` : 'En ucuz 20 ilan listeleniyor:')
      .setColor(0x3498db);

    listings.forEach((l) => {
      embed.addFields({
        name: `${l.itemName} x${l.quantity}`,
        value: `💰 **${l.price}** | ID: \`${l.id.split('-')[0]}\`\nSatıcı: <@${l.sellerId}>`,
        inline: true
      });
    });
    await interaction.editReply({ embeds: [embed] });
  } catch (err: any) {
    await interaction.editReply({ embeds: [failEmbed('Hata', err.message)] });
  }
}
