import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  assertOwlOnlyChannel,
  addOwlOnlyChannel,
  clearOwlOnlyChannelCacheForTests,
  clearOwlOnlyChannels,
  getOwlOnlyChannelIds,
  isExemptFromOwlOnlyChannel,
  isPrefixExemptFromOwlOnly,
  OwlOnlyChannelDeniedError,
} from '../utils/owl-only-channels';

function mockRedis(store: Record<string, Set<string>> = {}) {
  return {
    smembers: vi.fn(async (key: string) => [...(store[key] ?? [])]),
    scard: vi.fn(async (key: string) => (store[key]?.size ?? 0)),
    sadd: vi.fn(async (key: string, id: string) => {
      if (!store[key]) store[key] = new Set();
      const before = store[key].size;
      store[key].add(id);
      return store[key].size > before ? 1 : 0;
    }),
    srem: vi.fn(async (key: string, id: string) => {
      if (!store[key]) return 0;
      const had = store[key].has(id);
      store[key].delete(id);
      return had ? 1 : 0;
    }),
    del: vi.fn(async (key: string) => {
      delete store[key];
      return 1;
    }),
  } as any;
}

describe('owl-only-channels', () => {
  beforeEach(() => {
    delete process.env.ADMIN_USER_IDS;
    clearOwlOnlyChannelCacheForTests();
  });

  it('allows all channels when set is empty', async () => {
    const redis = mockRedis();
    await expect(
      assertOwlOnlyChannel(redis, {
        guildId: 'guild-empty',
        channelId: 'c1',
        userId: 'u1',
        exempt: false,
      }),
    ).resolves.toBeUndefined();
  });

  it('denies channel not in allow list', async () => {
    const store: Record<string, Set<string>> = {
      'guild:owlonly:guild-deny': new Set(['c-allowed']),
    };
    const redis = mockRedis(store);
    await expect(
      assertOwlOnlyChannel(redis, {
        guildId: 'guild-deny',
        channelId: 'c-other',
        userId: 'u1',
        exempt: false,
      }),
    ).rejects.toBeInstanceOf(OwlOnlyChannelDeniedError);
  });

  it('allows listed channel', async () => {
    const store: Record<string, Set<string>> = {
      'guild:owlonly:guild-allow': new Set(['c-allowed']),
    };
    const redis = mockRedis(store);
    await expect(
      assertOwlOnlyChannel(redis, {
        guildId: 'guild-allow',
        channelId: 'c-allowed',
        userId: 'u1',
        exempt: false,
      }),
    ).resolves.toBeUndefined();
  });

  it('bypasses for bot admin user id', async () => {
    process.env.ADMIN_USER_IDS = 'owner-1';
    const store: Record<string, Set<string>> = {
      'guild:owlonly:guild-admin': new Set(['c-allowed']),
    };
    const redis = mockRedis(store);
    await expect(
      assertOwlOnlyChannel(redis, {
        guildId: 'guild-admin',
        channelId: 'c-other',
        userId: 'owner-1',
        exempt: false,
      }),
    ).resolves.toBeUndefined();
  });

  it('add and clear channels', async () => {
    const redis = mockRedis();
    await addOwlOnlyChannel(redis, 'g2', 'ch1');
    expect(await getOwlOnlyChannelIds(redis, 'g2')).toEqual(['ch1']);
    await clearOwlOnlyChannels(redis, 'g2');
    expect(await getOwlOnlyChannelIds(redis, 'g2')).toEqual([]);
  });

  it('exempt command names', () => {
    expect(isExemptFromOwlOnlyChannel('owlonly')).toBe(true);
    expect(isExemptFromOwlOnlyChannel('owl:hunt')).toBe(false);
    expect(isPrefixExemptFromOwlOnly('yardim')).toBe(true);
    expect(isPrefixExemptFromOwlOnly('hunt')).toBe(false);
  });
});
