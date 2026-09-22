import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function tokenSecret(): string {
  return (
    process.env.WEB_SESSION_SECRET?.trim() ||
    process.env.DISCORD_TOKEN?.trim() ||
    'owlhunt-appeal-fallback'
  );
}

function sign(payload: string): string {
  return createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
}

function toBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseBase64UrlJson<T>(raw: string): T | null {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function createAppealAccessToken(userId: string): string {
  const payload = toBase64UrlJson({
    userId,
    exp: Date.now() + TOKEN_TTL_SECONDS * 1000,
  });
  return `${payload}.${sign(payload)}`;
}

export function verifyAppealAccessToken(token: string): { userId: string } | null {
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const decoded = parseBase64UrlJson<{ userId?: string; exp?: number }>(payload);
  if (!decoded?.userId || !decoded.exp) return null;
  if (Date.now() > decoded.exp) return null;
  return { userId: decoded.userId };
}
