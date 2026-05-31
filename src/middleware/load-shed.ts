import type { Redis } from 'ioredis';
import { MAX_CONCURRENT_COMMANDS, COMMAND_GATE_TTL_SECONDS } from '../config';

const INFLIGHT_KEY = 'gate:commands:inflight';
const SAFE_DECR_SCRIPT = `
local value = redis.call("decr", KEYS[1])
if value < 0 then
  redis.call("set", KEYS[1], 0)
  return 0
end
return value
`;

export async function acquireCommandSlot(redis: Redis): Promise<() => Promise<void>> {
  const inflight = await redis.incr(INFLIGHT_KEY);
  if (inflight === 1) {
    await redis.expire(INFLIGHT_KEY, COMMAND_GATE_TTL_SECONDS);
  }

  if (inflight > MAX_CONCURRENT_COMMANDS) {
    await redis.eval(SAFE_DECR_SCRIPT, 1, INFLIGHT_KEY);
    throw new Error('⚠️ Sistem şu an çok yoğun. Lütfen 1-2 saniye sonra tekrar dene.');
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await redis.eval(SAFE_DECR_SCRIPT, 1, INFLIGHT_KEY);
  };
}
