# Awesome Farm on Cloudflare

One Worker (`worker.ts`) in front of one Durable Object per world. The object runs the same `SimHost` as the Node
server (`server/main.ts`) and as solo play; only the plumbing differs. The game page itself is served by Cloudflare
Pages (`https://games-71g.pages.dev/awesome_farm/`); this Worker is only the world.

| Route | What |
|---|---|
| `GET /` | sends people to the game page with `?server=<this address>`, which fills the Join box: **this address is the link to share** |
| `GET /status` | what the title screen asks before Join (public, any origin) |
| `GET /ws` | a player's WebSocket |
| `GET /admin` | **the admin page** (`admin.html`, bundled as text): unlocked with the `DEV_KEY`, works on a phone. Live status and today's usage against the free plan, the farmers (kick, a new secret word, take a word away), an announcement banner for everybody online, save / download / upload / new world, the backups and the log |
| `GET /admin/state` | everything the admin page shows, in one request (the page asks every 8 s while it is in view) |
| `POST /admin/kick`, `/admin/word`, `/admin/forget`, `/admin/announce` (JSON bodies `{ id, reason? }`, `{ id, word }`, `{ id }`, `{ text }`) | the farmer tools; the rules are `SimHost.kick / setWord / forgetWord / announce` (`tests/admin.test.ts`) |
| `GET /admin/backups`, `/admin/backup`, `/admin/log` | the live save and the named backups; the whole world as JSON; the last 200 log lines |
| `POST /admin/save`, `/admin/reset`, `/admin/restore` (body: a world JSON) or `/admin/restore?backup=<id>` | save now; a new world; put a world back (the one replaced is always kept as a backup) |

Admin routes need `Authorization: Bearer <DEV_KEY>`; ten wrong keys in ten minutes lock them for ten minutes. The
admin page and the control page on the owner's PC (`awesome-farm-host\server-control.bat`) use them. The object counts
its own HTTP requests and incoming messages per UTC day (`usage`, saved with the world) so the page can show the free
plan's daily budget.

## Deploy

From `awesome_farm/`:

```
npx wrangler login                                                  # once: approve in the browser
npm run cf:deploy                                                   # = npx wrangler@4 deploy --config server/cf/wrangler.toml
npx wrangler@4 secret put DEV_KEY --config server/cf/wrangler.toml   # the developer menu + admin key
npx wrangler@4 secret put PASSWORD --config server/cf/wrangler.toml  # optional: players must type it
```

The owner's PC has `awesome-farm-host\deploy-cloud.bat`, which does all of it (and can carry the PC world over).
Local run: `npm run cf:dev` (put `DEV_KEY=…` in `server/cf/.dev.vars`, which git ignores).

## How it keeps within the Workers Free plan

- A timer ticks the world (50 ms; `SimHost` steps at 20 Hz and broadcasts at 10 Hz) only while somebody is connected
  or owed a wait or a save; with nobody there the object is put away. Timers are not billed requests; alarms would be.
- Incoming WebSocket messages count 20 to one request. Movement is at most 10 a second while moving, plus the client's
  heartbeat every 10 s (which also renews the object's CPU budget: Cloudflare counts CPU from the last message).
- Saves (every 20 s and when the last player leaves) are gzipped and split into 512 KB chunks under the 2 MB value
  limit (`store.ts`): two generations of the live save and twelve named backups. `tests/cf.test.ts` checks it.
- Rough budget for 8 farmers playing 4 hours a day: ~30,000 of the 100,000 daily requests; the object is awake while
  people play (13,000 GB-s a day free is about 28 hours of a 128 MB object). If a cap ever bites, Workers Paid is
  $5/month.

## What is different from the Node server

- `/status.online` counts open connections (as the Node server does); a farmer whose line dropped is kept in the world
  for 30 s (`HostOptions.grace`) and comes back without a join.
- A code deploy or a Cloudflare restart drops every connection; clients reconnect by themselves (1-2-4-8-8 s) and the
  world loads from the last save (at most 20 s of play is lost, as with a crash of the Node server).
- A tick that throws keeps the world as it was in a named backup and stops autosaves until a clean tick.
- There is no outbound back-pressure signal on Cloudflare WebSockets, so `Peer.ready` is not set (every tick goes out).

## Several worlds, one deploy

One Worker hosts every world listed in `src/shared/data/servers.ts` (`WORLDS`: Meadow, Quarry, Snowcap), each in its own
Durable Object named after the world id, so each has its own save, backups and farmers. Idle worlds cost nothing.

- `GET /worlds` lists them (wakes no world; the title screen has the same list built in).
- `/w/<id>/status`, `/w/<id>/ws`, `/w/<id>/admin` reach one world. `/w/<id>` redirects to the game with that server chosen.
- The old plain addresses (`/status`, `/ws`, `/admin`) still reach the first world (Meadow), so existing saves and links keep working.
- Add a world: add a line to `WORLDS` and run `npm run cf:deploy`. No new migration is needed.
- Set `PUBLIC_SERVER` in `servers.ts` to the worker address so players get the buttons without typing anything.
