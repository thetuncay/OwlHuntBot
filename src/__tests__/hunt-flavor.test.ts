import { describe, expect, it, vi } from 'vitest';
import {
  applyTimeOfDayXp,
  guaranteePreyXp,
  istanbulHour,
  resolveHuntTimeBonus,
  tickHuntMicroEvent,
} from '../systems/hunt-flavor';
import { applySessionStreakXp, formatSessionStreakLines } from '../systems/hunt-session-streak';
import {
  HUNT_GUARANTEE_XP_FLOOR,
  HUNT_SESSION_MILESTONE_25,
  HUNT_SESSION_MILESTONE_50,
  HUNT_SESSION_XP_MULT_25,
  HUNT_SESSION_XP_MULT_50,
} from '../config/hunt-flavor';

describe('hunt time windows', () => {
  it('maps UTC to Istanbul hour', () => {
    const noonUtc = new Date('2026-01-15T09:00:00.000Z');
    expect(istanbulHour(noonUtc)).toBe(12);
  });

  it('time windows are neutral (no aroma line / no bonus)', () => {
    const morning = new Date('2026-01-15T05:00:00.000Z');
    const night = new Date('2026-01-15T21:00:00.000Z');
    for (const when of [morning, night, new Date('2026-01-15T12:00:00.000Z')]) {
      const bonus = resolveHuntTimeBonus(when);
      expect(bonus.xpMult).toBe(1);
      expect(bonus.rareBonus).toBe(0);
      expect(bonus.line).toBeNull();
    }
    expect(applyTimeOfDayXp(100, 1)).toBe(100);
  });
});

describe('micro-event aroma removed', () => {
  it('never triggers line or bonus XP', async () => {
    const redis = { incr: vi.fn(), expire: vi.fn() } as any;
    const r = await tickHuntMicroEvent(redis, 'u1');
    expect(r).toEqual({ triggered: false, bonusXp: 0, line: null });
    expect(redis.incr).not.toHaveBeenCalled();
  });
});

describe('av serisi XP (birleşik milestone)', () => {
  it('applies 25/50 XP multipliers; UI lines live in hunt block only', () => {
    expect(applySessionStreakXp(100, 17)).toBe(100);
    expect(applySessionStreakXp(100, HUNT_SESSION_MILESTONE_25)).toBe(Math.round(100 * HUNT_SESSION_XP_MULT_25));
    expect(applySessionStreakXp(100, HUNT_SESSION_MILESTONE_50)).toBe(Math.round(100 * HUNT_SESSION_XP_MULT_50));
    expect(formatSessionStreakLines({ count: 17, bonusActive: false })).toEqual([]);
    expect(formatSessionStreakLines({ count: 25, bonusActive: true })).toEqual([]);
  });
});

describe('D1 guarantee floor', () => {
  it('raises tiny prey XP to the floor', () => {
    expect(guaranteePreyXp(5)).toBe(HUNT_GUARANTEE_XP_FLOOR);
    expect(guaranteePreyXp(20)).toBe(20);
  });
});

describe('legacy session tick stub', () => {
  it('returns empty streak (counter moved to milestones)', async () => {
    const redis = { incr: vi.fn(), expire: vi.fn() } as any;
    const { tickHuntSessionStreak } = await import('../systems/hunt-session-streak');
    const a = await tickHuntSessionStreak(redis, 'u1');
    expect(a.count).toBe(0);
    expect(redis.incr).not.toHaveBeenCalled();
  });
});
