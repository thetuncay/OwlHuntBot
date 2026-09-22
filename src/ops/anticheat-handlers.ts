import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';

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

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function handleAnticheatAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  prisma: PrismaClient | null,
): Promise<boolean> {
  if (!path.startsWith('/api/admin/anticheat/')) return false;
  if (!prisma) {
    sendJson(res, 503, { error: 'database_unavailable' });
    return true;
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (path === '/api/admin/anticheat/punishments' || path === '/api/admin/anticheat/punishments/') {
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = Math.min(100, parsePositiveInt(url.searchParams.get('limit'), 20));
    const userId = (url.searchParams.get('userId') ?? '').trim() || undefined;
    const tierRaw = url.searchParams.get('tier');
    const tier = tierRaw ? Number.parseInt(tierRaw, 10) : undefined;
    const where = {
      ...(userId ? { userId } : {}),
      ...(Number.isFinite(tier) ? { tier } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.anticheatPunishment.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.anticheatPunishment.count({ where }),
    ]);
    sendJson(res, 200, { page, limit, total, rows });
    return true;
  }

  if (path === '/api/admin/anticheat/trust' || path === '/api/admin/anticheat/trust/') {
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = Math.min(100, parsePositiveInt(url.searchParams.get('limit'), 20));
    const sort = (url.searchParams.get('sort') ?? 'trustScoreAsc').trim();
    const orderBy =
      sort === 'violationDesc'
        ? [{ violationCount: 'desc' as const }]
        : sort === 'lastViolationDesc'
          ? [{ lastViolationAt: 'desc' as const }]
          : [{ trustScore: 'asc' as const }];
    const [rows, total] = await Promise.all([
      prisma.anticheatTrust.findMany({
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.anticheatTrust.count(),
    ]);
    sendJson(res, 200, { page, limit, total, rows });
    return true;
  }

  if (path.startsWith('/api/admin/anticheat/trust/') && req.method === 'GET') {
    const userId = decodeURIComponent(path.slice('/api/admin/anticheat/trust/'.length)).replace(/\/$/, '');
    if (!userId || userId.includes('/')) {
      sendJson(res, 400, { error: 'invalid_user_id' });
      return true;
    }
    const [trust, events] = await Promise.all([
      prisma.anticheatTrust.findUnique({ where: { userId } }),
      prisma.anticheatEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    sendJson(res, 200, { trust, events });
    return true;
  }

  if (path.startsWith('/api/admin/anticheat/trust/') && path.endsWith('/override')) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    const userId = decodeURIComponent(
      path
        .slice('/api/admin/anticheat/trust/'.length)
        .replace(/\/override$/, '')
        .replace(/\/$/, ''),
    );
    if (!userId || userId.includes('/')) {
      sendJson(res, 400, { error: 'invalid_user_id' });
      return true;
    }
    const body = (await readJsonBody(req)) as {
      trustScore?: number;
      violationCount?: number;
      clearThrottle?: boolean;
    };
    const trustScore = Number.isFinite(body.trustScore) ? Math.max(0, Math.min(100, body.trustScore!)) : undefined;
    const violationCount = Number.isFinite(body.violationCount) ? Math.max(0, body.violationCount!) : undefined;
    const clearThrottle = body.clearThrottle === true;

    const row = await prisma.anticheatTrust.upsert({
      where: { userId },
      create: {
        userId,
        trustScore: trustScore ?? 100,
        violationCount: violationCount ?? 0,
        isRewardThrottled: false,
        throttleUntil: null,
      },
      update: {
        ...(trustScore !== undefined ? { trustScore } : {}),
        ...(violationCount !== undefined ? { violationCount } : {}),
        ...(clearThrottle ? { isRewardThrottled: false, throttleUntil: null } : {}),
      },
    });

    await prisma.anticheatEvent.create({
      data: {
        userId,
        eventType: 'manual_review',
        severity: 1,
        detail: {
          source: 'ops_panel',
          override: { trustScore, violationCount, clearThrottle },
        },
      },
    });

    sendJson(res, 200, { ok: true, trust: row });
    return true;
  }

  if (path === '/api/admin/anticheat/market-anomalies' || path === '/api/admin/anticheat/market-anomalies/') {
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = Math.min(100, parsePositiveInt(url.searchParams.get('limit'), 20));
    const [rows, total] = await Promise.all([
      prisma.marketSuspiciousLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.marketSuspiciousLog.count(),
    ]);
    sendJson(res, 200, { page, limit, total, rows });
    return true;
  }

  return false;
}
