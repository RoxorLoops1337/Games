# ironbridge-relay

The relay behind Ironbridge's **Play a friend**. It is a Cloudflare Worker with
one Durable Object per match: it holds two WebSockets, hands each player a seat
number and a shared seed, and copies bytes between them.

It does not know what a command is. Both browsers run the entire simulation
from the seed plus each other's orders — see the *TWO PLAYERS* section of
`ironbridge/index.html`. If you ever find yourself wanting to teach this Worker
what an order means, stop: that would put the game's rules in two places, and
two copies of a rule eventually disagree.

## Why it is not a Pages Function

The site is served by Cloudflare Pages out of `dist/`. Durable Objects cannot
live in a Pages Function, and a stateful object is exactly what a match needs —
something both browsers reach that outlives a single request. Keeping the relay
in its own Worker also means nothing here can affect the site or the
leaderboard.

`ironbridge-relay/` is deliberately **not** in `STATIC_PATHS` in `build.js`. It
is a Worker, not site content, and must not be copied into `dist/`.

## Deploy

```
cd ironbridge-relay
npx wrangler deploy
```

The first run opens a browser to authorise Cloudflare. Two things commonly go
wrong:

- **"You need to register a workers.dev subdomain"** — pick one once in the
  dashboard under Workers & Pages, then deploy again.
- **A migration error.** `wrangler.toml` uses `new_sqlite_classes`, which is the
  Durable Object backend available on the **free** Workers plan. Do not switch
  it to `new_classes` — that is the older key-value backend and it is paid-plan
  only. `tests/ironbridge_relay.test.mjs` fails if it changes.

Wrangler prints the deployed host. Check it before touching the game:

```
curl -sS -X POST https://<HOST>/new
```

That must return `{"code":"ABCD"}` with four letters. If it does not, the game
will never connect, so fix this first.

## Point the game at it

In `ironbridge/index.html`:

```js
const RELAY_HOST = 'ironbridge-relay.example.workers.dev';
```

Replace the host with the real one. The `.example.workers.dev` suffix is
load-bearing — `RELAY_UNSET()` on the next line tests for it to decide whether
to show the "no relay set up yet" note in the lobby, so that note disappears by
itself once the host is real.

To try a relay without editing the file, set a per-origin override in the
browser console on the game page:

```js
localStorage.setItem('ib_relay', '<HOST>')
```

That covers both tabs on one machine but not a second device.

## Protocol

Everything is JSON text. The relay reads only `t` on the messages it generates
itself; the two it forwards it never opens.

| Direction | Message | Meaning |
|---|---|---|
| server → client | `{t:'seat', me, seed, code}` | your seat (0 or 1) and the match seed |
| server → client | `{t:'go'}` | both seats filled, start the match |
| client → server → peer | `{t:'c', n, c:[…]}` | this player's orders for turn `n` |
| client → server → peer | `{t:'h', n, h}` | this player's state hash before turn `n` |
| server → client | `{t:'bye'}` | the other player's socket closed |
| server → client | `{t:'full'}` | a third player tried to join; socket then closes |

HTTP:

- `POST /new` → `{"code":"ABCD"}` — a code whose room is currently empty
- `GET /room/CODE` with `Upgrade: websocket` → joins that room
- `GET /room/CODE` without the upgrade → `{"free":bool,"players":n}`
- `GET /health` → `{"ok":true}`

## Cost

Free, with a lot of room to spare. Durable Objects are on the Workers free plan
(100,000 requests/day, 13,000 GB-s/day), and **inbound WebSocket messages bill
at 20:1**. A turn is 200ms, so each player sends about 5 messages a second plus
a hash: a 20-minute match is roughly 12,000 messages between them, which bills
as about 600 requests. That is on the order of 150 matches a day inside the
free tier, and hibernation means an idle room bills nothing at all.

## Known gap: reconnect resumes the seat, not the match

If a player drops and rejoins the same code, they get their seat and seed back
— but their simulation restarts at tick 0 while their opponent is thousands of
ticks ahead, so the two are no longer playing the same match. In practice a
disconnect ends the game.

Fixing it needs a state snapshot from the surviving peer plus every order since
it was taken. The pieces already exist in the game (`packSide`, `packUnit`,
`loadMatch`), so it is a real possibility rather than a rewrite — it is simply
not built.
