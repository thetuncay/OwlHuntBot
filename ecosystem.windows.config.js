/**
 * Windows yerel arka plan — PM2 (penceresiz).
 * Kullanım: pm2 start ecosystem.windows.config.js
 */
const { existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const rootDir = __dirname;
const logsDir = join(rootDir, 'logs');

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

const sharedEnv = {
  NODE_ENV: 'development',
  NODE_OPTIONS: '--max-old-space-size=1536',
  BOT_DB_POOL_LIMIT: '16',
  WORKER_DB_POOL_LIMIT: '20',
};

const common = {
  interpreter: 'node',
  node_args: '--import tsx',
  cwd: rootDir,
  instances: 1,
  exec_mode: 'fork',
  watch: false,
  windowsHide: true,
  autorestart: true,
  max_restarts: 20,
  min_uptime: '10s',
  restart_delay: 5000,
  kill_timeout: 20_000,
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
  merge_logs: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'owlhunt-bot',
      script: join(rootDir, 'src', 'index.ts'),
      env: { ...sharedEnv, RUN_MODE: 'bot' },
      max_memory_restart: '1536M',
      out_file: join(logsDir, 'bot-out.log'),
      error_file: join(logsDir, 'bot-error.log'),
    },
    {
      ...common,
      name: 'owlhunt-worker',
      script: join(rootDir, 'src', 'worker.ts'),
      env: { ...sharedEnv, RUN_MODE: 'worker' },
      max_memory_restart: '1024M',
      out_file: join(logsDir, 'worker-out.log'),
      error_file: join(logsDir, 'worker-error.log'),
    },
  ],
};
