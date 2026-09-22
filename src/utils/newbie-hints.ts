import type { PrismaClient } from '@prisma/client';
import { isNewbieActive } from '../systems/newbie-boost';

export async function appendUpgradeHintIfNewbie(
  prisma: PrismaClient,
  userId: string,
  text: string,
  prefix: string,
  options?: { isFirstHunt?: boolean },
): Promise<string> {
  if (!options?.isFirstHunt) return text;
  const player = await prisma.player.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!player || !isNewbieActive(player.createdAt)) return text;

  const mainOwl = await prisma.owl.findFirst({
    where: { ownerId: userId, isMain: true },
    select: { statGagaTrained: true },
  });
  const trained = mainOwl?.statGagaTrained ?? 0;
  if (trained > 0) return text;

  return `${text}\n💡 İpucu: Stat yükseltmek için \`${prefix} upgrade gaga\``;
}

export function appendCrateOpenHint(text: string, prefix: string): string {
  return (
    `${text}\n\n📦 **Kutuların hazır!**\n` +
    `• \`${prefix} ek\` — Eşya Kutusu aç\n` +
    `• \`${prefix} sk\` — Silah Kutusu aç\n` +
    `Envanter için: \`${prefix} aç\``
  );
}
