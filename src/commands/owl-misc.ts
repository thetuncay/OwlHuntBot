/**
 * owl-misc.ts — sell, zoo, cash, prefix komutları
 */

import { EmbedBuilder, PermissionFlagsBits, type Message } from 'discord.js';
import { PREY } from '../config';
import { setGuildPrefix } from '../utils/prefix';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';

// ─── Paylaşılan sabitler ──────────────────────────────────────────────────────

const SELL_PRICES: Record<string, number> = Object.fromEntries(
  PREY.map((p) => [p.name, p.sellPrice]),
);

const PREY_EMOJI: Record<string, string> = {
  fare: '🐭', serce: '🐦', kurbaga: '🐸', kertenkele: '🦎',
  hamster: '🐹', kostebek: '🐀', yarasa: '🦇', bildircin: '🐤',
  guvercin: '🕊️', yilan: '🐍', sincap: '🐿️', tavsan: '🐇',
  gelincik: '🦡', kirpi: '🦔',
};

const RARITY_ORDER: Record<string, number> = { Rare: 0, Uncommon: 1, Common: 2 };
const RARITY_LABEL: Record<string, string>  = { Rare: '🟣 Nadir', Uncommon: '🔵 Sıradan', Common: '⚪ Yaygın' };

// ─── sell ─────────────────────────────────────────────────────────────────────

export async function runSellMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const target = (args[0] ?? '').toLowerCase();
  const items  = await ctx.prisma.inventoryItem.findMany({
    where: { ownerId: message.author.id, itemType: 'Av' },
  });

  if (items.length === 0) {
    await message.reply(`🎒 Satacak av hayvanın yok. Önce \`${helpPrefix} hunt\` yap!`);
    return;
  }

  let toSell = items;
  if (target && target !== 'all') {
    toSell = items.filter((i) => i.itemName === target);
    if (toSell.length === 0) {
      await message.reply(`❌ **${target}** envanterinde yok.`);
      return;
    }
  }

  const totalCoins = toSell.reduce((sum, i) => sum + (SELL_PRICES[i.itemName] ?? 5) * i.quantity, 0);
  const totalCount = toSell.reduce((sum, i) => sum + i.quantity, 0);

  await ctx.prisma.$transaction(async (tx) => {
    for (const item of toSell) {
      await tx.inventoryItem.delete({ where: { id: item.id } });
    }
    await tx.player.update({
      where: { id: message.author.id },
      data:  { coins: { increment: totalCoins } },
    });
  });

  const player = await ctx.prisma.player.findUnique({
    where:  { id: message.author.id },
    select: { coins: true },
  });

  const sorted = [...toSell].sort((a, b) => (RARITY_ORDER[a.rarity] ?? 2) - (RARITY_ORDER[b.rarity] ?? 2));
  const lines  = sorted.map((i) => {
    const emoji = PREY_EMOJI[i.itemName] ?? '🦉';
    const price = SELL_PRICES[i.itemName] ?? 5;
    const dot   = i.rarity === 'Rare' ? '🟣' : i.rarity === 'Uncommon' ? '🔵' : '⚪';
    return `${dot} ${emoji} **${i.itemName}** ×${i.quantity} — \`${price * i.quantity} 💰\``;
  });

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('💰 Satış Tamamlandı!')
    .setDescription(lines.join('\n'))
    .addFields(
      { name: '📦 Satılan',    value: `**${totalCount}** hayvan`,                                          inline: true },
      { name: '💵 Kazanılan',  value: `**+${totalCoins.toLocaleString('tr-TR')} 💰**`,                    inline: true },
      { name: '🏦 Yeni Bakiye', value: `**${(player?.coins ?? totalCoins).toLocaleString('tr-TR')} 💰**`, inline: true },
    )
    .setFooter({ text: `${message.member?.displayName ?? message.author.username} · ${helpPrefix} hunt ile daha fazla av yap` });

  await message.reply({ embeds: [embed] });
}

// ─── zoo ──────────────────────────────────────────────────────────────────────

