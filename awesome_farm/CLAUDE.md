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

**Verifying in a browser** (the Claude pane is often hidden, which stops
`requestAnimationFrame`): in `npm run dev`, `src/dev/harness.ts` gives you `__step(frames)`,
`__key('e')` and `__errs`. Once in a world, `__farm` gives you `scene`, `conn` and `me`,
plus `sim` (the in-browser world, solo only). Network messages arrive on the event loop, so
step in real time (`await` ~16 ms between `__step(1)` calls) when a server is involved.
- **Two players in one browser:** open the second tab with `?profile=2` (a separate
  identity and solo save).
- **World size and old saves:** `GRID` (plots per side) in `shared/config.ts` is the map size; `STATE_VERSION` marks the
  save format. When either changes the shape of a save, add a step to `sim/migrate.ts` (v4 → v5 grew 17 → 35 plots and
  shifted every coordinate) so running worlds are carried forward; `tests/migrate.test.ts` shows how to hand-build an
  old save. The host (`server/main.ts`) and the solo build both load through `new Sim(state)`, which migrates.
- **Saves stay small:** land nobody owns carries no ore veins (`Plot.veins` is dropped when a world loads and made from the seed + plot index by `ensureVeins` in `sim/worldgen.ts` when a plot is bought or a home is claimed); with them a new world's JSON is ~170 KB instead of 1.2 MB, which matters for the phone's localStorage and the 20-second autosave. Anything new and bulky that is static (or can be rebuilt from the seed) should stay out of `WorldState` too.
- **Tiles heal themselves:** `TileLayer.heal` (started once a second by `Ambience` in `world/ambience.ts`; `healStep` then checks one row per frame) compares the tiles in view with the world and repairs any that a missed or interrupted redraw left wrong, so land is never drawn as sea.
- **Night difficulty:** by threat level (`mobs.groupLevel` / `threatAt`), never by `sim.s.day`.
- **Keyboard layouts:** `src/client/input/layout.ts` tracks the movement keys and the fishing key (W A S D Q) by
  `event.code` (position), so AZERTY plays as ZQSD. Everything else is character-based (I, C, K… are the same
  caps on every layout) except digits, read through `keyOf(ev)` so 1–8 work unshifted on AZERTY. Hint text
  uses `keyLabel('KeyQ')` / `moveKeys()`, never a literal "Q" or "WASD". Test: `tests/keyboard.test.ts`; in the
  harness fire `new KeyboardEvent('keydown', { code: 'KeyW', key: 'z' })`.
- **Dev keys:** `__key('h')` (any letter, arrows, `/`) fires a hotkey. DOM inputs (the search boxes) are not in `__shot`: use a page screenshot for those.
- **Test controls:** tests, tools and the dev harness (`__farm.give/xp/unlockAll/night`) send the developer menu's ops, `{ t: 'devdo', op: 'item' | 'coins' | 'xp' | 'skills' | 'clock' | … }` (`DEV_OPS` in `sim/dev.ts`),
  which work in dev solo and on a server started with `--cheats` (never on a real server).
- **Use your own background tab:** the owner may be playing in the visible one.

## Folder layout

```
awesome_farm/
├── CLAUDE.md, DESIGN.md, README.md
├── palette.gpl              GENERATED from src/shared/palette.ts (for tools/comfyui)
├── server/main.ts           dedicated server: http (game + /status) + ws (/ws) + saves
├── server/tsconfig.json     type-checks server + shared WITHOUT DOM types
├── scripts/                 build-server.mjs (packaging), build-single.mjs (one-file solo build), make-accounts.ts (name + secret word for existing farmers), palette-gpl.mjs, balance*.ts
├── tests/                   one `<system>.test.ts` per system (node:test). The special ones: content + art (every item has an icon and a source), touch (phones: chips, long press, wording),
│                            bot (+ botlib, bot.late): a scripted player plays the first 13 chapters with real commands (grind skipped late); tutorial: the starting steps walked in order by that player; fuzz + safety: hostile input never
│                            corrupts the world; netsync + server.e2e + server.hardening + reconnect: a real server over WebSockets (`netlib.ts` finds a free port); perf: a big busy world stays inside its step and bandwidth budget; dev: the developer menu (locks, key, every op)
├── proto3d.html, proto3d-models.html   DEV ONLY (npm run dev): the low-poly 3D prototype (its own HUD and solo world) and its model
│                            library, recovered from the prototype's built pages into src/client3d (not in the production build, not linked from the game)
└── src/
    ├── main.ts              boots the client; dev harness in DEV only (src/dev/harness.ts)
    ├── shared/              ← runs in the browser AND the server: no Phaser, no DOM, no localStorage
    │   ├── config.ts        world geometry, NET rates, ALL tuning dials (TUNING)
    │   ├── geom.ts          distances (`dist`, `distToRect`, `distToBuilding`) and the farmer's body offsets (`feetTile`, `hitPoint`)
    │   ├── fmt.ts           `clock(secs)` m:ss and `hhmm(hour)`: the one place time is written
    │   ├── palette.ts       the 25-colour palette: single source of truth
    │   ├── actions.ts       every juice-rule action (sim emits them, client FX table covers them)
    │   ├── blueprint.ts, placement.ts   copying a layout; why a piece will not fit (`placeWhy`, mirrors `tryBuild`)
    │   ├── cave.ts, daylight.ts, season.ts, rng.ts   the caves' map, the sun, the four seasons, the seeded dice
    │   ├── weather.ts       rain / fog as a pure function of seed, day and time
    │   ├── world.ts         land, occupancy, floors, veins, prices, purchasable plots
    │   ├── data/            items, recipes, buildings, nodes, biomes, skills, stats, mobs, creatures, quests, sidequests, guide, rift, hints, tutorial (the 16 starting steps), tips (progression tips), layouts (starter layouts), howto (automation one-liners)
    │   ├── sim/             THE rules. types.ts (state/Cmd/SimEvent), sim.ts (core: entities, caches, the step), commands (the Cmd check and dispatch, the farmer's own commands: move, swing, dash, look, respawn, summon), clock (day, night, dusk, seasons), health (hurt, down, revive, the fall), social (chat, emotes, pings), then one module per system:
    │   │                    economy, gather, machines, factory, power, status (what a factory building is doing, in words), mobs, combat, boss (patterns are a `SCRIPTS` table), death (the price of a fall), dread (the Dread Reaches), mines (the caves under the world; cave.ts makes them), creatures (+ jobs: posts and commands, with jobs-site / jobs-carry / jobs-field / jobs-sort / jobs-station behind it; petlib: chest helpers),
    │   │                    quests, hotbar, listed (what the menus list), shop (trader + waystones), rift (expeditions), fishing, pool (crafting reaches into chests), dev (the secret developer menu's ops), worldgen, stats (derived stats, inventory)
    │   └── net/             protocol.ts (wire format), host.ts (SimHost: peers, area of interest, saves)
    ├── client3d/            ← the low-poly three.js view (no Phaser; ONLY reached through the dynamic import in client/world/view3d-bridge.ts):
    │                        view3d.ts: the in-game 3D view (implements the bridge's View3D: terrain, sea, entities, farmers, sky, weather, fx,
    │                        the ghost, the target ring, picking); render.ts: renderer, post chain and the sky's hour (shared with the prototype);
    │                        coverage.ts: every kind of every family the 3D view must model (read from the data); quality.ts, batch.ts, budget.ts:
    │                        the 3D quality levels, instancing, culling by the view, the shadow fit and the ledger that frees the GPU;
    │                        models/ is the procedural model library (kit.ts: the flat-shaded builder; one module per family of buildings, nodes,
    │                        monsters, creatures, drops, the farmer); entities, terrain, sky, weather, fx, ambient are the view's layers;
    │                        mood.ts drives the world's light and air (caves.ts, seasons.ts, glow.ts, atmos.ts, riftgates.ts; tests/world3d.test.ts);
│                        contact.ts, impacts.ts, wet.ts: contact shadows, event rings and dust, the ground wet with rain (tests/art3d.test.ts);
    │                        main, hud, net, showcase, gallery, proto3d are the dev-only prototype pages (their own HUD and solo world, never in the game);
    │                        tests/client3d.test.ts builds every model headless and stages the showcase, tests/view3d.test.ts guards the 2D/3D choice,
    │                        tests/perf3d.test.ts the quality setting, instancing, the ledger and the shadow fit
    └── client/              ← Phaser
        ├── main.ts          game config + scene list (Boot → Title → Game + Hud)
        ├── profile.ts, settings.ts   the device's identity and the player's settings (localStorage)
        ├── input/           keyboard layouts (layout.ts), fullscreen and touch detection (screenMode.ts)
        ├── net/connection.ts  LocalConnection (solo SimHost) | WsConnection (server)
        ├── art/             painted sprites (storybook.ts: nature + crops; storybook-*.ts: ground, chars, build, decor, sites, house, critters, mobs, cave, luck, worn, logo) + grid art (icons, factory, badges); painter lib paint.ts, grid lib pixels.ts, registry sprites.ts
        ├── juice/           fx.ts (the juice-rule table), sfx.ts (one-shots), music.ts (quiet generative music), slowmo (the Perfect dash's beat)
        ├── world/           the world view, one module per concern, each taking the scene and a narrow host interface: view3d-bridge (THE seam to the 3D view:
        │                    the View3D interface, the pointer bridge Pointer2D/Pointer3D, the lazy loader), tiles, veins, farmers (you and the others), placing (ghost, drag lines, touch aim, one-off rule),
        │                    interact (what the keys act on: scanNear, targets, revive, dismantle), hands (hotbar, pods), ambience (hearths, roofs, caves, dread, waves), buildviews (a building's sprites),
        │                    views/occupancy/prodhist (entity views, tile occupancy, production history), combat (monster/projectile views, telegraphs), critters (creature views),
        │                    factoryview (status badges, tooltips, Factory view, machines as they run, wires, placement overlay), fishing, blueprints, costatus, titan, sea
        ├── ui/              the UI kit: kit (scale, text, buttons; re-exports the rest), tooltip, parts (tabs, pager, lists, slots, search, chips, slider), win (the window skeleton), toasts, px/grid/tips;
        │                    menukit (the skeleton of the big meta screens), slots (zones, bottomRect, stickZone, the live obstacle rects), hudlayer (the HUD's own drawing), minimap, party (party list, dusk pill),
        │                    plates (land price tags), touchcontrols (stick, thumb cluster, pinch), prompt (the interaction prompt's words, pure), bossbar, chat, night (light map + weather),
        │                    crew/workercard/jobpost pieces (creature workers on machine and craft windows), factoryui/factorylabels (status blocks, Factory-view captions), listtools (sort, chips), preview (tiny floor plans),
        │                    bake (frames baked to a texture), theme (UI colours), gestures/devgesture/devunlock (long press, the secret menu), rift, fishing,
        │                    companion (companion card + quest tracker), tutorial (coach card, world pointer, HUD rings and the tip cards), hints, screens/* (one file per menu)
        └── scenes/          Boot, Title (solo / join), Game (world view + input), Hud (overlay + screen manager)
```

