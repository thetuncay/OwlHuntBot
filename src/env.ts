/**
 * Ortam degiskeni yukleme ve dogrulama (development / production).
 * Tum entry point'ler bu modulu import etmeli — dotenv tek noktadan yuklenir.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: resolve(process.cwd(), '.env') });

export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = !isProduction;

export const botEnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  GUILD_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HEALTH_PORT: z.coerce.number().int().positive().default(3010),
});

export const workerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type BotEnv = z.infer<typeof botEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseBotEnv(): BotEnv {
  return botEnvSchema.parse(process.env);
}

export function parseWorkerEnv(): WorkerEnv {
  return workerEnvSchema.parse(process.env);
}

export const deployEnvSchema = botEnvSchema.pick({
  DISCORD_TOKEN: true,
  CLIENT_ID: true,
  GUILD_ID: true,
});

/** .env'den gelen tirnak/bosluk temizligi */
export function normalizeDatabaseUrl(url: string): string {
  return url.trim().replace(/^["']|["']$/g, '');
}

/** PgBouncer (transaction mode) uzerinden mi baglaniliyor? */
function usesPgBouncer(url: string): boolean {
  if (process.env.USE_PGBOUNCER === 'true' || process.env.USE_PGBOUNCER === '1') return true;
  const normalized = normalizeDatabaseUrl(url);
  try {
    const port = new URL(normalized.replace(/^postgresql:/, 'http:')).port;
    return port === '6432';
  } catch {
    return normalized.includes(':6432/') || normalized.includes(':6432?');
  }
}

/** PostgreSQL connection pool + PgBouncer parametrelerini DATABASE_URL'e ekler. */
export function appendPoolParams(url: string, mode: 'bot' | 'worker' = 'bot'): string {
  const normalized = normalizeDatabaseUrl(url);
  const params = new URLSearchParams(
    normalized.includes('?') ? (normalized.split('?')[1] ?? '') : '',
  );

  if (usesPgBouncer(normalized) && !params.has('pgbouncer')) {
    // PgBouncer transaction pooling: prepared statement isimleri cakisir (42P05)
    params.set('pgbouncer', 'true');
  }

  if (!params.has('connection_limit')) {
    const limit = mode === 'worker'
      ? Number.parseInt(process.env.WORKER_DB_POOL_LIMIT ?? '25', 10)
      : Number.parseInt(process.env.BOT_DB_POOL_LIMIT ?? '8', 10);
    params.set('connection_limit', String(limit));
  }

  if (!params.has('pool_timeout')) {
    params.set('pool_timeout', process.env.DB_POOL_TIMEOUT ?? '10');
  }

  if (!params.has('connect_timeout')) {
    params.set('connect_timeout', '10');
  }

  const base = normalized.split('?')[0] ?? normalized;
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Runtime Prisma URL — log icin host/port/param ozeti. */
export function describeDatabaseUrl(url: string): string {
  try {
    const u = new URL(normalizeDatabaseUrl(url).replace(/^postgresql:/, 'http:'));
    const pgbouncer = u.searchParams.get('pgbouncer') === 'true';
    return `${u.hostname}:${u.port || '5432'}/${u.pathname.slice(1)} pgbouncer=${pgbouncer} limit=${u.searchParams.get('connection_limit') ?? 'default'}`;
  } catch {
    return '(url parse failed)';
  }
}

export function resolveDatabaseUrl(mode: 'bot' | 'worker'): string {
  return appendPoolParams(process.env.DATABASE_URL ?? '', mode);
}

/**
 * Prisma migrate deploy icin dogrudan PostgreSQL URL'si.
 * PgBouncer (transaction mode) advisory lock desteklemez — migrate her zaman
 * Postgres'e direkt baglanmali.
 */
export function resolveMigrateDatabaseUrl(): string {
  const direct = process.env.DIRECT_DATABASE_URL?.trim();
  if (direct) return normalizeDatabaseUrl(direct);

  const url = normalizeDatabaseUrl(process.env.DATABASE_URL ?? '');
  if (!url) {
    throw new Error('DATABASE_URL veya DIRECT_DATABASE_URL tanimli olmali.');
  }

  const postgresHost = process.env.POSTGRES_HOST?.trim() || '127.0.0.1';
  const postgresPort = process.env.POSTGRES_PORT?.trim() || '5432';

  const qIndex = url.indexOf('?');
  const basePart = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const params = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : '');
  params.delete('pgbouncer');
  params.delete('connection_limit');

  let base = basePart;
  try {
    const parsed = new URL(base.replace(/^postgresql:/, 'http:'));
    const needsDirect =
      usesPgBouncer(url) ||
      parsed.hostname === 'pgbouncer' ||
      parsed.port === '6432';

    if (needsDirect) {
      parsed.hostname = postgresHost;
      parsed.port = postgresPort;
      const user = parsed.username ? decodeURIComponent(parsed.username) : '';
      const pass = parsed.password ? decodeURIComponent(parsed.password) : '';
      const auth = user
        ? `${encodeURIComponent(user)}${pass ? `:${encodeURIComponent(pass)}` : ''}@`
        : '';
      base = `postgresql://${auth}${parsed.hostname}:${parsed.port}${parsed.pathname}`;
    }
  } catch {
    base = base
      .replace(':6432/', `:${postgresPort}/`)
      .replace('@pgbouncer:', `@${postgresHost}:`);
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
