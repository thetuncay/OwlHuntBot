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

/** PostgreSQL connection pool parametrelerini DATABASE_URL'e ekler. */
export function appendPoolParams(url: string, mode: 'bot' | 'worker' = 'bot'): string {
  if (url.includes('connection_limit') || url.includes('pool_timeout')) return url;
  const separator = url.includes('?') ? '&' : '?';
  const limit = mode === 'worker'
    ? Number.parseInt(process.env.WORKER_DB_POOL_LIMIT ?? '25', 10)
    : Number.parseInt(process.env.BOT_DB_POOL_LIMIT ?? '8', 10);
  const timeout = Number.parseInt(process.env.DB_POOL_TIMEOUT ?? '10', 10);
  return `${url}${separator}connection_limit=${limit}&pool_timeout=${timeout}&connect_timeout=10`;
}
