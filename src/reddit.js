import { config } from './config.js';
import { isKnown, insertMeme, saveAiResult } from './db.js';

const USER_AGENT = config.reddit.userAgent;

// Домени які точно містять зображення
const IMAGE_DOMAINS = new Set([
  'i.redd.it', 'i.imgur.com', 'imgur.com',
  'preview.redd.it', 'external-preview.redd.it',
]);

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

function isImagePost(post) {
  if (post.is_video) return false;
  if (post.is_self) return false; // текстовий пост

  try {
    const domain = new URL(post.url).hostname;
    if (IMAGE_DOMAINS.has(domain)) return true;
  } catch {
    return false;
  }

  return IMAGE_EXTENSIONS.test(post.url);
}

function extractImageUrl(post) {
  // Віддаємо перевагу preview — він завжди прямий imgur/redd.it лінк
  const preview = post.preview?.images?.[0]?.source?.url;
  if (preview) {
    // Reddit екранує & у preview URL — розекрануємо
    return preview.replace(/&amp;/g, '&');
  }
  return post.url;
}

async function fetchSubreddit(subredditName) {
  const url = `https://www.reddit.com/r/${subredditName}/hot.json?limit=${config.reddit.fetchLimit}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const posts = json.data.children.map(c => c.data);

  const newMemes = [];

  for (const post of posts) {
    // Пропускаємо якщо вже в БД
    if (isKnown(post.id)) continue;

    // Пропускаємо не-зображення
    if (!isImagePost(post)) continue;

    if (post.score < 150) continue;

    const meme = {
      id:        post.id,
      subreddit: subredditName,
      title:     post.title,
      image_url: extractImageUrl(post),
      post_url:  `https://reddit.com${post.permalink}`,
      score:     post.score,
    };

    insertMeme(meme);
    saveAiResult(meme.id, { approved: true, linkedinText: meme.title });
  }
}

export async function fetchAllSubreddits() {
  for (const subreddit of config.reddit.subreddits) {
    try {
      await fetchSubreddit(subreddit);
      console.log(`[reddit] r/${subreddit}: завершено`);
    } catch (err) {
      console.error(`[reddit] r/${subreddit} помилка:`, err.message);
    }
  }
}
