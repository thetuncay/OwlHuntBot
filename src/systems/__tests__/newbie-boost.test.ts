import { describe, expect, it } from 'vitest';
import {
  applyNewbieXpMultiplier,
  formatNewbieBoostLine,
  getNewbieLuckBonus,
  isNewbieActive,
  newbieBoostDaysLeft,
} from '../newbie-boost';
import { NEWBIE_BOOST_DAYS, NEWBIE_LUCK_BONUS, NEWBIE_XP_MULTIPLIER } from '../../config';

describe('newbie-boost', () => {
  const createdAt = new Date('2026-06-15T00:00:00Z');

  it('is active for first 7 days', () => {
    const day3 = new Date('2026-06-18T00:00:00Z');
    expect(isNewbieActive(createdAt, day3)).toBe(true);
    expect(newbieBoostDaysLeft(createdAt, day3)).toBeGreaterThan(0);
  });

  it('expires after boost window', () => {
    const day8 = new Date('2026-06-23T00:00:00Z');
    expect(isNewbieActive(createdAt, day8)).toBe(false);
    expect(getNewbieLuckBonus(createdAt, day8)).toBe(0);
  });

  it('applies xp multiplier and luck bonus', () => {
    const now = new Date('2026-06-16T00:00:00Z');
    expect(applyNewbieXpMultiplier(100, createdAt, now)).toBe(Math.round(100 * NEWBIE_XP_MULTIPLIER));
    expect(getNewbieLuckBonus(createdAt, now)).toBe(NEWBIE_LUCK_BONUS);
  });

  it('formats footer line when active', () => {
    const now = new Date('2026-06-16T00:00:00Z');
    const line = formatNewbieBoostLine(createdAt, now);
    expect(line).toContain('Yeni oyuncu bonusu');
    expect(line).toContain(String(NEWBIE_BOOST_DAYS - 1));
  });
});
