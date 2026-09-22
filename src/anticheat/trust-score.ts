import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { enqueueDbWrite } from '../utils/db-queue';
import { recordAnticheatEvent } from './audit-logger';
import { isAnticheatBehaviorLogEnabled, isAnticheatEnabled, isAnticheatTrustScoreEnabled } from './config';

const TRUST_CACHE_TTL_SEC = 300;
const TRUST_MAX = 100;

export function trustCacheKey(userId: string): string {
  return `trust:cache:${userId}`;
}

export async function setTrustScoreCache(redis: Redis, userId: string, score: number): Promise<void> {
  await redis
    .set(trustCacheKey(userId), String(Math.max(0, Math.min(TRUST_MAX, score))), 'EX', TRUST_CACHE_TTL_SEC)
    .catch(() => null);
}

export async function getTrustScore(redis: Redis, userId: string): Promise<number> {
  return resolveTrustScore(redis, userId);
}

/** Redis cache → DB fallback → varsayılan 100. */
export async function resolveTrustScore(
  redis: Redis,
  userId: string,
  prisma?: PrismaClient,
): Promise<number> {
  const raw = await redis.get(trustCacheKey(userId));
  if (raw !== null) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(TRUST_MAX, parsed));
  }
  if (prisma) {
    const row = await prisma.anticheatTrust.findUnique({
      where: { userId },
      select: { trustScore: true },
    });
    if (row) {
      await setTrustScoreCache(redis, userId, row.trustScore);
      return row.trustScore;
    }
  }
  return TRUST_MAX;
}

interface AutomationSignalInput {
  userId: string;
  guildId?: string | null;
  command: string;
}

export function observeAutomationSignal(redis: Redis, input: AutomationSignalInput): void {
  if (!isAnticheatEnabled()) return;

  if (isAnticheatBehaviorLogEnabled()) {
    recordAnticheatEvent({
      userId: input.userId,
      guildId: input.guildId,
      eventType: 'behavior_anomaly',
      severity: 2,
      detail: { command: input.command, source: 'flow_intent' },
    });
  }

  if (!isAnticheatTrustScoreEnabled()) return;

  enqueueDbWrite({
    type: 'upsertAnticheatTrust',
    userId: input.userId,
    trustDelta: -5,
    violationDelta: 1,
    setLastViolationNow: true,
  });
  void getTrustScore(redis, input.userId).then((current) =>
    setTrustScoreCache(redis, input.userId, current - 5),
  );
}

export async function regenerateTrustScores(prisma: PrismaClient, redis: Redis): Promise<number> {
  if (!isAnticheatEnabled() || !isAnticheatTrustScoreEnabled()) return 0;

  const batch = await prisma.anticheatTrust.findMany({
    where: { trustScore: { lt: TRUST_MAX } },
    select: { userId: true, trustScore: true },
    take: 1000,
  });
  if (batch.length === 0) return 0;

  for (const row of batch) {
    const next = Math.min(TRUST_MAX, row.trustScore + 1);
    await prisma.anticheatTrust.update({
      where: { userId: row.userId },
      data: { trustScore: next },
    });
    await redis.set(trustCacheKey(row.userId), String(next), 'EX', TRUST_CACHE_TTL_SEC);
  }

  return batch.length;
}
