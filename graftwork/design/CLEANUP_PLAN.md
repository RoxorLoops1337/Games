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
- `ui/ward.js` `wardInterlude`, `ui/event.js` (room and hour heading), `ui/end.js` (death line: day of the floor; the floor line stays for practice fights, which have no floor), `ui/title.js` (Continue line, Daily, Begin), `ui/shop.js` (one service row: remove a card, strip a graft, building plans; the two-button row of a shop without plans is gone, every shop is the Dispensary).
- `engine/save.js` + `engine/meta.js`: loading a run decides between resume (Ward, practice) and retirement (everything else).

### (c) Looks Classic, the Ward uses it: kept

- Rewards, graft offers, shop, forge, events, `R` helpers, `queueFight`, `queueGraftPick`: the Ward opens the same screens through the same engine calls.
- Acts as floors (`run.act`, `startAct`, act themes and music), the boss flow, the Grafter (`startFight(run, 'final')`), ascension rules 2 to 10, Daily modifiers, boss practice, Endless.
- `makeEncounter`: the Ward uses the boss and final branches; the normal branch is the combat screen's fallback when a fight has no enemy list. Its "later rows of the map" budget went with the map; what is left is the small-fight budget it always used in a Ward run.
- `run.row`, `run.node`, `run.map`: always `-1`, `null`, `null` in a Ward run. They stay in the save so the Ward save shape does not change; nothing reads them (the shop greeting keeps the seed string they used to give, so the greeting is the same).
- `run.mode = 'ward'` stays in every save: it is what tells a Ward save from a retired one.
- `stats.floors` and "Floors climbed" on the end screen, `UP.PER_FLOOR`: Ward trigger rooms count as floors.
- `drawNodeIcon` (the Ward's trigger seals), the `mapStep` sound (the Ward's footstep), "Continue to the map" on the reward and Forge buttons (the Ward is the hospital map; the label and so the picture of those screens do not change).

### Saves

- Ward saves: shape, field order, rng use and the order of every random draw are unchanged. Proof: `tests/fixtures/graftwork_wardsave_5f3e252.json` (28 saves recorded on the baseline at every kind of moment, each with the end it reaches on the main line without the retirement) is resumed by `tests/graftwork_regression.test.mjs`, and the Ward balance table and per-run trace hashes are identical before and after (Results).
- Retired saves: `tests/fixtures/graftwork_oldsave_0675399.json` (20 Classic saves from before the Ward) is now the fixture for the retirement: each save is closed, counted and deleted.
- No save key, id or folder is renamed. `graftwork_meta_v1` gains one optional field, `notice` (`'classic_retired'` until the notice is dismissed).

### Tests

Suites that used a Classic run as the vehicle now start a Ward run and reach the screen through the Ward (`wardOpen(run, kind)` in `tests/graftwork_lib.mjs` lays the room next to the hero and walks in, so `run.pending` is what a real walk makes) or through the engine call the Ward itself uses. Shared helpers live in `tests/graftwork_lib.mjs`: `wardLayout`, `wardOpen`, `botFight`, `botStep`, `botFinish`, `WIN`, `LOSS`, `actEnemies`. `graftwork_ui_map` is gone; its second half (every event, every choice, through the event screen) is `graftwork_ui_event`. New: `graftwork_retire` (the closing of old saves, the notice, boot and Continue with old Ward saves).

### Tools

One shared driver, `tools/graftwork_driver.mjs`: the fight policies (careful, greedy, none, strong, the slip and low tiers), graft, shop, forge and event choices, the Ward builder and walker policies (strong, careful, sloppy, random, passive, fill) and `playWardRun(hero, seed, policy, asc, opts)`. Every balance tool is a thin command on top of it: `graftwork_sim.mjs` (careful, greedy, none), `graftwork_strong.mjs` (the reference), `graftwork_ward_sim.mjs` (the per-act table), `graftwork_tiers.mjs`, `graftwork_schools.mjs`, `graftwork_audit.mjs`, `graftwork_cardsweep.mjs`, `graftwork_unlocks.mjs`. Dropped: `GW_MODE` (unlock pacing is always the Ward) and `GW_OLDPICK` (`GW_WEIRD_K=1` is the same pick). No tool is deleted: none was map only, each one measures the combat game or a whole run, and a whole run is now a Ward run. `tools/graftwork_golden.mjs` records Ward runs only (bots from the driver, no Classic runs, no map scenes, the closing of each old save under `resume/retired`); its `--classic-rng` flag exists for the one comparison against a record made before the retirement.

### Layout faults the port found (open, not fixed here)

The layout gate (`tests/graftwork_ui_layout.test.mjs`) swept the reward and the shop on Classic runs. On scenes the Ward really makes it found faults that are older than the retirement. They are listed in the test as `OPEN_WARD` (scene, kind and text; anything else still fails, and an entry that stops matching fails the test until it is deleted) and need their own fix, with before and after pictures:

- **Elite reward with a relic, a potion and the building plan row**, at text scale 125 and 150 and on all three phone stages: the plan row runs into the "left behind" notes and the Continue button (224 findings in the sweep: overlaps and text over widgets). At text scale 100 on the desktop it fits.
- **Boss reward with the plan row**: the row's caption "Pick 1 for your building deck, or pass." is cut at text scale 125 and 150 and on the phone stages; on the two small phone stages (0.54, 0.46) the texts of the boss relic cards under the row are cut too.
- **Ward hand on the two small phone stages**: a plan's name is drawn over its cost digits ("Workshop", "Isolation"), and the two lines of the deck counter ("7 draw", "0 used") touch. The Ward's own sweep has no text-over-text check; the layout gate's tooltip sweep of the Ward has.
- **Dispensary on the smallest phone stage (0.46)**: the one-line subtitle of the graft card picker cuts a long boon ("When it extends the Line, ..."), and the relic name "Featherweight" is 2 px too wide for its column in the test's metric.

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
- **Templates.** Nothing is requested until the painted art is switched on (first `TEMPLATE_ART = false`, now the preview switch in `ui/preview.js`; `design/ART_MODULAR.md` section 5).
- **Small ones.** Mip level 0 is the decoded image; `unlockState` once per visit on the title and in the Archive (it ran every frame; the review measured about 0.13 ms a call); display-mode queries once per window; the wall plan is kept until a room changes. Their effect on tick time is inside this harness's noise (title 29 to 34 ms, Settings 37 to 42 ms either way), so they are proven by call counts in `tests/graftwork_perf3.test.mjs`. Not done as proposed: the App row of Settings is still asked every frame instead of once on enter, because the browser's install offer can arrive and Install can be pressed while Settings is open; the cost behind it is gone either way.
- Tests: `tests/graftwork_grade.test.mjs` (colour maths against the CSS filter definitions, 63 enemies and 3 heroes graded against ungraded, a real Chromium fill) and `tests/graftwork_perf3.test.mjs` (one check per fix); each was run against the old code first and failed there. `graftwork_ui_combat_art` asserts that no context of a combat frame is given a filter.

### Rules fixes (branch `cleanup-bugs`)

Every item has a regression test in `tests/graftwork_rules_fixes.test.mjs` that failed on the code before the fix (`RF_ALL=1` lists every failing block instead of stopping at the first). The engine is unchanged for a run that holds none of the cards below, except where a line says otherwise.

What changed for the player, card by card:

- **Snip, Tailor's Shears, Hemostatic Snip ("Cut the Line.")**: the effect did nothing. It now cashes the Line as a cut: same payout, same relic, hero and enemy hooks, same 3 paying cuts a turn, an enemy can still cancel it. Shears and Hemostatic Snip join the Line first (so they read and cash it with themselves in it) and then start the next Line, exactly as a card that cuts by school does. Snip has no school: it leaves the rail empty. A Frayed or Tempered copy stays out of the Line and still cuts it. A replay (Echo, Plays twice) does not cut a second time. The hand badge and the rail chip show the cut and its payout.
- **Scissor Loop, Surgeon's Knot, Surge Loop, Spent Thread ("when it cuts the Line")**: found while fixing the above, never fired. The grafts read the event log from the end, where the cutting card's new Line looked like an extend of 1. They now fire on a cut by school and on a cut by effect, with the length of the Line that was cut. **Reef Knot** gave its Echo through the extend half only; it now gives 1 Echo on every cut.
- **Barbed Knot, Whip Stitch, Running Stitch, Blanket Stitch, Cross Ply, Mattress Stitch, Fine Gilt Thread, Clove Hitch, Tight Seam ("when it extends the Line")**: for the same reason they also fired when their card cut a Line. They now fire when the card ties a knot (extending a Line, or the first knot on an empty rail), not when it cuts.
- **Slip Knot**: "Never cuts the Line (it goes Slack instead)" was never read. A Slip Knot card that would cut by school now goes Slack: the Line stays, the card adds nothing. It still starts and extends Lines.
- **Granny Knot**: "Counts as every school in the Line, adds no count" was never read. On a standing Line the card now always ties a knot, adds no school count, and the next card may follow any school of the Line. On an empty rail it starts a Line as its own schools.
- **Odile**: "Once per turn, a card may be declared Gilded" had no engine and no control. There is now a tab on the Thread rail's top left edge (click or tap, key G, gamepad left trigger, tooltip, listed under Controls). Armed, the next card also counts as Gilded for the Line; the badges and the rail preview follow at once, and it can be taken back until a card is played. It is spent by the card that uses it; a card that is already Gilded, Frayed or Tempered leaves it armed. **Odile's max HP is 88 (was 92)**: see the balance table.
- **The Grafter, Locksmith, Understudy's Shadow, and every Act 3 move that jams, silences or frays a card**: they read a private card and graft list that missed the 20 Thread cards and 51 grafts (Thread and school grafts). The Grafter now gives those grafts their school and weight (its Splice follows your real top school, its Hoard block counts their weight) and may name a Thread card as "Your best card"; Thread cards can be jammed and frayed like any other; the Locksmith seals your real biggest school.
- **School resonance**: six of the 14 texts were wrong, the rule did not change. Ember 3 "Your first Attack each turn applies 2 Burn." (said: Burn deals +1 at turn start). Ember 6 "Every Attack applies 2 Burn." (said 1). Echo 3 "Start each combat with 1 Echo." (same rule, exact wording). Echo 6 "Start each combat with 2 Echo." (said 1). Hoard 6 "Draw 1 extra card every turn." (said: retain 1 card). Gilded 6 "Gain 20 gold after each combat." (said: and Gilt 3). The test measures every number in the engine and rebuilds the text from it.
- **Free Sample**: "The first graft Price you accept each act is waived" now holds for every graft. It used to waive 7 kinds of price: a Price written as "Costs 1 more", "Exhaust", "Ethereal", lower numbers or a play condition was charged in full (27 grafts), and "Lose 4 max HP when grafted" was charged before the waiver was recorded. Eight grafts had part or all of their Price inside a hook: Slow Tumor, Vampire Teeth, Debt Note, Gold Lever, Ash Pact, Fever Wick, Feverish Vein, Fuse Wire. Their prices are separate now, so the waiver reaches them. The graft screen previews the card without the Price and shows a FREE SAMPLE note.
- **Numb** ("Their prices still bite") uses the same price table, so the hook prices of those eight grafts now stay under Numb, as the text says. Before, Numb silenced them with the boon.
- **Ascension 8**: text only. "Shatter chance is 10% higher. No graft rerolls." The reroll lock was always there and the graft screen said so; the ascension list did not.
- **Locked heroes**: the hero file carried an older unlock sentence that disagreed with the real gate and could never show. Removed; the gate table is the only copy.
- **Codex, Junk tab**: 7 cards (was 19). Bruise, Gauze, Splinter, Fever, Scab, Slag, Anaesthetic Fog, Lint, Invoice, Bone Shard, Tourniquet and Waiver are gone: nothing in the game could add them (no card op, graft price, enemy move, status, relic or event; proven by a walk over every registry and by grep, and guarded by a test that fails on any junk card without a source).
- **Saves**: a run save that names a card, graft, relic or potion that no longer exists drops that entry and loads (deck, grafts on cards, relics, potions, shop stock, a pending graft offer, a pending reward). A save without such ids is returned byte for byte. Meta with unknown ids in its seen lists or in a saved practice deck loads and the Codex, Archive and deck view draw. A run in progress keeps its HP; Odile's 88 applies to new runs.

