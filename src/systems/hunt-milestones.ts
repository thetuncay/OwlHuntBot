/**
 * hunt-milestones.ts — Av serisi kilometre taşı (Redis-first)
 *
 * Her hunt +1. Hedef dolunca XP + kutu. Hareketsizlik = Redis TTL (sessiz).
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { LOOTBOX_DEF_MAP } from '../config';
import {
  HUNT_MILESTONE_APPROACH_THRESHOLD,
  HUNT_MILESTONE_BASE_GAP,
  HUNT_MILESTONE_FIRST_TARGET,
  HUNT_MILESTONE_GAP_GROWTH,
  HUNT_MILESTONE_INACTIVITY_SEC,
  HUNT_MILESTONE_LOOTBOX_ID,
  HUNT_MILESTONE_REDIS_PREFIX,
  HUNT_MILESTONE_SECOND_TARGET,
  HUNT_MILESTONE_WEAPON_EVERY,
  HUNT_MILESTONE_WEAPON_LOOTBOX_ID,
  HUNT_MILESTONE_XP_BASE,
  HUNT_MILESTONE_XP_MAX_MULT,
  HUNT_MILESTONE_XP_PER_TIER,
  HUNT_SERIES_XP_MULT_25,
  HUNT_SERIES_XP_MULT_50,
} from '../config/hunt-milestones';
import { HUNT_TYPICAL_XP } from '../config/hunt-flavor';
import { recordMilestoneClaim } from './engagement-metrics';
import { addInventoryItemInRedis } from '../state/player-state';
import { addXP } from './xp';

export interface HuntMilestoneState {
  count: number;
  nextTarget: number;
  /** Kaç kilometre taşı ödülü alındı (1 = 25 tamamlandı). */
  claimed: number;
}

export interface HuntMilestoneReward {
  target: number;
  xp: number;
  lootboxName: string;
  lootboxEmoji: string;
  lootboxQty: number;
  weaponName?: string;
  weaponEmoji?: string;
  weaponQty?: number;
}

export interface HuntMilestoneTickResult {
  count: number;
  nextTarget: number;
  /** Gösterim: `7/25` */
  progressLabel: string;
  reward: HuntMilestoneReward | null;
  /**
   * Kalan av sayısı `HUNT_MILESTONE_APPROACH_THRESHOLD` veya daha az ise `true`.
   * UX katmanı bu bayrağa göre vurgu / ince satır seçer (A2).
   * Ödül aynı hunt'ta patlarsa `false` — çünkü ödül satırı zaten görünüyor.
   */
  approaching: boolean;
  /** Yaklaşım için hedefe kalan av sayısı. `approaching=true` iken 1..threshold. */
  remaining: number;
}

function redisKey(userId: string): string {
  return `${HUNT_MILESTONE_REDIS_PREFIX}${userId}`;
}

/**
 * N kilometre taşı alındıktan sonraki hedef.
 * claimed=0 → 25; 1 → 50; 2 → 80; 3 → 115 …
 */
export function huntMilestoneTargetAfterClaims(claimed: number): number {
  if (claimed <= 0) return HUNT_MILESTONE_FIRST_TARGET;
  if (claimed === 1) return HUNT_MILESTONE_SECOND_TARGET;
  let target = HUNT_MILESTONE_SECOND_TARGET;
  for (let i = 2; i <= claimed; i++) {
    const gap = HUNT_MILESTONE_BASE_GAP + HUNT_MILESTONE_GAP_GROWTH * (i - 1);
    target += gap;
  }
  return target;
}

export function huntMilestoneXpForClaim(claimedAfter: number): number {
  const raw = HUNT_MILESTONE_XP_BASE + HUNT_MILESTONE_XP_PER_TIER * Math.max(0, claimedAfter - 1);
  const cap = HUNT_TYPICAL_XP * HUNT_MILESTONE_XP_MAX_MULT;
  return Math.min(raw, cap);
}

/**
 * Av serisi sayacına göre hunt XP çarpanı.
 *
 * @param count Av serisi sayacı (bu av dahil)
 */
export function huntSeriesXpMult(count: number): number {
  if (count >= HUNT_MILESTONE_SECOND_TARGET) return HUNT_SERIES_XP_MULT_50;
  if (count >= HUNT_MILESTONE_FIRST_TARGET) return HUNT_SERIES_XP_MULT_25;
  return 1;
}

/**
 * Av serisi XP çarpanını uygular.
 *
 * @param xp Ham XP
 * @param count Av serisi sayacı
 */
