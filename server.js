import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { Telegraf, Markup } from 'telegraf';
import { createMatch, applyMatchAction, publicMatchState, chooseAiBid, chooseAiCard, startNextRound } from './baloot-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL || "https://gaming-hub-0agm.onrender.com";
const bot = token && process.env.BOT_ENABLED !== "false" ? new Telegraf(token) : null;
const telegramWebhookSecret = token
  ? crypto.createHmac('sha256', token).update('gaming-hub-telegram-webhook-v1').digest('hex')
  : null;
const telegramWebhookPath = telegramWebhookSecret
  ? `/telegram/webhook/${telegramWebhookSecret.slice(0, 32)}`
  : null;
if (bot) {
  app.use(bot.webhookCallback(telegramWebhookPath, { secretToken: telegramWebhookSecret }));
}
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


// Daily play streaks use the Saudi Arabia calendar day and are recorded only
// after a game reward is successfully saved on the server.
function saudiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function recordPlayerActivity(client, telegramId, dateKey = saudiDateKey()) {
  await client.query(
    'INSERT INTO player_daily_activity (telegram_id, activity_date) VALUES ($1, $2::date) ON CONFLICT DO NOTHING',
    [telegramId, dateKey]
  );
  await client.query(
    `INSERT INTO player_streaks
       (telegram_id, current_streak, longest_streak, total_active_days, last_active_date)
     VALUES ($1, 1, 1, 1, $2::date)
     ON CONFLICT (telegram_id) DO UPDATE SET
       current_streak = CASE
         WHEN player_streaks.last_active_date >= EXCLUDED.last_active_date
           THEN player_streaks.current_streak
         WHEN player_streaks.last_active_date = EXCLUDED.last_active_date - 1
           THEN player_streaks.current_streak + 1
         ELSE 1
       END,
       longest_streak = GREATEST(
         player_streaks.longest_streak,
         CASE
           WHEN player_streaks.last_active_date >= EXCLUDED.last_active_date
             THEN player_streaks.current_streak
           WHEN player_streaks.last_active_date = EXCLUDED.last_active_date - 1
             THEN player_streaks.current_streak + 1
           ELSE 1
         END
       ),
       total_active_days = player_streaks.total_active_days +
         CASE WHEN player_streaks.last_active_date < EXCLUDED.last_active_date THEN 1 ELSE 0 END,
       last_active_date = GREATEST(player_streaks.last_active_date, EXCLUDED.last_active_date),
       updated_at = NOW()`,
    [telegramId, dateKey]
  );
}

