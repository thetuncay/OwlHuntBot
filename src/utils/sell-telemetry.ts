/**
 * Sell komut telemetry — rollback için Redis (7 gün) + PG SellEvent (7 gün).
 */
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { SELL_ROLLBACK_RETENTION_MS, SELL_ROLLBACK_RETENTION_SEC } from '../config/sell-rollback';

const SELL_LOG_KEY = 'telemetry:sell:log';
const MAX_SELL_LOG = 50_000;

export interface SellTelemetryPrey {
  name: string;
  qty: number;
}

export interface SellTelemetryEvent {
  id: string;
  userId: string;
  guildId: string | null;
  coinsGained: number;
  preySold: SellTelemetryPrey[];
  preyQty: number;
  source: 'prefix' | 'slash';
  at: string;
}

export async function recordSellTelemetry(
  redis: Redis,
  prisma: PrismaClient,
  event: Omit<SellTelemetryEvent, 'id' | 'at'> & { id?: string; at?: string },
): Promise<SellTelemetryEvent> {
  const payload: SellTelemetryEvent = {
    id: event.id ?? randomUUID(),
    userId: event.userId,
    guildId: event.guildId,
    coinsGained: event.coinsGained,
    preySold: event.preySold,
    preyQty: event.preyQty,
    source: event.source,
    at: event.at ?? new Date().toISOString(),
  };

  const score = new Date(payload.at).getTime();
  await redis
    .multi()
    .zadd(SELL_LOG_KEY, score, JSON.stringify(payload))
    .expire(SELL_LOG_KEY, SELL_ROLLBACK_RETENTION_SEC)
    .exec()
    .catch(() => null);

  const size = await redis.zcard(SELL_LOG_KEY).catch(() => 0);
  if (size > MAX_SELL_LOG) {
    await redis.zremrangebyrank(SELL_LOG_KEY, 0, size - MAX_SELL_LOG - 1).catch(() => null);
  }

  await prisma.sellEvent
    .create({
      data: {
        id: payload.id,
        userId: payload.userId,
        guildId: payload.guildId,
        coinsGained: payload.coinsGained,
        preySold: JSON.parse(JSON.stringify(payload.preySold)),
        preyQty: payload.preyQty,
        source: payload.source,
        createdAt: new Date(payload.at),
      },
    })
    .catch(() => null);

  const cutoff = new Date(Date.now() - SELL_ROLLBACK_RETENTION_MS);
  await prisma.sellEvent
    .deleteMany({ where: { createdAt: { lt: cutoff } } })
    .catch(() => null);

  await prisma.commandEvent
    .create({
      data: {
        userId: payload.userId,
        guildId: payload.guildId ?? '',
        command: 'sell',
        category: 'owl_command',
      },
    })
    .catch(() => null);

  return payload;
}

export async function fetchSellTelemetryInWindow(
  redis: Redis,
  startMs: number,
  endMs: number,
): Promise<SellTelemetryEvent[]> {
  const raw = await redis.zrangebyscore(SELL_LOG_KEY, startMs, endMs).catch(() => [] as string[]);
  const out: SellTelemetryEvent[] = [];
  for (const line of raw) {
    try {
      out.push(JSON.parse(line) as SellTelemetryEvent);
    } catch {
      // skip
    }
  }
  return out;
}
