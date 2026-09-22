/**
 * market-screens.ts — Pazar embed + component render katmanı
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { MarketListing } from '@prisma/client';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';
import {
  calcMarketTax,
  fetchMarketAnalytics,
  fetchOwlSnapshotForListing,
  fetchOwlSnapshotsForListings,
  type MarketCategory,
} from '../systems/market';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { MARKET_BROWSE_PAGE_SIZE, MARKET_LISTING_DURATION_MS, MARKET_MAX_ACTIVE_LISTINGS } from '../config';
import {
  buildBackCustomId,
  buildItemScreenCustomId,
  buildScreenCustomId,
  buildSelectCustomId,
  encodeFrom,
} from './market-customid';
import {
  getCategoryListingsPage,
  getHubStats,
  getListingByNo,
  getMyActiveListings,
  getSellableInventory,
  getSellerListings,
  searchListingsAndSellers,
  MARKET_CATEGORY_ORDER,
} from './market-queries';
import { fetchSellerDisplayNames, resolveSellerLabel } from './market-seller-names';
import {
  DISTRICT_META,
  formatMarketCoins,
  type OwlMarketSnapshot,
} from './market-ux';
import { formatOwlIdentity } from './owl-display';
import { TIER_LABEL } from './theme';
import { COLORS } from './theme';
import { statEffect, staminaMax } from './math';
import { getEffectiveStats } from './owl-stats';
import { formatPriceSignal } from './price-signal';

export interface MarketScreenContext {
  prisma: PrismaClient;
  redis?: Redis;
  userId: string;
  prefix?: string;
}

export interface MarketScreenPayload {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

const CATEGORY_EMOJI: Record<MarketCategory, string> = {
  owl: '🪶',
  buff: '🧪',
  item: '📦',
  material: '⚒️',
};

function hoursUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
}

function listingDisplayName(
  listing: MarketListing,
  owl?: OwlMarketSnapshot,
): string {
  if (owl) {
    return formatOwlIdentity(owl).primary;
  }
  const qty = listing.quantity > 1 ? ` ×${listing.quantity}` : '';
  return `${listing.itemName}${qty}`;
}

function listingSelectLabel(
  listing: MarketListing,
  owl?: OwlMarketSnapshot,
): string {
  const name = listingDisplayName(listing, owl);
  const label = `${name} · ${formatMarketCoins(listing.price)}`;
  return label.length > 100 ? `${label.slice(0, 97)}…` : label;
}

async function loadSellerNames(
  prisma: PrismaClient,
  sellerIds: string[],
): Promise<Map<string, string>> {
  return fetchSellerDisplayNames(prisma, [...new Set(sellerIds)]);
}

function backToHubRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildScreenCustomId('hub'))
      .setLabel('Pazara Dön')
      .setEmoji('⬅')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function renderHub(ctx: MarketScreenContext): Promise<MarketScreenPayload> {
  const stats = await getHubStats(ctx.prisma);
  const total = stats.totalListings;

  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle('🦉 Baykuş Pazarı');

  if (total === 0) {
    embed.setDescription('Henüz açık ilan yok.');
  } else {
    const lines = [`${total} ilan · ${stats.totalShops} dükkan`];
    if (stats.lastSale) {
      lines.push(
        `Son satış: ${stats.lastSale.itemName} · ${formatMarketCoins(stats.lastSale.salePrice)}`,
      );
    }
    embed.setDescription(lines.join('\n'));
  }

  const categorySelect = new StringSelectMenuBuilder()
    .setCustomId(buildSelectCustomId('hub'))
    .setPlaceholder('Bir sıra seç…')
    .addOptions(
      MARKET_CATEGORY_ORDER.map((cat) => {
        const meta = DISTRICT_META[cat];
        const count = stats.categoryCounts[cat];
        return {
          label: meta.label,
          description: `${count} ilan`,
          value: `cat.${cat}.0`,
          emoji: CATEGORY_EMOJI[cat],
        };
      }),
    );

  const sellStyle = total === 0 ? ButtonStyle.Success : ButtonStyle.Secondary;
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildScreenCustomId('myshop'))
      .setLabel('Dükkanım')
      .setEmoji('🏪')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildScreenCustomId('sell:type'))
      .setLabel('Satışa Çıkar')
      .setEmoji('➕')
      .setStyle(sellStyle),
    new ButtonBuilder()
      .setCustomId(buildScreenCustomId('search:open'))
      .setLabel('Ara')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embed,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect),
      actionRow,
    ],
  };
}

async function renderCategory(
  ctx: MarketScreenContext,
  category: MarketCategory,
  page: number,
): Promise<MarketScreenPayload> {
  const meta = DISTRICT_META[category];
  const browse = await getCategoryListingsPage(ctx.prisma, category, page);
  const owlSnapshots = category === 'owl'
    ? await fetchOwlSnapshotsForListings(ctx.prisma, browse.items)
    : new Map<string, OwlMarketSnapshot>();
  const sellerNames = await loadSellerNames(
    ctx.prisma,
    browse.items.map((l) => l.sellerId),
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle(`${CATEGORY_EMOJI[category]} ${meta.browseLabel}`);

  if (browse.totalCount === 0) {
    embed.setDescription('Bu sırada henüz ilan yok.');
    return { embed, components: [backToHubRow()] };
  }

  embed.setDescription(
    `${browse.totalCount} ilan · sayfa ${browse.page + 1}/${browse.totalPages}`,
  );

  const screenPath = `cat:${category}:${browse.page}`;
  const select = new StringSelectMenuBuilder()
    .setCustomId(buildSelectCustomId(screenPath))
    .setPlaceholder('Bir ilan seç…')
    .addOptions(
      browse.items.map((listing) => {
        const owl = owlSnapshots.get(listing.itemId);
        const seller = resolveSellerLabel(sellerNames, listing.sellerId);
        const description = seller.length > 100 ? `${seller.slice(0, 97)}…` : seller;
        return {
          label: listingSelectLabel(listing, owl),
          description,
          value: `item.${listing.listingNo}`,
        };
      }),
    );

  const prevPage = browse.page - 1;
  const nextPage = browse.page + 1;
  const paginationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildScreenCustomId(`cat:${category}:${prevPage}`))
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(browse.page <= 0),
    new ButtonBuilder()
      .setCustomId(buildScreenCustomId(`cat:${category}:${nextPage}`))
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(browse.page >= browse.totalPages - 1),
  );

  return {
    embed,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      paginationRow,
      backToHubRow(),
    ],
  };
}

async function renderShop(
  ctx: MarketScreenContext,
  sellerId: string,
): Promise<MarketScreenPayload> {
  const listings = await getSellerListings(ctx.prisma, sellerId);
  const sellerNames = await loadSellerNames(ctx.prisma, [sellerId]);
  const seller = resolveSellerLabel(sellerNames, sellerId);
  const owlSnapshots = await fetchOwlSnapshotsForListings(
    ctx.prisma,
    listings.filter((l) => l.marketCategory === 'owl'),
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle(`🏪 ${seller} dükkanı`);

  if (listings.length === 0) {
    embed.setDescription('Bu dükkan şu an boş.');
    return {
      embed,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildScreenCustomId('search:open'))
            .setLabel('Yeni Arama')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary),
        ),
        backToHubRow(),
      ],
    };
  }

  const lines = [`${listings.length} aktif ilan`, ''];
  for (const listing of listings) {
    const owl = listing.marketCategory === 'owl'
      ? owlSnapshots.get(listing.itemId)
      : undefined;
    lines.push(`${listingDisplayName(listing, owl)} · ${formatMarketCoins(listing.price)}`);
  }
  embed.setDescription(lines.join('\n'));

  const screenPath = `shop:${sellerId}`;
  const select = new StringSelectMenuBuilder()
    .setCustomId(buildSelectCustomId(screenPath))
    .setPlaceholder('Bir ilan seç…')
    .addOptions(
      listings.slice(0, 25).map((listing) => {
        const owl = listing.marketCategory === 'owl'
          ? owlSnapshots.get(listing.itemId)
          : undefined;
        return {
          label: listingSelectLabel(listing, owl),
          value: `item.${listing.listingNo}`,
        };
      }),
    );

  return {
    embed,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('search:open'))
          .setLabel('Yeni Arama')
          .setEmoji('🔍')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('hub'))
          .setLabel('Pazara Dön')
          .setEmoji('⬅')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function renderItem(
  ctx: MarketScreenContext,
  listingNo: number,
  fromEncoded: string,
): Promise<MarketScreenPayload> {
  const listing = await getListingByNo(ctx.prisma, listingNo);
  const embed = new EmbedBuilder().setColor(COLORS.MARKET);

  if (!listing || listing.status !== 'active' || listing.expiresAt <= new Date()) {
    embed
      .setTitle('İlan bulunamadı')
      .setDescription('Bu ilan artık mevcut değil.');
    const backId = fromEncoded ? buildBackCustomId(fromEncoded) : buildScreenCustomId('hub');
    return {
      embed,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(backId)
            .setLabel('Geri')
            .setEmoji('⬅')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    };
  }

  const [analytics, owl, sellerNames] = await Promise.all([
    fetchMarketAnalytics(ctx.prisma, listing.itemId),
    fetchOwlSnapshotForListing(ctx.prisma, listing),
    loadSellerNames(ctx.prisma, [listing.sellerId]),
  ]);
  const seller = resolveSellerLabel(sellerNames, listing.sellerId);
  const isOwn = listing.sellerId === ctx.userId;

  let title = listingDisplayName(listing, owl);
  if (owl) {
    const tier = TIER_LABEL[owl.tier] ?? `T${owl.tier}`;
    title = `${title} · ${tier}`;
  }

  embed.setTitle(title);

  const descParts: string[] = [];
  if (listing.sellerNote?.trim()) {
    descParts.push(`*${listing.sellerNote.trim()}*`);
  }
  if (isOwn) {
    descParts.push('Bu senin ilanın.');
  }
  if (descParts.length > 0) {
    embed.setDescription(descParts.join('\n\n'));
  }

  embed.addFields(
    { name: 'Fiyat', value: formatMarketCoins(listing.price), inline: true },
    { name: 'Satıcı', value: seller, inline: true },
    { name: 'Süre', value: `${hoursUntil(listing.expiresAt)} saat`, inline: true },
  );

  if (owl) {
    const stamMax = Math.round(staminaMax(owl.statKanat));
    const eff = getEffectiveStats(owl);
    const power = Math.round(statEffect(eff.gaga) + statEffect(eff.pence));
    const sight = Math.round(statEffect(eff.goz) + statEffect(eff.kulak));
    const speed = Math.round(statEffect(eff.kanat));

    embed.addFields({
      name: 'İstatistikler',
      value: `⚔ ${power} · ❤ ${owl.hp}/${owl.hpMax} · ⚡ ${owl.staminaCur}/${stamMax}`,
    });
    embed.addFields({
      name: 'Özellikler',
      value: `Görüş ${sight} · Hız ${speed} · Verim %${owl.effectiveness} · Bağ ${owl.bond}`,
    });
  }

  if (analytics && analytics.lastSalePrice > 0) {
    const range = formatPriceSignal(analytics);
    embed.addFields({
      name: 'Piyasa',
      value: [
        `Son satış ${formatMarketCoins(analytics.lastSalePrice)} · 24s ort. ${formatMarketCoins(analytics.averagePrice24h)}`,
        range ? `Sinyal: ${range}` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  const backCustomId = fromEncoded === 'search'
    ? buildScreenCustomId('hub')
    : buildBackCustomId(fromEncoded);

  const buttons: ButtonBuilder[] = [];
  if (!isOwn) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(buildScreenCustomId(`action:buyconfirm:${listingNo}:${fromEncoded}`))
        .setLabel('Satın Al')
        .setEmoji(COIN_EMOJI)
        .setStyle(ButtonStyle.Success),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId(backCustomId)
      .setLabel('Geri')
      .setEmoji('⬅')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embed,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
  };
}

export interface BuySuccessData {
  listing: MarketListing;
  tax: number;
  sellerGain: number;
}

function hasFromContext(fromEncoded: string): boolean {
  return fromEncoded.length > 0 && fromEncoded !== 'legacy';
}

function continueButton(fromEncoded: string): ButtonBuilder | null {
  if (!hasFromContext(fromEncoded)) return null;
  return new ButtonBuilder()
    .setCustomId(buildBackCustomId(fromEncoded))
    .setLabel('Devam Et')
    .setEmoji('🛍️')
    .setStyle(ButtonStyle.Success);
}

function hubButton(): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(buildScreenCustomId('hub'))
    .setLabel('Pazara Dön')
    .setEmoji('🏠')
    .setStyle(ButtonStyle.Secondary);
}

function backToListButton(fromEncoded: string): ButtonBuilder {
  const customId = hasFromContext(fromEncoded)
    ? buildBackCustomId(fromEncoded)
    : buildScreenCustomId('hub');
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(hasFromContext(fromEncoded) ? 'Listeye Dön' : 'Pazara Dön')
    .setEmoji('⬅')
    .setStyle(ButtonStyle.Secondary);
}

export async function renderBuyConfirmScreen(
  ctx: MarketScreenContext,
  listingNo: number,
  fromEncoded: string,
): Promise<MarketScreenPayload> {
  const listing = await getListingByNo(ctx.prisma, listingNo);
  const embed = new EmbedBuilder().setColor(COLORS.MARKET);

  if (!listing || listing.status !== 'active' || listing.expiresAt <= new Date()) {
    embed.setTitle('İlan bulunamadı').setDescription('Bu ilan artık mevcut değil.');
    return {
      embed,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(backToListButton(fromEncoded))],
    };
  }

  const owl = await fetchOwlSnapshotForListing(ctx.prisma, listing);
  const productName = listingDisplayName(listing, owl);
  const tax = calcMarketTax(listing.price);
  const sellerGain = listing.price - tax;

  embed
    .setTitle('Satın almayı onayla')
    .setDescription(`${productName} için ${formatMarketCoins(listing.price)} ödeyeceksin.`)
    .addFields(
      { name: 'Ödeyeceğin', value: formatMarketCoins(listing.price), inline: true },
      { name: 'Vergi (kesinti)', value: formatMarketCoins(tax), inline: true },
      { name: 'Satıcıya geçecek', value: formatMarketCoins(sellerGain), inline: true },
    );

  return {
    embed,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId(`action:buyexecute:${listingNo}:${fromEncoded}`))
          .setLabel('Onayla')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(buildItemScreenCustomId(listingNo, decodeFromPath(fromEncoded)))
          .setLabel('Vazgeç')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function decodeFromPath(fromEncoded: string): string {
  if (!hasFromContext(fromEncoded)) return 'hub';
  return fromEncoded.replace(/\./g, ':');
}

export async function renderBuySuccessScreen(
  ctx: MarketScreenContext,
  data: BuySuccessData,
  fromEncoded: string,
): Promise<MarketScreenPayload> {
  const { listing, tax, sellerGain } = data;
  const owl = listing.marketCategory === 'owl'
    ? await fetchOwlSnapshotForListing(ctx.prisma, listing)
    : undefined;
  const sellerNames = await loadSellerNames(ctx.prisma, [listing.sellerId]);
  const seller = resolveSellerLabel(sellerNames, listing.sellerId);
  const productName = listingDisplayName(listing, owl);

  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('🤝 Anlaşma tamam')
    .setDescription(`${productName} artık seninle. ${seller} ile el sıkıştın.`)
    .addFields(
      { name: 'Ödedin', value: formatMarketCoins(listing.price), inline: true },
      { name: 'Kesinti', value: formatMarketCoins(tax), inline: true },
      { name: 'Satıcı payı', value: formatMarketCoins(sellerGain), inline: true },
    );

  const buttons = [continueButton(fromEncoded), hubButton()].filter(Boolean) as ButtonBuilder[];

  return {
    embed,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
  };
}

export async function renderBuyErrorScreen(
  ctx: MarketScreenContext,
  errorMessage: string,
  listingNo: number,
  fromEncoded: string,
): Promise<MarketScreenPayload> {
  const listing = listingNo > 0 ? await getListingByNo(ctx.prisma, listingNo) : null;
  const embed = new EmbedBuilder().setColor(COLORS.DANGER).setTitle('Satın alma başarısız');

  if (errorMessage.includes('Yetersiz bakiye')) {
    const price = listing?.price ?? 0;
    embed.setDescription(
      price > 0
        ? `Yetersiz bakiyen var. Gereken: ${formatMarketCoins(price)}.`
        : 'Yetersiz bakiyen var.',
    );
  } else if (
    errorMessage.includes('bulunamadı')
    || errorMessage.includes('aktif değil')
    || errorMessage.includes('süresi dolmuş')
    || errorMessage.includes('başka biri')
  ) {
    embed.setDescription('Bu ilan artık mevcut değil.');
  } else {
    embed.setDescription(errorMessage);
  }

  return {
    embed,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(backToListButton(fromEncoded))],
  };
}

async function populateListingDetailEmbed(
  embed: EmbedBuilder,
  listing: MarketListing,
  ctx: MarketScreenContext,
  opts?: { ownListing?: boolean },
): Promise<OwlMarketSnapshot | undefined> {
  const [analytics, owl, sellerNames] = await Promise.all([
    fetchMarketAnalytics(ctx.prisma, listing.itemId),
    fetchOwlSnapshotForListing(ctx.prisma, listing),
    loadSellerNames(ctx.prisma, [listing.sellerId]),
  ]);
  const seller = resolveSellerLabel(sellerNames, listing.sellerId);

  let title = listingDisplayName(listing, owl);
  if (owl) {
    const tier = TIER_LABEL[owl.tier] ?? `T${owl.tier}`;
    title = `${title} · ${tier}`;
  }
  embed.setTitle(title);

  const descParts: string[] = [];
  if (listing.sellerNote?.trim()) {
    descParts.push(`*${listing.sellerNote.trim()}*`);
  }
  if (opts?.ownListing) {
    descParts.push('Bu ilan senin.');
  } else if (listing.sellerId === ctx.userId) {
    descParts.push('Bu senin ilanın.');
  }
  if (descParts.length > 0) {
    embed.setDescription(descParts.join('\n\n'));
  }

  embed.addFields(
    { name: 'Fiyat', value: formatMarketCoins(listing.price), inline: true },
    { name: 'Satıcı', value: seller, inline: true },
    { name: 'Süre', value: `${hoursUntil(listing.expiresAt)} saat`, inline: true },
  );

  if (owl) {
    const stamMax = Math.round(staminaMax(owl.statKanat));
    const eff = getEffectiveStats(owl);
    const power = Math.round(statEffect(eff.gaga) + statEffect(eff.pence));
    const sight = Math.round(statEffect(eff.goz) + statEffect(eff.kulak));
    const speed = Math.round(statEffect(eff.kanat));

    embed.addFields({
      name: 'İstatistikler',
      value: `⚔ ${power} · ❤ ${owl.hp}/${owl.hpMax} · ⚡ ${owl.staminaCur}/${stamMax}`,
    });
    embed.addFields({
      name: 'Özellikler',
      value: `Görüş ${sight} · Hız ${speed} · Verim %${owl.effectiveness} · Bağ ${owl.bond}`,
    });
  }

  if (analytics && analytics.lastSalePrice > 0) {
    const range = formatPriceSignal(analytics);
    embed.addFields({
      name: 'Piyasa',
      value: [
        `Son satış ${formatMarketCoins(analytics.lastSalePrice)} · 24s ort. ${formatMarketCoins(analytics.averagePrice24h)}`,
        range ? `Sinyal: ${range}` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  return owl;
}

export async function renderMyShopScreen(
  ctx: MarketScreenContext,
  flashMessage?: string,
): Promise<MarketScreenPayload> {
  const listings = await getMyActiveListings(ctx.prisma, ctx.userId);
  const owlSnapshots = await fetchOwlSnapshotsForListings(
    ctx.prisma,
    listings.filter((l) => l.marketCategory === 'owl'),
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle('🏪 Dükkanın');

  if (flashMessage) {
    embed.setFooter({ text: flashMessage });
  }

  const sellStyle = listings.length === 0 ? ButtonStyle.Success : ButtonStyle.Secondary;
  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (listings.length === 0) {
    embed.setDescription('Henüz satışa çıkardığın bir şey yok.');
  } else {
    const lines = [
      `${listings.length}/${MARKET_MAX_ACTIVE_LISTINGS} ilan dolu`,
      '',
    ];
    for (const listing of listings) {
      const owl = listing.marketCategory === 'owl'
        ? owlSnapshots.get(listing.itemId)
        : undefined;
      lines.push(
        `${listingDisplayName(listing, owl)} · ${formatMarketCoins(listing.price)} · ${hoursUntil(listing.expiresAt)} saat`,
      );
    }
    embed.setDescription(lines.join('\n'));

    const select = new StringSelectMenuBuilder()
      .setCustomId(buildSelectCustomId('myshop'))
      .setPlaceholder('Bir ilanını yönet…')
      .addOptions(
        listings.slice(0, 25).map((listing) => {
          const owl = listing.marketCategory === 'owl'
            ? owlSnapshots.get(listing.itemId)
            : undefined;
          return {
            label: listingSelectLabel(listing, owl),
            value: `item.${listing.listingNo}`,
          };
        }),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildScreenCustomId('sell:type'))
        .setLabel('Satışa Çıkar')
        .setEmoji('➕')
        .setStyle(sellStyle),
      new ButtonBuilder()
        .setCustomId(buildScreenCustomId('hub'))
        .setLabel('Pazara Dön')
        .setEmoji('⬅')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { embed, components };
}

export async function renderMyShopItemScreen(
  ctx: MarketScreenContext,
  listingNo: number,
): Promise<MarketScreenPayload> {
  const listing = await getListingByNo(ctx.prisma, listingNo);
  const embed = new EmbedBuilder().setColor(COLORS.MARKET);

  if (
    !listing
    || listing.status !== 'active'
    || listing.expiresAt <= new Date()
    || listing.sellerId !== ctx.userId
  ) {
    embed.setTitle('İlan bulunamadı').setDescription('Bu ilan artık mevcut değil.');
    return {
      embed,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildScreenCustomId('myshop'))
            .setLabel('Geri')
            .setEmoji('⬅')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    };
  }

  await populateListingDetailEmbed(embed, listing, ctx, { ownListing: true });

  return {
    embed,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId(`action:cancel:${listingNo}`))
          .setLabel('Kaldır')
          .setEmoji('🗑')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId(`action:editlisting:${listingNo}`))
          .setLabel('Düzenle')
          .setEmoji('📝')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('myshop'))
          .setLabel('Geri')
          .setEmoji('⬅')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export async function renderSellTypeScreen(ctx: MarketScreenContext): Promise<MarketScreenPayload> {
  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle('Ne satmak istiyorsun?')
    .setDescription('Envanterinden veya baykuşlarından birini seç.');

  return {
    embed,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('sell:select:item:0'))
          .setLabel('Eşya')
          .setEmoji('📦')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('sell:select:owl:0'))
          .setLabel('Baykuş')
          .setEmoji('🦉')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('hub'))
          .setLabel('Geri')
          .setEmoji('⬅')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export async function renderSellSelectScreen(
  ctx: MarketScreenContext,
  type: 'item' | 'owl',
  page: number,
): Promise<MarketScreenPayload> {
  const browse = await getSellableInventory(ctx.prisma, ctx.userId, type, page);
  const title = type === 'item' ? 'Eşyanı seç' : 'Baykuşunu seç';

  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle(title);

  if (browse.totalCount === 0) {
    embed.setDescription(
      type === 'item'
        ? 'Satılabilir eşyan yok.'
        : 'Satılabilir baykuşun yok (main ve pazardaki baykuşlar hariç).',
    );
    return {
      embed,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildScreenCustomId('sell:type'))
            .setLabel('Geri')
            .setEmoji('⬅')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    };
  }

  embed.setDescription(
    browse.totalPages > 1
      ? `${browse.totalCount} ürün · sayfa ${browse.page + 1}/${browse.totalPages}`
      : `${browse.totalCount} ürün`,
  );

  const screenPath = `sell:select:${type}:${browse.page}`;
  const select = new StringSelectMenuBuilder()
    .setCustomId(buildSelectCustomId(screenPath))
    .setPlaceholder(type === 'item' ? 'Bir eşya seç…' : 'Bir baykuş seç…')
    .addOptions(
      browse.items.map((entry) => ({
        label: entry.label.length > 100 ? `${entry.label.slice(0, 97)}…` : entry.label,
        description: entry.description.length > 100
          ? `${entry.description.slice(0, 97)}…`
          : entry.description,
        value: `sell.${type}.${entry.id}`,
      })),
    );

  const prevPage = browse.page - 1;
  const nextPage = browse.page + 1;

  return {
    embed,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId(`sell:select:${type}:${prevPage}`))
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(browse.page <= 0),
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId(`sell:select:${type}:${nextPage}`))
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(browse.page >= browse.totalPages - 1),
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('sell:type'))
          .setLabel('Geri')
          .setEmoji('⬅')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export async function renderListingCreatedScreen(
  ctx: MarketScreenContext,
  listing: MarketListing,
  listingFee: number,
): Promise<MarketScreenPayload> {
  const owl = listing.marketCategory === 'owl'
    ? await fetchOwlSnapshotForListing(ctx.prisma, listing)
    : undefined;
  const productName = listingDisplayName(listing, owl);
  const hours = Math.round(MARKET_LISTING_DURATION_MS / (60 * 60 * 1000));

  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('✓ Satışa çıktı')
    .setDescription(`${productName} artık pazarda.`)
    .addFields(
      { name: 'Fiyat', value: formatMarketCoins(listing.price), inline: true },
      { name: 'Liste ücreti', value: formatMarketCoins(listingFee), inline: true },
      { name: 'Süre', value: `${hours} saat`, inline: true },
      { name: 'Referans', value: `#${listing.listingNo}`, inline: false },
    );

  return {
    embed,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('myshop'))
          .setLabel('Dükkanına Git')
          .setEmoji('🏪')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(buildScreenCustomId('hub'))
          .setLabel('Pazara Dön')
          .setEmoji('🏠')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export async function renderSearchResultsScreen(
  ctx: MarketScreenContext,
  query: string,
): Promise<MarketScreenPayload> {
  const results = await searchListingsAndSellers(ctx.prisma, query);
  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle(`Arama sonuçları: "${results.query}"`);

  const totalMatches = results.shops.length + results.items.length;

  if (totalMatches === 0) {
    embed.setDescription(`"${results.query}" için sonuç bulunamadı.`);
    return {
      embed,
      components: [backToHubRow()],
    };
  }

  const descParts: string[] = [];
  if (results.shops.length > 0) {
    descParts.push(`${results.shops.length} dükkan eşleşmesi`);
  }
  if (results.items.length > 0) {
    descParts.push(`${results.items.length} ilan eşleşmesi`);
  }
  if (results.truncated) {
    descParts.push('_İlk 25 sonuç gösteriliyor._');
  }
  embed.setDescription(descParts.join(' · '));

  const sellerIds = results.items.map((l) => l.sellerId);
  const sellerNames = await loadSellerNames(ctx.prisma, [
    ...results.shops.map((s) => s.sellerId),
    ...sellerIds,
  ]);
  const owlSnapshots = await fetchOwlSnapshotsForListings(
    ctx.prisma,
    results.items.filter((l) => l.marketCategory === 'owl'),
  );

  const options: { label: string; description?: string; value: string; emoji?: string }[] = [];

  for (const shop of results.shops) {
    const label = `${shop.displayName} (dükkan)`;
    options.push({
      label: label.length > 100 ? `${label.slice(0, 97)}…` : label,
      value: `shop.${shop.sellerId}`,
      emoji: '🏪',
    });
  }

  for (const listing of results.items) {
    const owl = listing.marketCategory === 'owl'
      ? owlSnapshots.get(listing.itemId)
      : undefined;
    const seller = resolveSellerLabel(sellerNames, listing.sellerId);
    const label = `${listingDisplayName(listing, owl)} · ${formatMarketCoins(listing.price)}`;
    const description = seller.length > 100 ? `${seller.slice(0, 97)}…` : seller;
    options.push({
      label: label.length > 100 ? `${label.slice(0, 97)}…` : label,
      description,
      value: `item.${listing.listingNo}.search`,
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(buildSelectCustomId('search:results'))
    .setPlaceholder('Bir sonuç seç…')
    .addOptions(options.slice(0, 25));

  return {
    embed,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      backToHubRow(),
    ],
  };
}

/**
 * screenId: tam customId (mk:hub) veya ekran yolu (hub, cat:owl:0)
 */
