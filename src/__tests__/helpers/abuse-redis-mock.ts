import { vi } from 'vitest';

/** Minimal Redis mock for abuse-breaker window counters + throttle keys. */
export function createAbuseRedisMock() {
  const store = new Map<string, string>();
  const ttlSec = new Map<string, number>();

  const INCR_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      store.set(key, value);
      const exIdx = args.indexOf('EX');
      if (exIdx >= 0 && typeof args[exIdx + 1] === 'number') {
        ttlSec.set(key, args[exIdx + 1] as number);
      }
      return 'OK';
    }),
    incr: vi.fn(async (key: string) => {
      const next = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(next));
      return next;
    }),
    expire: vi.fn(async (key: string, sec: number) => {
      ttlSec.set(key, sec);
      return 1;
    }),
    ttl: vi.fn(async (key: string) => ttlSec.get(key) ?? -2),
    eval: vi.fn(async (script: string, _numKeys: number, key: string, windowSec: string) => {
      if (script.includes('INCR')) {
        const next = parseInt(store.get(key) ?? '0', 10) + 1;
        store.set(key, String(next));
        if (next === 1) ttlSec.set(key, parseInt(windowSec, 10));
        return next;
      }
      return 0;
    }),
    multi: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
    _store: store,
    _setCount: (key: string, value: number) => store.set(key, String(value)),
    _setThrottle: (userId: string, seconds: number) => {
      store.set(`abuse:throttle:${userId}`, '1');
      ttlSec.set(`abuse:throttle:${userId}`, seconds);
    },
  };

  return redis;
}

export type AbuseRedisMock = ReturnType<typeof createAbuseRedisMock>;
