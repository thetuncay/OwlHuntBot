/**
 * prey-lore.ts — Av türlerinin kısa lore satırları ve keşif ipuçları (K1 · K2 · D4).
 *
 * İki ayrı amaç, tek kaynak:
 *   - **Lore** (K2 · D4): bir av türü *ilk kez* yakalandığında gösterilen 1 satır
 *     aroma. Her yakalayışta değil — tekrar edince tekdüzeleşir.
 *   - **İpucu** (K1): henüz keşfedilmemiş tür için `????` yanında görünen kısmi
 *     bilgi. Spec şartı: ipucu **çözülebilir** olmalı, yoksa merak ölür.
 *
 * Lore blokları değil, tek cümle. Uzatmak `no-ui-noise` ihlali olur.
 */

/** Av türü başına lore cümlesi — `PREY[].name` ile eşleşir. */
export const PREY_LORE: Record<string, string> = {
  fare:       'Ormanın en sabırlı sakini; her avcının ilk dersi.',
  serce:      'Rüzgârı okur, gölgeyi sever. Hızlı ama dikkatsiz.',
  kurbaga:    'Sesiyle yerini verir — bataklığın konuşkan bekçisi.',
  kedi:       'Avcıyı avlayabileceğine inanan tek küçük hayvan.',
  kaz:        'Sürüsünden ayrılmaz; ayrılan uzun yaşamaz.',
  kertenkele: 'Kuyruğunu bırakıp kaçmayı öğrenmiş eski bir taktikçi.',
  hamster:    'Yer altında bir kışlık erzak imparatorluğu saklar.',
  keci:       'Kayalıkta senden daha rahat; yükseklik onun tarafında.',
  kunduz:     'Nehrin mimarı. Suyu yönetir, yönü suya bırakmaz.',
  kostebek:   'Karanlıkta görmez ama toprağı senden iyi tanır.',
  yarasa:     'Geceyi sesle çizer; ay tutulduğunda cesurlaşır.',
  bildircin:  'Son ana kadar bekler, sonra patlarcasına havalanır.',
  guvercin:   'Yolunu hiç kaybetmez — bu yüzden bulunması zordur.',
  koyun:      'Kalabalıkta güvenli, yalnızken savunmasız.',
  yilan:      'Isınmak için taşı, saklanmak için sabrı seçer.',
  sincap:     'Ağaç tepelerinin en tedbirli hırsızı.',
  tilki:      'Tuzağı görür, tuzağı kurar. Aynı gecede ikisini de.',
  tavsan:     'Düz koşmaz; her adımı bir yanılgı bırakır.',
  sansar:     'Sessizliği silah gibi kullanır — çoğu avcı geç fark eder.',
  gelincik:   'Küçüklüğünü avantaja çevirmiş nadir bir yırtıcı.',
  kurt:       'Tek başına görülürse sürüsü çoktan seni görmüştür.',
  kirpi:      'Kaçmaz, dönüşür. Ormanın en inatçı savunması.',
  yusufcuk:   'Gölde bir an durur, sonra ışık gibi kaybolur.',
  yengec:     'Yan yan yürür ama tuzağa düz girmez.',
  horoz:      'Şafaktan önce öter; duyulursa kaçmak için geç kalınmıştır.',
  penguen:    'Kar değil, kaygan taş — dengeni kaybedersin.',
  kaplumbaga:  'Yavaş değildir; sen acelecisin.',
  bukelemun:  'Gördüğün renk yalandır; asıl renk kaçtığı yöndedir.',
  panda:      'Sakin görünür. Yaklaşınca orman susar.',
  ayi:        'İz bırakmaz — senin izini takip eder.',
};

/** Zorluk bandı → keşfedilmemiş tür için ipucu. */
interface LoreHintBand {
  /** Bu banda dahil maksimum zorluk. */
  maxDifficulty: number;
  hint: string;
}

/**
 * İpucu bantları — zorluk arttıkça oyuncuya ne yapması gerektiğini söyler.
 *
 * Bilinçli olarak **eyleme dönük**: "daha güçlü baykuş" veya "daha çok av"
 * gibi oyuncunun kontrol edebileceği bir yön verir (SDT autonomy).
 */
const HINT_BANDS: readonly LoreHintBand[] = [
  { maxDifficulty: 2, hint: 'Yakınlarda yaşıyor — bulmak için birkaç av yeter.' },
  { maxDifficulty: 4, hint: 'Sık avlananlardan; bulman zor olabilir.' },
  { maxDifficulty: 6, hint: 'Ürkek ve seyrek. Göz statını yükselt.' },
  { maxDifficulty: 8, hint: 'Nadir iz bırakır. Güçlü bir baykuş lazım.' },
  { maxDifficulty: Number.POSITIVE_INFINITY, hint: 'Ormanın en derininde yaşıyor. Çok az avcı gördü.' },
];

/**
 * Keşfedilmemiş bir av için ipucu satırı.
 *
 * @param difficulty Av zorluk değeri
 */
export function preyDiscoveryHint(difficulty: number): string {
  return HINT_BANDS.find((band) => difficulty <= band.maxDifficulty)!.hint;
}

/**
 * Av türünün lore cümlesi.
 *
 * @param preyName Av adı (`PREY[].name`)
 * @returns Lore cümlesi veya tanımlı değilse `null`
 */
export function preyLore(preyName: string): string | null {
  return PREY_LORE[preyName.toLowerCase()] ?? null;
}
