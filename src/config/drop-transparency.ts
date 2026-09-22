/**
 * drop-transparency.ts — Lootbox drop oranlarının paylaşılan sabitleri (A4).
 *
 * Bu dosya `src/systems/drops.ts` içindeki gizli sabitleri dışa taşır.
 * Amaç: drop hesabını yapan kod ile oyuncuya oranı **ilan eden** UI aynı
 * sayıyı kullansın. İkisi ayrı yerde tanımlıysa ilan edilen oran zamanla
 * gerçek orandan sapar — `no-hidden-mechanics` kuralının en kötü ihlali
 * "yanlış oran ilan etmek" olurdu.
 *
 * Değer değiştirilecekse `docs/balance-changelog.md` girdisi eklenir.
 */

/** 24 saat içinde bir oyuncunun alabileceği maksimum lootbox drop sayısı. */
export const LOOTBOX_DAILY_DROP_CAP = 10;

/** Bu seviyeye kadar drop şansı tam (çarpan 1.0). */
export const LOOTBOX_LEVEL_SOFTCAP_START = 20;

/** Softcap başladıktan sonra her seviye için düşen oran (0.01 = %1). */
export const LOOTBOX_LEVEL_SOFTCAP_RATE = 0.01;

/** Softcap'in ulaşabileceği maksimum azalma (0.30 = en fazla %30 düşüş). */
export const LOOTBOX_LEVEL_SOFTCAP_MAX = 0.3;

/**
 * Seviyeye bağlı drop şansı çarpanı.
 *
 * Yüksek seviyede lootbox akışını yavaşlatan softcap. Hard cap değil:
 * çarpan asla 0 olmaz, en kötü durumda `1 - LOOTBOX_LEVEL_SOFTCAP_MAX`.
 *
 * @param level Oyuncu seviyesi
 * @returns 0.7–1.0 aralığında çarpan
 */
export function lootboxLevelDropMultiplier(level: number): number {
  if (level <= LOOTBOX_LEVEL_SOFTCAP_START) return 1;
  const reduction = Math.min(
    LOOTBOX_LEVEL_SOFTCAP_MAX,
    (level - LOOTBOX_LEVEL_SOFTCAP_START) * LOOTBOX_LEVEL_SOFTCAP_RATE,
  );
  return 1 - reduction;
}

/**
 * Softcap'in bir seviyede yol açtığı azalmayı yüzde olarak verir.
 *
 * UI'da "Lv.45'te drop şansın %25 daha düşük" satırını üretmek için.
 *
 * @param level Oyuncu seviyesi
 * @returns 0–30 aralığında yüzde
 */
export function lootboxLevelSoftcapPercent(level: number): number {
  return Math.round((1 - lootboxLevelDropMultiplier(level)) * 100);
}
