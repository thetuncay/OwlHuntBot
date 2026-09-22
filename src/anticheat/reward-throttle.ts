import type { PrismaClient, Prisma } from '@prisma/client';
import { recordAnticheatEvent } from './audit-logger';

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultOn;
  if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no') return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

function isAnticheatEnabled(): boolean {
  return envFlag('ANTICHEAT_ENABLED', true);
}

function isThrottleEnforceEnabled(): boolean {
  return envFlag('ANTICHEAT_THROTTLE_ENFORCE', false);
}

export function rewardMultiplierFromTrust(trustScore: number): number {
  if (trustScore <= 20) return 0.5;
  if (trustScore <= 40) return 0.7;
  if (trustScore <= 60) return 0.85;
  return 1;
}

export interface RewardThrottleContext {
  userId: string;
  guildId?: string | null;
  rewardType: 'xp' | 'hunt_xp' | 'market_gain';
}

export async function applyRewardMultiplier(
  prisma: PrismaClient | Prisma.TransactionClient,
  ctx: RewardThrottleContext,
  baseReward: number,
): Promise<number> {
  if (!isAnticheatEnabled()) return baseReward;

  const trust = await prisma.anticheatTrust.findUnique({
    where: { userId: ctx.userId },
    select: { trustScore: true },
  });
  const trustScore = trust?.trustScore ?? 100;
  const multiplier = rewardMultiplierFromTrust(trustScore);
  if (multiplier >= 1) return baseReward;

  const throttled = Math.max(0, Math.floor(baseReward * multiplier));
  recordAnticheatEvent({
    userId: ctx.userId,
    guildId: ctx.guildId,
    eventType: 'reward_throttled',
    severity: 2,
    detail: {
      rewardType: ctx.rewardType,
      baseReward,
      simulatedReward: throttled,
      trustScore,
      multiplier,
      enforce: isThrottleEnforceEnabled(),
    },
  });

  return isThrottleEnforceEnabled() ? throttled : baseReward;
}
