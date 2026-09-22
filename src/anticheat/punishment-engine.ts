import type { PrismaClient } from '@prisma/client';
import { recordAnticheatEvent } from './audit-logger';

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultOn;
  if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no') return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

function isPunishmentEnforceEnabled(): boolean {
  return envFlag('ANTICHEAT_PUNISHMENT_ENFORCE', false);
}

export interface PunishmentTier {
  tier: number;
  durationSeconds: number | null;
}

export function resolvePunishmentTier(violationCount: number): PunishmentTier {
  if (violationCount <= 1) return { tier: 1, durationSeconds: 0 };
  if (violationCount === 2) return { tier: 2, durationSeconds: 15 * 60 };
  if (violationCount === 3) return { tier: 3, durationSeconds: 60 * 60 };
  if (violationCount === 4) return { tier: 4, durationSeconds: 6 * 60 * 60 };
  return { tier: 5, durationSeconds: null };
}

export async function evaluatePunishment(
  prisma: PrismaClient,
  userId: string,
  reason: string,
): Promise<void> {
  const trust = await prisma.anticheatTrust.findUnique({
    where: { userId },
    select: { violationCount: true },
  });
  const count = trust?.violationCount ?? 0;
  const tier = resolvePunishmentTier(count);

  recordAnticheatEvent({
    userId,
    eventType: 'manual_review',
    severity: tier.tier >= 4 ? 4 : 2,
    detail: {
      reason,
      violationCount: count,
      computedTier: tier.tier,
      enforce: isPunishmentEnforceEnabled(),
    },
  });

  await prisma.anticheatPunishment.create({
    data: {
      userId,
      tier: tier.tier,
      reason,
      durationSeconds: tier.durationSeconds ?? undefined,
      expiresAt:
        tier.durationSeconds == null || tier.durationSeconds <= 0
          ? null
          : new Date(Date.now() + tier.durationSeconds * 1000),
      issuedBy: 'system',
    },
  });
}
