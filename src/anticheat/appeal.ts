import type { PrismaClient } from '@prisma/client';

export interface SubmitAppealResult {
  ok: boolean;
  message: string;
}

export async function submitAnticheatAppeal(
  prisma: PrismaClient,
  userId: string,
  reason: string,
): Promise<SubmitAppealResult> {
  const cleanedReason = reason.trim();
  if (cleanedReason.length < 10) {
    return { ok: false, message: 'İtiraz metni en az 10 karakter olmalı.' };
  }

  const punishment = await prisma.anticheatPunishment.findFirst({
    where: {
      userId,
      tier: { gte: 4 },
      appealed: false,
      overturned: false,
    },
    orderBy: { issuedAt: 'desc' },
  });

  if (!punishment) {
    return {
      ok: false,
      message: 'İtiraza uygun (Tier 4+) aktif bir ceza bulunamadı veya zaten itiraz edilmiş.',
    };
  }

  await prisma.$transaction([
    prisma.anticheatAppeal.create({
      data: {
        punishmentId: punishment.id,
        userId,
        reason: cleanedReason,
        status: 'pending',
      },
    }),
    prisma.anticheatPunishment.update({
      where: { id: punishment.id },
      data: { appealed: true },
    }),
    prisma.anticheatEvent.create({
      data: {
        userId,
        eventType: 'manual_review',
        severity: 1,
        detail: {
          source: 'appeal',
          punishmentId: punishment.id,
        },
      },
    }),
  ]);

  return { ok: true, message: 'İtiraz kaydın alındı. Moderasyon incelemesinden sonra bilgilendirileceksin.' };
}
