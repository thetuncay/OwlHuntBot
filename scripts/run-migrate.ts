/**
 * Prisma migrate deploy — PgBouncer bypass ile dogrudan PostgreSQL.
 * Kullanim: pnpm db:migrate
 */
import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { describeDatabaseUrl, resolveMigrateDatabaseUrl } from '../src/env';

config({ path: resolve(process.cwd(), '.env') });

const migrateUrl = resolveMigrateDatabaseUrl();
console.info(`[Migrate] Baglanti: ${describeDatabaseUrl(migrateUrl)}`);

execSync('prisma migrate deploy', {
  env: {
    ...process.env,
    DATABASE_URL: migrateUrl,
  },
  stdio: 'inherit',
});
