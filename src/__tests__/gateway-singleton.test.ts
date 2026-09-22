import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  acquireGatewaySessionLock,
  releaseGatewaySessionLock,
  renewGatewaySessionLock,
} from '../utils/gateway-singleton';

function createLockRedisMock() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      const hasNx = (args as string[]).includes('NX');
      if (hasNx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    expire: vi.fn(async () => 1),
  };
}

describe('gateway singleton lock', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows first live process to acquire lock', async () => {
    const redis = createLockRedisMock();
    const ok = await acquireGatewaySessionLock(redis as any, 0);
    expect(ok).toBe(true);
    expect(redis.set).toHaveBeenCalled();
  });

  it('rejects second live process on same shard', async () => {
    const redis = createLockRedisMock();
    const holderPid = process.pid;
    expect(await acquireGatewaySessionLock(redis as any, 0)).toBe(true);

    vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === holderPid && signal === 0) return 0;
      const err = new Error('ESRCH') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });

    const otherPid = holderPid + 999_999;
    const originalPid = process.pid;
    Object.defineProperty(process, 'pid', { value: otherPid, configurable: true });

    expect(await acquireGatewaySessionLock(redis as any, 0)).toBe(false);

    Object.defineProperty(process, 'pid', { value: originalPid, configurable: true });
  });

  it('renews and releases lock for holder', async () => {
    const redis = createLockRedisMock();
    await acquireGatewaySessionLock(redis as any, 0);
    await renewGatewaySessionLock(redis as any, 0);
    await releaseGatewaySessionLock(redis as any, 0);
    expect(redis.del).toHaveBeenCalled();
  });
});
