# Handover 1 — Awesome Farm: the project, and everything learned about Phaser 4 and the art

> Written 2026-10-06 at the end of a very long autonomous session. **The numbers below (tests, STATE_VERSION, PROTOCOL, plot size, player cap) are from that day**: CLAUDE.md and `src/shared/{config,net/protocol,sim/types}.ts` are current; the techniques here still hold. Use it to start a **new Claude
> session** that continues Awesome Farm, or that reuses the techniques in another Phaser game.
> The companion document for rebuilding the beatbox game is `HANDOVER_2_BEATBOX_STORY_REBUILD.md`
> (same folder); it assumes you have read this one.

## 0. Paste-ready starter prompt for a new session

```
Read C:\Users\danhi\Games-awesome-farm\awesome_farm\handover\HANDOVER_1_AWESOME_FARM_PHASER_AND_ART.md
completely, then awesome_farm\CLAUDE.md and awesome_farm\DESIGN.md. Work only inside the worktree
C:\Users\danhi\Games-awesome-farm (branch awesome-farm). Never touch the main checkout
C:\Users\danhi\Games. Summarise back what you understood in ten lines, then wait for my task.
```

---

## 1. Where everything is

| What | Where |
|---|---|
| Game source | `C:\Users\danhi\Games-awesome-farm\awesome_farm\` (a **git worktree** of `RoxorLoops1337/Games`, branch `awesome-farm`) |
| Main checkout (do not touch) | `C:\Users\danhi\Games` (on `main`, has unrelated uncommitted edits) |
| Commits | All **local only**, never pushed. Do not push or open PRs unless the owner asks. The root `CLAUDE.md` workflow (push, draft PR, squash-merge) does **not** apply to this folder yet. |
| Live server for the owner's friends | `C:\Users\danhi\awesome-farm-host\` (scripts, tunnel, `worlds\farm.json`); port 7790; link + password in `online-link.txt` / `password.txt` |
| Phone artifact (private) | https://claude.ai/artifact/XAmP11ywNksP9rTsMvrTfD (publish `dist-single/awesome-farm.fragment.html`) |
| Claude memory | `C:\Users\danhi\.claude\projects\C--Users-danhi\memory\` (`project_awesome_farm*.md`, `reference_awesome_farm_hosting.md`, `feedback_game_tuning.md`) |
| This session's transcript | `C:\Users\danhi\.claude\projects\C--Users-danhi\605b2d90-4f7c-43c0-9621-80f8fb72a442.jsonl` (huge; search it, never read it whole) |

State at handover: branch `awesome-farm`, last commits `ba5218e8` and `8b16da9a` ("Houses, packs, search,
respawn, a how-to-play guide and tidier menus"). `npm run check` is green (187 tests, both typechecks, production
build). STATE_VERSION 5, PROTOCOL 15, server/package version 0.5.0. The live server runs this build (applied
2026-10-06 01:01, nobody online, world backed up first) and artifact version 10 is published.

Run it:

```bash
cd C:\Users\danhi\Games-awesome-farm\awesome_farm
npm install
npm run dev            # http://localhost:8080 — solo works at once
npm run server         # dev server :7777
npm run check          # typecheck (client + server/shared without DOM) + all tests + production build (~3 min)
npm run build:single   # dist-single/awesome-farm.html (+ .fragment.html for artifacts)
SERVER_DIST=<dir> node scripts/build-server.mjs   # package the dedicated server (needs `npm run build` first)
```

## 2. What the game is (one paragraph) and what exists

Co-op island farming for up to 16 friends (8 at the time of writing), Forager-style gathering, Factorio-lite automation, Palworld-lite
creatures, six bosses, a 100-node skill tree, 13-chapter story plus side quests. Everyone starts on a far-apart
home island (12×11 tiles of land), buys land until islands connect, and builds one shared farm over many hours.
The **owner's real friends play it online** on the live server (7 farmers, day ~110), so every change must keep
saves loading (see §9).

Read `DESIGN.md` for the systems *as built*. In the last day the following were added (all in DESIGN.md):
real side quests with pins, a hotbar you fill yourself (keys 1–8 + wheel), companion field tasks (Gather / Mine /
Farm / Guard), outfits and packs painted on the farmer, packs (bag slot, +40…+900 carry), search boxes (`/`),
houses (floor → autotiled walls → doorway monsters cannot pass → roofs that fade), walkable garden beds, instant
respawn (R), the H how-to-play guide, first-time hints, and menus that list only what is unlocked.

## 3. The stack and why

- **Phaser 4.0.0** (WebGL, `pixelArt: true`, `roundPixels: true`, DOM container for text fields), **TypeScript 5.7
  strict**, **Vite 6**. `Scale.FIT`, `autoCenter`.
- **One shared, deterministic simulation** in `src/shared` (no Phaser, no DOM, no localStorage) used by the
  browser (solo) *and* the Node server (`ws`). The client is a *view*: it sends `Cmd`s and renders state/events.
  This is the best decision in the project: everything game-rule related is unit-testable in milliseconds with
  `node:test` and `tsx`, and multiplayer comes almost for free.
- **No image files.** All art is *painted by code at boot* (§5) and all sound is synthesised with Web Audio (§7).
  The whole game is one 2.5 MB HTML file (`build:single`), which is how it runs on the owner's phone as an artifact.
- **Server:** one esbuild-bundled `awesome-farm-server.mjs`; saves `worlds/<name>.json` atomically with a `.bak`.

Folder map: see `CLAUDE.md` ("Folder layout"). The short version:

```
src/shared/   config, palette, world (grid layers), data/ (content tables), sim/ (the rules), net/ (protocol, host)
src/client/   main, res (render density), art/ (painters), ui/ (kit + screens), world/ (views), juice/ (fx, sfx, music), scenes/
src/dev/      harness.ts — browser test hooks (DEV only)
server/       main.ts
tests/        *.test.ts (node:test via tsx)
```

## 4. Phaser 4 — the gotchas that bit us (read before writing any Phaser 4 code)

1. `import * as Phaser from 'phaser'` — **named exports only**; there is no default export. `import { AUTO, Game, Scale } from 'phaser'` works too.
2. `setTintFill()` does nothing in v4. Use `setTint(c).setTintMode(Phaser.TintModes.FILL)`, undo with `clearTint().setTintMode(Phaser.TintModes.MULTIPLY)`.
3. **RenderTexture commands are queued** until you call `rt.render()`. If something you drew into a RenderTexture does not show up, you forgot `render()`. (`ui/bake.ts` does this.) `ERASE` ignores source alpha, so use a multiplied light map for darkness instead of erasing (`ui/night.ts`).
4. `scene.events` also carries Phaser's own events (`pause`, `resume`, `shutdown`…), so Game→HUD events are prefixed `hud:`.
5. **Scene objects are reused** when a scene restarts: reset *all* per-session state in `init()`.
6. The **TweenManager runs on wall-clock time**, not the game loop's delta, and `scene.time.now` mixes with a stepped test clock. In view code use `dt`-based timers instead of tweens/`time.now` for anything that must be deterministic or testable.
7. A **`Graphics` object replays every draw command every frame.** A storybook panel is dozens of commands; a HUD has many. On phones this is the main cost → bake frames that rarely change into a texture (§6, `Baked`).
8. Frame sizes: an `Image` takes its *logical* size from `frame.data.sourceSize` (a getter over a record). `addDense()` in `res.ts` rewrites it — that is how a 64×76 canvas becomes a 32×38-unit sprite (§5).
9. Text: pass `resolution: SS` or it renders blurry on a 2× canvas (`label()` does it for you).
10. When the Browser pane / tab is hidden, `requestAnimationFrame` stops. Drive the game yourself with the harness (`__step(n)`), never wait for real time.
11. Vite **full-reloads the page on every source edit** (no HMR state), so re-stage your test scene after each edit.
12. Pointer positions come back in *canvas* pixels; convert with `logical(p)` (`res.ts`).
13. In `main.ts`, `input: { activePointers: 3 }` is needed for touch controls.

## 5. The rendering model and the art pipeline (the part to reuse)

### 5.1 Two coordinate spaces and "SS"

The canvas is `VIEW_W*SS × VIEW_H*SS` = **1920×1080 pixels** for a **960×540 logical** layout (`SS = 2`, `client/res.ts`).
All game logic and all UI layout use *logical units*. Only art, text and the HUD camera know about `SS`.

- World camera zoom is `ZOOM * SS`.
- HUD scenes call `hudCamera(this.cameras.main)` so logical (0,0) is the top-left corner.
- Read the pointer through `logical(pointer)`.
- Every texture you register must go through `addDense(scene, key, canvas, frames)`: it sets `source.resolution = SS` and fixes each frame's logical size (`cutWidth / SS`). Then game code keeps using the *same texture key and logical size* as before, while the picture has twice the detail.

Why: crisp pixel art that is also finer than one pixel per logical unit, with zero changes to game code, and a single constant (`SS`) to try 3× later.

### 5.2 The painter library — `src/client/art/paint.ts` (read this file, it is 210 lines)

Sprites are **painted pixel by pixel by code** into a `Pix` (a typed array of colours + alpha), then wrapped in a
1-pixel outline whose colour is *taken from the pixel it touches*, then uploaded as a canvas texture.

```ts
paint(scene, 'tree', 16, 22, (p, rnd) => { /* draw with p.ellipse / p.poly / p.blade … */ p.outline(); }, seed)
paintFrames(scene, 'farmer', 26, 26, 3, (p, rnd, frame) => { … })   // an animation strip (frames 0..n-1)
paintTexture(scene, key, pixArray)                                  // when you built the Pix yourself
```

`Pix` primitives (all take pixel coordinates at SS density; `paint(w,h)` is in *logical* units and multiplies by SS):

| Method | What it does |
|---|---|
| `set/get/rect/line` | the basics (alpha supported) |
| `ellipse(cx,cy,rx,ry,ramp,{light,bias})` | **a lit, banded ellipse**: a fake normal from a light at the top-left picks a colour band from a ramp. This one primitive makes most organic shapes look volumetric. |
| `ellipseRot(...)` | same, rotated (leaves, ears) |
| `poly(points, colourOrFn)` | filled polygon; the colour may be a function of (u,v) across the bounds, for gradients |
| `blade(x0,y0,cx,cy,x1,y1,halfWidth,ramp)` | a tapered curved blade (grass, reeds, leaves), lit on its left |
| `speckle(ramp, rnd)` | random fleck variation (some pixels jump a ramp step) → hand-made texture |
| `shadow(...)` | soft contact shadow (but see rule 2 below) |
| `outline(pick?)` | **the 1px outline**, coloured by the neighbour pixel (`outlineOf(c,0.7)` = mix toward the ink colour) |
| `stamp(other,x,y)` | composite another painting (used for equipment overlays) |

Helpers: `RAMP` (≈25 named dark→light ramps: leaf, wood, stone, gold, red, cream, ice, violet…), `mixc`, `outlineOf`,
`RNG(seed)` (a tiny seeded LCG), `INK = 0x2a1d2c`.

**Rules of the look ("cozy storybook")** — these are what made it look like "a different game":

1. **Light from the top-left**, always. Lit edge up/left, shaded edge down/right.
2. **One ramp per material**, 4–5 flat bands. No gradients, no dithering noise.
3. **Never paint a ground shadow into a sprite.** The game puts one under everything that stands (`shadowFor`), so shadows stay consistent and sprites can be reused.
4. **Never pure black.** The ink is a warm aubergine `#2a1d2c`; outlines are *the material's own darkened colour* (`outlineOf`), not a black line. This is the single biggest "painted, not pixel-clip-art" trick.
5. **Determinism**: painting uses a seeded RNG, so a sprite looks identical every load (and in tests).
6. Sprites use **origin (0.5, 1)** (bottom-centre) so they sit on a tile; anything that overlays a character (worn gear) shares that origin and canvas size so layers line up with no per-frame offsets.
7. Keep features a couple of pixels inside a tile so neighbours never show a cut-off tuft.
8. Motion: squash & stretch, bobbing, quick pop-ins, always brief and returning to rest. Rotate only tools, blades and downed characters.

