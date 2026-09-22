/**
 * welcome-back.ts — Ara veren oyuncuyu karşılama paketi (A7).
 *
 * Felsefe: bu bir **telafi** değil, bir **karşılama**. Oyuncu seriyi kırdığı
 * için özür dilemiyor; döndüğü için selamlanıyor. Frommel & Mandryk (2022)
 * "kaçırma cezasını azaltma" önerisiyle uyumlu.
 *
 * İki sert kısıt:
 *   1. Paket kasıtlı olarak küçük — ara vermek asla düzenli oynamaktan
 *      avantajlı olamaz (bkz. `WELCOME_BACK_COINS` yorumu).
 *   2. Ay içinde en fazla bir kez — "3 gün ara ver, paketi topla" döngüsü
 *      kurulamaz.
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  DAILY_LOGIN_EQUIPMENT_CRATE_NAME,
  WELCOME_BACK_COINS,
  WELCOME_BACK_COOLDOWN_DAYS,
  WELCOME_BACK_EQUIPMENT_CRATES,
  WELCOME_BACK_MIN_AWAY_DAYS,
} from '../config';
import { applyCoinDeltaInRedis } from '../state/player-state';

const DAY_MS = 24 * 60 * 60 * 1000;

function claimKey(userId: string): string {
  return `welcomeback:${userId}`;
}

export interface WelcomeBackGrant {
  awayDays: number;
  coins: number;
  equipmentCrates: number;
}

/**
 * Aradan dönüş paketi hak edildi mi?
 *
 * Yalnızca süreyi kontrol eder; tekrar koruması `claimWelcomeBack` içinde.
 *
 * @param lastSeenAt Oyuncunun son görülme zamanı (null ise yeni oyuncu)
 * @param now Şimdiki zaman
 */
export function isWelcomeBackEligible(lastSeenAt: Date | null, now: Date): boolean {
  if (!lastSeenAt) return false;
  const awayMs = now.getTime() - lastSeenAt.getTime();
  return awayMs >= WELCOME_BACK_MIN_AWAY_DAYS * DAY_MS;
}

/**
 * Aradan geçen tam gün sayısı.
 *
 * @param lastSeenAt Son görülme zamanı
 * @param now Şimdiki zaman
 */
export function computeAwayDays(lastSeenAt: Date | null, now: Date): number {
  if (!lastSeenAt) return 0;
  return Math.floor((now.getTime() - lastSeenAt.getTime()) / DAY_MS);
}

/**
 * Karşılama paketini verir — hak edilmemişse veya bu ay alınmışsa `null`.
 *
 * Tekrar koruması Redis `SET NX` ile atomiktir; iki eşzamanlı `daily` çağrısı
 * iki paket üretemez. Redis erişilemezse paket verilmez (güvenli taraf).
 *
 * @param prisma Prisma client
 * @param redis Redis bağlantısı
 * @param playerId Oyuncu ID
 * @param lastSeenAt Oyuncunun son görülme zamanı
 * @param now Şimdiki zaman
 * @returns Verilen paket veya `null`
 */
export async function claimWelcomeBack(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
  lastSeenAt: Date | null,
  now: Date = new Date(),
): Promise<WelcomeBackGrant | null> {
  if (!isWelcomeBackEligible(lastSeenAt, now)) return null;

  // Atomik tek-seferlik kilit — ay içinde ikinci paketi engeller.
  let locked = false;
  try {
    const ttlSec = WELCOME_BACK_COOLDOWN_DAYS * 24 * 60 * 60;
    locked = (await redis.set(claimKey(playerId), '1', 'EX', ttlSec, 'NX')) === 'OK';
  } catch {
    return null;
  }
  if (!locked) return null;

  try {
    if (WELCOME_BACK_EQUIPMENT_CRATES > 0) {
      await prisma.inventoryItem.upsert({
        where: {
          ownerId_itemName: {
            ownerId: playerId,
            itemName: DAILY_LOGIN_EQUIPMENT_CRATE_NAME,
          },
        },
        create: {
          ownerId: playerId,
          itemName: DAILY_LOGIN_EQUIPMENT_CRATE_NAME,
          itemType: 'Kutu',
          rarity: 'Common',
          quantity: WELCOME_BACK_EQUIPMENT_CRATES,
        },
        update: { quantity: { increment: WELCOME_BACK_EQUIPMENT_CRATES } },
      });
    }
    await applyCoinDeltaInRedis(redis, playerId, WELCOME_BACK_COINS, prisma);
  } catch (err) {
    // Kilit duruyor ama ödül verilemedi — bir sonraki denemede tekrar
    // verilmemesi yerine kilidi bırakıp tutarlılığı koru.
    await redis.del(claimKey(playerId)).catch(() => undefined);
    throw err;
  }

  return {
    awayDays: computeAwayDays(lastSeenAt, now),
    coins: WELCOME_BACK_COINS,
    equipmentCrates: WELCOME_BACK_EQUIPMENT_CRATES,
  };
}

/**
 * Karşılama mesajı — ceza dili yok, seriden hiç bahsedilmez.
 *
 * @param grant Verilen paket
 */
export function buildWelcomeBackMessage(grant: WelcomeBackGrant): string {
  const parts = [`🪶 **${grant.awayDays} gün** sonra tekrar hoş geldin..`];
  const gifts: string[] = [`${grant.coins} coin`];
  if (grant.equipmentCrates > 0) gifts.push(`${grant.equipmentCrates} Eşya Kutusu`);
  parts.push(`Karşılama hediyesi: **${gifts.join('** · **')}**`);
  return parts.join('\n');
}
