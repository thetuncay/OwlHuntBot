import { describe, expect, it, vi } from 'vitest';

const { recordAnticheatEventMock, evaluatePunishmentMock } = vi.hoisted(() => ({
  recordAnticheatEventMock: vi.fn(),
  evaluatePunishmentMock: vi.fn(async () => undefined),
}));

vi.mock('../anticheat/audit-logger', () => ({
  recordAnticheatEvent: recordAnticheatEventMock,
}));

vi.mock('../anticheat/punishment-engine', () => ({
  evaluatePunishment: evaluatePunishmentMock,
}));

vi.mock('../utils/db-queue', () => ({
  enqueueDbWrite: vi.fn(),
}));

vi.mock('../anticheat/trust-score', () => ({
  getTrustScore: vi.fn(async () => 50),
  setTrustScoreCache: vi.fn(async () => undefined),
}));

import {
  formatCaptchaStrikeBar,
  getCaptchaStrikeCount,
  startChallenge,
  submitChallengeAnswer,
} from '../anticheat/challenge-manager';
import { generateCaptchaCode, renderCaptchaSvg, renderCaptchaPng } from '../anticheat/captcha-image';

function createRedisMock() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    }),
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    _store: store,
  };
}

describe('captcha image', () => {
  it('generates mixed-case code with requested length', () => {
    const code = generateCaptchaCode(4);
    expect(code).toHaveLength(4);
  });

  it('renders png buffer for discord preview', async () => {
    const png = await renderCaptchaPng('Ab3x');
    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
  });
});

describe('anticheat challenge manager', () => {
  it('formats strike bar like OwO', () => {
    expect(formatCaptchaStrikeBar(0)).toBe('⬛ ⬛ ⬛');
    expect(formatCaptchaStrikeBar(1)).toBe('❌ ⬛ ⬛');
    expect(formatCaptchaStrikeBar(3)).toBe('❌ ❌ ❌');
  });

  it('logs timeout/missing challenge as observe-only event', async () => {
    process.env.ANTICHEAT_ENABLED = '1';
    const redis = createRedisMock();

    const result = await submitChallengeAnswer(redis as any, 'u1', 'abcd');
    expect(result.status).toBe('expired');
    expect(recordAnticheatEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'captcha_failed',
        detail: expect.objectContaining({ reason: 'challenge_timeout_or_missing' }),
      }),
    );
  });

  it('passes on exact case-sensitive answer', async () => {
    process.env.ANTICHEAT_ENABLED = '1';
    const redis = createRedisMock();
    const started = await startChallenge(redis as any, 'u3', 'g1');
    expect(started.codeLength).toBe(4);
    expect(started.answer).toHaveLength(4);
    expect(started.imageName).toBe('captcha.png');
    expect(started.imageBuffer.subarray(0, 4).toString('hex')).toBe('89504e47');

    const passed = await submitChallengeAnswer(redis as any, 'u3', started.answer);
    expect(passed.status).toBe('passed');
    expect(redis.set).toHaveBeenCalledWith('ac:challenge:grace:u3', '1', 'EX', expect.any(Number));
  });

  it('increments strike when session expires before new challenge', async () => {
    process.env.ANTICHEAT_ENABLED = '1';
    const redis = createRedisMock();
    const started = await startChallenge(redis as any, 'u4', 'g1');

    const sessionKey = 'ac:challenge:u4';
    const pendingKey = 'ac:captcha:pending:u4';
    const raw = redis._store.get(sessionKey)!;
    const session = JSON.parse(raw);
    session.expiresAt = Date.now() - 1000;
    redis._store.set(sessionKey, JSON.stringify(session));
    const pendingRaw = redis._store.get(pendingKey)!;
    const pending = JSON.parse(pendingRaw);
    pending.expiresAt = Date.now() - 1000;
    pending.strikeApplied = false;
    redis._store.set(pendingKey, JSON.stringify(pending));
    redis._store.delete(sessionKey);

    await startChallenge(redis as any, 'u4', 'g1');
    expect(await getCaptchaStrikeCount(redis as any, 'u4')).toBe(1);
    expect(started.answer).not.toBe('');
  });
});
