/**
 * Sell rollback — 1 saat / 1 gün / 1 hafta pencerelerinde w sell / owl sell geri alma.
 */
import { formatCoinLabel } from '../config/ui-emojis';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { SellRollbackPeriod } from '../config/sell-rollback';
import {
  applyCoinDeltaInRedis,
  invalidatePlayerState,
  mirrorInventoryFromPg,
  rehydratePlayerState,
} from '../state/player-state';
import {
  fetchSellTelemetryInWindow,
  type SellTelemetryPrey,
} from '../utils/sell-telemetry';

export interface RollbackWindow {
  period: SellRollbackPeriod;
  start: Date;
  end: Date;
  label: string;
}

export interface PreyRow {
  name: string;
  qty: number;
}

export interface SellRollbackRecord {
  key: string;
  eventId: string | null;
  userId: string;
  at: Date;
  coinsGained: number;
  preySold: PreyRow[];
  source: 'sell_event' | 'sell_prey' | 'redis';
}

export interface SellRollbackPlayerResult {
  userId: string;
  displayName: string | null;
  username: string | null;
  sellCount: number;
  clawback: number;
  coinsBefore: number;
  coinsAfter: number;
  preyRestore: PreyRow[];
  sells: Array<{ at: string; coins: number; source: string }>;
}

export interface SellRollbackPreview {
  window: RollbackWindow;
  records: SellRollbackRecord[];
  skippedAlreadyRolledBack: number;
  byUser: SellRollbackPlayerResult[];
  totalClawback: number;
}

export interface SellRollbackApplyResult extends SellRollbackPreview {
  batchId: string;
  applied: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parsePrey(raw: unknown): PreyRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null;
      const name = 'name' in row ? String((row as { name: unknown }).name) : '';
      const qty = 'qty' in row ? Number((row as { qty: unknown }).qty) : 0;
      if (!name || !Number.isFinite(qty) || qty <= 0) return null;
      return { name, qty: Math.floor(qty) };
    })
    .filter((x): x is PreyRow => x !== null);
}

function mergePrey(target: PreyRow[], add: PreyRow[]): void {
  for (const p of add) {
    const row = target.find((x) => x.name === p.name);
    if (row) row.qty += p.qty;
    else target.push({ ...p });
  }
}

function utcDayBounds(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(`${dateStr}T23:59:59.999Z`);
  return { start, end };
}

function utcWeekBounds(dateStr: string): { start: Date; end: Date } {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + mondayOffset));
  const end = new Date(start.getTime() + 7 * 24 * 3600_000 - 1);
  return { start, end };
}

function formatDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Rollback penceresi: 1h son saat, 1d UTC gün, 1w UTC hafta (Pzt–Paz). */
export function resolveRollbackWindow(opts: {
  period: SellRollbackPeriod;
  date?: string;
  until?: Date;
}): RollbackWindow {
  const until = opts.until ?? new Date();
  const dateStr = opts.date?.trim();

  if (opts.period === '1h') {
    const start = new Date(until.getTime() - 3600_000);
    return {
      period: '1h',
      start,
      end: until,
      label: `Son 1 saat (${start.toISOString()} — ${until.toISOString()})`,
    };
  }

  const anchor = dateStr && DATE_RE.test(dateStr) ? dateStr : formatDateUtc(until);

  if (opts.period === '1d') {
    const { start, end } = utcDayBounds(anchor);
    return {
      period: '1d',
      start,
      end,
      label: `Gün ${anchor} (UTC)`,
    };
  }

  const { start, end } = utcWeekBounds(anchor);
  return {
    period: '1w',
    start,
    end,
    label: `Hafta ${formatDateUtc(start)} — ${formatDateUtc(end)} (UTC)`,
  };
}

async function isRecordAlreadyRolledBack(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  const recent = await prisma.auditLog.findMany({
    where: { action: 'sell_cmd_rollback' },
    select: { after: true },
    take: 300,
    orderBy: { createdAt: 'desc' },
  });
  for (const log of recent) {
    const keys = (log.after as { sellKeys?: string[] } | null)?.sellKeys ?? [];
    if (keys.includes(key)) return true;
  }
  return false;
}

