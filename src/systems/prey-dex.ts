/**
 * prey-dex.ts — Ömür boyu av keşif kaydı (zoo / koleksiyon defteri)
 */
import type { PrismaClient } from '@prisma/client';
import { PREY } from '../config';
import { fireQuest } from './quest-tracker';

export interface PreyDexRow {
  preyName:      string;
  discovered:    boolean;
  totalCaught:   number;
  inventoryQty:  number;
}

function parsePreySold(raw: unknown): { name: string; qty: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const name = 'name' in row ? String((row as { name: unknown }).name) : '';
      const qty = 'qty' in row ? Number((row as { qty: unknown }).qty) : 0;
      if (!name || !Number.isFinite(qty) || qty <= 0) return null;
      return { name: name.toLowerCase(), qty: Math.floor(qty) };
    })
    .filter((r): r is { name: string; qty: number } => r != null);
}

/** Satış geçmişi + envanterden eksik dex kayıtlarını tamamla (idempotent). */
export async function syncPreyDexFromHistory(
  prisma: PrismaClient,
  playerId: string,
): Promise<void> {
  const [dexRows, invRows, sellRows] = await Promise.all([
    prisma.playerPreyDex.findMany({ where: { playerId } }),
    prisma.inventoryItem.findMany({ where: { ownerId: playerId, itemType: 'Av' } }),
    prisma.sellEvent.findMany({
      where: { userId: playerId },
      select: { preySold: true },
    }),
  ]);

  const soldTotals = new Map<string, number>();
  for (const sell of sellRows) {
    for (const p of parsePreySold(sell.preySold)) {
      soldTotals.set(p.name, (soldTotals.get(p.name) ?? 0) + p.qty);
    }
  }

  const lifetime = new Map<string, number>();
  for (const row of dexRows) {
    lifetime.set(row.preyName, row.totalCaught);
  }
  for (const [name, sold] of soldTotals) {
    lifetime.set(name, Math.max(lifetime.get(name) ?? 0, sold));
  }
  for (const inv of invRows) {
    const key = inv.itemName.toLowerCase();
    const sold = soldTotals.get(key) ?? 0;
    lifetime.set(key, Math.max(lifetime.get(key) ?? 0, inv.quantity + sold));
  }

  const upserts = PREY.map((p) => {
    const total = lifetime.get(p.name) ?? 0;
    if (total <= 0) return null;
    const existing = dexRows.find((d) => d.preyName === p.name)?.totalCaught ?? 0;
    return prisma.playerPreyDex.upsert({
      where: { playerId_preyName: { playerId, preyName: p.name } },
      create: { playerId, preyName: p.name, totalCaught: total },
      update: { totalCaught: { set: Math.max(total, existing) } },
    });
  }).filter(Boolean);

  if (upserts.length > 0) {
    await Promise.all(upserts);
  }
}

/** Av yakalandığında dex kaydını artır. */
export async function recordPreyCatches(
  prisma: PrismaClient,
  playerId: string,
  preyNames: string[],
): Promise<void> {
  if (preyNames.length === 0) return;

  const counts = new Map<string, number>();
  for (const raw of preyNames) {
    const name = raw.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const existing = await prisma.playerPreyDex.findMany({
    where: { playerId, preyName: { in: [...counts.keys()] } },
    select: { preyName: true },
  });
  const known = new Set(existing.map((r) => r.preyName));
  let newDiscoveries = 0;
  for (const preyName of counts.keys()) {
    if (!known.has(preyName)) newDiscoveries++;
  }

  await Promise.all(
    [...counts.entries()].map(([preyName, qty]) =>
      prisma.playerPreyDex.upsert({
        where: { playerId_preyName: { playerId, preyName } },
        create: { playerId, preyName, totalCaught: qty },
        update: { totalCaught: { increment: qty } },
      }),
    ),
  );

  if (newDiscoveries > 0) {
    await fireQuest(prisma, playerId, 'zoo_new', newDiscoveries);
  }
}

/** Zoo UI için birleşik dex + envanter görünümü. */
export async function getPreyDexView(
  prisma: PrismaClient,
  playerId: string,
): Promise<PreyDexRow[]> {
  await syncPreyDexFromHistory(prisma, playerId);

  const [dexRows, invRows] = await Promise.all([
    prisma.playerPreyDex.findMany({ where: { playerId } }),
    prisma.inventoryItem.findMany({ where: { ownerId: playerId, itemType: 'Av' } }),
  ]);

  const dexMap = new Map(dexRows.map((r) => [r.preyName, r.totalCaught]));
  const invMap = new Map(invRows.map((r) => [r.itemName.toLowerCase(), r.quantity]));

  return PREY.map((p) => {
    const totalCaught = dexMap.get(p.name) ?? 0;
    const inventoryQty = invMap.get(p.name) ?? 0;
    return {
      preyName: p.name,
      discovered: totalCaught > 0,
      totalCaught,
      inventoryQty,
    };
  });
}
