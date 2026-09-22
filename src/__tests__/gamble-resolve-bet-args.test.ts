import { describe, expect, it } from 'vitest';
import {
  isAllBetToken,
  parseBetTokenFromArgs,
  resolveAllInBetAmount,
  resolveGambleBetFromToken,
} from '../systems/gamble/resolve-bet-args';
import { GAMBLE_MAX_BET } from '../config';

describe('resolveGambleBetFromToken', () => {
  it('recognizes all aliases', () => {
    expect(isAllBetToken('all')).toBe(true);
    expect(isAllBetToken('ALL')).toBe(true);
    expect(isAllBetToken('hepsi')).toBe(true);
    expect(isAllBetToken('tümü')).toBe(true);
  });

  it('bets full balance capped by max', () => {
    const coins = GAMBLE_MAX_BET + 10_000;
    expect(resolveAllInBetAmount(coins)).toBe(GAMBLE_MAX_BET);
    const result = resolveGambleBetFromToken('all', coins);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bet).toBe(GAMBLE_MAX_BET);
  });

  it('bets entire balance when below max', () => {
    const result = resolveGambleBetFromToken('all', 12_345);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bet).toBe(12_345);
  });

  it('rejects all when balance below minimum', () => {
    const result = resolveGambleBetFromToken('all', 50);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('below_minimum');
  });

  it('parses numeric token from args', () => {
    expect(parseBetTokenFromArgs(['@user', '500'])).toBe('500');
    expect(parseBetTokenFromArgs(['yazi', 'all'])).toBe('all');
    expect(parseBetTokenFromArgs(['bj'])).toBeUndefined();
  });
});
