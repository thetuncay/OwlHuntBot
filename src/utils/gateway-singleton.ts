import type { Redis } from 'ioredis';
import { warnRedisDegradation } from './redis-degradation';

const LOCK_TTL_SEC = 90;

function lockKey(shardId: number): string {
  return `bot:gateway:lock:${shardId}`;
}

function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code !== 'ESRCH';
  }
}

/**
 * Shard basina tek Discord gateway oturumu — yetim index.js sureclerini engeller.
 */
export async function acquireGatewaySessionLock(redis: Redis, shardId: number): Promise<boolean> {
  const key = lockKey(shardId);
  const pid = process.pid;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const acquired = await redis.set(key, String(pid), 'EX', LOCK_TTL_SEC, 'NX');
      if (acquired === 'OK') return true;

      const holderRaw = await redis.get(key);
      const holderPid = parseInt(holderRaw ?? '0', 10);
      if (holderPid === pid) return true;
      if (!isPidAlive(holderPid)) {
        await redis.del(key);
        continue;
      }
      return false;
    } catch (err) {
      warnRedisDegradation('acquireGatewaySessionLock', err);
      return true;
    }
  }

  return false;
}

export async function renewGatewaySessionLock(redis: Redis, shardId: number): Promise<void> {
  try {
    const key = lockKey(shardId);
    const holder = await redis.get(key);
    if (holder === String(process.pid)) {
      await redis.set(key, String(process.pid), 'EX', LOCK_TTL_SEC);
    }
  } catch (err) {
    warnRedisDegradation('renewGatewaySessionLock', err);
  }
}

export async function releaseGatewaySessionLock(redis: Redis, shardId: number): Promise<void> {
  try {
    const key = lockKey(shardId);
    const holder = await redis.get(key);
    if (holder === String(process.pid)) {
      await redis.del(key);
    }
  } catch (err) {
    warnRedisDegradation('releaseGatewaySessionLock', err);
  }
}
