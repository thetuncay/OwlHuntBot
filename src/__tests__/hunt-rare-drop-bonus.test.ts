import { describe, expect, it } from 'vitest';
import { effectiveHuntRareModifier } from '../systems/hunt';

describe('effectiveHuntRareModifier', () => {
  it('returns biome modifier when no buff bonus', () => {
    expect(effectiveHuntRareModifier(1.0, 0)).toBe(1);
    expect(effectiveHuntRareModifier(2.0, 0)).toBe(2);
  });

  it('scales rare spawn weight by flat buff bonus', () => {
    expect(effectiveHuntRareModifier(1.0, 0.35)).toBeCloseTo(1.35);
    expect(effectiveHuntRareModifier(2.0, 0.35)).toBeCloseTo(2.7);
  });

  it('ignores negative bonus', () => {
    expect(effectiveHuntRareModifier(1.5, -0.2)).toBe(1.5);
  });
});
