// ============================================================
// traits.ts — Baykus Trait Sistemi
//
// Sorumluluklar:
//   1. Yeni baykus icin rastgele trait listesi uretmek
//   2. Trait'lerin oyun sistemlerine etkisini hesaplamak
//   3. Mevcut baykuslarda trait yoksa gracefully null donmek
// ============================================================

import {
  OWL_TRAITS,
  TRAIT_COUNT_MIN,
  TRAIT_COUNT_MAX,
  TRAIT_DOUBLE_TIER_THRESHOLD,
  TRAIT_DOUBLE_CHANCE_HIGH,
  TRAIT_DOUBLE_CHANCE_LOW,
  RARITY_TRAIT_WEIGHT_MULT,
  RARITY_RARE_WEIGHT_THRESHOLD,
  type OwlTrait,
} from '../config';

// ─── TIP TANIMLARI ────────────────────────────────────────────────────────────

/**
 * DB'de saklanan trait verisi (sadece id yeterli — detaylar config'den gelir).
 * Boyutu kucuk tutmak icin sadece id sakliyoruz.
 */
export interface StoredTrait {
  id: string;
}

/**
 * Oyun sistemlerinde kullanilan tam trait verisi.
 */
export interface ResolvedTrait extends OwlTrait {}

/**
 * Bir baykusun aktif trait etkilerini ozetleyen nesne.
 * Her deger carpan olarak ifade edilir (1.0 = etki yok).
 */
export interface TraitEffects {
  huntReward:    number;  // av coin/xp carpani
  huntCatch:     number;  // yakalama sansi carpani
  pvpDamage:     number;  // PvP hasar carpani
  pvpDodge:      number;  // PvP dodge carpani
  tameChance:    number;  // tame sansi carpani
  xpGain:        number;  // XP carpani
  encounterRate: number;  // encounter tetiklenme carpani
  staminaRegen:  number;  // stamina yenilenme carpani
  hpMax:         number;  // max HP carpani
  cooldownRed:   number;  // cooldown carpani (< 1.0 = daha kisa)
}

// ─── YARDIMCI FONKSİYONLAR ───────────────────────────────────────────────────

/**
 * Agirlikli rastgele secim.
 * Ayni trait iki kez secilmez (no-duplicate).
 *
 * Rarity carpani: Dusuk agirlikli (nadir) trait'lerin agirligi
 * rarity'ye gore arttirilir veya azaltilir.
 * Bu sayede God Roll baykuslar daha ilginc trait'lere sahip olur.
 */
function weightedPickUnique(pool: OwlTrait[], count: number, rarity?: string): OwlTrait[] {
  const result: OwlTrait[] = [];
  const remaining = [...pool];

  // Rarity carpanini uygula
  const rarityMult = rarity ? (RARITY_TRAIT_WEIGHT_MULT[rarity] ?? 1.0) : 1.0;

  for (let i = 0; i < count && remaining.length > 0; i++) {
    // Her trait icin efektif agirligi hesapla
    const effectiveWeights = remaining.map((t) => {
      // Nadir trait mi? (dusuk agirlik = nadir)
      const isRareTrait = t.weight <= RARITY_RARE_WEIGHT_THRESHOLD;
      // Nadir trait'lere rarity carpanini uygula, diger trait'ler degismez
      return isRareTrait ? t.weight * rarityMult : t.weight;
    });

    const totalWeight = effectiveWeights.reduce((sum, w) => sum + w, 0);
    let cursor = Math.random() * totalWeight;

    let idx = 0;
    for (let j = 0; j < effectiveWeights.length; j++) {
      cursor -= effectiveWeights[j]!;
      if (cursor <= 0) {
        idx = j;
        break;
      }
    }

    const picked = remaining[idx]!;
    result.push(picked);
    remaining.splice(idx, 1);
  }

  return result;
}

// ─── ANA FONKSİYONLAR ────────────────────────────────────────────────────────