The palette is deliberately small: **25 named colours** in `shared/palette.ts` (single source of truth, regenerable as
`palette.gpl` with `npm run palette` for external generators). UI colours live separately in `ui/theme.ts`.

### 5.3 What is painted where (`src/client/art/`)

| File | Contents |
|---|---|
| `paint.ts` | the painter (above) |
| `storybook.ts` | trees, rocks, ores, plants, crops |
| `storybook-ground.ts` | 32×32 ground/water/cliff tiles in **one sheet**: deep/shallow water, a cliff per biome, 6 ground variants per biome, rift tiles, and 32 shallow-water-with-foam variants chosen by which sides touch land (a 4-bit neighbour mask) |
| `storybook-chars.ts` | the farmer in 8 scarf colours; idle + 2 walk frames |
| `storybook-worn.ts` | **equipment layers** painted over the farmer: `WORN_HEAD/BODY/CHARM/BACK/BAG`, a cloak that gets a separate back layer; same canvas + bottom-centre origin as the farmer so they stack exactly. The Backpack's paper doll reuses the same layers. |
| `storybook-build.ts`, `-decor.ts`, `-sites.ts` | workshop buildings, decor and floors, dens/hatchery/waystone/altar/dock/forge |
| `storybook-house.ts` | **16-frame autotiled walls** (mask N1 E2 S4 W8; one material per wall style, window variant), doorway, thatch/tile/slate roofs; `${key}_icon` = the frame with mask 10 so menus show a *run* of wall, not a lone post |
| `storybook-critters.ts`, `-mobs.ts` | creatures, monsters, bosses |
| `storybook-logo.ts` | the title logo |
| `icons.ts` + `pixels.ts` | the **legacy** item/skill/machine icons authored as **palette-char grids** (`'..yyy..'`). They are smoothed with Scale2x and outlined at 2× so they sit beside painted sprites. Fast to author; use when painting is overkill. |
| `sprites.ts` | registers everything in order at boot (called from `Boot`) |

