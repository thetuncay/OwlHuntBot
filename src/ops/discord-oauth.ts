/**
 * Discord OAuth2 — kullanici web girisi (hesap baglama).
 */
import type { IncomingMessage } from 'node:http';
import { isProduction } from '../env';

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
  email?: string | null;
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

export function webPublicUrl(): string {
  const raw = process.env.WEB_PUBLIC_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  if (isProduction) return 'https://owlhunt.thetuncay.com';
  return 'http://127.0.0.1:3011';
}

export function oauthRedirectUri(): string {
  const custom = process.env.WEB_OAUTH_REDIRECT_URI?.trim();
  if (custom) return custom;
  return `${webPublicUrl()}/api/auth/discord/redirect`;
}

export function oauthScopes(): string {
  return process.env.WEB_OAUTH_SCOPES?.trim() || 'identify email';
}

export function isDiscordOAuthConfigured(): boolean {
  return Boolean(process.env.CLIENT_ID?.trim() && process.env.DISCORD_CLIENT_SECRET?.trim());
}

export function buildDiscordLoginUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: oauthRedirectUri(),
    response_type: 'code',
    scope: oauthScopes(),
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export async function exchangeDiscordCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: oauthRedirectUri(),
  });

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord @me failed (${res.status})`);
  }

  return res.json() as Promise<DiscordUser>;
}

export function safeRedirectPath(req: IncomingMessage, fallback = '/dashboard'): string {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const next = url.searchParams.get('next') ?? fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}
