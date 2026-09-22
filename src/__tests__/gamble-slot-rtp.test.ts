import { describe, expect, it } from 'vitest';
import { SLOT_TABLE } from '../config';
import { rollSlotOutcome, buildSlotReels, calcSlotCoinGain } from '../systems/gamble/slot-engine';
import { buildSlotLine, renderSlotSymbol, SLOT_EMOJI } from '../utils/slot-ux';

describe('slot RTP', () => {
  it('calcSlotCoinGain: x2 on 100 bet = +200, x0 = -100', () => {
    expect(calcSlotCoinGain(100, 2)).toBe(200);
    expect(calcSlotCoinGain(100, 4)).toBe(400);
    expect(calcSlotCoinGain(100, 9)).toBe(900);
    expect(calcSlotCoinGain(100, 0)).toBe(-100);
  });

  it('expected mean gain per bet is house-favored (negative edge)', () => {
    const expectedGainPerBet = SLOT_TABLE.reduce((sum, row) => {
      const mult = row.payout <= 0 ? -1 : row.payout;
      return sum + (row.chance / 100) * mult;
    }, 0);
    expect(expectedGainPerBet).toBeLessThan(0);
    expect(expectedGainPerBet).toBeGreaterThan(-0.5);
  });

  it('wins are triple; losses never show paying triple', () => {
    for (let i = 0; i < 400; i += 1) {
      const roll = rollSlotOutcome();
      const reels = buildSlotReels(roll.symbolKey);
      expect(reels).toHaveLength(3);

      if (roll.payout > 0) {
        expect(reels).toEqual([roll.symbolKey, roll.symbolKey, roll.symbolKey]);
      } else {
        const [a, b, c] = reels;
        const isPayingTriple =
          a === b && b === c && ['owl', 'diamond', 'coin'].includes(a);
        expect(isPayingTriple).toBe(false);
      }
    }
  });
});

describe('slot-ux', () => {
  it('renders custom emojis and rolling gif', () => {
    expect(renderSlotSymbol('owl')).toBe(SLOT_EMOJI.owl);
    expect(renderSlotSymbol('poop')).toBe(SLOT_EMOJI.poop);
    expect(buildSlotLine(['rolling', 'owl', 'empty'])).toContain(SLOT_EMOJI.rolling);
    expect(buildSlotLine(['owl', 'owl', 'owl'])).toContain(SLOT_EMOJI.owl);
  });
});