export async function renderMarketScreen(
  screenId: string,
  ctx: MarketScreenContext,
): Promise<MarketScreenPayload> {
  const screenPath = screenId.startsWith('mk:')
    ? screenId.slice(3)
    : screenId;

  if (screenPath === 'hub') {
    return renderHub(ctx);
  }

  if (screenPath.startsWith('cat:')) {
    const [, category, pageRaw] = screenPath.split(':');
    const page = parseInt(pageRaw ?? '0', 10) || 0;
    if (!MARKET_CATEGORY_ORDER.includes(category as MarketCategory)) {
      return renderHub(ctx);
    }
    return renderCategory(ctx, category as MarketCategory, page);
  }

  if (screenPath.startsWith('shop:')) {
    const sellerId = screenPath.slice('shop:'.length);
    return renderShop(ctx, sellerId);
  }

  if (screenPath === 'myshop') {
    return renderMyShopScreen(ctx);
  }

  if (screenPath.startsWith('myshop:item:')) {
    const listingNo = parseInt(screenPath.split(':')[2] ?? '0', 10);
    if (!listingNo) return renderMyShopScreen(ctx);
    return renderMyShopItemScreen(ctx, listingNo);
  }

  if (screenPath === 'sell:type') {
    return renderSellTypeScreen(ctx);
  }

  if (screenPath.startsWith('sell:select:')) {
    const [, , type, pageRaw] = screenPath.split(':');
    const page = parseInt(pageRaw ?? '0', 10) || 0;
    if (type !== 'item' && type !== 'owl') return renderSellTypeScreen(ctx);
    return renderSellSelectScreen(ctx, type, page);
  }

  if (screenPath.startsWith('action:created:')) {
    const listingNo = parseInt(screenPath.split(':')[2] ?? '0', 10);
    if (!listingNo) return renderMyShopScreen(ctx);
    const listing = await getListingByNo(ctx.prisma, listingNo);
    if (!listing) return renderMyShopScreen(ctx);
    return renderListingCreatedScreen(ctx, listing, listing.listingFeePaid);
  }

  if (screenPath.startsWith('item:')) {
    const parts = screenPath.split(':');
    const listingNo = parseInt(parts[1] ?? '0', 10);
    const fromEncoded = parts.slice(2).join(':');
    if (!listingNo) return renderHub(ctx);
    return renderItem(ctx, listingNo, fromEncoded);
  }

  return renderHub(ctx);
}

export { MARKET_BROWSE_PAGE_SIZE, buildItemScreenCustomId, encodeFrom };
