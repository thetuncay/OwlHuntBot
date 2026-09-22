/**
 * trade-log.ts — Oyuncunun kendi trade geçmişi (F1).
 *
 * Yalnızca katılımcı görür. Redis list, son N kayıt.
 */

import type { Redis } from 'ioredis';

export const TRADE_LOG_MAX = 15;
const LOG_PREFIX = 'trade:log:';
const LOG_TTL_SEC = 60 * 24 * 60 * 60;

export interface TradeLogEntry {
  at: number;
  otherId: string;
  otherName: string;
  gave: string;
  got: string;
}

function key(userId: string): string {
  return `${LOG_PREFIX}${userId}`;
}

function summarizeSide(coins: number, items: { itemName: string; quantity: number }[]): string {
  const parts: string[] = [];
  if (coins > 0) parts.push(`${coins}c`);
  for (const item of items.slice(0, 3)) {
    parts.push(`${item.itemName}×${item.quantity}`);
  }
  return parts.length > 0 ? parts.join(', ') : '—';
}

/**
 * Settle sonrası her iki tarafa kayıt yazar.
 *
 * @param redis Redis
 * @param aId A oyuncu
 * @param aName A adı
 * @param bId B oyuncu
 * @param bName B adı
 * @param aCoins A'nın verdiği coin
 * @param bCoins B'nin verdiği coin
 * @param aItems A eşyaları
 * @param bItems B eşyaları
 */
export async function appendTradeLog(
  redis: Redis,
  aId: string,
  aName: string,
  bId: string,
  bName: string,
  aCoins: number,
  bCoins: number,
  aItems: { itemName: string; quantity: number }[],
  bItems: { itemName: string; quantity: number }[],
): Promise<void> {
  const at = Date.now();
  const aGave = summarizeSide(aCoins, aItems);
  const bGave = summarizeSide(bCoins, bItems);
  const aEntry: TradeLogEntry = { at, otherId: bId, otherName: bName, gave: aGave, got: bGave };
  const bEntry: TradeLogEntry = { at, otherId: aId, otherName: aName, gave: bGave, got: aGave };
  await Promise.all([pushEntry(redis, aId, aEntry), pushEntry(redis, bId, bEntry)]);
}

async function pushEntry(redis: Redis, userId: string, entry: TradeLogEntry): Promise<void> {
  const k = key(userId);
  await redis.lpush(k, JSON.stringify(entry));
  await redis.ltrim(k, 0, TRADE_LOG_MAX - 1);
  await redis.expire(k, LOG_TTL_SEC);
}

/**
 * Son trade kayıtları (yeniden eskiye).
 *
 * @param redis Redis
 * @param userId Oyuncu
 */
export async function listTradeLog(redis: Redis, userId: string): Promise<TradeLogEntry[]> {
  const raw = await redis.lrange(key(userId), 0, TRADE_LOG_MAX - 1);
  return raw.map((row) => {
    try {
      return JSON.parse(row) as TradeLogEntry;
    } catch {
      return null;
    }
  }).filter((e): e is TradeLogEntry => e != null);
}

/**
 * Oyuncuya gösterilecek satırlar.
 *
 * @param entries Kayıtlar
 */
export function formatTradeLogLines(entries: TradeLogEntry[]): string[] {
  if (entries.length === 0) return ['Henüz trade yok.'];
  return entries.map((e) => {
    const when = new Date(e.at).toISOString().slice(0, 16).replace('T', ' ');
    return `• ${when} · **${e.otherName}** · verdin ${e.gave} · aldın ${e.got}`;
  });
}
