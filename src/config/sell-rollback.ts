/** Sell rollback kayıt süreleri (ms). */
export const SELL_ROLLBACK_RETENTION_MS = 7 * 24 * 3600_000;
export const SELL_ROLLBACK_RETENTION_SEC = 7 * 24 * 3600;

export type SellRollbackPeriod = '1h' | '1d' | '1w';

export const SELL_ROLLBACK_PERIOD_LABELS: Record<SellRollbackPeriod, string> = {
  '1h': '1 saat',
  '1d': '1 gün',
  '1w': '1 hafta',
};
