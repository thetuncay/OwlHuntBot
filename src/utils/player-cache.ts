/**
 * player-cache.ts — Oyuncu + main baykuş verisi için Redis cache
 *
 * Neden gerekli:
 *   Her hunt/pvp/upgrade komutunda player + owl DB'den çekilir.
 *   Atlas M0'da her round-trip ~50-200ms. 10 eş zamanlı kullanıcıda
 *   bu sorgular DB bağlantı havuzunu doldurur ve kuyruk oluşur.
 *
 * Strateji:
 *   - Okuma: Redis'te varsa DB'ye gitme (15s TTL)
 *   - Yazma: DB güncellendikten sonra cache'i invalidate et
 *   - Graceful degradation: Redis down → DB'den çek, hata verme
 *
 * TTL seçimi:
 *   15 saniye — hunt cooldown 10s, bu yüzden aynı oyuncu
 *   arka arkaya hunt atsa bile cache geçerli kalır.
 *   Coin/XP gibi kritik veriler için invalidate zorunlu.
 */

import type { Redis } from 'ioredis';
import type { PrismaClient } from '@prisma/client';

const PLAYER_CACHE_TTL_S = 15;
const CACHE_PREFIX = 'pcache:';

export interface CachedPlayerData {
  id: string;
  level: number;
  xp: number;
  coins: number;
  huntComboStreak: number;
  noRareStreak: number;
  mainOwlId: string | null;
  // YENİ: günlük lootbox drop takibi
  dailyLootboxDrops: number;
  lastLootboxDropDate: string | null; // ISO 8601 string
}

export interface CachedOwlData {
  id: string;
  ownerId: string;
  species: string;
  tier: number;
  bond: number;
  statGaga: number;
  statGoz: number;
  statKulak: number;
  statKanat: number;
  statPence: number;
  quality: string;
  hp: number;
  hpMax: number;
  staminaCur: number;
  isMain: boolean;
  effectiveness: number;
  traits: unknown;
}

export interface CachedPlayerBundle {
  player: CachedPlayerData;
  mainOwl: CachedOwlData | null;
}

function playerKey(playerId: string): string {
  return `${CACHE_PREFIX}player:${playerId}`;
}

/**
 * Oyuncu + main baykuş verisini Redis'ten okur.
 * Cache miss → null döner (çağrıcı DB'den çeker).
 */
export async function getCachedPlayerBundle(
  redis: Redis,
  playerId: string,
): Promise<CachedPlayerBundle | null> {
  try {
    const raw = await redis.get(playerKey(playerId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedPlayerBundle;
  } catch {
    return null;
  }
}

/**
 * Oyuncu + main baykuş verisini Redis'e yazar.
 * DB'den taze veri çekildikten sonra çağrılır.
 */
export async function setCachedPlayerBundle(
  redis: Redis,
  playerId: string,
  bundle: CachedPlayerBundle,
): Promise<void> {
  try {
    await redis.set(playerKey(playerId), JSON.stringify(bundle), 'EX', PLAYER_CACHE_TTL_S);
  } catch {
    // Redis down → sessizce geç
  }
}

/**
 * Oyuncu cache'ini siler.
 * Player veya owl güncellemesinden sonra çağrılmalı.
 */
export async function invalidatePlayerCache(
  redis: Redis,
  playerId: string,
): Promise<void> {
  try {
    await redis.del(playerKey(playerId));
  } catch {
    // Redis down → sessizce geç
  }
}

/**
 * Oyuncu + main baykuş verisini cache'den veya DB'den çeker.
 * Cache hit → 0 DB round-trip.
 * Cache miss → DB'den çeker ve cache'e yazar.
 *
 * Kullanım: hunt, pvp, upgrade gibi sık çağrılan komutlarda
 * player + owl çiftini tek seferde almak için.
 */
export async function getPlayerBundle(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<CachedPlayerBundle | null> {
  // 1. Cache'den dene
  const cached = await getCachedPlayerBundle(redis, playerId);
  if (cached) return cached;

  // 2. DB'den çek
  const [player, mainOwl] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true, level: true, xp: true, coins: true,
        huntComboStreak: true, noRareStreak: true, mainOwlId: true,
        dailyLootboxDrops: true, lastLootboxDropDate: true,
      },
    }),
    prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: {
        id: true, ownerId: true, species: true, tier: true, bond: true,
        statGaga: true, statGoz: true, statKulak: true, statKanat: true, statPence: true,
        quality: true, hp: true, hpMax: true, staminaCur: true,
        isMain: true, effectiveness: true, traits: true,
      },
    }),
  ]);

  if (!player) return null;

  const bundle: CachedPlayerBundle = {
    player: player as CachedPlayerData,
    mainOwl: mainOwl as CachedOwlData | null,
  };

  // 3. Cache'e yaz (fire-and-forget)
  setCachedPlayerBundle(redis, playerId, bundle).catch(() => null);

  return bundle;
}
