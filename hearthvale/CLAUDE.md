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
- `art/`             the art team's modules (read `ART_BIBLE.md` first): `buildings.js`, `characters.js`, `environment.js`, `critters.js`, `props.js`, `fx.js`, plus `artkit.js` + `palette.js`. All procedural, vertex-coloured, budgeted (`tests/hearthvale_art.test.mjs` enforces triangle and mesh limits). `js/models.js` is the OLD basic art, only a few helpers still used.
- `lab/`             dev-only art lab pages (never shipped): `lab/<page>.html` + `lab/shot.mjs` for headless screenshots.
- `js/`              client: `main.js` (HUD, input, panels), `scene.js` (three.js view), `models.js` (procedural low-poly art), `net.js` (solo + WebSocket links).
- `vendor/three.module.min.js` vendored three.js (no CDN, no build step).

## Rules
- No image files: all art is procedural geometry, sound is synthesised.
- Never rename the `hearthvale.*` localStorage keys (solo saves) or the folder.
- Villages sit on a square ring (`slotOrigin` in sim.js, 17.5 apart, never overlapping); old circular saves are migrated in `deserialize`.
- Snapshot tuple shapes in `snapshot()` are read by `scene.js` (`b`, `n`, `v` arrays): change both together.
- Panels re-render only when their HTML changes and pause while a pointer is down, so taps never hit a rebuilt button.
- Tests: `npm run test:hearthvale` (sim, fuzz, host, live 16-socket server). Add new behaviour to `tests/hearthvale*.test.mjs`.

## Gameplay systems (details: `docs/FEATURES.md`, read it before touching sim.js)
- Goods/buildings are append-only; new buildings: coop, barn, dairy, orchard, dock, pantry, weavery + 9 decor (art contract = ids and sizes in data.js).
- Animals live in `b.an` (coop/barn), produce into `b.stock` (cap 8), eat wheat from storage; collect = `assign` a villager to the pen. Dock = repeat fishing.
- Villagers have `skx` (8 skill work-seconds); `swork()` is the only place that advances a skill and scales work speed.
- Great Project in `W.valley.project` (5 stages, perks mirrored as `P.pst`); Festival and Merchant are derived from `W.t` in `worldEvents()`; rain = `weatherAt(t)` (same formula as scene.js).
- Once-a-second `bookkeeping()` per village: charm, derived stats, quests, achievements, visitors. Charm gives xp (`xpBonus`).
- The host supplies the clock with `setNow(W, ms)` (daily reward only); the solo link must call it before each tick. The sim never reads `Date`.
- New commands: buyAnimal, renameVillager, projectGive, daily, setTitle, visitorServe, merchantTrade (all validated, all in the fuzz op list).
- Snapshot tuples only grow at the END (villager tuple has skill at index 8; player entry has `charm`, `title`); `deserialize` migrates old saves.
- Bots (`shared/bots.js`) use every new system; keep their pace below a perfect player (see balance notes in the docs).

## Verify in a browser
Serve the folder (`python3 -m http.server`) and open `index.html?solo` (autostarts solo). `window.__hv` exposes view, snap, link, cmd.
Playwright with `--use-gl=swiftshader` works headless.
