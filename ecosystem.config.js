module.exports = {
  apps: [
    {
      name: 'fill-sheet-user1',
      script: 'dist/fill-sheet/server.js',
      args: './config/profiles/user1.yaml',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/user1-error.log',
      out_file: './logs/user1-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      post_start: ['mkdir', '-p', 'logs'],
    },
    // 多用户示例：取消注释并修改为你的配置
    // {
    //   name: 'fill-sheet-user2',
    //   script: 'dist/fill-sheet/server.js',
    //   args: './config/profiles/user2.yaml',
    //   interpreter: 'node',
    //   instances: 1,
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: '512M',
    //   error_file: './logs/user2-error.log',
    //   out_file: './logs/user2-out.log',
    // },
  ],
};
