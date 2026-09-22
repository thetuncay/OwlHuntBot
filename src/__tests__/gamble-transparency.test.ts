import { describe, expect, it } from 'vitest';
import {
  GAMBLE_COINFLIP_WIN_CHANCE,
  GAMBLE_STREAK_LOSS_3,
  GAMBLE_STREAK_LOSS_5,
  GAMBLE_STREAK_WIN_3,
  GAMBLE_STREAK_WIN_5,
} from '../config';
import {
  buildLossReliefNote,
  explainWinChance,
  streakChanceModifier,
} from '../systems/gamble/win-chance-explain';
import {
  getGambleStats,
  recordGambleOutcome,
  winRatePercent,
} from '../systems/gamble/gamble-stats';
import { buildGambleStatsEmbed } from '../utils/gamble-stats-ux';
import { finalWinChance } from '../utils/math';

describe('streakChanceModifier (M2 koruması)', () => {
  it('kayıp serisi eşiklerinde koruma açar', () => {
    expect(streakChanceModifier(0, 0)).toBe(0);
    expect(streakChanceModifier(0, 2)).toBe(0);
    expect(streakChanceModifier(0, 3)).toBe(GAMBLE_STREAK_LOSS_3);
    expect(streakChanceModifier(0, 5)).toBe(GAMBLE_STREAK_LOSS_5);
  });

  it('kazanç serisinde frenler', () => {
    expect(streakChanceModifier(3, 0)).toBe(GAMBLE_STREAK_WIN_3);
    expect(streakChanceModifier(5, 0)).toBe(GAMBLE_STREAK_WIN_5);
  });

  it('kayıp serisi kazanç serisine göre önceliklidir', () => {
    expect(streakChanceModifier(9, 5)).toBe(GAMBLE_STREAK_LOSS_5);
  });

  it('koruma pozitif, frenleme negatif işaretli', () => {
    expect(GAMBLE_STREAK_LOSS_3).toBeGreaterThan(0);
    expect(GAMBLE_STREAK_WIN_3).toBeLessThan(0);
  });
});

describe('buildLossReliefNote', () => {
  it('koruma yoksa satır üretmez', () => {
    expect(buildLossReliefNote(0)).toBeNull();
    expect(buildLossReliefNote(2)).toBeNull();
  });

  it('koruma varsa gerçek puanı yazar', () => {
    const note = buildLossReliefNote(3);
    expect(note).toContain(String(GAMBLE_STREAK_LOSS_3));
    expect(buildLossReliefNote(5)).toContain(String(GAMBLE_STREAK_LOSS_5));
  });
});

describe('explainWinChance', () => {
  const base = { baseChance: GAMBLE_COINFLIP_WIN_CHANCE, coins: 10_000, bet: 100 };

  it('nihai şans gerçek formülle birebir aynı', () => {
    const streakWins = 0;
    const streakLosses = 4;
    const breakdown = explainWinChance({ ...base, streakWins, streakLosses });
    const expected = finalWinChance(
      base.baseChance,
      base.coins,
      base.bet,
      streakChanceModifier(streakWins, streakLosses),
    );
    expect(breakdown.final).toBe(expected);
  });

  it('kayıp serisinde koruma pozitif, frenleme sıfır', () => {
    const b = explainWinChance({ ...base, streakWins: 0, streakLosses: 5 });
    expect(b.streakRelief).toBeGreaterThan(0);
    expect(b.streakDampener).toBe(0);
  });

  it('kazanç serisinde frenleme negatif, koruma sıfır', () => {
    const b = explainWinChance({ ...base, streakWins: 5, streakLosses: 0 });
    expect(b.streakDampener).toBeLessThan(0);
    expect(b.streakRelief).toBe(0);
  });

  it('zengin oyuncunun cezası daha büyük', () => {
    const poor = explainWinChance({ ...base, coins: 1_000, streakWins: 0, streakLosses: 0 });
    const rich = explainWinChance({ ...base, coins: 10_000_000, streakWins: 0, streakLosses: 0 });
    expect(rich.richPenalty).toBeGreaterThan(poor.richPenalty);
  });

  it('retention puanı nihai şansa yansır', () => {
    const without = explainWinChance({ ...base, streakWins: 0, streakLosses: 0 });
    const with10 = explainWinChance({
      ...base, streakWins: 0, streakLosses: 0, retentionPoints: 10,
    });
    expect(with10.final).toBeGreaterThan(without.final);
    expect(with10.retentionBonus).toBe(10);
  });
});

// ── M1 sayaçları ─────────────────────────────────────────────────────────────