const rewards = {
  quiz_correct: 10,
  memory_complete: 30,
  reaction_fast: 20,
  puzzle_correct: 10,
  word_correct: 10,
  baloot_stage: 25,
  basra_win: 25
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



const soloBalootMatches = new Map();
function soloBalootView(state, viewerId) {
  return { ...publicMatchState(state, viewerId), solo: true };
}
function runSoloBalootCpu(state) {
  let guard = 0;
  while (state.phase !== "round_complete" && state.currentSeat !== 0 && guard++ < 20) {
    const seat = state.currentSeat;
    const player = state.seats[seat];
    let action;
    if (state.phase === "bidding") action = chooseAiBid(player.hand, state, seat);
    else if (state.phase === "playing") {
      const card = chooseAiCard(player.hand, state.trick, state.contract, seat);
      action = { type: "play", card: card.suit + ":" + card.rank };
    } else break;
    state = applyMatchAction(state, player.userId, action, crypto.randomUUID()).state;
  }
  return state;
}
app.post('/api/baloot/solo/start', requireTelegramUser, (req,res)=>{
  try {
    const user = req.telegramUser;
    const id = String(user.id);
    const players = [
      { userId:id, name:user.first_name || "You" },
      { userId:"cpu-"+crypto.randomUUID(), name:"CPU · North" },
      { userId:"partner-"+crypto.randomUUID(), name:"Your Partner" },
      { userId:"cpu-"+crypto.randomUUID(), name:"CPU · South" }
    ];
    const state = createMatch(players);
    state.currentSeat = 1;
    const gameId = crypto.randomUUID();
    soloBalootMatches.set(gameId, { owner:id, state });
    const advanced = runSoloBalootCpu(state);
    soloBalootMatches.set(gameId, { owner:id, state:advanced });
    res.status(201).json({ gameId, match:soloBalootView(advanced,id) });
  } catch(e) {
    console.error("Solo Baloot start failed",e);
    res.status(500).json({error:"Could not start a Baloot match."});
  }
});

app.post('/api/baloot/solo/:gameId/next', requireTelegramUser, (req,res)=>{
  const gameId=String(req.params.gameId||"");
  const game=soloBalootMatches.get(gameId);
  const id=String(req.telegramUser.id);
  if(!game || game.owner!==id) return res.status(404).json({error:"Baloot match not found. Start a new match."});
  try {
    const next=startNextRound(game.state);
    next.currentSeat=(next.dealer+1)%4;
    const advanced=runSoloBalootCpu(next);
    soloBalootMatches.set(gameId,{owner:id,state:advanced});
    res.json({match:soloBalootView(advanced,id)});
  } catch(e) { roomError(res,e); }
});
app.post('/api/baloot/solo/:gameId/action', requireTelegramUser, (req,res)=>{
  const gameId=String(req.params.gameId||"");
  const game=soloBalootMatches.get(gameId);
  const id=String(req.telegramUser.id);
  if(!game || game.owner!==id) return res.status(404).json({error:"Baloot match not found. Start a new match."});
  try {
    const result=applyMatchAction(game.state,id,req.body?.action,String(req.body?.actionId||""));
    let state=result.state;
    if(!result.duplicate) state=runSoloBalootCpu(state);
    soloBalootMatches.set(gameId,{owner:id,state});
    res.json({match:soloBalootView(state,id),event:result.event,duplicate:result.duplicate});
  } catch(e) {
    roomError(res,e);
  }
});

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
  await recordPlayerActivity(client, String(req.telegramUser.id));
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

const roomEventSubscribers = new Map();
const roomStreamTokens = new Map();

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
    seats: state.seats.map(p => p ? {
      name:p.name, seat:p.seat, ready:p.ready,
      isMe:p.userId===String(viewerId), isHost:p.userId===String(state.hostId)
    } : null)
  };
  return {
    ...publicMatchState(state, viewerId),
    code: state.code,
    hostSeat: state.seats.findIndex(p => p.userId === String(state.hostId))
  };
}
function notifyRoom(code, state) {
  const subscribers = roomEventSubscribers.get(code);
  if (!subscribers) return;
  const stale = [];
  for (const subscriber of subscribers) {
    if (subscriber.res.destroyed || subscriber.res.writableEnded) {
      stale.push(subscriber);
      continue;
    }
    try {
      subscriber.res.write("data: " + JSON.stringify(roomView(state, subscriber.userId)) + "\n\n");
    } catch {
      stale.push(subscriber);
    }
  }
  for (const subscriber of stale) subscribers.delete(subscriber);
  if (!subscribers.size) roomEventSubscribers.delete(code);
}
function issueRoomStreamToken(code, userId) {
  const now = Date.now();
  for (const [token, value] of roomStreamTokens) {
    if (value.expiresAt <= now) roomStreamTokens.delete(token);
  }
  const token = crypto.randomBytes(24).toString("base64url");
  roomStreamTokens.set(token, { code, userId, expiresAt: now + 5 * 60 * 1000 });
  return token;
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
    notifyRoom(code,result.rows[0].state);
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
    if(state.seats.some(p=>p?.userId===id)){await client.query("COMMIT");return res.json({room:roomView(state,id)});}
    if(state.phase!=="lobby") throw new Error("This match has already started.");
    const seat=state.seats.findIndex(p=>p===null);
    if(seat<0) throw new Error("This table is full.");
    state.seats[seat]={userId:id,name:user.first_name||user.username||"Player",seat,ready:false};
    await client.query("UPDATE baloot_rooms SET state=$2::jsonb,updated_at=NOW() WHERE room_code=$1",[code,JSON.stringify(state)]);
    await client.query("COMMIT");
    notifyRoom(code,state);
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

app.post('/api/baloot/rooms/:code/stream-token', requireTelegramUser, async (req,res)=>{
  const code=String(req.params.code||"").toUpperCase(), id=String(req.telegramUser.id);
  try {
    const row=await pool.query("SELECT state FROM baloot_rooms WHERE room_code=$1",[code]);
    if(!row.rowCount) return res.status(404).json({error:"Room code not found."});
    if(!row.rows[0].state.seats.some(p=>p?.userId===id)) {
      return res.status(403).json({error:"You are not seated at this private table."});
    }
    const token=issueRoomStreamToken(code,id);
    res.json({token,expiresIn:300});
  } catch(e) {
    console.error("Baloot stream token failed",e);
    res.status(500).json({error:"Could not connect to the live table."});
  }
});

app.get('/api/baloot/rooms/:code/events', async (req,res)=>{
  const code=String(req.params.code||"").toUpperCase();
  const token=String(req.query.token||"");
  const ticket=roomStreamTokens.get(token);
  if(!ticket || ticket.code!==code || ticket.expiresAt<=Date.now()) {
    roomStreamTokens.delete(token);
    return res.status(401).end();
  }
  try {
    const row=await pool.query("SELECT state FROM baloot_rooms WHERE room_code=$1",[code]);
    if(!row.rowCount || !row.rows[0].state.seats.some(p=>p?.userId===ticket.userId)) {
      return res.status(403).end();
    }
    res.status(200);
    res.set({
      "Content-Type":"text/event-stream; charset=utf-8",
      "Cache-Control":"no-cache, no-transform",
      "Connection":"keep-alive",
      "X-Accel-Buffering":"no"
    });
    res.flushHeaders?.();
    const subscriber={userId:ticket.userId,res};
    if(!roomEventSubscribers.has(code)) roomEventSubscribers.set(code,new Set());
    roomEventSubscribers.get(code).add(subscriber);
    res.write("data: " + JSON.stringify(roomView(row.rows[0].state,ticket.userId)) + "\n\n");
    const heartbeat=setInterval(()=>{ if(!res.writableEnded) res.write(": ping\n\n"); },20000);
    res.on("close",()=>{
      clearInterval(heartbeat);
      const subscribers=roomEventSubscribers.get(code);
      if(subscribers) {
        subscribers.delete(subscriber);
        if(!subscribers.size) roomEventSubscribers.delete(code);
      }
    });
  } catch(e) {
    console.error("Baloot live stream failed",e);
    if(!res.headersSent) res.status(500).end();
    else res.end();
  }
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
    notifyRoom(code,state);
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
    if(!result.duplicate) notifyRoom(code,result.state);
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
  const user = req.telegramUser;
  const userId = String(user.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const today = saudiDateKey();
    const playerResult = await client.query(
      `INSERT INTO players (telegram_id, username, first_name, points)
       VALUES ($1, $2, $3, 120)
       ON CONFLICT (telegram_id) DO UPDATE
       SET username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           updated_at = NOW()
       RETURNING points`,
      [userId, user.username || null, user.first_name || null]
    );

    // Opening the Mini App is the daily activity. The unique daily row makes
    // repeated opens on the same Saudi calendar day count only once.
    await recordPlayerActivity(client, userId, today);
    const streakResult = await client.query(
      `SELECT current_streak, longest_streak, total_active_days, last_active_date::text AS last_active_date
       FROM player_streaks WHERE telegram_id = $1`,
      [userId]
    );
    const streak = streakResult.rows[0];
    const streakDay = Number(streak?.current_streak || 1);
    const bonusByDay = { 3: 20, 7: 50, 14: 100, 30: 500 };
    const milestoneBonus = bonusByDay[streakDay] || 0;
    const dailyPoints = 10 + milestoneBonus;
    const giftCode = streakDay === 30 ? '30_day_legend_badge' : null;
    const claim = await client.query(
      `INSERT INTO daily_login_rewards
         (telegram_id, activity_date, streak_day, points_awarded, gift_code)
       VALUES ($1, $2::date, $3, $4, $5)
       ON CONFLICT (telegram_id, activity_date) DO NOTHING
       RETURNING points_awarded, streak_day, gift_code`,
      [userId, today, streakDay, dailyPoints, giftCode]
    );

    let finalPoints = Number(playerResult.rows[0].points);
    let dailyReward = { awarded: 0, streakDay, milestoneBonus: 0, giftCode: null };
    if (claim.rowCount) {
      const updated = await client.query(
        'UPDATE players SET points = points + $2, updated_at = NOW() WHERE telegram_id = $1 RETURNING points',
        [userId, dailyPoints]
      );
      finalPoints = Number(updated.rows[0].points);
      dailyReward = {
        awarded: dailyPoints,
        streakDay,
        milestoneBonus,
        giftCode
      };
    }

    const weekResult = await client.query(
      `SELECT COALESCE(json_agg(activity_date::text ORDER BY activity_date), '[]'::json) AS days
       FROM player_daily_activity
       WHERE telegram_id = $1 AND activity_date BETWEEN ($2::date - 6) AND $2::date`,
      [userId, today]
    );
    await client.query('COMMIT');
    res.json({
      points: finalPoints,
      firstName: user.first_name || 'Player',
      dailyReward,
      streak: {
        current: streakDay,
        longest: Number(streak?.longest_streak || 0),
        totalDays: Number(streak?.total_active_days || 0),
        lastActiveDate: today,
        today,
        weekDays: weekResult.rows[0]?.days || []
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Could not load player:', error);
    res.status(500).json({ error: 'Could not load your saved points.' });
  } finally {
    client.release();
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

// Monetag rewarded-interstitial flow. Rewards are granted ONLY by the authenticated Monetag postback.
app.post('/api/monetag/start', requireTelegramUser, async (req, res) => {
  const user = req.telegramUser, userId = String(user.id);
  if (!process.env.MONETAG_POSTBACK_SECRET || !process.env.MONETAG_ZONE_ID) {
    return res.status(503).json({ error: 'Monetag rewards are not configured on the server yet.' });
  }
  try {
    const count = await pool.query(
      "SELECT COUNT(*)::int AS count FROM monetag_reward_shows WHERE telegram_id=$1 AND status='rewarded' AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')",
      [userId]
    );
    if (count.rows[0].count >= 5) return res.status(429).json({ error: 'Daily ad reward limit reached. Try again tomorrow.' });
    const ymid = crypto.randomUUID();
    await pool.query(
      "INSERT INTO monetag_reward_shows (ymid,telegram_id,status) VALUES ($1,$2,'pending')",
      [ymid,userId]
    );
    res.json({ ymid });
  } catch (error) {
    console.error('Monetag show creation failed:', error);
    res.status(500).json({ error: 'Could not start a rewarded ad.' });
  }
});

app.get('/api/monetag/status', requireTelegramUser, async (req, res) => {
  const ymid = String(req.query.ymid || '');
  if (!/^[0-9a-f-]{36}$/i.test(ymid)) return res.status(400).json({ error: 'Invalid ad reference.' });
  try {
    const result = await pool.query(
      "SELECT status FROM monetag_reward_shows WHERE ymid=$1 AND telegram_id=$2",
      [ymid,String(req.telegramUser.id)]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Ad reference not found.' });
    if (result.rows[0].status === 'rewarded') {
      const player = await pool.query('SELECT points FROM players WHERE telegram_id=$1',[String(req.telegramUser.id)]);
      return res.json({ status: 'rewarded', points: Number(player.rows[0]?.points || 0) });
    }
    res.json({ status: result.rows[0].status });
  } catch (error) {
    console.error('Monetag status check failed:', error);
    res.status(500).json({ error: 'Could not check ad reward status.' });
  }
});

app.get('/api/monetag/postback', async (req, res) => {
  const expectedSecret = process.env.MONETAG_POSTBACK_SECRET || '';
  const suppliedSecret = String(req.query.secret || '');
  if (!expectedSecret || suppliedSecret.length !== expectedSecret.length ||
      !crypto.timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(expectedSecret))) {
    return res.status(403).send('Forbidden');
  }
  const { ymid, zone_id: zoneId, event_type: eventType, reward_event_type: rewardType, estimated_price: estimatedPrice, telegram_id: telegramId } = req.query;
  if (!ymid || !/^[0-9a-f-]{36}$/i.test(String(ymid)) || String(zoneId || '') !== String(process.env.MONETAG_ZONE_ID)) {
    return res.status(400).send('Invalid postback');
  }
  if (String(eventType || '') !== 'impression' || String(rewardType || '') !== 'valued') {
    return res.status(200).send('No reward');
  }
  const price = Number(estimatedPrice || 0);
  if (!Number.isFinite(price) || price < 0) return res.status(400).send('Invalid price');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const show = await client.query('SELECT telegram_id,status FROM monetag_reward_shows WHERE ymid=$1 FOR UPDATE',[String(ymid)]);
    if (!show.rowCount) { await client.query('ROLLBACK'); return res.status(404).send('Unknown ymid'); }
    if (telegramId && String(telegramId) !== String(show.rows[0].telegram_id)) {
      await client.query('ROLLBACK'); return res.status(403).send('Telegram user mismatch');
    }
    if (show.rows[0].status === 'rewarded') {
      await client.query('COMMIT'); return res.status(200).send('Already processed');
    }
    const userId = String(show.rows[0].telegram_id);
    const daily = await client.query(
      "SELECT COUNT(*)::int AS count FROM monetag_reward_shows WHERE telegram_id=$1 AND status='rewarded' AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')",
      [userId]
    );
    if (daily.rows[0].count >= 5) {
      await client.query("UPDATE monetag_reward_shows SET status='rejected' WHERE ymid=$1",[String(ymid)]);
      await client.query('COMMIT'); return res.status(200).send('Daily limit reached');
    }
    await client.query(
      "INSERT INTO players (telegram_id,points) VALUES ($1,140) ON CONFLICT (telegram_id) DO UPDATE SET points=players.points+20,updated_at=NOW()",
      [userId]
    );
    await client.query(
      "UPDATE monetag_reward_shows SET status='rewarded',estimated_price=$2,rewarded_at=NOW() WHERE ymid=$1",
      [String(ymid),price]
    );
    await client.query('COMMIT');
    return res.status(200).send('Rewarded');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Monetag postback failed:', error);
    return res.status(500).send('Temporary error');
  } finally { client.release(); }
});

app.post('/api/adsgram/reward', (_req, res) => res.status(410).json({ error: 'Adsgram rewards are disabled.' }));


app.post('/api/crash/start', requireTelegramUser, async (req, res) => {
  const userId = String(req.telegramUser.id);
  const roundId = crypto.randomUUID();
  const crashAt = 1.15 + Math.random() * 5.8;
  try {
    await pool.query("INSERT INTO crash_rounds (round_id, telegram_id, crash_at) VALUES ($1,$2,$3)", [roundId, userId, crashAt]);
    res.json({ roundId, crashAt, startedAt: Date.now() });
  } catch (error) {
    console.error('Crash round start failed:', error);
    res.status(500).json({ error: 'Could not start a Crash round.' });
  }
});

app.post('/api/crash/cashout', requireTelegramUser, async (req, res) => {
  const userId = String(req.telegramUser.id);
  const roundId = String(req.body?.roundId || '');
  if (!/^[0-9a-f-]{36}$/i.test(roundId)) return res.status(400).json({ error: 'Invalid round.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);
    const round = await client.query("SELECT round_id, crash_at, EXTRACT(EPOCH FROM (NOW()-created_at)) AS elapsed, status FROM crash_rounds WHERE round_id=$1 AND telegram_id=$2 FOR UPDATE", [roundId, userId]);
    if (!round.rowCount || round.rows[0].status !== 'running') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This round is no longer active.' }); }
    const currentFactor = Math.exp(Number(round.rows[0].elapsed) * 0.19);
    if (currentFactor >= Number(round.rows[0].crash_at)) {
      await client.query("UPDATE crash_rounds SET status='crashed' WHERE round_id=$1", [roundId]);
      await client.query('COMMIT');
      return res.status(409).json({ error: 'Too late! The rocket has crashed.' });
    }
    const daily = await client.query("SELECT COUNT(*)::int AS total FROM game_reward_claims WHERE telegram_id=$1 AND game='crash_cashout' AND claimed_on=(NOW() AT TIME ZONE 'Asia/Riyadh')::date", [userId]);
    if (daily.rows[0].total >= 10) { await client.query('ROLLBACK'); return res.status(429).json({ error: 'Daily Crash reward limit reached.' }); }
    await client.query("INSERT INTO game_reward_claims (telegram_id, game) VALUES ($1,'crash_cashout')", [userId]);
    const vip = await client.query("SELECT expires_at FROM vip_subscriptions WHERE telegram_id=$1 AND status='active'", [userId]);
    const isVip = Boolean(vip.rows[0] && new Date(vip.rows[0].expires_at) > new Date());
    const awarded = isVip ? 15 : 10;
    const points = await client.query("INSERT INTO players (telegram_id,username,first_name,points) VALUES ($1,$2,$3,120+$4) ON CONFLICT (telegram_id) DO UPDATE SET points=players.points+$4,username=EXCLUDED.username,first_name=EXCLUDED.first_name,updated_at=NOW() RETURNING points", [userId, req.telegramUser.username || null, req.telegramUser.first_name || null, awarded]);
    await client.query("UPDATE crash_rounds SET status='cashed_out', cashout_factor=$2, awarded=$3 WHERE round_id=$1", [roundId, currentFactor, awarded]);
    await recordPlayerActivity(client, userId);
    await client.query('COMMIT');
    res.json({ accepted: true, factor: Number(currentFactor.toFixed(2)), awarded, points: points.rows[0].points });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Crash cashout failed:', error);
    res.status(500).json({ error: 'Could not save your Crash reward.' });
  } finally { client.release(); }
});

app.post('/api/score', requireTelegramUser, async (req, res) => {
  const reward = rewards[req.body?.game];
  if (!reward) return res.status(400).json({ error: 'Unknown game reward.' });

  const user = req.telegramUser;
  const userId = String(user.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (req.body?.game === 'crash_cashout' || req.body?.game === 'basra_win') {
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);
      const count = await client.query("SELECT COUNT(*)::int AS total FROM game_reward_claims WHERE telegram_id=$1 AND game=$2 AND claimed_on=(NOW() AT TIME ZONE 'Asia/Riyadh')::date", [userId, req.body.game]);
      if (count.rows[0].total >= 10) { await client.query('ROLLBACK'); return res.status(429).json({ error: 'Daily reward limit reached for this game. Try again tomorrow.' }); }
      await client.query('INSERT INTO game_reward_claims (telegram_id, game) VALUES ($1, $2)', [userId, req.body.game]);
    }
    const vipResult = await client.query(
      "SELECT expires_at FROM vip_subscriptions WHERE telegram_id = $1 AND status = 'active'",
      [userId]
    );
    const isVip = Boolean(vipResult.rows[0] && new Date(vipResult.rows[0].expires_at) > new Date());
    const awarded = isVip ? Math.round(reward * 1.5) : reward;
    const result = await client.query(
      `INSERT INTO players (telegram_id, username, first_name, points)
       VALUES ($1, $3, $4, 120 + $2)
       ON CONFLICT (telegram_id) DO UPDATE
       SET points = players.points + $2,
           username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           updated_at = NOW()
       RETURNING points`,
      [userId, awarded, user.username || null, user.first_name || null]
    );
    await recordPlayerActivity(client, userId);
    await client.query('COMMIT');
    res.json({ accepted: true, awarded, vipBonus: isVip, points: result.rows[0].points });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Could not save score:', error);
    res.status(500).json({ error: 'Could not save your points. Please try again.' });
  } finally {
    client.release();
  }
});

const port = Number(process.env.PORT || 3000);

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_daily_activity (
      telegram_id BIGINT NOT NULL,
      activity_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (telegram_id, activity_date)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_streaks (
      telegram_id BIGINT PRIMARY KEY,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      total_active_days INTEGER NOT NULL DEFAULT 0,
      last_active_date DATE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_login_rewards (
      telegram_id BIGINT NOT NULL,
      activity_date DATE NOT NULL,
      streak_day INTEGER NOT NULL,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      gift_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (telegram_id, activity_date)
    )
  `);
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
    CREATE TABLE IF NOT EXISTS monetag_reward_shows (
      ymid TEXT PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rewarded','rejected')),
      estimated_price NUMERIC(14,8) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rewarded_at TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS monetag_reward_shows_user_created_idx ON monetag_reward_shows (telegram_id, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS adsgram_reward_claims (
      claim_id UUID PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      awarded INTEGER NOT NULL,
      claimed_on DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS adsgram_reward_claims_user_day_idx
    ON adsgram_reward_claims (telegram_id, claimed_on)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crash_rounds (
      round_id UUID PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      crash_at NUMERIC(10,4) NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      cashout_factor NUMERIC(10,2),
      awarded INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS crash_rounds_user_created_idx ON crash_rounds (telegram_id, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_reward_claims (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      game TEXT NOT NULL,
      claimed_on DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Riyadh')::date,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS game_reward_claims_user_game_day_idx
    ON game_reward_claims (telegram_id, game, claimed_on)
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
  if (bot) {
    const webhookBase = (process.env.TELEGRAM_WEBHOOK_URL || "https://gaming-hub-0agm.onrender.com").replace(/\\/+$/, "");
    await bot.telegram.setWebhook(`${webhookBase}${telegramWebhookPath}`, {
      secret_token: telegramWebhookSecret
    });
    console.log('Telegram bot webhook active');
  }
}

start().catch((error) => {
  console.error('Gaming Hub startup failed:', error);
  process.exit(1);
});

process.once('SIGINT', () => { bot?.stop('SIGINT'); pool.end(); });
process.once('SIGTERM', () => { bot?.stop('SIGTERM'); pool.end(); });
