# Ironbridge relay

The matchmaking and message relay for Ironbridge multiplayer. One Cloudflare
Worker, one Durable Object per room.

It is deliberately ignorant. It holds two WebSockets, hands each a shared seed
and a side, and copies bytes between them. It never parses a command, never
simulates anything and never learns the state of a match — both browsers run
the whole simulation from the seed plus each other's inputs.

That ignorance is the point. If the relay understood the rules, the rules would
live in two places and one of them would eventually be wrong.

## Deploying

Not deployed from CI — this is separate from the Pages project on purpose, so
nothing here can affect the main site or the leaderboard.

```
cd ironbridge-relay
npx wrangler deploy
```

Then point the game at it. The lobby reads the relay host from
`localStorage.ib_relay` if set, falling back to the default in `index.html`, so
you can test against a preview deployment without editing the game:

```js
localStorage.setItem('ib_relay', 'ironbridge-relay.YOUR-SUBDOMAIN.workers.dev')
```

## API

| | |
|---|---|
| `POST /new` | `{ code: "ABCD" }` — mints a room code. Nothing is stored; the code *is* the Durable Object name, so a room nobody joins is never instantiated. |
| `GET /room/<CODE>` | WebSocket upgrade. Both players hit the same URL; the room decides who is side 0 and who is side 1. |

Messages from the relay:

| | |
|---|---|
| `{k:'hello', side, seed}` | on connect |
| `{k:'peers', n, side}` | when the room's population changes |
| `{k:'start', seed, side}` | once both players are present |
| `{k:'peerGone', side}` | when someone disconnects |
| `{k:'pong'}` | reply to `"ping"` |

Anything else a client sends is relayed verbatim to the other player and not
echoed back to the sender.

## Room codes

Four characters from `ABCDEFGHJKLMNPQRSTUVWXYZ` — no `I`, no `O`, no digits,
because a code gets read down a phone and typed from a photo. That is 331,776
rooms, so guessing one is not a strategy. Codes are matched case-insensitively
and non-letters are stripped, so `abcd`, `AB-CD` and ` abcd ` all reach the same
room.

## Why this is free

Durable Objects moved onto the Workers free plan in April 2025, on the SQLite
storage backend. `wrangler.toml` therefore uses `new_sqlite_classes` rather than
`new_classes` — the latter selects the key-value backend, deploys fine on a paid
account and is **rejected on a free one**, which is an unpleasant thing to find
out at deploy time. A test asserts the migration key, so this cannot silently
regress.

Rough shape of a 20-minute two-player match against the daily free allowance:

| | free plan | one match |
|---|---|---|
| Requests | 100,000 / day | ~80 (inbound WS messages bill 20:1) |
| Duration | 13,000 GB-s / day | ~150 GB-s |

WebSocket Hibernation means an idle room bills nothing at all — the object is
evicted between messages and rebuilt from storage when one arrives. That is why
the room's seat assignments and seed live in `storage` rather than on the
instance, and why each socket carries its own side via `serializeAttachment`:
instance fields do not survive eviction.

## Tests

`node tests/ironbridge_relay.test.mjs` (part of `npm run check`). Runs the real
worker against a stand-in for the Durable Object runtime, including an eviction,
since hibernation is the failure mode that otherwise only shows up in
production.

## Reconnect

A player who drops rejoins the same room, gets their own side and the same seed
back, and is then **caught up from the peer** rather than restarted: the peer
sends a state snapshot (`netSnap`, chunked over `SYNC_CHUNK`) plus the commands
since, and the rejoining client resumes at the peer's tick. This used to be the
worker's one known gap — reconnect resumed the seat but not the match, so the
two simulations disagreed from the first frame and a disconnect ended the match
in practice. It does not any more.

Two things are dropped on purpose and dropped on **both** machines, so they stay
in step: projectiles already in flight, and purely cosmetic state (the fx layer,
camera shake, the end-of-match board hold). None of it is in `netHash`.
