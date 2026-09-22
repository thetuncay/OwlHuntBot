import { describe, expect, it } from 'vitest';
import {
  calcDailyLoginCoins,
  calcDailyLoginItems,
  calcDailyLoginXp,
  computeNextStreak,
  dailyLoginCooldownRemainingMs,
} from '../daily-login';
import {
  DAILY_LOGIN_COOLDOWN_MS,
  DAILY_LOGIN_STREAK_GRACE_MS,
  DAILY_LOGIN_STREAK_WINDOW_MS,
} from '../../config';

describe('daily-login economy', () => {
  it('scales coins and xp with streak caps', () => {
    expect(calcDailyLoginCoins(1)).toBe(225);
    expect(calcDailyLoginCoins(100)).toBeLessThanOrEqual(800);
    expect(calcDailyLoginXp(1)).toBe(65);
    expect(calcDailyLoginXp(100)).toBeLessThanOrEqual(300);
  });

  it('awards crates on day 5 and 10 milestones', () => {
    expect(calcDailyLoginItems(5)).toEqual({ equipmentCrate: 1, weaponCrate: 0 });
    expect(calcDailyLoginItems(10)).toEqual({ equipmentCrate: 0, weaponCrate: 1 });
    expect(calcDailyLoginItems(3)).toEqual({ equipmentCrate: 0, weaponCrate: 0 });
  });

  it('increments streak within grace window', () => {
    const now = new Date('2026-06-22T12:00:00Z');
    const last = new Date(now.getTime() - DAILY_LOGIN_STREAK_WINDOW_MS + 60_000);
    expect(computeNextStreak(4, last, now)).toBe(5);
  });

  // Streak penceresi dolsa bile GRACE süresi seriyi korur (A7 felsefesi).
  it('keeps streak inside the grace period', () => {
    const now = new Date('2026-06-22T12:00:00Z');
    const last = new Date(
      now.getTime() - DAILY_LOGIN_STREAK_WINDOW_MS - DAILY_LOGIN_STREAK_GRACE_MS + 60_000,
    );
    expect(computeNextStreak(9, last, now)).toBe(10);
  });

  it('resets streak only after window + grace', () => {
    const now = new Date('2026-06-22T12:00:00Z');
    const last = new Date(
      now.getTime() - DAILY_LOGIN_STREAK_WINDOW_MS - DAILY_LOGIN_STREAK_GRACE_MS - 1,
    );
    expect(computeNextStreak(9, last, now)).toBe(1);
  });

  it('enforces 20h cooldown', () => {
    const now = new Date('2026-06-22T12:00:00Z');
    const last = new Date(now.getTime() - DAILY_LOGIN_COOLDOWN_MS + 30_000);
    expect(dailyLoginCooldownRemainingMs(last, now)).toBeGreaterThan(0);
    const ready = new Date(now.getTime() - DAILY_LOGIN_COOLDOWN_MS);
    expect(dailyLoginCooldownRemainingMs(ready, now)).toBe(0);
  });
});