/** Test için minimal Redis hash taklidi. */
function createFakeRedis() {
  const store = new Map<string, Map<string, string>>();
  const hash = (key: string) => {
    if (!store.has(key)) store.set(key, new Map());
    return store.get(key)!;
  };
  const redis = {
    multi() {
      const ops: (() => void)[] = [];
      const chain = {
        hincrby(key: string, field: string, by: number) {
          ops.push(() => {
            const h = hash(key);
            h.set(field, String(Number(h.get(field) ?? 0) + by));
          });
          return chain;
        },
        expire() { return chain; },
        async exec() { ops.forEach((op) => op()); return []; },
      };
      return chain;
    },
    async hgetall(key: string) {
      return Object.fromEntries(hash(key));
    },
  };
  return redis as unknown as Parameters<typeof recordGambleOutcome>[0];
}

describe('gamble stats sayaçları (M1)', () => {
  it('hiç oynanmadıysa sıfırlı snapshot verir', async () => {
    const redis = createFakeRedis();
    const stats = await getGambleStats(redis, 'p1');
    expect(stats.plays).toBe(0);
    expect(winRatePercent(stats)).toBeNull();
  });

  it('kazanç ve kaybı ayrı sayar', async () => {
    const redis = createFakeRedis();
    await recordGambleOutcome(redis, 'p1', 'cf', true, 100, 95);
    await recordGambleOutcome(redis, 'p1', 'cf', false, 100, -100);
    await recordGambleOutcome(redis, 'p1', 'slot', false, 50, -50);

    const stats = await getGambleStats(redis, 'p1');
    expect(stats.plays).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(2);
    expect(stats.wagered).toBe(250);
    expect(stats.net).toBe(-55);
    expect(stats.byGame.cf.plays).toBe(2);
    expect(stats.byGame.cf.wins).toBe(1);
    expect(stats.byGame.slot.plays).toBe(1);
  });

  it('kazanma oranını doğru hesaplar', async () => {
    const redis = createFakeRedis();
    await recordGambleOutcome(redis, 'p2', 'bj', true, 10, 9);
    await recordGambleOutcome(redis, 'p2', 'bj', false, 10, -10);
    const stats = await getGambleStats(redis, 'p2');
    expect(winRatePercent(stats)).toBe(50);
  });

  it('Redis hatası oyunu bozmaz', async () => {
    const broken = {
      multi: () => { throw new Error('redis down'); },
      hgetall: () => { throw new Error('redis down'); },
    } as unknown as Parameters<typeof recordGambleOutcome>[0];

    await expect(
      recordGambleOutcome(broken, 'p3', 'cf', true, 10, 5),
    ).resolves.toBeUndefined();
    const stats = await getGambleStats(broken, 'p3');
    expect(stats.plays).toBe(0);
  });
});

describe('buildGambleStatsEmbed', () => {
  const emptyStats = {
    plays: 0, wins: 0, losses: 0, wagered: 0, net: 0,
    byGame: { cf: { plays: 0, wins: 0 }, bj: { plays: 0, wins: 0 }, slot: { plays: 0, wins: 0 } },
  };

  it('hiç oynamamış oyuncuya oran uydurmaz', () => {
    const json = buildGambleStatsEmbed({
      username: 'Avci', stats: emptyStats, coins: 500, streakWins: 0, streakLosses: 0,
    }).toJSON();
    expect(json.description).toContain('Henüz kumar oynamadın');
  });

  it('kayıp serisinde korumayı görünür yazar', () => {
    const json = buildGambleStatsEmbed({
      username: 'Avci', stats: emptyStats, coins: 500, streakWins: 0, streakLosses: 5,
    }).toJSON();
    const chance = json.fields?.find((f) => f.name.includes('Şansını'));
    expect(chance?.value).toContain('Kötü şans koruması');
    expect(chance?.value).toContain(String(GAMBLE_STREAK_LOSS_5));
  });

  it('kazanç serisinde frenlemeyi de saklamaz', () => {
    const json = buildGambleStatsEmbed({
      username: 'Avci', stats: emptyStats, coins: 500, streakWins: 5, streakLosses: 0,
    }).toJSON();
    const chance = json.fields?.find((f) => f.name.includes('Şansını'));
    expect(chance?.value).toContain('frenlemesi');
  });

  it('oynanan oyunu oran ile listeler', () => {
    const stats = {
      ...emptyStats,
      plays: 4, wins: 1, losses: 3, wagered: 400, net: -305,
      byGame: { cf: { plays: 4, wins: 1 }, bj: { plays: 0, wins: 0 }, slot: { plays: 0, wins: 0 } },
    };
    const json = buildGambleStatsEmbed({
      username: 'Avci', stats, coins: 500, streakWins: 0, streakLosses: 0,
    }).toJSON();
    expect(json.description).toContain('25.0%');
    const perGame = json.fields?.find((f) => f.name === 'Oyun bazında');
    expect(perGame?.value).toContain('Coinflip');
    expect(perGame?.value).not.toContain('Gölge 21');
  });
});
