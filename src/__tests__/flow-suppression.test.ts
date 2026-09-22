import { describe, expect, it } from 'vitest';
import { acquireUserResponse, SuppressionKeys } from '../utils/response-suppression';
import { FLOW_SUPPRESSION_MIN_INTERVAL_MS } from '../config';

describe('response suppression v2.1', () => {
  it('allows repeat after min interval window', () => {
    const scope = {
      userId: 'u1',
      guildId: 'g1',
      key: SuppressionKeys.cooldown('hunt'),
      ttlMs: 60_000,
    };
    expect(acquireUserResponse(scope)).toBe(true);
    expect(acquireUserResponse(scope)).toBe(false);
  });

  it('never suppresses intent-exempt keys', () => {
    const scope = { userId: 'u1', guildId: 'g1', key: 'intent:lost' };
    expect(acquireUserResponse(scope)).toBe(true);
    expect(acquireUserResponse(scope)).toBe(true);
  });

  it('uses 15s min interval by default config', () => {
    expect(FLOW_SUPPRESSION_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(15_000);
  });
});
