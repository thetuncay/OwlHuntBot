import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  buyListing,
  cancelListing,
  countListingsByCategory,
  createListing,
  createOwlListing,
  fetchListingByNo,
  fetchListings,
  fetchMarketAnalytics,
  fetchMyActiveListings,
  fetchRecentSales,
  parseMarketSort,
  type MarketCategory,
} from '../systems/market';
import {
  buildListingCreatedText,
  buildMarketBrowseText,
  buildMarketHubText,
  buildMarketInfoText,
  buildMyListingsText,
  buildPurchaseSuccessText,
} from '../utils/market-ux';
import type { CommandContext } from '../types';
import { parseMarketSellItemArgs, resolveInventoryItemName } from '../utils/market-parse';
import { resolveOwlByInput } from '../utils/owl-id';

const VALID_CATEGORIES = new Set<string>(['owl', 'item', 'buff', 'material']);

function parseCategory(raw?: string): MarketCategory | undefined {
  const c = raw?.toLowerCase();
  return c && VALID_CATEGORIES.has(c) ? (c as MarketCategory) : undefined;
}

async function handleBuy(
  ctx: CommandContext,
  userId: string,
  listingRef: string,
  reply: (text: string) => Promise<void>,
) {
  try {
    const { listing, tax, sellerGain } = await buyListing(ctx.prisma, userId, listingRef, ctx.redis);
    await reply(buildPurchaseSuccessText(listing, tax, sellerGain));
  } catch (err: any) {
    await reply(`❌ ${err.message}`);
  }
}

async function handleSell(
  ctx: CommandContext,
  userId: string,
  args: string[],
  prefix: string,
  reply: (text: string) => Promise<void>,
) {
  if (args[0]?.toLowerCase() === 'owl') {
    const rest = args.slice(1);
    const price = parseInt(rest[rest.length - 1] ?? '0', 10);
    const owlIdInput = rest.length >= 2 ? rest.slice(0, -1).join(' ') : rest[0] ?? '';
    if (!owlIdInput || !price) {
      await reply(
        `Kullanım: \`${prefix} market sell owl <kısa_id> <fiyat>\`\n` +
        `Örn: \`${prefix} market sell owl A1B2C3D4 50000\` · ID için \`${prefix} owls\``,
      );
      return;
    }
    try {
      const owl = await resolveOwlByInput(ctx.prisma, userId, owlIdInput);
      if (!owl) {
        await reply(`❌ Baykuş bulunamadı. \`${prefix} owls\` ile kısa ID'yi kontrol et.`);
        return;
      }
      const { listing, listingFee } = await createOwlListing(ctx.prisma, userId, owl.id, price, ctx.redis);
      await reply(buildListingCreatedText(listing, listingFee, prefix));
    } catch (err: any) {
      await reply(`❌ ${err.message}`);
    }
    return;
  }

  const parsed = parseMarketSellItemArgs(args);
  if (!parsed) {
    await reply(
      `Kullanım: \`${prefix} market sell <eşya adı> [miktar] <fiyat>\`\n` +
      `Örn: \`${prefix} market sell Sessizlik Teli 1 1000\`\n` +
      `Baykuş: \`${prefix} market sell owl <kısa_id> <fiyat>\``,
    );
    return;
  }

  try {
    const itemName = await resolveInventoryItemName(ctx.prisma, userId, parsed.itemNameRaw);
    const { listing, listingFee } = await createListing(
      ctx.prisma,
      userId,
      itemName,
      parsed.quantity,
      parsed.price,
      ctx.redis,
    );
    await reply(buildListingCreatedText(listing, listingFee, prefix));
  } catch (err: any) {
    await reply(`❌ ${err.message}`);
  }
}

