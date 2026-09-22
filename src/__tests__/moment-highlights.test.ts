import { describe, expect, it } from 'vitest';
import { MOMENT_HIGHLIGHTS, momentMarker } from '../config/moment-highlights';
import { rarityDot, rarityRank } from '../utils/theme';

describe('moment highlights (L3)', () => {
  it('tanımlı her an tipi için işaret ve renk verir', () => {
    for (const [kind, highlight] of Object.entries(MOMENT_HIGHLIGHTS)) {
      expect(highlight.marker, kind).not.toBe('');
      expect(highlight.color, kind).toBeGreaterThan(0);
    }
  });

  it('havuz küçük kalır — vurgu enflasyonu olmasın', () => {
    expect(Object.keys(MOMENT_HIGHLIGHTS).length).toBeLessThanOrEqual(4);
  });

  it('momentMarker config ile aynı işareti döner', () => {
    expect(momentMarker('legendary')).toBe(MOMENT_HIGHLIGHTS.legendary.marker);
    expect(momentMarker('rare-prey')).toBe(MOMENT_HIGHLIGHTS['rare-prey'].marker);
  });
});

describe('rarity yardımcıları', () => {
  it('bilinmeyen rarity yaygın sayılır', () => {
    expect(rarityDot('Bilinmeyen')).toBe(rarityDot('Common'));
    expect(rarityRank('Bilinmeyen')).toBe(0);
  });

  it('nadirlik sıralaması artan şekilde tanımlı', () => {
    expect(rarityRank('Legendary')).toBeGreaterThan(rarityRank('Epic'));
    expect(rarityRank('Epic')).toBeGreaterThan(rarityRank('Rare'));
    expect(rarityRank('Rare')).toBeGreaterThan(rarityRank('Common'));
  });
});