How to add a painted sprite: write a draw function with the primitives above, register it with the **same key and logical
size** the game already uses (or a new key + `tex` in the data table), view it with `__gallery` (§8), done. A test
(`tests/art.test.ts`) fails if an item/building/worn layer has no art.

### 5.4 Autotiling pattern (walls, shore foam)

Pick the frame from a **neighbour bitmask** and paint all 16 variants of a piece once:
`mask = N?1 : 0 | E?2 | S?4 | W?8`; the view recomputes the frame when a neighbour appears/disappears
(`Game.rejoinWalls`). Painting rule that makes it seamless: arms run *beyond* the tile edge (treat out-of-bounds
as solid when shading) and keep the lit-top / dark-front-face logic based on the **mass**, not the tile.

### 5.5 Overlays that follow a character

Worn gear is a set of `Image`s positioned at the player's sprite with identical origin and per-frame bobbing; the
walk animation moves the *container*, not each layer. Hide the layers whose slot is empty. The same painters
render the doll in the Backpack (`ui/screens/inventory.ts`). Friends' outfits are synced by sending the equipment ids.

### 5.6 Roofs, depth and fading

Depth is `y` (bottom edge) for things that stand; floors sit at a very low depth (−8); **roofs at a very high depth
(4000)** and fade to ~0.12 alpha with an exponential approach (`alpha += (target - alpha) * min(1, dt*7)`) when the
player's tile belongs to the same *connected* roof region (flood fill over the roof layer). Walkable beds are drawn
*under* the player (`y - h*TILE`).

