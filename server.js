import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { Telegraf, Markup } from 'telegraf';
import { createMatch, applyMatchAction, publicMatchState } from './baloot-engine.js';

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
  word_correct: 10,
  baloot_stage: 25
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


const balootShopItems = {
  felt_green: 100,
  gold_deck: 250,
  royal_frame: 400,
  desert_table: 600
};
app.get('/api/baloot/status', requireTelegramUser, async (req,res)=>{
 try{
  const id=String(req.telegramUser.id);
  const [player,progress,items]=await Promise.all([
   pool.query('SELECT points FROM players WHERE telegram_id=$1',[id]),
   pool.query('SELECT stage FROM baloot_progress WHERE telegram_id=$1',[id]),
   pool.query('SELECT item_id FROM baloot_inventory WHERE telegram_id=$1 ORDER BY purchased_at',[id])
  ]);
  res.json({points:player.rows[0]?.points??120,stage:progress.rows[0]?.stage??1,inventory:items.rows.map(x=>x.item_id)});
 }catch(e){console.error('Baloot status failed',e);res.status(500).json({error:'Could not load Baloot progress.'});}
});
app.post('/api/baloot/complete', requireTelegramUser, async (req,res)=>{
 const stage=Number(req.body?.stage);
 if(!Number.isInteger(stage)||stage<1||stage>20)return res.status(400).json({error:'Invalid stage.'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const p=await client.query('SELECT stage FROM baloot_progress WHERE telegram_id=$1 FOR UPDATE',[String(req.telegramUser.id)]);
  const current=p.rows[0]?.stage??1;
  if(stage!==current){await client.query('ROLLBACK');return res.status(409).json({error:'This stage was already claimed or is not unlocked.'});}
  const player=await client.query(
   `INSERT INTO players (telegram_id,username,first_name,points)
    VALUES ($1,$2,$3,145)
    ON CONFLICT (telegram_id) DO UPDATE SET points=players.points+25,updated_at=NOW()
    RETURNING points`,
   [String(req.telegramUser.id),req.telegramUser.username||null,req.telegramUser.first_name||null]
  );
  const next=current+1;
  await client.query(
   `INSERT INTO baloot_progress (telegram_id,stage) VALUES ($1,$2)
    ON CONFLICT (telegram_id) DO UPDATE SET stage=EXCLUDED.stage,updated_at=NOW()`,
   [String(req.telegramUser.id),next]
  );
  await client.query('COMMIT');
  res.json({points:player.rows[0].points,stage:next,reward:25});
 }catch(e){await client.query('ROLLBACK');console.error('Baloot stage claim failed',e);res.status(500).json({error:'Could not save stage reward.'});}
 finally{client.release();}
});
app.post('/api/baloot/shop', requireTelegramUser, async (req,res)=>{
 const item=String(req.body?.item||'');
 const cost=balootShopItems[item];
 if(!cost)return res.status(400).json({error:'Unknown shop item.'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const already=await client.query('SELECT 1 FROM baloot_inventory WHERE telegram_id=$1 AND item_id=$2',[String(req.telegramUser.id),item]);
  if(already.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'You already own this item.'});}
  const player=await client.query('UPDATE players SET points=points-$2,updated_at=NOW() WHERE telegram_id=$1 AND points >= $2 RETURNING points',[String(req.telegramUser.id),cost]);
  if(!player.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Not enough points.'});}
  await client.query('INSERT INTO baloot_inventory (telegram_id,item_id) VALUES ($1,$2)',[String(req.telegramUser.id),item]);
  const inventory=await client.query('SELECT item_id FROM baloot_inventory WHERE telegram_id=$1 ORDER BY purchased_at',[String(req.telegramUser.id)]);
  await client.query('COMMIT');
  res.json({points:player.rows[0].points,inventory:inventory.rows.map(x=>x.item_id)});
 }catch(e){await client.query('ROLLBACK');console.error('Baloot purchase failed',e);res.status(500).json({error:'Could not complete purchase.'});}
 finally{client.release();}
});

const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeRoomCode() {
  return Array.from({ length: 6 }, () => roomCodeAlphabet[crypto.randomInt(roomCodeAlphabet.length)]).join("");
}
function roomError(res, error) {
  const message = error?.message || "Baloot room action failed.";
  const status = /not seated|not your turn|already|full|complete|follow suit|valid|choose|four/i.test(message) ? 409 : 400;
  return res.status(status).json({ error: message });
}
function roomView(state, viewerId) {
  if (state.phase === "lobby") return {
    phase: "lobby", code: state.code,
    seats: state.seats.map(p => p ? { name:p.name, seat:p.seat, ready:p.ready, isMe:p.userId===String(viewerId) } : null)
  };
  return { ...publicMatchState(state, viewerId), code: state.code };
}
app.post('/api/baloot/rooms', requireTelegramUser, async (req,res)=>{
  const user=req.telegramUser, id=String(user.id);
  try {
    let code, inserted=false;
    for(let attempt=0;attempt<5&&!inserted;attempt++){
      code=makeRoomCode();
      const state={phase:"lobby",code,hostId:id,seats:[{userId:id,name:user.first_name||user.username||"Player",seat:0,ready:true},null,null,null]};
      const result=await pool.query(
        "INSERT INTO baloot_rooms (room_code,host_id,state) VALUES ($1,$2,$3::jsonb) ON CONFLICT (room_code) DO NOTHING RETURNING room_code",
        [code,id,JSON.stringify(state)]
      );
      inserted=result.rowCount===1;
    }
    if(!inserted) return res.status(503).json({error:"Could not create a private table. Try again."});
    const result=await pool.query("SELECT state FROM baloot_rooms WHERE room_code=$1",[code]);
    res.status(201).json({room:roomView(result.rows[0].state,id)});
  } catch(e){console.error("Baloot room create failed",e);res.status(500).json({error:"Could not create a private table."});}
});
app.post('/api/baloot/rooms/:code/join', requireTelegramUser, async (req,res)=>{
  const code=String(req.params.code||"").toUpperCase(), user=req.telegramUser, id=String(user.id);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const row=await client.query("SELECT state FROM baloot_rooms WHERE room_code=$1 FOR UPDATE",[code]);
    if(!row.rowCount) throw new Error("Room code not found.");
    const state=row.rows[0].state;
    if(state.phase!=="lobby") throw new Error("This match has already started.");
    if(state.seats.some(p=>p?.userId===id)){await client.query("COMMIT");return res.json({room:roomView(state,id)});}
    const seat=state.seats.findIndex(p=>p===null);
    if(seat<0) throw new Error("This table is full.");
    state.seats[seat]={userId:id,name:user.first_name||user.username||"Player",seat,ready:false};
    await client.query("UPDATE baloot_rooms SET state=$2::jsonb,updated_at=NOW() WHERE room_code=$1",[code,JSON.stringify(state)]);
    await client.query("COMMIT");
    res.json({room:roomView(state,id)});
  }catch(e){await client.query("ROLLBACK");roomError(res,e);}
  finally{client.release();}
});
app.get('/api/baloot/rooms/:code', requireTelegramUser, async (req,res)=>{
  const code=String(req.params.code||"").toUpperCase(), id=String(req.telegramUser.id);
  try{
    const row=await pool.query("SELECT state FROM baloot_rooms WHERE room_code=$1",[code]);
    if(!row.rowCount) return res.status(404).json({error:"Room code not found."});
    const state=row.rows[0].state;
    if(!state.seats.some(p=>p?.userId===id)) return res.status(403).json({error:"You are not seated at this private table."});
    res.json({room:roomView(state,id)});
  }catch(e){console.error("Baloot room load failed",e);res.status(500).json({error:"Could not load this table."});}
});
app.post('/api/baloot/rooms/:code/ready', requireTelegramUser, async (req,res)=>{
  const code=String(req.params.code||"").toUpperCase(), id=String(req.telegramUser.id);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const row=await client.query("SELECT state FROM baloot_rooms WHERE room_code=$1 FOR UPDATE",[code]);
    if(!row.rowCount) throw new Error("Room code not found.");
    let state=row.rows[0].state;
    if(state.phase!=="lobby") throw new Error("The match has already started.");
    const seat=state.seats.findIndex(p=>p?.userId===id);
    if(seat<0) throw new Error("You are not seated at this table.");
    state.seats[seat].ready=Boolean(req.body?.ready);
    if(state.seats.every(Boolean)&&state.seats.every(p=>p.ready)){
      const match=createMatch(state.seats.map(p=>({userId:p.userId,name:p.name})));
      state={...match,code,hostId:state.hostId};
    }
    await client.query("UPDATE baloot_rooms SET state=$2::jsonb,updated_at=NOW() WHERE room_code=$1",[code,JSON.stringify(state)]);
    await client.query("COMMIT");
    res.json({room:roomView(state,id)});
  }catch(e){await client.query("ROLLBACK");roomError(res,e);}
  finally{client.release();}
});
app.post('/api/baloot/rooms/:code/action', requireTelegramUser, async (req,res)=>{
  const code=String(req.params.code||"").toUpperCase(), id=String(req.telegramUser.id);
  const actionId=String(req.body?.actionId||"");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const row=await client.query("SELECT state FROM baloot_rooms WHERE room_code=$1 FOR UPDATE",[code]);
    if(!row.rowCount) throw new Error("Room code not found.");
    const current=row.rows[0].state;
    if(current.phase==="lobby") throw new Error("Wait until all four players are ready.");
    const result=applyMatchAction(current,id,req.body?.action,actionId);
    if(!result.duplicate){
      await client.query("UPDATE baloot_rooms SET state=$2::jsonb,updated_at=NOW() WHERE room_code=$1",[code,JSON.stringify(result.state)]);
    }
    await client.query("COMMIT");
    res.json({room:roomView(result.state,id),duplicate:result.duplicate,event:result.event});
  }catch(e){await client.query("ROLLBACK");roomError(res,e);}
  finally{client.release();}
});

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
    const vipResult = await pool.query(
      "SELECT expires_at FROM vip_subscriptions WHERE telegram_id = $1 AND status = 'active'",
      [String(user.id)]
    );
    const isVip = Boolean(vipResult.rows[0] && new Date(vipResult.rows[0].expires_at) > new Date());
    const awarded = isVip ? Math.round(reward * 1.5) : reward;
    const result = await pool.query(
      `INSERT INTO players (telegram_id, username, first_name, points)
       VALUES ($1, $3, $4, 120 + $2)
       ON CONFLICT (telegram_id) DO UPDATE
       SET points = players.points + $2,
           username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           updated_at = NOW()
       RETURNING points`,
      [String(user.id), awarded, user.username || null, user.first_name || null]
    );
    res.json({ accepted: true, awarded, vipBonus: isVip, points: result.rows[0].points });
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
    CREATE TABLE IF NOT EXISTS baloot_rooms (
      room_code TEXT PRIMARY KEY,
      host_id BIGINT NOT NULL,
      state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS baloot_rooms_updated_idx ON baloot_rooms (updated_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS baloot_progress (
      telegram_id BIGINT PRIMARY KEY,
      stage INTEGER NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 21),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS baloot_inventory (
      telegram_id BIGINT NOT NULL,
      item_id TEXT NOT NULL,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (telegram_id, item_id)
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
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const saved = await client.query(
            `INSERT INTO vip_payments
               (telegram_payment_charge_id, telegram_id, payload, amount, currency, is_recurring)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (telegram_payment_charge_id) DO NOTHING
             RETURNING telegram_payment_charge_id`,
            [payment.telegram_payment_charge_id, userId, payment.invoice_payload, payment.total_amount, payment.currency, Boolean(payment.is_recurring)]
          );
          if (saved.rowCount) {
            await client.query(
              `INSERT INTO vip_subscriptions (telegram_id, status, expires_at, last_charge_id, updated_at)
               VALUES ($1, 'active', $2, $3, NOW())
               ON CONFLICT (telegram_id) DO UPDATE
               SET status = 'active', expires_at = GREATEST(COALESCE(vip_subscriptions.expires_at, EXCLUDED.expires_at), EXCLUDED.expires_at),
                   last_charge_id = EXCLUDED.last_charge_id, updated_at = NOW()`,
              [userId, expiration, payment.telegram_payment_charge_id]
            );
            if (invoice) {
              await client.query('DELETE FROM vip_pending_invoices WHERE payload = $1', [payment.invoice_payload]);
            }
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
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
