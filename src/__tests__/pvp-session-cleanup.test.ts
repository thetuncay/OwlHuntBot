import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  closeStalePendingPvpSessions,
  closePvpSessionIfPending,
  isPlayerBlockedForMainSwitch,
} from '../systems/pvp';
import { PVP_DUEL_INVITE_TTL_MS } from '../config';

describe('pvp session cleanup', () => {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findFirst = vi.fn();
  const prisma = { pvpSession: { updateMany, findFirst } } as any;
  const redis = { get: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closeStalePendingPvpSessions uses invite TTL cutoff', async () => {
    await closeStalePendingPvpSessions(prisma);
    const where = updateMany.mock.calls[0]![0].where;
    const cutoff = where.createdAt.lt as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(PVP_DUEL_INVITE_TTL_MS);
    expect(where.status).toBe('pending');
  });

  it('closePvpSessionIfPending only closes pending session', async () => {
    await closePvpSessionIfPending(prisma, 'sess-1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'sess-1', status: 'pending' },
      data: expect.objectContaining({ status: 'finished' }),
    });
  });

  it('isPlayerBlockedForMainSwitch returns true when redis lock exists', async () => {
    redis.get.mockResolvedValue('1');
    await expect(isPlayerBlockedForMainSwitch(prisma, redis, 'user-1')).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('isPlayerBlockedForMainSwitch returns false when no lock and no session', async () => {
    redis.get.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    await expect(isPlayerBlockedForMainSwitch(prisma, redis, 'user-1')).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalled();
  });
});
