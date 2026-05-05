import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
  // Bağlantı koptuğunda agresif yeniden bağlanmayı önle
  // Backoff: 50ms → 2000ms arası üstel artış
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  // Komut zaman aşımı: 3 saniye — takılı kalan komutları serbest bırakır
  commandTimeout: 3000,
  // Bağlantı havuzu: tek bağlantı yeterli (ioredis multiplexing yapar)
  // lazyConnect: true ile ilk komuta kadar bağlanmayı ertele
  lazyConnect: false,
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

// Lua script: atomik token bucket
// incr + expire race condition'ını önler, 2 call yerine 1 round-trip
const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count <= tonumber(ARGV[1]) then
  return 1
else
  return 0
end
`;

/**
 * Atomik token bucket kontrolu uygular.
 * Lua script ile race condition olmadan 1 round-trip'te tamamlanır.
 * limit asildiginda false dondurur.
 */
export async function consumeRateLimitToken(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const result = await redis.eval(
      RATE_LIMIT_LUA, 1, key, String(limit), String(windowSeconds),
    ) as number;
    return result === 1;
  } catch {
    // Redis down → izin ver
    return true;
  }
}
