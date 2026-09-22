import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ensureDailyQuests,
  pickDailyQuestTypes,
  trackQuestProgress,
} from '../systems/daily-quests';
import {
  DAILY_QUESTS_PER_DAY,
  DAILY_MARKET_QUESTS_MIN,
  MARKET_HARD_QUEST_TYPES,
  isMarketDailyQuestType,
} from '../config/daily-quest-pool';

function mockPrisma() {
  const quests = new Map<string, {
    id: string;
    playerId: string;
    type: string;
    target: number;
    current: number;
    rewardCoins: number;
    rewardXp: number;
    meta: string | null;
    resetAt: Date;
    isClaimed: boolean;
  }>();

  let idSeq = 0;
  const key = (playerId: string, type: string, resetAt: Date) =>
    `${playerId}:${type}:${resetAt.toISOString()}`;

  return {
    dailyQuest: {
      upsert: vi.fn(async ({ where, create }: {
        where: { playerId_type_resetAt: { playerId: string; type: string; resetAt: Date } };
        create: {
          playerId: string;
          type: string;
          target: number;
          rewardCoins: number;
          rewardXp: number;
          meta?: string | null;
          resetAt: Date;
        };
      }) => {
        const k = key(
          where.playerId_type_resetAt.playerId,
          where.playerId_type_resetAt.type,
          where.playerId_type_resetAt.resetAt,
        );
        if (!quests.has(k)) {
          quests.set(k, {
            id: `q-${++idSeq}`,
            ...create,
            meta: create.meta ?? null,
            current: 0,
            isClaimed: false,
          });
        }
        return quests.get(k);
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: { in: string[] }; resetAt: { gt: Date }; isClaimed: boolean };
        data: { current: { increment: number } };
      }) => {
        let count = 0;
        for (const q of quests.values()) {
          if (
            where.id.in.includes(q.id)
            && q.resetAt > where.resetAt.gt
            && q.isClaimed === where.isClaimed
          ) {
            q.current += data.current.increment;
            count++;
          }
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { current: number } }) => {
        for (const q of quests.values()) {
          if (q.id === where.id) {
            q.current = data.current;
            return q;
          }
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: {
        where: { playerId: string; type?: string; resetAt: { gt: Date }; isClaimed?: boolean };
      }) => {
        const now = where.resetAt.gt;
        return [...quests.values()].filter((q) => {
          if (q.playerId !== where.playerId) return false;
          if (where.type && q.type !== where.type) return false;
          if (q.resetAt <= now) return false;
          if (where.isClaimed !== undefined && q.isClaimed !== where.isClaimed) return false;
          return true;
        });
      }),
      count: vi.fn(async ({ where }: {
        where: { playerId: string; resetAt: { gt: Date } };
      }) => {
        const now = where.resetAt.gt;
        return [...quests.values()].filter(
          (q) => q.playerId === where.playerId && q.resetAt > now,
        ).length;
      }),
    },
    _quests: quests,
  };
}

describe('daily-quests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'));
  });

  it('pickDailyQuestTypes returns 4 unique types per player/day', () => {
    const resetAt = new Date('2026-06-04T24:00:00.000Z');
    const types = pickDailyQuestTypes('player-a', resetAt);
    expect(types).toHaveLength(DAILY_QUESTS_PER_DAY);
    expect(new Set(types).size).toBe(DAILY_QUESTS_PER_DAY);
  });

  it('pickDailyQuestTypes always includes at least 2 market quests', () => {
    const resetAt = new Date('2026-06-04T24:00:00.000Z');
    for (let i = 0; i < 40; i++) {
      const types = pickDailyQuestTypes(`player-${i}`, resetAt);
      const marketCount = types.filter(isMarketDailyQuestType).length;
      expect(marketCount, `player-${i}: ${types.join(',')}`).toBeGreaterThanOrEqual(
        DAILY_MARKET_QUESTS_MIN,
      );
      for (const hard of MARKET_HARD_QUEST_TYPES) {
        expect(types).not.toContain(hard);
      }
    }
  });

  it('different players get different quest sets', () => {
    const resetAt = new Date('2026-06-04T24:00:00.000Z');
    const a = pickDailyQuestTypes('player-a', resetAt);
    const b = pickDailyQuestTypes('player-b', resetAt);
    expect(a).not.toEqual(b);
  });

  it('trackQuestProgress creates quests and increments progress on rolled type', async () => {
    const prisma = mockPrisma() as unknown as import('@prisma/client').PrismaClient;
    const playerId = 'player-1';

    await ensureDailyQuests(prisma, playerId);
    const seeded = await prisma.dailyQuest.findMany({
      where: { playerId, resetAt: { gt: new Date() } },
    } as never);
    expect(seeded).toHaveLength(DAILY_QUESTS_PER_DAY);
    const type = seeded[0]!.type as import('../config/daily-quest-pool').DailyQuestType;

    await trackQuestProgress(prisma, playerId, type, 1);
    await trackQuestProgress(prisma, playerId, type, 1);

    const rows = await prisma.dailyQuest.findMany({
      where: { playerId, resetAt: { gt: new Date() } },
    } as never);
    const quest = rows.find((q) => q.type === type);
    expect(quest?.current).toBe(2);
  });

  it('ensureDailyQuests creates exactly 4 quests', async () => {
    const prisma = mockPrisma() as unknown as import('@prisma/client').PrismaClient;
    const playerId = 'player-3';

    await ensureDailyQuests(prisma, playerId);
    await ensureDailyQuests(prisma, playerId);

    const rows = await prisma.dailyQuest.findMany({
      where: { playerId, resetAt: { gt: new Date() } },
    } as never);
    expect(rows).toHaveLength(DAILY_QUESTS_PER_DAY);
  });
});
