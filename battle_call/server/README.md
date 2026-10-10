# Battle Call server (Cloudflare Worker + Durable Objects)

One Worker. One Durable Object per event code (`Event`, SQLite-backed so it runs on the Workers Free plan). It holds every
account, bet, vote and payout, counts them one at a time (so a hall voting in the same second never loses a vote) and pushes
every change to every phone over WebSockets. The same Worker also serves the app files, so the Worker address is a complete app.

Want to see it first? Open the app and tap **Try the demo**: the whole night plays in your browser with simulated fans, no server needed.

## Deploy (once, about two minutes)

From the repo root:

```
npx wrangler@4 login                                              # once: approve in the browser
npx wrangler@4 deploy --config battle_call/server/wrangler.toml   # prints https://battle-call.<you>.workers.dev
```

Open that address on your phone: that is the app. Make an event, add the beatboxers, show the QR code.

Optional, so nobody else can create events on your server:

```
npx wrangler@4 secret put CREATE_KEY --config battle_call/server/wrangler.toml
```

With a `CREATE_KEY` set, the "Run a battle" form asks for it.

### Using the Pages copy (games-71g.pages.dev/battle_call/)

The Pages copy is the same app. Tell it where the Worker is, once: set `SERVER` in `battle_call/js/config.js` to the Worker
address, or open the Pages link once with `?server=https://battle-call.<you>.workers.dev` (the phone remembers it). The join QR
code the organiser shows already carries the server address, so phones scanning it need nothing.

## Local run

```
npx wrangler@4 dev --config battle_call/server/wrangler.toml     # http://localhost:8787/
```

## Free plan budget

- Idle events cost nothing: the object hibernates between messages.
- A WebSocket message counts as 1/20th of a request. 200 phones for a 3 hour battle is a few thousand requests.
- Storage: one row per player, per market and per settlement ledger. A 200 player event writes a few thousand rows.
- Photos are resized to 480 px and capped at 160 KB each in the browser and on the server.

## Data and privacy

Nicknames and passwords only, no email. Passwords are PBKDF2-hashed and never leave the object. Accounts live inside one event
(the same nickname at the next battle is a new account). The organiser can download the whole result as JSON (Setup tab) and
delete the event, which wipes everything, photos included.

## Routes

See the header comment in `worker.js`.
