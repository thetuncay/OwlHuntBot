import {
  BOND_BONUS_RATE,
  CATCH_MAX,
  CATCH_MIN,
  CATCH_STAT_GOZ,
  CATCH_STAT_KANAT,
  CATCH_STAT_PENCE,
  CATCH_TIER_GAP_MIN,
  CATCH_TIER_GAP_MULT,
  ENCOUNTER_BASE,
  ENCOUNTER_GOZ_RATE,
  ENCOUNTER_KULAK_RATE,
  ENCOUNTER_LEVEL_RATE,
  ENCOUNTER_MAX,
  ENCOUNTER_MIN,
  GAMBLE_BET_PENALTY_MULT,
  GAMBLE_RICH_PENALTY_MAX,
  GAMBLE_WIN_CLAMP_MAX,
  GAMBLE_WIN_CLAMP_MIN,
  HUNT_ROLL_BASE,
  HUNT_ROLL_KANAT_MAX_BONUS,
  HUNT_ROLL_KANAT_PER,
  HUNT_ROLL_PER_LEVEL,
  PASSIVE_SCOUTING_ENCOUNTER_BONUS,
  PVP_MOMENTUM_RATE,
  SPAWN_GOZ_RATE,
  SPAWN_KULAK_RATE,
  STAT_SOFTCAP_DEN,
  STAT_SOFTCAP_NUM,
  SWITCH_BASE_COST,
  SWITCH_TIER_MULTIPLIER,
  TAME_GOZ_RATE,
  TAME_KULAK_RATE,
  TAME_MAX,
  TAME_MIN,
  UPGRADE_COIN_BASE,
  UPGRADE_COIN_DISCOUNT_CAP,
  UPGRADE_COIN_EXP,
  UPGRADE_COIN_MULT,
  UPGRADE_MAT_CAP,
  XP_LEVEL_FORMULA,
  XP_SCALE_RATE,
  XP_SCALE_MAX_MULT,
} from '../config';

/** Degeri [min, max] araligina sikistirir. */
export const clamp = (min: number, max: number, val: number): number =>
  Math.min(max, Math.max(min, val));

/** Stat soft cap formulu: etki asla %70'i gecemez. Prestige kaldirildi — bonus yok. */
export const statEffect = (stat: number, _prestigeLevel = 0): number =>
  (stat * STAT_SOFTCAP_NUM) / (stat + STAT_SOFTCAP_DEN);

/** Seviyeye gore hunt roll sayisi. */
export const huntRollBonusFromKanat = (kanat: number): number =>
  clamp(0, HUNT_ROLL_KANAT_MAX_BONUS, Math.floor(Math.max(0, kanat) / HUNT_ROLL_KANAT_PER));

/** Seviye + kanat'a gore hunt roll sayisi. */
export const huntRolls = (level: number, kanat = 0): number =>
  HUNT_ROLL_BASE + Math.floor(level / HUNT_ROLL_PER_LEVEL) + huntRollBonusFromKanat(kanat);

/** Sonraki seviye icin gereken XP. */
export const xpRequired = (level: number): number => XP_LEVEL_FORMULA(level);

/** XP olcekleme carpani uygulanmis final XP. */
export const finalXP = (baseXP: number, level: number): number =>
  Math.round(baseXP * Math.min(1 + level * XP_SCALE_RATE, XP_SCALE_MAX_MULT));

/** Main switch coin maliyeti. */
export const switchCost = (totalTier: number): number =>
  SWITCH_BASE_COST + totalTier * SWITCH_TIER_MULTIPLIER;

/** Bond bonusu (yuzde puan). */
export const bondBonus = (bond: number): number => bond * BOND_BONUS_RATE;

/** Kanat'a gore maksimum stamina. */
export const staminaMax = (kanat: number): number => 100 + kanat * 0.5;

/** PvP tur hasar carpani (momentum sistemi). */
export const damageMultiplier = (turn: number): number => 1 + turn * PVP_MOMENTUM_RATE;

/** Final yakalama sansi (clamp uygulanmis, 0-1 arasi).
 *
 * DUZELTME: Stat katkilari artik dogru olcekte uygulanir.
 * baseChance 0-100 araliginda gelir, powerMult ile carpilip /100 ile 0-1'e donusur.
 * Stat katkilari ise /100 ile bolunerek 0-1 araligina getirilir (pence=50 → +0.125).
 *
 * FIX tier-gap penalty: Eskiden zayif baykus kendi havuzunun en zor avini
 * avlarken ceza aliyordu (tier8 vs difficulty4 = fark 4 >= 2 → ceza).
 * Yeni kural: Ceza sadece baykusun tier'inin ALTINDAKI avlar icin uygulanir.
 * Guclu baykus zayif av avlarken ceza yok, zayif baykus zor av avlarken ceza var.
 */
