/**
 * price-signal.ts — Market tarihsel fiyat aralığı (F2).
 *
 * Kilit değil: oyuncu fiyatı serbest belirler. Yalnızca sinyal.
 */

export interface PriceSignalInput {
  lastSalePrice: number;
  averagePrice24h: number;
  averagePrice7d: number;
}

/**
 * "son · 24s · 7g" satırı. Veri yoksa null.
 *
 * @param analytics Analitik satırı
 */
export function formatPriceSignal(analytics: PriceSignalInput | null | undefined): string | null {
  if (!analytics) return null;
  const last = Math.max(0, analytics.lastSalePrice);
  const d24 = Math.max(0, analytics.averagePrice24h);
  const d7 = Math.max(0, analytics.averagePrice7d);
  if (last <= 0 && d24 <= 0 && d7 <= 0) return null;

  const lo = minPositive(d24, d7, last);
  const hi = Math.max(d24, d7, last);
  if (lo <= 0 || hi <= 0) return null;
  if (lo === hi) return `Aralık ~${lo}`;
  return `Aralık ~${lo}–${hi}`;
}

function minPositive(...values: number[]): number {
  const pos = values.filter((v) => v > 0);
  if (pos.length === 0) return 0;
  return Math.min(...pos);
}
