# Awesome Farm

Co-op island farming for up to 16 friends, Forager-style, with Factorio-style automation,
Palworld-style creatures, six bosses, a hundred-node skill tree and a 16-chapter journal.
Everyone starts on a far-apart home island, buys land until the islands connect, then builds
a shared farm over many hours. **Read [DESIGN.md](DESIGN.md)** for the vision, the systems
as built and the ideas not built yet.
**Handover documents** for starting a fresh session are in [handover/](handover/): `HANDOVER_1_…` (this project, the Phaser 4 gotchas, the
painted-art pipeline, how we work) and `HANDOVER_2_…` (a brief for rebuilding the Beatbox Story game in Phaser, with 12 feature inventories).

This folder is a self-contained project inside the `RoxorLoops1337/Games` monorepo. The
root `CLAUDE.md` workflow rules still apply (commit style, no model identifiers). The games site serves the repo as it is
(Cloudflare Pages runs no build), so the built game is committed in `play/` and served at
`https://games-71g.pages.dev/awesome_farm/play/` (`index.html` here is the Vite source page; served raw, it forwards to
`play/`, keeping `?server=`). **After changing the game: `npm run build:pages`, then commit `play/` with the change.** The root `npm run check` does not run its tests (they need this
folder's own `node_modules`): use `npm run check` *in this folder* (or `npm run test:farm` at the root).

## Detailed notes: read the one your task needs

These used to be in this file; they moved to `docs/` so a session only reads what its task needs.
Read the matching file BEFORE starting that kind of work.

| Task | Read |
|---|---|
| Adding or changing content: items, recipes, buildings, monsters, bosses, creatures, jobs, quests, tutorial steps, tips, hints, layouts, gear, rings, relics, gems, combat arts, the Blight, loot, mail, wishes, potluck, titans, chronicle, phones/touch | [docs/adding-content.md](docs/adding-content.md) |
| Finding where code lives (the full folder tree, one line per module) | [docs/folder-layout.md](docs/folder-layout.md) |
| Anything in the 3D view (`src/client3d`, the bridge, overlays, models, mood, the art pass) | [docs/3d-view.md](docs/3d-view.md) |
| HUD, windows, menus, toasts, banners, the Factory view, the big meta screens | [docs/ui.md](docs/ui.md) |
| Painted art, sprites, colours, the palette | [docs/art.md](docs/art.md) |
| Testing in a browser (the dev harness), the developer menu, the Defense Lab | [docs/dev-tools.md](docs/dev-tools.md) |

## Fast loop (ship small, ship often)

The owner wants many small updates over one big one. Per change:
1. **Iterate on the files you touch only:** `npx tsx --test tests/<system>.test.ts` (seconds), plus `npm run typecheck`. Run the whole `npm run check` (minutes) **once**, right before the push.
2. **New content checklist** (each one has a test that fails otherwise): an icon (`client/art/icons.ts`), a source (recipe, drop or loot), a 3D model of its own (`src/client3d/models`; `src/client3d/coverage.ts` lists the families and `tests/view3d.test.ts` fails without one), and the wiki (`npm run build:pages` regenerates `wiki/index.html` and `play/` together).
3. **Merging main:** never hand-merge `play/` or `wiki/index.html`: take either side, then `npm run build:pages` and commit what it writes. Delete `play/assets/*.js` files `play/index.html` no longer names.
4. **One feature, one PR:** split big work into slices that each pass the check on their own (data and rules first, then art, then polish), and merge each slice as soon as it is green. Keep changes inside `awesome_farm/` so the root check only builds (touching `build.js` or the root `package.json` runs every game's suites, ~8 min).
5. **The machine is small (4 cores):** at most two agents running test suites at once.

## Stack

- **Client:** Phaser 4.0.0 (WebGL, `pixelArt`, `roundPixels`, DOM container for the title
  screen's text fields), TypeScript 5.7 strict, Vite 6.
- **3D view (beta, a player's choice):** three.js 0.160 (`src/client3d`, procedural low-poly models, no image files), a lazily loaded
  chunk drawn under the Phaser HUD. 2D stays the default; see "The 3D view" below.
- **Server:** Node 18+ with `ws`, bundled by esbuild into one `awesome-farm-server.mjs`.
  It runs the *same* simulation code as the client.
- **Tests:** `node:test` run through `tsx`.
- **No image asset files.** Art is painted or generated at boot (painter code and palette-char grids);
  sound is synthesised with Web Audio. Fonts: Pixelify Sans, Jersey 15 and Fredoka (all OFL, in `public/fonts`).

Phaser 4 gotchas that already bit us:
- `import * as Phaser from 'phaser'`: named ESM exports only, no default export.
- `setTintFill()` does nothing in v4. Use `setTint(c).setTintMode(Phaser.TintModes.FILL)`,
  then undo with `clearTint().setTintMode(MULTIPLY)`.
- `scene.events` also carries Phaser's own events (`pause`, `resume`, `shutdown`…), so
  Game→HUD events are prefixed `hud:`.
- Scene objects are reused: reset all per-session state in `init()`.
- The TweenManager runs on wall-clock time, not the game loop's delta.

## Run, test, build, host

```bash
cd awesome_farm
npm install
npm run dev            # client at http://localhost:8080 (solo works right away)
npm run server         # dev server at :7777 (tsx) — join it from the title screen
npm test               # simulation + host tests (headless)
npm run check          # typecheck (client + server/shared without DOM) + tests + build
npm run build:single    # → dist-single/awesome-farm.html: the whole game in ONE file (solo play; open on a phone, share anywhere)
npm run server:build   # → server-dist/: awesome-farm-server.mjs + public/ + start.bat/.sh + README.txt  (SERVER_DIST=dir to package elsewhere)
npm run palette        # regenerate palette.gpl after editing src/shared/palette.ts
npm run wiki           # regenerate wiki/index.html, the player wiki (served at /awesome_farm/wiki/), after ANY data change: tests/wiki.test.ts fails while it is stale
npx tsx scripts/balance-raids.ts [runs]   # a night at a base with a nest of level 1..15: raiders, their health, hearts lost, with and without towers
npx tsx scripts/playbot.ts 30 a,b,c,d   # a bot plays 30 days in four worlds with real commands (walks, gathers, crafts, builds, learns skills, sells, buys land, fights at night) and prints the day each milestone was first reached; one world: `playbot.ts 20 a` lists every first, what it never got and why
npm run balance        # win rates for a simple (non-dodging) fighter: every expedition tier, every altar boss; nights needed to farm each sigil
```

**Hosting on Cloudflare** (the always-on world, Workers Free plan): `server/cf/` (a Worker + one Durable Object per
world running the same `SimHost`; saves gzipped and chunked in the object's storage; admin routes for backups,
restore and a new world; an admin page at `/admin`, unlocked with the developer key: status and today's usage, kick, a new
secret word, announcements, backups). Deploy and budget: [server/cf/README.md](server/cf/README.md); `npm run cf:dev` runs it
locally, `tests/cf.test.ts` covers its storage. Its address is the link to share: `/` sends people to the game page
with `?server=<address>`, which fills the title screen's Join box (any `?server=` link does).

**Hosting on a PC:** copy `server-dist/` anywhere with Node 18+ and run `start.bat` / `./start.sh`
(`--help` lists the flags: port, world, password, name, data dir, developer key). The server serves the
game, so friends just open its URL. Over the internet, use
`cloudflared tunnel --url http://localhost:7777` (free, no port forwarding) or forward TCP
port 7777. From an https page you need the server's https/wss address.

## How the multiplayer works (rules for new features)

- **The simulation is the only authority.** Anything that changes the world goes like
  this: add a `Cmd` in `shared/sim/types.ts`, validate and apply it in `Sim.command`, then
  have the client `send()` it. Never change shared state from a Phaser scene.
- **Movement is client-authoritative**, sanity-checked by `cmdMove`; bump `warp` to snap
  a client back. Everything else is validated server-side: reach, cooldowns, costs, ranges.
- **State is plain JSON** (`WorldState`). It is saved, sent and reloaded as-is, so no
  classes or Maps. Mark changed entities with `touch()` / `add()` / `remove()` so `SimHost`
  sends them. Runtime-only caches (`drillVeins`, `postSpots`, `powerGraph`, `digHp`, the per-kind id sets)
  live on the `Sim` or in a `WeakMap<Sim, …>` (as `costatus.ts` and `boss.ts` do), never on entities or players.
- **Per-step work reads the Sim's caches:** `sim.derivedOf(p)`, `sim.hasUnlock(p, token)` and `sim.online` are
  cleared on every step, command, join and leave; `sim.ents(kind)` and `sim.buildings(kind?)` are id-ordered,
  shared, read-only lists that stay the same until an entity of that kind comes or goes (spread them before
  changing anything). Commands, menus and the client use the plain `derived()` / `hasUnlock()` from `sim/stats.ts`.
- **Feedback goes through events.** Push a `SimEvent` (`fx`, `float`, `banner`, …). Set
  `to` for a single player. The client's `Game.event()` turns events into FX and HUD text.
- **Bump `PROTOCOL`** in `shared/net/protocol.ts` on any wire-format change. Old clients
  are then refused with a clear message.
- Keep inbound messages small: movement goes out only while moving, at ≤ 10 Hz. The server allows 40 messages a second per connection (burst 80, then the line is closed) and 64 KB per message.
- **Broadcasts:** a tick goes out every 100 ms; a command gets an immediate broadcast from a budget (burst 30, refilled 60/s) and rides the next tick when the budget is spent, so command spam cannot flood everybody (`SimHost.poke`). A peer whose socket is congested (`Peer.ready()` false above 256 KB buffered) skips ticks and is told everything it missed once it can take it; above 2 MB it is dropped.
- **Dropped lines:** a socket that dies without a close frame (a phone asleep, a tunnel gone) keeps its farmer online for `HostOptions.grace` (30 s on the server, 0 in solo and tests); a re-hello with the same id in that window resumes without a join. The client (`WsConnection`) retries 1-2-4-8-8 s, up to five times, at once when the page becomes visible again, and shows "Reconnecting…" meanwhile; a refusal stops the retries. Tests: `tests/reconnect.test.ts`, `tests/host.hardening.test.ts`.
- **Saves:** every 20 s, after every leave (on the next tick) and on SIGINT/SIGTERM/SIGBREAK/SIGHUP; written asynchronously as tmp → copy to `.bak` → rename, so the main file always exists. A damaged main file is set aside (`<world>.incompatible-<stamp>.json`) and the `.bak` is loaded. A tick that throws marks the world tainted: it is written once to `<world>.crash-<stamp>.json`, autosaves pause until a clean tick, and an uncaught exception saves and exits non-zero. Test: `tests/server.hardening.test.ts`.
- **Accounts (name + secret word):** the title screen's "Secret word" sends `hello.acct`. `SimHost.account()` keeps `WorldState.accounts`
  (`name.toLowerCase()` → `{ id, salt, h }`, a salted, stretched SHA-256 from `net/sha256.ts`); a known name with the right word
  answers with that farmer's id in `welcome.you`, and the client stores it per server in `profile.srv`. A new name keeps the device's
  current farmer (nobody loses progress) or gets `acct-…` if that device already belongs to another name. A name an existing farmer without a word already plays under is kept
  for that farmer's own device (nobody can grab it first). The table is stripped from
  every welcome, wrong words are throttled (6 tries, then a minute; at most 60 word checks a minute for everybody), and everything off the wire goes through `text()` and `cleanName()` so hostile
  objects never throw and names carry no control characters. A hello without the word is refused when its id or its name belongs to an account; a sign-up refused because the world is full leaves no row; rows whose farmer
  no longer exists are dropped on load; a device makes at most two new accounts per server run and a connection at most five hellos. The hasher is injectable (`HostOptions.hash`: the server uses `node:crypto`, the same stretched SHA-256, 5× faster).
  The welcome carries other farmers as their public view only (`publicView`, plus `mh`), the own record whole. Tests: `tests/accounts.test.ts`, `tests/host.hardening.test.ts`, plus the restart case in `tests/server.e2e.test.ts`.

## Play online: several worlds (`data/servers.ts`)
One Worker hosts every world in `WORLDS`, one Durable Object each (`/w/<id>/...`; plain `/status|/ws|/admin` = first world, so old links and farmer identities keep working). The title screen has a "Play online" button that opens one card per world from `WORLDS` (built into the client, no server box; counts come from each world's `/status`, asked once when the cards open); `PUBLIC_SERVER` is the worker the cards use, and a PC's own address is one tap away ("own server"). Add a world = add a `WORLDS` line + `npm run cf:deploy`. Never rename a world id (it names the save). Details: `server/cf/README.md`.

## THE JUICE RULE

**Every key action gets a sound, a small particle burst and a little camera shake.**

- List the action in `src/shared/actions.ts`, give it an entry in the `FX` table in
  `src/client/juice/fx.ts` (a `Record<Action, FxSpec>`, so it won't compile without sfx +
  burst + shake), and emit it from the simulation with `this.fx('action', x, y, player.id)`.
  Client-only feedback (e.g. "can't build there") calls `fx.play()` directly. Never call
  `playSfx`, `cameras.main.shake` or `emitter.explode` by hand for a game action.
- **Key action** means anything a player does that changes the world, plus milestones:
  - hits and breaks, pickups,
  - building, buying land,
  - level-ups and perk picks,
  - eating, planting, harvesting, selling, smelting, upgrades,
  - getting hurt, healing, kills,
  - dusk and dawn,
  - "can't do that" (`deny`),
  - downed, revive, a player joining, lands connecting (`win`).
- **Multiplayer:** the acting player gets all three. Other players see the burst, and hear
  the sound only if it happens on their screen. A friend's actions never shake your camera.
- **Keep it little.** Shake is in *screen* pixels: 0.6 px for a pickup, about 1.5–5 px for
  normal actions, 7 px for getting hurt or downed. Bursts use 3–40 particles. One-shot
  sounds peak at ≤ 0.3 gain and get ±4% pitch jitter. The most frequent actions get the
  smallest values.
- **Not key actions** (sound only, or nothing): ambient effects (respawn pop-ins, embers,
  waves, land rising) and UI hover/clicks (`playSfx('ui')`).
- `Fx` already respects the player's Sound / Screen-shake toggles. Each scene has its own
  `Fx`: world scale is `new Fx(this, 1)`, HUD/menus are `new Fx(this, ZOOM)`.
- Owner's taste: loops stay quiet and one-shots short. Casual play must succeed: gentle
  death (revive and lose nothing; the owner asked on 2026-10-07 that waking up at home costs half the XP towards the next level and drops your backpack: `TUNING.deathXpLoss`, `sim/death.ts`), soft early enemies, generous economy.

## Tuning & data

- Numbers live in `TUNING` / `NET` (`src/shared/config.ts`): speeds, reach, energy, land
  price curve, respawn, timers, day/night, downed/revive timings, the
  XP curve.
- Content lives in tables under `src/shared/data/`. Add content there; the sim and the
  client both read the tables.
- **Storage keys (never rename):** `awesome_farm_profile_v1` (device id, name, last server, secret word, and the farmer id each server gave you: how servers
  recognise you), `awesome_farm_solo_v1` (solo world), `awesome_farm_settings_v1`, `awesome_farm_hints_v1` (which first-time hints and progression tips were shown: one list, tips as `tip:<id>`, saved by adding only), `awesome_farm_welcome_v1`,
  `awesome_farm_tutorial_v1` (the starting tutorial: step reached, counters when a replay began, skipped steps, and the tips switch; also `:N`). A
  `?profile=N` tab suffixes the first two with `:N` (the Defense Lab, `?lab=defense`, with `:lab`). Server saves are `worlds/<world>.json`
  with a `.bak`. Change the save format only with a `version` bump and a migration in the
  `Sim` constructor.
