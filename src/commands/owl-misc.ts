/**
 * owl-misc.ts — sell, zoo, cash, prefix, aç, buff komutları
 */

import { EmbedBuilder, PermissionFlagsBits, type Message } from 'discord.js';
import { PREY, LOOTBOX_DEFS, BUFF_ITEMS, BUFF_ITEM_MAP } from '../config';
import { setGuildPrefix } from '../utils/prefix';
import { failEmbed } from '../utils/embed';
import { openLootbox, listLootboxInventory, getPityCounts } from '../systems/lootbox';
import { activateBuff, listBuffInventory } from '../systems/items';
import type Redis from 'ioredis';
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
    (grouped[item.rarity] ?? grouped.Common!).push(item);
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
  const { successEmbed: se } = await import('../utils/embed.js');
  await interaction.reply({
    embeds: [se('Prefix Guncellendi', `Yeni prefix: \`${newPrefix}\`\nOrnek: \`${newPrefix} hunt\``)],
    flags: 64,
  });
}

// ─── aç (lootbox açma) ────────────────────────────────────────────────────────

export async function runAcMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const playerId = message.author.id;

  if (!args[0]) {
    const boxes = await listLootboxInventory(ctx.prisma, playerId);
    const pity  = await getPityCounts(ctx.redis as unknown as Redis, playerId);

    if (boxes.length === 0) {
      await message.reply(
        `📦 **Envanterinde hiç lootbox yok.**\n` +
        `> Hunt, PvP veya encounter'dan otomatik düşer.\n` +
        `> Kullanım: \`${helpPrefix} aç <kutu adı>\`\n` +
        `> Örnek: \`${helpPrefix} aç Ortak Kutu\``,
      );
      return;
    }

    const lines = boxes.map(({ def, quantity }) => {
      const p = pity[def.id] ?? 0;
      return `${def.emoji} **${def.name}** ×${quantity}  *(pity: ${p}/${def.pityThreshold})*`;
    });

    await message.reply(
      `📦 **Lootbox Envanteri**\n\n${lines.join('\n')}\n\n` +
      `> \`${helpPrefix} aç <kutu adı>\` ile aç — örnek: \`${helpPrefix} aç Ortak Kutu\``,
    );
    return;
  }

  const boxName = args.join(' ').trim();
  const def     = LOOTBOX_DEFS.find((l) => l.name.toLowerCase() === boxName.toLowerCase());

  if (!def) {
    const names = LOOTBOX_DEFS.map((l) => `\`${l.name}\``).join(', ');
    await message.reply(`❌ **Geçersiz kutu adı.** Mevcut kutular: ${names}`);
    return;
  }

  try {
    const result = await openLootbox(ctx.prisma, ctx.redis as unknown as Redis, playerId, def.id);

    const RARITY_COLOR: Record<string, number> = {
      Legendary: 0xf1c40f, Epic: 0x9b59b6, Rare: 0x3498db, Common: 0x95a5a6,
    };
    const topRarity = result.items.reduce((best, item) => {
      const order: Record<string, number> = { Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
      return (order[item.rarity] ?? 0) > (order[best] ?? 0) ? item.rarity : best;
    }, 'Common');

    const itemLines = result.items.map((item) => `${item.emoji} **${item.buffName}** *(${item.rarity})*`);

    const embed = new EmbedBuilder()
      .setColor(RARITY_COLOR[topRarity] ?? 0x5865f2)
      .setTitle(`${result.lootboxName} Açıldı!`)
      .setDescription(itemLines.join('\n') || '*Hiçbir şey çıkmadı.*')
      .setFooter({
        text: result.pityTriggered
          ? '✨ Pity garantisi tetiklendi!'
          : `${message.member?.displayName ?? message.author.username}`,
      });

    await message.reply({ embeds: [embed] });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await message.reply(`❌ **Hata** | ${errMsg}`);
  }
}

// ─── buff (buff item aktifleştirme) ──────────────────────────────────────────

