import type { Message } from 'discord.js';
import { DISMANTLE_TABLE } from '../config';
import { dismantleItem, dismantleAllPrey } from '../systems/crafting';
import { failEmbed } from '../utils/embed';
import {
  buildBulkDismantleMessage,
  buildDismantleOwnedMessage,
  buildDismantleStatMessage,
  buildSingleDismantleMessage,
} from '../utils/dismantle-ux';
import type { CommandContext } from '../types';

const DISMANTLE_STAT_ARGS = new Set(['stat', 'stats']);

/**
 * Prefix parçala: envanter listesi, tarif tablosu (`stat`), `all`, veya tek av.
 *
 * @param message Discord mesajı
 * @param args `stat` | `all` | `<av> [adet]`
 * @param ctx Komut bağlamı
 * @param prefix Guild prefix
 */
export async function runDismantleMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
) {
  const userId = message.author.id;

  if (args.length === 0) {
    const avItems = await ctx.prisma.inventoryItem.findMany({
      where: { ownerId: userId, itemType: 'Av' },
      orderBy: { quantity: 'desc' },
    });
    const owned = avItems.filter((i) => i.itemName in DISMANTLE_TABLE);
    await message.reply(buildDismantleOwnedMessage(owned, prefix));
    return;
  }

  const firstArg = args[0]!.toLowerCase();

  if (DISMANTLE_STAT_ARGS.has(firstArg)) {
    await message.reply(buildDismantleStatMessage());
    return;
  }

  if (firstArg === 'all') {
    try {
      const { dismantled, produced } = await dismantleAllPrey(ctx.prisma, userId, ctx.redis);
      await message.reply(buildBulkDismantleMessage(dismantled, produced));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Hata';
      await message.reply({ embeds: [failEmbed('Hata', errMsg)] });
    }
    return;
  }

  const itemName = firstArg;
  const quantity = parseInt(args[1] ?? '1', 10) || 1;

  if (!(itemName in DISMANTLE_TABLE)) {
    await message.reply({
      embeds: [failEmbed(
        'Parçalanamaz',
        `\`${itemName}\` parçalanamaz.\n\`${prefix} parçala stat\``,
      )],
    });
    return;
  }

  try {
    const produced = await dismantleItem(ctx.prisma, userId, itemName, quantity, ctx.redis);
    await message.reply(buildSingleDismantleMessage(itemName, quantity, produced));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Hata';
    await message.reply({ embeds: [failEmbed('Hata', errMsg)] });
  }
}
