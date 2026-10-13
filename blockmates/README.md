# Blockmates

A cozy 2D side-view block sandbox for up to 16 players. Original game and original art (everything is painted by code at
boot, sounds are synthesised): inspired by the genre, no code or assets taken from any commercial game.

Play: `https://games-71g.pages.dev/blockmates/` (solo works at once, the world is saved in the browser).

## Host a 16-player world

### Option A: your own computer or a VPS (no dependencies)

```
node blockmates/server/node.js --port 8787 --save world.json --name "Our world" --ops YourName
```

Needs Node 18+. The same process serves the game page, so friends on your network open `http://<your-ip>:8787/`, and anyone
can also use the hosted page and type your address into "Join a server". For internet play put it behind a TLS proxy
(Caddy, nginx, Cloudflare Tunnel) and share `wss://your-host`. Flags: `--seed`, `--password`, `--ops a,b`, `--port`.
The first player to join a brand new world is its operator.

### Option B: Cloudflare Worker (free plan is enough for a group of friends)

```
npx wrangler@4 login
npx wrangler@4 deploy --config blockmates/server/cf/wrangler.toml
```

Then give friends `https://<name>.workers.dev` (it forwards to the game page with the server filled in). Optional secrets:
`PASSWORD`, `OPS`. Chunks and players are saved in the Durable Object's SQLite storage; with nobody online the object sleeps.

## Controls

WASD / arrows move, Space jump, Shift run, left mouse mine and attack, right mouse place or use, Shift + click works on the
back wall, 1-0 or wheel for the hotbar, E backpack and crafting, Q drop, F eat, T chat, Tab players, V emote, +/- zoom,
F2 photo, Esc menu. Operators: `/time day|night`, `/tp name`, `/give item n`, `/pvp`, `/kick name`.

## Layout

| Path | What |
|---|---|
| `shared/` | data tables (blocks, items, recipes, creatures), terrain generator, body physics, codec. Used by server and client |
| `server/world.js` | the authoritative simulation (transport agnostic), `liquid.js`, `mobs.js` |
| `server/node.js` | dependency free WebSocket server + static file server |
| `server/cf/` | Cloudflare Worker + Durable Object |
| `client/` | `art.js` (all painting), `render.js`, `cworld.js` (tiles, sections, light), `game.js`, `ui.js`, `net.js`, `audio.js`, `main.js` |
| `tests/blockmates_*.test.mjs` | headless suites (`npm run test:blockmates`) |