export async function runZooMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const items = await ctx.prisma.inventoryItem.findMany({
    where:   { ownerId: message.author.id, itemType: 'Av' },
    orderBy: [{ rarity: 'desc' }, { itemName: 'asc' }],
  });

  const name = message.member?.displayName ?? message.author.username;

  if (items.length === 0) {
    await message.reply(
      `🌿 **${name}'in Hayvanat Bahçesi**\n\n📭 Henüz hiç hayvan yok!\n\`${helpPrefix} hunt\` yaparak hayvan toplamaya başla.`,
    );
    return;
  }

  const totalAnimals = items.reduce((s, i) => s + i.quantity, 0);
  const totalValue   = items.reduce((s, i) => s + (SELL_PRICES[i.itemName] ?? 5) * i.quantity, 0);

  const grouped: Record<string, typeof items> = { Rare: [], Uncommon: [], Common: [] };
  for (const item of items) {
    (grouped[item.rarity] ?? grouped['Common']!).push(item);
  }

  let zoo = `🌿 **${name}'in Hayvanat Bahçesi**\n`;
  zoo += `> 🐾 Toplam **${totalAnimals}** hayvan  💰 Değer **${totalValue}** coin\n\n`;

  for (const [rarity, group] of Object.entries(grouped)) {
    if (group.length === 0) continue;
    zoo += `${RARITY_LABEL[rarity] ?? rarity}\n`;
    for (const item of group) {
      const emoji = PREY_EMOJI[item.itemName] ?? '🦉';
      const price = SELL_PRICES[item.itemName] ?? 5;
      const bar   = '▓'.repeat(Math.min(item.quantity, 10)) + '░'.repeat(Math.max(0, 10 - item.quantity));
      zoo += `${emoji} **${item.itemName}** \`${bar}\` ×${item.quantity} — ${price * item.quantity} 💰\n`;
    }
    zoo += '\n';
  }

  zoo += `> 💡 \`${helpPrefix} sell\` ile hepsini sat · \`${helpPrefix} sell <hayvan>\` ile tek tek sat`;
  await message.reply(zoo);
}

// ─── cash ─────────────────────────────────────────────────────────────────────

export async function runCashMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const player = await ctx.prisma.player.findUnique({
    where:  { id: message.author.id },
    select: { coins: true, level: true },
  });
  if (!player) {
    await message.reply(`❌ Kayıtlı değilsin.`);
    return;
  }
  const name = message.member?.displayName ?? message.author.username;
  await message.reply(
    `💰 **${name}**, şu an **${player.coins.toLocaleString('tr-TR')} coin** var! · Lv.**${player.level}**`,
  );
}

// ─── prefix ───────────────────────────────────────────────────────────────────

export async function runPrefixMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  if (!message.guildId) {
    await message.reply(`❌ **Hata** | Bu komut sadece sunucuda kullanilabilir.`);
    return;
  }
  const hasAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  if (!hasAdmin) {
    await message.reply(`🔒 **Yetki** | Prefix ayari icin yonetici yetkisi gerekir.`);
    return;
  }
  const value = (args[0] ?? '').trim().toLowerCase();
  if (!value || !/^[a-z0-9]{1,16}$/i.test(value)) {
    await message.reply(`❌ **Gecersiz Prefix** | Kullanim: owl prefix <1-16 harf/rakam>`);
    return;
  }
  const newPrefix = await setGuildPrefix(ctx.redis, message.guildId, value);
  await message.reply(`✅ **Prefix Guncellendi** 🎉\nYeni prefix: \`${newPrefix}\`\nOrnek: \`${newPrefix} hunt\``);
}

// ─── Slash: /owl prefix ───────────────────────────────────────────────────────

export async function runPrefix(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ embeds: [failEmbed('Hata', 'Bu komut sadece sunucuda kullanilabilir.')], flags: 64 });
    return;
  }
  const hasAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (!hasAdmin) {
    await interaction.reply({ embeds: [failEmbed('Yetki', 'Prefix ayari icin yonetici yetkisi gerekir.')], flags: 64 });
    return;
  }
  const value = interaction.options.getString('deger', true).trim().toLowerCase();
  if (!/^[a-z0-9]{1,16}$/i.test(value)) {
    await interaction.reply({
      embeds: [failEmbed('Gecersiz Prefix', 'Prefix 1-16 karakter olmali ve sadece harf/rakam icermeli.')],
      flags: 64,
    });
    return;
  }
  const newPrefix = await setGuildPrefix(ctx.redis, interaction.guildId, value);
  const { successEmbed: se } = await import('../utils/embed');
  await interaction.reply({
    embeds: [se('Prefix Guncellendi', `Yeni prefix: \`${newPrefix}\`\nOrnek: \`${newPrefix} hunt\``)],
    flags: 64,
  });
}
