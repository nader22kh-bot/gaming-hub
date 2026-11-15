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

### Not yet implemented

This is the multiplayer core ruleset, not yet a complete tournament-variant engine. Projects (Sira/Fifty/Hundred/four-of-a-kind/Baloot), Double/Three/Four/Gahwa, Sawa and Qayd are not implemented. Local house rules can differ; these options need a single agreed tournament profile before being enabled. The simplified 20-stage Baloot Challenge remains a separate solo progression mode.


### Saudi tournament-rule implementation work (in progress)

The accepted rules reference is the General Baloot Regulations published with the Saudi Entertainment Authority / Saudi Mind Sports Federation branding: https://enjoy.sa/media/j1ofreng/baloot.pdf. The new `baloot-tournament-rules.js` module currently provides pure, server-side helpers for project detection/priority/settlement, the Double → Three → Four → Gahwa decision sequence, Akka validation, and pending Qayd/Sawa/Akka/takyid/takweesh rulings. Unit tests are in `test/baloot-tournament-rules.test.js`.

**Important:** this work is not yet wired into the live room action flow or UI. The Qayd/Sawa/takyid/takweesh rules in the published regulation rely on a table judge and the document does not define a fully automatic adjudication algorithm; claims are therefore recorded as pending and cannot award points or force a redeal from client input. The branch must pass the full test/build checks and the remaining room integration work before it is merged or deployed.

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
