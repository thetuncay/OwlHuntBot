import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearBanCache,
  deleteBanCacheEntry,
  getBanCacheEntry,
  refreshBanCacheEntry,
  setBanCacheEntry,
} from '../utils/ban-cache';

describe('ban-cache', () => {
  beforeEach(() => {
    clearBanCache();
  });

  it('returns cached ban reason while valid', () => {
    setBanCacheEntry('user-1', 'spam', 60_000);
    expect(getBanCacheEntry('user-1')).toBe('spam');
  });

  it('clears entry on delete', () => {
    setBanCacheEntry('user-1', 'spam', 60_000);
    deleteBanCacheEntry('user-1');
    expect(getBanCacheEntry('user-1')).toBeNull();
  });

  it('expires entries after TTL', () => {
    setBanCacheEntry('user-1', 'spam', 1);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(getBanCacheEntry('user-1')).toBeNull();
        resolve();
      }, 20);
    });
  });

  it('refresh updates reason', () => {
    setBanCacheEntry('user-1', 'old', 60_000);
    refreshBanCacheEntry('user-1', 'new');
    expect(getBanCacheEntry('user-1')).toBe('new');
  });
});
