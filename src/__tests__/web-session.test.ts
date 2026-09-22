import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Redis } from 'ioredis';
import {
  WEB_SESSION_MAX_AGE_SEC,
  createWebSession,
  decodeSession,
  encodeSession,
  readWebSession,
  touchWebSession,
  writeWebSession,
} from '../ops/web-session';

function createWebSessionRedisMock() {
  const store = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      store.set(key, value);
      if (args[0] === 'EX' && typeof args[1] === 'number') {
        void args[1];
      }
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  } as unknown as Redis;
  return { redis, store };
}

describe('web-session', () => {
  beforeEach(() => {
    process.env.WEB_SESSION_SECRET = 'test-secret-key';
  });

  it('roundtrips legacy signed session', () => {
    const session = createWebSession({
      id: '123456789',
      username: 'owluser',
      global_name: 'Owl User',
      avatar: 'abc',
      email: 'a@b.c',
    });
    const raw = encodeSession(session);
    const parsed = decodeSession(raw);
    expect(parsed?.userId).toBe('123456789');
    expect(parsed?.username).toBe('owluser');
  });

  it('rejects tampered session', () => {
    const session = createWebSession({
      id: '1',
      username: 'a',
      avatar: null,
    });
    const raw = encodeSession(session) + 'x';
    expect(decodeSession(raw)).toBeNull();
  });

  it('stores session in Redis with opaque cookie', async () => {
    const { redis } = createWebSessionRedisMock();
    const res = { setHeader: vi.fn(), getHeader: vi.fn(() => undefined) };
    const session = createWebSession({
      id: '999',
      username: 'redisuser',
      avatar: null,
    });

    await writeWebSession(res as never, session, redis);

    const setCookie = String((res.setHeader as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]);
    expect(setCookie).toContain('owlhunt_web_session=');
    expect(setCookie).toContain(`Max-Age=${WEB_SESSION_MAX_AGE_SEC}`);
    expect(setCookie).not.toContain('eyJ');

    const cookieValue = decodeURIComponent(setCookie.split('=')[1]?.split(';')[0] ?? '');
    const req = { headers: { cookie: `owlhunt_web_session=${encodeURIComponent(cookieValue)}` } };

    const loaded = await readWebSession(req as never, redis);
    expect(loaded?.userId).toBe('999');
    expect(loaded?.username).toBe('redisuser');
  });

  it('refreshes Redis session TTL on touch', async () => {
    const { redis } = createWebSessionRedisMock();
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn(() => undefined),
    };
    const session = createWebSession({ id: '42', username: 'touch', avatar: null });
    await writeWebSession(res as never, session, redis);

    const firstCookie = String((res.setHeader as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]);
    const cookieValue = decodeURIComponent(firstCookie.split('=')[1]?.split(';')[0] ?? '');
    const req = { headers: { cookie: `owlhunt_web_session=${encodeURIComponent(cookieValue)}` } };

    const touched = await touchWebSession(req as never, res as never, redis);
    expect(touched?.userId).toBe('42');
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('migrates legacy cookie to Redis on touch', async () => {
    const { redis } = createWebSessionRedisMock();
    const session = createWebSession({ id: '7', username: 'legacy', avatar: null });
    const legacy = encodeSession(session);
    const req = { headers: { cookie: `owlhunt_web_session=${encodeURIComponent(legacy)}` } };
    const res = { setHeader: vi.fn(), getHeader: vi.fn(() => undefined) };

    const touched = await touchWebSession(req as never, res as never, redis);
    expect(touched?.userId).toBe('7');

    const newCookie = String((res.setHeader as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]);
    expect(newCookie).not.toContain('eyJ');
  });
});
