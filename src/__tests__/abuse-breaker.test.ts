import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SpamBlockedError } from '../utils/command-error';
import { createAbuseRedisMock } from './helpers/abuse-redis-mock';

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    ...actual,
    ABUSE_RAW_REQUESTS: 40,
    ABUSE_SAME_COMMAND: 20,
    ABUSE_WINDOW_SECONDS: 10,
    ABUSE_THROTTLE_SECONDS: [15, 30, 60, 120] as const,
  };
});

import {
  assertAbuseThrottleGate,
  recordAbuseAccountingOnSuccess,
} from '../middleware/abuse-breaker';

describe('abuse-breaker v2.1 hardening', () => {
  const userId = 'user-abuse-test';
  const ctx = { userId, command: 'hunt', displayName: 'Test' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not increment counters on gate-only peek (simulated flow reject path)', async () => {
    const redis = createAbuseRedisMock();
    await assertAbuseThrottleGate(redis as any, ctx);
    expect(redis._store.get(`abuse:raw:${userId}`)).toBeUndefined();
    expect(redis._store.get(`abuse:cmd:${userId}:hunt`)).toBeUndefined();
  });

  it('cooldown-style repeats: 20 gate checks without success do not throttle', async () => {
    const redis = createAbuseRedisMock();
    for (let i = 0; i < 20; i++) {
      await expect(assertAbuseThrottleGate(redis as any, ctx)).resolves.toBeUndefined();
    }
    expect(redis._store.get(`abuse:raw:${userId}`)).toBeUndefined();
  });

  it('same-cmd threshold: 20 successes then gate blocks (21st attempt)', async () => {
    const redis = createAbuseRedisMock();
    for (let i = 0; i < 19; i++) {
      await recordAbuseAccountingOnSuccess(redis as any, ctx);
      await assertAbuseThrottleGate(redis as any, ctx);
    }
    await recordAbuseAccountingOnSuccess(redis as any, ctx);
    expect(parseInt(redis._store.get(`abuse:cmd:${userId}:hunt`) ?? '0', 10)).toBe(20);
    await expect(assertAbuseThrottleGate(redis as any, ctx)).rejects.toBeInstanceOf(SpamBlockedError);
  });

  it('real flood: 41 successes blocks next request via gate', async () => {
    const redis = createAbuseRedisMock();
    for (let i = 0; i < 40; i++) {
      await recordAbuseAccountingOnSuccess(redis as any, { userId, command: `cmd${i % 5}`, displayName: 'T' });
    }
    await expect(
      assertAbuseThrottleGate(redis as any, { userId, command: 'extra', displayName: 'T' }),
    ).rejects.toBeInstanceOf(SpamBlockedError);
  });

  it('active throttle blocks gate regardless of counters', async () => {
    const redis = createAbuseRedisMock();
    redis._setThrottle(userId, 30);
    await expect(assertAbuseThrottleGate(redis as any, ctx)).rejects.toBeInstanceOf(SpamBlockedError);
  });

  it('fail-open on redis error during gate', async () => {
    const redis = createAbuseRedisMock();
    redis.get = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(assertAbuseThrottleGate(redis as any, ctx)).resolves.toBeUndefined();
  });

  it('fail-open on redis error during success accounting', async () => {
    const redis = createAbuseRedisMock();
    redis.eval = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(recordAbuseAccountingOnSuccess(redis as any, ctx)).resolves.toBeUndefined();
  });
});
