/**
 * player-cache.ts — Oyuncu + main baykuş okuma
 *
 * Hunt hot path: state:player:* (player-state.ts)
 * Komut okuması (stats/upgrade/…): önce atomik pcache bundle — eski davranış;
 *   mainOwl her zaman player ile birlikte cache'lenir (ayrı owl key'e güvenilmez).
 */

import type { Redis } from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import { RUNTIME } from '../config/runtime';
import { hydratePlayerState } from '../state/player-state';

const PLAYER_CACHE_TTL_S = RUNTIME.playerCacheTtlSec;
const CACHE_PREFIX = 'pcache:';

export interface CachedPlayerData {
  id: string;
  level: number;
  xp: number;
  coins: number;
  huntComboStreak: number;
  noRareStreak: number;
  mainOwlId: string | null;
  dailyLootboxDrops: number;
  lastLootboxDropDate: string | null;
  prestigeLevel?: number;
  gambleStreakWins?: number;
  gambleStreakLosses?: number;
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

function pcacheKey(playerId: string): string {
  return `${CACHE_PREFIX}player:${playerId}`;
}

/** Atomik bundle okuma — mainOwl player JSON'undan ayrı değil, tek key. */
export async function getCachedPlayerBundle(
  redis: Redis,
  playerId: string,
): Promise<CachedPlayerBundle | null> {
  try {
    const raw = await redis.get(pcacheKey(playerId));
    if (!raw) return null;
    const bundle = JSON.parse(raw) as CachedPlayerBundle;
    if (!bundle.mainOwl) return null;
    return bundle;
  } catch {
    return null;
  }
}

export async function setCachedPlayerBundle(
  redis: Redis,
  playerId: string,
  bundle: CachedPlayerBundle,
): Promise<void> {
  if (!bundle.mainOwl) return;
  try {
    await redis.set(pcacheKey(playerId), JSON.stringify(bundle), 'EX', PLAYER_CACHE_TTL_S);
  } catch {
    // Redis down — sessizce geç
  }
}

/** Sadece pcache bundle sil — hunt hot state (state:player) korunur. */
export async function invalidatePlayerCache(
  redis: Redis,
  playerId: string,
): Promise<void> {
  try {
    await redis.del(pcacheKey(playerId));
  } catch {
    // Redis down — sessizce geç
  }
}

/**
 * Oyuncu + main baykuş — önce atomik pcache, miss'te hydrate (PG fallback + mainOwl garantisi).
 */
export async function getPlayerBundle(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<CachedPlayerBundle | null> {
  const cached = await getCachedPlayerBundle(redis, playerId);
  if (cached) return cached;

  const bundle = await hydratePlayerState(redis, prisma, playerId);
  if (bundle?.mainOwl) {
    setCachedPlayerBundle(redis, playerId, bundle).catch(() => null);
  }
  return bundle;
}
