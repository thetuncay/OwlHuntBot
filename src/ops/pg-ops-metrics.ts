/**
 * pg-ops-metrics.ts — Lightweight PostgreSQL ops probes (snapshot only).
 */
import type { PrismaClient } from '@prisma/client';

export interface PgOpsMetrics {
  connections: number;
  queryMs: number;
}

export async function collectPgOpsMetrics(prisma: PrismaClient): Promise<PgOpsMetrics> {
  const start = Date.now();
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    return {
      connections: rows[0]?.count ?? 0,
      queryMs: Date.now() - start,
    };
  } catch {
    return { connections: -1, queryMs: Date.now() - start };
  }
}

export async function countMarketRisk24h(prisma: PrismaClient): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000);
  try {
    return await prisma.marketSuspiciousLog.count({
      where: { createdAt: { gte: since } },
    });
  } catch {
    return 0;
  }
}

export async function countBannedUsers(redis: import('ioredis').Redis): Promise<number> {
  let count = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'ban:*', 'COUNT', 500);
    cursor = next;
    count += keys.length;
  } while (cursor !== '0');
  return count;
}
