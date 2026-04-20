import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
});

redis.on('error', (error: Error) => {
  console.error('[Redis] Baglanti hatasi:', error.message);
});

/**
 * Redis baglantisini dogrular.
 */
export async function assertRedisConnection(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== 'PONG') {
    throw new Error('Redis ping basarisiz.');
  }
}

/**
 * Basit token bucket kontrolu uygular.
 * limit asildiginda false dondurur.
 */
export async function consumeRateLimitToken(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count <= limit;
}
