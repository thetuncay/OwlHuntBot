import { describe, expect, it, vi } from 'vitest';
import { submitAnticheatAppeal } from '../anticheat/appeal';

describe('anticheat-appeal', () => {
  it('rejects short appeal text', async () => {
    const prisma = {} as any;
    const res = await submitAnticheatAppeal(prisma, 'u1', 'kisa');
    expect(res.ok).toBe(false);
  });

  it('creates appeal when tier4 punishment exists', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      tier: 4,
      appealed: false,
      overturned: false,
    });
    const tx = vi.fn().mockResolvedValue([]);
    const prisma = {
      anticheatPunishment: {
        findFirst,
        update: vi.fn().mockResolvedValue({}),
      },
      anticheatAppeal: {
        create: vi.fn().mockResolvedValue({}),
      },
      anticheatEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: tx,
    } as any;

    const res = await submitAnticheatAppeal(prisma, 'u1', 'Bu cezada yanlış pozitif olduğunu düşünüyorum.');
    expect(res.ok).toBe(true);
    expect(findFirst).toHaveBeenCalled();
    expect(tx).toHaveBeenCalled();
  });
});