export async function runBuffMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const playerId = message.author.id;

  if (!args[0]) {
    // Envanterdeki buff item'larını listele
    const buffItems = await listBuffInventory(ctx.prisma as any, playerId);

    if (buffItems.length === 0) {
      await message.reply(
        `✨ **Envanterinde hiç buff item yok.**\n` +
        `> Lootbox açarak buff item kazanabilirsin.\n` +
        `> Kullanım: \`${helpPrefix} buff <item adı>\``,
      );
      return;
    }

    const lines = buffItems.map(({ def, quantity }) =>
      `${def.emoji} **${def.name}** ×${quantity} — *${def.category} · ${def.chargeMax} charge*\n` +
      `> \`${helpPrefix} b ${def.id}\` ile aktifleştir`,
    );

    await message.reply(
      `✨ **Buff Item Envanteri**\n\n${lines.join('\n')}\n\n` +
      `> \`${helpPrefix} buffs\` ile tüm buff rehberini gör`,
    );
    return;
  }

  const itemName = args.join(' ').trim();
  // ID veya tam isim ile eşleştir (OwO tarzı: "owl b keskin_nisan" veya "owl b Keskin Nişan")
  const def = BUFF_ITEMS.find(
    (b) =>
      b.id.toLowerCase() === itemName.toLowerCase() ||
      b.name.toLowerCase() === itemName.toLowerCase(),
  );

  if (!def) {
    // Kısmi eşleşme öner
    const suggestions = BUFF_ITEMS.filter(
      (b) =>
        b.name.toLowerCase().includes(itemName.toLowerCase()) ||
        b.id.toLowerCase().includes(itemName.toLowerCase()),
    ).slice(0, 3);
    const hint = suggestions.length > 0
      ? `\nBunlardan birini mi kastettin?\n${suggestions.map((b) => `• ${b.emoji} **${b.name}** (\`${helpPrefix} b ${b.id}\`)`).join('\n')}`
      : `\n> \`${helpPrefix} buffs\` ile tüm listeyi gör.`;
    await message.reply(`❌ **Geçersiz item.** \`${itemName}\` bulunamadı.${hint}`);
    return;
  }

  try {
    const result = await activateBuff(ctx.prisma as any, playerId, def.id);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`${def.emoji} ${result.buffName} Aktifleştirildi!`)
      .setDescription(
        `> Buff aktif! **${result.chargeMax}** charge ile başladı.\n` +
        `> Her ${def.category === 'hunt' ? 'av' : def.category === 'pvp' ? 'PvP' : 'upgrade'} işleminde 1 charge tüketilir.`,
      )
      .addFields(
        { name: '⚡ Kategori', value: def.category, inline: true },
        { name: '🔋 Charge', value: `${result.chargeCur}/${result.chargeMax}`, inline: true },
        { name: '📊 Etki', value: `${def.effectType}: +${def.effectValue}`, inline: true },
      )
      .setFooter({ text: 'Charge bitince buff pasifleşir — item silinmez.' });

    await message.reply({ embeds: [embed] });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await message.reply(`❌ **Hata** | ${errMsg}`);
  }
}

// ─── buffs (buff rehberi) ─────────────────────────────────────────────────────