/**
 * Yeni bir baykus icin rastgele trait listesi uretir.
 *
 * Kac trait alacagi tier'a gore belirlenir:
 *   - Tier 1-3 (guclu turler): %65 iki trait, %35 bir trait
 *   - Tier 4-8 (zayif turler): %35 iki trait, %65 bir trait
 *
 * Rarity etkisi:
 *   - God Roll / Elite: Nadir trait'lere daha yuksek erisim
 *   - Trash / Common:   Nadir trait'lere daha dusuk erisim
 *   - Rarity ham stat'i ETKILEMEZ — sadece trait secimini etkiler
 *
 * Amac: Guclu turler daha ilginc ama daha az tahmin edilebilir olsun.
 */
export function rollTraits(tier: number, quality?: string): StoredTrait[] {
  const doubleChance = tier <= TRAIT_DOUBLE_TIER_THRESHOLD
    ? TRAIT_DOUBLE_CHANCE_HIGH
    : TRAIT_DOUBLE_CHANCE_LOW;

  const count = Math.random() * 100 < doubleChance
    ? TRAIT_COUNT_MAX
    : TRAIT_COUNT_MIN;

  // Rarity carpanini trait seciminde kullan
  const picked = weightedPickUnique(OWL_TRAITS, count, quality);
  return picked.map((t) => ({ id: t.id }));
}

/**
 * Saklanan trait ID listesini tam OwlTrait nesnelerine donusturur.
 * Bilinmeyen ID'ler sessizce atlanir (eski veri uyumlulugu).
 */
export function resolveTraits(stored: StoredTrait[] | null | undefined): ResolvedTrait[] {
  if (!stored || stored.length === 0) return [];
  return stored
    .map((s) => OWL_TRAITS.find((t) => t.id === s.id))
    .filter((t): t is ResolvedTrait => t !== undefined);
}

/**
 * Trait listesinden oyun sistemlerine uygulanacak carpanlari hesaplar.
 *
 * Birden fazla trait ayni sistemi etkiliyorsa carpanlar cogaltilir
 * (additive degil multiplicative — daha dengeli).
 *
 * Ornek:
 *   Trait A: huntReward x1.20
 *   Trait B: huntReward x0.82
 *   Sonuc:   huntReward x(1.20 * 0.82) = x0.984
 */
export function calcTraitEffects(traits: ResolvedTrait[]): TraitEffects {
  // Baslangic: tum carpanlar 1.0 (etki yok)
  const effects: TraitEffects = {
    huntReward:    1.0,
    huntCatch:     1.0,
    pvpDamage:     1.0,
    pvpDodge:      1.0,
    tameChance:    1.0,
    xpGain:        1.0,
    encounterRate: 1.0,
    staminaRegen:  1.0,
    hpMax:         1.0,
    cooldownRed:   1.0,
  };

  for (const trait of traits) {
    applyTraitValue(effects, trait.bonusType,   trait.bonusValue);
    applyTraitValue(effects, trait.penaltyType, trait.penaltyValue);
  }

  return effects;
}

/**
 * Tek bir trait degerini ilgili alana uygular.
 */
function applyTraitValue(effects: TraitEffects, type: string, value: number): void {
  switch (type) {
    case 'hunt_reward':    effects.huntReward    *= value; break;
    case 'hunt_catch':     effects.huntCatch     *= value; break;
    case 'pvp_damage':     effects.pvpDamage     *= value; break;
    case 'pvp_dodge':      effects.pvpDodge      *= value; break;
    case 'tame_chance':    effects.tameChance    *= value; break;
    case 'xp_gain':        effects.xpGain        *= value; break;
    case 'encounter_rate': effects.encounterRate *= value; break;
    case 'stamina_regen':  effects.staminaRegen  *= value; break;
    case 'hp_max':         effects.hpMax         *= value; break;
    case 'cooldown_red':   effects.cooldownRed   *= value; break;
    // Bilinmeyen tip: sessizce atla
  }
}

/**
 * JSON olarak saklanan trait verisini StoredTrait[] tipine donusturur.
 * Prisma'dan gelen ham Json degerini parse eder.
 */
export function parseStoredTraits(raw: unknown): StoredTrait[] {
  if (!raw || !Array.isArray(raw)) return [];
  return (raw as { id?: unknown }[])
    .filter((item) => typeof item?.id === 'string')
    .map((item) => ({ id: item.id as string }));
}
