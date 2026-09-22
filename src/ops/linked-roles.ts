/**
 * Discord Linked Roles (Bağlı Roller) — OAuth2 + role connection metadata.
 * Verification URL: GET /verify-user → kullanıcıyı OAuth akışına yönlendirir.
 */
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { webPublicUrl, isDiscordOAuthConfigured } from './discord-oauth';

const LR_STATE_COOKIE = 'owlhunt_lr_state';
const LR_TOKEN_PREFIX = 'linked_role_tokens:';
const TOKEN_TTL_SEC = 90 * 86400;

export const LINKED_ROLE_METADATA_KEYS = ['level', 'hunts', 'power', 'registered'] as const;

interface LinkedRoleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function clientId(): string {
  const id = process.env.CLIENT_ID?.trim();
  if (!id) throw new Error('CLIENT_ID missing');
  return id;
}

function clientSecret(): string {
  const secret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!secret) throw new Error('DISCORD_CLIENT_SECRET missing');
  return secret;
}

export function linkedRoleRedirectUri(): string {
  const custom = process.env.LINKED_ROLE_OAUTH_REDIRECT_URI?.trim();
  if (custom) return custom;
  return `${webPublicUrl()}/api/auth/discord/linked-role/callback`;
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function writeLinkedRoleState(res: ServerResponse, state: string): void {
  res.setHeader(
    'Set-Cookie',
    `${LR_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`,
  );
}

function readLinkedRoleState(req: IncomingMessage): string | null {
  const raw = req.headers.cookie ?? '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${LR_STATE_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function clearLinkedRoleState(res: ServerResponse): void {
  res.setHeader(
    'Set-Cookie',
    `${LR_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export function buildLinkedRoleOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: linkedRoleRedirectUri(),
    response_type: 'code',
    scope: 'identify role_connections.write',
    state,
    prompt: 'consent',
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

async function exchangeLinkedRoleCode(code: string): Promise<LinkedRoleTokens & { expires_in: number }> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: linkedRoleRedirectUri(),
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Linked role token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as LinkedRoleTokens & { expires_in: number };
  return data;
}

async function refreshLinkedRoleAccessToken(tokens: LinkedRoleTokens): Promise<LinkedRoleTokens> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Linked role token refresh failed (${res.status})`);
  }
  const data = (await res.json()) as LinkedRoleTokens & { expires_in: number };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

async function storeLinkedRoleTokens(redis: Redis | null, userId: string, tokens: LinkedRoleTokens): Promise<void> {
  if (!redis) return;
  await redis.set(`${LR_TOKEN_PREFIX}${userId}`, JSON.stringify(tokens), 'EX', TOKEN_TTL_SEC);
}

async function getLinkedRoleAccessToken(
  redis: Redis | null,
  userId: string,
  tokens: LinkedRoleTokens,
): Promise<string> {
  let current = tokens;
  if (Date.now() >= current.expires_at - 60_000) {
    current = await refreshLinkedRoleAccessToken(current);
    await storeLinkedRoleTokens(redis, userId, current);
  }
  return current.access_token;
}

async function fetchOAuthUser(accessToken: string): Promise<{ id: string; username: string; global_name?: string | null }> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Linked role @me failed (${res.status})`);
  return res.json() as Promise<{ id: string; username: string; global_name?: string | null }>;
}

export function buildLinkedRoleMetadata(player: {
  level: number;
  totalHunts: number;
  powerScore: number;
} | null): Record<string, string> {
  if (!player) {
    return { level: '0', hunts: '0', power: '0', registered: '0' };
  }
  return {
    level: String(player.level),
    hunts: String(player.totalHunts),
    power: String(player.powerScore),
    registered: '1',
  };
}

export async function pushLinkedRoleMetadata(
  userId: string,
  accessToken: string,
  platformUsername: string,
  metadata: Record<string, string>,
): Promise<void> {
  const url = `https://discord.com/api/v10/users/@me/applications/${clientId()}/role-connection`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      platform_name: 'OwlHunt',
      platform_username: platformUsername.slice(0, 100),
      metadata,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`push role-connection failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function syncPlayerLinkedRoleMetadata(
  prisma: PrismaClient,
  redis: Redis | null,
  userId: string,
  tokens: LinkedRoleTokens,
  platformUsername: string,
): Promise<Record<string, string>> {
  const player = await prisma.player.findUnique({
    where: { id: userId },
    select: { level: true, totalHunts: true, powerScore: true, leaderboardName: true },
  });
  const metadata = buildLinkedRoleMetadata(player);
  const accessToken = await getLinkedRoleAccessToken(redis, userId, tokens);
  const displayName = player?.leaderboardName ?? platformUsername;
  await pushLinkedRoleMetadata(userId, accessToken, displayName, metadata);
  return metadata;
}

export async function handleLinkedRoleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  prisma: PrismaClient | null,
  redis: Redis | null,
): Promise<boolean> {
  if (path === '/api/auth/discord/linked-role/start' || path === '/api/auth/discord/linked-role/start/') {
    if (!isDiscordOAuthConfigured()) {
      sendHtml(res, 503, errorPage('OAuth yapılandırılmamış', 'DISCORD_CLIENT_SECRET eksik.'));
      return true;
    }
    const state = randomBytes(16).toString('hex');
    writeLinkedRoleState(res, state);
    redirect(res, buildLinkedRoleOAuthUrl(state));
    return true;
  }

  if (path === '/api/auth/discord/linked-role/callback' || path === '/api/auth/discord/linked-role/callback/') {
    if (!isDiscordOAuthConfigured() || !prisma) {
      sendHtml(res, 503, errorPage('Bağlantı kurulamadı', 'Sunucu yapılandırması eksik.'));
      return true;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const saved = readLinkedRoleState(req);

    if (!code || !state || !saved || state !== saved) {
      clearLinkedRoleState(res);
      sendHtml(res, 403, errorPage('Doğrulama başarısız', 'OAuth state eşleşmedi. Tekrar dene.'));
      return true;
    }

    try {
      const tokenData = await exchangeLinkedRoleCode(code);
      const tokens: LinkedRoleTokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + tokenData.expires_in * 1000,
      };
      const user = await fetchOAuthUser(tokens.access_token);
      await storeLinkedRoleTokens(redis, user.id, tokens);
      const metadata = await syncPlayerLinkedRoleMetadata(
        prisma,
        redis,
        user.id,
        tokens,
        user.global_name ?? user.username,
      );
      clearLinkedRoleState(res);
      sendHtml(res, 200, successPage(user.global_name ?? user.username, metadata));
    } catch (err) {
      clearLinkedRoleState(res);
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[LinkedRole] callback failed:', msg);
      sendHtml(res, 500, errorPage('Bağlantı hatası', msg));
    }
    return true;
  }

  return false;
}

function errorPage(title: string, detail: string): string {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>${title}</title></head><body style="font-family:sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1>${title}</h1><p>${detail}</p><p><a href="/verify-user">← Geri dön</a></p></body></html>`;
}

function successPage(username: string, metadata: Record<string, string>): string {
  const rows = Object.entries(metadata)
    .map(([k, v]) => `<li><strong>${k}</strong>: ${v}</li>`)
    .join('');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Bağlandı — OwlHunt</title><link rel="stylesheet" href="/assets/styles.css"/></head><body><div class="bg-glow" aria-hidden="true"></div><main class="legal-main"><h1>✅ OwlHunt hesabın bağlandı</h1><p><strong>${username}</strong> — Discord Bağlı Rol verilerin güncellendi.</p><ul>${rows}</ul><p>Discord'a dön ve bağlı rolünü kontrol et.</p><p><a href="/">Ana sayfa</a></p></main></body></html>`;
}
