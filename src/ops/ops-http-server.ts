/**
 * ops-http-server.ts — Health API + public site + /admin ops panel.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, extname, normalize } from 'node:path';
import type { ShardingManager } from 'discord.js';
import type { Redis } from 'ioredis';
import { collectOpsHealth, healthHttpStatus } from '../utils/ops-health';
import { resolveGuildDirectory } from './guild-directory';
import { resolvePublicSiteConfig } from './site-config';
import { resolvePublicLeaderboard } from './public-leaderboard-api';
import { resolvePublicPlayerProfile } from './public-player-api';
import { readWebSession } from './web-session';
import { enforceOpsPanelAuth, requiresOpsPanelAuth } from './panel-auth';
import { enforceWebLogin, handleWebAuthRequest, requiresWebLogin } from './web-auth-handlers';
import { handleFeedbackAdminRequest, handleFeedbackWebRequest } from './feedback-handlers';
import { handleAnticheatAdminRequest } from './anticheat-handlers';
import { handleAnticheatAppealWebRequest } from './anticheat-appeal-handlers';
import { handleDiscordDeveloperRequest } from './discord-developer-endpoints';
import { handleLinkedRoleRequest } from './linked-roles';
import type { PrismaClient } from '@prisma/client';
import { handleCopyEditorRequest } from './copy-editor-handlers';
import { buildRetentionBaseline } from '../systems/retention/metrics-baseline';

const SITE_ROOT = join(process.cwd(), 'public', 'site');
const PANEL_ROOT = join(process.cwd(), 'public', 'ops-panel');
const OWLHUNTWEB_ROOT = join(PANEL_ROOT, 'owlhuntweb');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function isOpsPanelEnabled(): boolean {
  const raw = process.env.OPS_PANEL_ENABLED;
  if (raw === undefined || raw === '') return true;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

function isPublicSiteEnabled(): boolean {
  const raw = process.env.PUBLIC_SITE_ENABLED;
  if (raw === undefined || raw === '') return true;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function redirect(res: ServerResponse, location: string, permanent = false): void {
  res.writeHead(permanent ? 301 : 302, { Location: location });
  res.end();
}

function serveStaticFromRoot(
  root: string,
  subPath: string,
  res: ServerResponse,
): boolean {
  const safe = normalize(subPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(root, safe);
  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
  return true;
}

export interface OpsHttpServerOptions {
  /** When true, only /health and /api/* — no static panel (use owlhuntbot-ops-panel). */
  healthOnly?: boolean;
  prisma?: PrismaClient | null;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  redis: Redis,
  manager: ShardingManager | null,
  options: OpsHttpServerOptions,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const path = url.pathname;
  const prisma = options.prisma ?? null;

  if (await handleDiscordDeveloperRequest(req, res, path)) {
    return;
  }

  if (await handleLinkedRoleRequest(req, res, path, prisma, redis)) {
    return;
  }

  if (await handleWebAuthRequest(req, res, path, prisma, redis)) {
    return;
  }

  if (await handleFeedbackWebRequest(req, res, path, prisma, redis)) {
    return;
  }

  if (await handleAnticheatAppealWebRequest(req, res, path, prisma, redis)) {
    return;
  }

  if (requiresWebLogin(path) && !(await enforceWebLogin(req, res, path, redis))) {
    return;
  }

  if (requiresOpsPanelAuth(path) && !enforceOpsPanelAuth(req, res)) {
    return;
  }

  if (await handleFeedbackAdminRequest(req, res, path, prisma)) {
    return;
  }

  if (await handleAnticheatAdminRequest(req, res, path, prisma)) {
    return;
  }

  if (await handleCopyEditorRequest(req, res, path)) {
    return;
  }

  if (path === '/health' || path === '/health/') {
    try {
      const report = await collectOpsHealth(redis, manager);
      sendJson(res, healthHttpStatus(report), report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 503, { status: 'unhealthy', error: msg });
    }
    return;
  }

  if (path === '/api/health' || path === '/api/health/') {
    try {
      const report = await collectOpsHealth(redis, manager);
      sendJson(res, healthHttpStatus(report), report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 503, { status: 'unhealthy', error: msg });
    }
    return;
  }

  if (path === '/api/guilds' || path === '/api/guilds/') {
    try {
      const directory = await resolveGuildDirectory(redis, manager);
      sendJson(res, 200, directory);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (path === '/api/public/config' || path === '/api/public/config/') {
    try {
      const config = await resolvePublicSiteConfig(redis);
      sendJson(res, 200, config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (path === '/api/retention/baseline' || path === '/api/retention/baseline/') {
    if (!prisma) {
      sendJson(res, 503, { error: 'Retention baseline requires database' });
      return;
    }
    try {
      const baseline = await buildRetentionBaseline(prisma, redis);
      sendJson(res, 200, baseline);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (path === '/api/public/leaderboard' || path === '/api/public/leaderboard/') {
    if (!prisma) {
      sendJson(res, 503, { error: 'Leaderboard API requires database' });
      return;
    }
    try {
      const category = url.searchParams.get('category');
      const session = await readWebSession(req, redis);
      const data = await resolvePublicLeaderboard(
        prisma,
        redis,
        category,
        session?.userId ?? null,
      );
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      sendJson(res, 200, data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (path.startsWith('/api/public/player/')) {
    if (!prisma) {
      sendJson(res, 503, { error: 'Player API requires database' });
      return;
    }
    const playerId = decodeURIComponent(path.slice('/api/public/player/'.length).replace(/\/$/, ''));
    if (!playerId || playerId.includes('/')) {
      sendJson(res, 400, { error: 'invalid_player_id' });
      return;
    }
    try {
      const profile = await resolvePublicPlayerProfile(prisma, redis, playerId);
      if (!profile) {
        sendJson(res, 404, { error: 'player_not_found' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=30');
      sendJson(res, 200, profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (options.healthOnly) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Legacy /panel → /admin (auth checked via /admin redirect target)
  if (path === '/panel' || path === '/panel/') {
    if (!enforceOpsPanelAuth(req, res)) return;
    redirect(res, '/admin');
    return;
  }
  if (path.startsWith('/panel/')) {
    redirect(res, `/admin/${path.slice('/panel/'.length)}`, true);
    return;
  }

  // Public landing + user pages
  if (isPublicSiteEnabled()) {
    if (path === '/' || path === '/index.html') {
      if (serveStaticFromRoot(SITE_ROOT, 'index.html', res)) return;
    }
    if (path === '/login' || path === '/login/') {
      if (serveStaticFromRoot(SITE_ROOT, 'login.html', res)) return;
    }
    if (path === '/leaderboard' || path === '/leaderboard/') {
      if (serveStaticFromRoot(SITE_ROOT, 'leaderboard.html', res)) return;
    }
    if (path.startsWith('/player/')) {
      if (serveStaticFromRoot(SITE_ROOT, 'player.html', res)) return;
    }
    if (path === '/dashboard' || path === '/dashboard/') {
      if (serveStaticFromRoot(SITE_ROOT, 'dashboard.html', res)) return;
    }
    if (path === '/feedback' || path === '/feedback/') {
      if (serveStaticFromRoot(SITE_ROOT, 'feedback.html', res)) return;
    }
    if (path === '/appeal-access' || path === '/appeal-access/') {
      if (serveStaticFromRoot(SITE_ROOT, 'appeal.html', res)) return;
    }
    if (path === '/gizlilik' || path === '/gizlilik/') {
      if (serveStaticFromRoot(SITE_ROOT, 'gizlilik.html', res)) return;
    }
    if (path === '/kullanim' || path === '/kullanim/') {
      if (serveStaticFromRoot(SITE_ROOT, 'kullanim.html', res)) return;
    }
    if (path === '/privacy-policy' || path === '/privacy-policy/') {
      if (serveStaticFromRoot(SITE_ROOT, 'privacy-policy.html', res)) return;
    }
    if (path === '/terms-of-service' || path === '/terms-of-service/') {
      if (serveStaticFromRoot(SITE_ROOT, 'terms-of-service.html', res)) return;
    }
    if (path === '/verify-user' || path === '/verify-user/') {
      if (serveStaticFromRoot(SITE_ROOT, 'verify-user.html', res)) return;
    }
    if (path.startsWith('/feedback/')) {
      const sub = path.slice('/feedback/'.length);
      if (serveStaticFromRoot(SITE_ROOT, sub, res)) return;
    }
    if (path.startsWith('/dashboard/')) {
      const sub = path.slice('/dashboard/'.length);
      if (serveStaticFromRoot(SITE_ROOT, sub, res)) return;
    }
    if (path.startsWith('/assets/owlhuntweb/')) {
      const sub = path.slice('/assets/owlhuntweb/'.length);
      if (serveStaticFromRoot(OWLHUNTWEB_ROOT, sub, res)) return;
    }
    if (path.startsWith('/assets/')) {
      const sub = path.slice('/assets/'.length);
      if (serveStaticFromRoot(SITE_ROOT, sub, res)) return;
    }
  }

  // Admin ops panel
  if (isOpsPanelEnabled()) {
    if (path === '/admin' || path === '/admin/') {
      if (serveStaticFromRoot(PANEL_ROOT, 'index.html', res)) return;
    }
    if (path === '/admin/copy' || path === '/admin/copy/') {
      if (serveStaticFromRoot(PANEL_ROOT, 'copy-editor.html', res)) return;
    }
    if (path.startsWith('/admin/copy.')) {
      const sub = path.slice('/admin/'.length);
      if (serveStaticFromRoot(PANEL_ROOT, sub, res)) return;
    }
    if (path.startsWith('/admin/')) {
      const sub = path.slice('/admin/'.length);
      if (serveStaticFromRoot(PANEL_ROOT, sub, res)) return;
    }
  }

  res.writeHead(404);
  res.end('Not Found');
}

export function startOpsHttpServer(
  port: number,
  redis: Redis,
  getManager: () => ShardingManager | null,
  options: OpsHttpServerOptions = {},
): Server {
  const server = createServer((req, res) => {
    void handleRequest(req, res, redis, getManager(), options).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) sendJson(res, 500, { error: msg });
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(
        `[OpsHTTP] Port ${port} kullanimda — panel acilmadi. OPS_PANEL_PORT degistirin.`,
      );
      return;
    }
    console.error('[OpsHTTP] Server hatasi:', err.message);
  });

  server.listen(port, '127.0.0.1', () => {
    console.info(`[OpsHTTP] Health:  http://127.0.0.1:${port}/health`);
    if (!options.healthOnly && isPublicSiteEnabled()) {
      console.info(`[OpsHTTP] Site:    http://127.0.0.1:${port}/`);
      console.info(`[OpsHTTP] Login:   http://127.0.0.1:${port}/login`);
      console.info(`[OpsHTTP] Dash:    http://127.0.0.1:${port}/dashboard`);
    }
    if (!options.healthOnly && isOpsPanelEnabled()) {
      console.info(`[OpsHTTP] Admin:   http://127.0.0.1:${port}/admin`);
    }
  });

  return server;
}
