import type { Redis } from 'ioredis';
import { warnRedisDegradation } from '../utils/redis-degradation';

const MSG_DEDUP_PREFIX = 'msg:handled:';
const MSG_DEDUP_TTL_SEC = 120;

/** Ayni event loop icinde cift MessageCreate (await oncesi) icin senkron koruma. */
const localProcessing = new Set<string>();

/**
 * Senkron — handler'in ilk satirinda cagrilmali (await oncesi).
 */
export function tryAcquireLocalMessageLock(messageId: string): boolean {
  if (!messageId || localProcessing.has(messageId)) return false;
  localProcessing.add(messageId);
  setTimeout(() => localProcessing.delete(messageId), MSG_DEDUP_TTL_SEC * 1000);
  return true;
}

/**
 * Ayni Discord mesajinin iki kez islenmesini engeller (gateway tekrari / cift process).
 * true = ilk islem; false = zaten isleniyor veya islendi.
 */
export async function acquireMessageProcessingLock(
  redis: Redis,
  messageId: string,
): Promise<boolean> {
  if (!messageId) return true;
  try {
    const result = await redis.set(
      `${MSG_DEDUP_PREFIX}${messageId}`,
      '1',
      'EX',
      MSG_DEDUP_TTL_SEC,
      'NX',
    );
    return result === 'OK';
  } catch (err) {
    warnRedisDegradation('acquireMessageProcessingLock', err);
    return true;
  }
}
