import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type Message, type ChatInputCommandInteraction } from 'discord.js';
import { CRAFTING_RECIPES, DISMANTLE_TABLE } from '../config';
import { craftItem, dismantleItem } from '../systems/crafting';
import { successEmbed, failEmbed, infoEmbed } from '../utils/embed';
import type { CommandContext } from '../types';

/**
 * /owl craft komutu (UI)
 */
export async function runCraftMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string
) {
  const userId = message.author.id;

  if (args.length === 0) {
    // Tarif listesini göster
    const embed = infoEmbed(
      '📜 Crafting Menüsü',
      'Üretmek istediğin eşyanın numarasını yaz: `' + prefix + ' craft <no>`\n\n' +
      CRAFTING_RECIPES.map((r, i) => {
        const mats = r.requiredMaterials.map(m => `${m.itemName} x${m.quantity}`).join(', ');
        return `**${i + 1}. ${r.emoji} ${r.name}**\n└ ${r.description}\n└ Gereksinim: ${mats}, ${r.requiredCoins} 💰`;
      }).join('\n\n')
    );
    await message.reply({ embeds: [embed] });
    return;
  }

  const index = parseInt(args[0] ?? '0') - 1;
  const recipe = CRAFTING_RECIPES[index];

  if (!recipe) {
    await message.reply({ embeds: [failEmbed('Hata', 'Geçersiz tarif numarası.')] });
    return;
  }

  try {
    const result = await craftItem(ctx.prisma, userId, recipe.id);
    await message.reply({
      embeds: [successEmbed('Başarılı!', `**${recipe.emoji} ${recipe.name}** başarıyla üretildi ve envanterine eklendi.`)]
    });
  } catch (err: any) {
    await message.reply({ embeds: [failEmbed('Hata', err.message)] });
  }
}

/**
 * Slash: /owl craft
 */
export async function runCraftSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext) {
  const userId = interaction.user.id;

  const embed = infoEmbed(
    '📜 Crafting Menüsü',
    'Üretmek istediğin eşyayı aşağıdaki butonlardan seçebilirsin.\n\n' +
    CRAFTING_RECIPES.map((r, i) => {
      const mats = r.requiredMaterials.map(m => `${m.itemName} x${m.quantity}`).join(', ');
      return `**${i + 1}. ${r.emoji} ${r.name}**\n└ ${r.description}\n└ Gereksinim: ${mats}, ${r.requiredCoins} 💰`;
    }).join('\n\n')
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    CRAFTING_RECIPES.map((r, i) => (
      new ButtonBuilder()
        .setCustomId(`craft_select:${r.id}`)
        .setLabel(`${i + 1}. Üret`)
        .setEmoji(r.emoji)
        .setStyle(ButtonStyle.Success)
    ))
  );

  const sent = await interaction.reply({ embeds: [embed], components: [row], flags: 64 });

  const collector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
    filter: (i) => i.user.id === userId && i.customId.startsWith('craft_select:')
  });

  collector?.on('collect', async (i) => {
    const recipeId = i.customId.split(':')[1];
    if (!recipeId) return;

    await i.deferUpdate();
    try {
      const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
      await craftItem(ctx.prisma, userId, recipeId);
      await interaction.editReply({
        content: `✅ **Başarılı!** | **${recipe?.emoji} ${recipe?.name}** üretildi.`,
        embeds: [],
        components: []
      });
    } catch (err: any) {
      await interaction.editReply({ content: `❌ **Hata** | ${err.message}`, embeds: [], components: [] });
    }
  });
}

/**
 * Slash: /owl dismantle
 */
export async function runDismantleSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext) {
  const userId = interaction.user.id;
  const itemName = interaction.options.getString('esya', true);
  const quantity = interaction.options.getInteger('miktar') || 1;

  await interaction.deferReply({ flags: 64 });

  try {
    const produced = await dismantleItem(ctx.prisma, userId, itemName, quantity);
    const producedStr = produced.map(p => `${p.quantity}x ${p.itemName}`).join(', ');
    await interaction.editReply({
      embeds: [successEmbed('Parçalama Başarılı', `**${quantity}x ${itemName}** parçalandı.\n\nElde edilen materyaller: **${producedStr}**`)]
    });
  } catch (err: any) {
    await interaction.editReply({ embeds: [failEmbed('Hata', err.message)] });
  }
}

/**
 * /owl dismantle komutu (UI)
 */
export async function runDismantleMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string
) {
  const userId = message.author.id;

  if (args.length === 0) {
    await message.reply({
      embeds: [infoEmbed('Dismantle (Parçalama)', `Kullanım: \`${prefix} dismantle <eşya_adı> [miktar]\`\n\nAvladığın hayvanları parçalayarak upgrade materyalleri elde edebilirsin.`)]
    });
    return;
  }

  const itemName = args[0] ?? '';
  const quantity = parseInt(args[1] ?? '1') || 1;

  try {
    const produced = await dismantleItem(ctx.prisma, userId, itemName, quantity);
    const producedStr = produced.map(p => `${p.quantity}x ${p.itemName}`).join(', ');
    await message.reply({
      embeds: [successEmbed('Parçalama Başarılı', `**${quantity}x ${itemName}** parçalandı.\n\nElde edilen materyaller: **${producedStr}**`)]
    });
  } catch (err: any) {
    await message.reply({ embeds: [failEmbed('Hata', err.message)] });
  }
}
