/**
 * Web auth + dashboard HTTP handlers.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  buildDiscordLoginUrl,
  exchangeDiscordCode,
  fetchDiscordUser,
  isDiscordOAuthConfigured,
} from './discord-oauth';
import { loadDashboardProfile, updatePlayerLeaderboardName } from './user-dashboard';
import { buildDiscordInviteUrl } from './site-config';
import {
  clearOAuthState,
  clearWebSession,
  createWebSession,
  newOAuthState,
  publicSessionView,
  readOAuthNext,
  readOAuthState,
  readWebSession,
  sanitizePostLoginPath,
  touchWebSession,
  writeOAuthState,
  writeWebSession,
} from './web-session';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function redirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

export function requiresWebLogin(path: string): boolean {
  if (path === '/dashboard' || path === '/dashboard/') return true;
  if (path.startsWith('/dashboard/')) return true;
  if (path === '/api/dashboard/profile' || path === '/api/dashboard/profile/') return true;
  if (path === '/api/dashboard/display-name' || path === '/api/dashboard/display-name/') return true;
  if (path === '/feedback' || path === '/feedback/') return true;
  if (path === '/appeal-access' || path === '/appeal-access/') return true;
  if (path.startsWith('/api/appeal/')) return true;
  return false;
}

export function isPublicWebAuthPath(path: string): boolean {
  return (
    path === '/login' ||
    path === '/login/' ||
    path.startsWith('/api/auth/')
  );
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
  refresh: boolean,
) {
  if (refresh) {
    return touchWebSession(req, res, redis);
  }
  return readWebSession(req, redis);
}

export async function handleWebAuthRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  prisma: PrismaClient | null,
  redis: Redis | null = null,
): Promise<boolean> {
  if (path === '/invite' || path === '/invite/') {
    const session = await readWebSession(req, redis);
    if (!session) {
      redirect(res, '/login?next=/invite');
      return true;
    }
    const clientId = process.env.CLIENT_ID?.trim();
    if (!clientId) {
      sendJson(res, 503, { error: 'CLIENT_ID missing' });
      return true;
    }
    redirect(res, buildDiscordInviteUrl(clientId));
    return true;
  }

  if (path === '/api/auth/discord/login' || path === '/api/auth/discord/login/') {
    if (!isDiscordOAuthConfigured()) {
      sendJson(res, 503, {
        error: 'Discord OAuth yapilandirilmamis. DISCORD_CLIENT_SECRET ve redirect URI ekleyin.',
      });
      return true;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const next = sanitizePostLoginPath(url.searchParams.get('next'));
    const state = newOAuthState();
    writeOAuthState(res, state, next);
    redirect(res, buildDiscordLoginUrl(state));
    return true;
  }

  if (path === '/api/auth/discord/redirect' || path === '/api/auth/discord/redirect/') {
    if (!isDiscordOAuthConfigured()) {
      redirect(res, '/login?error=oauth_config');
      return true;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const saved = readOAuthState(req);
    if (!code || !state || !saved || state !== saved) {
      clearOAuthState(res);
      redirect(res, '/login?error=state');
      return true;
    }

    try {
      const token = await exchangeDiscordCode(code);
      const user = await fetchDiscordUser(token.access_token);
      await writeWebSession(res, createWebSession(user), redis);
      const next = readOAuthNext(req);
      clearOAuthState(res);
      redirect(res, next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[WebAuth] OAuth callback failed:', msg);
      redirect(res, '/login?error=oauth');
    }
    return true;
  }

  if (path === '/api/auth/logout' || path === '/api/auth/logout/') {
    await clearWebSession(res, req, redis);
    redirect(res, '/');
    return true;
  }

  if (path === '/api/auth/me' || path === '/api/auth/me/') {
    const session = await resolveSession(req, res, redis, true);
    if (!session) {
      sendJson(res, 200, { loggedIn: false });
      return true;
    }
    sendJson(res, 200, { loggedIn: true, user: publicSessionView(session) });
    return true;
  }

  if (path === '/api/dashboard/profile' || path === '/api/dashboard/profile/') {
    const session = await resolveSession(req, res, redis, true);
    if (!session) {
      sendJson(res, 401, { error: 'login_required' });
      return true;
    }
    if (!prisma) {
      sendJson(res, 503, { error: 'database_unavailable' });
      return true;
    }
    try {
      const profile = await loadDashboardProfile(prisma, session);
      sendJson(res, 200, {
        user: publicSessionView(session),
        profile,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: msg });
    }
    return true;
  }

  if (path === '/api/dashboard/display-name' || path === '/api/dashboard/display-name/') {
    const session = await resolveSession(req, res, redis, true);
    if (!session) {
      sendJson(res, 401, { error: 'login_required' });
      return true;
    }
    if (!prisma) {
      sendJson(res, 503, { error: 'database_unavailable' });
      return true;
    }
    if (req.method !== 'PATCH' && req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    try {
      const body = (await readJsonBody(req)) as { displayName?: string };
      const name = await updatePlayerLeaderboardName(
        prisma,
        redis,
        session.userId,
        body.displayName ?? '',
      );
      sendJson(res, 200, { ok: true, displayName: name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { error: msg });
    }
    return true;
  }

  return false;
}

export async function enforceWebLogin(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  redis: Redis | null = null,
): Promise<boolean> {
  if (!requiresWebLogin(path)) return true;
  const session = await readWebSession(req, redis);
  if (session) return true;
  const nextPath = req.url?.startsWith('/') ? req.url : path;
  const next = encodeURIComponent(nextPath);
  redirect(res, `/login?next=${next}`);
  return false;
}
