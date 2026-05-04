module.exports = {
  apps: [
    {
      name: 'owlhuntbot',
      script: 'dist/index.js',
      interpreter: 'node',
      instances: 1,        // Discord botları cluster modunda çalışmaz — tek instance
      exec_mode: 'fork',   // fork modu: tek process
      env_file: '.env',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024', // Node.js heap limitini artır
    },
  ],
};
