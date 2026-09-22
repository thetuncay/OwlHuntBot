/**
 * Seed aktif feedback kampanyası.
 * Kullanım: npx tsx scripts/seed-feedback-campaign.ts
 */
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from '../src/env';
import { ensureFeedbackCampaign } from '../src/systems/feedback-survey';

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl('bot') } },
  });
  await prisma.$connect();
  const campaign = await ensureFeedbackCampaign(prisma);
  console.info(`[Seed] Feedback campaign: ${campaign.slug} (${campaign.id})`);
  await prisma.$disconnect();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
