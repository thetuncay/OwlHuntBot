import { describe, expect, it } from 'vitest';
import {
  buildBlackjackResultNote,
  buildRewardClaimMessage,
  formatResultLevelLine,
  formatSignedCoinLine,
  formatSignedRewardLine,
  RESULT_COL,
} from '../utils/result-ux';

describe('result-ux v2.0 theme', () => {
  it('RESULT_COL pipe prefix', () => {
    expect(RESULT_COL).toBe('┃');
    expect(formatSignedCoinLine(130)).toContain('+130 Coin');
    expect(formatSignedCoinLine(130).startsWith('┃ ')).toBe(true);
  });

  it('formatSignedRewardLine', () => {
    const line = formatSignedRewardLine(67, 130);
    expect(line).toContain('+67 XP');
    expect(line).toContain('+130 Coin');
    expect(line.startsWith('┃ ')).toBe(true);
  });

  it('formatResultLevelLine uses ▰ bar', () => {
    const line = formatResultLevelLine(12, 11060);
    expect(line).toContain('Lv.12');
    expect(line).toMatch(/▰|▱/);
    expect(line).not.toContain('%');
  });

  it('buildBlackjackResultNote', () => {
    const note = buildBlackjackResultNote('win', 500, 5500);
    expect(note).toContain('Kazandın');
    expect(note).toContain('+500 Coin');
    expect(note).not.toContain('KAZANDIN');
  });

  it('buildRewardClaimMessage', () => {
    const msg = buildRewardClaimMessage({
      headline: '📅 Ali, günlük ödülünü aldı.',
      sections: [{ label: '🔥 Seri', lines: ['Gün 3'] }],
      xp: 100,
      coin: 250,
      level: 5,
      currentXp: 400,
    });
    expect(msg).toContain('📅 Ali');
    expect(msg).toContain('┃ 🔥 Seri');
    expect(msg).toContain('Lv.5');
  });
});