## 6. UI kit — `src/client/ui/` (storybook paper, wood and ribbon)

Windows are **parchment pages in wood frames with a red ribbon title and brass studs**. Everything is drawn from flat
fills (no image files) in `px.ts` (`panel`, `rect`, `notch`, `inset`, `pxBar`, `STYLES.*`) with colours from `theme.ts`.

- `kit.ts`: `label()` (text; fonts: **Fredoka** headings, **Jersey 15** body, **Pixelify Sans** numbers; `resolution: SS`), `icon()`, `button()` (returns `{root,setLabel,setStyle,setEnabled}`), `tipOn(obj, () => TipData|null)` tooltips, `onTap(obj, fn, onRightClick)`, `Slot` (inventory cell with count/rarity/overlay), `ItemGrid` (`grid.ts`: scrolling grid with `setItems`), `Win` (modal window: `put(obj,x,y)` positions in *panel-local* coordinates, `text()`, `at()` to move, `destroy()`), `SearchBox` (a real DOM `<input>` floating over the canvas), `slider`, `Toasts`.
- `bake.ts` — `Baked`: draw a static frame into a `Graphics`, then `freeze()` renders it **once** to a `RenderTexture` shown as one quad. The HUD went from "a phone struggles" to smooth with this. Rule: bake anything that rarely changes; keep per-frame `Graphics` for bars that move.
- `onPaper()` maps old light-on-dark text colours to ink tones, so legacy screens written for dark panels read correctly on paper. For text on a dark/coloured surface pass `dark: true`; `stroke` is for world overlays only.
- Screens are classes implementing `Screen { update(dt); onKey?(key, ev?); focusSearch?(); wheel?(); destroy() }`, opened by name from the HUD scene (`Hud.openScreen`). Each owns a `Win`, rebuilds only when a cheap **state key** (`JSON.stringify` of what it shows) changes — never every frame.
- Pattern for lists that depend on unlocks: compute the visible list in a pure function (`shared/sim/listed.ts`), include it in the state key, **re-pack rows by index** (hide the unused ones, `win.at()` the rest). This is how the Crafting/Build windows now hide categories you cannot use yet.
- DOM text input over the canvas: the HUD must stop treating letters as hotkeys while an input is focused (`SearchBox` handles `/`, Esc, and blurs on Enter). The canvas screenshot helper does **not** capture DOM elements — use a page screenshot for those.

