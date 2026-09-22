import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  assertCommandAccess,
  CommandAccessDeniedError,
  clearBanFromCache,
  recordBanInCache,
} from '../utils/admin-access';
import { clearBanCache } from '../utils/ban-cache';

function mockRedis(overrides: {
  get?: (key: string) => Promise<string | null>;
  ttl?: (key: string) => Promise<number>;
} = {}) {
  return {
    get: overrides.get ?? (async () => null),
    ttl: overrides.ttl ?? (async () => -1),
  } as any;
}

describe('assertCommandAccess', () => {
  beforeEach(() => {
    clearBanCache();
    delete process.env.ADMIN_USER_IDS;
  });

  it('denies when Redis returns ban reason', async () => {
    const redis = mockRedis({
      get: async (key) => (key === 'ban:user-1' ? 'cheating' : null),
    });
    await expect(assertCommandAccess(redis, 'user-1')).rejects.toThrow(CommandAccessDeniedError);
  });

  it('denies non-admin when Redis errors and no cache', async () => {
    const redis = mockRedis({
      get: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(assertCommandAccess(redis, 'user-2')).rejects.toThrow(CommandAccessDeniedError);
  });

  it('denies from ban cache when Redis errors', async () => {
    recordBanInCache('user-3', 'cached ban');
    const redis = mockRedis({
      get: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(assertCommandAccess(redis, 'user-3')).rejects.toThrow(/engellendin/);
  });

  it('allows admin when Redis errors', async () => {
    process.env.ADMIN_USER_IDS = 'admin-1';
    const redis = mockRedis({
      get: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(assertCommandAccess(redis, 'admin-1')).resolves.toBeUndefined();
    clearBanFromCache('admin-1');
  });

  it('denies non-admin when maintenance and Redis ok', async () => {
    const redis = mockRedis({
      get: async (key) => (key === 'system:maintenance' ? '1' : null),
    });
    await expect(assertCommandAccess(redis, 'user-4')).rejects.toThrow(/bakım/);
  });
});
