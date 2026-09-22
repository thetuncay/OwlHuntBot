import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAbuseRedisMock } from './helpers/abuse-redis-mock';
import { checkAnticheatGate } from '../anticheat';
import { assertAbuseThrottleGate, recordAbuseAccountingOnSuccess } from '../middleware/abuse-breaker';

describe('anticheat kill switch', () => {
  const userId = 'user-kill-switch';

  beforeEach(() => {
    process.env.ANTICHEAT_ENABLED = '0';
  });

  it('is no-op when ANTICHEAT_ENABLED=0', async () => {
    const redis = {
      hgetall: vi.fn(),
      hset: vi.fn(),
      pexpire: vi.fn(),
      incr: vi.fn(),
    };

    await expect(checkAnticheatGate(redis as any, { userId, command: 'hunt' })).resolves.toBeUndefined();
    expect(redis.hgetall).not.toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('does not change abuse-breaker behavior when disabled', async () => {
    const redis = createAbuseRedisMock();
    const ctx = { userId, command: 'hunt', displayName: 'Test' };

    for (let i = 0; i < 20; i++) {
      await recordAbuseAccountingOnSuccess(redis as any, ctx);
    }

    await expect(assertAbuseThrottleGate(redis as any, ctx)).rejects.toBeInstanceOf(Error);
  });
});
