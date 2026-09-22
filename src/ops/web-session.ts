/**
 * Web session — Redis-backed (primary) + signed cookie fallback (legacy).
 * Discord login oturumu sunucu restart / token degisiminde de kalici kalir.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Redis } from 'ioredis';
import { isProduction } from '../env';

export interface WebSession {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  email: string | null;
  exp: number;
}

const COOKIE_NAME = 'owlhunt_web_session';
/** 30 gun — tek giris, uzun sure acik kalir. */
export const WEB_SESSION_MAX_AGE_SEC = 30 * 86400;
const REDIS_KEY_PREFIX = 'web:session:';

let warnedDiscordTokenFallback = false;

function sessionSecret(): string | null {
  const secret = process.env.WEB_SESSION_SECRET?.trim();
  if (secret) return secret;
  const fallback = process.env.DISCORD_TOKEN?.trim();
  if (fallback && !warnedDiscordTokenFallback) {
    warnedDiscordTokenFallback = true;
    console.warn(
      '[WebSession] WEB_SESSION_SECRET tanimli degil — DISCORD_TOKEN ile imzalaniyor. '
      + 'Bot token degisince tum web oturumlari duser; .env icine WEB_SESSION_SECRET ekleyin.',
    );
  }
  return fallback || null;
}

function sign(payload: string): string {
  const secret = sessionSecret();
  if (!secret) throw new Error('WEB_SESSION_SECRET or DISCORD_TOKEN required');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function verifySignature(payload: string, sig: string): boolean {
  try {
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isLegacyPayload(payload: string): boolean {
  return payload.startsWith('eyJ');
}

function redisKey(sessionId: string): string {
  return `${REDIS_KEY_PREFIX}${sessionId}`;
}

interface StoredWebSession {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  email: string | null;
}

function toWebSession(stored: StoredWebSession): WebSession {
  return {
    ...stored,
    exp: Date.now() + WEB_SESSION_MAX_AGE_SEC * 1000,
  };
}

function toStored(session: WebSession): StoredWebSession {
  return {
    userId: session.userId,
    username: session.username,
    globalName: session.globalName,
    avatar: session.avatar,
    email: session.email,
  };
}

export function encodeSession(session: WebSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(raw: string): WebSession | null {
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!isLegacyPayload(payload)) return null;
  try {
    if (!verifySignature(payload, sig)) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as WebSession;
    if (!session.userId || !session.exp) return null;
    if (Date.now() > session.exp) return null;
    return session;
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

export function readSessionCookie(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] ?? null;
}

function parseSessionCookie(raw: string): { kind: 'legacy'; payload: string } | { kind: 'redis'; sessionId: string } | null {
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!verifySignature(payload, sig)) return null;
  if (isLegacyPayload(payload)) return { kind: 'legacy', payload };
  return { kind: 'redis', sessionId: payload };
}

async function loadRedisSession(redis: Redis, sessionId: string): Promise<WebSession | null> {
  const raw = await redis.get(redisKey(sessionId));
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredWebSession;
    if (!stored.userId) return null;
    return toWebSession(stored);
  } catch {
    return null;
  }
}

async function saveRedisSession(redis: Redis, sessionId: string, session: WebSession): Promise<void> {
  await redis.set(redisKey(sessionId), JSON.stringify(toStored(session)), 'EX', WEB_SESSION_MAX_AGE_SEC);
}

function newSessionId(): string {
  return randomBytes(24).toString('base64url');
}

function sessionCookieValue(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

/** Node setHeader('Set-Cookie') overwrites; OAuth callback needs session + clear state in one response. */
function appendSetCookie(res: ServerResponse, cookie: string): void {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  const existing = Array.isArray(prev)
    ? prev.map(String)
    : [String(prev)];
  res.setHeader('Set-Cookie', [...existing, cookie]);
}

function writeSessionCookie(res: ServerResponse, value: string): void {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${WEB_SESSION_MAX_AGE_SEC}`,
    'SameSite=Lax',
  ];
  if (isProduction) parts.push('Secure');
  appendSetCookie(res, parts.join('; '));
}

export async function readWebSession(
  req: IncomingMessage,
  redis: Redis | null = null,
): Promise<WebSession | null> {
  const raw = readSessionCookie(req);
  if (!raw) return null;

  const parsed = parseSessionCookie(raw);
  if (!parsed) {
    return decodeSession(raw);
  }

  if (parsed.kind === 'legacy') {
    const legacy = decodeSession(raw);
    return legacy;
  }

  if (!redis) return null;

  return loadRedisSession(redis, parsed.sessionId);
}

/** Oturum varsa Redis TTL + cookie Max-Age yenilenir (sliding window). */
export async function touchWebSession(
  req: IncomingMessage,
  res: ServerResponse,
  redis: Redis | null,
): Promise<WebSession | null> {
  const raw = readSessionCookie(req);
  if (!raw) return null;

  const parsed = parseSessionCookie(raw);
  if (!parsed) return null;

  if (parsed.kind === 'legacy') {
    const legacy = decodeSession(raw);
    if (!legacy) return null;
    if (redis) {
      await writeWebSession(res, legacy, redis);
      return legacy;
    }
    writeLegacyWebSession(res, legacy);
    return legacy;
  }

  if (!redis) return null;

  const session = await loadRedisSession(redis, parsed.sessionId);
  if (!session) return null;

  await saveRedisSession(redis, parsed.sessionId, session);
  writeSessionCookie(res, sessionCookieValue(parsed.sessionId));
  return session;
}

function writeLegacyWebSession(res: ServerResponse, session: WebSession): void {
  writeSessionCookie(res, encodeSession(session));
}

export async function writeWebSession(
  res: ServerResponse,
  session: WebSession,
  redis: Redis | null = null,
): Promise<void> {
  if (redis) {
    const sessionId = newSessionId();
    await saveRedisSession(redis, sessionId, session);
    writeSessionCookie(res, sessionCookieValue(sessionId));
    return;
  }
  writeLegacyWebSession(res, session);
}

export async function clearWebSession(
  res: ServerResponse,
  req?: IncomingMessage,
  redis: Redis | null = null,
): Promise<void> {
  if (req && redis) {
    const raw = readSessionCookie(req);
    if (raw) {
      const parsed = parseSessionCookie(raw);
      if (parsed?.kind === 'redis') {
        await redis.del(redisKey(parsed.sessionId)).catch(() => undefined);
      }
    }
  }

  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'SameSite=Lax',
  ];
  if (isProduction) parts.push('Secure');
  appendSetCookie(res, parts.join('; '));
}

export function createWebSession(user: {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
  email?: string | null;
}): WebSession {
  return {
    userId: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    avatar: user.avatar,
    email: user.email ?? null,
    exp: Date.now() + WEB_SESSION_MAX_AGE_SEC * 1000,
  };
}

export function newOAuthState(): string {
  return randomBytes(24).toString('base64url');
}

const STATE_COOKIE = 'owlhunt_oauth_state';
const NEXT_COOKIE = 'owlhunt_oauth_next';

/** OAuth sonrasi guvenli yonlendirme (open redirect yok). */
export function sanitizePostLoginPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (path === '/invite' || path === '/invite/') return '/invite';
  if (path === '/dashboard' || path === '/dashboard/') return '/dashboard';
  if (path === '/feedback' || path === '/feedback/') return '/feedback';
  if (path === '/appeal-access' || path.startsWith('/appeal-access?')) {
    try {
      const url = new URL(path, 'http://127.0.0.1');
      const token = (url.searchParams.get('at') ?? '').trim();
      if (!token) return '/appeal-access';
      return `/appeal-access?at=${encodeURIComponent(token)}`;
    } catch {
      return '/appeal-access';
    }
  }
  return fallback;
}

export function writeOAuthState(res: ServerResponse, state: string, nextPath?: string): void {
  const stateParts = [
    `${STATE_COOKIE}=${encodeURIComponent(state)}`,
    'Path=/api/auth/discord',
    'HttpOnly',
    'Max-Age=600',
    'SameSite=Lax',
  ];
  if (isProduction) stateParts.push('Secure');

  appendSetCookie(res, stateParts.join('; '));
  if (nextPath) {
    const safe = sanitizePostLoginPath(nextPath);
    const nextParts = [
      `${NEXT_COOKIE}=${encodeURIComponent(safe)}`,
      'Path=/api/auth/discord',
      'HttpOnly',
      'Max-Age=600',
      'SameSite=Lax',
    ];
    if (isProduction) nextParts.push('Secure');
    appendSetCookie(res, nextParts.join('; '));
  }
}

export function readOAuthState(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[STATE_COOKIE] ?? null;
}

export function readOAuthNext(req: IncomingMessage): string {
  const cookies = parseCookies(req.headers.cookie);
  return sanitizePostLoginPath(cookies[NEXT_COOKIE] ?? null);
}

export function clearOAuthState(res: ServerResponse): void {
  const clearState = [`${STATE_COOKIE}=`, 'Path=/api/auth/discord', 'HttpOnly', 'Max-Age=0', 'SameSite=Lax'];
  const clearNext = [`${NEXT_COOKIE}=`, 'Path=/api/auth/discord', 'HttpOnly', 'Max-Age=0', 'SameSite=Lax'];
  if (isProduction) {
    clearState.push('Secure');
    clearNext.push('Secure');
  }
  appendSetCookie(res, clearState.join('; '));
  appendSetCookie(res, clearNext.join('; '));
}

export function discordAvatarUrl(userId: string, avatar: string | null): string {
  if (!avatar) {
    const idx = Number(BigInt(userId) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`;
}

export function publicSessionView(session: WebSession) {
  return {
    userId: session.userId,
    username: session.username,
    globalName: session.globalName,
    displayName: session.globalName || session.username,
    avatarUrl: discordAvatarUrl(session.userId, session.avatar),
    linked: true,
  };
}
