import {
  type Message,
  type ChatInputCommandInteraction,
  type MessageReplyOptions,
} from 'discord.js';

type BuyReplyPayload = Pick<MessageReplyOptions, 'embeds' | 'components' | 'content'>;
import {
  buyListing,
  createListing,
  createOwlListing,
  parseMarketListingNoRef,
} from '../systems/market';
import {
  renderBuyErrorScreen,
  renderBuySuccessScreen,
  renderListingCreatedScreen,
  renderMarketScreen,
  renderSearchResultsScreen,
  type MarketScreenContext,
} from '../utils/market-screens';
import { safeReply } from '../utils/safe-reply';
import { replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import type { CommandContext } from '../types';
import {
  extractSellerNoteFromArgs,
  formatMarketSellUsageHelp,
  parseMarketSellItemArgs,
  parseOwlMarketSellArgs,
  resolveInventoryItemRef,
} from '../utils/market-parse';
import { expandMarketArgs } from '../utils/market-alias';
import {
  buildMarketLegacyHint,
  buildMarketSellLegacyHint,
  resolveLegacyMarketIntent,
} from '../utils/market-legacy-redirect';
import { resolveOwlByInput } from '../utils/owl-id';
import { buildScreenCustomId } from '../utils/market-customid';
import { fireQuest } from '../systems/quest-tracker';

async function sendMarketHubMessage(
  message: Message,
  ctx: CommandContext,
  userId: string,
  prefix: string,
  hint?: string,
): Promise<void> {
  const { embed, components } = await renderMarketScreen(buildScreenCustomId('hub'), {
    prisma: ctx.prisma,
    redis: ctx.redis,
    userId,
    prefix,
  });
  await fireQuest(ctx.prisma, userId, 'market_browse', 1);
  await message.reply({
    ...(hint ? { content: hint } : {}),
    embeds: [embed],
    components,
  });
}

async function sendMarketSellTypeMessage(
  message: Message,
  ctx: CommandContext,
  userId: string,
  prefix: string,
  hint?: string,
): Promise<void> {
  const { embed, components } = await renderMarketScreen(buildScreenCustomId('sell:type'), {
    prisma: ctx.prisma,
    redis: ctx.redis,
    userId,
    prefix,
  });
  await message.reply({
    ...(hint ? { content: hint } : {}),
    embeds: [embed],
    components,
  });
}

async function sendMarketSearchMessage(
  message: Message,
  ctx: CommandContext,
  userId: string,
  prefix: string,
  query: string,
  hint?: string,
): Promise<void> {
  const { embed, components } = await renderSearchResultsScreen(
    { prisma: ctx.prisma, redis: ctx.redis, userId, prefix },
    query,
  );
  await message.reply({
    ...(hint ? { content: hint } : {}),
    embeds: [embed],
    components,
  });
}

async function sendMyShopMessage(
  message: Message,
  ctx: CommandContext,
  userId: string,
  prefix: string,
  hint?: string,
): Promise<void> {
  const { embed, components } = await renderMarketScreen(buildScreenCustomId('myshop'), {
    prisma: ctx.prisma,
    redis: ctx.redis,
    userId,
    prefix,
  });
  await fireQuest(ctx.prisma, userId, 'market_myshop', 1);
  await message.reply({
    ...(hint ? { content: hint } : {}),
    embeds: [embed],
    components,
  });
}

async function sendMarketHubSlash(
  interaction: ChatInputCommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  await interaction.deferReply({ flags: 64 });
  const { embed, components } = await renderMarketScreen(buildScreenCustomId('hub'), {
    prisma: ctx.prisma,
    redis: ctx.redis,
    userId: interaction.user.id,
    prefix: 'w',
  });
  await fireQuest(ctx.prisma, interaction.user.id, 'market_browse', 1);
  await interaction.editReply({ embeds: [embed], components });
}

async function handleBuy(
  ctx: CommandContext,
  userId: string,
  listingRef: string,
  deliver: (payload: BuyReplyPayload, isError: boolean) => Promise<void>,
) {
  const listingNo = parseMarketListingNoRef(listingRef.trim()) ?? 0;
  const screenCtx: MarketScreenContext = {
    prisma: ctx.prisma,
    redis: ctx.redis,
    userId,
  };

  try {
    const result = await buyListing(ctx.prisma, userId, listingRef, ctx.redis);
    const { embed, components } = await renderBuySuccessScreen(screenCtx, result, '');
    await deliver({ embeds: [embed], components }, false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Satın alma başarısız.';
    const { embed, components } = await renderBuyErrorScreen(screenCtx, message, listingNo, '');
    await deliver({ embeds: [embed], components }, true);
  }
}

async function handleSell(
  ctx: CommandContext,
  userId: string,
  args: string[],
  prefix: string,
  reply: (payload: string | BuyReplyPayload) => Promise<void>,
) {
  let sellerNote: string | null = null;
  let cleanArgs = args;
  try {
    const stripped = extractSellerNoteFromArgs(args);
    cleanArgs = stripped.cleanArgs;
    sellerNote = stripped.sellerNote;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Geçersiz not.';
    await reply(`❌ ${message}`);
    return;
  }

  const screenCtx: MarketScreenContext = {
    prisma: ctx.prisma,
    redis: ctx.redis,
    userId,
    prefix,
  };

  if (cleanArgs[0]?.toLowerCase() === 'owl') {
    const parsedOwl = parseOwlMarketSellArgs(cleanArgs.slice(1));
    if (!parsedOwl) {
      await reply(
        `${formatMarketSellUsageHelp(prefix)}\n` +
        `Baykuş ID için \`${prefix} owllist\``,
      );
      return;
    }
    const { owlIdInput, price } = parsedOwl;
    try {
      const owl = await resolveOwlByInput(ctx.prisma, userId, owlIdInput);
      if (!owl) {
        await reply(`❌ Baykuş bulunamadı. \`${prefix} owllist\` ile kısa ID'yi kontrol et.`);
        return;
      }
      const { listing, listingFee } = await createOwlListing(
        ctx.prisma, userId, owl.id, price, ctx.redis, sellerNote,
      );
      const created = await renderListingCreatedScreen(screenCtx, listing, listingFee);
      await reply({ embeds: [created.embed], components: created.components });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Satışa çıkarma başarısız.';
      await reply(`❌ ${message}`);
    }
    return;
  }

  const parsed = parseMarketSellItemArgs(cleanArgs);
  if (!parsed) {
    await reply(formatMarketSellUsageHelp(prefix));
    return;
  }

  try {
    const itemName = await resolveInventoryItemRef(ctx.prisma, userId, parsed.itemNameRaw);
    const { listing, listingFee } = await createListing(
      ctx.prisma,
      userId,
      itemName,
      parsed.quantity,
      parsed.price,
      ctx.redis,
      sellerNote,
    );
    const created = await renderListingCreatedScreen(screenCtx, listing, listingFee);
    await reply({ embeds: [created.embed], components: created.components });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Satışa çıkarma başarısız.';
    await reply(`❌ ${message}`);
  }
}

export async function runMarketSellerMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
): Promise<void> {
  const query = args.join(' ').trim();
  const userId = message.author.id;

  if (!query) {
    await sendMarketHubMessage(message, ctx, userId, prefix);
    return;
  }

  await sendMarketSearchMessage(message, ctx, userId, prefix, query);
}

export async function runMarketMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
) {
  const userId = message.author.id;
  const expandedArgs = expandMarketArgs(args);
  const sub = expandedArgs[0]?.toLowerCase();
  const marketReply = (text: string, key: string) =>
    replyWithSuppression(message, text, SuppressionKeys.market(key));

  if (sub === 'sat' || sub === 'sell') {
    const sellArgs = expandedArgs.slice(1);
    const sellHint = buildMarketSellLegacyHint(prefix, `\`market ${sub}\``);
    if (sellArgs.length === 0) {
      await sendMarketSellTypeMessage(message, ctx, userId, prefix, sellHint);
      return;
    }
    await handleSell(ctx, userId, sellArgs, prefix, async (payload) => {
      if (typeof payload === 'string') {
        await safeReply(message, payload, { skipSuppression: true });
        return;
      }
      await safeReply(message, { content: sellHint, ...payload }, { skipSuppression: true });
    });
    return;
  }

  if (sub === 'al' || sub === 'buy') {
    const listingRef = expandedArgs[1];
    if (!listingRef) {
      await marketReply(`Kullanım: \`${prefix} buy <no>\` veya \`${prefix} market al <no>\``, 'usage-buy');
      return;
    }
    await handleBuy(ctx, userId, listingRef, async (payload, isError) => {
      if (isError) {
        await safeReply(message, payload, { skipSuppression: true });
        return;
      }
      await replyWithSuppression(message, payload, SuppressionKeys.market('buy'));
    });
    return;
  }

  const legacy = resolveLegacyMarketIntent(expandedArgs);
  if (legacy) {
    const hint = buildMarketLegacyHint(prefix, legacy);
    if (legacy.type === 'search') {
      await sendMarketSearchMessage(message, ctx, userId, prefix, legacy.query, hint);
      return;
    }
    if (legacy.type === 'myshop') {
      await sendMyShopMessage(message, ctx, userId, prefix, hint);
      return;
    }
    await sendMarketHubMessage(message, ctx, userId, prefix, hint);
    return;
  }

  await sendMarketHubMessage(message, ctx, userId, prefix);
}