## 7. Juice, audio and feel (owner's taste)

**THE JUICE RULE (written into `CLAUDE.md`): every key action gets a sound, a small particle burst and a little camera
shake.** It is enforced by the compiler: actions are listed in `shared/actions.ts`; `juice/fx.ts` has
`FX: Record<Action, FxSpec>` where `FxSpec` *requires* `sfx`, `burst` and `shake`; the simulation emits actions as
events (`this.fx('build', x, y, playerId)`) and the client plays them. Never call `playSfx`, `shake` or
`emitter.explode` by hand for a game action. Client-only feedback uses `fx.play()`.

- Multiplayer: the actor gets all three; others see the burst and hear the sound only if it's on their screen; a friend's action never shakes *your* camera.
- Keep it little: shake is in *screen* pixels, 0.6 px for a pickup, 1.5–5 normal, 7 for being hurt. Bursts 3–40 particles. One-shots peak ≤ 0.3 gain with ±4 % pitch jitter. The most frequent actions get the smallest values.
- **Sound is synthesised** (`juice/sfx.ts`): each sound is an array of `{ w: wave|'noise', f, to, at, d, v, lp, hp }` tones with a pitch sweep and a biquad filter, on Phaser's own `AudioContext` (it auto-unlocks on first input). `playSfx(id, pitch)`. A new sound is one line.
- **Music is generative and quiet** (`juice/music.ts`): plucked pentatonic by day, slow bells at night, filtered noise for rain, drums + drone during a boss; follows the Music slider. Loops stay quiet, one-shots short.
- Owner's taste (from `feedback_game_tuning.md` and this project): *quiet engine/looping SFX, sirens as brief accents, goals reachable on casual play, gentle death (revive, or wake at home and lose nothing), soft early enemies, generous economy*. He playtests on his phone and rejects annoyance (loudness, droning loops) and "I could never reach it" instantly.

## 8. How to develop and VERIFY (the workflow that worked)

### 8.1 Dev harness (`src/dev/harness.ts`, DEV only)

`__solo(loot?)` boots a solo world; `__step(n)` advances n frames **synchronously** (no real-time waiting; works in a hidden
tab); `__key('h')` fires a key (every letter, arrows, `/`); `__farm` = `{ scene, sim, me, give, xp, unlockAll… }`;
`__shot(x,y,w,h,zoom)` returns the **real canvas** as a PNG data URL; `__gallery(keys,{zoom,cols,bg})` lays textures out
on a meadow for looking at art; `__day()` pins midday; `__errs` collects errors; `?profile=nat1` fresh island,
`?profile=art1` showcase base, `?profile=anything` a separate save.

Gotchas: `__farm.me` is the *client copy* of the player — stage state on `__farm.sim.s.players[__farm.me.id]`. A freshly
loaded solo world has you "down" for a few seconds: step before opening screens. The solo save persists between
reloads (use a fresh `?profile=` to see first-run behaviour). In solo, windows pause the sim.

### 8.2 Looking at the game

