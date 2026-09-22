export interface WeightedOption<TValue> {
  value: TValue;
  weight: number;
}

/**
 * Verilen agirlikli seceneklerden tek bir deger dondurur.
 * Agirliklar normalize edilmeden dogrudan kullanilir.
 */
export function weightedRandom<TValue>(options: WeightedOption<TValue>[]): TValue {
  if (options.length === 0) {
    throw new Error('Agirlikli secim icin en az bir secenek gereklidir.');
  }

  const totalWeight = options.reduce((sum, option) => sum + Math.max(0, option.weight), 0);
  if (totalWeight <= 0) {
    throw new Error('Toplam agirlik sifirdan buyuk olmalidir.');
  }

  let cursor = Math.random() * totalWeight;
  for (const option of options) {
    cursor -= Math.max(0, option.weight);
    if (cursor <= 0) {
      return option.value;
    }
  }

  const lastOption = options[options.length - 1];
  if (!lastOption) {
    throw new Error('Agirlikli secim sonucu uretilemedi.');
  }
  return lastOption.value;
}

/**
 * 0-100 arasi sans degerine gore boolean dondurur.
 */
export function rollPercent(chancePercent: number): boolean {
  return Math.random() * 100 < chancePercent;
}