Also removed, no behaviour change (golden engine and resume traces identical apart from two table hashes): the dead engine lines of review 3.1 and the seven empty data modules of review 3.2.

Balance (strong bot, Ward mode, Ascension 0; "all" is the target pool of design/WARD.md: 25 to 40 percent per hero, spread at most 12; seeds are fixed per run index, so each column is the same runs before and after). Win percent for Marrow / Wick / Odile:

| measure | before | after the fixes, no retune | final (Odile 88 HP, final bot) |
|---|---|---|---|
| all pool, N = 60 | 30 / 42 / 48 | 43 / 28 / 45 | 45 / 33 / 42 |
| all pool, N = 300 | 28 / 33 / 38 | 30 / 32 / 39 | 30 / 32 / 36 |
| all pool, N = 500 | 31 / 36 / 37 | 35 / 35 / 40 | 36 / 34 / 38 |
| all pool, N = 1000 | 32 / 33 / 37 | 33 / 32 / 41 | 34 / 32 / 39 |
| start pool, N = 60 | 35 / 38 / 48 | 38 / 43 / 57 | 38 / 45 / 57 |
| start pool, N = 500 | 43 / 45 / 49 | 42 / 47 / 56 | 41 / 47 / 52 |
| random, sloppy, passive wins of 180 (all pool, N = 60) | 0, 0, 1 | 0, 0, 0 | 0, 0, 0 |
| unlock pacing (`GW_MODE=ward`, 200 players, 30 runs): strong median, careful median | 39, 45 | 39, 48 | 39, 49 |
| classic strong bot, N = 40 | 10 / 15 / 28 | 10 / 18 / 45 | 13 / 15 / 33 |

- N = 60 is too small for a 12 point band (one standard deviation is 6 points): it was outside the band before any change. The verdict is read at N = 1000: 34 / 32 / 39, spread 7, inside 25 to 40.
- The fixes moved one hero: Odile, from 37 to 41 in the all pool. Her declaration alone is worth about 6 points (36 with it switched off, `GW_DECLARE=0`, 41 with it); the other fixes together are within two points for every hero (Marrow 32 to 34, Wick 33 to 32, Odile without her declaration 37 to 36). The retune is one number: **Odile's max HP 92 to 88** (`data/heroes.js`). Measured on Odile alone at N = 1000: 92 HP 41.3, 90 HP 40.8, 88 HP 38.5; starting gold 130 to 115 only reached 40.5. Nothing global was touched. She is still the hero with the most HP (Marrow 82, Wick 76) and sits near the top of the band.
- The start pool is not a target (WARD.md). Odile rose there too (49 to 52 with the retune, 56 without).
- The bot (`strongFight`; since the Classic retirement it lives in `tools/graftwork_driver.mjs`) learned two things first: it scores every card with and without the declaration and declares when the Thread gains (`GW_DECLARE=0` switches it off), and it holds a "Cut the Line." card while another affordable card could still start or extend the Line (`GW_HOLDCUT=0`). The second made no measurable difference (the middle column was run before it, except N = 1000).
- Unlock pacing stays in its targets (strong 33 to 40, careful 45 to 55).

Not fixed, found on the way (owner decisions):

