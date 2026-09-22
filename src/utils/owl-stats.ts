import {
  STAT_ROLL_BANDS,
  STAT_ROLL_WEIGHT_HIGH,
  STAT_ROLL_WEIGHT_LOW,
  STAT_ROLL_WEIGHT_MID,
} from '../config';
import type { OwlStatKey } from '../types';
import type { AllStats } from './upgrade-deps';

export type { AllStats };

/** Owl row / cache slice with optional base+trained columns. */
export interface OwlStatRecord {
  statGaga?: number;
  statGoz?: number;
  statKulak?: number;
  statKanat?: number;
  statPence?: number;
  statGagaBase?: number | null;
  statGozBase?: number | null;
  statKulakBase?: number | null;
  statKanatBase?: number | null;
  statPenceBase?: number | null;
  statGagaTrained?: number | null;
  statGozTrained?: number | null;
  statKulakTrained?: number | null;
  statKanatTrained?: number | null;
  statPenceTrained?: number | null;
}

const STAT_KEYS: OwlStatKey[] = ['gaga', 'goz', 'kulak', 'kanat', 'pence'];

const BASE_FIELD: Record<OwlStatKey, keyof OwlStatRecord> = {
  gaga: 'statGagaBase',
  goz: 'statGozBase',
  kulak: 'statKulakBase',
  kanat: 'statKanatBase',
  pence: 'statPenceBase',
};

const TRAINED_FIELD: Record<OwlStatKey, keyof OwlStatRecord> = {
  gaga: 'statGagaTrained',
  goz: 'statGozTrained',
  kulak: 'statKulakTrained',
  kanat: 'statKanatTrained',
  pence: 'statPenceTrained',
};

const LEGACY_FIELD: Record<OwlStatKey, keyof OwlStatRecord> = {
  gaga: 'statGaga',
  goz: 'statGoz',
  kulak: 'statKulak',
  kanat: 'statKanat',
  pence: 'statPence',
};

export function hasSplitStats(owl: OwlStatRecord): boolean {
  return owl.statGagaBase != null;
}

function readBase(owl: OwlStatRecord, stat: OwlStatKey): number {
  const baseKey = BASE_FIELD[stat];
  const legacyKey = LEGACY_FIELD[stat];
  if (owl[baseKey] != null) return owl[baseKey] as number;
  return (owl[legacyKey] as number | undefined) ?? 1;
}

function readTrained(owl: OwlStatRecord, stat: OwlStatKey): number {
  if (!hasSplitStats(owl)) return 0;
  const trainedKey = TRAINED_FIELD[stat];
  return (owl[trainedKey] as number | undefined) ?? 0;
}

export function getBaseStat(owl: OwlStatRecord, stat: OwlStatKey): number {
  return readBase(owl, stat);
}

export function getTrainedStat(owl: OwlStatRecord, stat: OwlStatKey): number {
  return readTrained(owl, stat);
}

export function getEffectiveStat(owl: OwlStatRecord, stat: OwlStatKey): number {
  return readBase(owl, stat) + readTrained(owl, stat);
}

export function getBaseStats(owl: OwlStatRecord): AllStats {
  return {
    gaga: readBase(owl, 'gaga'),
    goz: readBase(owl, 'goz'),
    kulak: readBase(owl, 'kulak'),
    kanat: readBase(owl, 'kanat'),
    pence: readBase(owl, 'pence'),
  };
}

export function getTrainedStats(owl: OwlStatRecord): AllStats {
  return {
    gaga: readTrained(owl, 'gaga'),
    goz: readTrained(owl, 'goz'),
    kulak: readTrained(owl, 'kulak'),
    kanat: readTrained(owl, 'kanat'),
    pence: readTrained(owl, 'pence'),
  };
}

export function getEffectiveStats(owl: OwlStatRecord): AllStats {
  return {
    gaga: getEffectiveStat(owl, 'gaga'),
    goz: getEffectiveStat(owl, 'goz'),
    kulak: getEffectiveStat(owl, 'kulak'),
    kanat: getEffectiveStat(owl, 'kanat'),
    pence: getEffectiveStat(owl, 'pence'),
  };
}

export function getAvgEffectiveStat(owl: OwlStatRecord): number {
  const stats = getEffectiveStats(owl);
  return (stats.gaga + stats.goz + stats.kulak + stats.kanat + stats.pence) / 5;
}

/** Legacy kolonları base+trained toplamına eşitle (geçiş güvenliği). */
export function syncLegacyStatColumns(owl: OwlStatRecord): void {
  for (const stat of STAT_KEYS) {
    const legacyKey = LEGACY_FIELD[stat];
    owl[legacyKey] = getEffectiveStat(owl, stat);
  }
}

