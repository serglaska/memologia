import 'dotenv/config';

function require(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

function optional(name, fallback) {
  return process.env[name] ?? fallback;
}

export const config = {
  reddit: {
    userAgent:  optional('REDDIT_USER_AGENT', 'linkedin-meme-bot/1.0'),
    subreddits: optional('SUBREDDITS', 'ProgrammerHumor,devops').split(',').map(s => s.trim()),
    fetchLimit: Number(optional('REDDIT_FETCH_LIMIT', '30')),
  },

  anthropic: {
    apiKey: require('ANTHROPIC_API_KEY'),
    model:  'claude-haiku-4-5-20251001',
  },

  telegram: {
    token:     require('TELEGRAM_BOT_TOKEN'),
    chatId:    require('TELEGRAM_CHAT_ID'),
    channelId: optional('TELEGRAM_CHANNEL_ID', null),
  },

  linkedin: {
    accessToken: require('LINKEDIN_ACCESS_TOKEN'),
    personUrn:   require('LINKEDIN_PERSON_URN'),
  },

  bot: {
    maxPostsPerDay: Number(optional('MAX_POSTS_PER_DAY', '3')),
    // Час публікації (cron): 9:00, 13:00, 18:00 за UTC
    schedules: {
      fetch:   '0 8 * * *',   // щодня о 8:00 UTC — тягнемо меми
      post:    '0 9,13,18 * * *', // три рази на день — пропонуємо в Telegram
    },
  },
};
