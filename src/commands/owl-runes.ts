/**
 * owl-runes.ts — w rün / w run
 */

import type { Message } from 'discord.js';
import type { CommandContext } from '../types';
import {
  applyRuneToMain,
  getRuneAppliedCount,
  listOwnedRunes,
} from '../systems/runes';
import {
  buildRuneInventoryText,
  formatRuneApplyMessage,
} from '../utils/rune-ux';
import { failEmbed } from '../utils/embed';

/**
 * Prefix: rün envanteri veya apply.
 *
 * @param message Discord mesajı
 * @param args Argümanlar (id opsiyonel)
 * @param ctx Komut bağlamı
 * @param prefix Guild prefix
 */
export async function runRuneMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
): Promise<void> {
  const userId = message.author.id;
  const token = (args[0] ?? '').trim();

  if (!token) {
    const owned = await listOwnedRunes(ctx.prisma, userId);
    const main = await ctx.prisma.owl.findFirst({
      where: { ownerId: userId, isMain: true },
      select: { id: true },
    });
    const applied = main
      ? await getRuneAppliedCount(ctx.redis, main.id)
      : 0;
    await message.reply(buildRuneInventoryText(owned, applied, prefix));
    return;
  }

  try {
    const result = await applyRuneToMain(ctx.prisma, ctx.redis, userId, token);
    await message.reply(formatRuneApplyMessage(result.def, result.appliedCount));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Rün uygulanamadı.';
    await message.reply({ embeds: [failEmbed('Rün', msg)] });
  }
}
