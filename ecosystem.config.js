const { existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const rootDir = __dirname;
const logsDir = join(rootDir, 'logs');

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true, mode: 0o755 });
}

module.exports = {
  apps: [
    {
      name: 'owlhuntbot',
      script: join(rootDir, 'dist', 'shard.js'),
      interpreter: 'node',
      node_args: '--import tsx',
      cwd: rootDir,
      instances: 1,
      exec_mode: 'fork',
      env_file: join(rootDir, '.env'),
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      max_memory_restart: '1500M',
      kill_timeout: 30_000,
      listen_timeout: 30_000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: join(logsDir, 'stdout.log'),
      error_file: join(logsDir, 'error.log'),
      log_file: join(logsDir, 'combined.log'),
      merge_logs: true,
    },
  ],
};
