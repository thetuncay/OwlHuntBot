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
    // Tarif listesini göster — envanter ile karşılaştırmalı
    const userId = message.author.id;
    const invItems = await ctx.prisma.inventoryItem.findMany({ where: { ownerId: userId } });
    const invMap = new Map(invItems.map(i => [i.itemName, i.quantity]));

    const recipeLines = CRAFTING_RECIPES.map((r, i) => {
      const matLines = r.requiredMaterials.map(m => {
        const have = invMap.get(m.itemName) ?? 0;
        const ok = have >= m.quantity;
        return `  ${ok ? '✅' : '❌'} ${m.itemName}: **${have}/${m.quantity}**`;
      });
      const coinOk = (invMap.get('coin') ?? Infinity) >= r.requiredCoins;
      const canCraft = r.requiredMaterials.every(m => (invMap.get(m.itemName) ?? 0) >= m.quantity);
      const craftTag = canCraft ? ' ✨ *Üretilebilir!*' : '';
      return (
        `**${i + 1}. ${r.emoji} ${r.name}**${craftTag}\n` +
        `└ ${r.description}\n` +
        matLines.join('\n') + '\n' +
        `  💰 Coin: **${r.requiredCoins}**`
      );
    }).join('\n\n');

    const embed = infoEmbed(
      '📜 Crafting Menüsü',
      `Üretmek istediğin eşyanın numarasını yaz: \`${prefix} craft <no>\`\n\n` + recipeLines
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
    const result = await craftItem(ctx.prisma, userId, recipe.id, ctx.redis);
    await message.reply({
      embeds: [successEmbed('Başarılı!', `**${recipe.emoji} ${recipe.name}** başarıyla üretildi ve envanterine eklendi.`)]
    });
  } catch (err: any) {
    await message.reply({ embeds: [failEmbed('Hata', err.message)] });
  }
}

/**
 * Slash: /owl craft
 * Butonlu interaktif crafting menüsü — oyuncu slash üzerinden de üretim yapabilir.
 */
export async function runCraftSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext) {
  const userId = interaction.user.id;

  const invItems = await ctx.prisma.inventoryItem.findMany({ where: { ownerId: userId } });
  const invMap = new Map(invItems.map((i: any) => [i.itemName, i.quantity]));

  const recipeLines = CRAFTING_RECIPES.map((r, i) => {
    const matLines = r.requiredMaterials.map(m => {
      const have = invMap.get(m.itemName) ?? 0;
      const ok = have >= m.quantity;
      return `  ${ok ? '✅' : '❌'} ${m.itemName}: **${have}/${m.quantity}**`;
    });
    const canCraft = r.requiredMaterials.every(m => (invMap.get(m.itemName) ?? 0) >= m.quantity);
    const craftTag = canCraft ? ' ✨ *Üretilebilir!*' : '';
    return (
      `**${i + 1}. ${r.emoji} ${r.name}**${craftTag}\n` +
      `└ ${r.description}\n` +
      matLines.join('\n') + '\n' +
      `  💰 Coin: **${r.requiredCoins}**`
    );
  }).join('\n\n');

  const embed = infoEmbed(
    '📜 Crafting Menüsü',
    'Üretmek istediğin eşyayı seç:\n\n' + recipeLines
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    CRAFTING_RECIPES.map((r, i) =>
      new ButtonBuilder()
        .setCustomId(`craft_slash:${r.id}`)
        .setLabel(`${i + 1}. ${r.name}`)
        .setEmoji(r.emoji)
        .setStyle(ButtonStyle.Primary)
    ).slice(0, 5) // Discord max 5 buton per row
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: 64 });

  const collector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    filter: (i) => i.user.id === userId && i.customId.startsWith('craft_slash:'),
  });

  collector?.on('collect', async (i) => {
    const recipeId = i.customId.split(':')[1];
    if (!recipeId) return;
    collector.stop();
    await i.deferUpdate();
    try {
      const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
      if (!recipe) {
        await interaction.editReply({ embeds: [failEmbed('Hata', 'Tarif bulunamadı.')], components: [] });
        return;
      }
      await craftItem(ctx.prisma, userId, recipeId, ctx.redis);
      await interaction.editReply({
        embeds: [successEmbed('Başarılı!', `**${recipe.emoji} ${recipe.name}** başarıyla üretildi ve envanterine eklendi.`)],
        components: [],
      });
    } catch (err: any) {
      await interaction.editReply({ embeds: [failEmbed('Hata', err.message)], components: [] });
    }
  });

  collector?.on('end', (_, reason) => {
    if (reason === 'time') {
      interaction.editReply({ content: '⏰ Süre doldu.', embeds: [], components: [] }).catch(() => null);
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
    const produced = await dismantleItem(ctx.prisma, userId, itemName, quantity, ctx.redis);
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
    const produced = await dismantleItem(ctx.prisma, userId, itemName, quantity, ctx.redis);
    const producedStr = produced.map(p => `${p.quantity}x ${p.itemName}`).join(', ');
    await message.reply({
      embeds: [successEmbed('Parçalama Başarılı', `**${quantity}x ${itemName}** parçalandı.\n\nElde edilen materyaller: **${producedStr}**`)]
    });
  } catch (err: any) {
    await message.reply({ embeds: [failEmbed('Hata', err.message)] });
  }
}
