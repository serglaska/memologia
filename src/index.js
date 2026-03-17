import cron from 'node-cron';
import { config } from './config.js';
import { fetchAllSubreddits } from './reddit.js';
import { sendForReview, waitForDecision, sendMessage, stopBot } from './telegram.js';
import { postToLinkedIn } from './linkedin.js';
import { getPending, countPending, countPostedToday } from './db.js';

// --- Основний флоу ---

async function fetchAndFilter() {
  console.log('[index] Починаємо fetch + filter...');
  await fetchAllSubreddits();
  console.log('[index] Fetch завершено');
}

async function reviewAndPost() {
  const postedToday = countPostedToday();
  if (postedToday >= config.bot.maxPostsPerDay) {
    console.log(`[index] Ліміт на сьогодні досягнуто (${postedToday}/${config.bot.maxPostsPerDay})`);
    return;
  }

  while (true) {
    const pending = getPending();
    if (pending.length === 0) {
      console.log('[index] Немає мемів для перевірки');
      await sendMessage('⚠️ Нових мемів не знайдено — черга порожня.');
      return;
    }

    // Беремо перший в черзі (найвищий score)
    const meme = pending[0];
    console.log(`[index] Надсилаємо на перевірку: ${meme.id} (score: ${meme.score}), в черзі: ${pending.length}`);

    await sendForReview(meme, meme.linkedin_text, pending.length);
    const decision = await waitForDecision(meme.id);

    console.log(`[index] Рішення: ${decision.action}`);

    if (decision.action === 'post') {
      const text = decision.customText ?? meme.linkedin_text ?? '';
      try {
        await postToLinkedIn(meme, text);
      } catch (err) {
        console.error('[index] Помилка публікації в LinkedIn:', err.message);
      }
      return;
    }

    if (decision.action === 'skip' || decision.action === 'block') {
      // Показуємо наступний мем одразу
      continue;
    }

    // tgchannel, timeout або інше — зупиняємось
    return;
  }
}

// --- Scheduler ---

function startScheduler() {
  // Щодня о 8:00 UTC — тягнемо нові меми
  cron.schedule(config.bot.schedules.fetch, () => {
    fetchAndFilter().catch(err => console.error('[cron] fetch error:', err));
  });

  // 9:00, 13:00, 18:00 UTC — пропонуємо мем на перевірку
  cron.schedule(config.bot.schedules.post, () => {
    reviewAndPost().catch(err => console.error('[cron] review error:', err));
  });

  console.log('[index] Scheduler запущено');
  console.log(`  fetch:  ${config.bot.schedules.fetch}`);
  console.log(`  post:   ${config.bot.schedules.post}`);
}

// --- Ручний запуск через аргументи ---

const [,, command] = process.argv;

if (command === 'fetch') {
  // node src/index.js fetch — одноразово тягнемо меми
  await fetchAndFilter();
  process.exit(0);
} else if (command === 'review') {
  // node src/index.js review — одноразово надсилаємо один мем в Telegram
  await reviewAndPost();
  stopBot();
  process.exit(0);
} else {
  // Звичайний запуск — scheduler
  startScheduler();
  console.log('[index] Bot is running. Press Ctrl+C to stop.');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[index] Shutting down...');
  stopBot();
  process.exit(0);
});
