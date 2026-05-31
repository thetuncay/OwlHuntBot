import { describe, expect, it } from 'vitest';
import { buildHelpEmbed } from '../commands/owl-help';
import { assertEmbedLimits } from '../utils/embed';
import { stripGluedPrefix } from '../utils/owo-command';

describe('owl-help embed', () => {
  it('passes Discord embed limits for short and custom prefixes', () => {
    for (const prefix of ['owl', 'w', 'baykus']) {
      expect(() => assertEmbedLimits(buildHelpEmbed(prefix))).not.toThrow();
    }
  });
});

describe('stripGluedPrefix', () => {
  it('splits common glued commands after short guild prefix', () => {
    expect(stripGluedPrefix('wh', 'w')).toBe('h');
    expect(stripGluedPrefix('wyardim', 'w')).toBe('yardim');
    expect(stripGluedPrefix('w yardım', 'w')).toBe('yardım');
    expect(stripGluedPrefix('wdaily', 'w')).toBe('daily');
  });
});
