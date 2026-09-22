/**
 * owl-use.ts — owl use <id>  (buff takma)
 */

import { EmbedBuilder, type Message } from 'discord.js';
import { BUFF_ITEMS, LEGACY_REMOVED_ITEM_SET } from '../config';
import { displayBuffEmoji } from '../config/custom-emojis';
import { activateBuff, listActiveBuffs, listBuffInventory } from '../systems/items';
import { mergeQuestNotices, trackQuestProgress, trackQuestThreshold } from '../systems/daily-quests';
import { formatQuestCompletionLines } from '../utils/quest-ux';
import type { CommandDefinition } from '../types';
import {
  resolveBuffEntry,
  formatUseId,
  buildUseIdLegend,
  formatBuffSlotStatus,
} from '../utils/use-items';
import { chargeBadge } from '../utils/theme';

function resolveLegacyRemovedName(input: string): string | null {
  const lower = input.trim().toLowerCase();
  for (const name of LEGACY_REMOVED_ITEM_SET) {
    if (name.toLowerCase() === lower) return name;
  }
  const useId = formatUseId(input);
  const legacyIds: Record<string, string> = {
    '007': 'Berrak Zihin',
    '008': 'Koruyucu Talisman',
    '009': 'Usta Eli',
    '010': 'Savaş Ruhu',
    '011': 'Savunma Duruşu',
    '012': 'Arena Ustası',
    '013': 'Karma Yem',
    '014': 'Bileme Taşı',
    '015': 'Yırtıcı İksiri',
    '016': 'Savaş İksiri',
    '017': 'Gölge Zırhı',
    '018': 'Av Trofesi Yağı',
    '019': 'Koruyucu Balmumu',
    '020': 'Güç Kapsülü',
  };
  return legacyIds[useId] ?? null;
}

export async function runUseMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const playerId = message.author.id;

  if (!args[0]) {
    const [buffInv, activeBuffs] = await Promise.all([
      listBuffInventory(ctx.prisma, playerId),
      listActiveBuffs(ctx.prisma as Parameters<typeof listActiveBuffs>[0], playerId),
    ]);

    if (buffInv.length === 0 && activeBuffs.length === 0) {
      await message.reply(
        `🎒 **Kullanılabilir buff yok.**\n` +
        `> Lootbox (\`${helpPrefix} ek\` / \`${helpPrefix} sk\`) ve seviye ödüllerinden düşer.\n\n` +
        buildUseIdLegend(helpPrefix),
      );
      return;
    }

    const active = activeBuffs.filter((b) => b.chargeCur > 0);
    const lines: string[] = [
      '**Buff envanteri**',
      formatBuffSlotStatus(active.length),
      '',
    ];

    if (active.length > 0) {
      lines.push('✨ **Aktif buff\'lar:**');
      for (const b of active) {
        const def = BUFF_ITEMS.find((row) => row.id === b.buffItemId);
        if (!def) continue;
        lines.push(`  \`${def.useId}\` ${displayBuffEmoji(def)} **${def.name}** — ${chargeBadge(b.chargeCur, b.chargeMax)} charge`);
      }
      lines.push('');
    }

    if (buffInv.length > 0) {
      lines.push('📦 **Envanterde (takılmamış):**');
      for (const { def, quantity } of buffInv) {
        lines.push(`  \`${def.useId}\` ${displayBuffEmoji(def)} **${def.name}** ×${quantity} — *${def.rarity}*`);
      }
      lines.push('');
    }

    lines.push(`> \`${helpPrefix} use 001\` ile tak · \`${helpPrefix} katalog\` rehber`);
    await message.reply(lines.join('\n'));
    return;
  }

  const legacyName = resolveLegacyRemovedName(args[0]!);
  if (legacyName) {
    await message.reply(
      `❌ **${legacyName}** artık kullanılamıyor (sistem kaldırıldı).\n` +
      `> Envanterde kaldıysa \`${helpPrefix} sell\` ile satabilirsin.`,
    );
    return;
  }

  const def = resolveBuffEntry(args[0]!);
  if (!def) {
    await message.reply(
      `❌ **\`${formatUseId(args[0]!)}\` geçersiz buff ID.**\n\n` +
      buildUseIdLegend(helpPrefix),
    );
    return;
  }

  try {
    const result = await activateBuff(ctx.prisma, playerId, def.id, ctx.redis);
    const questBatches = [await trackQuestProgress(ctx.prisma, playerId, 'use', 1)];
    if (def.category === 'hunt') {
      questBatches.push(await trackQuestProgress(ctx.prisma, playerId, 'buff_hunt', 1));
    }
    const activeBuffs = await listActiveBuffs(ctx.prisma, playerId);
    const activeCount = activeBuffs.filter((b) => b.chargeCur > 0).length;
    if (activeCount > 0) {
      questBatches.push(await trackQuestThreshold(ctx.prisma, playerId, 'buff_active', activeCount));
    }
    const questNotices = mergeQuestNotices(...questBatches);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`${result.buffName} takıldı`)
      .setDescription(result.effectDescription)
      .setFooter({ text: `Charge: ${chargeBadge(result.chargeCur, result.chargeMax)} · max 3 aktif buff` });

    const followUp = formatQuestCompletionLines(questNotices, helpPrefix).join('\n');
    await message.reply({ embeds: [embed], content: followUp || undefined });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await message.reply(`❌ **Hata** | ${errMsg}`);
  }
}
