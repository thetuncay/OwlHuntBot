import { describe, expect, it } from 'vitest';
import { rewardMultiplierFromTrust } from '../anticheat/reward-throttle';
import { resolvePunishmentTier } from '../anticheat/punishment-engine';

describe('anticheat reward throttle + punishment tier', () => {
  it('maps trust score to expected reward multipliers', () => {
    expect(rewardMultiplierFromTrust(90)).toBe(1);
    expect(rewardMultiplierFromTrust(60)).toBe(0.85);
    expect(rewardMultiplierFromTrust(40)).toBe(0.7);
    expect(rewardMultiplierFromTrust(20)).toBe(0.5);
  });

  it('computes escalating punishment tiers', () => {
    expect(resolvePunishmentTier(1)).toEqual({ tier: 1, durationSeconds: 0 });
    expect(resolvePunishmentTier(2)).toEqual({ tier: 2, durationSeconds: 900 });
    expect(resolvePunishmentTier(3)).toEqual({ tier: 3, durationSeconds: 3600 });
    expect(resolvePunishmentTier(4)).toEqual({ tier: 4, durationSeconds: 21600 });
    expect(resolvePunishmentTier(5)).toEqual({ tier: 5, durationSeconds: null });
  });
});
