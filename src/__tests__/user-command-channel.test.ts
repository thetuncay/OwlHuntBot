import { describe, expect, it } from 'vitest';
import {
  recordUserCommandChannel,
  resolveUserTopCommandChannel,
} from '../utils/user-command-channel';

function mockRedis(initial: Record<string, Record<string, string>> = {}) {
  const store = new Map<string, Map<string, string>>();
  for (const [key, hash] of Object.entries(initial)) {
    store.set(key, new Map(Object.entries(hash)));
  }
  return {
    multi() {
      const ops: Array<() => void> = [];
      return {
        hincrby(key: string, field: string, delta: number) {
          ops.push(() => {
            const map = store.get(key) ?? new Map<string, string>();
            const prev = parseInt(map.get(field) ?? '0', 10);
            map.set(field, String(prev + delta));
            store.set(key, map);
          });
          return this;
        },
        expire(_key: string, _ttl: number) {
          return this;
        },
        async exec() {
          for (const op of ops) op();
          return [];
        },
      };
    },
    async hgetall(key: string) {
      const map = store.get(key);
      if (!map) return {};
      return Object.fromEntries(map.entries());
    },
  };
}

describe('user-command-channel', () => {
  it('increments and resolves top channel', async () => {
    const redis = mockRedis();
    await recordUserCommandChannel(redis as never, {
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c-low',
    });
    await recordUserCommandChannel(redis as never, {
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c-low',
    });
    await recordUserCommandChannel(redis as never, {
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c-high',
    });
    await recordUserCommandChannel(redis as never, {
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c-high',
    });
    await recordUserCommandChannel(redis as never, {
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c-high',
    });

    const top = await resolveUserTopCommandChannel(redis as never, 'u1');
    expect(top).toEqual({ guildId: 'g1', channelId: 'c-high' });
  });

  it('uses parent channel for threads', async () => {
    const redis = mockRedis();
    await recordUserCommandChannel(redis as never, {
      userId: 'u2',
      guildId: 'g1',
      channelId: 'thread-1',
      parentChannelId: 'parent-1',
    });
    const top = await resolveUserTopCommandChannel(redis as never, 'u2');
    expect(top).toEqual({ guildId: 'g1', channelId: 'parent-1' });
  });
});
