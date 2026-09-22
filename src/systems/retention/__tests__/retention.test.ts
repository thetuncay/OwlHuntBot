import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import { INCR_EXPIRE_SCRIPT, SAFE_DECR_SCRIPT } from '../../../utils/redis-scripts';
import {
  getPlayerActivitySnapshot,
  trackCommandActivity,
  type ActivitySnapshot,
} from '../player-activity';
import { calculateChurnScore, getChurnScore } from '../churn-score';
import {
  getGambleRetentionBonus,
  getHuntRetentionBonus,
  getRetentionBonusSafe,
  getTameRetentionBonus,
} from '../retention-modifiers';

function createRetentionRedisMock(seed?: Record<string, string | Record<string, string>>) {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();

  if (seed) {
    for (const [key, value] of Object.entries(seed)) {
      if (typeof value === 'string') strings.set(key, value);
      else hashes.set(key, { ...value });
    }
  }

  const evalFn = vi.fn(async (script: string, _numKeys: number, key: string, ...args: string[]) => {
    if (script === INCR_EXPIRE_SCRIPT) {
      const ttl = parseInt(args[0] ?? '1800', 10);
      const current = parseInt(strings.get(key) ?? '0', 10);
      const next = current + 1;
      strings.set(key, String(next));
      if (next === 1) {
        /* TTL tracked logically only */
        void ttl;
      }
      return next;
    }
    if (script === SAFE_DECR_SCRIPT) {
      const current = parseInt(strings.get(key) ?? '0', 10);
      const next = Math.max(0, current - 1);
      strings.set(key, String(next));
      return next;
    }
    return 0;
  });

  const redis = {
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ..._args: unknown[]) => {
      strings.set(key, value);
      return 'OK';
    }),
    hgetall: vi.fn(async (key: string) => hashes.get(key) ?? {}),
    hincrby: vi.fn(async (key: string, field: string, amount: number) => {
      const hash = hashes.get(key) ?? {};
      const next = (parseInt(hash[field] ?? '0', 10) || 0) + amount;
      hash[field] = String(next);
      hashes.set(key, hash);
      return next;
    }),
    expire: vi.fn(async () => 1),
    eval: evalFn,
    _strings: strings,
    _hashes: hashes,
  };

  return redis as unknown as Redis & {
    _strings: Map<string, string>;
    _hashes: Map<string, Record<string, string>>;
  };
}

function snap(partial: Partial<ActivitySnapshot>): ActivitySnapshot {
  return {
    returnGapDays: 0,
    sessionCommandCount: 0,
    sessionLossCount: 0,
    weeklyTrend: 'active',
    returnBonusActive: false,
    ...partial,
  };
}

describe('calculateChurnScore', () => {
  it('aktif oyuncu → safe', () => {
    const churn = calculateChurnScore(snap({ returnGapDays: 0, sessionLossCount: 2 }));
    expect(churn.tier).toBe('safe');
    expect(churn.score).toBe(0);
  });

  it('bugün ilk giriş → safe', () => {
    const churn = calculateChurnScore(snap({ returnGapDays: 1 }));
    expect(churn.tier).toBe('safe');
    expect(churn.score).toBe(0);
  });

  it('2 gün yok → at_risk', () => {
    const churn = calculateChurnScore(snap({ returnGapDays: 2 }));
    expect(churn.tier).toBe('at_risk');
    expect(churn.score).toBe(30);
  });

  it('3 gün yok + declining → at_risk score 45', () => {
    const churn = calculateChurnScore(snap({ returnGapDays: 3, weeklyTrend: 'declining' }));
    expect(churn.tier).toBe('at_risk');
    expect(churn.score).toBe(45);
  });

  it('5 gün yok → at_risk', () => {
    const churn = calculateChurnScore(snap({ returnGapDays: 5 }));
    expect(churn.tier).toBe('at_risk');
    expect(churn.score).toBe(55);
  });

  it('7 gün yok + dormant → churning score 95', () => {
    const churn = calculateChurnScore(snap({ returnGapDays: 7, weeklyTrend: 'dormant' }));
    expect(churn.tier).toBe('churning');
    expect(churn.score).toBe(95);
  });

  it('oturum kaybı tükendi → safe score 20', () => {
    const churn = calculateChurnScore(snap({ sessionLossCount: 10 }));
    expect(churn.tier).toBe('safe');
    expect(churn.score).toBe(20);
  });

  it('4 gün + declining + kayıp → churning score 80', () => {
    const churn = calculateChurnScore(
      snap({ returnGapDays: 4, weeklyTrend: 'declining', sessionLossCount: 6 }),
    );
    expect(churn.tier).toBe('churning');
    expect(churn.score).toBe(80);
  });

  it('skor 100 cap', () => {
    const churn = calculateChurnScore(
      snap({ returnGapDays: 7, weeklyTrend: 'dormant', sessionLossCount: 10 }),
    );
    expect(churn.tier).toBe('churning');
    expect(churn.score).toBe(100);
  });

  it('geri dönüş bonusu flag', () => {
    const churn = calculateChurnScore(snap({ returnBonusActive: true }));
    expect(churn.returnBonus).toBe(true);
  });
});

