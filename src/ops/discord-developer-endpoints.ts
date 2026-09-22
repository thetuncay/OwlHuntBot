/**
 * Discord Developer Portal — Interactions Endpoint URL
 * POST /api/interactions — Ed25519 imza doğrulama + PING/PONG
 *
 * Linked Roles: src/ops/linked-roles.ts → GET /verify-user
 */
import { verifyKey } from 'discord-interactions';
import type { IncomingMessage, ServerResponse } from 'node:http';

const INTERACTION_TYPE_PING = 1;
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE = 4;
const MESSAGE_FLAG_EPHEMERAL = 64;

let cachedPublicKey: string | null = process.env.DISCORD_PUBLIC_KEY?.trim() || null;

const DISCORD_CORS_ORIGINS = new Set([
  'https://discord.com',
  'https://ptb.discord.com',
  'https://canary.discord.com',
  'https://discordapp.com',
]);

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function applyDiscordCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = headerValue(req.headers.origin);
  if (origin && DISCORD_CORS_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature-Ed25519, X-Signature-Timestamp');
    res.setHeader('Vary', 'Origin');
  }
}

function logInteractionHit(req: IncomingMessage): void {
  const ua = headerValue(req.headers['user-agent']) ?? '-';
  const origin = headerValue(req.headers.origin) ?? '-';
  console.info(
    `[OpsHTTP] /api/interactions ${req.method ?? '?'} (origin=${origin}, ua=${ua.slice(0, 80)})`,
  );
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function resolveDiscordPublicKey(): Promise<string | null> {
  if (cachedPublicKey) return cachedPublicKey;

  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) return null;

  try {
    const res = await fetch('https://discord.com/api/v10/applications/@me', {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) return null;
    const app = (await res.json()) as { verify_key?: string };
    cachedPublicKey = app.verify_key?.trim() || null;
    if (cachedPublicKey) {
      console.info(`[OpsHTTP] Discord Public Key API'den yüklendi (${cachedPublicKey.slice(0, 8)}…)`);
    }
    return cachedPublicKey;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[OpsHTTP] Discord Public Key alınamadı:', msg);
    return null;
  }
}

export async function logDiscordPublicKeyStatus(): Promise<void> {
  const key = await resolveDiscordPublicKey();
  if (key) {
    console.info(`[OpsHTTP] Interactions endpoint hazır (public key ${key.slice(0, 8)}…)`);
  } else {
    console.warn('[OpsHTTP] Interactions endpoint: DISCORD_PUBLIC_KEY yok — portal doğrulaması başarısız olur.');
  }
}

export async function handleDiscordDeveloperRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<boolean> {
  if (path !== '/api/interactions' && path !== '/api/interactions/') {
    return false;
  }

  logInteractionHit(req);
  applyDiscordCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(JSON.stringify({ ok: true, endpoint: 'OwlHunt interactions', method: 'POST' }));
    }
    return true;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return true;
  }

  const publicKey = await resolveDiscordPublicKey();
  if (!publicKey) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'DISCORD_PUBLIC_KEY not configured' }));
    return true;
  }

  const rawBody = await readRawBody(req);
  const signature = headerValue(req.headers['x-signature-ed25519']);
  const timestamp = headerValue(req.headers['x-signature-timestamp']);

  const valid = signature && timestamp
    ? await verifyKey(rawBody, signature, timestamp, publicKey)
    : false;

  if (!valid) {
    console.warn(
      '[OpsHTTP] Discord interaction imza doğrulaması başarısız',
      `(body=${rawBody.length}B, sig=${signature?.length ?? 0}, ts=${timestamp ? 'ok' : 'missing'})`,
    );
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid request signature');
    return true;
  }

  let body: { type?: number };
  try {
    body = JSON.parse(rawBody.toString('utf8')) as { type?: number };
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'invalid_json' }));
    return true;
  }

  if (body.type === INTERACTION_TYPE_PING) {
    console.info('[OpsHTTP] Discord interaction PING → PONG');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ type: RESPONSE_TYPE_PONG }));
    return true;
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    type: RESPONSE_TYPE_CHANNEL_MESSAGE,
    data: {
      content: 'Bu bot Gateway modunda çalışır. Komutları Discord kanalından kullan.',
      flags: MESSAGE_FLAG_EPHEMERAL,
    },
  }));
  return true;
}
