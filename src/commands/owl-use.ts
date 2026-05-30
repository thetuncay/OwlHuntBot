/**
 * owl-use.ts — owl use <id>  (birleşik buff + consumable kullanımı)
 *
 * ID sistemi:
 *   001–012  Buff item (charge)
 *   013–015  Consumable item (craft)
 */

import { EmbedBuilder, type Message } from 'discord.js';
import { MAX_ACTIVE_CONSUMABLES } from '../config';
import { activateBuff, listBuffInventory } from '../systems/items';
import { reloadInventoryFromPg } from '../state/player-state';
import type { CommandDefinition } from '../types';
import {
  resolveUseEntry,
  formatUseId,
  buildUseIdLegend,
} from '../utils/use-items';
import { getActiveConsumables } from '../utils/use-items';

async function useConsumable(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
  playerId: string,
  def: import('../config').ConsumableItemDef,
): Promise<void> {
  const invItem = await ctx.prisma.inventoryItem.findUnique({
    where: { ownerId_itemName: { ownerId: playerId, itemName: def.itemName } },
  });

  if (!invItem || invItem.quantity < 1) {
    await message.reply(
      `❌ Envanterinde **${def.emoji} ${def.itemName}** yok. \`${helpPrefix} craft\` ile üretebilirsin.`,
    );
    return;
  }

  if (def.durationMs > 0) {
    const active = await getActiveConsumables(ctx.redis, playerId);
    if (active.length >= MAX_ACTIVE_CONSUMABLES) {
      const activeNames = active.map((a) => `**${a.def.itemName}**`).join(', ');
      await message.reply(
        `❌ Aynı anda en fazla **${MAX_ACTIVE_CONSUMABLES} aktif item** olabilir.\n` +
        `Şu an aktif: ${activeNames}`,
      );
      return;
    }
    const alreadyActive = await ctx.redis.get(`${def.redisKey}:${playerId}`);
    if (alreadyActive) {
      const ttl = await ctx.redis.pttl(`${def.redisKey}:${playerId}`);
      const remaining = Math.ceil(ttl / 60000);
      await message.reply(`⚠️ **${def.emoji} ${def.itemName}** zaten aktif! *(${remaining} dk kaldı)*`);
      return;
    }
  }

  await ctx.prisma.$transaction(async (tx) => {
    if (invItem.quantity === 1) {
      await tx.inventoryItem.delete({
        where: { ownerId_itemName: { ownerId: playerId, itemName: def.itemName } },
      });
    } else {
      await tx.inventoryItem.update({
        where: { ownerId_itemName: { ownerId: playerId, itemName: def.itemName } },
        data: { quantity: { decrement: 1 } },
      });
    }

    if (def.effectType === 'stamina_restore') {
      const owl = await tx.owl.findFirst({ where: { ownerId: playerId, isMain: true } });
      if (owl) {
        const newStamina = Math.min(owl.hpMax, owl.staminaCur + def.effectValue);
        await tx.owl.update({ where: { id: owl.id }, data: { staminaCur: newStamina } });
      }
    }
  });

  if (def.durationMs > 0) {
    await ctx.redis.set(
      `${def.redisKey}:${playerId}`,
      String(def.effectValue),
      'PX',
      def.durationMs,
    );
  }

  await reloadInventoryFromPg(ctx.redis, ctx.prisma, playerId);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${def.emoji} ${def.itemName} Kullanıldı!`)
    .setDescription(def.description);

  if (def.effectType === 'stamina_restore') {
    embed.addFields({ name: '⚡ Etki', value: `Baykuşunun staminası **+${def.effectValue}** yenilendi.`, inline: false });
  } else if (def.effectType === 'upgrade_bonus_once') {
    const mins = Math.round(def.durationMs / 60000);
    embed.addFields({
      name: '⚡ Etki',
      value: `Bir sonraki upgrade denemesinde **+${def.effectValue} başarı puanı** (${mins} dk geçerli).`,
      inline: false,
    });
  } else if (def.effectType === 'hunt_catch_once') {
    const mins = Math.round(def.durationMs / 60000);
    embed.addFields({
      name: '⚡ Etki',
      value: `Bir sonraki hunt'ta yakalama şansı **+${Math.round(def.effectValue * 100)}%** (${mins} dk geçerli).`,
      inline: false,
    });
  }

  embed.setFooter({ text: `\`${helpPrefix} use ${def.useId}\` · Item envanterden düşüldü` });
  await message.reply({ embeds: [embed] });
}