Playwright MCP is available. Pattern:

1. Navigate to `http://localhost:8080/?profile=x`, wait for the dev server (Vite reloads on every edit).
2. `browser_evaluate` an async function that calls `__solo()`, stages state, `__step`s, and `return`s `await __shot(...)`.
3. Pass a `filename` to `browser_evaluate` so the (huge) result is saved to disk instead of flooding the context; then decode the data URL with a tiny node script (`data:image/png;base64,` regex → write a PNG) and open it with the Read tool to *look at it*.
4. For DOM inputs (search boxes) use `browser_take_screenshot`; the page screenshot is enormous (≈9000 px) with the game in a corner, so crop it with PIL (`ImageChops.difference` against the corner pixel → bbox) and downscale before reading.
5. For art, put textures in `__gallery` at zoom 4–6 and look at them before moving on. Fix what is ugly *now*; the cost of fixing later is high.
6. To check responsive/phone layouts use `resize_window`.

**Always take a screenshot and look at it**; two of this session's biggest bugs (roofs that never faded: the client's world mirror ignored the roof layer; a respawn button hidden under a banner) were invisible to the type-checker and the tests and obvious in one screenshot.

### 8.3 Tests

`npm test` = `tsx --test tests/*.test.ts` (187 tests, ~1 minute). Layers:
unit (`sim`, `combat`, `creatures`, `quests`, `housing`, `listed`, `guide`, …), content consistency (every item has an icon and a source, every objective has a hint, guide text matches recipes), **bots** (`botlib.ts`, `bot.test.ts`, `bot.late.test.ts`: a scripted player plays all 13 chapters with real commands — this found many integration bugs), `netsync`, `persist`, `perf`, `server.e2e`, hostile-input fuzz (`hostile()` guards on every inbound command).

`npm run check` must be green before anything ships. `tsc -p server` type-checks `shared/` **and `tests/`** *without DOM types* → shared code and tests must not touch `window`, `localStorage` or `KeyboardEvent`; put DOM-dependent glue in `client/` and inject it (this bit us with the hints module: logic in `shared/data/hints.ts`, `localStorage` injected by `client/ui/hints.ts`).

### 8.4 Process lessons (how to work with this owner)

- The owner works from his **phone**, sends feature requests in bursts, and reads results as screenshots/artifact. He said repeatedly: *"don't stop, keep working"*, *"blow my mind"*. Work autonomously in coherent stages; make each stage visibly better; report in plain, short language, not jargon.
- He plays on the **live world with friends** — never join it with test clients (each id permanently takes one of the 8 slots), never kill his other node processes, never overwrite `worlds/`.
- Ship pattern per batch: implement → tests → `npm run check` → commit (message ends with the harness co-author line; no model identifiers elsewhere) → `build:single` + republish artifact → stage server build → validate against a copy of the live save → `apply-update.ps1` when nobody is online.
- **Patch scripts:** multi-line edits through shell heredocs repeatedly corrupted `\n`/`\\n`/backslashes. What works: write the script with the Write tool into the project dir, run it with node, delete it (and make sure it is not committed — one slipped into a commit once). Never rely on `/tmp` (it resolves to `C:\tmp` for node on this machine). Prefer the Edit tool for single replacements. Avoid regexes with backslashes in heredocs; match with `includes()`.
- Working-copy files may have CRLF endings — normalise when patching with other tools.
- When the user reports a bug in a *system* ("my friend's campfire quest doesn't tick") read the **live save** (`worlds/farm.json`) to see the real state before theorising: it exposed an unclaimed chapter + an unreachable objective in minutes.

## 9. Multiplayer, saves and live operations (rules that protect real players)

