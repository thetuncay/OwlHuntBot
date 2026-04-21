/**
 * owl-inventory.ts — /owl inventory komutu
 */

import { ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { INVENTORY_BASE_SLOTS, INVENTORY_PER_LEVEL } from '../config';
import { listActiveBuffs } from '../systems/items';
import {
  buildInventoryOverviewEmbed,
  buildInventoryGridEmbed,
  buildInventoryOverviewRow,
  buildInventoryGridRow,
  buildInventoryText,
} from '../utils/inventory-ux';
import type { CommandDefinition } from '../types';
import type { Message } from 'discord.js';

// ─── Slash: /owl inventory ────────────────────────────────────────────────────

export async function runInventory(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const playerId = interaction.user.id;

  const player = await ctx.prisma.player.findUnique({ where: { id: playerId } });
  if (!player) throw new Error('Oyuncu bulunamadi.');

  const capacity = INVENTORY_BASE_SLOTS + player.level * INVENTORY_PER_LEVEL;

  const [items, rawBuffs] = await Promise.all([
    ctx.prisma.inventoryItem.findMany({ where: { ownerId: playerId } }),
    listActiveBuffs(ctx.prisma as any, playerId),
  ]);

  const username = interaction.member && 'displayName' in interaction.member
    ? (interaction.member as { displayName: string }).displayName
    : interaction.user.username;

  const activeBuffs = rawBuffs
    .filter((b) => b.chargeCur > 0)
    .map((b) => ({
      buffItemId: b.buffItemId,
      buffName:   b.buffItemId,
      category:   b.category,
      chargeCur:  b.chargeCur,
      chargeMax:  b.chargeMax,
    }));

  type Mode = 'overview' | 'grid';
  let mode: Mode = 'overview';
  let gridPage   = 0;

  const GRID_PER_PAGE  = 20;
  const gridTotalPages = Math.max(1, Math.ceil(items.length / GRID_PER_PAGE));

  const renderData = (): InventoryRenderData => ({
    username,
    items:      items as InvItem[],
    activeBuffs,
    usedSlots:  items.length,
    capacity,
    page:       gridPage,
    totalPages: gridTotalPages,
    mode,
  });

  const renderEmbed = () =>
    mode === 'grid'
      ? buildInventoryGridEmbed(renderData())
      : buildInventoryOverviewEmbed(renderData());

  const renderRow = () =>
    mode === 'grid'
      ? buildInventoryGridRow(gridPage, gridTotalPages)
      : buildInventoryOverviewRow(0, 1);

  await interaction.reply({ embeds: [renderEmbed()], components: [renderRow()], flags: 64 });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== playerId) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }
    switch (i.customId) {
      case 'inv_grid':     mode = 'grid'; gridPage = 0; break;
      case 'inv_overview': mode = 'overview'; break;
      case 'inv_prev':
        if (mode === 'grid') gridPage = (gridPage - 1 + gridTotalPages) % gridTotalPages;
        break;
      case 'inv_next':
        if (mode === 'grid') gridPage = (gridPage + 1) % gridTotalPages;
        break;
    }
    await i.update({ embeds: [renderEmbed()], components: [renderRow()] });
  });

  collector.on('end', async () => {
    try {
      const disabledRow = renderRow();
      disabledRow.components.forEach((b) => (b as ButtonBuilder).setDisabled(true));
      await interaction.editReply({ components: [disabledRow] });
    } catch { /* mesaj silinmiş */ }
  });
}

// ─── Prefix: owl inventory ────────────────────────────────────────────────────

export async function runInventoryMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const playerId = message.author.id;
  const player   = await ctx.prisma.player.findUnique({ where: { id: playerId } });
  if (!player) throw new Error('Oyuncu bulunamadi.');

  const capacity = INVENTORY_BASE_SLOTS + player.level * INVENTORY_PER_LEVEL;

  const [items, rawBuffs] = await Promise.all([
    ctx.prisma.inventoryItem.findMany({ where: { ownerId: playerId } }),
    listActiveBuffs(ctx.prisma as any, playerId),
  ]);

  const name = message.member?.displayName ?? message.author.username;

  const activeBuffs = rawBuffs
    .filter((b) => b.chargeCur > 0)
    .map((b) => ({
      buffItemId: b.buffItemId,
      buffName:   b.buffItemId,
      category:   b.category,
      chargeCur:  b.chargeCur,
      chargeMax:  b.chargeMax,
    }));

  const PAGE_SIZE  = 40;
  let page         = 0;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  const renderData = (): import('../utils/inventory-ux').InventoryRenderData => ({
    username:   name,
    items:      items as import('../utils/inventory-ux').InventoryItem[],
    activeBuffs,
    usedSlots:  items.length,
    capacity,
    page,
    totalPages,
    mode:       'overview',
  });

  const renderText = () => buildInventoryText(renderData());

  const renderRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('inv_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(totalPages <= 1 || page === 0),
    new ButtonBuilder()
      .setCustomId('inv_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(totalPages <= 1 || page === totalPages - 1),
  );

  const components = totalPages > 1 ? [renderRow()] : [];
  const sent = await message.reply({ content: renderText(), components });

  if (totalPages <= 1) return;

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== playerId) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }
    if (i.customId === 'inv_prev') page = Math.max(0, page - 1);
    if (i.customId === 'inv_next') page = Math.min(totalPages - 1, page + 1);
    await i.update({ content: renderText(), components: [renderRow()] });
  });

  collector.on('end', async () => {
    try {
      await sent.edit({ components: [] });
    } catch { /* mesaj silinmiş */ }
  });
}
