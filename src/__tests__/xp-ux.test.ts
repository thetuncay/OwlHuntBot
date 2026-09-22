import { describe, expect, it } from 'vitest';
import {
  formatXpGainProgressLine,
  formatXpStatusLine,
  getXpProgressView,
} from '../utils/xp-ux';

describe('xp-ux', () => {
  it('computes remaining XP to next level', () => {
    const view = getXpProgressView(5, 120);
    expect(view.requiredXp).toBeGreaterThan(0);
    expect(view.remainingXp).toBe(view.requiredXp - 120);
  });

  it('formats gain line with v2 level bar', () => {
    const line = formatXpGainProgressLine(50, 3, 200);
    expect(line).toContain('Lv.3');
    expect(line).toMatch(/▰|▱/);
    expect(line).not.toContain('için');
  });

  it('formats status line for w xp', () => {
    const line = formatXpStatusLine(10, 450);
    expect(line).toContain('Lv.**10**');
    expect(line).toContain('%');
  });
});
