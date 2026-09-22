import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { aggregateCommandRollup24h, getActiveUsers24h } from '../../ops/command-analytics';

export interface RetentionBaseline {
  generatedAt: string;
  totalPlayers: number;
  dauApprox: number;
  wauApprox: number;
  activeUsers24h: number;
  d1RetentionPct: number;
  d7RetentionPct: number;
  command24h: {
    total: number;
    failed: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

async function retentionForCohortDay(
  prisma: PrismaClient,
  cohortStart: Date,
  dayOffset: number,
): Promise<{ cohort: number; retained: number }> {
  const cohortEnd = plusDays(cohortStart, 1);
  const retainThreshold = plusDays(cohortStart, dayOffset);
  const players = await prisma.player.findMany({
    where: {
      createdAt: { gte: cohortStart, lt: cohortEnd },
    },
    select: { updatedAt: true },
  });
  const retained = players.filter((p) => p.updatedAt >= retainThreshold).length;
  return { cohort: players.length, retained };
}

export async function buildRetentionBaseline(
  prisma: PrismaClient,
  redis: Redis,
): Promise<RetentionBaseline> {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const yesterdayStart = plusDays(todayStart, -1);
  const sevenDaysAgoStart = plusDays(todayStart, -7);

  const [
    totalPlayers,
    dauApprox,
    wauApprox,
    d1,
    d7,
    activeUsers24h,
    command24h,
  ] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { updatedAt: { gte: plusDays(now, -1) } } }),
    prisma.player.count({ where: { updatedAt: { gte: plusDays(now, -7) } } }),
    retentionForCohortDay(prisma, yesterdayStart, 1),
    retentionForCohortDay(prisma, sevenDaysAgoStart, 7),
    getActiveUsers24h(redis),
    aggregateCommandRollup24h(redis),
  ]);

  const d1RetentionPct = d1.cohort > 0 ? Math.round((d1.retained / d1.cohort) * 1000) / 10 : 0;
  const d7RetentionPct = d7.cohort > 0 ? Math.round((d7.retained / d7.cohort) * 1000) / 10 : 0;

  return {
    generatedAt: now.toISOString(),
    totalPlayers,
    dauApprox,
    wauApprox,
    activeUsers24h,
    d1RetentionPct,
    d7RetentionPct,
    command24h: {
      total: command24h.total,
      failed: command24h.failed,
      avgLatencyMs: command24h.avgLatencyMs,
      p95LatencyMs: command24h.p95LatencyMs,
    },
  };
}