export function applyHuntSeriesXp(xp: number, count: number): number {
  if (xp <= 0) return xp;
  const mult = huntSeriesXpMult(count);
  if (mult <= 1) return xp;
  return Math.round(xp * mult);
}

export function buildHuntMilestoneReward(claimedAfter: number, target: number): HuntMilestoneReward {
  const ec = LOOTBOX_DEF_MAP[HUNT_MILESTONE_LOOTBOX_ID];
  const reward: HuntMilestoneReward = {
    target,
    xp: huntMilestoneXpForClaim(claimedAfter),
    lootboxName: ec?.name ?? 'Eşya Kutusu',
    lootboxEmoji: ec?.emoji ?? '🧰',
    lootboxQty: 1,
  };
  if (
    HUNT_MILESTONE_WEAPON_EVERY > 0
    && claimedAfter % HUNT_MILESTONE_WEAPON_EVERY === 0
  ) {
    const wc = LOOTBOX_DEF_MAP[HUNT_MILESTONE_WEAPON_LOOTBOX_ID];
    reward.weaponName = wc?.name ?? 'Silah Kutusu';
    reward.weaponEmoji = wc?.emoji ?? '⚔️';
    reward.weaponQty = 1;
  }
  return reward;
}

function parseState(raw: string | null): HuntMilestoneState {
  if (!raw) {
    return {
      count: 0,
      nextTarget: HUNT_MILESTONE_FIRST_TARGET,
      claimed: 0,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HuntMilestoneState>;
    const claimed = Math.max(0, Math.floor(Number(parsed.claimed) || 0));
    const nextTarget = Math.max(
      HUNT_MILESTONE_FIRST_TARGET,
      Math.floor(Number(parsed.nextTarget) || huntMilestoneTargetAfterClaims(claimed)),
    );
    const count = Math.max(0, Math.floor(Number(parsed.count) || 0));
    return { count, nextTarget, claimed };
  } catch {
    return {
      count: 0,
      nextTarget: HUNT_MILESTONE_FIRST_TARGET,
      claimed: 0,
    };
  }
}

/**
 * Bir av sonrası sayacı ilerletir; hedef dolunca ödül verir.
 * Sıfırlama sessiz (TTL / yok key).
 */
export async function tickHuntMilestone(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
): Promise<HuntMilestoneTickResult> {
  const key = redisKey(userId);
  const state = parseState(await redis.get(key));
  state.count += 1;

  let reward: HuntMilestoneReward | null = null;
  if (state.count >= state.nextTarget) {
    const hitTarget = state.nextTarget;
    state.claimed += 1;
    reward = buildHuntMilestoneReward(state.claimed, hitTarget);
    state.nextTarget = huntMilestoneTargetAfterClaims(state.claimed);

    await addXP(prisma, userId, reward.xp, 'huntMilestone', undefined, undefined, redis);
    await recordMilestoneClaim(redis).catch(() => undefined);
    await addInventoryItemInRedis(
      redis,
      userId,
      reward.lootboxName,
      'Lootbox',
      'Rare',
      reward.lootboxQty,
      prisma,
    );
    if (reward.weaponName && reward.weaponQty) {
      await addInventoryItemInRedis(
        redis,
        userId,
        reward.weaponName,
        'Lootbox',
        'Rare',
        reward.weaponQty,
        prisma,
      );
    }
  }

  await redis.set(key, JSON.stringify(state), 'EX', HUNT_MILESTONE_INACTIVITY_SEC);

  const remaining = Math.max(0, state.nextTarget - state.count);
  const approaching =
    reward === null
    && remaining > 0
    && remaining <= HUNT_MILESTONE_APPROACH_THRESHOLD;

  return {
    count: state.count,
    nextTarget: state.nextTarget,
    progressLabel: `${state.count}/${state.nextTarget}`,
    reward,
    approaching,
    remaining,
  };
}

/** Ödül satırı (milestone vurunca). */
export function formatHuntMilestoneRewardLine(reward: HuntMilestoneReward): string {
  const parts = [
    `🏁 Av serisi **${reward.target}**`,
    `+${reward.xp} XP`,
    `${reward.lootboxEmoji} ${reward.lootboxName}`,
  ];
  if (reward.weaponName && reward.weaponEmoji) {
    parts.push(`${reward.weaponEmoji} ${reward.weaponName}`);
  }
  return parts.join(' · ');
}
