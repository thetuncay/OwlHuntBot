/**
 * Feedback anket — submit, ödül, kampanya.
 */
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  FEEDBACK_CAMPAIGN_SLUG,
  FEEDBACK_QUESTIONS,
  FEEDBACK_REWARD_COINS,
  FEEDBACK_REWARD_LOOTBOX_NAME,
  FEEDBACK_REWARD_LOOTBOX_QTY,
  feedbackQuestionsJson,
} from '../config/feedback-survey';
import {
  collectAttachmentIds,
  normalizeFeedbackAnswers,
  type FeedbackAnswers,
} from '../utils/feedback-validation';
import { withLock } from '../utils/lock';
import { applyCoinDeltaInRedis, syncInventoryItemsFromPg } from '../state/player-state';
import { FEEDBACK_UPLOAD_MAX_FILES } from '../ops/feedback-storage';
import { enqueueFeedbackAnnounce } from './feedback-announce';
import { resolveFeedbackAnnounceTarget } from '../utils/user-command-channel';

export interface FeedbackCampaignView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  rewardCoins: number;
  rewardLootboxName: string;
  rewardLootboxQty: number;
  questions: typeof FEEDBACK_QUESTIONS;
  sections: { id: string; title: string }[];
}

export interface FeedbackUserState {
  status: 'open' | 'submitted' | 'rewarded';
  submissionId?: string;
  answers?: FeedbackAnswers;
  rewardGranted: boolean;
  submittedAt?: string;
}

export async function ensureFeedbackCampaign(prisma: PrismaClient) {
  const questions = feedbackQuestionsJson();
  return prisma.feedbackCampaign.upsert({
    where: { slug: FEEDBACK_CAMPAIGN_SLUG },
    create: {
      slug: FEEDBACK_CAMPAIGN_SLUG,
      title: 'OwlHunt Topluluk Geri Bildirim Anketi',
      description: 'Görüşlerinle OwlHunt\'ı geliştirmemize yardım et. Tek seferlik ödül: 5.000 coin + 5 Eşya Kutusu.',
      isActive: true,
      rewardCoins: FEEDBACK_REWARD_COINS,
      rewardLootboxName: FEEDBACK_REWARD_LOOTBOX_NAME,
      rewardLootboxQty: FEEDBACK_REWARD_LOOTBOX_QTY,
      questions: questions as object,
    },
    update: {
      isActive: true,
      questions: questions as object,
      rewardCoins: FEEDBACK_REWARD_COINS,
      rewardLootboxName: FEEDBACK_REWARD_LOOTBOX_NAME,
      rewardLootboxQty: FEEDBACK_REWARD_LOOTBOX_QTY,
      description: 'Görüşlerinle OwlHunt\'ı geliştirmemize yardım et. Tek seferlik ödül: 5.000 coin + 5 Eşya Kutusu.',
    },
  });
}

