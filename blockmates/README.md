# Blockmates

A cozy block sandbox seen from the side (real 3D blocks, with a classic 2D view as fallback) for up to 16 players. Original game and original art (everything is painted by code at
boot, sounds are synthesised): inspired by the genre, no code or assets taken from any commercial game.

Play: `https://games-71g.pages.dev/blockmates/` (solo works at once, the world is saved in the browser).

## What is in it

- A 1536 x 224 tile world: plains, forests, deserts, tundra with pines, mountains, oceans, caves, underground lakes and lava,
  ores from coal to titanium and sunstone, shrines with waystones, ruins and buried chests.
- Mining with tool tiers, crafting stations (workbench, furnace, anvil), chests, doors, beds, ladders, platforms, torches,
  coloured wool, farming, fishing, cooking, armor and a bow.
- Buddies: hire helpers with a Buddy Bell and set them to follow, chop, mine, farm or guard.
- Player to player trading with escrow, waystone travel, sleeping to skip the night, chat, emotes, a world map.
- The Stone Warden boss (craft a Warden Sigil, use it deep underground), night creatures, cave skitters.
- Day and night, weather, smooth lighting, fireflies, butterflies, bats, fully synthesised sound and music.
- Water and lava flow; water meeting lava makes stone and obsidian.

## Host a 16-player world

### Option A: your own computer or a VPS (no dependencies)

```
node blockmates/server/node.js --port 8787 --save world.json --name "Our world" --ops YourName
```

Needs Node 18+. The same process serves the game page, so friends on your network open `http://<your-ip>:8787/`, and anyone
can also use the hosted page and type your address into "Join a server" (browsers only allow a secure `wss://` address from the
hosted https page, so a plain home server is joined by opening its own `http://` page instead). For internet play put it behind a TLS proxy
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
| `server/bots.js` | load test: `node blockmates/server/bots.js ws://localhost:8787/ws 16 30` |
| `tests/blockmates_*.test.mjs` | headless suites (`npm run test:blockmates`) |
