# Graftwork cleanup and optimisation plan

Baseline: main at `1449c24d` (installable app and offline copy). Every phase must keep the game's behaviour, visuals, saves and RNG streams identical unless this file says otherwise.

## What the audit found (measured on the baseline)

- Size: 134 source files, about 2.6 MB of JS under `graftwork/`, 75 test files (0.93 MB), 16 tools.
- Function-level junk is small: 18 unused exports, 18 never-referenced local functions (8 of them old background painters in `art/backgrounds.js`), 137 `export` keywords on names used only in their own file, 65 names that only tests keep alive.
- The real junk is stacked fallbacks from superseded systems:
  - Ward rooms: modular kit (all 20 room types) on top of tall paintings on top of low-wall paintings on top of procedural blocks. Paintings are still shown as building-card illustrations; as a room renderer they are only reachable when the kit fails.
  - Map walking: puppet walk (default for every actor) on top of painted 4-frame walks on top of the `_b` step swap on top of the procedural hop.
- Downloads nobody sees: opening the Ward preloads every painted room (about 1.47 MB tall + 0.68 MB low at @2x), every `_b` step frame (0.24 MB) and every painted walk frame (0.30 MB): about 2.7 MB next to the 2.2 MB that is drawn (kit + standing actors).
- Duplicated helpers: `clamp` x9, `TAU` x9, `hash` x9, `rr` x7, `lerp` x6, `rnd` x6. Settings defaults live in three files.
- Docs: `CLAUDE.md` is 37 KB of accreted history; `design/` holds 0.5 MB including five perf JSON dumps.

## Phases (each merged on its own, tests green, golden master compared)

Order: safety net, performance fixes and rules fixes in parallel; then the Classic retirement and "one path per job"; then the dead-code sweep (it also collects what the retirements leave behind); then consolidation, tests and tools, docs.

0. **Safety net.** `tools/graftwork_golden.mjs` (engine traces, headless draw-call hashes, resume-from-old-save traces, optional browser pixel captures; `--root` to run against any checkout) and `tools/graftwork_hygiene.mjs` + `tests/graftwork_hygiene.test.mjs` (unreachable files, unused exports, never-referenced locals, orphan assets, duplicate helpers, em dashes) with an explicit allowlist.
1. **Dead code.** Remove everything the hygiene tool proves dead; drop `export` where nothing imports; delete tests that only test deleted code. Golden master must be byte-identical.
2. **One path per job, load only what is drawn.** Ward rooms: kit, else procedural block; paintings stay only as card illustrations (lazy, on demand). Map walking: puppet, else procedural hop; painted walk frames and `_b` frames leave the runtime and the repo (battle `atk / hit / die` frames stay). No preload-all. Measure Ward-ready bytes and offline copy size before and after.
3. **Consolidate.** One shared helper module, one source of truth for settings defaults, leftovers from the review.
4. **Docs.** Rewrite `graftwork/CLAUDE.md` to the current truth, prune `design/`, final numbers in this file.

## Performance and bug fixes found by the reviews (visible changes, listed on purpose)

These are not behaviour-preserving, so they ship as their own step with tests and before/after numbers:

- Procedural enemies (the 43 enemies without sprites, all of Acts 2 and 3) are colour graded with a canvas filter applied to every draw call: an Act 2 fight tick measured 2162 ms against 41.6 ms without it. The grade is baked instead. Same look within rounding.
- The Ward draws the full animated combat backdrop under panels that cover it (25 of 39 ms per tick). It becomes one cached blit; the 8 to 12 px gutters show a still backdrop.
- Two quality controllers fight: `post.js autoQuality` reads the 30 fps idle cap as a slow device and switches bloom, grade and vignette off after about 11 s on the title. One controller remains (`ui/quality.js`); the post tier follows the Effects setting while the tier is full.
- `V.born` in `ui/ward_iso.js` keeps a screen-clock stamp across Ward visits, so a monster can be invisible after returning from a fight. Cleared on enter (same class as the room stamp bug fixed earlier).
- `ui/templates.js` requests `assets/ui/manifest.json` on every page load and gets a 404. No request until template art exists.
- Rules bugs (cards whose text the engine does not implement: "Cut the Line", Slip Knot, Granny Knot, Odile's declare passive, The Grafter's stale card list, five resonance texts, Free Sample and max HP prices) are a separate step after the cleanup, each with a regression test and a balance re-check.