export async function collectSellRollbackRecords(
  prisma: PrismaClient,
  redis: Redis,
  window: RollbackWindow,
): Promise<SellRollbackRecord[]> {
  const records: SellRollbackRecord[] = [];
  const seen = new Set<string>();

  const sellEvents = await prisma.sellEvent.findMany({
    where: {
      createdAt: { gte: window.start, lte: window.end },
      rolledBackAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const e of sellEvents) {
    const key = `sell_event:${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      key,
      eventId: e.id,
      userId: e.userId,
      at: e.createdAt,
      coinsGained: e.coinsGained,
      preySold: parsePrey(e.preySold),
      source: 'sell_event',
    });
  }

  const audits = await prisma.auditLog.findMany({
    where: {
      action: 'sell_prey',
      createdAt: { gte: window.start, lte: window.end },
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const a of audits) {
    const after = a.after as { coinsGained?: number; preySold?: unknown } | null;
    const coins = Math.round(Number(after?.coinsGained ?? 0));
    if (coins <= 0) continue;
    const key = `audit:${a.id}`;
    const dup = records.some(
      (r) =>
        r.userId === a.playerId
        && Math.abs(r.at.getTime() - a.createdAt.getTime()) < 3000,
    );
    if (dup || seen.has(key)) continue;
    seen.add(key);
    records.push({
      key,
      eventId: null,
      userId: a.playerId,
      at: a.createdAt,
      coinsGained: coins,
      preySold: parsePrey(after?.preySold),
      source: 'sell_prey',
    });
  }

  const redisEvents = await fetchSellTelemetryInWindow(
    redis,
    window.start.getTime(),
    window.end.getTime(),
  );
  for (const e of redisEvents) {
    const key = `redis:${e.id}`;
    const dup = records.some(
      (r) =>
        r.userId === e.userId
        && Math.abs(r.at.getTime() - new Date(e.at).getTime()) < 3000,
    );
    if (dup || seen.has(key)) continue;
    seen.add(key);
    records.push({
      key,
      eventId: null,
      userId: e.userId,
      at: new Date(e.at),
      coinsGained: Math.round(e.coinsGained),
      preySold: e.preySold.map((p: SellTelemetryPrey) => ({ name: p.name, qty: p.qty })),
      source: 'redis',
    });
  }

  records.sort((a, b) => a.at.getTime() - b.at.getTime());
  return records;
}

async function restorePrey(
  tx: Prisma.TransactionClient,
  userId: string,
  prey: PreyRow[],
): Promise<void> {
  for (const p of prey) {
    await tx.inventoryItem.upsert({
      where: { ownerId_itemName: { ownerId: userId, itemName: p.name } },
      create: {
        ownerId: userId,
        itemName: p.name,
        itemType: 'Av',
        rarity: 'Common',
        quantity: p.qty,
      },
      update: { quantity: { increment: p.qty } },
    });
  }
}

export async function previewSellRollback(
  prisma: PrismaClient,
  redis: Redis,
  window: RollbackWindow,
): Promise<SellRollbackPreview> {
  const records = await collectSellRollbackRecords(prisma, redis, window);
  let skippedAlreadyRolledBack = 0;

  const buckets = new Map<
    string,
    { coins: number; prey: PreyRow[]; sells: SellRollbackRecord[] }
  >();

  for (const r of records) {
    if (await isRecordAlreadyRolledBack(prisma, r.key)) {
      skippedAlreadyRolledBack++;
      continue;
    }
    const bucket = buckets.get(r.userId) ?? { coins: 0, prey: [], sells: [] };
    bucket.coins += r.coinsGained;
    mergePrey(bucket.prey, r.preySold);
    bucket.sells.push(r);
    buckets.set(r.userId, bucket);
  }

  const byUser: SellRollbackPlayerResult[] = [];
  let totalClawback = 0;

  for (const [userId, bucket] of buckets) {
    if (bucket.sells.length === 0) continue;
    const player = await prisma.player.findUnique({
      where: { id: userId },
      select: { coins: true },
    });
    if (!player) continue;

    const applied = Math.min(player.coins, bucket.coins);
    if (applied <= 0) continue;

    const reg = await prisma.playerRegistration.findFirst({
      where: { userId },
      select: { username: true, displayName: true },
    });

    totalClawback += applied;
    byUser.push({
      userId,
      displayName: reg?.displayName ?? null,
      username: reg?.username ?? null,
      sellCount: bucket.sells.length,
      clawback: applied,
      coinsBefore: player.coins,
      coinsAfter: player.coins - applied,
      preyRestore: bucket.prey,
      sells: bucket.sells.map((s) => ({
        at: s.at.toISOString(),
        coins: s.coinsGained,
        source: s.source,
      })),
    });
  }

  return {
    window,
    records,
    skippedAlreadyRolledBack,
    byUser,
    totalClawback,
  };
}

export async function applySellRollback(
  prisma: PrismaClient,
  redis: Redis,
  window: RollbackWindow,
): Promise<SellRollbackApplyResult> {
  const preview = await previewSellRollback(prisma, redis, window);
  const batchId = randomUUID();

  if (preview.byUser.length === 0) {
    return { ...preview, batchId, applied: false };
  }

  for (const row of preview.byUser) {
    const activeRecords: SellRollbackRecord[] = [];
    for (const r of preview.records) {
      if (r.userId !== row.userId) continue;
      if (await isRecordAlreadyRolledBack(prisma, r.key)) continue;
      activeRecords.push(r);
    }
    if (activeRecords.length === 0) continue;

    const prey: PreyRow[] = [];
    for (const r of activeRecords) mergePrey(prey, r.preySold);

    const player = await prisma.player.findUnique({
      where: { id: row.userId },
      select: { coins: true },
    });
    if (!player) continue;

    const applied = Math.min(player.coins, activeRecords.reduce((s, r) => s + r.coinsGained, 0));
    if (applied <= 0) continue;

    await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: row.userId },
        data: { coins: { decrement: applied } },
      });
      if (prey.length > 0) {
        await restorePrey(tx, row.userId, prey);
      }
      await tx.auditLog.create({
        data: {
          playerId: row.userId,
          action: 'sell_cmd_rollback',
          before: {
            coins: player.coins,
            sellCount: activeRecords.length,
            period: window.period,
            windowStart: window.start.toISOString(),
            windowEnd: window.end.toISOString(),
            batchId,
          },
          after: {
            coins: player.coins - applied,
            clawback: applied,
            preyRestored: JSON.parse(JSON.stringify(prey)),
            sellKeys: activeRecords.map((s) => s.key),
            batchId,
          },
        },
      });

      const eventIds = activeRecords
        .map((r) => r.eventId)
        .filter((id): id is string => id !== null);
      if (eventIds.length > 0) {
        await tx.sellEvent.updateMany({
          where: { id: { in: eventIds } },
          data: { rolledBackAt: new Date(), rollbackBatchId: batchId },
        });
      }
    });

    await invalidatePlayerState(redis, row.userId);
    await rehydratePlayerState(redis, prisma, row.userId);
    await mirrorInventoryFromPg(redis, prisma, row.userId);
    await applyCoinDeltaInRedis(redis, row.userId, -applied, prisma);
  }

  return { ...preview, batchId, applied: true };
}

export function formatRollbackPreviewText(preview: SellRollbackPreview): string {
  const lines: string[] = [
    `**Sell rollback önizleme**`,
    preview.window.label,
    `Kayıt: **${preview.records.length}** sell | Atlanan (zaten geri alınmış): **${preview.skippedAlreadyRolledBack}**`,
    `Toplam clawback: ${formatCoinLabel(preview.totalClawback)} (${preview.byUser.length} oyuncu)`,
    '',
  ];

  if (preview.byUser.length === 0) {
    lines.push('_Bu pencerede geri alınacak sell kaydı yok._');
    return lines.join('\n');
  }

  for (const u of preview.byUser) {
    const name = u.displayName ?? u.username ?? u.userId;
    lines.push(
      `• **${name}** — ${u.sellCount} sell, ${formatCoinLabel(-u.clawback)} (${formatCoinLabel(u.coinsBefore)} → ${formatCoinLabel(u.coinsAfter)})`,
    );
  }

  return lines.join('\n');
}

export async function getSellRollbackRetentionStats(
  prisma: PrismaClient,
): Promise<{ total: number; last1h: number; last1d: number; last7d: number; oldest: string | null }> {
  const now = Date.now();
  const [total, last1h, last1d, last7d, oldestRow] = await Promise.all([
    prisma.sellEvent.count(),
    prisma.sellEvent.count({ where: { createdAt: { gte: new Date(now - 3600_000) } } }),
    prisma.sellEvent.count({ where: { createdAt: { gte: new Date(now - 24 * 3600_000) } } }),
    prisma.sellEvent.count({ where: { createdAt: { gte: new Date(now - 7 * 24 * 3600_000) } } }),
    prisma.sellEvent.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  return {
    total,
    last1h,
    last1d,
    last7d,
    oldest: oldestRow?.createdAt.toISOString() ?? null,
  };
}
