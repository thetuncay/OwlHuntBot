import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type Message, type ChatInputCommandInteraction } from 'discord.js';
import { CRAFTING_RECIPES, CONSUMABLE_ITEM_BY_NAME } from '../config';
import { craftItem, dismantleItem } from '../systems/crafting';
import { successEmbed, failEmbed, infoEmbed } from '../utils/embed';
import {
  buildCraftInfoText,
  buildCraftMenuText,
  getCraftDisplayName,
  resolveCraftTarget,
} from '../utils/craft-ux';
import { getPlayerBundle } from '../utils/player-cache';
import type { CommandContext } from '../types';

async function loadCraftContext(ctx: CommandContext, userId: string) {
  const invItems = await ctx.prisma.inventoryItem.findMany({ where: { ownerId: userId } });
  const invMap = new Map(invItems.map((i) => [i.itemName, i.quantity]));
  const bundle = await getPlayerBundle(ctx.redis, ctx.prisma, userId);
  const playerCoins = bundle?.player.coins ?? 0;
  return { invMap, playerCoins };
}

/**
 * /owl craft komutu (UI)
 */
export async function runCraftMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
) {
  const userId = message.author.id;

  if (args.length === 0) {
    const { invMap, playerCoins } = await loadCraftContext(ctx, userId);
    await message.reply(buildCraftMenuText(invMap, playerCoins, prefix));
    return;
  }

  const recipe = resolveCraftTarget(args[0] ?? '');
  if (!recipe) {
    await message.reply(`❌ Geçersiz tarif. \`${prefix} craft\` ile listeyi gör.`);
    return;
  }

  try {
    await craftItem(ctx.prisma, userId, recipe.id, ctx.redis);
    const name = getCraftDisplayName(recipe);
    await message.reply(`✅ ${recipe.emoji} **${name}** üretildi! 📦 Envantere eklendi.`);
  } catch (err: any) {
    await message.reply(`❌ ${err.message}`);
  }
}

/**
 * /owl craftinfo komutu — tarif detayı
 */
export async function runCraftInfoMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
) {
  const userId = message.author.id;

  if (args.length === 0) {
    await message.reply(`Kullanım: \`${prefix} craftinfo <id>\` · Örn: \`${prefix} craftinfo 015\``);
    return;
  }

  const recipe = resolveCraftTarget(args[0] ?? '');
  if (!recipe) {
    await message.reply(`❌ Geçersiz ID. \`${prefix} craft\` ile mevcut tarifleri gör.`);
    return;
  }

  const { invMap, playerCoins } = await loadCraftContext(ctx, userId);
  await message.reply(buildCraftInfoText(recipe, invMap, playerCoins, prefix));
}

/**
 * Slash: /owl craft
 */
export async function runCraftSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext) {
  const userId = interaction.user.id;
  const { invMap, playerCoins } = await loadCraftContext(ctx, userId);
  const text = buildCraftMenuText(invMap, playerCoins, 'owl');

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    CRAFTING_RECIPES.slice(0, 5).map((r) => {
      const def = CONSUMABLE_ITEM_BY_NAME[r.resultItem.itemName];
      const label = def ? `${def.useId}` : r.id;
      return new ButtonBuilder()
        .setCustomId(`craft_slash:${r.id}`)
        .setLabel(label)
        .setEmoji(r.emoji)
        .setStyle(ButtonStyle.Primary);
    }),
  );
  const row2 = CRAFTING_RECIPES.length > 5
    ? new ActionRowBuilder<ButtonBuilder>().addComponents(
        CRAFTING_RECIPES.slice(5).map((r) => {
          const def = CONSUMABLE_ITEM_BY_NAME[r.resultItem.itemName];
          const label = def ? `${def.useId}` : r.id;
          return new ButtonBuilder()
            .setCustomId(`craft_slash:${r.id}`)
            .setLabel(label)
            .setEmoji(r.emoji)
            .setStyle(ButtonStyle.Primary);
        }),
      )
    : null;

  const components = row2 ? [row1, row2] : [row1];

  await interaction.reply({ content: text, components, flags: 64 });

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
      const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
      if (!recipe) {
        await interaction.editReply({ content: '❌ Tarif bulunamadı.', components: [] });
        return;
      }
      await craftItem(ctx.prisma, userId, recipeId, ctx.redis);
      const name = getCraftDisplayName(recipe);
      await interaction.editReply({
        content: `✅ ${recipe.emoji} **${name}** üretildi! 📦 Envantere eklendi.`,
        components: [],
      });
    } catch (err: any) {
      await interaction.editReply({ content: `❌ ${err.message}`, components: [] });
    }
  });

  collector?.on('end', (_, reason) => {
    if (reason === 'time') {
      interaction.editReply({ content: '⏰ Süre doldu.', components: [] }).catch(() => null);
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