- **The simulation is the only authority.** World changes = a `Cmd` in `shared/sim/types.ts`, validated and applied in `Sim.command`, then `send()` from the client. Never mutate shared state from a Phaser scene. Movement is client-authoritative with sanity checks (`cmdMove`; bump `warp` to snap a client back).
- State is **plain JSON** (`WorldState`); changed entities are marked with `touch()/add()/remove()` so `SimHost` streams them (only entities near each player: area of interest; per-key player deltas, your own record whole).
- Feedback goes through `SimEvent`s (`fx`, `float`, `banner`, `toast`…). Set `to` for a single player.
- **Bump `PROTOCOL`** (`shared/net/protocol.ts`) on any wire change; old pages are refused politely. **Bump `STATE_VERSION` + write a step in `sim/migrate.ts`** for any save-shape change (`v4 → v5` grew the map 17→35 plots and shifted every coordinate; `tests/migrate.test.ts` shows how to hand-build an old save). Both the server and the solo build load through `new Sim(state)`, which migrates.
- Any state you add must be optional/defaulted so old saves still load; per-player counters live in `p.cnt`.
- **Keep two views of occupancy in step:** `Sim.occupy/vacate` (server rules) and `GameScene.occupy/vacate` (client mirror used for walking and for roof fading). Forgetting the client side was a real bug (roofs never faded).
- Live update procedure: see `reference_awesome_farm_hosting.md` in memory (stage into `awesome-farm-host\staged`, validate against a copy of `worlds\farm.json` with `new Sim(state)` + 2 simulated minutes, run `apply-update.ps1`, `rollback-update.ps1 -Stamp` if needed, tunnel keeps its link). Everyone must reload after a PROTOCOL bump.
- Night difficulty is by **level / party average**, never by day number (a level-4 player met day-64 monsters once). Wild creatures are rare on purpose (`TUNING.wild*`).

## 10. Design decisions worth reusing in any game

- **Data-driven content**: items, recipes, buildings, quests, guide topics, hints, side quests are tables; the sim and the client both read them; a content test checks every row. Adding content = adding a row + (maybe) art.
- **Teach in the game**, not in a README: every quest objective has a `how` that shows on hover; a guide (H) with numbered steps and tips whose text is *tested against the real recipes*; first-time hints that fire once, never while a window is open, never more than one per 25 s.
- **Don't overwhelm new players**: list only what is unlocked (stations, build categories) but keep padlocks on locked items inside a visible category so progress is legible; search spans everything.
- **Casual-first difficulty**: gentle death (nothing lost), early enemies soft, rubber-band where needed, generous economy; the player may *choose* to wait for a friend or respawn instantly.
- **Hotbar + pins** beat inventory digging: eight slots, mouse wheel, right-click to pin.
- **Equipment must be visible** on the character, in the world and in the doll.

## 11. Known gaps and ideas (see also `DESIGN.md` → "Ideas not built yet")

- Human playtesting is the real gap: bosses/expeditions/hunt tuning were only probed by simple bots.
- Not yet checked visually in a clean profile: dock, hatchery, waystone, device, riftend and boons screens (they use the same primitives; look for dark leftovers); the new guide topics at small sizes; touch controls for newer hotkeys (guide, respawn); `Logistics`/`Power` icons in the Build menu are the same generic glyph.
- Ideas: creature evolution; New Game+ after the Old Heart; weekly/daily rift events; more rift tiers; wiring `awesome_farm` into the repo's root `build.js`/Cloudflare Pages deploy (it is **not** wired yet, and the root `npm run check` does not cover it).
- Cheap wins: a "how to play" topic per new system when it ships (add to `data/guide.ts`, the test keeps it honest); more first-time hints; a visual pass on `Title` screen at 3×.

## 12. Quick reference — "where do I change X?"

| I want to… | Edit |
|---|---|
| add an item / recipe / building | `data/items.ts`, `data/recipes.ts`, `data/buildings.ts` + an icon (`art/icons.ts`) or painted sprite (`art/storybook-*.ts`) |
| add a quest or side quest | `data/quests.ts` / `data/sidequests.ts` (every step needs a `how`) |
| add a guide page or hint | `data/guide.ts` / `data/hints.ts` |
| add a command | `shared/sim/types.ts` (`Cmd`) → `Sim.command` → client `send()`; bump PROTOCOL |
| add a juice-rule action | `shared/actions.ts` + `FX` table + a sound |
| add a screen | `client/ui/screens/<name>.ts` implementing `Screen`, register in `Hud.ts` (`SCREENS`), key in the `hot` map |
| change tuning | `shared/config.ts` (`TUNING`, `NET`) |
| change the look | `art/paint.ts` ramps, `shared/palette.ts` (then `npm run palette`), `ui/theme.ts` |
| change render density | `SS` in `client/res.ts` (everything else follows) |
