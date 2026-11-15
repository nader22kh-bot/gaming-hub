# Gaming Hub

A bilingual Arabic/English Telegram Mini App with server-backed games, player points, VIP subscriptions and a persistent Baloot table.

## Baloot multiplayer

The multiplayer Baloot implementation uses the existing Express + PostgreSQL Render service:

- Private four-seat rooms with six-character codes and Telegram invite links.
- Two fixed teams: seats 0/2 and 1/3.
- Ready state and host-controlled next deals.
- Live state updates over Server-Sent Events (SSE), with HTTP refresh as a recovery fallback.
- PostgreSQL JSONB match persistence, row-level locking for moves, and idempotent action IDs.
- Telegram WebApp initData verification for room creation, joining, readiness and moves.
- Five-minute, room-scoped stream tickets for EventSource connections; reconnecting players reload their authoritative state and their own hand only.
- Server-side turn, hand ownership, card legality, contract, trick and scoring validation.

### Implemented Saudi Baloot core

- Five cards per player, three then two, with one face-up auction card.
- First and second bidding rounds, first-round Hokom using the up-card suit, Sun overcall, second-round Hokom in another suit, and the limited Ashkal call.
- Three additional cards to each player after a contract; the buyer receives the up-card plus two.
- Sun and Hokom card order and raw card values.
- Follow-suit enforcement, Hokom cutting against a currently winning opponent, overtrumping when required, and overtrumping a trump lead.
- Eight-trick hands, last-trick bonus, contract success/failure, game-point conversion, Kaboot scoring and match progression to 152.

### Saudi tournament-rule integration (in progress)

The live server engine now connects the following rules to multiplayer room actions:

- Project detection from the original eight-card hands, declaration before a player's first card, and reveal after the first trick.
- Saudi project priority and raw-point values, project points added before deciding whether the buyer made the contract, transfer of projects when the buyer fails, and fixed two-point Baloot.
- Baloot announcement before the second trump King/Queen is played, with automatic Baloot when it is exposed inside a declared trump sequence; Baloot is suppressed with a declared hundred of Kings or Queens.
- Double → Three → Four → Gahwa decisions, open/closed Hokom, eligible Sun Double, live Hokom/Sun double interruptions, doubled scoring, and the doubled-tie rule.
- Server-validated Akka declarations and host-recorded Qayd/Sawa/takyid/takweesh table rulings with an audit history.

The published Saudi regulation leaves some infraction outcomes to the table judge. The app records those claims and the host's ruling; it does not invent penalties. A recorded redeal ruling is currently an audit entry, not an automatic reset. Full live verification with four separate Telegram accounts, reconnects, and production database persistence is still required before merge/deployment. The simplified 20-stage Baloot Challenge remains a separate solo progression mode.

## Existing systems preserved

The multiplayer changes do not alter the players, baloot_progress, baloot_inventory, VIP, ad-reward or other game tables. Cosmetic purchases continue to use earned game points; no new Stars purchase or paid game feature was introduced.

## Run locally

1. Use Node.js 20+.
2. Run npm install.
3. Set BOT_TOKEN, WEBAPP_URL and DATABASE_URL in the environment.
4. Run npm test.
5. Run npm start.

The Render start lifecycle also runs npm test before starting the service.

## Test with four Telegram accounts

1. Open the Gaming Hub Mini App from Telegram on four distinct Telegram accounts.
2. On account 1, open Baloot and choose Play with friends → Create private table.
3. Share the generated invite link or six-character room code with accounts 2, 3 and 4.
4. Each account joins the same room and taps I'm ready.
5. When all four are ready, the five-card auction starts. Follow the turn indicator to bid or pass.
6. After a contract is confirmed, play legal cards in turn. Each account sees synchronized table state and only its own hand.
7. If a browser/app disconnects, reopen the invite or room and the server restores that player's seat and hand.
8. After a round, the host starts the next deal. The match ends when a team reaches 152.

## Operational notes

- Render currently runs one web-service instance. The in-process SSE fan-out is suitable for that deployment; horizontal scaling requires a shared pub/sub transport such as PostgreSQL LISTEN/NOTIFY or Redis.
- The database plan is a time-limited free instance; verify its expiry and backups before production traffic.
- Do not expose BOT_TOKEN, database credentials or Monetag postback secrets in client code or chat.