## Owner decisions (approved: do all of it)

- **Screens under a modal freeze.** While Pause, Settings, the Codex, the Archive, the Wardrobe or the deck view is on top, the screen below neither updates nor redraws: it is drawn once into a snapshot and blitted. Pause now really pauses (enemy turns used to keep playing behind it).
- **The Classic map is retired.** Every run is a Ward run. The hero-select mode switch, `ui/map.js`, map generation and the map-only tests and tools go. A Classic run found in a save is closed as abandoned with its progress counted, and the title says so once. Its own PR, so it can be reverted alone.
- **The 12 junk cards nothing can add are removed** (they only showed in the Codex). Saves that mention an unknown card id must keep loading.
- **The room lab page (`lab/rooms.html`) is removed.** The animation lab stays.
- **The rules bugs are fixed** (see the list above), each with a regression test and a balance re-check.

## Rules for everyone working on this

- Never rename save keys, ids, or the folder. A Ward run saved before the cleanup must resume after it (to the same outcome, except where a listed rules fix changes a card it holds).
- No behaviour change hides inside a cleanup commit: if a phase changes what a player sees, it is listed here first.
- After any change under `graftwork/` run `node tools/graftwork_sw_build.mjs`; run only Graftwork suites (`node tests/run_graftwork.mjs`), never `npm run check`.
- No em dashes anywhere.

## Results

(filled in per phase)

### Performance and bug fixes

Method: real Chromium (Playwright, headless), 1000 x 462 at DPR 2 (canvas 1643 x 924), Graphics High, Effects off, service worker blocked; `app.stop()`, then `app.tick(1/60)` plus a 1 px `getImageData` flush, timed per tick, median of 40 ticks (24 under throttle; 8 and 4 for the old filtered fight), best of 2 or 3 runs each. Before = `7695b8cf`. The sandbox has no GPU and shares its cores, so read ratios, not milliseconds. Pixel comparisons: same seed, seeded `Math.random`, frozen clock, reduced motion, the same tick captured from both builds; before against before is 0 pixels.

| | before | after | |
|---|---|---|---|
| Act 2 fight tick (jarhead, haggler, rust_hound), 1x CPU | 2219 ms | 36.7 ms | 60x |
| same, 4x CPU throttle | 10021 ms | 195 ms | 51x |
| Act 1 fight tick (painted enemies, control), 1x | 28.8 ms | 29.8 ms | unchanged |
| Ward tick (fresh Ward), 1x | 48.0 ms | 30.1 ms | 1.6x |
| same, 4x | 226.5 ms | 124.5 ms | 1.8x |
| failed requests per page load | 1 (404 `assets/ui/manifest.json`) | 0 | |
| `matchMedia` calls per frame, title / Settings open | 3 / 9 | 0 / 0 | |
| full-size (512 px) texture copies after opening a Ward | 12 (12 MB) | 0 | |