async function useBuff(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
  playerId: string,
  def: import('../config').BuffItemDef,
): Promise<void> {
  try {
    const result = await activateBuff(ctx.prisma, playerId, def.id);
    await reloadInventoryFromPg(ctx.redis, ctx.prisma, playerId);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`${def.emoji} ${result.buffName} Aktifleştirildi!`)
      .setDescription(
        `> ${result.effectDescription}\n\n` +
        `> 🔋 Charge: **${result.chargeCur}/${result.chargeMax}**`,
      )
      .addFields(
        {
          name: '⚡ Kategori',
          value: def.category === 'hunt' ? '🏹 Av' : def.category === 'pvp' ? '⚔️ PvP' : '🔨 Upgrade',
          inline: true,
        },
        { name: '🆔 ID', value: `\`${def.useId}\``, inline: true },
        { name: '⚠️ Tradeoff', value: def.tradeoff, inline: false },
      )
      .setFooter({ text: `\`${helpPrefix} use ${def.useId}\` · Charge bitince pasifleşir` });

    await message.reply({ embeds: [embed] });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await message.reply(`❌ **Hata** | ${errMsg}`);
  }
}

export async function runUseMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const playerId = message.author.id;

  if (!args[0]) {
    const [buffInv, consInv, activeCons] = await Promise.all([
      listBuffInventory(ctx.prisma, playerId),
      ctx.prisma.inventoryItem.findMany({
        where: { ownerId: playerId, itemType: 'Consumable' },
      }),
      getActiveConsumables(ctx.redis, playerId),
    ]);

    if (buffInv.length === 0 && consInv.length === 0 && activeCons.length === 0) {
      await message.reply(
        `🎒 **Kullanılabilir item yok.**\n` +
        `> Lootbox açarak buff, craft ile item üretebilirsin.\n\n` +
        buildUseIdLegend(helpPrefix),
      );
      return;
    }

    const lines: string[] = ['**Kullanılabilir eşyalar:**', ''];

    if (activeCons.length > 0) {
      lines.push('⚡ **Aktif item efektleri:**');
      for (const { def, expiresAt } of activeCons) {
        const remaining = Math.ceil((expiresAt - Date.now()) / 60000);
        lines.push(`  \`${def.useId}\` ${def.emoji} **${def.itemName}** — *(${remaining} dk kaldı)*`);
      }
      lines.push('');
    }

    if (buffInv.length > 0) {
      lines.push('✨ **Buff envanteri** *(use ile aktifleştir)*:');
      for (const { def, quantity } of buffInv) {
        lines.push(`  \`${def.useId}\` ${def.emoji} **${def.name}** ×${quantity} — *${def.rarity}*`);
      }
      lines.push('');
    }

    if (consInv.length > 0) {
      lines.push('🧪 **Item envanteri** *(use ile tüket)*:');
      for (const item of consInv) {
        const entry = resolveUseEntry(item.itemName);
        const useId = entry?.kind === 'consumable' ? entry.def.useId : '???';
        const emoji = entry?.kind === 'consumable' ? entry.def.emoji : '🧪';
        lines.push(`  \`${useId}\` ${emoji} **${item.itemName}** ×${item.quantity}`);
      }
      lines.push('');
    }

    lines.push(`> Örnek: \`${helpPrefix} use 001\` (buff) · \`${helpPrefix} use 013\` (item)`);
    await message.reply(lines.join('\n'));
    return;
  }

  const entry = resolveUseEntry(args[0]);
  if (!entry) {
    const tried = formatUseId(args[0]!);
    await message.reply(
      `❌ **\`${tried}\` geçersiz ID.**\n\n` +
      buildUseIdLegend(helpPrefix),
    );
    return;
  }

  if (entry.kind === 'buff') {
    await useBuff(message, ctx, helpPrefix, playerId, entry.def);
  } else {
    await useConsumable(message, ctx, helpPrefix, playerId, entry.def);
  }
}