export function setBaseStats(owl: OwlStatRecord, base: AllStats, trained: AllStats = {
  gaga: 0, goz: 0, kulak: 0, kanat: 0, pence: 0,
}): void {
  owl.statGagaBase = base.gaga;
  owl.statGozBase = base.goz;
  owl.statKulakBase = base.kulak;
  owl.statKanatBase = base.kanat;
  owl.statPenceBase = base.pence;
  owl.statGagaTrained = trained.gaga;
  owl.statGozTrained = trained.goz;
  owl.statKulakTrained = trained.kulak;
  owl.statKanatTrained = trained.kanat;
  owl.statPenceTrained = trained.pence;
  syncLegacyStatColumns(owl);
}

export function applyTrainedDelta(owl: OwlStatRecord, stat: OwlStatKey, delta: number): void {
  if (!hasSplitStats(owl)) {
    const legacyKey = LEGACY_FIELD[stat];
    const current = (owl[legacyKey] as number | undefined) ?? 1;
    setBaseStats(owl, getBaseStats(owl), getTrainedStats(owl));
    owl[BASE_FIELD[stat]] = current;
    owl[TRAINED_FIELD[stat]] = 0;
  }
  const trainedKey = TRAINED_FIELD[stat];
  const next = Math.max(0, ((owl[trainedKey] as number | undefined) ?? 0) + delta);
  owl[trainedKey] = next;
  syncLegacyStatColumns(owl);
}

function rollStatByTier(tier: number): number {
  const band = STAT_ROLL_BANDS[tier];
  if (!band) return Math.floor(Math.random() * 8) + 4;

  const totalWeight = STAT_ROLL_WEIGHT_LOW + STAT_ROLL_WEIGHT_MID + STAT_ROLL_WEIGHT_HIGH;
  const roll = Math.random() * totalWeight;

  let [min, max]: [number, number] = band.low;
  if (roll >= STAT_ROLL_WEIGHT_LOW + STAT_ROLL_WEIGHT_MID) {
    [min, max] = band.high;
  } else if (roll >= STAT_ROLL_WEIGHT_LOW) {
    [min, max] = band.mid;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Tier bandından base stat seti üretir (encounter/tame/migration). */
export function rollBaseStatsForTier(tier: number): AllStats {
  return {
    gaga: rollStatByTier(tier),
    goz: rollStatByTier(tier),
    kulak: rollStatByTier(tier),
    kanat: rollStatByTier(tier),
    pence: rollStatByTier(tier),
  };
}

/** Prisma owl.create/update için base+trained+legacy alanları. */
export function buildOwlStatWriteData(base: AllStats, trained: AllStats = {
  gaga: 0, goz: 0, kulak: 0, kanat: 0, pence: 0,
}): Record<string, number> {
  const owl: OwlStatRecord = {};
  setBaseStats(owl, base, trained);
  return {
    statGagaBase: owl.statGagaBase!,
    statGozBase: owl.statGozBase!,
    statKulakBase: owl.statKulakBase!,
    statKanatBase: owl.statKanatBase!,
    statPenceBase: owl.statPenceBase!,
    statGagaTrained: owl.statGagaTrained!,
    statGozTrained: owl.statGozTrained!,
    statKulakTrained: owl.statKulakTrained!,
    statKanatTrained: owl.statKanatTrained!,
    statPenceTrained: owl.statPenceTrained!,
    statGaga: owl.statGaga!,
    statGoz: owl.statGoz!,
    statKulak: owl.statKulak!,
    statKanat: owl.statKanat!,
    statPence: owl.statPence!,
  };
}

export function trainedFieldForStat(stat: OwlStatKey): keyof OwlStatRecord {
  return TRAINED_FIELD[stat];
}

export function legacyFieldForStat(stat: OwlStatKey): keyof OwlStatRecord {
  return LEGACY_FIELD[stat];
}

/** Eski tamir/HP meta kalıntısı — main baykuşu oynanabilir vitallere çeker. */
export async function refreshMainOwlVitalsIfNeeded(
  prisma: import('@prisma/client').PrismaClient,
  playerId: string,
): Promise<void> {
  const owl = await prisma.owl.findFirst({
    where: { ownerId: playerId, isMain: true },
    select: { id: true, hp: true, hpMax: true, effectiveness: true },
  });
  if (!owl) return;
  if (owl.hp >= owl.hpMax && owl.effectiveness >= 100) return;
  await prisma.owl.update({
    where: { id: owl.id },
    data: {
      hp: owl.hpMax,
      ...(owl.effectiveness < 100 ? { effectiveness: 100 } : {}),
    },
  });
}
