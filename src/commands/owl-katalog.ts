/**
 * owl-katalog.ts — w katalog (buff + materyal rehberi)
 */

import type { Message } from 'discord.js';
import {
  buildCatalogCommandsField,
  buildCatalogDetailEmbed,
  buildCatalogOverviewEmbed,
  findCatalogEntry,
  resolveCatalogSection,
} from '../utils/catalog-ux';
import type { CommandContext } from '../types';
import { embedWithLostFooterIfNeeded } from '../utils/flow-helpers';
import { fireQuest } from '../systems/quest-tracker';
import { getPreyDexView } from '../systems/prey-dex';
import { buildPreyDexEmbed } from '../utils/prey-dex-ux';
import { buildRuneCatalogEmbed } from '../utils/rune-ux';
import { foldTrAscii } from '../utils/alias-command';

export async function runKatalogMessage(
  message: Message,
  args: string[],
  helpPrefix: string,
  ctx?: CommandContext,
): Promise<void> {
  const userId = message.author.id;
  if (ctx?.prisma) await fireQuest(ctx.prisma, userId, 'katalog', 1);
  const redis = ctx?.redis;
  const first = (args[0] ?? '').trim();
  const firstFolded = foldTrAscii(first);

  if (first === 'defter' || first === 'av' || first === 'dex') {
    if (!ctx?.prisma) {
      await message.reply('Av defteri şu an açılamıyor.');
      return;
    }
    const rows = await getPreyDexView(ctx.prisma, userId);
    const name = message.member?.displayName ?? message.author.username;
    await message.reply({ embeds: [buildPreyDexEmbed(name, rows, helpPrefix)] });
    return;
  }

  if (firstFolded === 'run' || firstFolded === 'rune') {
    await message.reply({ embeds: [buildRuneCatalogEmbed(helpPrefix)] });
    return;
  }

  if (first) {
    const section = resolveCatalogSection(first);
    if (section) {
      let embed = buildCatalogOverviewEmbed(helpPrefix, section);
      if (redis) {
        embed = await embedWithLostFooterIfNeeded(redis, userId, 'katalog', embed);
      }
      await message.reply({ embeds: [embed] });
      return;
    }

    const entry = findCatalogEntry(first);
    if (entry) {
      const embed = buildCatalogDetailEmbed(entry, helpPrefix);
      if (embed) {
        await message.reply({ embeds: [embed] });
        return;
      }
    }

    await message.reply(
      `❌ **\`${first}\`** katalogda bulunamadı.\n\n` +
      buildCatalogCommandsField(helpPrefix),
    );
    return;
  }

  let embed = buildCatalogOverviewEmbed(helpPrefix, 'all');
  if (redis) {
    embed = await embedWithLostFooterIfNeeded(redis, userId, 'katalog', embed);
  }
  await message.reply({ embeds: [embed] });
}
