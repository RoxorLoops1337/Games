# Hearthvale

Cozy co-op village builder for up to 16 villages in one shared valley. An ORIGINAL game: it borrows the genre's ideas
(villagers on worker-placement tasks, a Study for unlocks, shared valley fields and order boards, no combat) but none of
any other game's art, names or assets. Do not add anything copied from a commercial game.

Link: `https://games-71g.pages.dev/hearthvale/` (solo works at once). Server: see below.

## Layout
- `shared/data.js`   all static data: goods, buildings, recipes, tech, quests, valley fields. Change balance here.
- `shared/sim.js`    the authoritative simulation: `createWorld`, `addPlayer`, `command(W,pid,cmd)`, `tick(W,dt)`, `snapshot(W,pid)`.
  Pure JS, no DOM, no timers. Server and solo client run the SAME code. Every client-supplied key must be checked with `own()`.
- `shared/bots.js`   the five neighbour villages in solo play.
- `shared/host.js`   platform-neutral host (connections, rate limit, snapshots). Used by the Node server and the Durable Object.
- `server/server.mjs` zero-dependency Node HTTP + WebSocket server (`node hearthvale/server/server.mjs`, PORT, DATA_DIR). `server/ws.mjs` is a tiny RFC6455 implementation.
- `server/cf/`       Cloudflare Worker + Durable Object (deploy by hand, see its README). Never shipped by Pages.
- `js/`              client: `main.js` (HUD, input, panels), `scene.js` (three.js view), `models.js` (procedural low-poly art), `net.js` (solo + WebSocket links).
- `vendor/three.module.min.js` vendored three.js (no CDN, no build step).

## Rules
- No image files: all art is procedural geometry, sound is synthesised.
- Never rename the `hearthvale.*` localStorage keys (solo saves) or the folder.
- Snapshot tuple shapes in `snapshot()` are read by `scene.js` (`b`, `n`, `v` arrays): change both together.
- Panels re-render only when their HTML changes and pause while a pointer is down, so taps never hit a rebuilt button.
- Tests: `npm run test:hearthvale` (sim, fuzz, host, live 16-socket server). Add new behaviour to `tests/hearthvale*.test.mjs`.

## Verify in a browser
Serve the folder (`python3 -m http.server`) and open `index.html?solo` (autostarts solo). `window.__hv` exposes view, snap, link, cmd.
Playwright with `--use-gl=swiftshader` works headless.
