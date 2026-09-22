import { describe, expect, it } from 'vitest';
import {
  activePeriods,
  ALLTIME_PERIOD,
  GLOBAL_SCOPE,
  guildScopeId,
  legacyZsetKey,
  snapshotKey,
  zsetKey,
} from '../systems/leaderboard-keys';
import {
  applyHuntDiminishing,
  calcNetWealthScore,
  calcPowerScore,
  wealthLeaderboardScore,
} from '../systems/leaderboard-scoring';
import { playerScoreForCategory } from '../systems/leaderboard-queries';

describe('leaderboard-keys', () => {
  it('builds zset and snapshot keys', () => {
    const p = activePeriods(new Date('2026-06-04T12:00:00Z'));
    expect(zsetKey(GLOBAL_SCOPE, 'power', p.season)).toMatch(/^lb:z:global:power:/);
    expect(snapshotKey(GLOBAL_SCOPE, 'hunt', p.week, 100)).toBe(
      `lb:s:global:hunt:${p.week}:t100`,
    );
    expect(guildScopeId('123')).toBe('g:123');
    expect(legacyZsetKey('arena')).toBe('lb:arena');
    expect(p.alltime).toBe(ALLTIME_PERIOD);
  });
});

describe('leaderboard-scoring', () => {
  it('calcPowerScore uses weights', () => {
    expect(calcPowerScore(10, 1000, 5)).toBe(Math.round(10 * 150 + 1000 * 0.05 + 5 * 80));
  });

  it('calcNetWealthScore subtracts losses', () => {
    expect(calcNetWealthScore(1000, 300)).toBe(700);
    expect(calcNetWealthScore(100, 500)).toBe(0);
  });

  it('applyHuntDiminishing reduces high volume', () => {
    const low = applyHuntDiminishing(5, 0);
    const high = applyHuntDiminishing(10, 200);
    expect(high).toBeLessThan(10);
    expect(low).toBe(5);
  });
});

describe('playerScoreForCategory wealth', () => {
  it('uses current wallet balance only', () => {
    expect(wealthLeaderboardScore(5000, 2000, 100)).toBe(100);
    const score = playerScoreForCategory('wealth', {
      id: '1',
      powerScore: 0,
      totalHunts: 0,
      totalRareFinds: 0,
      totalPvpWins: 0,
      totalCoinsEarned: 5000,
      totalCoinsLost: 2000,
      level: 1,
      xp: 0,
      coins: 100,
      pvpCount: 0,
    });
    expect(score).toBe(100);
  });

  it('ignores lifetime earnings when wallet is lower', () => {
    expect(wealthLeaderboardScore(80_000, 0, 20_000)).toBe(20_000);
    const score = playerScoreForCategory('wealth', {
      id: '2',
      powerScore: 0,
      totalHunts: 0,
      totalRareFinds: 0,
      totalPvpWins: 0,
      totalCoinsEarned: 80_000,
      totalCoinsLost: 0,
      level: 10,
      xp: 0,
      coins: 20_000,
      pvpCount: 0,
    });
    expect(score).toBe(20_000);
  });
});
