import { describe, expect, it } from 'vitest';
import { parseMarketListingNoRef } from '../systems/market';

describe('parseMarketListingNoRef', () => {
  it('accepts plain listing numbers', () => {
    expect(parseMarketListingNoRef('16')).toBe(16);
    expect(parseMarketListingNoRef(' 42 ')).toBe(42);
  });

  it('rejects UUIDs (parseInt trap)', () => {
    expect(parseMarketListingNoRef('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });

  it('rejects partial numeric prefixes', () => {
    expect(parseMarketListingNoRef('16abc')).toBeNull();
  });
});
