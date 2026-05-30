/**
 * player-cache.ts — Oyuncu + main baykuş okuma (Redis-first state uzerinden)
 *
 * Tek kaynak: state:player:* (player-state.ts). Eski pcache TTL katmani kaldirildi.
 */

import type { Redis } from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import { hydratePlayerState, invalidatePlayerState } from '../state/player-state';

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

/** @deprecated setCachedPlayerBundle artik no-op. */
export async function setCachedPlayerBundle(
  _redis: Redis,
  _playerId: string,
  _bundle: CachedPlayerBundle,
): Promise<void> {
  // no-op
}

/** State + legacy pcache temizligi. */
export async function invalidatePlayerCache(
  redis: Redis,
  playerId: string,
): Promise<void> {
  await invalidatePlayerState(redis, playerId);
}

/** Oyuncu + main baykuş — Redis-first hydrate (PG miss'te bir kez yukler). */
export async function getPlayerBundle(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<CachedPlayerBundle | null> {
  return hydratePlayerState(redis, prisma, playerId);
}
