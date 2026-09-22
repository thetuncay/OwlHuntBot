/**
 * market-legacy-redirect.ts — Eski pazar komutlarını yeni akışlara yönlendirme
 */

import type { MarketCategory } from '../systems/market';

export type MarketLegacyAction =
  | { type: 'search'; query: string; legacyLabel: string }
  | { type: 'myshop'; legacyLabel: string }
  | { type: 'hub'; legacyLabel: string };

const SEARCH_SUBS = new Set(['search', 'ara', 'r', 'ar']);
const MY_SUBS = new Set(['my', 'ilanlarim', 'ilanlarım', 'mylistings', 'y']);
const MANAGE_SUBS = new Set(['info', 'detay', 'd', 'in', 'note', 'not', 'n', 'cancel', 'iptal', 'c']);
const CATEGORY_TOKENS = new Set<string>([
  'owl', 'buff', 'item', 'material',
  'o', 'ow', 'b', 'i', 'e', 'esya', 'eşya', 'm', 'mat', 'malzeme',
]);
const ACTIVE_SUBS = new Set(['sell', 'sat', 's', 'buy', 'al', 'p']);

function isCategoryToken(raw: string): raw is MarketCategory {
  const c = raw.toLowerCase();
  return c === 'owl' || c === 'buff' || c === 'item' || c === 'material';
}

export function buildMarketLegacyHint(prefix: string, action: MarketLegacyAction): string {
  switch (action.type) {
    case 'search':
      return `💡 **Yeni komut:** \`${prefix} pazar ${action.query}\` _(eski: ${action.legacyLabel})_`;
    case 'myshop':
      return `💡 **Yeni komut:** \`${prefix} market\` → **Dükkanım** _(eski: ${action.legacyLabel})_`;
    case 'hub':
      return `💡 **Yeni komut:** \`${prefix} market\` _(eski: ${action.legacyLabel})_`;
  }
}

export function buildMarketSellLegacyHint(prefix: string, legacyLabel: string): string {
  return `💡 **Yeni komut:** \`${prefix} sat\` _(eski: ${legacyLabel})_`;
}

/** `w market <eski argümanlar>` → yeni komut hedefi. sell/buy önceden ele alınır. */
export function resolveLegacyMarketIntent(expandedArgs: string[]): MarketLegacyAction | null {
  const sub = expandedArgs[0]?.toLowerCase();
  if (!sub) return null;

  if (SEARCH_SUBS.has(sub)) {
    const query = expandedArgs
      .slice(1)
      .filter((a) => !a.startsWith('sort:'))
      .filter((a) => !/^\d+$/.test(a))
      .join(' ')
      .trim();
    if (query) {
      return { type: 'search', query, legacyLabel: `\`market ${sub} ${query}\`` };
    }
    return { type: 'hub', legacyLabel: `\`market ${sub}\`` };
  }

  if (MY_SUBS.has(sub) || MANAGE_SUBS.has(sub)) {
    return { type: 'myshop', legacyLabel: `\`market ${sub}\`` };
  }

  if (CATEGORY_TOKENS.has(sub) || isCategoryToken(sub) || /^\d+$/.test(sub)) {
    const label = /^\d+$/.test(sub) ? `market ${sub}` : `market ${sub}`;
    return { type: 'hub', legacyLabel: `\`${label}\`` };
  }

  if (!ACTIVE_SUBS.has(sub)) {
    const query = expandedArgs.join(' ').trim();
    if (query) {
      return { type: 'search', query, legacyLabel: `\`market ${query}\`` };
    }
  }

  return null;
}
