import type { PrismaClient } from '@prisma/client';

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultOn;
  if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no') return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

export function isAnticheatRetentionEnabled(): boolean {
  return envFlag('ANTICHEAT_RETENTION_ENABLED', true);
}

export async function cleanupOldAnticheatEvents(prisma: PrismaClient, days = 90): Promise<number> {
  if (!isAnticheatRetentionEnabled()) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.anticheatEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
