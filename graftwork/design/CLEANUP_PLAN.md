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

## Classic retirement: what changes for the player

Inventory made before deleting anything (grep over `graftwork/`, `tests/graftwork*`, `tools/graftwork*` for `classic`, `ward`, `run.mode`, `DEFAULT_MODE`, phase `map`, map nodes, floors and days). Every hit is in one of three groups.

### What the player loses or sees differently

1. **Hero select has no mode switch.** `Classic map | The Ward (new)` is gone; every new run is a Ward run. A stored `meta.settings.mode` is ignored and left in the save untouched.
2. **Daily Run is always a Ward run** with the daily seed, hero and modifier. The `WARD` / `CLASSIC` tag on the Daily slab and on Today's Case, and the `Mode:` line of the Daily tooltip, are gone. A player who had Classic selected gets the same case in the Ward.
3. **The map screen is gone**: the chart of nodes, its act banner, legend, node tooltips, and the two first-time tips only that screen showed (`mapnodes`, `resonance`). Both tips are retired, not converted: the Ward never showed them, so a Ward player sees no difference. `meta.tips.mapnodes` and `meta.tips.resonance` stay in old saves, unread. The resonance rule itself is still on the graft table, in the deck view and in the Codex.
4. **A saved Classic run cannot be continued.** A run save with no `mode` (from before the Ward) or any mode but `ward` is closed on load exactly as the Abandon button closes a run: history entry (dead), deaths and lifetime stats, Codex sightings, case-file Credit, boss practice decks, Unlock Points and achievements (`recordRunEnd` with `run.abandoned`). The run save is deleted and the title shows one notice until it is dismissed: "The old map has been retired. Your run on it was closed and its progress counted." A Classic Daily in progress is closed the same way. Practice fights never had a map: an old practice save still resumes.
5. **Endless after a win now works in the Ward.** The end screen sent every Endless run to the map screen; for a Ward run that screen had no map and drew nothing (checked headless on the baseline: phase `map`, `run.map` null). Endless now opens the next loop on a fresh Ward floor, which `startLoop` already built. A Ward save stuck in that state (mode `ward`, phase `map`) resumes on its floor.
6. **Boss practice keeps working, its fixed shuffle changes once.** A practice run was a Classic run with the fight forced; the map generator drew from the seeded rng before the fight. It is now a bare run (no map, no floor), so the same boss and deck open with a different, again fixed, draw order.
7. **Codex rules page**: "In Ward mode each floor is a hospital you build" becomes "Each floor is a hospital you build" (there is no other mode).
8. **Ascension 1 has no rule in the Ward.** "One extra elite on every map." only ever acted in map generation; in the Ward it did nothing before this change and does nothing after it. The line is left as it is: giving Ascension 1 a Ward rule changes Ward balance and is an owner decision, not part of this cleanup.

Nothing else is lost: no achievement, relic, perk, event or Daily modifier was map only.

- Achievements: all 59 stay, ids and checks untouched, earned ones stay earned. The ones that read like the map all work in the Ward: `premature` ("first 3 floors": `stats.floors` counts every room that opened something), `against_advice` (abandon before the first fight), `relapse` and `chronic` (Endless, see 5).
- Relic perks: every `perk` name in the data is read by shared or Ward code. The 18 Ward relics and the 11 Ward events (`ward: true`) were kept out of Classic runs by a mode check; the check goes, the flag stays as data (the bots read it).
- Stats: `meta.stats`, `meta.history`, `meta.daily.best`, `fastestWinFloors` keep their shape and meaning ("floors" = rooms that opened something, as the Ward has counted them since it shipped).

### (a) Classic only: deleted

- `ui/map.js` (543 lines) and its registration, import and `phase === 'map'` routing in `main.js`; the `map` entry of `IN_RUN` in `ui/pause.js`.
- `engine/run.js`: `genMap`, `availableNodes`, `enterNode`, `ACT_ROWS`, `COLS`, `runMode`, `startEvent` (the uniform event draw; the Ward draws with `wardStartEvent`), the Classic halves of `startAct`, `advance`, `afterEvent`, `startLoop`, and `opts.mode`.
- `ui/ward_kit.js`: `DEFAULT_MODE`, `modeOf`, `drawModeSwitch` (layout id `title-mode`). `ui/title.js`: the switch, `goalText(mode)`, the Daily mode tag and tooltip line.
- `ui/end.js`: the Classic Endless branch (`run.phase = 'map'`).
- `ui/tutorial.js`: `TIP_TEXTS.resonance` (the `mapnodes` text lived in the map screen).
- `art/backgrounds.js`: themes `map1` `map2` `map3` (`mapStatic`, `mapDyn`, `MAPTINT`, their ambient entries). `art/icons.js`: `drawMapPath`, and the node styles `final`, `normal`, `start`, `treasure`, `mystery` (the Ward draws fight, elite, event, shop, forge, rest, boss). Proof for each: one grep over `graftwork/`, `tests/`, `tools/` finds the name only at its definition and in tests of the map.
- Tests: `tests/graftwork_ui_map.test.mjs`, the map blocks of the layout sweeps, touch, perf, pause, transitions, quality and art suites, the "classic untouched" blocks of the Ward suites, the mode switch and Classic Daily tests.
- Tools: the Classic run drivers (`playRun`, `chooseNode`, `lowRun`) and `GW_MODE`. No whole tool was map only, see "Tools" below.

