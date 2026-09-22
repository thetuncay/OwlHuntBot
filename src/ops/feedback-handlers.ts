/**
 * Feedback web + admin HTTP handlers.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  claimFeedbackReward,
  countUserAttachments,
  ensureFeedbackCampaign,
  getActiveFeedbackCampaign,
  getFeedbackUserState,
  submitFeedbackSurvey,
} from '../systems/feedback-survey';
import { FEEDBACK_QUESTIONS } from '../config/feedback-survey';
import {
  FEEDBACK_UPLOAD_MAX_BYTES,
  FEEDBACK_UPLOAD_MAX_FILES,
  parseMultipartFile,
  saveFeedbackImage,
  streamFeedbackFile,
} from './feedback-storage';
import type { WebSession } from './web-session';
import { touchWebSession } from './web-session';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

async function resolveSession(
  req: IncomingMessage,
  res: ServerResponse,
  redis: Redis | null,
): Promise<WebSession | null> {
  return touchWebSession(req, res, redis);
}

export function requiresFeedbackPath(path: string): boolean {
  return (
    path === '/feedback' ||
    path === '/feedback/' ||
    path.startsWith('/api/feedback/')
  );
}

export async function handleFeedbackWebRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  prisma: PrismaClient | null,
  redis: Redis | null,
): Promise<boolean> {
  if (!path.startsWith('/api/feedback/')) return false;
  if (!prisma) {
    sendJson(res, 503, { error: 'database_unavailable' });
    return true;
  }

  const session = await resolveSession(req, res, redis);
  if (!session) {
    sendJson(res, 401, { error: 'login_required' });
    return true;
  }

  if (path === '/api/feedback/campaign' || path === '/api/feedback/campaign/') {
    await ensureFeedbackCampaign(prisma);
    const campaign = await getActiveFeedbackCampaign(prisma);
    if (!campaign) {
      sendJson(res, 404, { error: 'no_active_campaign' });
      return true;
    }
    const userState = await getFeedbackUserState(prisma, campaign.id, session.userId);
    sendJson(res, 200, { campaign, user: userState });
    return true;
  }

  if (path === '/api/feedback/upload' || path === '/api/feedback/upload/') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    try {
      const campaign = await ensureFeedbackCampaign(prisma);
      const userState = await getFeedbackUserState(prisma, campaign.id, session.userId);
      if (userState.status !== 'open') {
        sendJson(res, 400, { error: 'Anketi zaten gönderdin.' });
        return true;
      }
      const existing = await countUserAttachments(prisma, campaign.id, session.userId);
      if (existing >= FEEDBACK_UPLOAD_MAX_FILES) {
        sendJson(res, 400, { error: `En fazla ${FEEDBACK_UPLOAD_MAX_FILES} görsel yükleyebilirsin.` });
        return true;
      }
      const file = await parseMultipartFile(req, FEEDBACK_UPLOAD_MAX_BYTES);
      if (!file) {
        sendJson(res, 400, { error: 'Dosya bulunamadı.' });
        return true;
      }
      const storageKey = saveFeedbackImage(file.buffer, file.mime);
      const row = await prisma.feedbackAttachment.create({
        data: {
          campaignId: campaign.id,
          userId: session.userId,
          storageKey,
          mimeType: file.mime,
          sizeBytes: file.buffer.length,
        },
      });
      sendJson(res, 200, {
        attachmentId: row.id,
        previewUrl: `/api/feedback/attachment/${row.id}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { error: msg });
    }
    return true;
  }

  if (path.startsWith('/api/feedback/attachment/')) {
    const id = decodeURIComponent(path.slice('/api/feedback/attachment/'.length).replace(/\/$/, ''));
    const row = await prisma.feedbackAttachment.findUnique({ where: { id } });
    if (!row || row.userId !== session.userId) {
      sendJson(res, 404, { error: 'not_found' });
      return true;
    }
    if (!streamFeedbackFile(row.storageKey, res, row.mimeType)) {
      sendJson(res, 404, { error: 'file_missing' });
    }
    return true;
  }

  if (path === '/api/feedback/submit' || path === '/api/feedback/submit/') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    try {
      const body = await readJsonBody(req);
      const answers = (body as { answers?: unknown }).answers ?? body;
      const result = await submitFeedbackSurvey(prisma, redis, session.userId, answers);
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { error: msg });
    }
    return true;
  }

  if (path === '/api/feedback/claim-reward' || path === '/api/feedback/claim-reward/') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    try {
      const result = await claimFeedbackReward(prisma, redis, session.userId);
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { error: msg });
    }
    return true;
  }

  return false;
}

export async function handleFeedbackAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  prisma: PrismaClient | null,
): Promise<boolean> {
  if (!path.startsWith('/api/admin/feedback/')) return false;
  if (!prisma) {
    sendJson(res, 503, { error: 'database_unavailable' });
    return true;
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (path === '/api/admin/feedback/submissions' || path === '/api/admin/feedback/submissions/') {
    const slug = url.searchParams.get('campaign') ?? 'community-feedback-2026-q2';
    const campaign = slug === 'community-feedback-2026-q2'
      ? await ensureFeedbackCampaign(prisma)
      : await prisma.feedbackCampaign.findUnique({ where: { slug } });
    if (!campaign) {
      sendJson(res, 404, { error: 'campaign_not_found' });
      return true;
    }
    const subs = await prisma.feedbackSubmission.findMany({
      where: { campaignId: campaign.id },
      orderBy: { submittedAt: 'desc' },
    });
    sendJson(res, 200, {
      campaign: {
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.title,
        description: campaign.description,
        questions: FEEDBACK_QUESTIONS,
      },
      total: subs.length,
      rewarded: subs.filter((s) => s.rewardGranted).length,
      submissions: subs.map((s) => ({
        id: s.id,
        userId: s.userId,
        answers: s.answers,
        rewardGranted: s.rewardGranted,
        submittedAt: s.submittedAt.toISOString(),
      })),
    });
    return true;
  }

  if (path === '/api/admin/feedback/export.csv' || path === '/api/admin/feedback/export.csv/') {
    const slug = url.searchParams.get('campaign') ?? 'community-feedback-2026-q2';
    const campaign = slug === 'community-feedback-2026-q2'
      ? await ensureFeedbackCampaign(prisma)
      : await prisma.feedbackCampaign.findUnique({ where: { slug } });
    if (!campaign) {
      sendJson(res, 404, { error: 'campaign_not_found' });
      return true;
    }
    const subs = await prisma.feedbackSubmission.findMany({
      where: { campaignId: campaign.id },
      orderBy: { submittedAt: 'desc' },
    });
    const header = ['userId', 'submittedAt', 'rewardGranted', 'answersJson'];
    const lines = [header.join(',')];
    for (const s of subs) {
      const row = [
        s.userId,
        s.submittedAt.toISOString(),
        String(s.rewardGranted),
        JSON.stringify(s.answers).replace(/"/g, '""'),
      ];
      lines.push(row.map((c) => `"${c}"`).join(','));
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="feedback-${slug}.csv"`,
    });
    res.end(lines.join('\n'));
    return true;
  }

  if (path.startsWith('/api/admin/feedback/attachment/')) {
    const id = decodeURIComponent(path.slice('/api/admin/feedback/attachment/'.length).replace(/\/$/, ''));
    const row = await prisma.feedbackAttachment.findUnique({ where: { id } });
    if (!row) {
      sendJson(res, 404, { error: 'not_found' });
      return true;
    }
    if (!streamFeedbackFile(row.storageKey, res, row.mimeType)) {
      sendJson(res, 404, { error: 'file_missing' });
    }
    return true;
  }

  return false;
}
