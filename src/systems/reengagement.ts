import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

export async function queueReengagementCandidates(
  prisma: PrismaClient,
  redis: Redis,
): Promise<number> {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const players = await prisma.player.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: { id: true },
    take: 400,
    orderBy: { updatedAt: 'asc' },
  });
  if (players.length === 0) return 0;
  const qKey = 'retention:reengagement:queue';
  const multi = redis.multi();
  for (const p of players) multi.sadd(qKey, p.id);
  multi.expire(qKey, 24 * 60 * 60);
  await multi.exec();
  return players.length;
}
