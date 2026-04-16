# LinkedIn Meme Bot

Бот, який автоматично збирає меми з Reddit, фільтрує їх через Claude AI та публікує в LinkedIn після ручного схвалення через Telegram.

## Як це працює

1. **Fetch** (щодня о 8:00 UTC) — тягне топові пости з Reddit-сабреддітів, зберігає нові меми з картинками до SQLite
2. **Review** (9:00, 13:00, 18:00 UTC) — надсилає наступний мем у Telegram з кнопками для рішення
3. **Post** — після схвалення публікує мем у LinkedIn

```
Reddit → SQLite → Telegram (ручне рішення) → LinkedIn
```

## Встановлення

### 1. Залежності системи

Проєкт використовує `better-sqlite3` — це нативний Node.js-модуль, який компілюється при `npm install`. Потрібні build tools:

**macOS:**
```bash
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt install build-essential python3
```

**Windows:**
```bash
npm install -g windows-build-tools   # запускати від адміністратора
```

### 2. Node.js

Потрібна версія **Node.js >= 18**. Перевірити: `node -v`

### 3. Встановлення проєкту

```bash
git clone <repo>
cd memes
npm install
```

`better-sqlite3` скомпілюється автоматично під час `npm install`. База даних `data/memes.db` створюється сама при першому запуску — нічого вручну налаштовувати не треба.

### Якщо `npm install` падає на `better-sqlite3`

```bash
# Перебудувати нативний модуль вручну
npm rebuild better-sqlite3

# Або встановити з примусовою компіляцією
npm install --build-from-source
```

## Конфігурація

Створи `.env` файл у корені проєкту:

```env
# Anthropic Claude (фільтрація мемів)
ANTHROPIC_API_KEY=sk-ant-...

# Telegram Bot (для ручного схвалення)
TELEGRAM_BOT_TOKEN=123456789:AAF...
TELEGRAM_CHAT_ID=123456789          # твій особистий chat_id
TELEGRAM_CHANNEL_ID=-100123456789   # опційно: публікація в канал

# LinkedIn
LINKEDIN_ACCESS_TOKEN=AQV...
LINKEDIN_PERSON_URN=urn:li:person:abc123

# Reddit (опційно)
SUBREDDITS=ProgrammerHumor,devops   # default: ProgrammerHumor,devops
REDDIT_FETCH_LIMIT=30               # default: 30
REDDIT_USER_AGENT=linkedin-meme-bot/1.0

# Ліміти (опційно)
MAX_POSTS_PER_DAY=3                 # default: 3
```

### Як отримати токени

**Telegram:**
- Створи бота через [@BotFather](https://t.me/BotFather) → отримай `TELEGRAM_BOT_TOKEN`
- Напиши `/start` боту, потім відкрий `https://api.telegram.org/bot<TOKEN>/getUpdates` → знайди своє `chat.id`

**LinkedIn:**
- Зареєструй застосунок на [LinkedIn Developers](https://www.linkedin.com/developers/)
- Отримай OAuth 2.0 access token з правами `w_member_social`
- `LINKEDIN_PERSON_URN` — знайди через API: `GET https://api.linkedin.com/v2/userinfo`

## Запуск

```bash
# Scheduler (рекомендований режим — запускає cron)
npm start

# Одноразово затягнути нові меми
node src/index.js fetch

# Одноразово запустити review (надіслати один мем в Telegram)
node src/index.js review

# Dev-режим з авторестартом при змінах
npm run dev
```

## Telegram-кнопки

| Кнопка | Дія |
|--------|-----|
| ✅ LinkedIn | Публікує мем у LinkedIn з AI-текстом |
| ✏️ Змінити текст | Запитує новий текст, потім публікує |
| 📢 Telegram канал | Публікує в Telegram канал (якщо налаштовано) |
| ⏭ Скип | Пропускає, показує наступний |
| 🚫 Заблокувати | Блокує назавжди — більше не з'явиться |

## PM2 (production)

```bash
npm install -g pm2

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # автозапуск після перезавантаження

pm2 logs linkedin-meme-bot
pm2 status
```

## Структура проєкту

```
src/
  index.js      # точка входу, scheduler
  config.js     # конфігурація з env
  reddit.js     # fetch мемів з Reddit
  claude.js     # фільтрація та адаптація через Claude AI
  telegram.js   # Telegram-бот для ручного рев'ю
  linkedin.js   # публікація в LinkedIn
  db.js         # SQLite (better-sqlite3)
  tags.js       # генерація хештегів

data/
  memes.db      # SQLite база (створюється автоматично)

logs/           # PM2 логи
```

## Статуси мемів у БД

```
pending → sent_to_tg → approved → posted
                     → skipped
pending → rejected   (відхилено AI або заблоковано)
```
