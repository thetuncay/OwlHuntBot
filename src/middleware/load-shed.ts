import type { Redis } from 'ioredis';
import { MAX_CONCURRENT_COMMANDS, COMMAND_GATE_TTL_SECONDS } from '../config';
import { recordAbuseSignal } from '../ops/abuse-analytics';
import { INCR_EXPIRE_SCRIPT, SAFE_DECR_SCRIPT } from '../utils/redis-scripts';

const INFLIGHT_KEY = 'gate:commands:inflight';

export async function acquireCommandSlot(redis: Redis): Promise<() => Promise<void>> {
  const inflight = Number(
    await redis.eval(INCR_EXPIRE_SCRIPT, 1, INFLIGHT_KEY, String(COMMAND_GATE_TTL_SECONDS)),
  );

  if (inflight > MAX_CONCURRENT_COMMANDS) {
    recordAbuseSignal(redis, 'gate_rejected');
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