export async function runMarketMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
) {
  const userId = message.author.id;
  const sub = args[0]?.toLowerCase();

  if (sub === 'sat' || sub === 'sell') {
    await handleSell(ctx, userId, args.slice(1), prefix, async (text) => { await message.reply(text); });
    return;
  }

  if (sub === 'al' || sub === 'buy') {
    const listingRef = args[1];
    if (!listingRef) {
      await message.reply(`Kullanım: \`${prefix} market al <ilanNo>\` veya \`${prefix} buy <ilanNo>\``);
      return;
    }
    await handleBuy(ctx, userId, listingRef, async (text) => { await message.reply(text); });
    return;
  }

  if (sub === 'search' || sub === 'ara') {
    const query = args.slice(1).filter((a) => !a.startsWith('sort:') && !/^\d+$/.test(a)).join(' ').trim();
    if (!query) {
      await message.reply(`Kullanım: \`${prefix} market search <kelime>\``);
      return;
    }
    const sortArg = args.find((a) => a.startsWith('sort:'))?.slice(5);
    const pageArg = args.filter((a) => /^\d+$/.test(a)).pop();
    const { listings, total, page, totalPages } = await fetchListings(ctx.prisma, {
      search: query,
      sort: parseMarketSort(sortArg),
      page: parseInt(pageArg ?? '1', 10) || 1,
    });
    await message.reply(buildMarketBrowseText(listings, {
      search: query,
      sort: parseMarketSort(sortArg),
      page,
      totalPages,
      total,
      prefix,
    }));
    return;
  }

  if (sub === 'info' || sub === 'detay') {
    const no = parseInt(args[1] ?? '0', 10);
    if (!no) {
      await message.reply(`Kullanım: \`${prefix} market info <ilanNo>\``);
      return;
    }
    const listing = await fetchListingByNo(ctx.prisma, no);
    if (!listing || listing.status !== 'active') {
      await message.reply('❌ Aktif ilan bulunamadı.');
      return;
    }
    const analytics = await fetchMarketAnalytics(ctx.prisma, listing.itemId);
    await message.reply(buildMarketInfoText(listing, analytics, prefix));
    return;
  }

  if (sub === 'my' || sub === 'ilanlarim' || sub === 'mylistings') {
    const listings = await fetchMyActiveListings(ctx.prisma, userId);
    await message.reply(buildMyListingsText(listings, prefix));
    return;
  }

  if (sub === 'cancel' || sub === 'iptal') {
    const listingRef = args[1];
    if (!listingRef) {
      await message.reply(`Kullanım: \`${prefix} market cancel <ilanNo>\``);
      return;
    }
    try {
      const listing = await cancelListing(ctx.prisma, userId, listingRef, ctx.redis);
      await message.reply(`✅ #${listing.listingNo} ilanı iptal edildi. Eşya envanterine iade edildi.`);
    } catch (err: any) {
      await message.reply(`❌ ${err.message}`);
    }
    return;
  }

  const category = parseCategory(sub);
  if (category) {
    const sortArg = args.find((a) => a.startsWith('sort:'))?.slice(5);
    const pageNums = args.filter((a) => /^\d+$/.test(a));
    const page = parseInt(pageNums[pageNums.length - 1] ?? '1', 10) || 1;
    const { listings, total, totalPages } = await fetchListings(ctx.prisma, {
      category,
      sort: parseMarketSort(sortArg),
      page,
    });
    await message.reply(buildMarketBrowseText(listings, {
      category,
      sort: parseMarketSort(sortArg),
      page,
      totalPages,
      total,
      prefix,
    }));
    return;
  }

  const [categoryCounts, recentSales] = await Promise.all([
    countListingsByCategory(ctx.prisma),
    fetchRecentSales(ctx.prisma, 5),
  ]);
  await message.reply(buildMarketHubText(categoryCounts, recentSales, prefix));
}

export async function runBuyMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
) {
  const listingRef = args[0];
  if (!listingRef) {
    await message.reply('Kullanım: `buy <ilanNo>`');
    return;
  }
  await handleBuy(ctx, message.author.id, listingRef, async (text) => { await message.reply(text); });
}

export async function runMarketSellMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
) {
  await handleSell(ctx, message.author.id, args, prefix, async (text) => { await message.reply(text); });
}

export async function runMarketSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const userId = interaction.user.id;
  const islem = interaction.options.getString('islem');
  const p1 = interaction.options.getString('param1');
  const p2 = interaction.options.getInteger('param2');
  const p3 = interaction.options.getInteger('param3');

  if (islem === 'sell') {
    if (!p1 || !p2 || !p3) {
      await interaction.reply({ content: '❌ Satış için eşya adı, miktar ve fiyat belirtmelisin.', flags: 64 });
      return;
    }
    await interaction.deferReply({ flags: 64 });
    try {
      const { listing, listingFee } = await createListing(ctx.prisma, userId, p1, p2, p3, ctx.redis);
      await interaction.editReply(buildListingCreatedText(listing, listingFee, 'owl'));
    } catch (err: any) {
      await interaction.editReply(`❌ ${err.message}`);
    }
    return;
  }

  if (islem === 'buy') {
    if (!p1) {
      await interaction.reply({ content: '❌ İlan numarası belirtmelisin.', flags: 64 });
      return;
    }
    await interaction.deferReply({ flags: 64 });
    await handleBuy(ctx, userId, p1, async (text) => { await interaction.editReply(text); });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const [categoryCounts, recentSales] = await Promise.all([
    countListingsByCategory(ctx.prisma),
    fetchRecentSales(ctx.prisma, 5),
  ]);
  const text = buildMarketHubText(categoryCounts, recentSales, 'owl');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    (['owl', 'item', 'buff', 'material'] as MarketCategory[]).map((cat) =>
      new ButtonBuilder()
        .setCustomId(`market_cat:${cat}`)
        .setLabel(cat)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  await interaction.editReply({ content: text, components: [row] });
  const replyMsg = await interaction.fetchReply();

  const collector = replyMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === userId && i.customId.startsWith('market_cat:'),
  });

  collector.on('collect', async (i) => {
    const cat = i.customId.split(':')[1] as MarketCategory;
    await i.deferUpdate();
    const { listings, total, page, totalPages } = await fetchListings(ctx.prisma, { category: cat });
    await interaction.editReply({
      content: buildMarketBrowseText(listings, {
        category: cat,
        sort: 'price_asc',
        page,
        totalPages,
        total,
        prefix: 'owl',
      }),
      components: [],
    });
    collector.stop('done');
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      interaction.editReply({ components: [] }).catch(() => null);
    }
  });
}
