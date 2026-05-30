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
  HEALTH_PORT: z.coerce.number().int().positive().default(3000),
});

export type BotEnv = z.infer<typeof botEnvSchema>;

export function parseBotEnv(): BotEnv {
  return botEnvSchema.parse(process.env);
}

export const deployEnvSchema = botEnvSchema.pick({
  DISCORD_TOKEN: true,
  CLIENT_ID: true,
  GUILD_ID: true,
});

/** PostgreSQL connection pool parametrelerini DATABASE_URL'e ekler. */
export function appendPoolParams(url: string): string {
  if (url.includes('connection_limit') || url.includes('pool_timeout')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=50&pool_timeout=15&connect_timeout=10`;
}