export async function runBuyMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
) {
  const listingRef = args[0];
  if (!listingRef) {
    await replyWithSuppression(message, 'Kullanım: `buy <ilanNo>`', SuppressionKeys.market('usage-buy'));
    return;
  }
  await handleBuy(ctx, message.author.id, listingRef, async (payload, isError) => {
    if (isError) {
      await safeReply(message, payload, { skipSuppression: true });
      return;
    }
    await replyWithSuppression(message, payload, SuppressionKeys.market('buy'));
  });
}

export async function runMarketSellMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string,
  opts?: { legacyLabel?: string },
) {
  const hint = opts?.legacyLabel
    ? buildMarketSellLegacyHint(prefix, opts.legacyLabel)
    : undefined;
  if (args.length === 0) {
    await sendMarketSellTypeMessage(message, ctx, message.author.id, prefix, hint);
    return;
  }
  await handleSell(ctx, message.author.id, args, prefix, async (payload) => {
    if (typeof payload === 'string') {
      await safeReply(message, payload, { skipSuppression: true });
      return;
    }
    await safeReply(
      message,
      hint ? { content: hint, ...payload } : payload,
      { skipSuppression: true },
    );
  });
}

export async function runMarketSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const userId = interaction.user.id;
  const islem = interaction.options.getString('islem');
  const p1 = interaction.options.getString('param1');
  const p2 = interaction.options.getInteger('param2');
  const p3 = interaction.options.getInteger('param3');

  if (islem === 'sell') {
    if (!p1 || !p2 || !p3) {
      await interaction.reply({ content: '❌ Satış için eşya ID, miktar ve fiyat belirtmelisin.', flags: 64 });
      return;
    }
    await interaction.deferReply({ flags: 64 });
    try {
      const itemName = await resolveInventoryItemRef(ctx.prisma, userId, p1);
      const { listing, listingFee } = await createListing(ctx.prisma, userId, itemName, p2, p3, ctx.redis);
      const created = await renderListingCreatedScreen(
        { prisma: ctx.prisma, redis: ctx.redis, userId },
        listing,
        listingFee,
      );
      await interaction.editReply({ embeds: [created.embed], components: created.components });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Satışa çıkarma başarısız.';
      await interaction.editReply(`❌ ${message}`);
    }
    return;
  }

  if (islem === 'buy') {
    if (!p1) {
      await interaction.reply({ content: '❌ İlan numarası belirtmelisin.', flags: 64 });
      return;
    }
    await interaction.deferReply({ flags: 64 });
    await handleBuy(ctx, userId, p1, async (payload) => {
      await interaction.editReply(payload);
    });
    return;
  }

  await sendMarketHubSlash(interaction, ctx);
}
