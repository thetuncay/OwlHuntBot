const { existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const rootDir = __dirname;
const logsDir = join(rootDir, 'logs');

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true, mode: 0o755 });
}

const sharedEnv = {
  NODE_ENV: 'production',
  NODE_OPTIONS: '--max-old-space-size=2560',
  env_file: join(rootDir, '.env'),
};

module.exports = {
  apps: [
    {
      name: 'owlhuntbot-shard',
      script: join(rootDir, 'dist', 'shard.js'),
      interpreter: 'node',
      node_args: '--import tsx',
      cwd: rootDir,
      instances: 1,
      exec_mode: 'fork',
      env: { ...sharedEnv, RUN_MODE: 'bot' },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      max_memory_restart: '2800M',
      kill_timeout: 30_000,
      listen_timeout: 30_000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: join(logsDir, 'shard-out.log'),
      error_file: join(logsDir, 'shard-error.log'),
      merge_logs: true,
    },
    {
      name: 'owlhuntbot-worker',
      script: join(rootDir, 'dist', 'worker.js'),
      interpreter: 'node',
      node_args: '--import tsx',
      cwd: rootDir,
      instances: 1,
      exec_mode: 'fork',
      env: { ...sharedEnv, RUN_MODE: 'worker' },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      max_memory_restart: '1600M',
      kill_timeout: 30_000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: join(logsDir, 'worker-out.log'),
      error_file: join(logsDir, 'worker-error.log'),
      merge_logs: true,
    },
    {
      name: 'owlhuntbot-ops-panel',
      script: join(rootDir, 'dist', 'ops-panel.js'),
      interpreter: 'node',
      node_args: '--import tsx',
      cwd: rootDir,
      instances: 1,
      exec_mode: 'fork',
      env: { ...sharedEnv, RUN_MODE: 'ops-panel' },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      max_memory_restart: '384M',
      kill_timeout: 10_000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: join(logsDir, 'ops-panel-out.log'),
      error_file: join(logsDir, 'ops-panel-error.log'),
      merge_logs: true,
    },
  ],
};
