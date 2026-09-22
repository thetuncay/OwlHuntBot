/**
 * ui-tiers.ts — Oyuncu level'i için görünür tier etiketleri.
 *
 * Amaç: sayı büyürken ("Level 42") oyuncu için **kategori** görünürlüğü sağlamak.
 * Ryan vd. (2006) — competence görünür olduğunda intrinsic motivasyon artar.
 * Rapor CO-4 · action-list A6 · DDR-003 kapsamı dışı ancak aynı disiplin.
 *
 * Kural: **Yalnızca ui-string.** Hiçbir mekanik / bonus / kilit bu etikete bağlı değildir;
 * kod tarafı `level` sayısını okumaya devam eder. Etiket sadece embed / mesaj için.
 *
 * Tier sayısı 6 — audit önerisi ~5-8 aralığında; kalabalık olmadan görünür.
 */

/** Bir level tier'ının tanımı. */
export interface OwlLevelTier {
  /** Bu tier'a giren minimum level (dahil). */
  readonly minLevel: number;
  /** Etiket (kısa; embed satırında kullanılır). */
  readonly label: string;
  /** Yardımcı emoji — mesaj başında ise dekorasyon. */
  readonly emoji: string;
}

/**
 * Level tier tablosu — sırasız değil, artan `minLevel` sırasında tutulur.
 * Yeni tier eklenirken sıralı ekle; `resolveOwlLevelTier` doğrusal tarar (küçük N).
 */
export const OWL_LEVEL_TIERS: readonly OwlLevelTier[] = [
  { minLevel: 1,   emoji: '🐣', label: 'Yavru Avcı' },
  { minLevel: 10,  emoji: '🌱', label: 'Genç Avcı' },
  { minLevel: 25,  emoji: '🏹', label: 'Avcı' },
  { minLevel: 50,  emoji: '🌙', label: 'Usta Avcı' },
  { minLevel: 75,  emoji: '⚔️', label: 'Kıdemli Avcı' },
  { minLevel: 100, emoji: '👑', label: 'Baş Avcı' },
] as const;

/**
 * Verilen level için tier tanımını döndürür.
 * `level < 1` durumunda ilk tier'a düşer (aynı davranış Redis'te level=0 hydrate ile uyumlu).
 *
 * Invariant: Her level için bir tier vardır — dizi `minLevel: 1` ile başlar.
 *
 * @param level oyuncu level'i (integer beklenir; float güvenli — `Math.floor` uygular)
 * @returns eşleşen tier tanımı (asla `undefined` dönmez)
 */
export function resolveOwlLevelTier(level: number): OwlLevelTier {
  const lv = Math.floor(Number.isFinite(level) ? level : 1);
  // Sondan başlayarak ilk minLevel <= lv olanı bul (küçük N için hızlı).
  for (let i = OWL_LEVEL_TIERS.length - 1; i >= 0; i--) {
    const tier = OWL_LEVEL_TIERS[i]!;
    if (lv >= tier.minLevel) return tier;
  }
  return OWL_LEVEL_TIERS[0]!;
}

/**
 * Level satırı için kısa etiket: `Lv.42 · 🏹 Avcı`.
 * Embed'de compact görüntü için tercih edilir; ayrı bir satır kullanmaz.
 *
 * @param level oyuncu level'i
 * @param opts.short `true` ise sadece etiket (`🏹 Avcı`); `false` = `Lv.X · 🏹 Avcı`
 */
export function formatOwlLevelTierLabel(
  level: number,
  opts: { short?: boolean } = {},
): string {
  const tier = resolveOwlLevelTier(level);
  const badge = `${tier.emoji} ${tier.label}`;
  if (opts.short) return badge;
  return `Lv.**${Math.floor(level)}** · ${badge}`;
}
