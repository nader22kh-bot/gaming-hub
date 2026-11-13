# Telegram Gaming Hub (Starter MVP)

A bilingual Arabic/English Telegram Mini App starter with:
- Quiz, memory, reaction and number-puzzle games
- Local demo leaderboard and player profile
- VIP screen and ad placement placeholders
- Telegram WebApp SDK integration
- Node.js/Express backend skeleton and Telegram bot launch button

## Run locally
1. Install Node.js 20+
2. `npm install`
3. Copy `.env.example` to `.env` and set `BOT_TOKEN` and `WEBAPP_URL`
4. `npm run dev`
5. Open `http://localhost:3000`

For a real Telegram launch, deploy this app to an HTTPS host, set `WEBAPP_URL` to that URL, and configure the bot's menu button with BotFather or the Telegram Bot API.

## Important before production
- The leaderboard and points are demo/local only. Add a database and server-side score validation before launch.
- VIP purchase is a UI placeholder. Implement Telegram Stars invoices and verify successful payment updates on the server before granting VIP.
- Ad areas are placeholders. Add a compliant ad provider only after reviewing Telegram platform rules and local advertising/privacy requirements.
- Never expose `BOT_TOKEN` in frontend code.
- Validate Telegram `initData` on the backend before trusting user identity.
