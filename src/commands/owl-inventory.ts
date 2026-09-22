/**
 * owl-inventory.ts — prefix envanter komutu
 */

import { ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { BUFF_ITEM_MAP, INVENTORY_BASE_SLOTS, INVENTORY_PER_LEVEL } from '../config';
import { displayBuffEmoji } from '../config/custom-emojis';
import { listActiveBuffs } from '../systems/items';
import {
  buildInventoryPages,
  type InventoryItem as InvItem,
} from '../utils/inventory-ux';
import type { Message } from 'discord.js';
import type { CommandContext } from '../types';
import { safeReply } from '../utils/safe-reply';
import { appendLostFooterIfNeeded } from '../utils/flow-helpers';

export async function runInventoryMessage(
  message: Message,
  ctx: CommandContext,
  helpPrefix = 'w',
): Promise<void> {
  const playerId = message.author.id;
  const sent = await safeReply(message, '🎒 **Envanter yükleniyor...**');
  if (!sent) return;

  const [player, items, rawBuffs] = await Promise.all([
    ctx.prisma.player.findUnique({ where: { id: playerId } }),
    ctx.prisma.inventoryItem.findMany({ where: { ownerId: playerId } }),
    listActiveBuffs(ctx.prisma as any, playerId),
  ]);
  if (!player) throw new Error('Oyuncu bulunamadi.');

  const capacity = INVENTORY_BASE_SLOTS + player.level * INVENTORY_PER_LEVEL;
  const name = message.member?.displayName ?? message.author.username;

  const activeBuffs = rawBuffs
    .filter((b) => b.chargeCur > 0)
    .map((b) => {
      const def = BUFF_ITEM_MAP[b.buffItemId];
      return {
        buffItemId: b.buffItemId,
        buffName: def
          ? `\`${def.useId}\` ${displayBuffEmoji(def)} **${def.name}**`
          : b.buffItemId,
        category: b.category,
        chargeCur: b.chargeCur,
        chargeMax: b.chargeMax,
      };
    });

  const renderData = (): import('../utils/inventory-ux').InventoryRenderData => ({
    username: name,
    items: items as InvItem[],
    activeBuffs,
    usedSlots: items.length,
    capacity,
    page: 0,
    totalPages: 1,
    mode: 'overview',
    helpPrefix,
  });

  const buildChunks = async (): Promise<string[]> => {
    const pages = buildInventoryPages(renderData());
    if (pages.length === 0) return [''];
    const last = pages.length - 1;
    pages[last] = await appendLostFooterIfNeeded(ctx.redis, playerId, 'inventory', pages[last]!);
    if (pages.length > 1) {
      pages[last] += '\n\n◀ ▶ ile diğer sayfalar';
    }
    return pages;
  };

  let chunks = await buildChunks();
  let chunkPage = 0;

  const renderChunkText = () => chunks[chunkPage] ?? chunks[0] ?? '';

  const renderRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('inv_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(chunks.length <= 1 || chunkPage === 0),
    new ButtonBuilder()
      .setCustomId('inv_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(chunks.length <= 1 || chunkPage === chunks.length - 1),
  );

  const components = chunks.length > 1 ? [renderRow()] : [];
  await sent.edit({ content: renderChunkText(), components }).catch(() =>
    safeReply(message, { content: renderChunkText(), components }),
  );

  if (chunks.length <= 1) return;

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== playerId) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }
    if (i.customId === 'inv_prev') chunkPage = Math.max(0, chunkPage - 1);
    if (i.customId === 'inv_next') chunkPage = Math.min(chunks.length - 1, chunkPage + 1);
    await i.update({ content: renderChunkText(), components: [renderRow()] });
  });

  collector.on('end', async () => {
    try {
      await sent.edit({ components: [] });
    } catch { /* mesaj silinmiş */ }
  });
}