- **Resonance Lens** (rare relic, "each school at Resonance 3 counts as Resonance 5") does nothing: it sets tier 5 and every rule asks for 3 or 6. The text itself promises nothing a player could see. Either make it 6, which is strong, or redesign it.
- The Thread half of resonance (tier 3 adds a stitch to that school's payout, tier 6 pays its cuts twice) is in the engine and in no text.
- Relic and hero hooks on a cut check `p.paid === false`, a field the engine never sets, so a 4th cut in a turn (which pays nothing) still triggers them. Rare.
- A waived Price still reads on the graft patch of the card: the patch does not mark it as waived.
- The golden master must be recorded again after this branch: the engine traces change by design.

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

### Frozen screens under modals

What it is. The frame loop (`ui/core.js`) runs only the top screen of the stack. Every screen opened with `app.push` is a modal and freezes everything under it: Pause, Settings and its App panel (`app_panel`), the install help and the offline offer (`install_help`, `offline_prompt`), the Codex, the Archive, the Wardrobe and the deck view (view and pick mode). No pushed screen is exempt; pickers that are part of their own screen (event, graft, the combat piles) are not modals and are untouched. Three deep (deck view from Pause over a fight) freezes both lower screens; Esc and back order are unchanged.

Time has an owner (`ui/frame_state.js`, pure):
- `app.t` is the clock of the top screen. A screen that gets covered keeps the clock it stopped at and gets it back when it is uncovered, so nothing that reads `app.t` (the Thread rail, card zoom, hold timers, ambient sines) jumps.
- A tween or an `app.after` timer belongs to the screen that was on top when it was made (or that is being painted into the snapshot). It advances only while its owner is on top, or once the owner has left the stack. The modal's own run. A timer that is due but frozen waits.
- Everything driven by a screen's `update(app, dt)` stops with it: the combat queue and hit-stop, `Fx` instances, the Ward walk, the die, toasts.
- The transition layer (screen wipe, boss plate, phase strip) belongs to the frozen world: it is not stepped and is painted into the snapshot (`app.belowOverlay`), and goes on when the modal closes. Before, it ran on over the modal because of a `dt || 0.016` fallback.
- The WebGL post layer holds its effect timers (shockwave, aberration, flash, vignette pulse, grade ease) and does not show them over the modal; bloom, grade and grain keep working (it reads the 2D canvas, which holds snapshot plus modal).
- Wall clock: the Ward's floor banner is shifted by the frozen time (`thaw(app, ms)`); the fight's heartbeat loop rests in `freeze` and comes back in `thaw` (it would have beaten on alone, forever during a death sequence).
- Pause no longer stops all time: `app.timeScale`, `app.paused`, `app.rawDt` and Pause's own tween stepping are gone.

Snapshot. The lower stack is painted once (no update, `dt` 0, blocked, no pointer, no keys) and copied into ONE canvas of the backing-store size; every later frame blits it under the modal. It is painted again when the stack changes, the backing store changes (resize, rotation, fullscreen, a tier with another DPR cap), a setting or cosmetic is saved (`flow.saveMeta()` now applies the settings at once and asks for the repaint: text size, high contrast, colourblind mode and palette, reduced motion, flashes, Effects, Graphics, mute, wardrobe and codex cosmetics, erase progress), art finishes loading, the quality tier moves, or a modal calls `app.refreshBelow()`. It is released (backing store given back) when the stack is back to one screen. While a modal is open no image is evicted (the frozen screen draws nothing, so its pictures would look unused and go first). `?perf` shows the snapshot's megabytes.

Registry and input. Frozen rectangles are dropped, not kept inert: the layout registry, the tooltip state, the tap-target list and the fullscreen hot spots hold only what the modal registers, so tips are placed against the modal alone and the layout sweeps check the modal on its own stage. Frozen screens get no input at all; before, three things leaked through `app.blocked`: button shortcuts (E, E on the Pause menu over the Ward ended the morning behind it), the Ward claiming finger drags every frame (the deck view over the Ward could not be scrolled by touch), and the title's fullscreen corner staying live under Settings.

Not frozen: audio and music, saving, the install toast, the offline download and service worker messages, the quality controller (it samples the modal's own frames, with a warm-up at open and close) and the 30 fps idle governor (only the top screen's `calm()` and only running tweens and timers count: Settings over a fight now idles).

The unused half mechanism is gone: `still()`, `FLAGS.skip`, `app.staticFrame`, `app.noSkip`, `app.markDirty`, the busy probes, `post.busy` and `CH.ripplesActive` (no screen ever opted in). `ui/frame_state.js` now holds the frozen-stack bookkeeping instead.

Tick cost, method as in "Performance and bug fixes" above (real Chromium headless, 1000 x 462 at DPR 2, canvas 1643 x 924, Graphics High, Effects off, loop stopped, `app.tick(1/60)` plus a 1 px read back, median of 40 ticks, 24 under 4x CPU throttle, best of 3 runs). Before = `428b6499`. The sandbox ran other jobs during the measurements (load average about 20 on 4 cores), so the milliseconds are inflated and noisy (single runs differ by 20 to 40 percent); read the ratios. The three screens alone were measured again with before and after interleaved.

| ms per tick | 1x before | 1x after | | 4x before | 4x after | |
|---|---|---|---|---|---|---|
| title alone | 36.8 | 36.3 | same | 110.6 | 119.8 | same |
| title + Settings | 38.1 | 6.4 | 6.0x | 178.5 | 34.0 | 5.3x |
| Ward alone | 27.8 | 25.4 | same | 141.3 | 112.0 | noise |
| Ward + Settings | 31.4 | 6.2 | 5.1x | 133.8 | 34.7 | 3.9x |
| Ward + Pause | 32.1 | 5.8 | 5.5x | 131.3 | 25.2 | 5.2x |
| Ward + deck view | 55.3 | 27.7 | 2.0x | 224.9 | 112.5 | 2.0x |
| fight alone | 27.3 | 25.0 | same | 129.0 | 133.6 | same |
| fight + Settings | 36.3 | 6.6 | 5.5x | 158.9 | 37.6 | 4.2x |
| fight + Pause | 28.8 | 5.1 | 5.6x | 143.6 | 22.9 | 6.3x |
| fight + deck view | 44.9 | 24.3 | 1.8x | 265.7 | 124.8 | 2.1x |
| fight + Pause + deck view | 41.0 | 24.8 | 1.7x | 179.7 | 122.3 | 1.5x |

What is left of a modal tick is the modal itself plus one blit: Settings and Pause cost 5 to 7 ms, the deck view 24 to 28 ms (15 cards, the vellum, the school strip: its own drawing, not touched here). Opening a modal costs one extra frame of the lower screen (the snapshot paint and one full-canvas copy); so does every repaint (a setting click, a resize). Memory while a modal is open: one canvas of the backing store, 1643 x 924 x 4 = 6.1 MB on this phone size, 3.7 MB at 1280 x 720, at most 38 MB at the 9.5 megapixel cap; 0 after closing.

Bugs this fixed on the way (each has a test):
- The deck view opened from Pause never appeared with motion on (Pause stopped all time, so its open animation stayed at 0): only the preview card and the school strip showed over the Pause menu.
- Settings (Esc on your turn) and the deck view opened straight from a fight let the fight run on behind them: in the test the whole enemy turn played and the hero lost 10 HP behind Settings. Under Pause the fight queue and the Ward walk already stood still (`timeScale` 0), but the wipe, the boss plate, the Ward banner, post effects and the heartbeat did not.
- A timer could change the screen under an open deck view (graft: 450 ms after the staple the flow routes on).
- The three input leaks above.

Pixels. Each modal over the title, the Ward and a fight (15 combinations: Settings, Codex, Archive, Wardrobe over the title; Pause, deck view, Settings, Pause then Settings, Pause then deck view over the Ward and over a fight; Codex over a fight), desktop 1280 x 720 and phone 1000 x 462 at DPR 2, same seed, frozen clock, 40 ticks after opening, the old build's lower screens pinned the way the new loop freezes them. Reduced motion: all 30 pictures identical (0 pixels differ). Motion: 22 of 30 identical; the 4 Pause then deck view pictures differ everywhere because the old build did not show the deck view (the bug above); Pause then Settings differs by 1 level on 0.10 to 0.17 percent of the pixels (the focused Pause row no longer pulses under Settings); Settings over a fight differs by 1 level on 138 (desktop) and 280 (phone) pixels (one flicker in the Thread rail, seen through the panel, stands still). With Effects High (WebGL post on, page screenshots): Settings over the title, Pause and Settings over the Ward with reduced motion, and Pause over a fight, Settings over the title and the deck view over the Ward with motion and the film grain off: 0 pixels differ. With the grain on, its pattern under Pause is another one (the grain seed reads `app.t`, which the old Pause stopped), and a post effect that is in flight when a modal opens is not shown over it.

Golden master (`tools/graftwork_golden.mjs`, before = `428b6499`): engine, resume and assets sections identical (0 keys differ). In `ui`, 25 of 35 scenes are identical in every variant (100 of 140 scene variants). The 10 that differ, on purpose: the eight modal scenes `pause`, `settings`, `settings_app`, `install_help`, `deckview`, `codex`, `archive`, `wardrobe` (hash, calls, the three marks, and `rects`: the frozen screen's rectangles are gone; `trail` where the script lists the buttons it sees: only the modal's now); `combat_boss` (its script opens the deck view in the middle of the fight: `inputs` and `end` marks, same final `rects`, `state` and `trail`); `map_act3` (its script ends with Esc, which opens Pause: `end` mark and `rects`; and the warm pass of the two motion variants also in `enter` and `inputs`, because the old Pause stopped `app.t` for the whole app and the map's ambient animation reads it, so the second pass in the same process started one second earlier on that clock). Draw calls of a whole scene fall where a modal is open, for example `archive` desk.motion 2,600,157 to 1,597,991 and `map_act3` 3,005,919 to 2,256,162.

Tests: `tests/graftwork_frozen.test.mjs` (11 blocks; every block was run against the old loop and failed there): the bookkeeping; call counts (no update, one paint, blocked, no keys, no pointer, `dt` 0); tween and timer owners; the snapshot (one canvas, repaint on resize, request and tier, released, no leak over 20 rounds three deep); the real boot (each look-changing setting repaints the frozen title exactly once and is saved, fullscreen, art arriving, cosmetics, the toast runs, the quality controller samples, Settings idles at 30 fps over a busy screen); a wipe and a boss plate caught by Pause; an enemy turn interrupted by Pause, Settings, the deck view and Pause then deck view compared frame by frame with a run without a modal (animation state, engine state and sounds); heartbeat, registry and tooltips; a Ward walk paused twice, the banner, the finger drag and the shortcuts; every run screen under Pause then deck view with repaints and an untouched save payload; the post layer. `graftwork_ui_pause` now asserts the frozen run screen instead of `timeScale`; the dirty-frame cases left `graftwork_perf2`.

Known limits: ambient motion that reads the wall clock directly (the lamp on cards, portrait breathing, icon liquids, the room pulse in `ui/ward_iso.js`) is not on a pausable clock, so it continues at the wall-clock phase after a modal; in Graphics Auto the controller can rise a tier on cheap modal frames and drop again after closing (its own lock then stops it after two tries).

### Classic retirement

What the player sees is the list under "Classic retirement: what changes for the player". The branch was proved three times, each time against the main line it had just merged: `428b6499` (the performance step), `b0ed267f` (the rules fixes) and `79cb478d` (one path per job, frozen screens). The numbers are the last round, the branch against `79cb478d`; the two rounds before it gave the same picture, with the balance numbers of their own main line.

- **Code.** Game source (`graftwork/**/*.js`): 22 files changed, 121 lines added, 782 removed; one file deleted (`ui/map.js`, 543 lines); 2,617,858 to 2,572,933 bytes (44,925 less). Balance tools (sim, strong, ward_sim, tiers, schools, cardsweep, audit, unlocks): 94.4 to 87.5 KB with the three bot files folded into one driver; `tools/` as a whole 1154 lines added, 1222 removed (the golden tool grew by 6 KB: the Ward fixtures, the closing trace, the comparison flag). Tests: 39 files changed, 686 lines added, 434 removed; 76 suites on main, 77 on the branch (`ui_map` out; `ui_event` and `retire` in). Runner (`node tests/run_graftwork.mjs`, 4 workers), main and branch back to back on a shared machine: 152 s against 163 s wall (407 against 429 s of CPU) at the `b0ed267f` round, 227 s against 205 s (470 against 468 s of CPU) at the `79cb478d` round, 76 of 76 and 77 of 77 green. Read it as unchanged: the wall time is the layout sweep, the longest suite (it now sweeps the reward both bare and as the Ward makes it; the map sweep is gone).
- **A Ward run did not change.** Same seeds on the main line and on the branch, three ways:
  - the balance table (`tools/graftwork_ward_sim.mjs 60 0 <policy>`, both unlock pools) and unlock pacing (`tools/graftwork_unlocks.mjs 200 30`) are identical line for line (20 and 16 lines):

    | strong, A0, N=60 | marrow | wick | odile |
    |---|---|---|---|
    | all pool | 27/60 (45%) | 20/60 (33%) | 25/60 (42%) |
    | start pool | 23/60 (38%) | 27/60 (45%) | 34/60 (57%) |

    random 0/180, sloppy 0/180, passive 0/180; unlock pacing strong median 39 runs (p10 36, p90 42), careful 49, sloppy 151. These are the numbers of the main line after the rules fixes. In the first round, before the rules fixes were merged, the table recorded on `5f3e252b` before the first change (30 / 42 / 48 and 35 / 38 / 48, passive 1/180, pacing 39 and 45) was reproduced the same way.
  - 1080 runs (six policies, both pools, ascension 0 and 5), each hashed over its serialized state at every morning and at the end: every hash identical;
  - the golden master, below.
- **Golden master.** Base `79cb478d` recorded with the tool of main, the branch with `--classic-rng --resume-from <base>`, `compare --common`: 24,656 keys identical, 1,292 different (engine 408, ui 808, assets 76, resume 0).
  - Identical: all 24 Ward runs the two records share (3 heroes x 8 seeds, 3,848 trace steps: every morning, walk, fight, reward, graft, shop, forge and event choice with hp, gold and the rng state after it; final deck, relics, stats, the save bytes), all 36 resume cases (the base's own saved payloads continued by the new code to the same end, and the bytes the new code saves at the same point), every card, graft, potion, enemy and building probe, and the draw streams of 15 of the 33 UI scenes and 6 of the 8 asset scenes in all four variants: `combat`, `combat_boss`, `combat_elite`, `combat_three`, `combat_tips`, `end_won`, `forge`, `forge_temper`, `pause`, `reward_boss`, `ward_morning`, `ward_midday`, `ward_evening`, `ward_night`, `ward_built`; `combat_art`, `combat_art_boss`, `shop_ward`, `ward_kit_morning`, `ward_kit_built`, `ward_kit_night`.
  - Different, every one because the old tool drove that probe or scene on a Classic run, or because the title changed:

    | Keys | Why |
    |---|---|
    | `engine/runs/<hero>.ward.{a0,deep}/{endInfo,metaAfter}` (12) | One career profile played the Classic and the Ward seeds of a hero in a row; it now holds Ward runs only. The 24 run traces themselves are identical. |
    | `engine/probes/relic/<relic>/shop` (96, every relic that is not a Ward relic) | The shop after the probe fight was a Classic shop; every shop is now the Dispensary (plans for sale, Ward relics in the pool). |
    | `engine/probes/event/<event>/choiceN/next` (145) and `/run` (155) | The probe run went to the map after an event and carried a map; it now goes back to the Ward. `choices` and `result` of every choice are identical. |
    | `ui/title`, `title_intro`, `title_select`, `title_veteran`, `assets/title_kit` | The title changed: no mode tag on the Daily slab, no switch on hero select. |
    | `ui/settings`, `settings_app`, `install_help`, `codex`, `archive`, `wardrobe` | Opened over the title menu. The draw log of the two builds differs only by the `WARD` tag in the picture of the title behind them. |
    | `ui/deckview` | Opened over the map screen in the old script; the screen under it is another one now. |
    | `ui/graft`, `graft_decline`, `event`, `event_picker` | First pass: the hash after `enter` and after `inputs` is identical, the last part differs because leaving the screen went to the map and now goes to the Ward. Second pass in the same process: different from its first frame, because `art/backgrounds.js` keeps one baked backdrop at a time; the map screen at the end of the first pass replaced the table's, the Ward does not use that cache. |
    | `ui/end_dead` | Identical through `enter` and `inputs` in both passes; the last part is the title it returns to (the tag). |
    | `ui/reward`, `assets/combat_art_kill` | The elite's relic was rolled from the Classic pool, which had no Ward relics (Blunt Shears became Spare Fuse). The fight before it is identical. |
    | `ui/shop` | The scene was a Classic shop; it is the Dispensary now (the Building plans button, another relic on the shelf). `assets/shop_ward`, the shop of a Ward run, is identical. |

    Only in the base: the Classic runs, their resume cases, the scenes `map` and `map_act3`. Only in the branch: an Endless run per hero, the Daily modifiers on Ward runs, the 28 Ward fixture saves, the closing of the 20 old saves.
  - Check of the engine rows: the tool of main was copied outside the repo and four lines of it changed, so that the career plays Ward runs only and the relic shop and event probes treat their run as a Ward run without a map (the game code of the base untouched). Recorded from the base, its engine section equals the branch on all 13,055 common keys, 0 differences.
- **Old Ward saves resume.** 28 saves written by `5f3e252b` (every Ward hour, mid walk, fights, reward, graft, event, shop, forge, the Grafter): played to the end by the same deterministic player on the main line and on the branch, all 28 reach the same end, to the hash of the final save. The rules fixes moved 12 of those ends on the main line itself (two Wick and Odile runs by a few hit points and gold, the rest only in the final save), so the ends in `tests/fixtures/graftwork_wardsave_5f3e252.json` were played again on `b0ed267f`; the saves in it are untouched. The golden master continues the base's own saved payloads to the same end and writes the same bytes at every save point.
- **Old Classic saves are closed.** 20 saves from before the Ward: each one leaves the meta exactly as the Abandon button would (compared field by field against that path), is deleted, and sets the notice.
- **Hygiene.** `tools/graftwork_hygiene.mjs` is clean. The allowlist is the main line's minus the five entries that named deleted code; nothing was added. Dead code the retirement left behind was deleted, not listed.
- **What the merges needed.** The strong bot's two new rules from the rules fixes (Odile's declaration, holding a "Cut the Line." card) were moved into `tools/graftwork_driver.mjs`, where the bot lives now (the fight function is the main line's text; the tables above are the check). `tests/graftwork_rules_fixes.test.mjs` saved a Classic and a Ward run and saves one Ward run now; `tests/graftwork_frozen.test.mjs` opened its event with the retired `RUN.startEvent` and uses the Ward's `wardStartEvent`; `tests/graftwork_ui_pause.test.mjs` keeps the main line's frozen assertions on the Ward screen.
- **Real browser** (Chromium, 1280 x 720 and 1000 x 462 at DPR 2, on the merged branch): title without mode tags, hero select without the switch, Begin lands in the Ward, a route into a fight, reward, back on the Ward; a Classic save gives the notice once and no Continue, a click under the notice does nothing, a reload shows no second notice and counts nothing twice; three old Ward saves (evening, mid walk on a reward, the Dispensary) resume with the save unchanged. No page error.

### Rules leftovers (branch `cleanup-leftovers`)

The four items the rules pass listed under "Not fixed, found on the way". Each has a block in `tests/graftwork_rules_fixes.test.mjs` (sections 9 to 12) that failed on the code before; `graftwork_glossary` reads the new texts and `graftwork_ui_layout` now sweeps cards with a waived Price.

- **Cut hooks fired on unpaid cuts.** Wrong: the hooks that skip a cut that paid nothing tested `paid`, which the engine never set, so the 4th cut of a turn triggered them. Changed: `seamCut` carries `paid: false` for a cut past the turn's 3 paying cuts and for nothing else (an enemy cancel and the turn-end cash are `paid: true`); the event carries `capped: true`. Not fired on such a cut: Marrow's passive, Spool, Bobbin, Seam Ripper, Blunt Shears, Tapestry Frame, Second Colour (their own checks now work), Pin Cushion (it had none; same wording as Spool), and the two grafts that pay "per stitch" when their card cuts (Surgeon's Knot, Surge Loop). Still fired: Scissor Loop, Reef Knot and Spent Thread (they ask for the cut, not for stitches) and the enemy hooks.
- **A waived Price still read as due.** Wrong: Free Sample took the Price off the card, but the graft's Boon / Price block printed "Price: ..." wherever a card lists its grafts. Changed: `cardSpec` names the waived grafts (`spec.waived`) and one reader, `priceOnCard` in engine/text.js, labels such a Price "Waived" (gold, not red) in the combat card tip and pile view, the deck view panel (live and tempered grafts) and the graft choice of Strip and Reforge; the Strip note says "Its Price was waived." instead of "Frees you of".
- **The Thread half of resonance was in no text.** Wrong: tier 3 adds a stitch and tier 6 doubles the cut, and nothing a player can read said so. Changed: `RESONANCE_THREAD` in data/schools.js ("Its Thread payout gains 1 Stitch." / "Its cuts pay double.", and one line for both). It is on the Resonance keyword (hover tip and glossary), in the Codex (rule 6, a line above the seven schools), in the school tooltip of the deck view strip, and in the school panel of the graft screen (the patch tip a phone shows instead of that panel keeps the school's own line: with four patches there is no room for more, the layout suite says). The test measures both numbers for every school (top school, second school, cut, turn end) and rebuilds the texts.
- **Resonance Lens did nothing.** Wrong: it set tier 5 and every rule asks for 3 or 6. Changed: "In Elite and Boss fights, each school at Resonance 3 counts as Resonance 6." The rule is in `resonanceOf(run, kind)`, the one place a tier is decided; the relic is only `mod.resLens`. The deck view strip opened in a fight shows that fight's tiers and its tooltip says "Counts as 6 grafts in this fight."

Balance of the Lens (strong bot, Ward mode, all pool, 500 runs per hero on the same seeds, the relic handed over on the first morning, which is the most a relic can do; "inert" is the Lens in the relic list with its rule switched off, so the relic list and the RNG stream are the same). Win percent for Marrow / Wick / Odile, then all 1500 runs:

| relic held all run | Ascension 0 | all | against no relic |
|---|---|---|---|
| none | 34.4 / 29.8 / 38.2 | 34.1 | |
| Resonance Lens, inert | 34.4 / 30.0 / 38.2 | 34.2 | +0.1 |
| **Resonance Lens** | 41.4 / 34.8 / 42.2 | 39.5 | **+5.3** |
| Graft Press (rare) | 39.6 / 35.4 / 44.6 | 39.9 | +5.7 |
| Tapestry Frame (rare) | 40.2 / 36.6 / 42.8 | 39.9 | +5.7 |
| Pin Cushion (rare) | 36.6 / 33.8 / 46.8 | 39.1 | +4.9 |
| Cold Vault (rare) | 35.4 / 32.2 / 40.8 | 36.1 | +2.0 |

| relic held all run | Ascension 5 | all | against the inert Lens |
|---|---|---|---|
| Resonance Lens, inert | 21.4 / 17.2 / 26.8 | 21.8 | |
| **Resonance Lens** | 28.6 / 26.4 / 37.0 | 30.7 | **+8.9** |
| Tapestry Frame (rare) | 28.2 / 24.4 / 34.8 | 29.1 | +7.3 |
| Pin Cushion (rare) | 26.4 / 23.4 / 35.4 | 28.4 | +6.6 |
| Graft Press (rare) | 27.0 / 23.8 / 33.6 | 28.1 | +6.3 |

- The stock harness (`node tools/graftwork_schools.mjs relics 200 0 <id>`, 600 runs each on its own seeds, the relic from the first fight) agrees: baseline 34 percent, Graft Press 43 (+9), Resonance Lens 41 (+8), Pin Cushion 41 (+7), Tapestry Frame 38 (+5). Before the Classic retirement was merged into this branch the same command played the Classic map: baseline 26, Tapestry Frame 39 (+13), Resonance Lens 38 (+12), Graft Press 32 (+6), Pin Cushion 31 (+5).
- The two tables were measured before that merge. The Lens and inert arms of Ascension 0 and the Lens arm of Ascension 5 were run again on the merged tree: the same wins and the same fight counts, to the last fight.
- Verdict: strong, at the top of the rare relics, not out of their family. Held from the first morning (the most a relic can do) it stays under the bar of about 10 points in Ward mode: level with Graft Press, Tapestry Frame and Pin Cushion at Ascension 0, ahead of them by about 2 points at Ascension 5 (one hero, Odile, reaches +10.2). On the retired Classic map it passed the bar, and so did Tapestry Frame. Nothing was retuned. It is busy: the bot holds a school at 3 to 5 grafts in 71 percent of its Elite and Boss fights, and there the Lens cuts the fights lost from 2.2 percent (176 of 7899) to 1.0 percent (78 of 8205) at Ascension 0. A player who builds for it (two schools at 3 on a Budget of 6) gets more than the bot does.

Seen on the way, not touched: all six items found here are fixed in "Rules follow-ups" below, which lists what it saw in turn.

### Rules follow-ups (branch `cleanup-rules2`)

The six items the leftovers pass listed as seen and not touched. Each has a block in `tests/graftwork_rules_fixes.test.mjs` (sections 13 to 18) that failed on the code before; `RF_ALL=1` lists every failing block.

- **A waived Price came back under Numb.** Wrong: Free Sample records the waiver per graft id (`inst.waived`), and Numb plays a muted copy of the graft under another id (`~numb:<id>`), so the lookup missed it and a waived "Costs 1 more" was charged while Numb lasted. Changed: the muted copy carries the id it was muted from (`of`) and `cardSpec` looks the waiver up under that (`isWaived`, engine/cards.js): the one place the waiver is read.
- **Reforge dropped the waiver, Strip then sew again waived twice.** Rule, from the Free Sample text ("The first graft Price you accept each act is waived") and the Strip and Reforge texts: a waiver belongs to one sewing of one graft. It moves with the graft on Reforge (and when an event moves it with `R.moveGraft`) and ends when the graft is stripped; a graft sewn on again is a new graft and pays its Price. Changed: `sewGraft` / `unsewGraft` (engine/cards.js) are the only ways a live graft joins or leaves a card; `applyGraft`, `stripGraft`, Reforge and `R.moveGraft` use them. Tempering keeps the waiver (the fused graft is the same graft). A save that carries stale entries (a waiver for a graft the card no longer holds, which the old Reforge and Strip left behind) loads cleanly: `repairRun` drops them. The Forge's Reforge preview shows the Price still waived on the new card ("Its Price was waived and stays waived."), and the shared preview helpers (`deckStripped`, `deckMoved`) replace two copies of the same filter in the UI.
- **Cut hooks fired on the turn-end cash.** Every hook that listens to `seamCut` was read with its text. Relics and hero (all say cut or cutting): Marrow's passive, Spool, Bobbin, Seam Ripper, Pin Cushion, Blunt Shears, Tapestry Frame, Second Colour. Grafts ("when it cuts the Line") run in the card's own play and never saw the turn end. Enemies: Ferric Warden ("a Line cashed in that school pays nothing this turn", turn end included), Scissor Nurse and the Locksmith (no player text at the time) and Knitter (cuts bruise it; its turn-end half already listens to `seamPay`). Changed: `seamCut` (relics, hero, enemies) now fires for a cut only; a new enemy hook `seamCash` fires for every cash, `kind` 'cut' or 'end', before anything is paid, and may cancel the payout. The Warden, the Nurse and the Locksmith moved to it, so they react to the turn end exactly as before (a test pins each). `info.stitches` and the new `info.pays` are what was paid (every school, Resonance and the second school included); a payout an enemy voided reads 0. Seam Ripper, Tapestry Frame, Second Colour, Marrow (the Blood stitches paid) and the two "per stitch" grafts (Surgeon's Knot, Surge Loop) read them instead of the length of the Line, so Resonance now counts and a Line the Nurse snipped pays them nothing. The Tax Collector said "Gilded cut" for a hook on the payout, which also fires at the turn end; its text now says so (no behaviour change).
- **The Locksmith's Block had no text.** Changed: the Sealed status it carries from the first turn says "The Locksmith gains 4 Block per Line of it cut or cashed." (a definition may not pass 170 characters: `graftwork_tip_lifecycle`). The test measures the number in the engine and compares it with the text.
- **Deck view tip over the card's grafts.** Wrong: the glossary tip of the hovered card was placed in a band (x from 940) that is the side panel listing that card's grafts. Changed: the grid gets a tip region (`glossRegion`, the tooltip system's `anchor.region`: the grid up to the preview), so the tip sits beside the card and covers neighbouring cards instead. Checked in Chromium at 1280 x 720 and 844 x 390, mouse and touch hold, before and after; the test sweeps the whole grid (hover and Shift hold, desktop and phone stage) and asserts the tip never meets the panel.
- **Codex Rules tab said "eight panels", the sheet has eleven.** Changed: the header reads `RULES.length`.

Balance of the cut hooks (strong bot, Ward mode, Ascension 0, 500 runs per hero on the same seeds, win percent for Marrow / Wick / Odile; "before" is this branch with the two waiver fixes already in, so the columns differ by the cut hooks alone; "start commit" is `0a8bf6ab` without any of the six):

| pool | start commit | before the cut hooks | after |
|---|---|---|---|
| all | 29 / 31 / 33 | 29 / 31 / 33 | 31 / 30 / 32 |
| start | 43 / 44 / 55 | 43 / 44 / 56 | 42 / 44 / 54 |

Wins out of 500 (the waiver fixes moved one Odile run in the start pool, 277 to 278), before the cut hooks then after: all pool 146 to 153, 156 to 151, 165 to 162; start pool 213 to 210, 218 to 218, 278 to 270. The largest move is 1.6 points (Odile, start pool), inside the noise of N = 500 (one standard deviation of a win rate is about 2 points); no hero moves by more than the 3 points the brief set as the stop, and nothing was retuned.

Seen on the way, not touched:

- A waived Price comes back under Numb: the muted copy of the graft has another id (`~numb:<id>`), which `inst.waived` does not hold, so a waived "Costs 1 more" is charged while Numb lasts (and reads "Price" then, as it is charged).
- Reforge moves a graft without its waiver (the Price is due on the new card, the old card keeps a stale entry in `waived`), and a graft stripped and sewn again on the same card is free a second time for the same reason.
- `seamCut` hooks also run for the turn-end cash (`kind: 'end'`), which the rules call not a cut: Bobbin, Blunt Shears, Tapestry Frame, Seam Ripper, Pin Cushion, Second Colour, Spool and Marrow's passive react to it. The same hooks count stitches from the Line's length, not from what was paid (Resonance, the turn-end minus one and Spool's sixth knot are not in it).
- The Locksmith gains 4 Block when a Line of the sealed school is cut; no text says so.
- Deck view: the glossary tip of the hovered card opens over the panel that lists its grafts.
- Codex, Rules tab: the header says "eight panels", the sheet has eleven.

### Character rigs (preview)

The owner rejected painted walk frames ("1 foot forward step, next foot forward step") and the map walk became the puppet (one standing sprite cut in three). The part sheets of nine characters arrived, so a character can be a skeleton with painted parts. Built on branch `cleanup-rigs`, OFF by default: `previewOn('rig', app.settings)` in `ui/preview.js` (`?rig=1`, `?preview=1`, or the Settings toggle `previewArt`).

- **What exists.** `tools/graftwork_rig_build.py` (raw sheets and `tools/graftwork_rig_meta.json` in, `graftwork/assets/rigs/` out: one packed atlas per character at `@1x` and `@2x` and `manifest.json`, about 220 KB in all), `ui/rig.js` (bones, idle, the two-step walk, the draw), `ui/rigs.js` (lazy loader), the Ward's `drawActor` behind the switch, the Rig lab of `lab/anim.html` (all nine rigs beside the puppet and the standing sprite), `tests/graftwork_rig.test.mjs` (22 checks; 78 of 78 suites green). Docs: ART_MODULAR.md section 7, ANIMATOR_GUIDE.md section 6, CLAUDE.md "Character rigs".
- **Default look unchanged.** With the preview off the golden master of the branch equals the base it was merged with (`0a8bf6ab`, tool version 2; sections ui, engine and assets): 26,158 keys, 0 differences. No scene asks the network for anything under `assets/rigs/` (the assets section records every request), and a real Chromium run of the Ward and the title without the switch makes no such request either.
- **The walk.** Feet alternate by construction (the screen-left foot, the character's right, plants first). Each foot has a floor point that moves back one stride per step while planted; hip, knee and ankle are solved from it, the boot rolls heel, flat, toe about the edge on the floor. Level walking is exact: a planted sole does not move in the world (0.000 units over 4 seconds at the game's speed). On the Ward's floor diagonals the sole is exact along the screen x and follows `RIG_TUNE.depth` (0.5) of the floor's screen-y travel: at 1 it is exact in both axes (the test proves the solver), but a flat painted leg cannot foreshorten, so each leg grew and folded by a tenth of the figure's height per step and read as a limp. The puppet follows none of it. The Depth slider in the Rig lab shows both.
- **Per character** (ships = drawn in the preview; all nine are in the lab):

| character | verdict | same person as the standing sprite? |
|---|---|---|
| marrow | ships | yes. The sheet's trousers are dark charcoal (the sprite's are cream) and the tunic is whiter and seen more from the front |
| wick | ships, with the head BORROWED from the standing sprite | yes with the borrowed head. The sheet's own head is a bald doll ball with two button eyes and no hair: another character |
| odile | ships | yes. The hair covers a little more of the face; no thighs in the sheet (the dark leg piece is used twice, hidden by the coat) |
| knitter | ships | yes, slimmer arms |
| night_nurse | ships | mostly: slimmer, a longer neck, no cape collar, both eyes show. Legs are one painted piece each (one bone) |
| npc_nurse | ships (the Ward draws no NPC today, so it is seen in the lab only) | yes; the sheet has no armband |
| npc_patient | ships (same remark) | yes; doll joints show on the free arm, the armband sits on the upper arm instead of the wrist |
| candy_striper | lab only, stays on the puppet | no: the sheet has no skirt and loose hair instead of pigtails |
| npc_porter | lab only | no: a slim upright boy; the sprite is stocky and leans into a bigger cart |

- **Redo list for the artist** (exactly what to ask for): (1) wick: a head with her hair, the fringe over one eye, the headscarf and the leaf crown, in the standing sprite's three-quarter view, so the borrowed head can go; (2) candy_striper: the wide two-tier striped skirt as its own part, the hair as pigtails with the red ribbons, and each leg as three loose pieces (thigh, shin, boot) instead of one joined piece; (3) npc_porter: the whole figure in the sprite's build (stocky, leaning forward, long coat, thick trousers), both arms painted reaching to the cart handle on the screen right, the cart at the sprite's size; (4) marrow: the four leg pieces in the cream cloth of the standing sprite; (5) night_nurse: thigh, shin and boot as loose pieces, the cape collar, the body as stocky as the sprite; (6) for every sheet: one scale for all parts, limbs straight and loose (a gap of at least 12 px between pieces), and a note which side is the screen left.
- **Battles are not touched.** To use the rigs there: (1) a 2 px per unit atlas (battles draw the 512 px sprite; one more entry in `SIZES` of the build tool, about four times the bytes); (2) poses on the same bones: attack (wind-up, strike, recover on the battle's own timing table `J.atkTiming`, the prop arm and the torso), hit (recoil and squash), block, and a collapse for death, or the painted `die` frame at the end as today; (3) the hurt flash and the statuses are drawn over ONE image today: a rig needs its parts composed to an offscreen canvas first; (4) enemies face left: mirroring is free. Art: good enough for marrow and odile (knitter and night_nurse at enemy size too); wick needs her own head first; at battle size the dark trousers of marrow and the doll joints of npc_patient show.
- **What the preview needs from the Settings work.** `ward_iso.js` calls `previewOn('rig', app.settings)`; this branch does not set `app.settings` (main.js copies `meta.settings` into switches each frame), so here the URL is the only way in. The Settings toggle works once `app.settings` is the settings object.

- **Back-Alley Swap** (`e_back_alley_swap`, "Move a graft (20 gold)") moves a graft by stripping it and sewing it on again with `R.stripGraft` and `R.addGraft`. Sewing on again charges the graft's max HP Price a second time (Hoard Cache: 78 to 74 max HP, measured) and, when the first card with room cannot take the graft (a junk card first in the deck, or a type it does not fit), the graft is stripped, `addGraft` refuses, and it is gone while the 20 gold are paid. The other movers (`e_load_balancer`, `e_seamstress_move`) use `R.moveGraft`, which is the safe path.
- **Knitter and Scissor Nurse passives have no player text.** The Knitter heals 3 per extend (9 a turn) and takes 50 percent more from a cut or a cashed Line; the Nurse takes 2 Block per cashed Line and snips a Line of 4 or more to nothing. Neither shows on a status or an intent tip; the Locksmith did not either, which is why it was listed.
- A payout an enemy voids still counts as a cut for the hooks that only ask for the cut (Bobbin draws, Pin Cushion applies Vulnerable): the Line was cut, it only paid nothing. Left as it was; say if a voided cut should skip them like a cut past the 3 paying cuts does.
- The `capped` flag of the `seamCut` event is now read by tests only: the grafts read `paid`, which is 0 for a capped cut and for a voided one.

### Painted UI parts (preview)

What it is. The artist's UI art (`shop` batches 1 and 2: ten card frames, the plain back, a cost gem, `panel`, `panel.parchment`, `modal`, five buttons, the HP tube, the energy dial, the block plate, two chips, the Budget gauge, two icon sheets and the title key art) is built into `graftwork/assets/ui/` and drawn by the game, but only as a PREVIEW: `ui/preview.js` is the one switch (`?art=1`, `?preview=1`, or Settings > "Painted art (preview)"; `PREVIEW_DEFAULT.art = true` would make it the default look). Rebuild: `python3 -I tools/graftwork_ui_build.py --raw <raw dir>`, then `node tools/graftwork_sw_build.mjs`. Details and what is still procedural: `design/ART_MODULAR.md` "What is built". Look at everything in `lab/art.html`.

- **The default look did not change.** Golden master, base `e29d390a` (main) and the branch, both recorded with the same tool (`--only ui,engine,assets`, 26,000 keys): 25,653 keys identical; the 202 that differ are `ui/settings` (46) and `ui/settings_app` (48), the Settings screen that now has the "Painted art (preview)" row (the sliders and the toggles stand a few pixels closer to make room for it). Every other screen, the whole engine section and every asset scene hash the same. With the preview off nothing under `assets/ui/` is requested (`tests/graftwork_ui_art.test.mjs`, `tests/graftwork_perf3.test.mjs`).
- **Size.** 29 files, 1.13 MB (budget 2.0 MB): two atlases (chrome 39 + 119 KB, icons 35 + 101 KB), ten card frames 9 to 14 KB at 1x and 27 to 41 KB at 2x, the back 21 + 77 KB, the key art 91 + 229 KB, `manifest.json` 15 KB. On a page load that turns the preview on: the manifest, the chrome and icon atlases and the frames of the cards on screen (about 15 requests for a fight at @2x).
- **Cards.** The 3:4 art is brought to the game's 220:310 by adding 65 rows in the plain leather rails beside the text window (steepest local stretch x1.3 to x1.5 on leather; corners, banner, ribbon and the cost socket are not stretched). The picture window and the text window are painted UNDER the frame (they are transparent in it), the name is written on the banner, the type on the ribbon. The text window is smaller than the procedural text box (163 x 93 against 176 x 141 logical px), so a painted card shows less text per size. Real-font sweep of all 177 cards, base and upgraded, with none to three of the longest grafts each (1,416 faces): no card spills; the smallest rules text is 12 with no graft, 8.5 with one, 8 with two and 7 with three (15 worst cases; the procedural face goes down to 11). The hand face puts the big number on the lower part of the picture and the graft chips in the text window; a Tithe seam crosses the banner, so the name is written over it again.
- **Performance** (real Chromium, a Marrow fight with a full hand of ten, one page, the preview switched off and on through the Settings value in alternating blocks of 40 ticks, six rounds each, median of the middle rounds; the sandbox ran other jobs, so read the ratios, single rounds vary by 20 to 40 percent). Per tick, JS time off against on: 1280 x 720 at DPR 1: 27.8 against 24.3 ms (4x CPU throttle 118.9 against 105.4); 844 x 390 at DPR 2: 32.3 against 29.6 ms (4x: 150.1 against 135.4). With a 1 px read back that forces the raster: 24.1 against 22.7 ms (desk), 37.5 against 35.1 ms (phone). So the painted look is not slower: it replaces baked vector panels and buttons by one `drawImage` of a cached bitmap, and the card faces are the same cached bitmaps as before. `drawImage` calls per frame go from 25 to 59 (HP tube tiles, chips, medallions, the gauge) and the destination area from 2.52 to 2.59 Mpx. Sliced parts are baked once per size and device scale (`ui/skin.js`); an image arriving (or the toggle) repaints a frozen screen once.
- **Tests.** New `tests/graftwork_ui_art.test.mjs` (13 checks: the manifest and its files, 1x and 2x sizes, slices and slots inside their images, every card of the data has a frame, nothing requested while the preview is off, a card composes through its frame with fake images, sliced parts bake once per size with whole corners, HUD parts fall back one by one, the Settings toggle is live and the minimal tier keeps it off, the lab page, the build tool is deterministic). Changed: `graftwork_perf3` and `graftwork_templates` (the switch is the preview, not a constant), `graftwork_ui_title` (the Settings rows moved). 72 suites (main's 71 and this one).
- **Not done, on purpose.** The panels with a state (rows, plates, chips, tabs) stay procedural; `panel` has no call site; the deck view and the Codex keep their own gauge cells; the Ward panels, the other seven card backs, relic, potion and status glyphs are procedural; 13 of 16 rules icons and the `thread` intent icon have no place in the game yet (they are in the manifest and the lab).

### Tests and tools (branch `cleanup-tests`)

Starting point: main at `0a8bf6ab` (78 suites after the rigs landed), checked again against `8ad9476b`. No game code was touched; the only file under `graftwork/` that changed is this document and `CLAUDE.md`. Every claim below was measured: assertions are counted as executed calls of `node:assert` (a preload that wraps every method), not as lines.

**Runner.** One suite set the wall time: `ui_layout` ran 21,354 analysed frames, 18,308 of them the tooltip sweep. The sweep is now `tests/graftwork_tip_layout.test.mjs` on the harness `tests/graftwork_layout_lib.mjs`. A recording copy of both versions (tag, pointer and a digest of each tip's signature, rect and texts, in order) proved the move: the sweep's 18,308 frames, 5,523 tip layouts and 128 known faults are identical and in the same order, and `ui_layout` keeps its 3,046 frames. The sweep then rests 4 frames on a screen where nothing moves under the pointer (the tip is up on the first frame, delay 0) and 12 frames on the two kinds of scene in motion (combat hands, the Forge while Rest plays); 3, 4 and 6 frames everywhere were tried and rejected (the combat sweeps lose 145 to 168 tips each, the Forge 32 to 92). The same 18,308 frames, 5,523 tips and 128 faults come out. The real show delay is `tip_lifecycle`'s: it asserts 0.25 s and no tip at 0.23 s (two assertions added). CPU of the sweep suite, same machine: 131.5 s at 12 frames, 93.6 s now. `HEAVY` in the runner was stale; the runner now keeps the time of each passing suite in `graftwork_suite_times_<checkout>.json` under the system temp folder (never in the repo) and starts the slowest first; without the file it falls back to a list sorted by measured time. The summary line prints CPU seconds.

Runner time, four full runs back to back on the shared machine (load 10 to 17 on 4 cores, other jobs running; `--times`, 4 workers; wall seconds, then user plus system CPU seconds):

| pair | before (old runner, 78 suites) | after (new runner, 71 suites) |
|---|---|---|
| 1 | 435.4 s wall, 501 s CPU | 416.7 s wall, 504 s CPU (no remembered times: the fixed order) |
| 2 | 270.5 s wall, 492 s CPU | 306.0 s wall, 486 s CPU (order from the remembered times) |

The wall times are inside the machine's noise (minus 4 percent, plus 13 percent) and the total CPU is the same, 490 to 500 s: the split moves work, it does not remove it, except the 28 percent the shorter rest saves in the sweep (two back to back runs of the sweep suite, 12 frames everywhere against now: 143.5 s and 140.4 s of user CPU against 101.2 s and 103.4 s). What the split changes is the longest single suite, the thing a 4 worker pool cannot get below. Every suite run alone, CPU seconds, then scheduled longest first on 4 idle cores: before, `ui_layout` 158 s and a schedule of 158 s; after, `tip_layout` 109 s, `ui_layout` 48 s and a schedule of 122 s, which is sum divided by 4: the pool is full. (Idle machine estimate, not a wall time measured on one.)


**Wall-clock assertions (all replaced).** A budget is now a count of canvas calls over every fake context (`canvasCalls()` in `tests/graftwork_lib.mjs`), the same number in every run:

| suite | was | now |
|---|---|---|
| `art_cards` hand of ten | under 1.5 ms a frame | under 1500 calls a frame (measured 1178), and a warm hand bakes no card face |
| `art_chars` six enemies and a hero | under 3 ms | under 2600 calls (measured 1923) |
| `art_icons` ten background themes | under 2 ms each | under 700 calls each (measured 137 to 527) |
| `ui_core` 500 buttons and 200 panels | under 8 ms a tick | under 3200 calls (measured 2702) |
| `post`, `grade`, `audio_check` | Playwright 30 s launch and load, 15 s wait for the page | 120 s, with the reason beside them |

Seen live: with the machine at load 30 the old `art_chars` bound failed at 9.34 ms a frame on the unchanged code; the counted bound did not move.

**Source-text assertions.** `fullrun` (two regexes on `ui/combat.js`) is now a fight against The Grafter on the combat screen that must fire the REKNIT strip once and paint the brand on the marked hand (it fails on a copy of the file with either wired out); `q3_flow` (eight `includes` on `ui/ward.js`) is the Ward legend and route list read from what the screen draws (fails with a label changed, the jargon restored or the boss dropped); `sw` (three regexes on `sw.js`) runs the service worker in a sandbox with a fake Cache API and network: all or nothing, the pointer written once and last, an update downloads only what changed, nothing outside `/graftwork/` requested (seven mutations of `sw.js` each fail it); `art_assets` (thirteen strings in the text of the art build script) is the existing runs of its passes plus one more name in the filter of what a frames run must not export. 26 source-text assertions out, 52 behaviour assertions in.

**One owner for the dash rule.** `hygiene` read every text file already; it now also flags en dashes and, in `graftwork/`, a dash written as an escape, and its throwaway-repo test proves both fire. About 1,300 executed assertions in 27 suites (statuses, cards, grafts, relics, enemy moves, events, tips, taglines, manifests, docs) checked the same fact and are gone; checks that were about more than a dash (no exclamation mark in an achievement, no newline in a status text) stay.

**Folds.** 78 suites to 71: `fullrun` into `regression`, `meta2` into `meta`, `perf` into `perf2` and `quality`, `q3_flow`, `r3_tips`, `ui_reward_tip`, `ui_polish` and `ui_clickthrough` into `ui_graft`, `ui_shop`, `ui_event`, `ui_title`, `ui_combat_layout`, `tip_lifecycle`, `glossary`, `onboarding`, `content_fuzz`, `art_cards`, `meta` and `ui_ward`; `s3_intents` is `intents`; `tip_layout` is new. The assertions of each moved check are identical (compared as a multiset of method and message); the table of every suite is in the branch report.

**Dead code.** Unused imports in 20 suites and 4 tools, helpers nothing calls (`touch`, `content_fuzz`, `tip_lifecycle`, the driver's `incomingDmg`, profile's `tap`). Two imports stay (`startPlayerTurn` in `afflictions`, `drawCardText` in `ui_combat_layout`): nothing else imports those two game exports and the allowlist lists them; dropping the import would make them new unused exports in files this branch may not touch.

**Tools.** `graftwork_icons.py` regenerates the four PWA icons byte for byte (checked in a scratch folder) and `graftwork_glossary_audit.mjs` runs: both are named in `CLAUDE.md` now. The strong bot's 13 tuning switches (`GW_FLOOR GW_OVERLOAD_P GW_TEMPER_P GW_MARGIN GW_MAXBUY GW_RESERVE GW_THRESH GW_MS GW_GREED GW_BUY GW_FIRST GW_ROAD GW_EARLY_HP`) are constants at their defaults; the switches that stay are in one table in `CLAUDE.md`. Proof the numbers did not move: 432 runs (nine policies, both pools, ascension 0 and 5, three heroes, four seeds), each hashed over the serialized run at every morning and at its end, 108 lines and the digest identical before and after, and the tables of `ward_sim` (strong, both pools, N=60; all policies, N=20), `sim` and `strong` identical line for line. No other run loop can use the driver without changing what it tests: `e2e` drives the real UI between steps, `ward_props` is a property test with its own rng and invariants, `regression` needs the deterministic player and a round trip at every decision, the golden recorder replicates the builder on purpose.
**Golden master.** The `--classic-rng` code is gone (tool version 3). A quick record by the old tool at `0f5c4e84` and by the new one agree on all 18,222 keys. The fresh full reference, recorded from the final commit of this branch, is `/tmp/claude-0/-home-user-Games/2d970048-5ad2-5fe3-9283-45242a3d6a9d/scratchpad/tests/golden_cleanup_tests_final.json` (a scratch folder, outside the repo; 29,036 keys, 1.6 MB; `tools/graftwork_golden.mjs record` with no flags on `dd6ef9a6`, the last commit of this branch that changed code, after the merge of main at `8ad9476b`; compare later records against it with `compare`).

That list of leftovers (files this branch was not to touch: the `ui_layout` copy of the harness with `OPEN_ON_PHONE`, `OPEN_DESK` and two unused imports; the source-text assertions in `puppet`, `lab_anim` and `rig`; `lab_anim` and the kit asset checks into other suites; `s3_intents` in `LATE_GAME.md`; the unused `EPS` of `attack_rigs`) is done in the next section, except that `lab_anim` stays its own suite and keeps the checks that read the lab's own two files.

### Leftovers of "Tests and tools" (branch `cleanup-leftover-tests`)

Starting point: main at `e29d390a`, 71 suites; now 70. No game code was touched: the files changed under `graftwork/` are `CLAUDE.md` and this folder's docs. Assertions are counted as before (a preload wrapping every method of `node:assert`, calls by method and message), and a source-text check was only replaced by one that was shown to fail on a mutated copy of the code (a scratch copy of `graftwork/`, `tests/` and `tools/`, never the tree itself).

| suite | executed assertions before | after |
|---|---|---|
| `ui_layout` | 68 | 68 (four messages renamed with the shared verdict) |
| `attack_rigs` | 9,004,464 | 9,004,464 |
| `art_assets` + `kit_assets` | 1,168 + 2,203 | 3,371, the same multiset of method and message |
| `puppet` | 7,376 | 7,374 |
| `anim_frames` | 174 | 179 |
| `rig` | 27,867 | 27,899 |
| `lab_anim` | 152 | 186 |
| `hygiene` | 92 | 146 (54 new: six tools, each run with `--help`, `-h` and an unknown option) |

**`ui_layout` on the shared harness.** Its copy of the harness (`make`, `look`, `go`, `flowFor`, the frame and tip checks, the verdict, about 160 lines) is gone; it imports `graftwork_layout_lib.mjs`, like `tip_layout`. Gone with it: `OPEN_ON_PHONE` (empty), `OPEN_DESK` (it matched nothing: the old run printed 0 known open violations, and with it removed the same problems come out), `if (false) return`, the unused imports `GRAFTS`, `HEROES`, `STATUSES` and `GRAFT_LIST`, and the first of two back to back `meta.seen` assignments in the Codex sweeps (the second overwrote it at once; both are `allSeen()` now). Proof, a recording of every analysed frame (tag, registered rects, text rects, the tip drawn): the old file twice and the new file give byte identical records, 3,046 frames, 489 tip layouts and 127 problems, all of them the known Ward faults, in the same order. The title frames differ from one day to the next (the Daily Case), so old and new were compared on the same day, twice. Moving the dynamic import of the screens out of the file made the hygiene audit call `openPause` in `ui/pause.js` an export that only its own file uses (the test's own stub of `flow.openPause` was what kept it alive); the test calls the real `openPause(app)` now.

**Source-text assertions out, behaviour in.** `puppet`: `/hung \? 0 : 0\.025/` and `/if \(!hung && upper\)/` on `ui/puppet.js` became two synthetic figures in Chromium (a skirt that hangs over two thinner legs, trousers as wide as the hips): the hem band holds no leg pixel, the skirt's upper body is not faded where it is cut, the trousers' overlap fades over several rows and no further up (fails with the feather kept on a garment and with no feather). The first regex could never fail: `ov` is read only where `!hung`. Ten includes on `ui/ward_iso.js` (`PUP.walkPuppet(`, `PUP.drawLegged(`, `PUP.prepare(`, `r.pm === 'off'` and six removed names) are what `anim_frames` does (walking is the puppet when the sprite can be read, else the hop, never a frame); it lacked only the lab's `pm` switch, which has a test now, and each of the four calls removed from a copy of `ward_iso.js` fails a test there. Seventeen includes on `lab/anim.js` are a real lab page: the controls are in the page, the readout is the puppet read from the real sprite, the Leg outlines toggle switches `PUP.DEBUG.outlines`, `?source=procedural` shows the hop, the plant pads name the sides after the character (fails on a renamed label, a dead toggle, sides by screen). `ca.length > 0` could not fail. `rig`: 23 includes on the lab became the Rig lab page in Chromium (every rig offered, a rig that does not ship marked, the three figures drawn, the readout equal to the manifest, Game and Fast at 47 and 80 world px/s from `PACE`), the two regexes on `ui/ward_iso.js` became the `pm` test plus the preview off and on tests that already ran, and the regex on `ui/combat_art.js` became a real fight with the preview on that paints a hero and an enemy that both have a rig and asks for none. `lab_anim`: `/o\.aura !== false/` is a draw (an elite and a boss paint more with the aura on, a normal enemy the same either way; fails when the aura is always on, never on unless asked, or the switch is ignored), and every scene runs as a page. The dash checks of `puppet` (6) and `lab_anim` (2) are out: `hygiene` owns the rule. Unused: `dirname` (`lab_anim`), `EPS` and a dead closure (`attack_rigs`). `tests/graftwork_browser_lib.mjs` holds what the Chromium checks of these three suites share (`withChromium`, `labVisit`); the suites skip with a message when Playwright or Chromium is missing.

**Folds.** `kit_assets` joined `art_assets` (both guard the art on disk; the seven checks are unchanged and the suite still says what it guards). `lab_anim` stays: it is the only suite of the animation lab and named after it; there is no `lab` suite to fold it into, `puppet` and `rig` guard other things (they now also open the lab for their own controls), and a rename would only be a rename. Its remaining includes read the lab's own two files and were not on the list; every scene now also runs as a page, which is the way to replace them. The other suites that start Chromium (`post`, `grade`, `audio_mix`) keep their own serve-and-launch code.

**Tools.** `graftwork_art_build.py` started a full build for any argument, `--help` included, and once rewrote the committed manifest from an empty raw folder. Now `--help` and `-h` print the usage and exit 0 before any import (so without Pillow too), an unknown option exits 2 and names it, `--dry` without `--prune` and an empty `--out=` are refused, and a build, `--combat` or `--frames` with no raw PNGs in the raw folder stops before it writes (`--prune` needs none). `graftwork_kit_build.py` took its first argument, `--help` included, as the raw folder and wrote an empty kit manifest: the same guards. `graftwork_icons.py` (any argument rewrote the icons), `graftwork_sw_build.mjs` (any argument but `--check` rewrote the offline manifest) and `graftwork_profile.mjs` (any argument started a profile run that writes its result file) are guarded; `graftwork_rig_build.py` is argparse and was already safe, `graftwork_hygiene.mjs` and `graftwork_golden.mjs` write only on an explicit flag or path. The `hygiene` suite runs each tool with `--help`, `-h` and an unknown option and compares everything it could rewrite (size and modification time, and `git status`) before and after.

**Docs.** `LATE_GAME.md` named `graftwork_s3_intents`: it is `graftwork_intents`. `CLAUDE.md`: the Test map (70 suites, the new coverage of `hygiene`, `puppet`, `rig`, `lab_anim`, `ui_layout`, `art_assets`) and the tools.

Left for after the other branches land (files this branch was not to touch): `tests/graftwork_ui_layout.test.mjs` still carries its own copy of the harness that `graftwork_layout_lib.mjs` now holds, plus `OPEN_ON_PHONE` (empty), the stale `OPEN_DESK` set and the unused imports `GRAFTS` and `HEROES`; source-text assertions in `puppet` (`includes('PUP.walkPuppet(')`, `/hung \? 0 : 0\.025/`), `lab_anim` (`/o\.aura !== false/` on `combat_art.js`, the dash check) and `rig` (the lab and `ward_iso.js` and `combat_art.js` regexes); `lab_anim` into the lab suite and the kit asset checks into `art_assets` (no `lab` suite exists any more); `LATE_GAME.md` still names `s3_intents`; `graftwork_attack_rigs` has an unused `EPS`.

### Dead-code sweep (engine, data, tools) (branch `cleanup-sweep-engine`)

Scope: `graftwork/engine/`, `graftwork/data/`, `tools/graftwork_*`, the test helpers. Start `526d7ff9`. No rule, number, rng order or save shape changed; the UI side (`ui/`, `art/`, `lab/`, `main.js`) is another branch and gets the follow-ups below.

What went:
- **Export keywords** on 63 engine and data names nothing else imports (combat internals such as `runFx`, `drawCards`, `pickMove`; tuning constants of run.js, meta.js, meta2.js, seam.js, unlock.js, data/unlocks.js; ward.js helpers). `SEAM_CUTS_TURN` stays exported, the other Thread caps do not.
- **Test-only code** (no player reaches it): meta.js `setting`, `setSetting`, `tipSeen`, `markTip`, `isSeen` (the game reads `meta.tips` and `meta.seen` directly; the UI has its own `tipSeen` and `isSeen`); ward.js `sizeOf` (tests use `sizeKey`); data/index.js `ENEMY_LIST` (tests use `Object.values(ENEMIES)`); data/ward_kit.js `wallSegments` and the two assertions that only restated how it was built. combat.js `startPlayerTurn` is no longer exported (a suite imported it and never used it).
- **Duplicate helpers**: `data/helpers.js` (new) holds the content helpers that two or three files wrote out each: the enemy op builders `dmg blk debuff buff ST CUSTOM`, the card conditions `OVL TEMP LINE2`, `hasD hasB dmgOrBlock`, `isJunk`, `allCards`, and the Act 3 `SCHOOL_ORDER`. relics_more.js takes `rx first seam nSchools randFoe` from relics_thread.js, ward_kit.js takes `Wp` from ward_kit_big.js, meta.js takes `isObj` from unlock.js.
- **Rules written twice**: card cost (`rawCost` in combat.js, used by `effCost` and by the Leaden pick in afflictions.js, which summed the same terms a second time); the act encounter pool (`actEnemies` in run.js, used by the Ward's `pickMonster` and `pickElite` and by `tests/graftwork_lib.mjs`, which were three more copies of the filter); the school list (enemies_new2.js, `tools/graftwork_schools.mjs` and three suites take the ids from `SCHOOL_LIST`, seam.js takes the names from `SCHOOLS`; the Act 3 order with Blood second is a different order on purpose and is now written once). Already single before this pass: what a Price is (`isPriceMod`) and what the Line pays (`seamWorth`, read by the rail).
- **Settings defaults**: `SETTING_DEFAULTS` in engine/meta.js is the one table, every key with its default, including the display keys the UI fills on first read (`textSize textScale quality graphics fullscreen previewArt announce`). `DEFAULT_SETTINGS`, what a new meta holds, is that table without the display keys: same keys, values and order as before, so the golden master's meta hash and a new save are unchanged (adding `previewArt` or `graphics` to a new meta would have changed both; they are in the table, not in the new meta). The meta suite checks that `ui/settings.js DEFAULTS` and `ui/a11y.js A11Y_DEFAULTS` agree with the table.
- **Tests and tools leftovers** of the tests pass: `EPS` in attack_rigs, two unused data imports in ui_layout, `dirname` in lab_anim, `s3_intents` in LATE_GAME.md. Every tool is named in `CLAUDE.md` (hygiene `unmentionedTools` 0); no tool was unused, and the exports of the tools are each used in their own file.
- **Hygiene allowlist reasons**: `tests/graftwork_hygiene_allow.json` may carry `reasons` (entry: why it stays). The test fails on a reason whose entry is gone, `--prune-allow` drops it with its entry, the report counts entries without a reason and `--unexplained` lists them.

Numbers. engine + data: 57 to 58 files (one added, `data/helpers.js`), 642,280 to 641,145 bytes, 156 lines removed and 144 added. All files without `sw-manifest.json` and the allowlist: 186 lines removed, 201 added (the reasons map, the settings table and its test, the hygiene reasons code). Allowlist, before and after (whole file; in brackets the entries in engine/, data/, tools/, tests/):

| category | before | after |
|---|---|---|
| unusedExports | 20 (0) | 20 (0) |
| testOnlyDead | 88 (12) | 80 (4) |
| exportOnlyOwnFile | 200 (63) | 137 (0) |
| unreferencedLocals | 26 (0) | 26 (0) |
| duplicateHelpers | 232 (72) | 181 (23) |
| orphanAssets | 0 | 0 |
| unmentionedTools | 0 | 0 |
| total | 566 | 444 |

Kept on purpose (each carries its reason in the allowlist): `setStorage` (the storage seam the meta suites inject), `clearRoute` (the bots, the golden master and the Ward suites), `freeConnected` (a recipe invariant two suites check on every recipe), `GAIT_KINDS` (the puppet suite checks every gait against it); 23 duplicate helper entries that are different functions with a shared short name (`costOf` x3, `hits`, `num`, `isBare`, `seam`, and engine names that collide with a UI or lab helper), plus `plural` in engine/text.js, identical to the copy in ui/deckview.js (the UI side drops its copy). Also kept: the inert content hooks of review 3.4; `run.rerolls` and `meta.unlocked.relics` (saved fields); the four optional rows of review 4.2 (act-end heal, `queueGraft` bump, gold plus `goldEarned`, `inst.fused || []`): the gold sites would go through `R.gold`, which clamps at 0, so they are identical only while every amount is positive.

**Afflictions Proxy (review 7.2): left as it is.** Measured on the real run loop (`node tools/graftwork_strong.mjs 40 0`, 120 runs, CPU profile): the four traps take 0.6 percent of the CPU time (108 of 16,688 ms); the biggest costs are the garbage collector (20 percent), `cardSpec` (10) and its fx clone (7). An upper bound: the same command with the Proxy switched off (rules wrong, so not the same runs) took 14.3 and 13.7 s of user CPU against 13.0 and 14.3 s with it, inside the noise of the shared machine. The micro benchmark's 11 times is real per access but there are too few accesses to matter, and an explicit guard has to reproduce the event order (`afflGuard`), the duration refresh and the Infection rule at eight write sites plus the `ev.push` phase tracking. Not worth the risk for no measurable gain.

Proof of no change:
- Golden master (`tools/graftwork_golden.mjs`, tool version 3, `--only engine,assets,resume`): base `526d7ff9` recorded from its own checkout; the branch recorded from a clean checkout of the commit (never from the worktree being edited) after the consolidation batch (`ed702dd2`) and at the end (`ab576602`): `compare --common` 0 differences on 23,215 keys both times. The end also continued the base's saved payloads (`--resume-from`): 0 differences on 3,189 keys (every resume case and Ward fixture save continued to the same end, the same bytes saved at every point).
- Balance table, same seeds and N on base and branch (`ward_sim 60 0 strong`, both pools; `ward_sim 20 0 all`; `sim 20 0`; `strong 40 0`; `unlocks 200 30`): identical line for line at `ed702dd2` and at `ab576602` (58 lines; strong all pool 23 / 22 / 25 of 60, start pool 23 / 24 / 35, unlock pacing median strong 38, careful 48, sloppy 151).
- `node tests/run_graftwork.mjs`: 72 of 72 suites pass (569.5 s wall, 528 s CPU, 4 workers, on a shared machine). Hygiene clean.

Follow-ups for the UI side (one line each):
- `ui/settings.js:18`: `export const DEFAULTS = Object.fromEntries(['master', 'sfx', 'music', 'muted', 'screenShake', 'reducedMotion', 'fastWalk', 'colorblind', 'textSize', 'textScale', 'quality', 'graphics', 'fullscreen', 'previewArt'].map((k) => [k, SETTING_DEFAULTS[k]]));` with `import { SETTING_DEFAULTS } from '../engine/meta.js';`
- `ui/a11y.js:7`: `export const A11Y_DEFAULTS = Object.fromEntries(['flashes', 'highContrast', 'colorblindMode', 'announce'].map((k) => [k, SETTING_DEFAULTS[k]]));` (same import).
- `main.js:105`: `st.master ?? SETTING_DEFAULTS.master` (and `sfx`, `music`); `main.js:112`: `TEXT_STEPS.includes(st.textScale)` from ui/settings.js instead of the literal list; `main.js:87`: `QUALITY.includes(...)` from ui/settings.js.
- `ui/title.js:474`: `st.assist = { ...SETTING_DEFAULTS.assist };` (unreachable today: `migrate` always fills `settings.assist`); then delete `ASSIST_DEFAULT` in engine/assist.js, which disagrees with the table (`gentle: false`). It stays here because title.js still imports it.
- `ui/deckview.js:18`: delete the local `plural`, `import { plural } from '../engine/text.js'`, and export `plural` there in the same commit (exporting it first would be a new unused export).
- `ui/a11y.js:9` `SCHOOLS`, `art/cards.js:33` `SCHOOL_ORDER`: `SCHOOL_LIST.map((s) => s.id)` from data/schools.js (same order); `ui/seam_ui.js:19` `SCHOOL_NAME[school]`: `SCHOOLS[school].name` from data/index.js; `ui/a11y.js:11` `BASE_SCHOOLS` holds the `color` values of `SCHOOL_LIST` again.
- `ui/templates.js` `isObj`: import it from engine/unlock.js.

Seen, not touched (a behaviour change):
- `defaultMeta()` copies `DEFAULT_SETTINGS` shallowly, so a new meta's `settings.assist` IS the module's object: toggling Assist on a brand-new profile writes into the defaults, and every later `defaultMeta()` or `migrate({})` in that page starts with those Assist options. Nobody sees it today (Erase keeps the settings by design), but the fix is one line: `settings: { ...DEFAULT_SETTINGS, assist: { ...DEFAULT_SETTINGS.assist } }`.
- The old Ward walk of review 7.3 (`shortestPaths`, `T.move`) is still kept alive by the sim and `graftwork_ward`.

### Dead-code sweep (ui, art, lab) (branch `cleanup-sweep-ui`)

Scope: `graftwork/ui/`, `graftwork/art/`, `graftwork/lab/`, `main.js`, `sw.js`. Start `526d7ff9`; merged with the engine sweep (main `90620240`) before the last round. Nothing a player can see changed.

**Removed.**
- `ui/lights.js` (117 lines): registered by three backdrop themes, the boss plate lamp and `main.js`, never rendered (no call of `render` or `shadow` outside its own test). The module, the registrations (`registerLights`, the `lights` tables, `app.lightsApi`, the plate's `lampId`), `ambient` / `ACT_AMBIENT` (the colour of the lightmap pass) and the fx test block.
- `art/backgrounds.js`: the eight `*Draw` wrappers, `stat`, `marketNear`, `ORGANS`.
- The 26 unreferenced locals of ui/ and art/ (the event screen's old silhouettes `SIL` / `SETS`, `PH_TINT`, `col2`, `wrapLimitK`, `clampN`, `NEUTRAL`, `ev`, `dkc`, `lim`, six names heroes.js destructured, `rivetPx` and the write-only `rivetSprite`), `void byId` / `void COL` in title_scene and shop's `stripTitle`.
- The 20 unused exports (among them `drawImageSmart` and the `setSmoothing` only it used, `flushTips`, `drawPinnedTip`, `graftLines`, `resetTitleSprites`, `CELL`, `cellXY`, `shadowOf`, `currentWallH`, `dropLayer`, `dropMonsters`).
- Unused imports in 23 files, and what they alone kept alive: `cellBox`, `gearIcon`, `clampText`, `keywordSection`, the chrome namespace object and default export, the two chrome widgets only that object reached (`dial`, `badge`), `KEY_LIGHT`, re-export imports (`CARDS`, `EASE`).
- Code only tests reached, with the assertions that checked it: `drawStrainMeter`, `drawDeckIcon` and the five Thread pictogram wrappers of art/icons.js, `drawCardText` and its `tokens`, `contentRect` and `fitFontSize` of the template loader, `skipThreadLesson` and `THREAD_LESSONS`, the never shown `forge` and `shop` tip texts, `CARD.fold`, `BUDGET.victory` and `BUDGET.death`.
- `export` dropped from the 137 names of ui/, art/ and main.js that only their own file uses.

**One leaf module, `ui/util.js`** (no imports; core.js re-exports `clamp` and `lerp`). Only copies whose text was the same as the kept one: `TAU` (12 files), `lerp` (5), the Math.max / Math.min `clamp` (core, ward_kit_iso, the animation lab), the ternary clamp as `clampOrdered` (combat_art, post, puppet, transitions, attacks: it differs from `clamp` for inverted bounds and -0, so it is its own helper), FNV-1a as `hash01` (ward_iso, ward_kit_iso, title_scene) and `hash32` (cards, event; icons and plates coerced with `String(s)`, their calls are `hash32(String(x))`), the guarded offscreen canvas `{ c, x }` (ward_iso, ward_kit_iso, title_scene, puppet, title_logo), the `{ c, g }` canvas with the OffscreenCanvas fallback (chrome, skin), `mulberry32` (backgrounds, plates), the Math.random range (combat, seam_ui); `TW` / `TH` live in ward_kit_iso.js and ward_iso.js re-exports them.

**Follow-ups of the engine sweep, done:** `ui/settings.js` `DEFAULTS` and `ui/a11y.js` `A11Y_DEFAULTS` pick their keys from `SETTING_DEFAULTS`; main.js reads the volumes from it and `TEXT_STEPS` / `QUALITY` from ui/settings.js; deckview imports `plural` from engine/text.js; a11y `SCHOOLS` and `BASE_SCHOOLS` and cards `SCHOOL_ORDER` come from `SCHOOL_LIST`, seam_ui reads the school name from data `SCHOOLS`, templates imports `isObj` from engine/unlock.js. **Not done:** title.js filling a missing `settings.assist` from `SETTING_DEFAULTS.assist`. It is not unreachable: `graftwork_assist` reaches it with a meta that has no assist block and expects Gentle foes off (`ASSIST_DEFAULT`), the table says on. `ASSIST_DEFAULT` stays in engine/assist.js; making the two agree is a behaviour decision.

**Numbers.** Game source (ui/, art/, lab/, main.js) against main `90620240`: 57 files, 624 lines removed, 257 added (most added lines are rewritten `export` and import lines), one file deleted (`ui/lights.js`), one created (`ui/util.js`, 36 lines); bytes: ui 1,356,090 to 1,335,361, art 548,753 to 541,752, lab 110,138 to 110,084 (27.8 KB less). Tests: 8 files, 42 lines removed, 8 added. Allowlist (whole file, then the ui/art/lab/main share):

| list | `526d7ff9` | main after the engine sweep | now |
|---|---|---|---|
| unusedExports | 20 (20) | 20 (20) | 0 |
| testOnlyDead | 88 (76) | 80 (76) | 68 (64) |
| exportOnlyOwnFile | 200 (137) | 137 (137) | 0 |
| unreferencedLocals | 26 (26) | 26 (26) | 0 |
| duplicateHelpers | 232 (160) | 181 (158) | 131 (109) |
| orphanAssets, unmentionedTools | 0 | 0 | 0 |

Every entry that stays carries a written reason (199 reasons, `--unexplained` lists none).

**Kept on purpose.** The 64 test-only exports of ui/ and art/ are test seams (`reset*`, `__set*`, `lastActors`, `kitLog`, stats counters), tables a suite holds the data to (`BODY_KEYWORDS`, `SCHOOL_SHAPES`, `CODEX_RULES`, `BUDGET`, the grade tables), entry points to real behaviour (`defaultPose`, `footPoint`, `percentLabel`, `glossaryEntry`, `setLineScale` for the legacy-against-current line test) or names reached by string (`setIntensity`, `audioState`, `setLowpass` through `audioCall`). `ui/perf_flags.js` stays (the profiler's `--flags` A/B switches); `ui/frame_state.js` is the frozen-screen bookkeeping now, not the dead skip of the review; `ui/templates.js` and `ui/rig.js` are the live previews. Same text, not the same function: `win` / `nav` of fullscreen, install and offline (each closes over its own mockable host), the xorshift closures of ward_iso and ward_kit_iso. `ui/ward_kit_iso.js` keeps an unused import of `propAt`: it is the only user of data/ward_kit.js `propAt`, so deleting it makes an unused export on the engine side (follow-up there: delete `propAt` and this import together).

**Efficiency (review 4.5), not done.** `percentLabel`, the App row and `wallPlan` were cached by the performance pass. A cache for `layoutText` with `fit` cannot keep the draw log: its search measures with `save`, `font`, `restore` on the main context, and those calls are what a cache would remove. Measured in the golden draw logs (desk, motion, whole scene): 7,810 such triplets in `title` (3.4 percent of the root context's calls), 23,307 in `combat` (2.1), 52,440 in `ward_built` (4.3), 152,481 in `shop` (11.6, about 250 triplets a frame). Pixels would not change; the proof rule of this pass would, so it is a proposal. The per-frame allocations in the Ward (room info objects, layer keys) do not show in `canvasCalls()` and were left.

**File structure (review 5).** Nothing to merge or delete without a behaviour change beyond `ui/lights.js`. Proposal unchanged from the review: do not split `ui/combat.js`; the event picker and the two combat pile modals onto `cardGrid` (review 3.4) is a pixel change.

**Proof.** Golden master `--only ui,assets` (7,689 keys): base `526d7ff9` against the branch after the exports commit and after `ui/util.js`, 0 differences each; main `90620240` against the final commit `ffe748c6`, 0 differences. With both previews on (`?preview=1`, Playwright, frozen clock, seeded random): the game (title, two Wards, two fights, shop, deck view, reward, Settings, desk and phone) 18 of 18 pictures identical to main; the lab pages (`lab/art.html` twice, `lab/anim.html` rig lab, viewer, compare, map, battle) equal to main within the spread of main against itself (art.html repaints as its images arrive: 0.03 to 0.26 percent of pixels between two captures of main; the anim lab 0 to 17 pixels at most 2 levels, the map scene 0 against main's second capture). `node tests/run_graftwork.mjs`: 71 of 71.

**Found, not touched.** `void x;` silencers hide unused bindings in forge, shop, title_logo, tooltips, transitions, ward, attacks, cards and audio; some compute through calls with effects (`RUN.forgeHeal`), so each needs reading. `depthOrder`'s `focus` and the block painters' `dark` parameter are unused; the Ward suites pass `focus` positionally. The unused-import check of this pass first missed uses behind a spread (`...rigGait(id)`): fixed, every removed import was checked again.
