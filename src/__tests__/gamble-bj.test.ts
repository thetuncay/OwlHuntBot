import { describe, expect, it } from 'vitest';
import {
  computeSoloBjNetDelta,
  computeSoloBjPayoutTotal,
} from '../systems/gamble/solo-blackjack';

describe('solo blackjack payouts', () => {
  const bet = 10_000;

  it('natural blackjack pays 2.2x gross', () => {
    expect(computeSoloBjPayoutTotal(bet, 'blackjack')).toBe(22_000);
    expect(computeSoloBjNetDelta(bet, 'blackjack')).toBe(12_000);
  });

  it('normal win pays 1.9x gross', () => {
    expect(computeSoloBjPayoutTotal(bet, 'win')).toBe(19_000);
    expect(computeSoloBjNetDelta(bet, 'win')).toBe(9_000);
  });

  it('push returns bet (net 0)', () => {
    expect(computeSoloBjPayoutTotal(bet, 'tie')).toBe(bet);
    expect(computeSoloBjNetDelta(bet, 'tie')).toBe(0);
  });

  it('lose returns 0 (net -bet after escrow)', () => {
    expect(computeSoloBjPayoutTotal(bet, 'lose')).toBe(0);
    expect(computeSoloBjNetDelta(bet, 'lose')).toBe(-bet);
  });
});
