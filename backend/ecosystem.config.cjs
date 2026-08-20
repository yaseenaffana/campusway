module.exports = {
  apps: [
    {
      name: 'mzsjs-buzz-api',
      cwd: './backend',
      script: 'server.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: '10s',
      max_memory_restart: '500M',
      merge_logs: true,
      time: true,
      out_file: '../logs/pm2-out.log',
      error_file: '../logs/pm2-error.log',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 4010,
      },
    },
  ],
};
