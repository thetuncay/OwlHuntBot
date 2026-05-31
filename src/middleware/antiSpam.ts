import type { Redis } from 'ioredis';
import {
  COMMAND_RATE_LIMIT_TOKENS,
  COMMAND_RATE_LIMIT_WINDOW_SECONDS,
  SPAM_MUTE_SECONDS,
} from '../config';
import { buildSpamMuteMessage, SpamBlockedError } from '../utils/command-error';
import { consumeRateLimitToken } from '../utils/redis';

/**
 * Kullanici istek hizini kontrol eder ve gerekirse susturma uygular.
 * Zaten susturulmus kullanicilar sessizce reddedilir (performans).
 * Yeni susturma: OwO tarzi relative timestamp mesaji (<t:unix:R>).
 */
export async function enforceAntiSpam(
  redis: Redis,
  userId: string,
  displayName = 'Sen',
): Promise<void> {
  try {
    const muteKey = `mute:${userId}`;
    const mutedTtl = await redis.ttl(muteKey);
    if (mutedTtl > 0) {
      throw new SpamBlockedError('', true);
    }

    const bucketKey = `rate:${userId}`;
    const allowed = await consumeRateLimitToken(
      bucketKey,
      COMMAND_RATE_LIMIT_TOKENS,
      COMMAND_RATE_LIMIT_WINDOW_SECONDS,
    );

    if (!allowed) {
      await redis.set(muteKey, '1', 'EX', SPAM_MUTE_SECONDS);
      throw new SpamBlockedError(
        buildSpamMuteMessage(displayName, SPAM_MUTE_SECONDS),
        false,
      );
    }
  } catch (err) {
    if (err instanceof SpamBlockedError) throw err;
    throw new Error(
      '⚠️ Sistem su an yogunluk nedeniyle kapali (Redis Error). Lutfen az sonra tekrar dene.',
    );
  }
}
