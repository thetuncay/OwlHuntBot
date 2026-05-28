module.exports = {
  apps: [
    {
      name: 'owlhuntbot-shard',
      script: 'src/shard.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      env: { NODE_ENV: 'production' },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 5000,
      max_memory_restart: '1500M',
      node_args: '--max-old-space-size=1024',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/shard-error.log',
      out_file: 'logs/shard-out.log',
    },
  ],
};
