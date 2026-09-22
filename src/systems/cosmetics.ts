/**
 * cosmetics.ts — Kazanılabilir unvanlar (D3). Güç yok.
 */

import type { Redis } from 'ioredis';
import {
  COSMETIC_TITLE_BY_ID,
  COSMETIC_TITLES_REDIS_PREFIX,
  type CosmeticTitleId,
} from '../config/cosmetics';

function key(userId: string): string {
  return `${COSMETIC_TITLES_REDIS_PREFIX}${userId}`;
}

async function readTitles(redis: Redis, userId: string): Promise<string[]> {
  const raw = await redis.get(key(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Unvan kazandırır (idempotent).
 *
 * @param redis Redis
 * @param userId Oyuncu
 * @param titleId Unvan
 * @returns Yeni kazanıldıysa `true`
 */
export async function grantCosmeticTitle(
  redis: Redis,
  userId: string,
  titleId: CosmeticTitleId,
): Promise<boolean> {
  const titles = await readTitles(redis, userId);
  if (titles.includes(titleId)) return false;
  titles.push(titleId);
  await redis.set(key(userId), JSON.stringify(titles));
  return true;
}

/**
 * Kazanılmış unvan etiketleri (gösterim sırası: son kazanılan önde).
 *
 * @param redis Redis
 * @param userId Oyuncu
 */
export async function listCosmeticTitleLabels(
  redis: Redis,
  userId: string,
): Promise<string[]> {
  const titles = await readTitles(redis, userId);
  return titles
    .slice()
    .reverse()
    .map((id) => COSMETIC_TITLE_BY_ID[id]?.label)
    .filter((l): l is string => Boolean(l));
}

/**
 * Stats satırı — en son kazanılan unvan.
 *
 * @param labels Unvan etiketleri
 */
export function formatCosmeticTitleLine(labels: string[]): string | null {
  const top = labels[0];
  if (!top) return null;
  return `🎗️ ${top}`;
}
