#!/usr/bin/env npx tsx
/**
 * Mevcut baykuşlar için moon tier + PlayerOwlPrestigeDex backfill.
 */
import { PrismaClient } from '@prisma/client';
import { syncOwlMoonTier } from '../src/systems/owl-moon-evolution';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const owls = await prisma.owl.findMany({ orderBy: { createdAt: 'asc' } });
  let updated = 0;
  for (const owl of owls) {
    const before = owl.moonTier;
    await syncOwlMoonTier(prisma, owl);
    const after = (await prisma.owl.findUnique({ where: { id: owl.id }, select: { moonTier: true } }))?.moonTier;
    if (after !== before) updated++;
  }
  console.log(`Backfill tamam: ${owls.length} baykuş, ${updated} güncellendi.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
