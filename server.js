import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { Telegraf, Markup } from 'telegraf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL;
const bot = token && process.env.BOT_ENABLED !== "false" ? new Telegraf(token) : null;
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is missing. Add your PostgreSQL connection string in the hosting service environment variables.');
}
if (!token) {
  throw new Error('BOT_TOKEN is missing. Add your Telegram bot token in the hosting service environment variables.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false }
});

function verifyTelegramInitData(initData) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !Number.isFinite(authDate)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400 || authDate - now > 60) return null;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  let suppliedHash;
  try {
    suppliedHash = Buffer.from(receivedHash, 'hex');
  } catch {
    return null;
  }
  if (suppliedHash.length !== calculatedHash.length ||
      !crypto.timingSafeEqual(suppliedHash, calculatedHash)) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

function requireTelegramUser(req, res, next) {
  const initData = req.get('X-Telegram-Init-Data');
  const user = verifyTelegramInitData(initData);
  if (!user) return res.status(401).json({ error: 'Open Gaming Hub from Telegram to verify your account.' });
  req.telegramUser = user;
  next();
}

const rewards = {
  quiz_correct: 10,
  memory_complete: 30,
  reaction_fast: 20,
  puzzle_correct: 10,
  word_correct: 10
};

if (bot) {
  bot.start((ctx) => ctx.reply(
    'Welcome to Gaming Hub! / أهلاً بك في مركز الألعاب!',
    Markup.inlineKeyboard([
      Markup.button.webApp('🎮 Play / العب', webAppUrl || 'https://example.com')
    ])
  ));
  bot.command('games', (ctx) => ctx.reply(
    'Open the game hub / افتح مركز الألعاب',
    Markup.inlineKeyboard([
      Markup.button.webApp('🚀 Open Games / افتح الألعاب', webAppUrl || 'https://example.com')
    ])
  ));
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, app: 'Telegram Gaming Hub', database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

app.get('/api/me', requireTelegramUser, async (req, res) => {
  try {
    const user = req.telegramUser;
    const result = await pool.query(
      `INSERT INTO players (telegram_id, username, first_name, points)
       VALUES ($1, $2, $3, 120)
       ON CONFLICT (telegram_id) DO UPDATE
       SET username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           updated_at = NOW()
       RETURNING points`,
      [String(user.id), user.username || null, user.first_name || null]
    );
    res.json({ points: result.rows[0].points, firstName: user.first_name || 'Player' });
  } catch (error) {
    console.error('Could not load player:', error);
    res.status(500).json({ error: 'Could not load your saved points.' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const user = verifyTelegramInitData(req.get('X-Telegram-Init-Data'));
    const result = await pool.query(
      `SELECT telegram_id, username, first_name, points
       FROM players ORDER BY points DESC, updated_at ASC LIMIT 50`
    );
    res.json({ players: result.rows.map(row => ({
      name: row.username ? '@' + row.username : row.first_name || 'Player',
      points: row.points,
      isMe: Boolean(user && String(user.id) === String(row.telegram_id))
    })) });
  } catch (error) {
    console.error('Could not load leaderboard:', error);
    res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

app.post('/api/score', requireTelegramUser, async (req, res) => {
  const reward = rewards[req.body?.game];
  if (!reward) return res.status(400).json({ error: 'Unknown game reward.' });

  try {
    const user = req.telegramUser;
    const result = await pool.query(
      `UPDATE players
       SET points = points + $2, updated_at = NOW()
       WHERE telegram_id = $1
       RETURNING points`,
      [String(user.id), reward]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Player profile not found. Reopen the game and try again.' });
    res.json({ accepted: true, awarded: reward, points: result.rows[0].points });
  } catch (error) {
    console.error('Could not save score:', error);
    res.status(500).json({ error: 'Could not save your points. Please try again.' });
  }
});

const port = Number(process.env.PORT || 3000);

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      points INTEGER NOT NULL DEFAULT 120 CHECK (points >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  app.listen(port, () => console.log(`Gaming Hub listening on port ${port}`));
  bot?.launch()
    .then(() => console.log('Telegram bot started'))
    .catch((error) => console.error('Telegram bot failed to start:', error));
}

start().catch((error) => {
  console.error('Gaming Hub startup failed:', error);
  process.exit(1);
});

process.once('SIGINT', () => { bot?.stop('SIGINT'); pool.end(); });
process.once('SIGTERM', () => { bot?.stop('SIGTERM'); pool.end(); });
