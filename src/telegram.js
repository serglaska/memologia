import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import {
  getByTgMessageId,
  saveTgMessageId,
  updateStatus,
  markSkipped,
} from './db.js';

const bot = new TelegramBot(config.telegram.token, { polling: true });

// Зберігаємо стан "очікує новий текст від тебе"
// Map: chatId → memeId
const awaitingEdit = new Map();

// --- Надсилання мему на перевірку ---

export async function sendForReview(meme, linkedinText, pendingCount) {
  const caption = [
    `📝 <b>Текст для LinkedIn:</b>`,
    `<i>${escapeHtml(linkedinText ?? '')}</i>`,
    ``,
    `📊 Score: ${meme.score} | r/${meme.subreddit}`,
    `🔗 <a href="${meme.post_url}">Reddit</a>`,
    `📦 В черзі: ${pendingCount ?? '?'}`,
  ].join('\n');

  const tgChannelRow = config.telegram.channelId
    ? [{ text: '📢 Telegram канал', callback_data: `tgchannel:${meme.id}` }]
    : [];

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ LinkedIn', callback_data: `post:${meme.id}` },
        { text: '✏️ Змінити текст', callback_data: `edit:${meme.id}` },
      ],
      ...(tgChannelRow.length ? [tgChannelRow] : []),
      [
        { text: '⏭ Скип', callback_data: `skip:${meme.id}` },
        { text: '🚫 Заблокувати', callback_data: `block:${meme.id}` },
      ],
    ],
  };

  const msg = await bot.sendPhoto(config.telegram.chatId, meme.image_url, {
    caption,
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });

  saveTgMessageId(meme.id, msg.message_id);
  return msg.message_id;
}

// --- Обробка кнопок ---

// Повертає Promise який резолвиться коли юзер натискає ✅ або ⏭/🚫
// Для простоти: зовнішній код підписується через onDecision()
const decisionCallbacks = new Map(); // memeId → { resolve, reject }

export function waitForDecision(memeId, timeoutMs = 24 * 60 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      decisionCallbacks.delete(memeId);
      resolve({ action: 'timeout' });
    }, timeoutMs);

    decisionCallbacks.set(memeId, {
      resolve: (result) => {
        clearTimeout(timer);
        decisionCallbacks.delete(memeId);
        resolve(result);
      },
      reject,
    });
  });
}

bot.on('callback_query', async (query) => {
  const { data, message, from } = query;
  if (!data) return;

  // Перевіряємо що запит від тебе (chatId)
  if (String(from.id) !== String(config.telegram.chatId)) {
    await bot.answerCallbackQuery(query.id, { text: 'Not authorized' });
    return;
  }

  const [action, memeId] = data.split(':');
  const cb = decisionCallbacks.get(memeId);

  await bot.answerCallbackQuery(query.id);

  switch (action) {
    case 'post': {
      await editCaption(message, '✅ Схвалено — буде опубліковано');
      updateStatus(memeId, 'approved');
      cb?.resolve({ action: 'post', memeId });
      break;
    }

    case 'edit': {
      awaitingEdit.set(String(from.id), memeId);
      await bot.sendMessage(
        config.telegram.chatId,
        '✏️ Надішли новий текст для LinkedIn:',
        { reply_markup: { force_reply: true } },
      );
      // не резолвимо ще — чекаємо нового тексту
      break;
    }

    case 'skip': {
      await editCaption(message, '⏭ Пропущено');
      markSkipped(memeId);
      cb?.resolve({ action: 'skip', memeId });
      break;
    }

    case 'block': {
      await editCaption(message, '🚫 Заблоковано — більше не з\'явиться');
      updateStatus(memeId, 'blocked');
      cb?.resolve({ action: 'block', memeId });
      break;
    }

    case 'tgchannel': {
      const meme = getByTgMessageId(message.message_id);
      if (!meme || !config.telegram.channelId) break;
      try {
        await bot.sendPhoto(config.telegram.channelId, meme.image_url);
        await editCaption(message, '📢 Опубліковано в Telegram канал');
        updateStatus(memeId, 'posted');
      } catch (err) {
        await bot.sendMessage(config.telegram.chatId, `❌ Помилка публікації в канал: ${err.message}`);
      }
      cb?.resolve({ action: 'tgchannel', memeId });
      break;
    }
  }
});

// --- Обробка нового тексту після "Змінити" ---

bot.on('message', async (msg) => {
  const userId = String(msg.from?.id);
  const memeId = awaitingEdit.get(userId);

  if (!memeId || !msg.text) return;

  awaitingEdit.delete(userId);

  const newText = msg.text.trim();
  const cb = decisionCallbacks.get(memeId);

  await bot.sendMessage(config.telegram.chatId, `✅ Текст збережено:\n\n<i>${escapeHtml(newText)}</i>`, {
    parse_mode: 'HTML',
  });

  updateStatus(memeId, 'approved');
  cb?.resolve({ action: 'post', memeId, customText: newText });
});

// --- Утиліти ---

async function editCaption(message, newCaption) {
  try {
    await bot.editMessageCaption(newCaption, {
      chat_id: message.chat.id,
      message_id: message.message_id,
    });
  } catch {
    // Якщо не вдалося (напр. фото вже без caption) — ігноруємо
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendMessage(text) {
  await bot.sendMessage(config.telegram.chatId, text);
}

export function stopBot() {
  bot.stopPolling();
}
