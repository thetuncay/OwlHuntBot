/**
 * gamble-stats.ts — Oyuncunun kendi kumar istatistiği (M1).
 *
 * Amaç şeffaflık: oyuncu kendi gerçek win/loss oranını görebilsin. Sistem
 * adilse rakamlar sistemi haklı çıkarır; adil değilse zaten düzeltilmeli.
 *
 * **Neden Redis, neden yeni tablo değil:** bu ekran salt bilgi amaçlı, ekonomi
 * kritik değil ve kumar sıcak yolda. Redis hash `HINCRBY` ile O(1) yazar,
 * migration gerektirmez. Karşılığında sayaçlar "takip başladığından beri"
 * anlamına gelir — UI bunu iddia etmediği için yanıltıcı değil.
 */

import type { Redis } from 'ioredis';

/** İstatistik tutulan kumar oyunları. */
export type GambleGame = 'cf' | 'bj' | 'slot';

/** Sayaçların yenilenen yaşam süresi — terk eden oyuncu anahtarı şişirmesin. */
const STATS_TTL_SEC = 180 * 24 * 60 * 60;

function statsKey(playerId: string): string {
  return `gstats:${playerId}`;
}

export interface GambleStatsSnapshot {
  plays: number;
  wins: number;
  losses: number;
  /** Toplam yatırılan miktar. */
  wagered: number;
  /** Net sonuç — negatif olabilir. */
  net: number;
  byGame: Record<GambleGame, { plays: number; wins: number }>;
}

const EMPTY_SNAPSHOT: GambleStatsSnapshot = {
  plays: 0,
  wins: 0,
  losses: 0,
  wagered: 0,
  net: 0,
  byGame: { cf: { plays: 0, wins: 0 }, bj: { plays: 0, wins: 0 }, slot: { plays: 0, wins: 0 } },
};

const GAMES: readonly GambleGame[] = ['cf', 'bj', 'slot'];

function num(raw: Record<string, string>, field: string): number {
  const parsed = Number(raw[field]);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Bir kumar sonucunu sayaçlara ekler.
 *
 * Sıcak yolda çağrılır; hata yutulur çünkü istatistik kaybı oyunu bozmamalı.
 *
 * @param redis Redis bağlantısı
 * @param playerId Oyuncu ID
 * @param game Oyun tipi
 * @param win Kazandı mı
 * @param bet Bahis miktarı
 * @param gain Net coin değişimi (negatif olabilir)
 */
export async function recordGambleOutcome(
  redis: Redis,
  playerId: string,
  game: GambleGame,
  win: boolean,
  bet: number,
  gain: number,
): Promise<void> {
  try {
    const key = statsKey(playerId);
    const pipeline = redis.multi();
    pipeline.hincrby(key, 'plays', 1);
    pipeline.hincrby(key, win ? 'wins' : 'losses', 1);
    pipeline.hincrby(key, 'wagered', Math.max(0, Math.trunc(bet)));
    pipeline.hincrby(key, 'net', Math.trunc(gain));
    pipeline.hincrby(key, `p:${game}`, 1);
    if (win) pipeline.hincrby(key, `w:${game}`, 1);
    pipeline.expire(key, STATS_TTL_SEC);
    await pipeline.exec();
  } catch {
    /* istatistik kaybı oyunu bozmaz */
  }
}

/**
 * Oyuncunun kumar istatistiğini okur.
 *
 * @param redis Redis bağlantısı
 * @param playerId Oyuncu ID
 * @returns Kayıt yoksa sıfırlı snapshot
 */
export async function getGambleStats(
  redis: Redis,
  playerId: string,
): Promise<GambleStatsSnapshot> {
  let raw: Record<string, string> = {};
  try {
    raw = await redis.hgetall(statsKey(playerId));
  } catch {
    return EMPTY_SNAPSHOT;
  }
  if (!raw || Object.keys(raw).length === 0) return EMPTY_SNAPSHOT;

  const byGame = {} as GambleStatsSnapshot['byGame'];
  for (const game of GAMES) {
    byGame[game] = { plays: num(raw, `p:${game}`), wins: num(raw, `w:${game}`) };
  }

  return {
    plays: num(raw, 'plays'),
    wins: num(raw, 'wins'),
    losses: num(raw, 'losses'),
    wagered: num(raw, 'wagered'),
    net: num(raw, 'net'),
    byGame,
  };
}

/**
 * Kazanma oranını yüzde olarak verir.
 *
 * @param stats İstatistik snapshot
 * @returns Hiç oynanmadıysa `null`
 */
export function winRatePercent(stats: GambleStatsSnapshot): number | null {
  if (stats.plays <= 0) return null;
  return (stats.wins / stats.plays) * 100;
}
