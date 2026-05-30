/**
 * market-ux.ts — Global Marketplace monospace UI
 */

import type { MarketListing } from '@prisma/client';
import type { MarketCategory, MarketSort } from '../systems/market';

/** Satış kaydı — UI için (Prisma MarketSale ile uyumlu) */
export interface MarketSaleView {
  itemName: string;
  marketCategory: string;
  quantity: number;
  salePrice: number;
  soldAt: Date;
}

/** Piyasa analitiği — UI için */
export interface MarketAnalyticsView {
  lastSalePrice: number;
  averagePrice24h: number;
  averagePrice7d: number;
}

const CATEGORY_META: Record<MarketCategory, { emoji: string; label: string }> = {
  owl:      { emoji: '🦉', label: 'Baykuşlar' },
  item:     { emoji: '🎒', label: 'Eşyalar' },
  buff:     { emoji: '🧪', label: 'Buff\'lar' },
  material: { emoji: '📦', label: 'Materyaller' },
};

const SORT_LABEL: Record<MarketSort, string> = {
  price_asc:       '💰 Ucuz → Pahalı',
  price_desc:      '💰 Pahalı → Ucuz',
  newest:          '🆕 En Yeni',
  oldest:          '📅 En Eski',
  ending_soon:     '⏳ Süresi Doluyor',
  most_expensive:  '👑 En Pahalı',
  cheapest:        '🏷️ En Ucuz',
};

export function formatMarketCoins(n: number): string {
  return n.toLocaleString('tr-TR');
}

export function timeAgoTr(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dakika önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

export function timeUntilTr(date: Date): string {
  const mins = Math.floor((date.getTime() - Date.now()) / 60000);
  if (mins < 1) return 'yakında';
  if (mins < 60) return `${mins} dk kaldı`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} saat kaldı`;
  return `${Math.floor(hours / 24)} gün kaldı`;
}

function boxTitle(title: string): string[] {
  const inner = `   ${title}`;
  const w = Math.max(18, inner.length + 2);
  return [`╭${'─'.repeat(w)}╮`, inner, `╰${'─'.repeat(w)}╯`];
}

function formatListingLine(l: MarketListing): string {
  const cat = CATEGORY_META[l.marketCategory as MarketCategory]?.emoji ?? '📦';
  const qty = l.quantity > 1 ? ` x${l.quantity}` : '';
  return `#${l.listingNo} ${cat} **${l.itemName}**${qty}\n   💰 ${formatMarketCoins(l.price)} coin`;
}

function formatAnalyticsBlock(analytics: MarketAnalyticsView | null): string[] {
  if (!analytics || analytics.lastSalePrice === 0) {
    return ['📊 Henüz satış verisi yok.', ''];
  }
  return [
    '📊 Piyasa Bilgisi',
    '',
    `Son Satış · **${formatMarketCoins(analytics.lastSalePrice)}**`,
    `24s Ortalama · **${formatMarketCoins(analytics.averagePrice24h)}**`,
    `7g Ortalama · **${formatMarketCoins(analytics.averagePrice7d)}**`,
    '',
  ];
}

/** Ana market hub */
export function buildMarketHubText(
  categoryCounts: Record<MarketCategory, number>,
  recentSales: MarketSaleView[],
  prefix: string,
): string {
  const lines: string[] = [
    ...boxTitle('🛒 Global Marketplace'),
    '',
    '🏷️ Serbest piyasa — fiyatı sen belirle!',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📂 Kategoriler',
    '',
    ...(['owl', 'item', 'buff', 'material'] as MarketCategory[]).map((cat) => {
      const meta = CATEGORY_META[cat];
      return `${meta.emoji} ${meta.label} · **${categoryCounts[cat]}** ilan → \`${prefix} market ${cat}\``;
    }),
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📈 Son Satışlar',
    '',
  ];

  if (recentSales.length === 0) {
    lines.push('Henüz satış yok.', '');
  } else {
    for (const s of recentSales) {
      const cat = CATEGORY_META[s.marketCategory as MarketCategory]?.emoji ?? '📦';
      const qty = s.quantity > 1 ? ` x${s.quantity}` : '';
      lines.push(
        `${cat} **${s.itemName}**${qty}`,
        `   💰 ${formatMarketCoins(s.salePrice)} · ${timeAgoTr(s.soldAt)}`,
        '',
      );
    }
  }

  lines.push(
    '━━━━━━━━━━━━━━━━━━',
    '',
    `⚒️ Sat → \`${prefix} market sell <eşya> <miktar> <fiyat>\``,
    `🦉 Baykuş → \`${prefix} market sell owl <kısa_id> <fiyat>\``,
    `🛍️ Al → \`${prefix} buy <ilanNo>\``,
    `🔍 Ara → \`${prefix} market search <kelime>\``,
    `📋 İlanlarım → \`${prefix} market my\``,
  );

  return lines.join('\n');
}

