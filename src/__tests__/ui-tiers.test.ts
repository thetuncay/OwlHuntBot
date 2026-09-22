import { describe, expect, it } from 'vitest';
import {
  formatOwlLevelTierLabel,
  OWL_LEVEL_TIERS,
  resolveOwlLevelTier,
} from '../config/ui-tiers';

describe('resolveOwlLevelTier', () => {
  it('assigns first tier for lvl 1', () => {
    expect(resolveOwlLevelTier(1).label).toBe('Yavru Avcı');
  });

  it('lvl 9 still Yavru Avcı, lvl 10 becomes Genç Avcı', () => {
    expect(resolveOwlLevelTier(9).label).toBe('Yavru Avcı');
    expect(resolveOwlLevelTier(10).label).toBe('Genç Avcı');
  });

  it('matches expected boundaries', () => {
    expect(resolveOwlLevelTier(24).label).toBe('Genç Avcı');
    expect(resolveOwlLevelTier(25).label).toBe('Avcı');
    expect(resolveOwlLevelTier(49).label).toBe('Avcı');
    expect(resolveOwlLevelTier(50).label).toBe('Usta Avcı');
    expect(resolveOwlLevelTier(74).label).toBe('Usta Avcı');
    expect(resolveOwlLevelTier(75).label).toBe('Kıdemli Avcı');
    expect(resolveOwlLevelTier(99).label).toBe('Kıdemli Avcı');
    expect(resolveOwlLevelTier(100).label).toBe('Baş Avcı');
    expect(resolveOwlLevelTier(9999).label).toBe('Baş Avcı');
  });

  it('handles negative or non-finite level (fallback to first tier)', () => {
    expect(resolveOwlLevelTier(-5).label).toBe('Yavru Avcı');
    expect(resolveOwlLevelTier(NaN).label).toBe('Yavru Avcı');
    expect(resolveOwlLevelTier(0).label).toBe('Yavru Avcı');
  });

  it('always returns a tier (no undefined)', () => {
    for (const lv of [1, 5, 10, 25, 50, 75, 100, 500]) {
      const t = resolveOwlLevelTier(lv);
      expect(t).toBeDefined();
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});

describe('OWL_LEVEL_TIERS invariants', () => {
  it('starts at minLevel 1', () => {
    expect(OWL_LEVEL_TIERS[0]!.minLevel).toBe(1);
  });

  it('is sorted by ascending minLevel', () => {
    for (let i = 1; i < OWL_LEVEL_TIERS.length; i++) {
      expect(OWL_LEVEL_TIERS[i]!.minLevel).toBeGreaterThan(OWL_LEVEL_TIERS[i - 1]!.minLevel);
    }
  });

  it('has 5–8 tiers (audit A6 recommendation)', () => {
    expect(OWL_LEVEL_TIERS.length).toBeGreaterThanOrEqual(5);
    expect(OWL_LEVEL_TIERS.length).toBeLessThanOrEqual(8);
  });
});

describe('formatOwlLevelTierLabel', () => {
  it('full format includes level and tier label', () => {
    const s = formatOwlLevelTierLabel(42);
    expect(s).toContain('Lv.**42**');
    expect(s).toContain('Avcı');
  });

  it('short format skips level prefix', () => {
    const s = formatOwlLevelTierLabel(42, { short: true });
    expect(s).not.toContain('Lv.');
    expect(s).toContain('Avcı');
  });

  it('floors non-integer levels', () => {
    expect(formatOwlLevelTierLabel(24.9)).toContain('Lv.**24**');
  });
});
