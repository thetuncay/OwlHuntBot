import type { Redis } from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import { clamp } from '../../utils/math';
import { runDetached } from '../../utils/async';
import { isNewbieActive } from '../newbie-boost';
import { getChurnScore, type ChurnScore } from './churn-score';
import { consumeReturnBonusUse } from './player-activity';

const RETENTION_HUNT_BONUS = { safe: 0, at_risk: 0.03, churning: 0.06 } as const;
const RETENTION_GAMBLE_BONUS = { safe: 0, at_risk: 0.02, churning: 0.04 } as const;
const RETENTION_TAME_BONUS = { safe: 0, at_risk: 0.03, churning: 0.05 } as const;
const RETENTION_RETURN_EXTRA = 0.02 as const;

/** Hunt retention bonus tavanı (eski pity tavanı × 1.5 ile aynı). */
const RETENTION_HUNT_MAX = 0.375;
const RETENTION_GAMBLE_MAX = 0.06;
const RETENTION_TAME_MAX = 0.07;

function applyReturnExtra(churn: ChurnScore, base: number): number {
  return churn.returnBonus ? base + RETENTION_RETURN_EXTRA : base;
}

export function getHuntRetentionBonus(churn: ChurnScore): number {
  const base = RETENTION_HUNT_BONUS[churn.tier];
  const withReturn = applyReturnExtra(churn, base);
  return clamp(0, RETENTION_HUNT_MAX, withReturn);
}

export function getGambleRetentionBonus(churn: ChurnScore): number {
  const base = RETENTION_GAMBLE_BONUS[churn.tier];
  const withReturn = applyReturnExtra(churn, base);
  return clamp(0, RETENTION_GAMBLE_MAX, withReturn);
}

export function getTameRetentionBonus(churn: ChurnScore): number {
  const base = RETENTION_TAME_BONUS[churn.tier];
  const withReturn = applyReturnExtra(churn, base);
  return clamp(0, RETENTION_TAME_MAX, withReturn);
}

async function resolveBonus(
  kind: 'hunt' | 'gamble' | 'tame',
  redis: Redis,
  playerId: string,
): Promise<number> {
  const churn = await getChurnScore(redis, playerId);
  if (churn.returnBonus) {
    runDetached('pa-consume', () => consumeReturnBonusUse(redis, playerId));
  }
  if (kind === 'hunt') return getHuntRetentionBonus(churn);
  if (kind === 'gamble') return getGambleRetentionBonus(churn);
  return getTameRetentionBonus(churn);
}

export async function getRetentionBonusSafe(
  kind: 'hunt' | 'gamble' | 'tame',
  redis: Redis,
  playerId: string,
  prisma?: PrismaClient,
  createdAt?: Date | null,
): Promise<number> {
  try {
    let known = createdAt ?? null;
    if (!known && prisma) {
      const row = await prisma.player.findUnique({
        where: { id: playerId },
        select: { createdAt: true },
      });
      known = row?.createdAt ?? null;
    }
    if (known && isNewbieActive(known)) return 0;
    return await resolveBonus(kind, redis, playerId);
  } catch {
    return 0;
  }
}

export async function getGambleRetentionBonusSafe(
  redis: Redis,
  playerId: string,
  prisma?: PrismaClient,
): Promise<number> {
  return getRetentionBonusSafe('gamble', redis, playerId, prisma);
}
