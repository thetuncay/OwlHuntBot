/**
 * flow-inflight.ts — Redis-backed in-flight gate (cross-process).
 */
import type { Redis } from 'ioredis';
import { COMMAND_INFLIGHT_TTL_MS } from '../config';
import { warnRedisDegradation } from '../utils/redis-degradation';

const INFLIGHT_PREFIX = 'flow:inflight:';

function inflightKey(userId: string, sub: string): string {
  return `${INFLIGHT_PREFIX}${userId}:${sub}`;
}

/**
 * Redis NX in-flight — PM2 cok process icin.
 * true = kilit alindi; false = baska process/islem devam ediyor.
 */
export async function acquireRedisInFlight(
  redis: Redis,
  userId: string,
  sub: string,
  ttlMs = COMMAND_INFLIGHT_TTL_MS,
): Promise<boolean> {
  try {
    const key = inflightKey(userId, sub);
    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    const result = await redis.set(key, '1', 'EX', ttlSec, 'NX');
    return result === 'OK';
  } catch (err) {
    warnRedisDegradation('acquireRedisInFlight', err);
    return true;
  }
}

export async function releaseRedisInFlight(
  redis: Redis,
  userId: string,
  sub: string,
): Promise<void> {
  try {
    await redis.del(inflightKey(userId, sub));
  } catch (err) {
    warnRedisDegradation('releaseRedisInFlight', err);
  }
}
