import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { readWebSession } from './web-session';
import { verifyAppealAccessToken } from '../anticheat/appeal-access';
import { submitAnticheatAppeal } from '../anticheat/appeal';

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

async function verifyAppealAccess(
  req: IncomingMessage,
  prisma: PrismaClient,
  redis: Redis,
  token: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const session = await readWebSession(req, redis);
  if (!session) return { ok: false, status: 401, error: 'login_required' };
  const parsed = verifyAppealAccessToken(token);
  if (!parsed) return { ok: false, status: 403, error: 'invalid_or_expired_token' };
  if (parsed.userId !== session.userId) return { ok: false, status: 403, error: 'token_user_mismatch' };

  const [banReason, punishment] = await Promise.all([
    redis.get(`ban:${session.userId}`),
    prisma.anticheatPunishment.findFirst({
      where: {
        userId: session.userId,
        tier: { gte: 4 },
        overturned: false,
      },
      orderBy: { issuedAt: 'desc' },
    }),
  ]);
  if (!banReason && !punishment) return { ok: false, status: 403, error: 'appeal_not_available' };
  return { ok: true, userId: session.userId };
}

export async function handleAnticheatAppealWebRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  prisma: PrismaClient | null,
  redis: Redis,
): Promise<boolean> {
  if (!path.startsWith('/api/appeal/')) return false;
  if (!prisma) {
    sendJson(res, 503, { error: 'database_unavailable' });
    return true;
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const token = (url.searchParams.get('at') ?? '').trim();
  if (!token) {
    sendJson(res, 400, { error: 'missing_token' });
    return true;
  }

  const access = await verifyAppealAccess(req, prisma, redis, token);
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error });
    return true;
  }

  if (path === '/api/appeal/context' || path === '/api/appeal/context/') {
    const [banReason, punishment] = await Promise.all([
      redis.get(`ban:${access.userId}`),
      prisma.anticheatPunishment.findFirst({
        where: { userId: access.userId, overturned: false },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);
    sendJson(res, 200, {
      ok: true,
      userId: access.userId,
      banReason,
      punishment: punishment
        ? {
            tier: punishment.tier,
            reason: punishment.reason,
            issuedAt: punishment.issuedAt.toISOString(),
            expiresAt: punishment.expiresAt?.toISOString() ?? null,
            appealed: punishment.appealed,
          }
        : null,
    });
    return true;
  }

  if (path === '/api/appeal/submit' || path === '/api/appeal/submit/') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    const body = (await readJsonBody(req)) as { reason?: string };
    const reason = (body.reason ?? '').trim();
    const result = await submitAnticheatAppeal(prisma, access.userId, reason);
    sendJson(res, result.ok ? 200 : 400, result.ok ? { ok: true, message: result.message } : { error: result.message });
    return true;
  }

  return false;
}
