import { vi } from 'vitest';

/**
 * Minimal ioredis mock for player-state coin Lua + TTL pipeline.
 * Key-aware `get`: duel/cap keys vs `state:player:*` JSON blobs.
 */
export function createRedisPlayerMock(options?: {
  /** Seeds duel:daily:{playerId}:{today} before tests run. */
  duelDailyEarned?: number;
  initialPlayer?: Record<string, unknown>;
  playerId?: string;
}) {
  const store = new Map<string, string>();
  const playerId = options?.playerId ?? 'player-a2-strong';
  const playerKey = `state:player:${playerId}`;

  if (options?.initialPlayer) {
    store.set(playerKey, JSON.stringify(options.initialPlayer));
  }
  if (options?.duelDailyEarned && options.duelDailyEarned > 0) {
    const today = new Date().toISOString().slice(0, 10);
    store.set(`duel:daily:${playerId}:${today}`, String(options.duelDailyEarned));
  }

  const pipelineOps: Array<() => void> = [];
  const pipelineChain = {
    set: vi.fn((key: string, value: string) => {
      pipelineOps.push(() => store.set(key, value));
      return pipelineChain;
    }),
    hset: vi.fn((key: string, ...fieldValues: string[]) => {
      pipelineOps.push(() => {
        for (let i = 0; i < fieldValues.length; i += 2) {
          const field = fieldValues[i]!;
          const val = fieldValues[i + 1]!;
          store.set(`${key}::${field}`, val);
        }
      });
      return pipelineChain;
    }),
    del: vi.fn((key: string) => {
      pipelineOps.push(() => store.delete(key));
      return pipelineChain;
    }),
    expire: vi.fn(() => pipelineChain),
    exec: vi.fn(async () => {
      pipelineOps.forEach((op) => op());
      pipelineOps.length = 0;
      return [];
    }),
  };

  const multiChain = {
    set: vi.fn(function multiSet() {
      return multiChain;
    }),
    sadd: vi.fn(function multiSadd() {
      return multiChain;
    }),
    exec: vi.fn(async () => []),
  };

  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
    incr: vi.fn(async (key: string) => {
      const next = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(next));
      return next;
    }),
    incrby: vi.fn(async (key: string, amount: number) => {
      const current = parseInt(store.get(key) ?? '0', 10);
      const next = current + amount;
      store.set(key, String(next));
      return next;
    }),
    expire: vi.fn(async () => 1),
    pipeline: vi.fn(() => pipelineChain),
    multi: vi.fn(() => multiChain),
    eval: vi.fn(
      async (script: string, numKeys: number, ...args: string[]): Promise<number> => {
        if (script.includes('INCRBY') && script.includes('room')) {
          const key = args[0]!;
          const add = Number(args[1]);
          const cap = Number(args[2]);
          const cur = parseInt(store.get(key) ?? '0', 10);
          const room = cap - cur;
          if (room <= 0) return 0;
          const grant = Math.min(add, room);
          if (grant <= 0) return 0;
          store.set(key, String(cur + grant));
          return grant;
        }
        if (script.includes('cjson.decode')) {
          const pk = args[0]!;
          let raw = store.get(pk);
          if (!raw) {
            return Promise.reject(new Error('NO_PLAYER'));
          }
          const player = JSON.parse(raw) as { coins: number };
          const arg1 = Number(args[numKeys]);
          const mode = args[numKeys + 1];
          if (mode === 'deduct') {
            if (player.coins < arg1) {
              return Promise.reject(new Error('INSUFFICIENT'));
            }
            player.coins -= arg1;
          } else {
            player.coins = Math.max(0, player.coins + arg1);
          }
          store.set(pk, JSON.stringify(player));
          if (args[1]) store.set(args[1]!, args[numKeys + 2] ?? '');
          if (args[2] && args[numKeys + 3]) {
            store.set(`dirty-member:${args[numKeys + 3]}`, '1');
          }
          return player.coins;
        }
        const key = args[0]!;
        const token = args[numKeys];
        if (store.get(key) === token) {
          store.delete(key);
          return 1;
        }
        return 0;
      },
    ),
    _store: store,
    _reset: () => store.clear(),
    _playerKey: playerKey,
  };

  return redis;
}
