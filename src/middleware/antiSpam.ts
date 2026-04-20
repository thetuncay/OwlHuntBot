import type { Redis } from 'ioredis';
import {
  COMMAND_RATE_LIMIT_TOKENS,
  COMMAND_RATE_LIMIT_WINDOW_SECONDS,
  SPAM_MUTE_SECONDS,
} from '../config';
import { consumeRateLimitToken } from '../utils/redis';

/**
 * Kullanici istek hizini kontrol eder ve gerekirse susturma uygular.
 * Redis erişilemezse sessizce geçer (availability > correctness).
 */
export async function enforceAntiSpam(redis: Redis, userId: string): Promise<void> {
  try {
    const muteKey = `mute:${userId}`;
    const muted = await redis.ttl(muteKey);
    if (muted > 0) {
      throw new Error(`Cok hizli komut kullaniyorsun. ${muted} sn sonra tekrar dene.`);
    }

    const bucketKey = `rate:${userId}`;
    const allowed = await consumeRateLimitToken(
      bucketKey,
      COMMAND_RATE_LIMIT_TOKENS,
      COMMAND_RATE_LIMIT_WINDOW_SECONDS,
    );

    if (!allowed) {
      await redis.set(muteKey, '1', 'EX', SPAM_MUTE_SECONDS);
      throw new Error(`Spam algilandi. ${SPAM_MUTE_SECONDS} sn susturuldun.`);
    }
  } catch (err) {
    // Spam/mute hataları yeniden fırlat, Redis bağlantı hatalarını yut
    if (err instanceof Error && (err.message.includes('hizli') || err.message.includes('Spam'))) {
      throw err;
    }
    // Redis down → geç, komutu engelleme
  }
}