### (b) Shared code with two branches: collapsed to the Ward branch

- `engine/run.js`: `newRun` (always `mode: 'ward'`, set at the same place so a new save is byte identical to an old Ward save), `startAct` (always `wardInit`), `fightRewards` (always `wardRewards`), `makeShop` (always the Dispensary's plans), `shopBuy` (`build`, `buildRemove`), `relicPool` (Ward relics always in the pool), `afterEvent` and `advance` (always back to the walk), `startLoop`.
- `main.js`: `PHASE_SCREEN` without `map`, the walk interlude without the mode check, the music table without the map row.
- `ui/ward.js` `wardInterlude`, `ui/event.js` (room and hour heading), `ui/end.js` (death line: day of the floor; the floor line stays for practice fights, which have no floor), `ui/title.js` (Continue line, Daily, Begin).
- `engine/save.js` + `engine/meta.js`: loading a run decides between resume (Ward, practice) and retirement (everything else).

### (c) Looks Classic, the Ward uses it: kept

- Rewards, graft offers, shop, forge, events, `R` helpers, `queueFight`, `queueGraftPick`: the Ward opens the same screens through the same engine calls.
- Acts as floors (`run.act`, `startAct`, act themes and music), the boss flow, the Grafter (`startFight(run, 'final')`), ascension rules 2 to 10, Daily modifiers, boss practice, Endless.
- `makeEncounter` whole: the Ward uses the boss and final branches; the normal branch is the combat screen's fallback when a fight has no enemy list.
- `run.row`, `run.node`, `run.map`: always `-1`, `null`, `null` in a Ward run. They stay in the save so the Ward save shape does not change, and the shop greeting is seeded from them.
- `run.mode = 'ward'` stays in every save: it is what tells a Ward save from a retired one.
- `stats.floors` and "Floors climbed" on the end screen, `UP.PER_FLOOR`: Ward trigger rooms count as floors.
- `drawNodeIcon` (the Ward's trigger seals), the `mapStep` sound (the Ward's footstep), "Continue to the map" on the reward and Forge buttons (the Ward is the hospital map; the label and so the picture of those screens do not change).

### Saves

- Ward saves: shape, field order, rng use and the order of every random draw are unchanged. Proof: `tests/fixtures/graftwork_wardsave_5f3e252.json` (28 saves recorded on the baseline at every kind of moment, each with the end it reaches) is resumed by `tests/graftwork_regression.test.mjs`, and the Ward balance table and per-run trace hashes are identical before and after (Results).
- Retired saves: `tests/fixtures/graftwork_oldsave_0675399.json` (20 Classic saves from before the Ward) is now the fixture for the retirement: each save is closed, counted and deleted.
- No save key, id or folder is renamed. `graftwork_meta_v1` gains one optional field, `notice` (`'classic_retired'` until the notice is dismissed).

### Tests

Suites that used a Classic run as the vehicle now start a Ward run and reach the screen through the Ward (`wardOpen(run, kind)` in `tests/graftwork_lib.mjs` lays the room next to the hero and walks in, so `run.pending` is what a real walk makes) or through the engine call the Ward itself uses. Shared helpers live in `tests/graftwork_lib.mjs`: `wardLayout`, `wardOpen`, `botFight`, `botStep`, `botFinish`, `WIN`, `LOSS`, `actEnemies`.

### Tools

One shared driver, `tools/graftwork_driver.mjs`: the fight policies (careful, greedy, none, strong, the slip and low tiers), graft, shop, forge and event choices, the Ward builder and walker policies (strong, careful, sloppy, random, passive, fill) and `playWardRun(hero, seed, policy, asc, opts)`. Every balance tool is a thin command on top of it: `graftwork_sim.mjs` (careful, greedy, none), `graftwork_strong.mjs` (the reference), `graftwork_ward_sim.mjs` (the per-act table), `graftwork_tiers.mjs`, `graftwork_schools.mjs`, `graftwork_audit.mjs`, `graftwork_cardsweep.mjs`, `graftwork_unlocks.mjs`. Dropped: `GW_MODE` (unlock pacing is always the Ward) and `GW_OLDPICK` (`GW_WEIRD_K=1` is the same pick). No tool is deleted: none was map only, each one measures the combat game or a whole run, and a whole run is now a Ward run. `tools/graftwork_golden.mjs` and `tools/graftwork_profile.mjs` belong to other phases and are not edited here (the golden recorder still records Classic runs and map scenes; its owner drops them).

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
