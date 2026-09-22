import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '../anticheat/rate-limiter';

function createAtomicRateRedisMock() {
  const hashStore = new Map<string, Record<string, string>>();
  const intStore = new Map<string, number>();

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

  return {
    eval: async (
      _script: string,
      _numKeys: number,
      bucketKey: string,
      hardKey: string,
      ...args: string[]
    ) => {
      const capacity = Number(args[0]);
      const refillMs = Number(args[1]);
      const now = Number(args[2]);
      const hardCapacity = Number(args[3]);
      const hardWindowMs = Number(args[4]);
      const bucketTtlMs = Number(args[5]);

      const tokensRaw = hashStore.get(bucketKey)?.tokens;
      const lastRefillRaw = hashStore.get(bucketKey)?.lastRefill;
      let tokens = tokensRaw ? parseFloat(tokensRaw) : capacity;
      let lastRefill = lastRefillRaw ? parseInt(lastRefillRaw, 10) : now;

      const elapsed = Math.max(0, now - lastRefill);
      const refillRate = capacity / refillMs;
      tokens = Math.min(capacity, tokens + elapsed * refillRate);

      if (tokens < 1) {
        const retryAfterMs = Math.ceil((1 - tokens) / refillRate);
        return [0, retryAfterMs, 'soft'];
      }

      tokens -= 1;
      hashStore.set(bucketKey, {
        tokens: String(tokens),
        lastRefill: String(now),
      });
      void bucketTtlMs;

      const hardCount = (intStore.get(hardKey) ?? 0) + 1;
      intStore.set(hardKey, hardCount);
      void hardWindowMs;

      if (hardCount > hardCapacity) {
        return [1, 0, 'hard_violation'];
      }

      return [1, 0, 'ok'];
    },
  };
}

describe('anticheat rate limiter (atomic)', () => {
  it('blocks immediate second hunt command with soft limit', async () => {
    const redis = createAtomicRateRedisMock();
    const first = await checkRateLimit(redis as any, 'u1', 'hunt');
    const second = await checkRateLimit(redis as any, 'u1', 'hunt');

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.level).toBe('soft');
    expect((second.retryAfterMs ?? 0) > 0).toBe(true);
  });

  it('allows only one concurrent consume under parallel calls', async () => {
    const redis = createAtomicRateRedisMock();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => checkRateLimit(redis as any, 'u-parallel', 'hunt')),
    );
    const allowed = results.filter((r) => r.allowed);
    expect(allowed).toHaveLength(1);
  });
});
