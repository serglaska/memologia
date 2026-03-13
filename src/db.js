import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';

mkdirSync('./data', { recursive: true });

const db = new Database('./data/memes.db');

// Вмикаємо WAL-режим — швидше при одночасних читаннях/записах
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS memes (
    id          TEXT PRIMARY KEY,   -- reddit post id
    subreddit   TEXT NOT NULL,
    title       TEXT NOT NULL,
    image_url   TEXT NOT NULL,
    post_url    TEXT NOT NULL,
    score       INTEGER DEFAULT 0,

    -- AI-результат
    approved    INTEGER,            -- NULL = не перевірено, 1 = ок, 0 = відхилено
    linkedin_text TEXT,             -- текст після адаптації Claude

    -- Стан в черзі
    status      TEXT NOT NULL DEFAULT 'pending',
    -- pending → sent_to_tg → approved → posted
    -- pending → sent_to_tg → skipped
    -- pending → rejected (Claude відхилив)

    -- Telegram
    tg_message_id INTEGER,          -- щоб редагувати/видаляти повідомлення

    -- Результат публікації
    linkedin_post_id TEXT,
    posted_at   TEXT,               -- ISO timestamp

    fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_status ON memes(status);
  CREATE INDEX IF NOT EXISTS idx_fetched_at ON memes(fetched_at);
`);

// --- Читання ---

export function isKnown(redditId) {
  return !!db.prepare('SELECT 1 FROM memes WHERE id = ?').get(redditId);
}

export function getPending() {
  return db.prepare(`
    SELECT * FROM memes WHERE status = 'pending' AND linkedin_text IS NOT NULL ORDER BY score DESC LIMIT 10
  `).all();
}

export function getByTgMessageId(tgMessageId) {
  return db.prepare('SELECT * FROM memes WHERE tg_message_id = ?').get(tgMessageId);
}

export function countPostedToday() {
  return db.prepare(`
    SELECT COUNT(*) as n FROM memes
    WHERE status = 'posted'
      AND posted_at >= datetime('now', 'start of day')
  `).get().n;
}

// --- Запис ---

export function insertMeme(meme) {
  db.prepare(`
    INSERT OR IGNORE INTO memes (id, subreddit, title, image_url, post_url, score)
    VALUES (@id, @subreddit, @title, @image_url, @post_url, @score)
  `).run(meme);
}

export function updateStatus(id, status) {
  db.prepare('UPDATE memes SET status = ? WHERE id = ?').run(status, id);
}

export function saveAiResult(id, { approved, linkedinText }) {
  db.prepare(`
    UPDATE memes SET approved = ?, linkedin_text = ?, status = ?
    WHERE id = ?
  `).run(approved ? 1 : 0, linkedinText ?? null, approved ? 'pending' : 'rejected', id);
}

export function saveTgMessageId(id, tgMessageId) {
  db.prepare('UPDATE memes SET tg_message_id = ?, status = ? WHERE id = ?')
    .run(tgMessageId, 'sent_to_tg', id);
}

export function markPosted(id, linkedinPostId) {
  db.prepare(`
    UPDATE memes SET status = 'posted', linkedin_post_id = ?, posted_at = datetime('now')
    WHERE id = ?
  `).run(linkedinPostId, id);
}

export function markSkipped(id) {
  updateStatus(id, 'skipped');
}
