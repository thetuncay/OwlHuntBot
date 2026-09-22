import type { Redis } from 'ioredis';
import { GAMBLE_BJ_SOLO_REDIS_PREFIX, GAMBLE_BJ_SOLO_TTL_SEC } from '../../config';

export interface SoloBjCard {
  rank: string;
  suit: string;
  value: number;
}

export interface SoloBjSession {
  userId: string;
  bet: number;
  settlementId: string;
  username: string;
  playerHand: SoloBjCard[];
  dealerHand: SoloBjCard[];
  deck: SoloBjCard[];
  createdAt: number;
}

export function soloBjSessionKey(userId: string): string {
  return `${GAMBLE_BJ_SOLO_REDIS_PREFIX}${userId}`;
}

export async function saveSoloBjSession(redis: Redis, session: SoloBjSession): Promise<void> {
  await redis.set(
    soloBjSessionKey(session.userId),
    JSON.stringify(session),
    'EX',
    GAMBLE_BJ_SOLO_TTL_SEC,
  );
}

export async function loadSoloBjSession(redis: Redis, userId: string): Promise<SoloBjSession | null> {
  const raw = await redis.get(soloBjSessionKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SoloBjSession;
  } catch {
    return null;
  }
}

export async function clearSoloBjSession(redis: Redis, userId: string): Promise<void> {
  await redis.del(soloBjSessionKey(userId));
}

export async function refreshSoloBjSessionTtl(redis: Redis, userId: string): Promise<void> {
  await redis.expire(soloBjSessionKey(userId), GAMBLE_BJ_SOLO_TTL_SEC);
}
