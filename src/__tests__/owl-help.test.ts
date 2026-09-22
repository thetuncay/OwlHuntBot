import { describe, expect, it } from 'vitest';
import { buildHelpEmbed, HELP_TOPIC_LABELS } from '../commands/owl-help';
import { assertEmbedLimits } from '../utils/embed';
import { stripGluedPrefix } from '../utils/alias-command';

describe('owl-help embed', () => {
  it('hub stays compact and within Discord limits', () => {
    for (const prefix of ['owl', 'w', 'baykus']) {
      const embed = buildHelpEmbed(prefix);
      expect(() => assertEmbedLimits(embed)).not.toThrow();
      const data = embed.toJSON();
      expect((data.fields ?? []).length).toBeLessThanOrEqual(4);
      expect(data.title).toContain('Rehberi');
    }
  });

  it('topic pages stay within Discord limits', () => {
    for (const topic of Object.keys(HELP_TOPIC_LABELS)) {
      expect(() => assertEmbedLimits(buildHelpEmbed('w', topic))).not.toThrow();
    }
  });

  it('unknown topic shows category list', () => {
    const embed = buildHelpEmbed('w', 'xyz');
    expect(embed.toJSON().title).toContain('Bilinmeyen');
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