describe('retention modifier getters', () => {
  const safe = calculateChurnScore(snap({}));
  const atRisk = calculateChurnScore(snap({ returnGapDays: 3 }));
  const churning = calculateChurnScore(snap({ returnGapDays: 7, weeklyTrend: 'dormant' }));
  const withReturn = calculateChurnScore(snap({ returnGapDays: 7, weeklyTrend: 'dormant', returnBonusActive: true }));

  describe('getHuntRetentionBonus', () => {
    it('safe tier → 0', () => expect(getHuntRetentionBonus(safe)).toBe(0));
    it('at_risk → 0.03', () => expect(getHuntRetentionBonus(atRisk)).toBe(0.03));
    it('churning → 0.06', () => expect(getHuntRetentionBonus(churning)).toBe(0.06));
    it('returnBonus → +0.02', () => expect(getHuntRetentionBonus(withReturn)).toBe(0.08));
    it('cap aşılmıyor', () => {
      const over = calculateChurnScore(snap({ returnGapDays: 7, weeklyTrend: 'dormant', returnBonusActive: true }));
      expect(getHuntRetentionBonus(over)).toBeLessThanOrEqual(0.375);
      expect(getHuntRetentionBonus(over)).toBe(0.08);
    });
    it('boundary safe/at_risk', () => {
      expect(getHuntRetentionBonus(calculateChurnScore(snap({ returnGapDays: 2 })))).toBe(0.03);
    });
  });

  describe('getGambleRetentionBonus', () => {
    it('safe tier → 0', () => expect(getGambleRetentionBonus(safe)).toBe(0));
    it('at_risk → 0.02', () => expect(getGambleRetentionBonus(atRisk)).toBe(0.02));
    it('churning → 0.04', () => expect(getGambleRetentionBonus(churning)).toBe(0.04));
    it('returnBonus → +0.02', () => expect(getGambleRetentionBonus(withReturn)).toBe(0.06));
    it('cap 0.06', () => expect(getGambleRetentionBonus(withReturn)).toBe(0.06));
    it('boundary', () => expect(getGambleRetentionBonus(atRisk)).toBeLessThanOrEqual(0.06));
  });

  describe('getTameRetentionBonus', () => {
    it('safe tier → 0', () => expect(getTameRetentionBonus(safe)).toBe(0));
    it('at_risk → 0.03', () => expect(getTameRetentionBonus(atRisk)).toBe(0.03));
    it('churning → 0.05', () => expect(getTameRetentionBonus(churning)).toBe(0.05));
    it('returnBonus → +0.02', () => expect(getTameRetentionBonus(withReturn)).toBe(0.07));
    it('cap 0.07', () => expect(getTameRetentionBonus(withReturn)).toBe(0.07));
    it('boundary', () => expect(getTameRetentionBonus(churning)).toBeLessThanOrEqual(0.07));
  });
});

describe('getPlayerActivitySnapshot', () => {
  const playerId = 'p-snap';

  it('hiç veri yok → defaults', async () => {
    const redis = createRetentionRedisMock();
    const snapshot = await getPlayerActivitySnapshot(redis, playerId);
    expect(snapshot).toEqual({
      returnGapDays: 0,
      sessionCommandCount: 0,
      sessionLossCount: 0,
      weeklyTrend: 'active',
      returnBonusActive: false,
    });
  });

  it('lastCmd 48 saat önce → returnGapDays 2', async () => {
    const twoDaysAgo = Date.now() - 2 * 86_400_000;
    const redis = createRetentionRedisMock({
      [`pa:${playerId}:lastCmd`]: String(twoDaysAgo),
    });
    const snapshot = await getPlayerActivitySnapshot(redis, playerId);
    expect(snapshot.returnGapDays).toBe(2);
  });

  it('5 günlük declining trend', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const days: Record<string, string> = {};
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      days[d] = i < 3 ? '1' : '10';
    }
    void today;
    const redis = createRetentionRedisMock({
      [`pa:${playerId}:lastCmd`]: String(Date.now()),
      [`pa:${playerId}:daily`]: days,
    });
    const snapshot = await getPlayerActivitySnapshot(redis, playerId);
    expect(snapshot.weeklyTrend).toBe('declining');
  });

  it('retBonusLeft > 0 → returnBonusActive', async () => {
    const redis = createRetentionRedisMock({
      [`pa:${playerId}:retBonusLeft`]: '2',
    });
    const snapshot = await getPlayerActivitySnapshot(redis, playerId);
    expect(snapshot.returnBonusActive).toBe(true);
  });
});

describe('integration smoke + safe wrapper', () => {
  const playerId = 'p-smoke';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('track → snapshot → churn → hunt bonus in range', async () => {
    const redis = createRetentionRedisMock();
    await trackCommandActivity(redis, playerId);
    const snapshot = await getPlayerActivitySnapshot(redis, playerId);
    const churn = calculateChurnScore(snapshot);
    const bonus = getHuntRetentionBonus(churn);
    expect(bonus).toBeGreaterThanOrEqual(0);
    expect(bonus).toBeLessThanOrEqual(0.08);
  });

  it('getChurnScore caches result', async () => {
    const redis = createRetentionRedisMock({
      [`pa:${playerId}:lastCmd`]: String(Date.now() - 3 * 86_400_000),
    });
    const first = await getChurnScore(redis, playerId);
    const second = await getChurnScore(redis, playerId);
    expect(second).toEqual(first);
    expect(redis._strings.has(`pa:${playerId}:scoreCache`)).toBe(true);
  });

  it('getRetentionBonusSafe returns 0 on redis error', async () => {
    const redis = {
      get: vi.fn(async () => {
        throw new Error('redis down');
      }),
    } as unknown as Redis;
    await expect(getRetentionBonusSafe('hunt', redis, playerId)).resolves.toBe(0);
  });
});
