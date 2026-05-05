module.exports = {
  apps: [
    {
      // ── Üretim: ShardingManager (önerilen) ──────────────────────────────
      // Her shard ayrı process = ayrı event loop = paralel komut işleme
      // Başlatma: pm2 start ecosystem.config.js --only owlhuntbot-shard
      name: 'owlhuntbot-shard',
      script: 'dist/shard.js',
      interpreter: 'node',
      instances: 1,        // ShardingManager tek process, shardları o yönetir
      exec_mode: 'fork',
      env_file: '.env',
      env: { NODE_ENV: 'production' },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '512M',  // ShardingManager hafif, shardlar ayrı process
      node_args: '--max-old-space-size=512',
    },
    {
      // ── Alternatif: Tek process (sharding olmadan) ───────────────────────
      // Küçük ölçek veya test için. Sharding yoksa bu kullanılır.
      // Başlatma: pm2 start ecosystem.config.js --only owlhuntbot
      name: 'owlhuntbot',
      script: 'dist/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      env: { NODE_ENV: 'production' },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
    },
  ],
};
