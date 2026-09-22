import type { Redis } from 'ioredis';
import type { ActivitySnapshot } from './player-activity';
import { getPlayerActivitySnapshot } from './player-activity';

const SCORE_CACHE_TTL_SEC = 3 * 60;

export interface ChurnScore {
  score: number;
  tier: 'safe' | 'at_risk' | 'churning';
  returnBonus: boolean;
}

function scoreCacheKey(playerId: string): string {
  return `pa:${playerId}:scoreCache`;
}

export function calculateChurnScore(snapshot: ActivitySnapshot): ChurnScore {
  let base = 0;
  if (snapshot.returnGapDays <= 1) base = 0;
  else if (snapshot.returnGapDays <= 3) base = 30;
  else if (snapshot.returnGapDays <= 6) base = 55;
  else base = 75;

  let trendModifier = 0;
  if (snapshot.weeklyTrend === 'dormant') trendModifier = 20;
  else if (snapshot.weeklyTrend === 'declining') trendModifier = 15;

  let lossModifier = 0;
  if (snapshot.sessionLossCount >= 10) lossModifier = 20;
  else if (snapshot.sessionLossCount >= 5) lossModifier = 10;

  const score = Math.min(100, base + trendModifier + lossModifier);

  let tier: ChurnScore['tier'] = 'safe';
  if (score >= 60) tier = 'churning';
  else if (score >= 30) tier = 'at_risk';

  return {
    score,
    tier,
    returnBonus: snapshot.returnBonusActive,
  };
}

export async function getChurnScore(redis: Redis, playerId: string): Promise<ChurnScore> {
  try {
    const cached = await redis.get(scoreCacheKey(playerId));
    if (cached) {
      return JSON.parse(cached) as ChurnScore;
    }
  } catch {
    /* recompute */
  }

  const snapshot = await getPlayerActivitySnapshot(redis, playerId);
  const churn = calculateChurnScore(snapshot);

  try {
    await redis.set(scoreCacheKey(playerId), JSON.stringify(churn), 'EX', SCORE_CACHE_TTL_SEC);
  } catch {
    /* fail-open */
  }

  return churn;
}