### Adding content (everything is data-driven)

- **The player wiki** (`wiki/index.html`, linked from the guide's footer) is generated from `src/shared` by `scripts/wiki.ts`; its explanations live in `scripts/wiki-text.ts` (no numbers there: every figure, name and list comes from the data). Change any table, run `npm run wiki` and commit the page with the change (`tests/wiki.test.ts` compares them, checks every item, building, skill, creature and monster has an entry, every link lands and the page has no em dash). The root `build.js` copies it into `dist/`.

- **Item:** add to `ITEMS` (`data/items.ts`) and give it an icon spec in `client/art/icons.ts` (a seed sack takes a crop mark from `SEED_MARKS` there)
  (a test fails until it has one, and until the item is obtainable from a node, drop or recipe).
- **Recipe / building:** a row in `data/recipes.ts` / an entry in `data/buildings.ts` (+ art in
  `client/art/storybook-build.ts`, decor in `storybook-decor.ts`, machines in `factory.ts`). Unlock tokens come from skills in `data/skills.ts`.
- **Monster / boss:** an entry in `data/mobs.ts` (stats, AI kind, drops, boss phases) and art in
  `client/art/storybook-mobs.ts`. New boss patterns go in `sim/boss.ts`.
- **Creature:** an entry in `data/creatures.ts` and a body in `client/art/storybook-critters.ts`. Its `work` table (aptitudes 1–5) decides which island jobs and machines it can take: `gather mine farm haul sort guard` are island jobs, `craft` runs furnaces/anvils/kitchens, `make` the other workshops.
- **Creature job / workplace:** island jobs are `AREA_JOBS` (`data/creatures.ts`) with their behaviour in `sim/jobs-field.ts` (`fieldStep`), `sim/jobs.ts` (`areaStep`) and `sim/jobs-site.ts` (`setStatus`); a building becomes a workplace by setting `work` on its `BUILDINGS` entry (machines with `proc` are *kept*, workshops in `ORDER_STATIONS` take *orders*). New `PostStatus` values need an entry in `STATUS_INFO` (text, hint, colour). `tests/jobs.test.ts` shows how to stage one.
- **Quest / bounty / goal / medal:** `data/quests.ts` (chapters, bounties, goals, medals), `data/sidequests.ts` (accepted from the Journal's Quests tab); counters are bumped with `quests.count(p, key, n)`. Every objective needs a `how` hint (a test checks). State steps (`level`, `pack`, `have:<item>`…) read the player live; counter steps count from acceptance.
- **Starter layout** ("Factory 101", the Blueprint screen's first tab): a row in `STARTER_LAYOUTS` (`data/layouts.ts`: the pieces as `BlueprintItem`s, one line each for what / need / where / then, captions for the preview) **and** an entry in `PROOFS` in `tests/layouts.test.ts`: the test places it through the real `bp` command, feeds it, runs the sim and checks the product appears (turned a quarter too). A layout without a proof fails the suite.
- **What a factory building says it is doing:** `sim/status.ts` (`statusOf`, `badgeOf`) is the one place; it mirrors the rules in `machines.ts`, `factory.ts` and `power.ts`, so change them together. The machine and device windows, the world badges, the hover tooltips and `tests/status.test.ts` all read it. A new state needs text, a hint (what to do) and a badge. `data/howto.ts` holds each automation building's one-line role, its Build-menu how-to and a tiny example plan.
- **Guide topic:** an entry in `data/guide.ts`. A line is a string, or `[keyboard, phone]` where a phone has buttons instead of keys; `{move}` / `{fish}` become the player's real keys and `{use} {build} {bag} {tap} {press}…` (the tutorial's `WORDS`) become the key or the phone's button. `tests/guide.test.ts` checks the length (both readings) and that the facts match the recipes, so change both together.
- **First-time hint:** an entry in `HINTS` (`shared/data/hints.ts`; the runner and storage are `client/ui/hints.ts`). Hints wait while the dusk countdown is on (`HintCtx.alarm`, fed by `ui/hints.ts` from the dusk pill's `slots.get('dusk')`) unless `now: true` marks one about what is happening to the farmer right now (frozen, hexed, a titan in front of them).
- **Tutorial step:** an entry in `STEPS` (`shared/data/tutorial.ts`), in the order a new farmer meets things. The night's urgent steps (campfire, survive) pass only themselves: at dawn `advance` resumes at the first undone step, and the tutorial ends early only for a `seasoned` farmer (level `SEASONED_LEVEL` or three nights). A step is `id`, `icon`, `title`, `text(view)` (a string, or `[keyboard, phone]`; `{move} {act} {use} {eat} {bag} {build} {skills} {tap} {press} {Press}` become the player's real keys or the phone's buttons), `done(view)` (read counters with `c(v, key)` so a replay counts from where it began; a new key press with no counter needs one in the sim, see `eat`, `stash`, `skill`, `pin`), and optionally `target(view)` (what the pointer finds: a node kind, a building, the plot for sale or a HUD button), `progress` and `urgent` (shown ahead of the others, as the campfire is at dusk). Build texts from `BUILDINGS`/`RECIPES` (`costWords`) so the numbers stay true. `tests/tutorial.test.ts` plays the steps in order with a scripted farmer, so change the step list and the test together. The card, pointer and rings are `client/ui/tutorial.ts`; the card and the tip cards share ONE slot (`TOP_SLOT` in `ui/slots.ts`: top centre, y=68, never taller than `TOP_SLOT_MAX_H` so it stays off the farmer) with the big banners, and never show together: a banner, the boss bar or a window makes the cards wait (a tip waits hidden, its clock stopped).
- **Progression tip:** an entry in `TIPS` (`shared/data/tips.ts`): `id`, `icon` (an item or a `k_` glyph the client draws), `title`, `text` (under about 200 characters, facts from the data tables), `dusk` (may show while the dusk countdown is on; every other tip waits, see `duskAlarm`), `when(view)` over the farmer and what is in view, `prio`, `maxLevel` (not worth telling a veteran) and `always` (skips the gap between tips; it still waits for the tutorial). The runner (`TipRunner`) shows one at a time, `TIP_GAP` seconds apart, never while fighting, a window is open or the tutorial runs, each once; seen ones are `tip:<id>` in the hints store and are listed in the guide's Tips page.
- **Phones (touch is first-class):** there is no Shift, right-click or hover, so `ui/tooltip.ts` (`onTap`) and `ui/parts.ts` (`QtyChips`) give a finger its own versions. A **long press** (0.4 s, a ring fills) on an item slot is the right-click (`onTap`'s `onRight`; a `GridItem` with no `right` but a Shift action sets `holdIsShift`); a window with Shift-style amounts shows **x1 / x10 / All chips** (`QtyChips`, read through `ItemGrid.qty` and `qtyAmount`). Hint text goes through `deviceText(mouse, touch)` (or `forDevice` / `touchWords`, which turn "Click" into "Tap" and "press E" into "tap USE"; every tooltip and toast is converted on the way out); `tests/touch.test.ts` fails if a screen names Shift or right-click without a phone version. **Placing** on a phone: lines (floors, belts, walls, roofs) go down under the finger and a drag lays the rest; any other piece is aimed with one tap (the ghost goes under the finger and `placeWhy` in `shared/placement.ts` says in words why it is red) and placed by tapping the ghost again or USE (`Placer.touchAimDown/Up` in `world/placing.ts`, `Placer.pin`). `placeWhy` mirrors `tryBuild`; a test checks they agree on every tile.
- **House piece / walkable building:** `BUILDINGS` flags `wall` (autotiles with neighbours), `roof` (own layer, over everything), `walk` (takes its tile, you walk over it), `gate` (monsters cannot pass); the layers are `World.soft/roof/gate`, kept in step by `Sim.occupy/vacate` AND the client's `world/occupancy.ts`.
- **Expedition tier / boon / omen** (the last tier, the Abyss, is endless: `endless: true`): `RIFT_TIERS` / `BOONS` / `OMENS` in `data/rift.ts` (a content test checks the loot and stat keys); the
  waves, rewards and run flow are in `sim/rift.ts`.
- **Sorting and filtering item lists:** `shared/data/itemsort.ts` (`sortItems`, `filterItems`, `presentCats`; the modes are Type, Name, Amount, Value, Rarity and the categories are the chest filter categories) is pure and tested (`tests/itemsort.test.ts`); `ui/listtools.ts` is the toolbar every list window uses (a Sort button that walks the modes, a button that reverses the order, a row of category chips that fade when a kind has nothing in the list) and remembers each window's choice in `awesome_farm_listprefs_v1` under its scope name (`backpack`, `chest`, `grave`, `market`). A new list window: `new ListTools(win, 'scope', onChange)`, `addSort`, `addChips`, then `tools.present(list)` and `tools.apply(list, count)` in its update. The chest window also has Quick stack (puts away what the chest already holds or is set to take).
- **The seed window** (`BedScreen` in `ui/screens/storage.ts`): only the seeds you own, as cards with time to ripe in this season, yield and market value (`shared/data/cropfacts.ts`), Fastest and Best value badges, the last seed planted already chosen (`awesome_farm_lastseed_v1`), one click plants, Enter plants the chosen one, number keys plant the nth, and the All beds switch plants the seed in every empty bed within reach.
- **Character creator:** a farmer's look is `PlayerS.look` ({b body tone, l sprout, e eyes, m mouth}, `shared/data/look.ts`, made safe by `cleanLook`) plus `PlayerS.color` (the scarf); the `look` command sets both and `look` is in the public view so everyone sees it. The painter is `ensureFarmer(scene, look, color)` in `client/art/storybook-chars.ts` (paints a texture the first time a combination is asked for; `farmerKey` names it) and the screen is `ui/screens/look.ts` (opened automatically for any farmer with no look yet, standing in for the welcome card, and from the menu). To add a choice: extend the table in `look.ts`, paint it in `farmer()`; old saves keep working because a missing/out-of-range number falls back to the first choice.
- **Farm chronicle:** `sim/chronicle.ts`: `note(sim, key, text, icon)` writes one storybook line (`{ d: day, t, i: icon, k: key }`) into `WorldState.chron` (cap 300, oldest dropped; a keyed line is written once ever) and sends it as a `chron` event so every client keeps up (`GameScene.chronicle()`, a toast, and the Journal's Chronicle tab). Hooks are one-liners at the milestones: joins, land marks (`LAND_MARKS`), land joined, first boss kills (`boss.ts`), chapters (`quests.claimChapter`), level marks (`LEVEL_MARKS`), mornings (first night, farm age, the night's event, a new season: `chronicle.morning`), the Golden Windmill, first tames, first expedition clears, wheel jackpots, the season wish. Add a line for a new milestone with a key like `thing:<id>`; tests in `tests/chronicle.test.ts`.
- **Season wishes:** `data/wishes.ts` (14 wishes: stat mods + words) and `sim/wish.ts`. On the first morning of every season after the first, `wish.begin` offers `wishPool(seed, season)` (three, from the world's seed), opens the Season wish window for everyone online (`ui/screens/wish.ts`, queued behind other windows) and farmers vote (`Cmd { t: 'wish'; id }`). The vote closes when every farmer online has voted or at nightfall; most votes win, ties and empty ballots are settled by the world's own dice; the winner is `PlayerS.wish` for EVERY farmer (also offline ones and later joiners: `wish.grant`) and is read by `modsOf` like a skill. `WorldState.wish` and the `wish` event keep the clients in step; the HUD shows a chip after the buffs (a pulsing star while the vote is open, the wish's icon after) that opens the window again. `tests/wish.test.ts`.
- **Mailbox and parcels:** `sim/mail.ts`. The `mailbox` building belongs to its builder (`BuildE.by`); mail is the farmer's (`PlayerS.mail`: `Parcel { from, fid?, d, note, items, pc? }`), so every mailbox its owner built opens the same post. At somebody else's mailbox the window is a form: up to three kinds of things (coins count) and a note (6 presets, or write your own via `window.prompt`); `Cmd { t: 'mail', op: 'send' | 'take' }`; limits `MAIL_CAP` 20, `PER_SENDER` 3, `NOTE_MAX` 60; sending is immediate (the things leave your pockets). Every dawn `mail.postcards` gives every farmer (online or not) a card from one of the island folk (`data/postcards.ts`, chosen from the seed, the day and the farmer) with a small present; only the newest 3 cards are kept, friends' letters never fall away. A raised flag (`BuildE.flag`) shows while post waits; a chime and toast reach a farmer who is online (or when they arrive). Window: `ui/screens/mail.ts`. `tests/mail.test.ts`.
- **Perfect dash:** a strike that can land on a farmer asks `sim.shielded(p, attack = true)` AFTER its own reach test says it would hit (never before), instead of reading `p.invuln`: `false` means it lands (call `hurt`), `true` means the farmer is protected. When that protection is the dash's own (`Sim.perfectWin`, runtime: the stretch of world time when the dash is all that protects them) and the strike was an attack (boss pattern hits, projectiles, a charging monster; a body brushing past keeps the plain `invuln <= 0` test), they have pulled off a Perfect dash, once per dash: the dash's energy back (`TUNING.dashEnergy`, never above max), the `perfect` buff (`perfectSeconds`, `mods: { crit: 1 }`; the first swing at a monster spends it in `combat.attack`), the `perfect` fx and a "Perfect!" float. Dash dials are in TUNING (`dash*`, `perfect*`). Client: only on its own `perfect` fx (`e.by === me`) `SlowMo.begin` (`juice/slowmo.ts`) runs a `TUNING.perfectSlowMo` s slow motion (tweens, particle emitters and the dt that drives monsters, projectiles, telegraphs, other farmers, sea and fishing lines); the sim never slows and the HUD keeps real time. `HINTS.perfect` waits for `HintCtx.windup` (`GameScene.windupNear`, looked at twice a second). Test: `tests/perfect.test.ts`.
- **Titan nodes** (`titan_oak`, `titan_rock`; `titan: true` on the NodeDef, dials in `TITAN` in `data/nodes.ts`, rules in `sim/titan.ts`): huge, rare nodes that only take damage while two or more different farmers have swung at them within `TITAN.window` seconds (`Sim.titanLog`, runtime). `gather.hitNode` hands the swing to `titan.hit`: alone it is a `hollow` fx and a rate-limited "Needs a friend!" float; together every swing does the tool's full power. On the fall everyone who swung within `TITAN.share` seconds gets their own drops straight into their pockets, multiplied by `handsMul` (+50% per extra hand up to four), the XP, and a crate roll (`fortune.titanCrate`, `TITAN_CRATE`), all with the luck dice, never `sim.rng`. They grow only through `titan.grown` (owned land, a world with at least `TITAN.farmers` farmers, `TITAN.chance`, one per island and `TITAN.worldCap`). Creature jobs skip them and companions are not hands. Client: `world/titan.ts` draws the ground ring, the "2+" badge and the health bar. Test: `tests/titan.test.ts`.
- **Evening hearth** (`sim/hearth.ts`, `data/hearth.ts`): in the dusk countdown, farmers within `TUNING.hearthRadius` of a campfire, table, lantern or lamp post sit at it; their own companion within `hearthPetReach` counts as company, so two heads make a circle. A circle fills the fire (`BuildE.hg`, 0..1) over `hearthFill` seconds and kindles it; everyone sitting there gets the buff `hearth` ("Hearthside": energy regen, healing power, +15% XP, a heart every `hearthHealEvery` s) until dawn. A circle sitting at nightfall kindles on the spot, a late arrival is welcomed, walking off keeps the buff. `onNight` clears the fills, `onDawn` strips the buff, `tidy` cleans stale state on load. The client draws the ground circle and fill ring in `Ambience.drawHearth` (`world/ambience.ts`). Test: `tests/hearth.test.ts`.
- **Pet and gifts** (`sim/bond.ts`, `data/bond.ts`): `Cmd { t: 'pat' }` pets your own companion within `patReach`, with a `patCooldown`. Each pet is +1 `Pet.aff` (0..100) up to `PATS_PER_DAY` a day (`Pet.pt` holds the day's count); levels Shy, Friendly, Fond, Devoted (`AFFECTION_LEVELS`). From `GIFT_AT` the first pet of each day digs up a drop from the `GIFTS` tables, rolled with `luckRng`, never `sim.rng`. The client sends `pat` from `Interact.interact` (`world/interact.ts`) after buildings and land; the `hop` event drives the creature's hop. Test: `tests/bond.test.ts`.
- **Export chute:** `chute` (Logistics skill) is a sink for belts, inserters and drills. `sim/chute.ts` decides what it takes (`chuteSells`: materials, food, seeds and potions with a price; never gear, `open` items or `misc`) and sells on the spot: `chuteSell` credits `BuildE.by` even if offline at `TUNING.chuteCut` x `sellValue` (`sim/stats.ts`, shared with the Market), carries fractions, adds to `prod.coin` and counts as 'sell' for quests. `BuildE.ch` holds six 10-second slices of takings (`chuteRate`: the rolling coins a minute shown by the status, the Factory view label and the Journal's Factory tab) and a pending "+N" that `chuteStep` floats at most once per `chuteFloatEvery` seconds with one quiet `chute` fx (no `by`). A refused item stays on the belt (`canAccept` / `whyNot`); `flt` is its only-sell-this filter. Test: `tests/chute.test.ts`.
- **Weather vane:** `weathervane` (Decor) opens the `vane` window (`ui/screens/vane.ts`). `shared/weather.ts` has `rainPlan` and `foggyDay` (the one source for `weatherAt`) and the pure `forecast(seed, day)` (today plus three days: rain part and strength, fog, season, night event); `shared/data/forecast.ts` holds the words, icons and the hint, every claim read from the rules (`TUNING.rainGrow`: rain makes growing beds grow faster, it does not water them). The world view (`FactoryView.animateVane`) turns the arrow with the wind and shows tomorrow's picture. Test: `tests/weathervane.test.ts` walks the real clock against `weatherAt` and `nightEvent`.
- **Potluck table** (`sim/potluck.ts`, window `ui/screens/table.ts`): the Table holds up to `TUNING.tableDishes` (4) different dishes of up to `tablePortions` (8); a dish is any item with a buff (`isDish`). State is `BuildE.dish: { it, n, by }[]` (`by` = the cook's player id; only the cook takes it back). `Cmd { t: 'potluck', op: 'put' | 'take' | 'feast' }`; USE at a table feasts, or opens the window when nothing can be eaten. A feast eats one portion of each dish that helps (`plan()`: a buff you lack, or hold under `feastTopUp` of the dish's time of), refreshes the buffs rather than stacking them and marks each with the cook's name (`PlayerS.buffs[].by`: a letter on the HUD chip and a tooltip). Per-farmer cooldown `BuildE.fc` (`feastCooldown`), range `feastRange`; a chronicle line once a day when three or more farmers fed within `feastWindow`. Taking a table down returns each dish to its cook by post. Dev op `feast`. Test: `tests/potluck.test.ts`.
- **Co-op boss statuses** (`sim/costatus.ts`, data in `data/costatus.ts`, dials in `TUNING.coop`): three statuses a boss lays only while two or more free farmers are up in its arena, as the patterns `freeze` (Frost Giant), `hex` (Witch, Pharaoh) and `chain` (Colossus; the Old Heart and expedition guardians use all three). A phase lists the old pattern it replaced in `alone`, so a lone farmer gets the old fight. A status is the optional public field `PlayerS.co` (`k`, boss `b`, start `s`, end `u`, chain partner `w`, thaw progress `th`): one at a time, never saved (stripped on load and join), cleared when its boss is gone, the farmer is downed, leaves or goes home, the expedition ends, or by itself. Frozen: cannot move, swing, dig, use or dash and cannot be hurt; a friend holding E thaws in 1.5 s (the `revive` command, answered by `costatus.thaw`), alone you thaw in 8 s, or in 3 s when nobody else is up. Hexed: ticks every second, a little worse every 4 s, for 12 s (6 s alone); standing within about a tile of a free friend for a moment passes it on. Tethered: two farmers chained for 16 s; beyond 7 tiles the chain pulls and hurts both. Curses and chains never take the last half heart. World look: `client/world/costatus.ts` (ice block `fx_ice`, curse wisps, chain); warning: `client/ui/costatus.ts` plus a chip first in the status row; a friend's tag shows the status. A new co-op pattern needs a `CoPattern` id, a `COOP_PATTERNS` entry, its `begin`/`run` cases in `sim/boss.ts`, and an `alone` stand-in in every phase that uses it (a test checks). Tests: `tests/costatus.test.ts`; dev menu op `co`.
- **Rings and the Equipment Bag** (`ui/screens/gear.ts`, key G): a ring is gear with `slot: 'ring'`; `WornSlot` (`data/items.ts`) is `ring1`..`ring5` plus the single slots, and `PlayerS.equip` is keyed by it, so `modsOf` counts every worn ring with no extra code. `cmdEquip` puts a ring on the asked or first free finger (else replaces `ring1`); a ring is not drawn on the farmer (it has a drop model, `ring()` in `client3d/models/drops-armor.ts`). New ring = an `ITEMS` row, an icon spec (`shape: 'ring'`), a drop model, a source (Anvil recipe or a boss drop). Test: `tests/rings.test.ts`.
- **The Relic Satchel** (`data/relics.ts` is the pure rules, `sim/satchel.ts` the commands `{ t: 'satchel', op: 'put' | 'take' }`, `PlayerS.satchel` the laid relics, the grid in `ui/screens/gear.ts`): a relic is an item with `relic: { tag, size }`; it gives its tag's stat by area, more for each touching relic of its tag and each worn ring of that tag (`RING_TAG`), and touching relics of two tags make a `COMBOS` bonus. `modsOf` adds `satchelResult(...).mods`. New relic = an `ITEMS` row (named `relic_<tag>_<size>`), an icon spec, an Alchemy recipe and crate loot; the 3D drop models are made from `RELIC_COL`. Test: `tests/relics.test.ts`.
- **The Blight** (`sim/blight.ts`, dials in `TUNING.blight`): a nest isle is a plot with `blight` 1 (its level `nl` and kind `nk` on the plot, so the map knows them) and a `nest` node fought with weapons (`commands.cmdSwing` hands it to `blight.hitNest`). Starting nests come from the seed (`blight.ensure` in the Sim constructor, its own `Rng`); levels, merging and spread happen in `blight.onDawn` (its own dice per day), so the world's `sim.rng` is untouched. Raids are planned in `clock.startNight` (`raid.raidFor`; no nest in range means no change at all) and raiders are monsters with `rd` (the base they march on), moved by `raid.raidMove` (they wade, and strike `BuildE.hp` on the defense pieces in their way: `sim/defense.ts`; a new defense piece is `hp` on its `BUILDINGS` entry; a new tower is `tower` plus its numbers in `TUNING.blight`, fired by `defense.update` with a `shot` event for the client). Client: `world/blight.ts`, art in `art/storybook-blight.ts`, blighted ground in the tile sheet (`tileBlight`).
- **A new key action:** `actions.ts` + the `FX` table + a sound (it won't compile otherwise).
- **Loot:** crate tiers, rarity pools, wheel wedges and luck odds are tables in `data/loot.ts`; the rolling is `sim/fortune.ts` and uses its own dice (`luckRng`), never `sim.rng`, so loot changes cannot shift the world. Story pages, bottle letters and Fortuna's lines are in `data/story.ts` (a test checks lengths and that every chapter has pages).

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

## The 3D view (beta): `settings.view`, `world/view3d-bridge.ts`, `src/client3d/view3d.ts`

Players choose how the world is drawn: **2D** (the default, unchanged) or **3D (beta)**, on the title screen (the View toggle beside
Solo) and in Pause menu, Settings, World view. It is `settings.view` (`'2d' | '3d'`) in `awesome_farm_settings_v1`; anything else
stored there reads as 2D.
- **One game, two pictures.** The Game scene always runs: connection, state mirror, your movement, keys, targeting, placing, the HUD's
  questions. In 3D its main camera draws nothing (it still updates and follows, for culling and the 2D pointer) and `View3D` draws
  the same mirror. Never run a second Sim or a second connection for 3D, and never put game rules in `src/client3d`: the view only draws.
- **World overlays** (`world/overlay3d.ts`): the Game scene's own 2D overlays are laid onto the 3D ground, drawn by the same code: the
  status badges, the Factory view (L) and its dim, the inserter marks, the placement overlay (supply squares, wire reach, facing arrow),
  the blueprint copy box and paste outline, the dismantle outline and bar, fishing lines and the bite mark,
  swing arcs, monster marks, the Perfect ring, sorter and chute filter icons, chest tags, tunnel links. Mark such an object with
  `overlay3d(obj, lift?)` (the bridge); in 3D one extra Phaser camera per lift draws only marked objects. It copies the 3D camera after
  every frame (`View3D.groundView()`, measured through the camera in `client3d/groundview.ts`): an orthographic camera with no yaw maps
  the ground to the screen by an affine map, so a camera zoomed `sin(EL)` less down than across puts every overlay on its spot (a camera
  that turns about the vertical would break this). `lift` (tiles) raises one on screen as high as a thing that tall stands (badges: 0.9).
  Leave unmarked what a 3D model already draws (wires, inserter arms, belt items, the Titans' ring, badge and bar), or it shows twice. Painted by the 3D view itself
  (`client3d/marks.ts`, `wires.ts`): a boss's warnings in the 2D shapes and colours (circle, ring, cone, line; ice, curse and chain colours;
  the white flash), boss arenas, power wires hung from the pole models, and a ghost per piece of a pasted blueprint (`View3DFrame.paste`).
  `GameScene.viewRect()` is the world on screen in either view (culling, the Factory view's dim). `tests/overlays3d.test.ts`.
- **The real HUD on top.** The Phaser canvas is created transparent when the page boots in 3D (`transparent: settings.view === '3d'`
  in `client/main.ts`; every scene but the hidden Game scene paints its own background) and the three.js canvas sits exactly under
  it (`position: fixed`, same box, `pointer-events: none`). Every menu and screen is the 2D one. In 2D the canvas stays opaque, as before.
- **Switching:** live when the canvas is transparent (`canSwitchLive`); a page booted in 2D saves, writes the connection for one reload
  (`stashResume` in `net/connection.ts`, sessionStorage `awesome_farm_resume_v1`, removed when read) and reloads; the title screen
  (`takeResume`) goes straight back into the same world (solo, or the server with its password and secret word). `GameScene.setView`.
- **The feed** (`View3D` in the bridge, called by `GameScene`): `welcome` (a world arrived), `upsert` / `remove` (entities, as the
  tick carries them), `plots(changed, risen)`, `event` (every sim event, after the 2D handler: fx bursts, telegraphs, knocks, swings),
  `swing` (your own swing, before the server answers) and `frame(dt, View3DFrame)` once per Game update (farmers as the Game scene
  has them, camera target and zoom, clock and seed, the building in hand, the swing target). Sounds stay the 2D `Fx`'s (one table).
- **The input bridge** (`WorldPointer`): everything that turns the pointer into a place in the world goes through `GameScene.toWorld(p,
  out, aim)` (targeting, the ghost, drag lines, touch aim, blueprints, pings, factory tooltips) and back through `worldToScreen`
  (names, floats, plates, chat, the tutorial pointer). `Pointer2D` is the Phaser camera; `Pointer3D` raycasts onto the models
  (`aim`: a pointer over a tree picks the tree, via `entCenter`) or the ground plane. Keyboard and stick movement never touch it.
- **Bundle:** `src/client3d` and three.js are only reached through `import('../../client3d/view3d')` in the bridge, so 2D players
  download nothing extra (the 3D chunk is its own file in `play/assets`). `tests/view3d.test.ts` walks the static imports from
  `src/main.ts` and fails if one reaches `src/client3d` or `three`. In `src/client3d`, import from `client/` with `import type` only.
- **Models:** every kind needs a model of its own in `src/client3d/models`, with no placeholders: `src/client3d/coverage.ts` lists the
  families (building, node, monster, creature, item, projectile `SHOTS`, crop stage, boss pattern `PATTERN_POSES` in `mobs-attack.ts`,
  creature activity `WORK_PROPS` in `critters-work.ts`, character creator look, gear, co-op status `STATUS_MODELS`), each read from the
  shared data, and `tests/view3d.test.ts` fails for any kind without one (and when two look choices are drawn the same). A new
  building with state shows it through the model's `apply(e)` (called when it is made and on every change) and moves in `update(dt, t)`;
  the weather vane reads the seed and day from `env` (set by the view each frame).
- **Animations (entities):** monsters flash and squash when hit (`wrapRig`), and a boss's whole body follows its pattern (`e.pat` and its
  own clock, resynced to `e.pt`); creatures hold their activity's prop (`WorkSlot`, sized from the body); the farmer's `react(hearts,
  invuln, downed)` gives the hit flash and recoil, the invulnerable blink and the downed ring, and `status(co)` the ice block and wisps
  (the chain is `Entities.drawChains`); removed monsters shrink away and removed drops fly to the nearest farmer (`Entities.leaving`).
- **The world's mood** (`src/client3d/mood.ts`, one `frame` call from the view): the 2D NightLayer and Ambience told in light. It reads
  the same pure functions as 2D (`weatherAt`, `nightEvent`, `seasonOf`, the World's caves and Dread plots), never anything of its own.
  The caves (`caves.ts`: rock blocks `ROCK_H` tall with their fronts, ore nuggets and flecks with a faint glow, floor features; chunks
  streamed round the camera, a chunk rebuilt when `World.digs` moves and its rock changed; the surface `Terrain.landAt` is never true
  under `UNDER_Y`) go dark with the 2D depth tint (`caveTone`) and the light you carry. The Dread Reaches dim the day by 0.62 and add a
  violet veil. Seasons (`seasons.ts`) are a shader patch on the ground and on node models (opt in: `seasonGround`, `dressForSeasons`;
  greens are found by colour, so buildings, crops and monsters are never touched) driven by shared weights that glide, plus falling
  leaves, petals or snow. Lights (`glow.ts`) are the 2D light map's sources (`glowOf`; `tests/world3d.test.ts` checks the glowing
  monster and creature lists still match `Game.ts`): eight real point lights for the nearest, a ground pool for each, the dusk hearth
  circles. Fog banks, rain rings and the special nights' skies are `atmos.ts`; the rift gates `riftgates.ts`. A storm's lightning keeps
  the 2D night layer's timer and thunder (`View3D.lightning`). Terrain soups are drawn double-sided (their triangles are wound both ways).
- **The art pass** (2026-10-09; scorecard and screenshots in DESIGN.md, "Stage 2, the art pass"): the grade in `sky.ts` (`KEYS`: a
  moonlit slate night with a silver `MOON` instead of royal blue, a golden hour with lavender shade, rain as an overcast that greys,
  dims and drains colour; night and rain lower `saturation`); `contact.ts` (soft contact shadows under everything that stands, sized
  from the data by `contactSize`, at every quality level: the only grounding on Low, at night and in the caves); `impacts.ts` (event
  VFX over the juice bursts: a ring per action in the `RINGS` table, a flash for the big ones, dust at running feet; one instanced mesh
  each); `wet.ts` (rain darkens the ground and lowers its roughness through `groundMat`, dries slowly, and lays puddles mirroring the
  sky on open land); rain streaks lean with the wind and fade tail to head (`weather.ts`, `Rain.density` by level); the cave rock has
  a lighter lip where it meets the floor and the cave material darkens the floor by height. Low keeps contact shadows and the grade but
  drops puddles, dust and half the rain. `tests/art3d.test.ts`.
- **The Blight in 3D** (`tests/blight3d.test.ts`): a nest isle (`Plot.blight` 1) is ground of its own in `terrain.ts` (`BLIGHT_PAL`,
  `blightDecor`: bruised purple-grey soil, ooze, dead tufts, bones, stumps and rib cages baked into the chunk soup, and the smouldering
  cracks as one unlit child mesh per chunk, `veinMat`); the nest (`models/nodes-nest.ts`) reads its plot's level through
  `NodeOpts.level` and grows (`nestScale`, the 2D formula), darkens and sprouts eggs and spines by tier (`nestTier`, one baked mesh
  per tier and seed) and throbs (`nestBeat`); it smoulders in the dark (`glowOf`, a slow `pulse`).
  A raider (`MobE.rd`, not a flier) in the sea sinks to the waist (`Entities.wadeStep`, `View.wade`, `wadeDepth` from its radius; no
  contact shadow there) and leaves foam on the water (`wade.ts` `Wading`: wake rings, a collar, splashes off on Low); it carries the
  2D red raider light (`glowOf`, followed every frame and sunk with it). The 2D wading ripples are unmarked (2D only), since 3D draws its own.
  A hurt defense (any kind with `BuildingDef.hp`) shows its `BuildE.hp` (`models/b-damage.ts`: `buildingModel` wraps it in
  `withDamage`; cracks, then chips out of the cap, then crumbling, with rubble at its foot; one baked child per stage and shape, gone
  when it mends), and a break (`bldBreak`) is in the `FX` table with a ring, a flash and a cloud of dust (`Impacts`). Every Blight
  action (`nestHit`, `nestDie`, `nestSpread`, `raid`, `bedSet`, `unbind`) has its own burst, the big ones a ring. The rest (plates, nest
  rings, health bars) are the 2D overlays; the dusk warning and the minimap marks are HUD.
- **Coordinates:** the bridge speaks sim pixels (TILE = 16 per tile) and HUD units (960 x 540); the 3D view works in tiles
  (x east, z south, y up) with an orthographic camera at 62 degrees (`render.ts` `EL`, `BASE_VIEW` = 11.25 tiles tall at zoom 1 =
  the 2D view's classic distance). Zoom follows the 2D zoom steps (`GameScene.zoomLevel`).
- **The camera** (`src/client3d/camera.ts` `CameraRig`, pure maths, tested headless in `tests/camera3d.test.ts`): a follow that is the
  same at any frame rate (1 - e^(-7 dt)), fed `View3DFrame.cam` (`View3DCamera`) by the Game scene. **Shake:** the 3D view never starts
  a shake from an event; it copies the 2D camera's running shake (`shakeNow` in the bridge: Phaser moves the world by the juice
  table's pixels), so the `FX` table and "a friend's action never shakes your camera" hold in 3D with no second table. **Perfect
  beat:** the camera runs on real time (`realDt`) while the world crawls, pushes in by `SlowMo.punch` and drains a little colour.
  **Caves and warps:** when the followed spot goes underground (or back up, or jumps more than `WARP` tiles) the picture dips to
  black, cuts at the bottom, and comes back at the new place (`DIP`). **Photo mode** (F2, `Hud.setPhoto` -> `GameScene.setPhoto`):
  in 3D a drag turns and tilts the camera (`world/photocam.ts` `PhotoCam`, plain numbers on the 2D side), the wheel, + / - and a pinch
  zoom it, clicks do not swing, the ghost and target ring hide, and keys and the stick are turned with it (`moveYaw`, `screenToWorldMove`)
  so up the screen stays up. In 2D, photo mode is still only the HUD hiding.
- **Checking it in a browser:** `?profile=v3d` and `localStorage awesome_farm_settings_v1 = {"view":"3d"}` before the page loads boots
  straight into 3D; `__farm.scene.setView('2d' | '3d')` switches; `__farm.scene.view3d` is the view. Software GL (swiftshader) runs
  the 2D world at about 0.5 fps and 3D at well under 1 fps on a busy machine: stop the loop (`__game.loop.sleep()`), drive it with
  `__step(n, 100)` (keys held with Playwright's keyboard in between), and give screenshots long timeouts. The character creator opens
  over a new farmer's first world and blocks the keys: send a `look` command and `closeScreen()` first.
- **The budget** (`src/client3d/quality.ts`, `batch.ts`, `budget.ts`): `settings.quality3d` (`'auto' | 'low' | 'medium' | 'high'`, the
  button left of 2D/3D in Settings) reaches the view as `View3DFrame.quality` and sets pixel ratio, shadow map, glow, multisampling, lamps
  and ambient life live (`QUALITY`; Auto by device, `resolveQuality`, and `AutoStep` steps down on slow frames). Instancing is automatic for
  meshes from `bake()` (cached geometry + shared opaque material, render order 0): a new model that builds with `bake` and shares its
  materials is instanced for free; a per-instance geometry, a cloned or see-through material or a custom `renderOrder` is drawn one by one.
  The view updates world matrices itself once a frame (`scene.matrixWorldAutoUpdate` is off) and only for shown models. The `Ledger`
  disposes everything the renderer drew when the view goes, and a removed model's one-off geometry at once (`bake` marks its geometries
  `userData.cached`, which stay). `__farm.scene.view3d.perf` gives the level, draw calls, triangles and batch counts of the last frame.
- **Still to do for parity** (a list per area: WORLD, ENTITIES, OVERLAYS, CONTROLS, PERF) is in DESIGN.md, "Two views of one world".

## Developer menu (secret: for testing, never mentioned in the game)

A tester's screen for levelling up, giving items, spawning monsters, bosses, creatures and nodes, setting the time or day, starting a night event, freeing land and teleporting. It works in solo (every build, including `npm run build:single`) and on a server that has a developer key.
- **Opening it:** tap the farmer's portrait (top left) 7 times within 4 seconds, or press Ctrl+Shift+D. Solo unlocks at once. Online it asks for the key (`window.prompt`), sends it, and opens the screen when the server confirms; once unlocked it opens without asking again until you leave. Nothing in the menus or the guide points to it. Code: `ui/devunlock.ts` (the gestures, one line in `scenes/Hud.ts`; the tap counting is `ui/devgesture.ts`, tested) and `ui/screens/devtools.ts` (the screen, registered as `dev`).
- **The rules** are in `shared/sim/dev.ts`: `Cmd { t: 'devdo'; op; … }` runs one op from the `OPS` table, and only for a farmer in `sim.devs` (runtime only: never saved or sent, cleared when the connection ends or is replaced) or when `sim.cheats` is on. Numbers go through `int()` (finite, clamped), words through `has()` (an own key of a data table); `Sim.command` has already refused inherited names (`hostile()`). Every op says what it did (an fx plus a float or toast), and a new op has to be added to `DEV_OPS` and `OPS`. God mode and the speed boost are the buffs `devgod` / `devspeed`, stripped on leave and on load. The screen echoes the answers on its status line (toasts wait under a window). `tests/dev.test.ts` covers every op, the locks and the real server.
- **The key:** `Cmd { t: 'dev'; key }` is answered by `SimHost` (`net/host.ts`), not the sim. The server takes `--dev-key <secret>` or `AWESOME_FARM_DEV_KEY`; with neither, the menu can never be unlocked there. The host keeps only a salted `hashKey` of it, compares in constant time, locks an address (or farmer) for 5 minutes after 4 wrong keys (a reconnect does not reset it) and everybody for 10 after 20 in 10 minutes, and never logs, sends or saves the key. The farmer's own record carries `dev: true` once unlocked (`flush()` adds it to the own view only). Solo is `new SimHost(…, { devOpen: true })`. The hosting scripts add `--dev-key` from `dev-key.txt` when that file exists.
- On a `--cheats` server (and in vite dev solo) every op works without an unlock, and the gesture opens the menu without a key.

## The Defense Lab (`?lab=defense`: towers, walls and waves, solo only)

`play/?lab=defense` (or the dev server's `/?lab=defense`) skips the title screen into a test arena: `shared/sim/lab.ts` builds a world of its own
(seed `DEFENSE-LAB`, cheats on: `sim.lab`, `sim.cheats`), a flat island of six plots (no ore, nothing grows back) open to the sea on the east,
the farmer in an 11 x 11 yard (stone north, wood west, brick south, Fortified east with the doorway), an Archer Tower, a Ballista and a Tesla Coil
(a wind turbine and a pole feed it) inside, spike traps outside the doorway, a nest isle four plots east, every skill, the story and medals done,
`LAB_KIT` in the backpack and god mode on. The clock is held at noon or midnight (`lab.step`: no night spawns, no dawn, no weather).
- **Never saved, never the real farm:** `client/lab.ts` reads the switch; with it the profile slot is `lab` (`profile.ts`: every per-farmer key
  gets `:lab`), `LocalConnection('defense')` builds the lab instead of reading `awesome_farm_solo_v1` and has no `onSave`, and the hints, tips,
  welcome card and tutorial neither show nor write.
- **The panel** (`ui/labpanel.ts`, in the left column where the quest tracker would be; the corner button folds it): monster, count, direction
  and level, Send wave, Night, God, Mend, Clear, Speed, Reset, and a readout (alive, killed by towers, by you, wall damage, broken pieces;
  `lab.readout`, from `defense.tally`). Every button is a `devdo` op: `labWave` (`id` monster or `mixed`, `n`, `lv`, `who` = n / e / s / w / sea:
  raiders with `rd` on the yard, 14 tiles out, the sea wave 18 out in the water), `labNight`, `labMend` (mends and puts back broken arena
  pieces), `labClear`, `labSpeed` (`sim.timeScale`, read by `SimHost.update`), `labReset`, plus the menu's own `god`. They refuse outside a lab
  world and are locked like every op. Test: `tests/lab.test.ts`.

## HUD layout: zones, banners, toasts, plates (`ui/slots.ts`)

Every HUD element has ONE home, and a home is one of a few named zones. The zones, their rectangles and the rules between them are pure data in `ui/slots.ts` (no Phaser, tested in `tests/slots.test.ts`); `ui/hudlayer.ts`, `ui/plates.ts`, `ui/companion.ts`, `ui/bossbar.ts`, `ui/rift.ts`, `ui/fishing.ts`, `ui/chat.ts`, `ui/touchcontrols.ts` and the tutorial's pointer all read them, so move a thing there and the rest follows (`furniture()` is built from them too).
- **Top left, identity:** the farmer card, then (each only when it has something to show) the companion, the party (one frame, a row per friend) and the quest tracker: ONE column, ONE width (`LEFT`). Each starts under the one above (`CompanionCard.bottom`, `PartyList.bottom`), so a third row of hearts pushes the column down. The tracker shows one line per section while the coach card is up, and leaves out whatever would run past its limit (low on a phone, where the stick lives).
- **Top centre, announcements:** `topStack` stacks the dusk countdown (`DuskPill`), the expedition plaque with its omen and boon chips and the boss bar from the top down (each only when it shows; the guardian's bar comes last so nothing above it moves when it arrives). Under it is the TOP SLOT (`TOP_SLOT`, y = 68): the coach card, tip cards, the fishing catch card, the down panel and the big banners take turns in it and never show together. Banners wait for a free slot and while a window is open, and sit under the stack when it is up (`HudScene.drawBanner`).
- **Top right, world info:** `worldBlock` is ONE frame holding the time, season and day, the day dial, the coins, the minimap (tap it for the big map) and a row with zoom out, zoom %, zoom in and the Factory view button. The toast lane hangs under it.
- **Bottom centre:** the hotbar (`hotbarLayout`: bigger slots on a phone), and above it `bottomStack`, from the bottom up: the status row (buff chips; the held item's name floats over its right end), the chat (and its input), the interaction prompt and dismantle bar, and the fishing panel. What shows takes room, what does not takes none, and each value glides (`glide`) to its place so nothing jumps.
- **Live obstacles:** the banner, the toasts on screen, the bottom stack (`bottomRect`), the phone's stick corner (`stickZone`) and the down panel publish their rectangles with `slots.set(id, rect)`, so plates, friends' names, captions and edge markers slide clear of them.
- **Bottom right:** a computer has the menu bar (`MENU_BAR`, one frame with each key under its icon). A phone has the thumb cluster (`THUMB`: ACT, USE, EAT, DASH and the context buttons FISH/TURN, POD/CANCEL, REMOVE; round, at least 52 across) and BAG / BUILD / MENU under it (`TOUCH_BAR`). The stick (any touch in the lower left) has that corner to itself.
- **Banners** (`BannerQueue`): one at a time, short (the time fits the words, less when others wait), repeats dropped, at most four waiting. They wait for a free top slot (the cards fade away first) and while a window is open or the catch card shows. Sim events `banner` -> `hud:banner` -> `HudScene.showBanner` -> the queue.
- **Toasts** (`ToastQueue` + `Toasts` in `ui/toasts.ts`): three on screen at most, the rest wait; repeats of one kind merge (`toastKey`: "Level 7!" + "Level 8!" become one with the points added); nothing shows or ages under a window or while you are down; the lane is the right column under the world block on a computer and the strip right of the farmer on a phone (`toastLane`), clear of the thumb buttons and of the fishing panel.
- **Things anchored in the world** (land price plates, friends' names, creature job captions, Factory-view labels) slide until they are clear of every HUD rectangle (`clearOfHud`: `LandPlates.place` in `ui/plates.ts`, `HudScene.updateFriends/updateWorkers`) and wait out of sight when there is no room. **Arrows for things off screen** (the lost backpack, a friend's ping, the tutorial pointer) use `edgeMarker`: they stand at the edge of the play area (`PLAY`) and are pulled out from under the HUD. Live rectangles (tracker, companion, card, boss bar, plaque, party, dusk pill) are published with `slots.set(id, rect)`.
- **Small screens:** `hudScale()` / `smallScreen()` / `fit(size)` in kit.ts. Below a scale of 0.85 `label()` never draws body text under size 12, and the text people read most (tooltips, tracker, Backpack stats, Guide, toasts, Build/Craft details) uses `fit()` for a bigger size where there is room. The Guide and Backpack windows grow on a phone, and the Guide pages a topic's steps (Back / More) when they do not fit at the phone's readable size.

## Windows: the house style (`ui/win.ts`, `ui/parts.ts`, `ui/tooltip.ts`; all re-exported by `ui/kit.ts`)

Every window in `ui/screens/*` that lists things (Backpack, Craft, Build, chests, Market, machines, altar, dock, den, creatures, blueprints…) is put together from the same parts, so they look and behave alike on a computer and a phone:
- **Three sizes**, centred: `new Win(scene, { size: 'small' | 'medium' | 'large', title, icon, sub?, onClose })` (420×300, 640×400, 936×512, nearly the whole screen). Pick the smallest that fits. `sub` is a one-line "what this is for" under the red ribbon. Only the character creator (700×410) still passes `w`/`h`.
- **Locked things** say what opens them with `lockedWords(token)` from `data/skills.ts` ("Locked: learn Logistics (Industry). Unlocks belts…"), never the unlock sentence alone.
- **The skeleton:** ribbon title top-centre (as wide as the title), close button top-right, `win.body` (the content area), `win.under` (the area under a toolbar row of tabs on the left and a search box on the right at `win.top + win.toolH / 2`) and ONE footer row from `win.footer({ info, secondary, extras, primary, hint })`: notes and secondary buttons on the left, a small pebble hint between (it takes whatever room the visible buttons leave), the primary action in gold on the right with its variants (`x5`, `Max`) just before it. Hide a footer button with `showBtn(btn, false)`, then call `setHint` again.
- **Groups:** `win.section(x, y, w, h, title?, { right?, layer? })` draws a recessed panel with a heading (14, head font), a rule and a value at the right, and returns `inner`, the rectangle for its content. Draw a tab's sections on their own `layer` (a Graphics you hide with the tab) when two tabs share the space.
- **Parts:** `TabBar` (gold current tab, `layout(ids)` to show some, `setMark`/`setDim`), `Pager` (◀ 1 / 3 ▶), `CostList` (have / need rows, green or red, one or two columns), `StatList` (label left, value right), `rowBox` (a list row's frame), `ItemGrid.fit(w, h, size, gap)` (how many slots fit; rows past the last item are hidden but one, and an empty grid shows its words instead of empty slots), `SearchBox`, `QtyChips`. `ui/factoryui.ts` has `StatusBlock` (badge, sentence, hint) for the machine and device windows.
- **One text scale:** `TS` = title 20, heading 14, body 12, caption 11, and `ts('body')` etc. for the phone-raised size (`fit()`), so lay out for the raised size: wrapped text takes its full height (`text.height`), rows are at least `ts('body') * 1.2 + 6` tall. Buttons are 28 high (`BTN_H`); a phone draws them 36 and hits them from 44. Spacing is the 8-unit grid (`GAP` 8, `PAD` 16). Colours mean the same everywhere: gold = action, lime = ready/good, berry = bad or danger, pebble = hint or disabled.
- **Looking at a window on a phone in a desktop browser:** in the dev harness, after `__solo()`, import the app's own modules (their URL may carry `?t=…`: read it from `performance.getEntriesByType('resource')`) and call `setHudScaleSource(() => 0.694)` (kit) and `setTouchUi(true)` (input/layout), then `Hud.openScreen(name, arg)`.

## Factory clarity (status, badges, Factory view)

The automation part has to explain itself, on a phone too. Everything below is built from `sim/status.ts`:
- **Windows:** the Machine and Device windows start with a badge, one plain sentence (working, waiting for *named* ingredients, no fuel, no power, output full, no recipe chosen, nowhere to put things) and a hint saying what to do.
- **In the world** (`client/world/factoryview.ts`, one `FactoryView` created by `GameScene`, hooked in at `createView` / `upsert` / `removeEnt` / `update`): a pooled badge image over each machine (green gear working, yellow hourglass waiting, red bolt no power, red cross blocked, red flame no fuel), a pick-up dot and a drop arrow on inserters, and a tooltip on hover (a mouse resting 0.2 s) or a 0.45 s long press (touch): what it is for, what it is doing, what to do, its rate.
- **Factory view (key `L`, or the belt button under the minimap):** dims the ground and shows each power grid in its own colour with its satisfaction %, flow arrows, blocked things pulsing red and items per minute. Captions are handed to the HUD (`FactoryView.labels` → `ui/factorylabels.ts`) so the text stays crisp.
- **Performance rules:** the world is looked at 4 times a second, only what is near the camera; badges are pooled images, the overlays are two Graphics redrawn only when their signature changes; belts get a cheap string-free check (`beltProblem`); the power wires are their own Graphics redrawn only when a building changes (`bldVersion`) or the camera moves. Keep it that way.
- **The world view never walks `ents` in a frame:** `GameScene` keeps `visViews` (what is on screen, shared with combat and the inserter arms; off-screen views only glide), `Interact.near` (`scanNear()` once per frame: the building, aimed piece, wild creature, plot and friend the keys act on), `derivedMe()` (cached per `meS` reference), `landmarks()`, `lightSources()` and `buildings()` (Maps kept in `createView` / `upsert` / `removeEnt`). The prompt text is computed at 10 Hz.
- **HUD text and frames are keyed:** `Text.setColor` always re-renders the canvas and `Image.setTexture` always re-looks-up, so every per-frame HUD path compares a cheap key first (`Slot.set`, the hotbar, the farmer card, the minimap (`ui/minimap.ts`) at 5 Hz, plates, worker captions, buff chips) and the night's motes and flakes are pooled images, not Graphics commands. A phone feels every re-render.
- **Starter layouts** (`data/layouts.ts`) are the first tab of the Blueprint screen (V); the Build menu shows each automation piece's how-to and a tiny floor plan (`ui/preview.ts`).

## The big meta screens (`ui/menukit.ts`)

The pause menu, Journal, Guide, Skill tree, phone menu and welcome card share one skeleton, so they read alike and a new entry is a row of data. All are the **large** window (936×512: the three sizes are `SIZE.small/medium/large`, centred, never touching the edge); coordinates are window-local.
- **Frame:** the red ribbon title, the close button in the top-right corner (it is `Win`'s), then `TabStrip` (y 42, fixed order, current tab gold, a berry count on a tab with something waiting; it keeps room for more tabs via `slots`, and on a phone leaves the right gutter to the bigger close button), `Header` (title 20, a one-line purpose, a count at the right), a body well (`BODY`: x 16, y 108, 904×346), and ONE footer row at y 484: a hint in pebble on the left, buttons on the right (`footButton`: primary gold bottom right, secondary bottom left, danger berry), `Pager` for paged tabs.
- **Pane:** a page you wipe and rebuild when its data key changes (never every frame): `pane.meter` (gold under way, lime complete, grey banked), `pane.count` (right-aligned "3 / 8"), `pane.check`, `pane.reward` (coin, skill point and xp chips, then item slots: rewards look the same everywhere), `pane.card`, `pane.zone`, `emptyState` (icon, what is missing, what to do about it).
- **Nothing is hover-only:** how to do a story or quest step is the footer text, shown for the step you point at on a computer or tap on a phone (`stepRow`, `hoverHint`); medals, bounties and goals show their rewards inline.
- **Adding an entry:** the pause menu's tabs are `TABS` in `screens/menu.ts` (the strip has a free sixth slot; a tab with `id: 'guide'` opens that screen instead of a page), the phone menu's tiles are `TILES` in `screens/launcher.ts` (twelve slots, two rows of six; eleven used, one free), the Journal's tabs are `TABS` plus a `draw…` method in `screens/journal.ts`, a Guide topic is a row in `data/guide.ts`. The Controls table stays in `menu.ts` (a test exempts it from the Shift/right-click rule).
- **Skill tree:** its own camera looks through a hole in the window (`VX, VY, VW, VH`, screen units; the window is the shared `Win`), and fades in with it. Everything else on that screen is window-local like the rest.

## Art style & palette — the "cozy storybook" look

The canvas is **twice as dense as the layout** (`SS = 2` in `src/client/res.ts`: 1920×1080 pixels for the
960×540 HUD space, world camera zoom `ZOOM × SS`). Everything in game logic and UI layout stays in logical
units; only art, text and the HUD camera know about `SS`. Use `hudCamera()` for a scene that draws HUD-space
objects, `logical(pointer)` to read the pointer in HUD units, and give new text `resolution: SS` (`label()`
does it for you).

- **Painted sprites** (`src/client/art/storybook*.ts`, painter in `paint.ts`): trees, rocks, ores, plants,
  crops, the farmer, buildings, decor, landmarks, creatures, monsters and bosses are painted pixel by pixel on a
  2× grid with `paint()` / `paintFrames()` (`Pix`: shaded ellipses, polygons, blades, then a 1 px outline
  taken from the colour it touches). They register under the *same texture key and logical size* as before
  (`addDense()` sets the frame's logical size), so the game code never changes. Boot paints `ART_GROUPS` one group per task
  (the loading line names each); monsters, bosses, shots and creatures are painted on first use (`ensureMobArt`, `critTex` /
  `ensureCritterArt`: never write a `crit_<species>` key by hand). Light comes from the top
  left; one ramp per material (`RAMP` in `paint.ts`). **Never paint a ground shadow into a sprite** — the game
  puts one under everything that stands.
- **Grid art** (item icons, skill glyphs, factory machines, the odd leftover) is still authored as palette-char
  grids (`pixels.ts`: `makeSprite`), without an outline; it is smoothed with Scale2x and outlined at 2×, so it
  sits beside the painted sprites. Palette chars: the table below (the world and icons use it; painted sprites
  and the UI use the richer ramps in `paint.ts` and `ui/theme.ts`).
- **Ground** (`storybook-ground.ts`): 32×32 tiles in one sheet (deep and shallow water, a cliff per biome, six
  ground variants per biome, rift tiles, and 32 shallow-water-with-foam variants chosen by which sides touch
  land: see `world/tiles.ts`). Ore veins are 27 more frames of the same sheet (after the cave frames), drawn as a second
  TilemapLayer (`world/veins.ts`): one display object however many veins.
- **UI** (`ui/px.ts`, `ui/theme.ts`, `ui/kit.ts`): wood frames, parchment pages, brass studs, a red ribbon for
  window titles. Headings and buttons use Fredoka (`font: 'head'`), body text Jersey 15; dark-theme text colours
  that screens ask for are mapped to ink tones by `onPaper()`. Pass `dark: true` for text on a dark or coloured
  surface, `stroke` for text drawn over the world. Frames that rarely change are baked into a texture
  (`ui/bake.ts`): a Graphics replays every draw command each frame, which is what a phone feels.
- **Motion:** squash & stretch, bobbing and quick pop-ins, always brief and back to rest.
  Rotate only tools, windmill blades and downed farmers.
- **Islands:** flat ground, a one-tile cliff face only on south edges, foam where shallow water meets land,
  deep sea beyond.
- **Dev helpers** (`src/dev/harness.ts`): `__gallery(keys, { zoom, cols, bg })` lays textures out on a meadow
  for looking at art; `__shot(x, y, w, h, zoom)` returns the real canvas as a PNG data URL; `__day(frames)` pins
  midday. `?profile=nat1` is a fresh island, `?profile=art1` a showcase base. `performance.getEntriesByName('art')` and the
  `art:<group>` measures time the boot paint.
- **Generated art:** use the repo's ComfyUI pipeline snapped to our palette:
  `python tools/comfyui/make_sprite.py "<subject>" --name <n> --palette awesome_farm/palette.gpl`.

| char | name | hex | role |
|---|---|---|---|
| `k` | ink | `#2a1d2c` | outlines, eyes, darkest shadow: a warm aubergine, never pure black |
| `n` | night | `#35305c` | night overlay, coal, deep shadow |
| `D` | deepSea | `#2d6ea6` | open water |
| `W` | sea | `#4ab2cf` | shallow water |
| `F` | foam | `#cdf4ee` | foam, sparkles, ice |
| `G` | pine | `#2d6a50` | leaf shadow |
| `g` | leaf | `#5cb04f` | leaves |
| `h` | grass | `#92d364` | meadow ground |
| `l` | lime | `#d4f08a` | leaf/grass highlight, revive |
| `e` | moss | `#6c9a49` | quarry ground |
| `B` | bark | `#6a402f` | dark wood |
| `b` | wood | `#a8703f` | wood, handles |
| `d` | dirt | `#d49a62` | dirt, cliff faces, tilled soil |
| `s` | sand | `#f4deaa` | sand ground, cream shading |
| `c` | cream | `#fff6e0` | Sprout's body, UI panels |
| `r` | berry | `#e85d62` | berries, hearts, danger |
| `o` | pumpkin | `#f8a24a` | pumpkins, fire, rust |
| `y` | gold | `#ffd966` | coins, gold, energy |
| `p` | blossom | `#f79fc6` | flowers, cheeks |
| `v` | plum | `#9d6fdb` | slimes, XP, perks, magic |
| `u` | dusk | `#5d4a7c` | bog ground |
| `S` | slate | `#666b86` | dark stone |
| `t` | stone | `#9ea4b9` | stone |
| `T` | pebble | `#d5d9e6` | stone highlight, iron |
| `w` | snow | `#fffbf4` | snow, white highlights |

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
