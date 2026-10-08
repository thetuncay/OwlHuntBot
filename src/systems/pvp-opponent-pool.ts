/**
 * Düello rakip havuzu — main sahibi ownerId'ler Redis SET'te.
 * ORDER BY RANDOM() tum main tablosunu siralar; yuzlerce eszamanli duelloda
 * bu siralama kuyruga girer. SRANDMEMBER + (ownerId, isMain) indeks okumasi
 * ayni kitleyi esit olasilikla secer.
 */
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

const POOL_KEY = 'duel:main-owners';
const FILL_LOCK = 'duel:main-owners:fill';

const OWL_SELECT = {
  id: true,
  ownerId: true,
  species: true,
  nickname: true,
  hp: true,
  hpMax: true,
  staminaCur: true,
  statGaga: true,
  statPence: true,
  statKanat: true,
} as const;

export type PooledMainOwl = {
  id: string;
  ownerId: string;
  species: string;
  nickname: string | null;
  hp: number;
  hpMax: number;
  staminaCur: number;
  statGaga: number;
  statPence: number;
  statKanat: number;
};

/** Main sahibi ownerId'leri Redis'e yazar. Bos havuzda anahtari siler. */
export async function refreshMainOwnerPool(prisma: PrismaClient, redis: Redis): Promise<number> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.owl.findMany({
      where: { isMain: true },
      select: { id: true, ownerId: true },
      take: 2000,
      orderBy: { id: 'asc' },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    for (const row of batch) ids.push(row.ownerId);
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < 2000) break;
  }

  const tmp = `${POOL_KEY}:next`;
  await redis.del(tmp);
  if (ids.length === 0) {
    await redis.del(POOL_KEY);
    return 0;
  }
  for (let i = 0; i < ids.length; i += 500) {
    await redis.sadd(tmp, ...ids.slice(i, i + 500));
  }
  await redis.rename(tmp, POOL_KEY);
  return ids.length;
}

async function ensurePool(prisma: PrismaClient, redis: Redis): Promise<boolean> {
  if (await redis.scard(POOL_KEY) > 0) return true;
  const got = await redis.set(FILL_LOCK, '1', 'EX', 30, 'NX');
  if (got) {
    try {
      await refreshMainOwnerPool(prisma, redis);
    } finally {
      await redis.del(FILL_LOCK);
    }
  } else {
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (await redis.scard(POOL_KEY) > 0) return true;
    }
  }
  return (await redis.scard(POOL_KEY)) > 0;
}

/**
 * Havuzdan bir main baykus secer. Havuz bos veya Redis yoksa null;
 * cagiran ORDER BY RANDOM() yedegine duser.
 */
export async function pickPooledMainOwl(
  prisma: PrismaClient,
  redis: Redis,
  exclude: Set<string>,
): Promise<PooledMainOwl | null> {
  try {
    if (!(await ensurePool(prisma, redis))) return null;
    const sample = await redis.srandmember(POOL_KEY, 24);
    const ids = (Array.isArray(sample) ? sample : sample ? [sample] : [])
      .filter((id) => id && !exclude.has(id));
    for (const ownerId of ids) {
      const owl = await prisma.owl.findFirst({
        where: { ownerId, isMain: true },
        select: OWL_SELECT,
      });
      if (owl) return owl;
      await redis.srem(POOL_KEY, ownerId);
    }
    return null;
  } catch {
    return null;
  }
}
