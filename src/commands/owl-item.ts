/**
 * owl-item.ts — owl item <id> komutu
 *
 * Consumable item'ları kullanmak için.
 * Buff'lardan farklı: charge sistemi yok, kullanınca anında etki eder.
 * Max 2 aktif consumable aynı anda olabilir.
 */

import { EmbedBuilder, type Message } from 'discord.js';
import {
  CONSUMABLE_ITEMS,
  CONSUMABLE_ITEM_MAP,
  CONSUMABLE_ITEM_BY_NAME,
  MAX_ACTIVE_CONSUMABLES,
} from '../config';
import type { CommandDefinition } from '../types';

// ─── Aktif consumable listesi ─────────────────────────────────────────────────

export async function getActiveConsumables(
  redis: any,
  playerId: string,
): Promise<{ def: (typeof CONSUMABLE_ITEMS)[number]; expiresAt: number }[]> {
  const results: { def: (typeof CONSUMABLE_ITEMS)[number]; expiresAt: number }[] = [];
  for (const def of CONSUMABLE_ITEMS) {
    if (def.durationMs === 0) continue; // anlık efektler listede görünmez
    const key = `${def.redisKey}:${playerId}`;
    const val = await redis.get(key);
    if (val) {
      const ttl = await redis.pttl(key);
      results.push({ def, expiresAt: Date.now() + ttl });
    }
  }
  return results;
}

// ─── Item kullanma ────────────────────────────────────────────────────────────

export async function runItemMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const playerId = message.author.id;

  // Argümansız: aktif item'ları ve envanterdeki consumable'ları listele
  if (!args[0]) {
    const invItems = await ctx.prisma.inventoryItem.findMany({
      where: { ownerId: playerId, itemType: 'Consumable' },
    });

    const active = await getActiveConsumables(ctx.redis, playerId);

    if (invItems.length === 0 && active.length === 0) {
      await message.reply(
        `🧪 **Kullanılabilir item yok.**\n` +
        `> \`${helpPrefix} craft\` ile item üretebilirsin.\n` +
        `> Kullanım: \`${helpPrefix} item <id>\` (örn: \`${helpPrefix} item c002\`)`,
      );
      return;
    }

    const lines: string[] = [];

    if (active.length > 0) {
      lines.push('**⚡ Aktif Efektler:**');
      for (const { def, expiresAt } of active) {
        const remaining = Math.ceil((expiresAt - Date.now()) / 60000);
        lines.push(`  ${def.emoji} **${def.itemName}** — ${def.description} *(${remaining} dk kaldı)*`);
      }
      lines.push('');
    }

    if (invItems.length > 0) {
      lines.push('**📦 Envanterindeki Item\'lar:**');
      for (const item of invItems) {
        const def = CONSUMABLE_ITEM_BY_NAME[item.itemName];
        const id  = def ? `\`${def.id}\`` : '`?`';
        lines.push(`  ${id} ${def?.emoji ?? '🧪'} **${item.itemName}** ×${item.quantity} — ${def?.description ?? ''}`);
      }
      lines.push('');
      lines.push(`> Kullanmak için: \`${helpPrefix} item <id>\` (örn: \`${helpPrefix} item c002\`)`);
    }

    await message.reply(lines.join('\n'));
    return;
  }

  const itemId = args[0]!.toLowerCase();

  // ID veya item adı ile eşleştir
  const def = CONSUMABLE_ITEM_MAP[itemId]
    ?? CONSUMABLE_ITEMS.find((c) => c.itemName.toLowerCase() === args.join(' ').toLowerCase());

  if (!def) {
    const hint = CONSUMABLE_ITEMS.map((c) => `\`${c.id}\` ${c.emoji} ${c.itemName}`).join(', ');
    await message.reply(`❌ **Geçersiz item ID.** Geçerli item'lar: ${hint}`);
    return;
  }

  // Envanterde var mı?
  const invItem = await ctx.prisma.inventoryItem.findUnique({
    where: { ownerId_itemName: { ownerId: playerId, itemName: def.itemName } },
  });

  if (!invItem || invItem.quantity < 1) {
    await message.reply(`❌ Envanterinde **${def.emoji} ${def.itemName}** yok. \`${helpPrefix} craft\` ile üretebilirsin.`);
    return;
  }

  // Anlık efekt değilse: max 2 aktif consumable kontrolü
  if (def.durationMs > 0) {
    const active = await getActiveConsumables(ctx.redis, playerId);
    if (active.length >= MAX_ACTIVE_CONSUMABLES) {
      const activeNames = active.map((a) => `**${a.def.itemName}**`).join(', ');
      await message.reply(
        `❌ Aynı anda en fazla **${MAX_ACTIVE_CONSUMABLES} aktif item** olabilir.\n` +
        `Şu an aktif: ${activeNames}\n` +
        `Birinin süresi dolmasını bekle.`,
      );
      return;
    }

    // Zaten aktif mi?
    const alreadyActive = await ctx.redis.get(`${def.redisKey}:${playerId}`);
    if (alreadyActive) {
      const ttl = await ctx.redis.pttl(`${def.redisKey}:${playerId}`);
      const remaining = Math.ceil(ttl / 60000);
      await message.reply(`⚠️ **${def.emoji} ${def.itemName}** zaten aktif! *(${remaining} dk kaldı)*`);
      return;
    }
  }

  // Item'ı envanterden düş
  await ctx.prisma.$transaction(async (tx: any) => {
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

    // Anlık efekt: stamina restore
    if (def.effectType === 'stamina_restore') {
      const owl = await tx.owl.findFirst({ where: { ownerId: playerId, isMain: true } });
      if (owl) {
        const newStamina = Math.min(owl.hpMax, owl.staminaCur + def.effectValue);
        await tx.owl.update({ where: { id: owl.id }, data: { staminaCur: newStamina } });
      }
    }
  });

  // Süreli efekt: Redis'e yaz
  if (def.durationMs > 0) {
    await ctx.redis.set(
      `${def.redisKey}:${playerId}`,
      String(def.effectValue),
      'PX',
      def.durationMs,
    );
  }

  // Yanıt
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${def.emoji} ${def.itemName} Kullanıldı!`)
    .setDescription(def.description);

  if (def.effectType === 'stamina_restore') {
    embed.addFields({ name: '⚡ Etki', value: `Baykuşunun staminası **+${def.effectValue}** yenilendi.`, inline: false });
  } else if (def.effectType === 'upgrade_bonus_once') {
    const mins = Math.round(def.durationMs / 60000);
    embed.addFields({ name: '⚡ Etki', value: `Bir sonraki upgrade denemesinde **+${def.effectValue} başarı puanı** (${mins} dk geçerli).`, inline: false });
  } else if (def.effectType === 'hunt_catch_once') {
    const mins = Math.round(def.durationMs / 60000);
    embed.addFields({ name: '⚡ Etki', value: `Bir sonraki hunt'ta yakalama şansı **+${Math.round(def.effectValue * 100)}%** (${mins} dk geçerli).`, inline: false });
  }

  embed.setFooter({ text: `${helpPrefix} item — aktif item'ları görmek için argümansız kullan` });

  await message.reply({ embeds: [embed] });
}