export async function getActiveFeedbackCampaign(prisma: PrismaClient): Promise<FeedbackCampaignView | null> {
  const row = await prisma.feedbackCampaign.findFirst({
    where: { slug: FEEDBACK_CAMPAIGN_SLUG, isActive: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    rewardCoins: row.rewardCoins,
    rewardLootboxName: row.rewardLootboxName,
    rewardLootboxQty: row.rewardLootboxQty,
    questions: FEEDBACK_QUESTIONS,
    sections: [
      { id: 'segmentation', title: 'Segmentasyon' },
      { id: 'experience', title: 'Deneyim' },
      { id: 'depth', title: 'Derinlik' },
    ],
  };
}

export async function getFeedbackUserState(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
): Promise<FeedbackUserState> {
  const sub = await prisma.feedbackSubmission.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  if (!sub) {
    return { status: 'open', rewardGranted: false };
  }
  return {
    status: sub.rewardGranted ? 'rewarded' : 'submitted',
    submissionId: sub.id,
    answers: sub.answers as FeedbackAnswers,
    rewardGranted: sub.rewardGranted,
    submittedAt: sub.submittedAt.toISOString(),
  };
}

async function verifyAttachments(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
  attachmentIds: string[],
): Promise<void> {
  if (attachmentIds.length === 0) return;
  if (attachmentIds.length > FEEDBACK_UPLOAD_MAX_FILES) {
    throw new Error(`En fazla ${FEEDBACK_UPLOAD_MAX_FILES} görsel yükleyebilirsin.`);
  }
  const rows = await prisma.feedbackAttachment.findMany({
    where: { id: { in: attachmentIds }, campaignId, userId },
    select: { id: true },
  });
  if (rows.length !== attachmentIds.length) {
    throw new Error('Geçersiz veya başka kullanıcıya ait görsel.');
  }
}

async function grantFeedbackReward(
  prisma: PrismaClient,
  redis: Redis | null,
  userId: string,
  campaign: { id: string; rewardCoins: number; rewardLootboxName: string; rewardLootboxQty: number },
  submissionId: string,
): Promise<{ granted: boolean; reason?: string }> {
  const player = await prisma.player.findUnique({
    where: { id: userId },
    select: { id: true, coins: true },
  });
  if (!player) {
    return { granted: false, reason: 'player_not_registered' };
  }

  return withLock(userId, 'feedback_reward', async () => {
    const sub = await prisma.feedbackSubmission.findUnique({ where: { id: submissionId } });
    if (!sub || sub.userId !== userId || sub.rewardGranted) {
      return { granted: sub?.rewardGranted ?? false };
    }

    const beforeCoins = player.coins;
    await prisma.$transaction(async (tx) => {
      await tx.feedbackSubmission.update({
        where: { id: submissionId },
        data: { rewardGranted: true, rewardGrantedAt: new Date() },
      });
      await tx.player.update({
        where: { id: userId },
        data: { coins: { increment: campaign.rewardCoins } },
      });
      await tx.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: userId, itemName: campaign.rewardLootboxName } },
        create: {
          ownerId: userId,
          itemName: campaign.rewardLootboxName,
          itemType: 'Lootbox',
          rarity: 'Rare',
          quantity: campaign.rewardLootboxQty,
        },
        update: { quantity: { increment: campaign.rewardLootboxQty } },
      });
      await tx.auditLog.create({
        data: {
          playerId: userId,
          action: 'feedback_survey_reward',
          before: { coins: beforeCoins, submissionId },
          after: {
            coins: beforeCoins + campaign.rewardCoins,
            lootbox: { name: campaign.rewardLootboxName, qty: campaign.rewardLootboxQty },
          },
        },
      });
    });

    if (redis) {
      await applyCoinDeltaInRedis(redis, userId, campaign.rewardCoins, prisma);
      await syncInventoryItemsFromPg(redis, prisma, userId, [campaign.rewardLootboxName]);
      const target = await resolveFeedbackAnnounceTarget(redis, prisma, userId);
      await enqueueFeedbackAnnounce(redis, {
        userId,
        rewardCoins: campaign.rewardCoins,
        rewardLootboxQty: campaign.rewardLootboxQty,
        guildId: target?.guildId,
        channelId: target?.channelId,
      });
    }

    return { granted: true };
  });
}

export async function submitFeedbackSurvey(
  prisma: PrismaClient,
  redis: Redis | null,
  userId: string,
  rawAnswers: unknown,
): Promise<{ submissionId: string; rewardGranted: boolean; rewardPending: boolean }> {
  return withLock(userId, 'feedback_submit', async () => {
    const campaign = await ensureFeedbackCampaign(prisma);
    const existing = await prisma.feedbackSubmission.findUnique({
      where: { campaignId_userId: { campaignId: campaign.id, userId } },
    });
    if (existing) {
      throw new Error('Anketi zaten gönderdin.');
    }

    const answers = normalizeFeedbackAnswers(rawAnswers);
    const attachmentIds = collectAttachmentIds(answers);
    await verifyAttachments(prisma, campaign.id, userId, attachmentIds);

    let submission;
    try {
      submission = await prisma.feedbackSubmission.create({
        data: {
          campaignId: campaign.id,
          userId,
          answers: answers as object,
        },
      });
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code?: string }).code
        : undefined;
      if (code === 'P2002') {
        throw new Error('Anketi zaten gönderdin.');
      }
      throw err;
    }

    const reward = await grantFeedbackReward(prisma, redis, userId, campaign, submission.id);
    return {
      submissionId: submission.id,
      rewardGranted: reward.granted,
      rewardPending: !reward.granted && reward.reason === 'player_not_registered',
    };
  });
}

export async function claimFeedbackReward(
  prisma: PrismaClient,
  redis: Redis | null,
  userId: string,
): Promise<{ granted: boolean; reason?: string }> {
  const campaign = await prisma.feedbackCampaign.findFirst({
    where: { slug: FEEDBACK_CAMPAIGN_SLUG, isActive: true },
  });
  if (!campaign) throw new Error('Aktif anket bulunamadı.');

  const sub = await prisma.feedbackSubmission.findUnique({
    where: { campaignId_userId: { campaignId: campaign.id, userId } },
  });
  if (!sub) throw new Error('Önce anketi göndermelisin.');
  if (sub.rewardGranted) return { granted: true };

  return grantFeedbackReward(prisma, redis, userId, campaign, sub.id);
}

export async function countUserAttachments(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
): Promise<number> {
  return prisma.feedbackAttachment.count({ where: { campaignId, userId } });
}
