/**
 * Baykuş ay kademesi (moon tier) evrim konfigürasyonu.
 */
export interface OwlMoonTierDef {
  moonTier: number;
  powerMin: number;
  label: string;
  title: string | null;
  aura: string | null;
  flavor: string | null;
}

export const OWL_MOON_TIERS: OwlMoonTierDef[] = [
  { moonTier: 1, powerMin: 0,   label: 'Moon I',   title: null,              aura: null,                 flavor: null },
  { moonTier: 2, powerMin: 100, label: 'Moon II',  title: null,              aura: 'Parlak Gözler',      flavor: 'Baykuşunun gözleri geceyi aydınlatacak kadar parladı..' },
  { moonTier: 3, powerMin: 190, label: 'Moon III', title: 'Gece Avcısı',     aura: 'Gece Aurası',        flavor: 'Gece avcısı olarak tanınıyor.' },
  { moonTier: 4, powerMin: 280, label: 'Moon IV',  title: 'Gölge Lordu',     aura: 'Kadim Aura',         flavor: 'Kadim güç baykuşunun çevresini sarıyor..' },
  { moonTier: 5, powerMin: 390, label: 'Moon V',   title: 'Fırtına Taşıyıcısı', aura: 'Yıldırım Çerçevesi', flavor: 'Baykuşunun kanatları fırtınalar çıkartıyor..' },
  { moonTier: 6, powerMin: 500, label: 'Moon VI',  title: 'Kozmik Avcı',     aura: 'Galaksi Işığı',      flavor: 'Baykuşun var oluşun gücünü kullanıyor..' },
  { moonTier: 7, powerMin: 600, label: 'Moon VII', title: 'Ay Efendisi',     aura: 'Süper Ay Taç',       flavor: 'Baykuşun artık ayın kalbinde yaşıyor..' },
];

export const OWL_MAX_MOON_TIER = OWL_MOON_TIERS.length;

export const OWL_MOON_POWER_CAP =
  OWL_MOON_TIERS[OWL_MOON_TIERS.length - 1]?.powerMin ?? 600;

export function resolveMoonTierFromPower(power: number): number {
  let tier = 1;
  for (const def of OWL_MOON_TIERS) {
    if (power >= def.powerMin) tier = def.moonTier;
  }
  return tier;
}

export function getMoonTierDef(moonTier: number): OwlMoonTierDef | undefined {
  return OWL_MOON_TIERS.find((d) => d.moonTier === moonTier);
}

export interface MoonTierProgress {
  power: number;
  currentTier: number;
  currentDef: OwlMoonTierDef;
  atMax: boolean;
  nextTier: number | null;
  nextDef: OwlMoonTierDef | null;
  remaining: number | null;
  nextThreshold: number | null;
}

export function getMoonTierProgress(power: number): MoonTierProgress {
  const currentTier = resolveMoonTierFromPower(power);
  const currentDef = getMoonTierDef(currentTier) ?? OWL_MOON_TIERS[0]!;
  if (currentTier >= OWL_MAX_MOON_TIER) {
    return {
      power,
      currentTier,
      currentDef,
      atMax: true,
      nextTier: null,
      nextDef: null,
      remaining: null,
      nextThreshold: null,
    };
  }
  const nextTier = currentTier + 1;
  const nextDef = getMoonTierDef(nextTier)!;
  return {
    power,
    currentTier,
    currentDef,
    atMax: false,
    nextTier,
    nextDef,
    remaining: Math.max(0, nextDef.powerMin - power),
    nextThreshold: nextDef.powerMin,
  };
}
