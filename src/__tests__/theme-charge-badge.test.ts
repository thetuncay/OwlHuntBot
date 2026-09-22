import { describe, expect, it } from 'vitest';
import { chargeBadge, inlineAmount } from '../utils/theme';

describe('chargeBadge', () => {
  it('OwO tarzı inline code kutusu', () => {
    expect(chargeBadge(32, 120)).toBe('`[32/120]`');
    expect(inlineAmount(118)).toBe('`118`');
    expect(inlineAmount('1.245')).toBe('`1.245`');
  });
});
