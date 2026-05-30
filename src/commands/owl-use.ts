/**
 * owl-use.ts — owl use <id>  (birleşik buff + craft item kullanımı)
 *
 * ID sistemi:
 *   001–012  Buff (charge, lootbox)
 *   013–020  Craft item (max 2 yük slotu + anlık yemler)
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
  getActiveConsumables,
  formatConsumableEffectField,
  formatEquipSlotStatus,
  formatGearCategory,
  usesEquipSlot,
} from '../utils/use-items';

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

  if (usesEquipSlot(def)) {
    const active = await getActiveConsumables(ctx.redis, playerId);
    if (active.length >= MAX_ACTIVE_CONSUMABLES) {
      const activeNames = active
        .map((a) => `${a.def.emoji} **${a.def.itemName}**`)
        .join(', ');
      await message.reply(
        `❌ Yük slotu dolu (**${MAX_ACTIVE_CONSUMABLES}/${MAX_ACTIVE_CONSUMABLES}**).\n` +
        `> Buff'lar (001–012) ayrı çalışır — bunlar craft yük slotunu doldurur.\n` +
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
  });

  await ctx.redis.set(
    `${def.redisKey}:${playerId}`,
    String(def.effectValue),
    'PX',
    def.durationMs,
  );

  await reloadInventoryFromPg(ctx.redis, ctx.prisma, playerId);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${def.emoji} ${def.itemName} Takıldı!`)
    .setDescription(def.description)
    .addFields(
      { name: formatGearCategory(def), value: formatConsumableEffectField(def).value, inline: false },
    );

  const active = await getActiveConsumables(ctx.redis, playerId);
  embed.setFooter({
    text: `${formatEquipSlotStatus(active.length)} · \`${helpPrefix} use ${def.useId}\` · min 15 dk aktif`,
  });

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
      .setFooter({ text: `\`${helpPrefix} use ${def.useId}\` · Buff slotu (craft yükünden ayrı)` });

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
        `🎒 **Kullanılabilir eşya yok.**\n` +
        `> Lootbox → buff (001–012) · Craft → item (013–020)\n\n` +
        buildUseIdLegend(helpPrefix),
      );
      return;
    }

    const lines: string[] = [
      '**Kullanılabilir eşyalar**',
      formatEquipSlotStatus(activeCons.length),
      '',
    ];

    if (activeCons.length > 0) {
      lines.push('📦 **Aktif yük slotları:**');
      for (const { def, expiresAt } of activeCons) {
        const remaining = Math.ceil((expiresAt - Date.now()) / 60000);
        lines.push(
          `  \`${def.useId}\` ${def.emoji} **${def.itemName}** (${formatGearCategory(def)}) — *${remaining} dk*`,
        );
      }
      lines.push('');
    }

    if (buffInv.length > 0) {
      lines.push('✨ **Buff envanteri** *(charge, ayrı sistem)*:');
      for (const { def, quantity } of buffInv) {
        lines.push(`  \`${def.useId}\` ${def.emoji} **${def.name}** ×${quantity} — *${def.rarity}*`);
      }
      lines.push('');
    }

    if (consInv.length > 0) {
      lines.push('🔨 **Craft envanteri** *(use ile tak/kullan)*:');
      for (const item of consInv) {
        const entry = resolveUseEntry(item.itemName);
        const useId = entry?.kind === 'consumable' ? entry.def.useId : '???';
        const emoji = entry?.kind === 'consumable' ? entry.def.emoji : '🧪';
        const gear = entry?.kind === 'consumable' ? formatGearCategory(entry.def) : '';
        lines.push(`  \`${useId}\` ${emoji} **${item.itemName}** ×${item.quantity} ${gear}`);
      }
      lines.push('');
    }

    lines.push(`> \`${helpPrefix} use 001\` buff · \`${helpPrefix} use 016\` craft item`);
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
