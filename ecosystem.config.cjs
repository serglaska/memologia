module.exports = {
  apps: [
    {
      name: 'linkedin-meme-bot',
      script: 'src/index.js',

      // Автоматичний рестарт при падінні
      autorestart: true,
      watch: false,

      // Рестарт якщо бот займає > 300MB RAM (захист від витоків)
      max_memory_restart: '300M',

      // Затримка між рестартами (щоб не спамити при циклічному краші)
      restart_delay: 5000,

      // Логи
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Передаємо .env автоматично
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
