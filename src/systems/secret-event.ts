/**
 * secret-event.ts — Av defteri tamamlanınca bir kez (K3).
 *
 * Spoiler'a dayanıklı: tekrar tetiklenmez. Ödül kozmetik unvan + tek satır.
 */

import type { Redis } from 'ioredis';
import { grantCosmeticTitle } from './cosmetics';

const CLAIM_PREFIX = 'secret:fulldex:';

export interface SecretDexEvent {
  line: string;
}

/**
 * Defter ilk kez tamamlandıysa gizli olayı işler.
 *
 * @param redis Redis
 * @param userId Oyuncu
 * @param complete Defter dolu mu
 */
export async function maybeClaimFullDexSecret(
  redis: Redis,
  userId: string,
  complete: boolean,
): Promise<SecretDexEvent | null> {
  if (!complete) return null;
  const ok = await redis.set(`${CLAIM_PREFIX}${userId}`, '1', 'EX', 365 * 24 * 60 * 60, 'NX');
  if (ok !== 'OK') return null;
  await grantCosmeticTitle(redis, userId, 'defter');
  return {
    line: '🗝️ Orman defteri bitti — bu av senin hakkın!.',
  };
}