/** Kategori tarayıcı */
export function buildMarketBrowseText(
  listings: MarketListing[],
  options: {
    category?: MarketCategory;
    search?: string;
    sort: MarketSort;
    page: number;
    totalPages: number;
    total: number;
    prefix: string;
  },
): string {
  const catMeta = options.category ? CATEGORY_META[options.category] : null;
  const title = options.search
    ? `🔍 "${options.search}"`
    : catMeta
      ? `${catMeta.emoji} ${catMeta.label}`
      : '🛒 Tüm İlanlar';

  const lines: string[] = [
    ...boxTitle(title),
    '',
    `${SORT_LABEL[options.sort]} · Sayfa **${options.page}/${options.totalPages}** · **${options.total}** ilan`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
  ];

  if (listings.length === 0) {
    lines.push('Bu filtrede ilan yok.', '');
  } else {
    for (const l of listings) {
      lines.push(formatListingLine(l), '');
    }
  }

  lines.push(
    '━━━━━━━━━━━━━━━━━━',
    '',
    `🛍️ Satın al → \`${options.prefix} buy <no>\``,
    `📖 Detay → \`${options.prefix} market info <no>\``,
  );

  if (options.page > 1 || options.page < options.totalPages) {
    const prev = options.page > 1 ? options.page - 1 : null;
    const next = options.page < options.totalPages ? options.page + 1 : null;
    const catArg = options.category ?? '';
    const searchArg = options.search ? ` search ${options.search}` : '';
    const parts: string[] = [];
    if (prev) parts.push(`◀️ \`${options.prefix} market ${catArg}${searchArg} ${prev}\``);
    if (next) parts.push(`▶️ \`${options.prefix} market ${catArg}${searchArg} ${next}\``);
    if (parts.length) {
      lines.push('', parts.join(' · '));
    }
  }

  return lines.join('\n');
}

/** İlan detay */
export function buildMarketInfoText(
  listing: MarketListing,
  analytics: MarketAnalyticsView | null,
  prefix: string,
): string {
  const cat = CATEGORY_META[listing.marketCategory as MarketCategory];
  const lines: string[] = [
    ...boxTitle(`${cat?.emoji ?? '📦'} İlan #${listing.listingNo}`),
    '',
    `📦 **${listing.itemName}**${listing.quantity > 1 ? ` x${listing.quantity}` : ''}`,
    `🏷️ Kategori · ${cat?.label ?? listing.marketCategory}`,
    `💰 Fiyat · **${formatMarketCoins(listing.price)}** coin`,
    `⏳ Bitiş · ${timeUntilTr(listing.expiresAt)}`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    ...formatAnalyticsBlock(analytics),
    '━━━━━━━━━━━━━━━━━━',
    '',
    `🛍️ Satın al → \`${prefix} buy ${listing.listingNo}\``,
  ];

  return lines.join('\n');
}

/** Oyuncunun aktif ilanları */
export function buildMyListingsText(
  listings: MarketListing[],
  prefix: string,
): string {
  const lines: string[] = [
    ...boxTitle('📋 İlanlarım'),
    '',
    `Aktif ilan · **${listings.length}/5**`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
  ];

  if (listings.length === 0) {
    lines.push('Aktif ilanın yok.', '');
  } else {
    for (const l of listings) {
      lines.push(formatListingLine(l), `   ⏳ ${timeUntilTr(l.expiresAt)}`, '');
    }
  }

  lines.push(
    '━━━━━━━━━━━━━━━━━━',
    '',
    `❌ İptal → \`${prefix} market cancel <no>\``,
  );

  return lines.join('\n');
}

export function buildListingCreatedText(
  listing: MarketListing,
  listingFee: number,
  prefix: string,
): string {
  return [
    ...boxTitle('✅ İlan Oluşturuldu'),
    '',
    `#${listing.listingNo} **${listing.itemName}**${listing.quantity > 1 ? ` x${listing.quantity}` : ''}`,
    `💰 Fiyat · **${formatMarketCoins(listing.price)}** coin`,
    `💸 Listeleme ücreti · **${formatMarketCoins(listingFee)}** coin *(iade edilmez)*`,
    `⏳ Süre · **48 saat**`,
    '',
    `🛍️ Satın alma komutu · \`${prefix} buy ${listing.listingNo}\``,
  ].join('\n');
}

export function buildPurchaseSuccessText(
  listing: MarketListing,
  tax: number,
  sellerGain: number,
): string {
  return [
    ...boxTitle('🎉 Satın Alma Başarılı'),
    '',
    `📦 **${listing.itemName}**${listing.quantity > 1 ? ` x${listing.quantity}` : ''}`,
    `💰 Ödenen · **${formatMarketCoins(listing.price)}** coin`,
    `🏛️ Vergi · **${formatMarketCoins(tax)}** coin`,
    `💵 Satıcıya · **${formatMarketCoins(sellerGain)}** coin`,
  ].join('\n');
}

export { CATEGORY_META, SORT_LABEL };
