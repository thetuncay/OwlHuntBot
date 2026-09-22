import Redis from 'ioredis';
import { warnRedisDegradation } from './redis-degradation';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const parsedRedis = new URL(redisUrl);
const redisPassword =
  process.env.REDIS_PASSWORD?.trim()
  || (parsedRedis.password ? decodeURIComponent(parsedRedis.password) : undefined);

export const redis = new Redis({
  host: parsedRedis.hostname || 'localhost',
  port: Number(parsedRedis.port) || 6379,
  ...(redisPassword ? { password: redisPassword } : {}),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  // Bağlantı koptuğunda agresif yeniden bağlanmayı önle
  // Backoff: 50ms → 2000ms arası üstel artış
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  // Komut zaman aşımı (varsayılan 5s) — takılı kalan komutları serbest bırakır
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS ?? '5000', 10),
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
  } catch (err) {
    warnRedisDegradation('consumeRateLimitToken', err);
    return true;
  }
}
