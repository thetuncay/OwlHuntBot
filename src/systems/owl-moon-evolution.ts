/**
 * Baykuş moon tier evrim motoru.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { resolveMoonTierFromPower } from '../config/owl-moon-tier';
import { getEffectiveStats, type OwlStatRecord } from '../utils/owl-stats';
import { OWL_SPECIES } from '../config';

export interface EvolutionHistoryEntry {
  moonTier: number;
  unlockedAt: string;
}

export interface MoonEvolutionResult {
  owlId: string;
  ownerId: string;
  speciesTier: number;
  displayName: string;
  oldMoonTier: number;
  newMoonTier: number;
  power: number;
}

type OwlMoonRow = OwlStatRecord & {
  id: string;
  ownerId: string;
  species: string;
  nickname: string | null;
  tier: number;
  moonTier?: number;
  moonTierPeak?: number;
  evolutionHistory?: Prisma.JsonValue;
};

export function calcOwlStatSumPower(owl: OwlStatRecord): number {
  const s = getEffectiveStats(owl);
  return s.gaga + s.goz + s.kulak + s.kanat + s.pence;
}

/** UI ve senkron için anlık güçten ay kademesi (DB moonTier yerine bunu kullanın). */
export function resolveOwlMoonTierFromStats(owl: OwlStatRecord): number {
  return resolveMoonTierFromPower(calcOwlStatSumPower(owl));
}

export function parseEvolutionHistory(raw: Prisma.JsonValue | null | undefined): EvolutionHistoryEntry[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { moonTier: number; unlockedAt: string } =>
      typeof e === 'object' && e !== null && 'moonTier' in e && 'unlockedAt' in e)
    .map((e) => ({ moonTier: Number(e.moonTier), unlockedAt: String(e.unlockedAt) }));
}

function speciesDisplayName(owl: { species: string; nickname: string | null }): string {
  return owl.nickname?.trim() || owl.species;
}

function buildHistoryUpTo(moonTier: number, existing: EvolutionHistoryEntry[]): EvolutionHistoryEntry[] {
  const byTier = new Map(existing.map((e) => [e.moonTier, e]));
  const now = new Date().toISOString();
  for (let t = 1; t <= moonTier; t++) {
    if (!byTier.has(t)) {
      byTier.set(t, { moonTier: t, unlockedAt: now });
    }
  }
  return [...byTier.values()]
    .filter((e) => e.moonTier <= moonTier)
    .sort((a, b) => a.moonTier - b.moonTier);
}

export async function recordOwlMoonDexUnlocks(
  prisma: PrismaClient | Prisma.TransactionClient,
  playerId: string,
  speciesTier: number,
  upToMoonTier: number,
): Promise<void> {
  for (let moonTier = 1; moonTier <= upToMoonTier; moonTier++) {
    await prisma.playerOwlPrestigeDex.upsert({
      where: {
        playerId_speciesTier_moonTier: { playerId, speciesTier, moonTier },
      },
      create: { playerId, speciesTier, moonTier },
      update: {},
    });
  }
}

export async function syncOwlMoonTier(
  prisma: PrismaClient | Prisma.TransactionClient,
  owl: OwlMoonRow,
  opts?: { notifyOnlyOnIncrease?: boolean },
): Promise<MoonEvolutionResult | null> {
  const power = calcOwlStatSumPower(owl);
  const targetTier = resolveMoonTierFromPower(power);
  const currentTier = owl.moonTier ?? 1;
  const history = parseEvolutionHistory(owl.evolutionHistory);
  const needsHistory = history.length < targetTier;

  if (owlMoonTierInSync(owl, targetTier, currentTier, needsHistory)) {
    return null;
  }

  const oldMoonTier = currentTier;
  const newMoonTier = targetTier;
  const fullHistory = buildHistoryUpTo(newMoonTier, parseEvolutionHistory(owl.evolutionHistory));

  await prisma.owl.update({
    where: { id: owl.id },
    data: {
      moonTier: newMoonTier,
      moonTierPeak: Math.max(owl.moonTierPeak ?? 1, targetTier),
      evolutionHistory: fullHistory as unknown as Prisma.InputJsonValue,
    },
  });

  await recordOwlMoonDexUnlocks(prisma, owl.ownerId, owl.tier, newMoonTier);

  if (opts?.notifyOnlyOnIncrease && newMoonTier <= oldMoonTier) {
    return null;
  }
  if (newMoonTier <= oldMoonTier) {
    return null;
  }

  return {
    owlId: owl.id,
    ownerId: owl.ownerId,
    speciesTier: owl.tier,
    displayName: speciesDisplayName(owl),
    oldMoonTier,
    newMoonTier,
    power,
  };
}

export async function checkAndApplyMoonEvolution(
  prisma: PrismaClient,
  owlId: string,
): Promise<MoonEvolutionResult | null> {
  const owl = await prisma.owl.findUnique({ where: { id: owlId } });
  if (!owl) return null;
  return syncOwlMoonTier(prisma, owl as OwlMoonRow, { notifyOnlyOnIncrease: true });
}

export function speciesShortName(speciesTier: number): string {
  const sp = OWL_SPECIES.find((s) => s.tier === speciesTier);
  if (!sp) return `Tür ${speciesTier}`;
  const parts = sp.name.split(' ');
  const short = parts[0] ?? sp.name;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export interface OwlMoonDexEntry {
  speciesTier: number;
  moonTier: number;
  firstUnlockedAt: Date;
}

export async function getPlayerOwlMoonDex(
  prisma: PrismaClient,
  playerId: string,
): Promise<OwlMoonDexEntry[]> {
  const rows = await prisma.playerOwlPrestigeDex.findMany({
    where: { playerId },
    orderBy: [{ speciesTier: 'asc' }, { moonTier: 'asc' }],
  });
  return rows.map((r) => ({
    speciesTier: r.speciesTier,
    moonTier: r.moonTier,
    firstUnlockedAt: r.firstUnlockedAt,
  }));
}

export async function initOwlMoonTierOnCreate(
  prisma: PrismaClient | Prisma.TransactionClient,
  playerId: string,
  owlId: string,
  speciesTier: number,
  power: number,
): Promise<void> {
  const moonTier = resolveMoonTierFromPower(power);
  const history = buildHistoryUpTo(moonTier, []);
  await prisma.owl.update({
    where: { id: owlId },
    data: {
      moonTier,
      moonTierPeak: moonTier,
      evolutionHistory: history as unknown as Prisma.InputJsonValue,
    },
  });
  await recordOwlMoonDexUnlocks(prisma, playerId, speciesTier, moonTier);
}

function owlMoonTierInSync(
  owl: OwlMoonRow,
  targetTier: number,
  currentTier: number,
  needsHistory: boolean,
): boolean {
  return targetTier === currentTier && !needsHistory && (owl.moonTierPeak ?? 1) >= targetTier;
}

export async function reconcilePlayerOwlMoonTiers(
  prisma: PrismaClient,
  playerId: string,
): Promise<void> {
  const owls = await prisma.owl.findMany({ where: { ownerId: playerId } });
  const pending = owls.filter((owl) => {
    const power = calcOwlStatSumPower(owl);
    const targetTier = resolveMoonTierFromPower(power);
    const currentTier = owl.moonTier ?? 1;
    const needsHistory = parseEvolutionHistory(owl.evolutionHistory).length < targetTier;
    return !owlMoonTierInSync(owl as OwlMoonRow, targetTier, currentTier, needsHistory);
  });
  if (pending.length === 0) return;
  await Promise.all(pending.map((owl) => syncOwlMoonTier(prisma, owl as OwlMoonRow)));
}
