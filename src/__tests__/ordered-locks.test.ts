import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireResourceLock,
  releaseResourceLock,
  withLock,
  withOrderedResourceLocks,
} from '../utils/lock';

vi.mock('../utils/redis', () => {
  const store = new Map<string, string>();
  const acquisitionOrder: string[] = [];

  const redis = {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      const argList = args as string[];
      const hasNX = argList.includes('NX');
      if (hasNX && store.has(key)) return null;
      store.set(key, value);
      acquisitionOrder.push(key);
      return 'OK';
    }),
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
      if (store.get(key) === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
    _store: store,
    _acquisitionOrder: acquisitionOrder,
    _reset: () => {
      store.clear();
      acquisitionOrder.length = 0;
    },
  };

  return { redis };
});

describe('ordered resource locks', () => {
  beforeEach(async () => {
    const { redis } = await import('../utils/redis');
    (redis as unknown as { _reset: () => void })._reset();
  });

  it('acquires resource locks in deterministic sorted order', async () => {
    const result = await withOrderedResourceLocks(['user:456', 'user:123'], async () => 'ok');
    const { redis } = await import('../utils/redis');
    const order = (redis as unknown as { _acquisitionOrder: string[] })._acquisitionOrder;

    expect(result).toBe('ok');
    expect(order).toEqual(['user:123', 'user:456']);
  });

  it('releases already acquired locks if a later lock is busy', async () => {
    const busyToken = await acquireResourceLock('user:456');
    await expect(
      withOrderedResourceLocks(['user:123', 'user:456'], async () => 'unreachable'),
    ).rejects.toThrow('İşlemin devam ediyor');
    if (busyToken) await releaseResourceLock('user:456', busyToken);

    const availableToken = await acquireResourceLock('user:123');
    expect(availableToken).toBeTruthy();
    if (availableToken) await releaseResourceLock('user:123', availableToken);
  });

  it('withLock awaits release so the next acquire on the same key succeeds', async () => {
    await expect(withLock('p1', 'financial', async () => 'a')).resolves.toBe('a');
    await expect(withLock('p1', 'financial', async () => 'b')).resolves.toBe('b');
  });

  it('reenters the same lock inside one call and still blocks a parallel inner call', async () => {
    const { redis } = await import('../utils/redis');
    const set = redis.set as unknown as { mock: { calls: unknown[][] } };
    const before = set.mock.calls.length;
    const inner = await withLock('p1', 'financial', async () =>
      withLock('p1', 'financial', async () => 'inner'),
    );
    expect(inner).toBe('inner');
    expect(set.mock.calls.length - before).toBe(1);

    const outcome = await withLock('p2', 'financial', async () => {
      const [a, b] = await Promise.all([
        withLock('p2', 'financial', async () => 'a'),
        withLock('p2', 'financial', async () => 'b'),
      ]);
      return [a, b];
    }).catch((err: Error) => err);
    expect(outcome).toBeInstanceOf(Error);
  });

});
