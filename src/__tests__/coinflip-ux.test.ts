import { describe, expect, it } from 'vitest';
import {
  COIN_SPIN_EMOJI,
  buildCoinFlipResultText,
  buildCoinFlipSpinText,
  buildPvpCoinFlipSpinText,
  displayFace,
  oppositeFace,
  parseCoinChoice,
} from '../utils/coinflip-ux';

describe('coinflip-ux', () => {
  it('spin text includes CoinSpin gif', () => {
    expect(buildCoinFlipSpinText(500, 'Test', 'heads')).toContain(COIN_SPIN_EMOJI);
    expect(buildPvpCoinFlipSpinText('A', 'B', 100)).toContain(COIN_SPIN_EMOJI);
  });
  it('parseCoinChoice accepts Turkish and English', () => {
    expect(parseCoinChoice('yazı')).toBe('heads');
    expect(parseCoinChoice('TURA')).toBe('tails');
    expect(parseCoinChoice('heads')).toBe('heads');
    expect(parseCoinChoice('invalid')).toBeUndefined();
  });

  it('result keeps spin line and appends win/lose on the same gif line', () => {
    const win = buildCoinFlipResultText({
      bet: 100, playerName: 'Tuncay', win: true, resultFace: 'heads', choice: 'heads', deltaCoins: 130,
    });
    expect(win).toContain(`Para dönüyor… ${COIN_SPIN_EMOJI} ve YAZI KAZANDIN!!`);
    expect(win.split('\n')).toHaveLength(2);
    const lose = buildCoinFlipResultText({
      bet: 100, playerName: 'Tuncay', win: false, resultFace: 'tails', choice: 'heads', deltaCoins: -100,
    });
    expect(lose).toContain(`Para dönüyor… ${COIN_SPIN_EMOJI} ve hepsini KAYBETTİN :<`);
  });
});