- **Baked grade (procedural enemies and the fallback hero).** `art/grade.js`; no context is given a filter any more (grep: no `ctx.filter` left under `graftwork/`). Pixel difference before against after, per colour channel on a 0 to 255 scale: Act 2 fight, mean 0.095 over the frame (0.83 over the 11.5 percent of pixels that differ at all), max 7, 0.36 percent of pixels off by more than 2; Act 3 boss (The Impresario), mean 0.033 (0.80 over the 4.1 percent that differ), max 7, 0.16 percent off by more than 2. Also checked: The Grafter mean 0.032 max 5, The Broker 0.032 max 6, an Act 3 trio 0.091 max 5, the hit flash with wounds, poison, burn and Vulnerable 0.083 max 7. Opaque body pixels are identical; what differs is where the old filter worked on low alpha (the Strength glow, hatching, edges: it had to unpremultiply 8 bit pixels) and a few antialiased edge pixels. Graphics Low (minimal tier: no grade, as before): 0 pixels differ. Two things a player could notice in principle: browsers without canvas filter support (the grade was skipped there) now show the same graded figures as Chrome; and the fallback hero, drawn only while its sprite is missing, differs more on its wet glints (mean 0.10, max 23, about 60 pixels), because they are added inside its scratch canvas and the old filter graded the sum.
- **Ward backdrop.** One baked layer, one blit. The map, the cards and the buttons are pixel identical; the gutters and the 8 percent that shows through the side panels now hold a still frame of the backdrop (gutter columns of an Act 1 and an Act 2 Ward: mean 0.74 and 0.58, max 27 and 32 where a light shaft used to sway).
- **One quality controller.** Measured in real Chromium with WebGL (SwiftShader), 20 s of 33.3 ms frames on the idle title: before, Effects High fell to Low within 5 s and stayed there, Effects Low switched the post off and removed the GL canvas; after, High stays High and Low stays Low. (The plan said "off after about 11 s". The second drop never came from High because the old ring was not cleared on a reset and read about 0 ms afterwards.)
- **`V.born`.** Reproduced by test on the old code (a monster that checked in at 95 s was drawn with alpha 0 on the first frame after returning, and a walked monster's squash was NaN). Cleared on enter; a stamp ahead of the clock counts as finished.
- **Templates.** `TEMPLATE_ART = false` in `ui/templates.js`: nothing is requested until `assets/ui/manifest.json` lands (`design/ART_MODULAR.md` section 5).
- **Small ones.** Mip level 0 is the decoded image; `unlockState` once per visit on the title and in the Archive (it ran every frame; the review measured about 0.13 ms a call); display-mode queries once per window; the wall plan is kept until a room changes. Their effect on tick time is inside this harness's noise (title 29 to 34 ms, Settings 37 to 42 ms either way), so they are proven by call counts in `tests/graftwork_perf3.test.mjs`. Not done as proposed: the App row of Settings is still asked every frame instead of once on enter, because the browser's install offer can arrive and Install can be pressed while Settings is open; the cost behind it is gone either way.
- Tests: `tests/graftwork_grade.test.mjs` (colour maths against the CSS filter definitions, 63 enemies and 3 heroes graded against ungraded, a real Chromium fill) and `tests/graftwork_perf3.test.mjs` (one check per fix); each was run against the old code first and failed there. `graftwork_ui_combat_art` asserts that no context of a combat frame is given a filter.

### One path per job, load only what is drawn (phase 2)

Before = `428b6499`. What is left in the game:

- **Ward rooms: the modular kit, else the procedural block.** The painted room renderer is gone from `ui/ward_iso.js` (tall and `_low` paintings, the wall crop, the cross-fade, the dark copy, the dense-floor rule). A room is its block until the images of ITS recipe have settled (`KR.recipeFor`, one recipe at a time), the kit from then on.
- **Map walking: the puppet (`ui/puppet.js`), else the hop.** The painted 4-frame cycle, the `_b` step swap, `PUPPET_PREF` and `wantsPuppet` are gone. The title scene's monsters are drawn by the Ward's own `gait` and `drawActor`.
- **Loading: nothing ahead.** `assets.preload`, `assets.progress`, `kitPreload`, `kitSettled`, `kitProgress` and the whole-kit gate (`kitUsable`, `V.kitOK`) are gone. A screen asks for what it draws; the art of the plans in hand is asked for when the Ward opens and when the hand changes; a room plan picked up, or an Expand plan held over a room, asks for the kit pieces of its ghost.
- **Pipeline.** `tools/graftwork_art_build.py --prune` (new) brought `assets/ward` to what is drawn: 39 room entries, 2 card entries and 45 fields out of the manifest, 158 files deleted. The `--low` pass and all walk and step handling are gone from the script; `--frames` builds battle frames only. The manifest now names exactly the files on disk (tested).
- **Lab.** `lab/rooms.html` and `lab/rooms.js` are deleted; the animation lab offers the game's two walks and Compare is puppet versus hop.

What a player can see (listed on purpose):

1. While the kit pieces of a room download, the room is a procedural block. It used to be a block and then its painting, until the WHOLE kit was in. With a warm cache this is a frame or two.
2. The title monsters walk with the puppet (the hop when a sprite cannot be cut) instead of swapping two images; the Night Nurse, which had no step image and glided, walks too. At rest they idle like Ward monsters (a breath of 2 percent instead of 1.6). With reduced motion the title is pixel identical.
3. An illustration that is not in hand (the Plans list, a plan offered as a reward or in the Dispensary) is asked for when it is first drawn, so it shows its engraved glyph until it has arrived. It used to be warm, because opening the Ward downloaded every room painting.
4. "Stitching rooms" shows only while a built room waits for its kit pieces (it used to count every room painting and actor in the manifest).
5. When the image size changes (a lower quality tier, a resize), kit rooms keep the size already decoded until the other one is in. By the old code path every kit room dropped to its block meanwhile (read from the code, not captured).

Kept on purpose, and one thing found on the way:

- `plot_empty` (risk R1) is still the painted plot tile on buildable cells: the morning looks the same. It is the only entry left under `rooms` in the manifest.
- The see-through block: a block in front of a focus room is drawn at alpha 0.55. The review listed this fade with the painted code, but it is what the block path itself does (a block has no walls to lower), and the headless golden hashes depend on it.
- Kit images are exempt from the loader's eviction (the whole kit is 25 MB decoded at @2x, 31 MB with both sizes). That, and item 5, is what makes "a room that has shown the kit never goes back to its block" true by construction.
- Growth: the two-cell Ward needs one prop its one-cell plan does not (`screen`); every other big plan uses the pieces of the small one. Loading by recipe would have dropped a Ward that grows back to a block while that one file loads. A kit room whose plan changes is therefore drawn with the new plan at once and the missing piece is added when it arrives (`KR.recipeHeld`, tested).

Golden master (`tools/graftwork_golden.mjs`, reference recorded from `428b6499` with the same tool, both continuing the payloads of the phase 0 baseline): 33,681 keys identical, 112 differ, all in the `assets` section.

- engine, resume, every headless `ui` scene (the Ward and title scenes included: the procedural path is untouched): identical.
- `assets` combat_art, combat_art_boss, combat_art_kill, shop_ward: identical.
- `assets` ward_kit_built and ward_kit_night (4 variants each): the draw-call hashes are identical, cold and warm; only what was asked of the network differs (desktop @2x: 214 files / 5.29 MB to 76 / 1.54 MB and 217 / 5.32 MB to 79 / 1.58 MB; phone @1x: 1.68 MB to 0.48 MB).
- `assets` ward_kit_morning: the warm pass is identical; the cold pass differs on ONE frame (631 calls): the script opens the Plans list, and the six room illustrations of the draw pile show their glyph on the frame they are first asked for (item 3). Network: 210 files / 5.12 MB to 63 / 1.79 MB.
- `assets` title_kit: every variant differs, as intended (item 2). With motion: the walk, and three fewer files (the `_b` images of the three monsters). With reduced motion the pixels are the same and the call stream is not: per monster a save and restore, one `getTransform` (the puppet asks for the device scale) and the Ward's own shadow sprite instead of the title's identical copy.

Real Chromium (Playwright, headless, service worker blocked, Graphics High, Effects off, cold cache; "title until idle, then a fresh Ward, seed `bench`, until idle"; bytes are file sizes as served):

| | before | after |
|---|---|---|
| title, 1280 x 720: requests / bytes | 176 / 3,568,815 | 173 / 3,506,337 |
| opening the Ward, 1280 x 720: requests / bytes | 167 / 4,120,230 | 34 / 808,788 |
| title, 1000 x 462 at DPR 2 | 173 / 3,525,515 | 173 / 3,506,337 |
| opening the Ward, 1000 x 462 at DPR 2 | 170 / 4,163,530 | 34 / 808,788 |
| decoded images once the Ward is open (`assets.decodedBytes`, both sizes) | 87.9 MB in 210 images | 26.0 MB in 74 images |
| Slow 4G, CPU 4x, 1000 x 462 at DPR 2: first room drawn from the kit after opening the Ward (4 runs each) | 21.8 to 22.1 s | 0.7 to 1.2 s |
| same: every room drawn from the kit | 21.8 to 22.1 s | 5.2 to 5.7 s |
| same: everything the Ward asked for has arrived | 22.5 s | 5.2 to 5.7 s |

Of the 167 requests the old Ward made: 39 room paintings (2.17 MB, 19 of them `_low`), 21 standing actors, 13 `_b` and 28 walk frames (0.79 MB together) and 55 kit files (1.03 MB) on top of the 34 the title had loaded. The new Ward asks for 20 kit files (0.44 MB), 8 icons, the plot tile and 5 card illustrations (3 of them room paintings, 0.24 MB). Slow 4G is the preset of `tools/graftwork_profile.mjs` (1.6 Mbit/s down, 150 ms). The first room turns at once because the title scene had already loaded the Ward recipe; the floor banner covers the map for the first 2.6 s. The sandbox was shared with other jobs while these ran: the request counts and bytes are exact, the seconds are network bound (4.16 MB against 0.81 MB at 200 KB/s) and repeat within 0.5 s.

Pixels (the method of `tools/graftwork_golden.mjs --browser`: frozen clock, seeded `Math.random`, reduced motion, each state set up twice so the picture does not depend on the network; screenshots in `/tmp/claude-0/shots/onepath/`): title, a fresh Ward with its hand of room plans, a selected room plan with its ghost, a 10 room Ward in the morning and at night, two-cell rooms (Generator 2 x 1, Ward 1 x 2), each at 1280 x 720 and at 1000 x 462 DPR 2. Before against after: 0 pixels differ in all 12. With motion on, read from the real page: the four title monsters and the Ward hero have a puppet pose on every walking frame, no page error.

Sizes:

| | before | after | |
|---|---|---|---|
| files under `graftwork/assets` | 526 | 368 | 158 fewer |
| bytes under `graftwork/assets` | 9,034,506 | 6,434,660 | 2,599,846 fewer (29 percent) |
| offline copy (`sw-manifest.json`): files / bytes | 663 / 11,594,262 | 505 / 8,991,106 | 2,603,156 bytes fewer (22 percent) |
| `graftwork/**/*.js` and `.html`: lines | | | 930 removed, 229 added |
| the six game files touched (`ward_iso`, `assets`, `ward_kit_iso`, `ward`, `title_scene`, `gaits`) | 229,764 bytes | 226,454 bytes | 3,310 fewer |

The 158 files: 38 `_low` room paintings (928,186 bytes), 18 tall paintings no card shows (856,056), 64 walk frames (430,058), 38 `_b` step frames (371,646; six of them, the heroes', were in no manifest). The lab page was 54,545 bytes of source outside the offline copy.

Tests: `tests/graftwork_ward_loading.test.mjs` (new: the exact set a fresh Ward asks for, one request per thing drawn later, no flicker under eviction, a size change, a neighbour loading and a room that grows, the indicator; it fails on `428b6499`), the monsters block of `graftwork_ui_title` (puppet or hop on every walking frame, read from the scene), `graftwork_art_assets` (manifest = disk, the prune pass on a synthetic folder), `graftwork_kit_assets` (the kit checks of the deleted lab test), rewritten parts of `ui_ward`, `ui_ward_kit`, `anim_frames`, `puppet`, `lab_anim`, `hygiene`. Hygiene: 0 orphan assets, 0 missing files, 0 new findings; 35 allowlist entries pruned. `node tests/run_graftwork.mjs`: 74 of 74 suites pass.
