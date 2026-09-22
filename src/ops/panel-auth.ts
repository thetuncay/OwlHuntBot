/**
 * HTTP Basic Auth for /admin ops panel and sensitive APIs.
 */
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isProduction } from '../env';

const REALM = 'OwlHunt Admin';

function envCredentials(): { user: string; pass: string } | null {
  const user = process.env.OPS_PANEL_USERNAME?.trim() ?? '';
  const pass = process.env.OPS_PANEL_PASSWORD ?? '';
  if (!user || !pass) return null;
  return { user, pass };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function parseBasicAuth(header: string | undefined): { user: string; pass: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

export function isOpsPanelAuthConfigured(): boolean {
  return envCredentials() !== null;
}

/** Routes that expose infra / guild data — require admin login. */
export function requiresOpsPanelAuth(path: string): boolean {
  if (path === '/admin' || path === '/admin/') return true;
  if (path.startsWith('/admin/')) return true;
  if (path === '/api/guilds' || path === '/api/guilds/') return true;
  if (path === '/api/health' || path === '/api/health/') return true;
  if (path === '/health' || path === '/health/') return true;
  if (path.startsWith('/api/admin/feedback/')) return true;
  if (path.startsWith('/api/admin/anticheat/')) return true;
  if (path === '/admin/copy' || path === '/admin/copy/') return true;
  if (path.startsWith('/admin/copy.')) return true;
  if (path.startsWith('/api/admin/copy/')) return true;
  return false;
}

function sendUnauthorized(res: ServerResponse, message: string): void {
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
  });
  res.end(message);
}

function sendForbidden(res: ServerResponse): void {
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(
    'Admin panel auth not configured. Set OPS_PANEL_USERNAME and OPS_PANEL_PASSWORD in .env, then restart owlhuntbot-ops-panel.',
  );
}

/**
 * Returns true when request may proceed; false when a response was already sent.
 */
export function enforceOpsPanelAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const creds = envCredentials();
  if (!creds) {
    if (isProduction) {
      sendForbidden(res);
      return false;
    }
    console.warn('[OpsHTTP] OPS_PANEL_USERNAME/PASSWORD yok — /admin dev modunda acik.');
    return true;
  }

  const auth = parseBasicAuth(req.headers.authorization);
  if (!auth || !safeEqual(auth.user, creds.user) || !safeEqual(auth.pass, creds.pass)) {
    sendUnauthorized(res, 'Admin girisi gerekli.');
    return false;
  }
  return true;
}
