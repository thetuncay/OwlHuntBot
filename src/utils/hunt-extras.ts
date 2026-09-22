/**
 * hunt-extras.ts — Hunt mesajına eklenen kısa satırlar.
 *
 * owl-hunt şişmesin diye flavor / keşif / onboarding burada toplanır.
 * Av serisi yalnızca hunt bloğunda (milestone) gösterilir — burada yok.
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { HuntRunResult } from '../types';
import { buddyBoostLine } from '../systems/buddy-boost';
import { markFirstDiscoveries, isPreyDexComplete } from '../systems/first-discovery';
import { type HuntTimeBonus, type MicroEventResult } from '../systems/hunt-flavor';
import { maybeClaimHappyPath } from '../systems/happy-path';
import { maybeClaimFullDexSecret } from '../systems/secret-event';
import { grantCosmeticTitle } from '../systems/cosmetics';

export interface HuntFlavorContext {
  time: HuntTimeBonus;
  micro: MicroEventResult;
  guaranteed: boolean;
}

/**
 * Hunt sonrası ek satırları toplar (keşif, buddy — av serisi hariç).
 *
 * @param redis Redis
 * @param prisma Prisma
 * @param userId Oyuncu
 * @param result Hunt sonucu
 * @param flavor Flavor bağlamı
 * @param huntCount Onboard av sayısı (bu av dahil)
 * @param prefix Komut prefix
 */
export async function collectHuntExtraLines(
  redis: Redis,
  prisma: PrismaClient,
  userId: string,
  result: HuntRunResult,
  flavor: HuntFlavorContext,
  huntCount: number,
  prefix: string,
): Promise<string[]> {
  const lines: string[] = [];
  void flavor;

  const preyNames = result.catches.map((c) => c.preyName);
  const newlySeen = await markFirstDiscoveries(redis, prisma, userId, preyNames);

  if (newlySeen > 0) {
    const complete = await isPreyDexComplete(redis, userId);
    const secret = await maybeClaimFullDexSecret(redis, userId, complete);
    if (secret) lines.push(secret.line);
  }

  const buddy = buddyBoostLine(huntCount);
  if (buddy) lines.push(buddy);

  const happy = await maybeClaimHappyPath(redis, prisma, userId, huntCount);
  if (happy) lines.push(happy);

  if (huntCount === 25) {
    await grantCosmeticTitle(redis, userId, 'seri');
  }

  void prefix;
  return lines;
}
