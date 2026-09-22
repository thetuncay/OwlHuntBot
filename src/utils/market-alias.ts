/** Pazar komut kısayolları — üst düzey alias (w ms, w mp, w mb …) */

const SUBCOMMAND_ALIAS: Record<string, string> = {
  s: 'sell',
  sat: 'sell',
  sell: 'sell',
  p: 'buy',
  al: 'buy',
  buy: 'buy',
  r: 'search',
  ar: 'search',
  ara: 'search',
  search: 'search',
  y: 'my',
  my: 'my',
  ilanlarim: 'my',
  ilanlarım: 'my',
  mylistings: 'my',
};

/** Yapışık: wmb, wms, wmp … (prefix w strip sonrası) */
const GLUED_MARKET_COMMAND: Record<string, string> = {
  m: 'market',
  shop: 'market',
  ms: 'market sell',
  mp: 'market buy',
  ma: 'market al',
  mb: 'market',
  mo: 'market',
  mi: 'market',
  mm: 'market',
  mr: 'pazar',
  md: 'market',
  my: 'market',
  mn: 'market',
  mc: 'market',
};

const MARKET_GLUED_RE = /^(mb|mo|mi|mm|ms|mp|ma|mr|md|my|mn|mc|m|shop)(?=$|\s)/i;

export function isMarketGluedToken(rest: string): boolean {
  return MARKET_GLUED_RE.test(rest.trim());
}

/** market argümanlarını genişletir (s → sell, p → buy) */
export function expandMarketArgs(args: string[]): string[] {
  if (args.length === 0) return args;
  const first = args[0]!.toLowerCase();
  if (SUBCOMMAND_ALIAS[first]) {
    return [SUBCOMMAND_ALIAS[first], ...args.slice(1)];
  }
  return args;
}

const GLUED_WITH_ARGS_RE =
  /^(mb|mo|mi|mm|ms|mp|ma|mr|md|my|mn|mc)(?:\s+(.*))?$/i;

/**
 * Prefix sonrası metni market kısayollarına çöz.
 * Ör: ms → market sell · mp 14 → market buy 14
 */
export function expandMarketCommandText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (/^w\w/i.test(trimmed)) {
    const inner = trimmed.slice(1).trim();
    const expandedInner = expandMarketCommandText(inner);
    if (expandedInner !== inner) return expandedInner;
  }

  const lower = trimmed.toLowerCase();
  const glued = GLUED_MARKET_COMMAND[lower];
  if (glued) return glued;

  const gluedParts = trimmed.match(GLUED_WITH_ARGS_RE);
  if (gluedParts) {
    const key = gluedParts[1]!.toLowerCase();
    const replacement = GLUED_MARKET_COMMAND[key];
    if (replacement) {
      const rest = gluedParts[2]?.trim();
      return rest ? `${replacement} ${rest}` : replacement;
    }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const head = parts[0]?.toLowerCase() ?? '';

  if (head === 'market' || head === 'shop' || head === 'm') {
    const expanded = expandMarketArgs(parts.slice(1));
    return ['market', ...expanded].join(' ');
  }

  return trimmed;
}
