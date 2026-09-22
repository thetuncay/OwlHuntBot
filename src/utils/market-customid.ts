/**
 * market-customid.ts — Pazar UI customId encode/decode
 */

export const MARKET_CUSTOM_ID_PREFIX = 'mk:';

const MAX_CUSTOM_ID_LENGTH = 100;

export function isMarketCustomId(customId: string): boolean {
  return customId.startsWith(MARKET_CUSTOM_ID_PREFIX);
}

/** Ekran customId içinde `:` ayırıcılarını `.` ile değiştirir (from alanı). */
export function encodeFrom(screenPath: string): string {
  return screenPath.replace(/:/g, '.');
}

/** `.` ile kodlanmış from alanını geri çevirir. */
export function decodeFrom(encoded: string): string {
  return encoded.replace(/\./g, ':');
}

export function buildScreenCustomId(screenPath: string): string {
  const id = `${MARKET_CUSTOM_ID_PREFIX}${screenPath}`;
  if (id.length > MAX_CUSTOM_ID_LENGTH) {
    throw new Error(`Market customId çok uzun (${id.length} > ${MAX_CUSTOM_ID_LENGTH})`);
  }
  return id;
}

export function buildSelectCustomId(screenPath: string): string {
  return buildScreenCustomId(`${screenPath}:select`);
}

export function buildItemScreenCustomId(listingNo: number, fromScreenPath: string): string {
  return buildScreenCustomId(`item:${listingNo}:${encodeFrom(fromScreenPath)}`);
}

export function buildBackCustomId(fromEncoded: string): string {
  return buildScreenCustomId(decodeFrom(fromEncoded));
}

export type MarketCustomIdKind = 'screen' | 'select' | 'action' | 'unknown';

export interface ParsedMarketCustomId {
  kind: MarketCustomIdKind;
  /** mk: öneki olmadan ekran yolu — örn. hub, cat:owl:0 */
  screenPath: string;
  action?: string;
  actionParams?: string[];
}

/** mk: önekini kaldırır. */
export function stripMarketPrefix(customId: string): string {
  return customId.startsWith(MARKET_CUSTOM_ID_PREFIX)
    ? customId.slice(MARKET_CUSTOM_ID_PREFIX.length)
    : customId;
}

export function parseMarketCustomId(customId: string): ParsedMarketCustomId {
  const raw = stripMarketPrefix(customId);

  if (raw.startsWith('action:')) {
    const parts = raw.split(':');
    return {
      kind: 'action',
      screenPath: raw,
      action: parts[1],
      actionParams: parts.slice(2),
    };
  }

  if (raw.endsWith(':select')) {
    return {
      kind: 'select',
      screenPath: raw.slice(0, -':select'.length),
    };
  }

  if (
    raw === 'hub'
    || raw.startsWith('cat:')
    || raw.startsWith('shop:')
    || raw.startsWith('item:')
    || raw.startsWith('myshop')
    || raw.startsWith('sell:')
    || raw.startsWith('search:')
  ) {
    return { kind: 'screen', screenPath: raw };
  }

  return { kind: 'unknown', screenPath: raw };
}

/** Select menu value → hedef ekran customId */
export function resolveSelectTarget(selectCustomId: string, value: string): string {
  const parsed = parseMarketCustomId(selectCustomId);
  const fromPath = parsed.screenPath;

  if (value.startsWith('cat.')) {
    const [, category, page = '0'] = value.split('.');
    return buildScreenCustomId(`cat:${category}:${page}`);
  }

  if (value.startsWith('item.')) {
    const parts = value.split('.');
    const listingNo = parts[1];
    if (!listingNo) throw new Error('Geçersiz ilan seçimi.');
    if (fromPath === 'myshop') {
      return buildScreenCustomId(`myshop:item:${listingNo}`);
    }
    const from = parts[2] === 'search' ? 'search' : fromPath;
    return buildItemScreenCustomId(Number(listingNo), from);
  }

  if (value.startsWith('shop.')) {
    const sellerId = value.slice('shop.'.length);
    return buildScreenCustomId(`shop:${sellerId}`);
  }

  if (value.startsWith('sell.item.') || value.startsWith('sell.owl.')) {
    throw new Error('SELL_MODAL');
  }

  throw new Error(`Geçersiz seçim: ${value}`);
}

export function parseBuyActionParams(params: string[]): { listingNo: number; fromEncoded: string } {
  return {
    listingNo: parseInt(params[0] ?? '0', 10) || 0,
    fromEncoded: params.slice(1).join(':'),
  };
}

/** Henüz tamamlanmamış ekranlar — arama Faz 5 ile aktif. */
export function isDeferredMarketScreen(_screenPath: string): boolean {
  return false;
}

export function parseActionListingNo(params: string[]): number {
  return parseInt(params[0] ?? '0', 10) || 0;
}
