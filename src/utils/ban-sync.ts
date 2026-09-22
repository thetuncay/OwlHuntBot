import { refreshBanCacheEntry } from './ban-cache';
import { getBanCacheTtlMs } from './launch-config';

/** Redis ban yazildiktan sonra process-local cache'i guncelle. */
export function syncPlayerBanCache(
  userId: string,
  reason: string,
  durationSec?: number,
): void {
  refreshBanCacheEntry(
    userId,
    reason,
    durationSec !== undefined ? durationSec * 1000 : getBanCacheTtlMs(),
  );
}