export const catchChance = (
  baseChance: number,
  powerMult: number,
  pence: number,
  goz: number,
  kanat: number,
  owlTier: number,
  preyDifficulty: number,
  bond = 0,
  effectiveness = 100,
): number => {
  const raw =
    (baseChance * powerMult) / 100 +
    (pence * CATCH_STAT_PENCE) / 100 +
    (goz * CATCH_STAT_GOZ) / 100 +
    (kanat * CATCH_STAT_KANAT) / 100;

  // FIX: Tier-gap cezasi sadece baykusun tier'inden DAHA ZOR avlar icin
  // (preyDifficulty > owlTier demek av baykustan daha guclu/zor)
  // Eski: Math.abs(owlTier - preyDifficulty) — bu zayif baykusu cezalandiriyordu
  const tierGap = preyDifficulty - owlTier; // sadece pozitif fark ceza verir
  const penalized = tierGap >= CATCH_TIER_GAP_MIN ? raw * CATCH_TIER_GAP_MULT : raw;

  // Bond bonusu: max +%20 catch bonus (bond 100 = +0.20)
  const bondMod = bondBonus(bond) / 100;

  // Effectiveness: 100 = tam guc, 0 = hic etki yok
  const effectMult = clamp(0.1, 1.0, effectiveness / 100);

  return clamp(CATCH_MIN, CATCH_MAX, (penalized + bondMod) * effectMult);
};

/** Spawn puani (normalizasyon oncesi). */
export const spawnScore = (difficulty: number, goz: number, kulak: number): number =>
  (1 / difficulty) * (1 + goz * SPAWN_GOZ_RATE) * (1 + kulak * SPAWN_KULAK_RATE);

/** Encounter sansi (yuzde, clamp uygulanmis). */
export const encounterChance = (playerLevel: number, goz: number, kulak: number, scoutingOwlCount = 0): number => {
  const raw =
    ENCOUNTER_BASE +
    playerLevel * ENCOUNTER_LEVEL_RATE +
    goz * ENCOUNTER_GOZ_RATE +
    kulak * ENCOUNTER_KULAK_RATE +
    scoutingOwlCount * PASSIVE_SCOUTING_ENCOUNTER_BONUS * 100; // +%1 per scouting owl
  return clamp(ENCOUNTER_MIN, ENCOUNTER_MAX, raw);
};

/** Tame sansi (clamp uygulanmis, yuzde). */
export const tameChance = (
  baseTameChance: number,
  goz: number,
  kulak: number,
  itemBonus: number,
  qualityAdj: number,
): number => {
  const raw = baseTameChance + goz * TAME_GOZ_RATE + kulak * TAME_KULAK_RATE + itemBonus + qualityAdj;
  return clamp(TAME_MIN, TAME_MAX, raw);
};

/** Upgrade coin maliyeti (egitim seviyesine gore, hafif+ formul). */
export const upgradeCoinCost = (trainedLevel: number): number =>
  UPGRADE_COIN_BASE + Math.floor(Math.pow(Math.max(0, trainedLevel), UPGRADE_COIN_EXP) * UPGRADE_COIN_MULT);

/** Upgrade malzeme miktari (egitim seviyesine gore). */
export const upgradeMaterialRequirement = (trainedLevel: number): number =>
  Math.min(UPGRADE_MAT_CAP, 3 + Math.floor(Math.max(0, trainedLevel) / 10));

/** Buff/item indirimi uygulanmis coin maliyeti. */
export const upgradeCoinCostAfterDiscount = (
  trainedLevel: number,
  discountFraction: number,
): number => {
  const base = upgradeCoinCost(trainedLevel);
  const disc = Math.min(UPGRADE_COIN_DISCOUNT_CAP, Math.max(0, discountFraction));
  return Math.max(1, Math.floor(base * (1 - disc)));
};

/** Kumar zenginlik cezasi. */
export const gamblingRichPenalty = (coins: number): number =>
  Math.min(GAMBLE_RICH_PENALTY_MAX, Math.log10(1 + Math.max(coins, 0)));

/** Kumar buyuk bahis cezasi. */
export const gamblingBetPenalty = (bet: number, totalCoins: number): number => {
  const safeCoins = Math.max(1, totalCoins);
  return (bet / safeCoins) * GAMBLE_BET_PENALTY_MULT;
};

/** Final kumar kazanma sansi (tum modifier'lar uygulanmis, clamp edilmis). */
export const finalWinChance = (
  baseChance: number,
  coins: number,
  bet: number,
  streakMod: number,
): number => {
  const modified = baseChance + streakMod - gamblingRichPenalty(coins) - gamblingBetPenalty(bet, coins);
  return clamp(GAMBLE_WIN_CLAMP_MIN, GAMBLE_WIN_CLAMP_MAX, modified);
};
