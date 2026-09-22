/**
 * weekly-ritual.ts — Haftalık "taze başlangıç" selamı (I2).
 *
 * Haftalık quest sistemi (E1) kapsam dışı olduğu için ritüel `w daily`
 * üzerine oturuyor: oyuncu yeni ISO haftasında ilk kez günlük hediyesini
 * aldığında kısa bir selam görür.
 *
 * Ceza değil ritüel: geçen haftadan hiç bahsedilmez, "kaçırdın" denmez.
 * Spec uyarısı gereği metin havuzdan gelir — her hafta aynı cümle tekdüzeleşir.
 */

import type { Redis } from 'ioredis';

/** Selam varyantları — tekdüzeliği kırmak için havuz. */
export const WEEKLY_RITUAL_LINES: readonly string[] = [
  '🪶 Hafta döndü. Bu sefer nereye açılıyorsun?',
  '🌙 Yeni haftanın ilk gecesi..',
  '🍃 Yeni hafta; rüzgâr sakin.',
];

/** Selam kaydının ömrü — iki haftayı kapsar, sonra kendiliğinden temizlenir. */
const RITUAL_TTL_SEC = 14 * 24 * 60 * 60;

function ritualKey(userId: string): string {
  return `weekgreet:${userId}`;
}

/**
 * Tarihin ISO hafta kimliği (`2026-W37`).
 *
 * ISO 8601: hafta pazartesi başlar, yılın 1. haftası ilk perşembeyi içerir.
 *
 * @param date Hesaplanacak tarih
 */
export function isoWeekKey(date: Date): string {
  // UTC üzerinde çalış — sunucu saat dilimi hafta sınırını kaydırmasın.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Perşembeye kaydır: ISO haftası, içindeki perşembenin yılına aittir.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Hafta kimliğinden deterministik varyant seçer.
 *
 * Rastgele seçmek yerine hafta anahtarına bağlamak, aynı hafta içinde farklı
 * ekranlarda farklı cümle çıkmasını önler.
 *
 * @param weekKey ISO hafta kimliği
 */
export function pickWeeklyRitualLine(weekKey: string): string {
  let hash = 0;
  for (let i = 0; i < weekKey.length; i++) {
    hash = (hash * 31 + weekKey.charCodeAt(i)) % 100_000;
  }
  return WEEKLY_RITUAL_LINES[hash % WEEKLY_RITUAL_LINES.length]!;
}

/**
 * Bu hafta selam gösterilmediyse gösterir ve işaretler.
 *
 * Redis hatası durumunda `null` döner — selam kaçar ama akış bozulmaz.
 *
 * @param redis Redis bağlantısı
 * @param userId Oyuncu ID
 * @param now Şimdiki zaman
 * @returns Gösterilecek selam veya bu hafta zaten gösterildiyse `null`
 */
export async function consumeWeeklyRitual(
  redis: Redis,
  userId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const weekKey = isoWeekKey(now);
  try {
    const seen = await redis.get(ritualKey(userId));
    if (seen === weekKey) return null;
    await redis.set(ritualKey(userId), weekKey, 'EX', RITUAL_TTL_SEC);
  } catch {
    return null;
  }
  return pickWeeklyRitualLine(weekKey);
}
