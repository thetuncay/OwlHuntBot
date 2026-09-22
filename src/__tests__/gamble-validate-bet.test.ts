import { describe, expect, it } from 'vitest';
import { validateGambleBet } from '../systems/gamble/validate-bet';

describe('validateGambleBet', () => {
  const base = { playerCoins: 10_000, minBet: 100, maxBet: 5_000 };

  it('rejects negative bet', () => {
    expect(validateGambleBet(-50, base).ok).toBe(false);
    expect(validateGambleBet(-50, base).code).toBe('not_positive');
  });

  it('rejects float bet', () => {
    expect(validateGambleBet(100.5, base).ok).toBe(false);
    expect(validateGambleBet(100.5, base).code).toBe('not_integer');
  });

  it('rejects zero bet', () => {
    expect(validateGambleBet(0, base).ok).toBe(false);
    expect(validateGambleBet(0, base).code).toBe('not_positive');
  });

  it('allows all-in when bet equals coins', () => {
    const result = validateGambleBet(10_000, { ...base, maxBet: 100_000 });
    expect(result.ok).toBe(true);
    expect(result.bet).toBe(10_000);
  });

  it('rejects overflow beyond safe integer', () => {
    const result = validateGambleBet(Number.MAX_SAFE_INTEGER + 1, base);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('not_integer');
  });

  it('rejects bet above max', () => {
    expect(validateGambleBet(9_000, base).code).toBe('above_maximum');
  });

  it('rejects insufficient balance', () => {
    expect(validateGambleBet(4_000, { ...base, playerCoins: 3_000, maxBet: 10_000 }).code).toBe('insufficient_balance');
  });

  it('accepts valid bet', () => {
    const result = validateGambleBet(500, base);
    expect(result.ok).toBe(true);
    expect(result.bet).toBe(500);
  });

  it('uses GAMBLE_MIN_BET default (100)', () => {
    expect(validateGambleBet(99, { playerCoins: 10_000 }).code).toBe('below_minimum');
    expect(validateGambleBet(100, { playerCoins: 10_000 }).ok).toBe(true);
  });
});