export async function runBuffsMessage(
  message: Message,
  args: string[],
  helpPrefix: string,
): Promise<void> {
  const sub = (args[0] ?? '').toLowerCase();

  // Kategori filtresi: owl buffs hunt / upgrade / pvp
  const validCats = ['hunt', 'upgrade', 'pvp'] as const;
  type Cat = typeof validCats[number];
  const catFilter = validCats.includes(sub as Cat) ? (sub as Cat) : null;

  const RARITY_ORDER: Record<string, number> = { Common: 1, Rare: 2, Epic: 3, Legendary: 4 };
  const RARITY_BADGE: Record<string, string> = {
    Common: '⬜', Rare: '🔵', Epic: '🟣', Legendary: '🟡',
  };
  const CAT_EMOJI: Record<string, string> = { hunt: '🏹', upgrade: '⚒️', pvp: '⚔️' };
  const CAT_LABEL: Record<string, string> = { hunt: 'Av', upgrade: 'Upgrade', pvp: 'PvP' };

  const items = catFilter
    ? BUFF_ITEMS.filter((b) => b.category === catFilter)
    : BUFF_ITEMS;

  const sorted = [...items].sort((a, b) =>
    a.category.localeCompare(b.category) || (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0),
  );

  // Kategorilere grupla
  const groups = new Map<string, typeof BUFF_ITEMS>();
  for (const item of sorted) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category)!.push(item);
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('✨ Buff Item Rehberi')
    .setDescription(
      '> Buff item\'ları aktifleştirerek av, upgrade ve PvP performansını artırabilirsin.\n' +
      `> Aktifleştirmek için: \`${helpPrefix} buff <item adı>\`\n` +
      `> Lootbox açarak buff kazanmak için: \`${helpPrefix} aç\``,
    );

  for (const [cat, catItems] of groups) {
    const catEmoji = CAT_EMOJI[cat] ?? '✨';
    const catLabel = CAT_LABEL[cat] ?? cat;

    const lines = catItems.map((item) => {
      const badge = RARITY_BADGE[item.rarity] ?? '⬜';
      const chargeInfo = item.chargeMax;
      const costInfo =
        item.category === 'hunt'    ? `${item.chargeMax} av` :
        item.category === 'pvp'     ? `${item.chargeMax} dövüş` :
        `${item.chargeMax} deneme`;

      // Etki açıklaması
      let effectDesc = '';
      switch (item.effectType) {
        case 'catch_bonus':      effectDesc = `+%${Math.round(item.effectValue * 100)} yakalama şansı`; break;
        case 'loot_mult':        effectDesc = `+%${Math.round((item.effectValue - 1) * 100)} drop çarpanı`; break;
        case 'rare_drop_bonus':  effectDesc = `+%${Math.round(item.effectValue * 100)} nadir drop`; break;
        case 'upgrade_bonus':    effectDesc = `+${item.effectValue} upgrade başarı puanı`; break;
        case 'downgrade_shield': effectDesc = `-%${Math.round((1 - item.effectValue) * 100)} downgrade riski`; break;
        case 'pvp_damage_mult':  effectDesc = `+%${Math.round((item.effectValue - 1) * 100)} PvP hasarı`; break;
        case 'pvp_dodge_bonus':  effectDesc = `+%${Math.round(item.effectValue * 100)} dodge şansı`; break;
        default:                 effectDesc = item.description;
      }

      // Arena Ustası özel: hem hasar hem dodge
      if (item.id === 'b012') effectDesc = '+%12 hasar & +%6 dodge';
      if (item.id === 'b004') effectDesc = '+%5 yakalama & +%20 drop';

      return `${badge} ${item.emoji} **${item.name}** *(${item.rarity})*\n` +
             `> ${effectDesc} · ${costInfo} charge`;
    });

    embed.addFields({
      name: `${catEmoji} ${catLabel} Buff'ları`,
      value: lines.join('\n'),
      inline: false,
    });
  }

  // Nasıl bulunur
  embed.addFields({
    name: '📦 Nasıl Bulunur?',
    value: [
      '• **Lootbox açarak** — Hunt, PvP veya encounter\'dan düşen kutular',
      '• **Hunt drop** — Her avda küçük şansla düşer',
      '• **PvP kazanma** — Galip gelince şansla düşer',
      '• **Encounter tame** — Yabani baykuş evcilleştirince en yüksek şans',
    ].join('\n'),
    inline: false,
  });

  // Diminishing returns notu
  embed.addFields({
    name: '⚠️ Diminishing Returns',
    value: [
      'Aynı türden birden fazla buff aktifleştirirsen etki azalır:',
      '• 1. buff → **%100** etki',
      '• 2. buff → **%60** etki',
      '• 3. buff → **%30** etki',
    ].join('\n'),
    inline: false,
  });

  embed.setFooter({
    text: catFilter
      ? `${catFilter} kategorisi gösteriliyor · Tüm kategoriler: ${helpPrefix} buffs`
      : `Kategori filtresi: ${helpPrefix} buffs hunt / upgrade / pvp`,
  });

  await message.reply({ embeds: [embed] });
}

