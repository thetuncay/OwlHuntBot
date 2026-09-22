import type { Redis } from 'ioredis';
import { warnRedisDegradation } from '../utils/redis-degradation';
import { rateLimitRedisKey, resolveCommandRateLimit, normalizeCommand } from './config';
import type { RateLimitResult } from './types';

const CONSUME_TOKEN_LUA = `
local bucketKey = KEYS[1]
local hardKey = KEYS[2]
local capacity = tonumber(ARGV[1])
local refillMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local hardCapacity = tonumber(ARGV[4])
local hardWindowMs = tonumber(ARGV[5])
local bucketTtlMs = tonumber(ARGV[6])

local tokensRaw = redis.call('HGET', bucketKey, 'tokens')
local lastRefillRaw = redis.call('HGET', bucketKey, 'lastRefill')
local tokens = tokensRaw and tonumber(tokensRaw) or capacity
local lastRefill = lastRefillRaw and tonumber(lastRefillRaw) or now

local elapsed = math.max(0, now - lastRefill)
local refillRate = capacity / refillMs
tokens = math.min(capacity, tokens + elapsed * refillRate)

if tokens < 1 then
  local retryAfterMs = math.ceil((1 - tokens) / refillRate)
  return {0, retryAfterMs, 'soft'}
end

tokens = tokens - 1
redis.call('HSET', bucketKey, 'tokens', tostring(tokens), 'lastRefill', tostring(now))
redis.call('PEXPIRE', bucketKey, bucketTtlMs)

local hardCount = redis.call('INCR', hardKey)
if hardCount == 1 then
  redis.call('PEXPIRE', hardKey, hardWindowMs)
end
if hardCount > hardCapacity then
  return {1, 0, 'hard_violation'}
end

return {1, 0, 'ok'}
`;

function parseLuaResult(raw: unknown): RateLimitResult {
  const parts = raw as [number, number, string];
  const allowed = parts[0] === 1;
  const retryAfterMs = parts[1] ?? 0;
  const level = parts[2] ?? 'ok';

  if (!allowed) {
    return {
      allowed: false,
      level: 'soft',
      retryAfterMs,
      command: 'unknown',
    };
  }

  if (level === 'hard_violation') {
    return { allowed: true, level: 'hard_violation', command: 'unknown' };
  }

  return { allowed: true, level: 'ok', command: 'unknown' };
}

export async function checkRateLimit(
  redis: Redis,
  userId: string,
  command: string,
): Promise<RateLimitResult> {
  const cfg = resolveCommandRateLimit(command);
  const key = rateLimitRedisKey(userId, command);
  const norm = normalizeCommand(command);
  const now = Date.now();

  try {
    const raw = await redis.eval(
      CONSUME_TOKEN_LUA,
      2,
      key,
      `${key}:hardwindow`,
      String(cfg.capacity),
      String(cfg.refillMs),
      String(now),
      String(cfg.hardCapacity),
      String(cfg.hardWindowMs),
      String(cfg.refillMs * 5),
    );

    const result = parseLuaResult(raw);
    return { ...result, command: norm };
  } catch (err) {
    warnRedisDegradation('anticheat.checkRateLimit', err);
    return { allowed: true, level: 'ok', command: norm };
  }
}
