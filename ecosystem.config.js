module.exports = {
  apps: [
    {
      name: 'xtouch-gw',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      time: true,
      env: {
        NODE_ENV: 'production',
        DISABLE_CLI: 'true',
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Windows-specific: use graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: false,
    },
  ],
};
