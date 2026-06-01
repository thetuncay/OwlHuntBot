import { describe, expect, it } from 'vitest';
import {
  acquireUserResponse,
  acquireInFlightAction,
  deriveSuppressionKeyFromError,
  releaseInFlightAction,
  sweepResponseSuppression,
  SuppressionKeys,
  isResponseSuppressed,
} from '../utils/response-suppression';

describe('response-suppression', () => {
  it('allows first response then suppresses identical key', () => {
    const scope = { userId: 'u1', guildId: 'g1', key: SuppressionKeys.usage('vs'), ttlMs: 60_000 };
    expect(acquireUserResponse(scope)).toBe(true);
    expect(acquireUserResponse(scope)).toBe(false);
    expect(isResponseSuppressed(scope)).toBe(true);
  });

  it('allows again after TTL expires', () => {
    const scope = { userId: 'u2', guildId: 'g1', key: 'usage:test', ttlMs: 1 };
    expect(acquireUserResponse(scope)).toBe(true);
    expect(acquireUserResponse(scope)).toBe(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        sweepResponseSuppression();
        expect(acquireUserResponse(scope)).toBe(true);
        resolve();
      }, 15);
    });
  });

  it('derives stable keys from usage errors', () => {
    const err = new Error('❌ **Kullanım:** owl vs @oyuncu');
    expect(deriveSuppressionKeyFromError(err)).toBe(SuppressionKeys.usage('vs', 'help'));
  });

  it('isolates users and guilds', () => {
    const key = SuppressionKeys.usage('hunt');
    expect(acquireUserResponse({ userId: 'a', guildId: 'g1', key })).toBe(true);
    expect(acquireUserResponse({ userId: 'b', guildId: 'g1', key })).toBe(true);
    expect(acquireUserResponse({ userId: 'a', guildId: 'g2', key })).toBe(true);
    expect(acquireUserResponse({ userId: 'a', guildId: 'g1', key })).toBe(false);
  });

  it('blocks concurrent in-flight duplicate actions', () => {
    const scope = { userId: 'u3', guildId: 'g1', key: SuppressionKeys.state('cf-solo-inflight'), ttlMs: 5_000 };
    expect(acquireInFlightAction(scope)).toBe(true);
    expect(acquireInFlightAction(scope)).toBe(false);
    releaseInFlightAction(scope);
    expect(acquireInFlightAction(scope)).toBe(true);
  });
});
