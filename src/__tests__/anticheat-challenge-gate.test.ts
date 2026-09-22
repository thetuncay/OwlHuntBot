import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChallengeRequiredError } from '../anticheat/challenge-errors';
import { checkChallengeGate } from '../anticheat/challenge-gate';
import { setTrustScoreCache } from '../anticheat/trust-score';

function mockRedis(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    set: vi.fn(async (key: string, val: string) => {
      store.set(key, val);
      return 'OK';
    }),
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  };
}

describe('checkChallengeGate', () => {
  const prevEnforce = process.env.ANTICHEAT_CAPTCHA_ENFORCE;
  const prevEnabled = process.env.ANTICHEAT_ENABLED;
  const prevTrust = process.env.ANTICHEAT_TRUST_SCORE;

  beforeEach(() => {
    process.env.ANTICHEAT_ENABLED = '1';
    process.env.ANTICHEAT_TRUST_SCORE = '1';
    process.env.ANTICHEAT_CAPTCHA_ENFORCE = '1';
  });

  afterEach(() => {
    process.env.ANTICHEAT_CAPTCHA_ENFORCE = prevEnforce;
    process.env.ANTICHEAT_ENABLED = prevEnabled;
    process.env.ANTICHEAT_TRUST_SCORE = prevTrust;
  });

  it('trust > 40 ise geçer', async () => {
    const redis = mockRedis();
    await setTrustScoreCache(redis as any, 'u1', 80);
    await expect(
      checkChallengeGate(redis as any, { userId: 'u1', command: 'hunt' }),
    ).resolves.toBeUndefined();
  });

  it('trust <= 40 enforce açıkken ChallengeRequiredError fırlatır', async () => {
    const redis = mockRedis();
    await setTrustScoreCache(redis as any, 'u2', 35);
    await expect(
      checkChallengeGate(redis as any, { userId: 'u2', command: 'hunt', displayName: 'Test' }),
    ).rejects.toBeInstanceOf(ChallengeRequiredError);
  });

  it('enforce kapalıyken bloklamaz', async () => {
    process.env.ANTICHEAT_CAPTCHA_ENFORCE = '0';
    const redis = mockRedis();
    await setTrustScoreCache(redis as any, 'u3', 10);
    await expect(
      checkChallengeGate(redis as any, { userId: 'u3', command: 'hunt' }),
    ).resolves.toBeUndefined();
  });
});
