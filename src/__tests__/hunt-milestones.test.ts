import { describe, expect, it, vi } from 'vitest';

vi.mock('../systems/xp', () => ({
  addXP: vi.fn(async () => ({ currentLevel: 1, currentXP: 0, levelUp: null })),
}));

vi.mock('../state/player-state', () => ({
  addInventoryItemInRedis: vi.fn(async () => undefined),
}));

import {
  buildHuntMilestoneReward,
  huntMilestoneTargetAfterClaims,
  huntMilestoneXpForClaim,
  tickHuntMilestone,
} from '../systems/hunt-milestones';
import { buildFinalMessage, type CompressedHunt } from '../utils/hunt-ux';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';
import { HUNT_MILESTONE_APPROACH_THRESHOLD } from '../config/hunt-milestones';

/** Minimal Redis stub — hunt-milestones sadece get/set kullanır. */
function makeRedis(initialState?: unknown) {
  const store = new Map<string, string>();
  if (initialState !== undefined) {
    store.set(
      'hunt:milestone:test-user',
      typeof initialState === 'string' ? initialState : JSON.stringify(initialState),
    );
  }
  return {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
  } as any;
}

describe('huntMilestoneTargetAfterClaims', () => {
  it('follows 25 → 50 → growing gaps', () => {
    expect(huntMilestoneTargetAfterClaims(0)).toBe(25);
    expect(huntMilestoneTargetAfterClaims(1)).toBe(50);
    expect(huntMilestoneTargetAfterClaims(2)).toBe(80); // +30
    expect(huntMilestoneTargetAfterClaims(3)).toBe(115); // +35
    expect(huntMilestoneTargetAfterClaims(4)).toBe(155); // +40
  });
});

describe('huntMilestone rewards', () => {
  it('scales xp and adds weapon every 3rd claim', () => {
    expect(huntMilestoneXpForClaim(1)).toBe(80);
    expect(huntMilestoneXpForClaim(2)).toBe(120);
    expect(huntMilestoneXpForClaim(5)).toBe(140);
    const r1 = buildHuntMilestoneReward(1, 25);
    expect(r1.weaponName).toBeUndefined();
    const r3 = buildHuntMilestoneReward(3, 80);
    expect(r3.weaponName).toBeTruthy();
  });
});

describe('buildFinalMessage milestone line', () => {
  it('appends subtle progress and reward', () => {
    const compressed: CompressedHunt = {
      groups: [],
      totalXP: 10,
      totalValue: 0,
      hasCritical: false,
      hasRareCatch: false,
      levelUp: null,
      isEmpty: true,
      huntMilestoneProgress: '7/25',
      huntMilestoneRewardLine: '🏁 Av serisi **25** · +80 XP · 🧰 Eşya Kutusu',
    };
    const msg = buildFinalMessage('Efe', compressed);
    expect(msg).toContain('Av serisi **7/25**');
    expect(msg).toContain('Av serisi **25**');
    expect(msg).toContain(`${XP_EMOJI} **XP: 10**`);
    expect(msg).toContain(COIN_EMOJI);
  });

  it('A2: highlights approach when milestone is close (approaching=true)', () => {
    const compressed: CompressedHunt = {
      groups: [],
      totalXP: 5,
      totalValue: 0,
      hasCritical: false,
      hasRareCatch: false,
      levelUp: null,
      isEmpty: true,
      huntMilestoneProgress: '23/25',
      huntMilestoneApproaching: true,
    };
    const msg = buildFinalMessage('Efe', compressed);
    // Yaklaşım vurgusu: flag emoji + "yakında ödül" cümlesi
    expect(msg).toContain('🏁 Av serisi **23/25** · yakında ödül');
    // Aynı satırda iki farklı format olmamalı (sadece bir milestone satırı)
    expect(msg.match(/Av serisi/g)?.length).toBe(1);
  });

  it('A2: uses subtle line when approaching=false (far from milestone)', () => {
    const compressed: CompressedHunt = {
      groups: [],
      totalXP: 5,
      totalValue: 0,
      hasCritical: false,
      hasRareCatch: false,
      levelUp: null,
      isEmpty: true,
      huntMilestoneProgress: '7/25',
      huntMilestoneApproaching: false,
    };
    const msg = buildFinalMessage('Efe', compressed);
    expect(msg).toContain('┃ Av serisi **7/25**');
    // Yaklaşım vurgusu olmamalı
    expect(msg).not.toContain('yakında ödül');
    expect(msg.match(/Av serisi/g)?.length).toBe(1);
  });

  it('shows series XP bonus on the same block line', () => {
    const compressed: CompressedHunt = {
      groups: [],
      totalXP: 5,
      totalValue: 0,
      hasCritical: false,
      hasRareCatch: false,
      levelUp: null,
      isEmpty: true,
      huntMilestoneProgress: '25/50',
      huntMilestoneApproaching: false,
      huntSeriesXpBonusPct: 5,
    };
    const msg = buildFinalMessage('Efe', compressed);
    expect(msg).toContain('┃ Av serisi **25/50** · +%5 XP');
    expect(msg.match(/Av serisi/g)?.length).toBe(1);
  });
});

describe('tickHuntMilestone.approaching (A2 system side)', () => {
  it('approaching=false when far from target', async () => {
    // count=6, next=25 → remaining=19, threshold=3 → approaching=false
    const redis = makeRedis({ count: 6, nextTarget: 25, claimed: 0 });
    const res = await tickHuntMilestone(redis, {} as any, 'test-user');
    expect(res.count).toBe(7);
    expect(res.remaining).toBe(18);
    expect(res.approaching).toBe(false);
  });

  it('approaching=true when remaining <= threshold', async () => {
    const beforeCount = 25 - HUNT_MILESTONE_APPROACH_THRESHOLD; // remaining olur 2
    const redis = makeRedis({ count: beforeCount, nextTarget: 25, claimed: 0 });
    const res = await tickHuntMilestone(redis, {} as any, 'test-user');
    expect(res.remaining).toBe(HUNT_MILESTONE_APPROACH_THRESHOLD - 1);
    expect(res.approaching).toBe(true);
  });

  it('approaching=false when reward triggers (ödül satırı vurgunun yerine geçer)', async () => {
    // count=24 → +1 = 25 = target → reward fire
    const redis = makeRedis({ count: 24, nextTarget: 25, claimed: 0 });
    const res = await tickHuntMilestone(redis, {} as any, 'test-user');
    expect(res.reward).not.toBeNull();
    expect(res.approaching).toBe(false); // ödül var, ekstra vurguya gerek yok
  });
});
