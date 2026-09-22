import { vi } from 'vitest';

/** Redis mock for flow-intent command log + interval tracking. */
export function createFlowIntentRedisMock() {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();

  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      store.set(key, value);
      void args;
      return 'OK';
    }),
    lpush: vi.fn(async (key: string, value: string) => {
      const list = lists.get(key) ?? [];
      list.unshift(value);
      lists.set(key, list);
      return list.length;
    }),
    ltrim: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      lists.set(key, list.slice(start, stop + 1));
      return 'OK';
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      return list.slice(start, stop + 1);
    }),
    lindex: vi.fn(async (key: string, index: number) => {
      const list = lists.get(key) ?? [];
      return list[index] ?? null;
    }),
    expire: vi.fn(async () => 1),
    incr: vi.fn(async (key: string) => {
      const next = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(next));
      return next;
    }),
    multi: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
    _lists: lists,
    _store: store,
  };

  return redis;
}
