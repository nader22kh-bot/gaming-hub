import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL;
const bot = token ? new Telegraf(token) : null;

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
  bot.launch().then(() => console.log('Telegram bot started')).catch(console.error);
} else {
  console.log('BOT_TOKEN missing: running web app only. Add BOT_TOKEN to enable Telegram bot.');
}

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'Telegram Gaming Hub' }));

// Demo endpoint only. Replace with Telegram initData verification + persistent storage.
app.post('/api/score', (req, res) => {
  const { game, score } = req.body || {};
  if (typeof game !== 'string' || !Number.isFinite(score) || score < 0 || score > 100000) {
    return res.status(400).json({ error: 'Invalid score' });
  }
  res.json({ accepted: true, note: 'Demo only: scores are not persisted or verified.' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Gaming Hub listening on http://localhost:${port}`));

process.once('SIGINT', () => bot?.stop('SIGINT'));
process.once('SIGTERM', () => bot?.stop('SIGTERM'));
