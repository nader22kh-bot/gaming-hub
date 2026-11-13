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
const webAppUrl = process.env.WEBAPP_URL || "https://gaming-hub-0agm.onrender.com";
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
  bot.command('paysupport', (ctx) => ctx.reply(
    'For VIP subscription or Stars payment support, send your Telegram username, payment date, and a short description. Never send passwords or login codes.'
  ));
  bot.start((ctx) => ctx.reply(
    'Welcome to Gaming Hub! / أهلاً بك في مركز الألعاب!',
    Markup.inlineKeyboard([
      Markup.button.webApp('🎮 Play / العب', webAppUrl)
    ])
  ));
  bot.command('games', (ctx) => ctx.reply(
    'Open the game hub / افتح مركز الألعاب',
    Markup.inlineKeyboard([
      Markup.button.webApp('🚀 Open Games / افتح الألعاب', webAppUrl)
    ])
  ));
}

app.get('/api/vip', requireTelegramUser, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT status, expires_at FROM vip_subscriptions WHERE telegram_id = $1',
      [String(req.telegramUser.id)]
    );
    const sub = result.rows[0];
    const active = Boolean(sub && sub.status === 'active' && new Date(sub.expires_at) > new Date());
    res.json({ active, expiresAt: active ? sub.expires_at : null, priceStars: 100, periodDays: 30 });
  } catch (error) {
    console.error('Could not load VIP status:', error);
    res.status(500).json({ error: 'Could not load VIP status.' });
  }
});

app.post('/api/vip/invoice', requireTelegramUser, async (req, res) => {
  if (!bot) return res.status(503).json({ error: 'VIP payments are temporarily unavailable.' });
  try {
    const userId = String(req.telegramUser.id);
    const payload = 'vip30:' + userId + ':' + crypto.randomUUID();
    await pool.query(
      'INSERT INTO vip_pending_invoices (payload, telegram_id, amount, currency) VALUES ($1, $2, 100, $3)',
      [payload, userId, 'XTR']
    );
    const invoiceLink = await bot.telegram.createInvoiceLink({
      title: 'Gaming Hub VIP',
      description: 'VIP membership for 30 days. Renews automatically every 30 days until cancelled.',
      payload,
      currency: 'XTR',
      prices: [{ label: 'VIP - 30 days', amount: 100 }],
      subscription_period: 2592000
    });
    res.json({ invoiceLink });
  } catch (error) {
    console.error('Could not create VIP invoice:', error);
    res.status(500).json({ error: 'Could not create the VIP payment. Please try again.' });
  }
});

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
      `INSERT INTO players (telegram_id, username, first_name, points)
       VALUES ($1, $3, $4, 120 + $2)
       ON CONFLICT (telegram_id) DO UPDATE
       SET points = players.points + $2,
           username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           updated_at = NOW()
       RETURNING points`,
      [String(user.id), reward, user.username || null, user.first_name || null]
    );
    res.json({ accepted: true, awarded: reward, points: result.rows[0].points });
  } catch (error) {
    console.error('Could not save score:', error);
    res.status(500).json({ error: 'Could not save your points. Please try again.' });
  }
});

const port = Number(process.env.PORT || 3000);

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vip_pending_invoices (
      payload TEXT PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XTR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vip_payments (
      telegram_payment_charge_id TEXT PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      payload TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vip_subscriptions (
      telegram_id BIGINT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'inactive',
      expires_at TIMESTAMPTZ,
      last_charge_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
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
  if (bot) {
    bot.on('pre_checkout_query', async (ctx) => {
      try {
        const q = ctx.update.pre_checkout_query;
        const pending = await pool.query(
          'SELECT telegram_id, amount, currency FROM vip_pending_invoices WHERE payload = $1',
          [q.invoice_payload]
        );
        const item = pending.rows[0];
        const valid = item &&
          String(item.telegram_id) === String(q.from.id) &&
          item.amount === q.total_amount &&
          item.currency === q.currency &&
          q.currency === 'XTR';
        await ctx.answerPreCheckoutQuery(Boolean(valid), valid ? undefined : 'This VIP invoice is no longer valid. Please create a new one.');
      } catch (error) {
        console.error('VIP pre-checkout failed:', error);
        try { await ctx.answerPreCheckoutQuery(false, 'Could not verify this payment. Please try again.'); } catch {}
      }
    });

    bot.on('message', async (ctx) => {
      const payment = ctx.message?.successful_payment;
      if (!payment) return;
      try {
        const userId = String(ctx.from.id);
        const pending = await pool.query(
          'SELECT telegram_id, amount, currency FROM vip_pending_invoices WHERE payload = $1',
          [payment.invoice_payload]
        );
        const invoice = pending.rows[0];
        const isValidFirstPayment = invoice &&
          String(invoice.telegram_id) === userId &&
          invoice.amount === payment.total_amount &&
          invoice.currency === payment.currency;
        const isValidRenewal = Boolean(payment.is_recurring) &&
          payment.invoice_payload.startsWith('vip30:' + userId + ':');
        if ((!isValidFirstPayment && !isValidRenewal) ||
            payment.currency !== 'XTR' ||
            payment.total_amount !== 100) {
          console.error('Rejected unmatched VIP payment update:', payment.telegram_payment_charge_id);
          return;
        }
        const expiration = payment.subscription_expiration_date
          ? new Date(payment.subscription_expiration_date * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const saved = await pool.query(
          `INSERT INTO vip_payments
             (telegram_payment_charge_id, telegram_id, payload, amount, currency, is_recurring)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (telegram_payment_charge_id) DO NOTHING
           RETURNING telegram_payment_charge_id`,
          [payment.telegram_payment_charge_id, userId, payment.invoice_payload, payment.total_amount, payment.currency, Boolean(payment.is_recurring)]
        );
        if (saved.rowCount) {
          await pool.query(
            `INSERT INTO vip_subscriptions (telegram_id, status, expires_at, last_charge_id, updated_at)
             VALUES ($1, 'active', $2, $3, NOW())
             ON CONFLICT (telegram_id) DO UPDATE
             SET status = 'active', expires_at = GREATEST(COALESCE(vip_subscriptions.expires_at, EXCLUDED.expires_at), EXCLUDED.expires_at),
                 last_charge_id = EXCLUDED.last_charge_id, updated_at = NOW()`,
            [userId, expiration, payment.telegram_payment_charge_id]
          );
        }
        await ctx.reply('⭐ Your Gaming Hub VIP membership is active! / تم تفعيل عضوية VIP بنجاح.');
      } catch (error) {
        console.error('Could not record VIP payment:', error);
      }
    });
  }

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
