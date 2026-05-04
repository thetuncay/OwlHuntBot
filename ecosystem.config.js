module.exports = {
  apps: [
    {
      name: 'owlhuntbot',
      script: 'dist/index.js',
      interpreter: 'node',
      instances: 2,        // 4 core var, 2 instance — MongoDB ve Redis'e yük bindirmemek için
      exec_mode: 'cluster', // PM2 cluster modu: her instance ayrı CPU core'da çalışır
      env_file: '.env',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G', // 1GB'ı aşarsa otomatik restart
    },
  ],
};
