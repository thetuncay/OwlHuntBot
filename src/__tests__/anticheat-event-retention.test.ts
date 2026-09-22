import { describe, expect, it } from 'vitest';
import { cleanupOldAnticheatEvents } from '../anticheat/event-retention';

describe('anticheat event retention', () => {
  it('deletes events older than 90 days', async () => {
    const deleteMany = async ({ where }: any) => {
      expect(where.createdAt.lt).toBeInstanceOf(Date);
      return { count: 7 };
    };
    const prisma = {
      anticheatEvent: { deleteMany },
    };
    const count = await cleanupOldAnticheatEvents(prisma as any, 90);
    expect(count).toBe(7);
  });
});
