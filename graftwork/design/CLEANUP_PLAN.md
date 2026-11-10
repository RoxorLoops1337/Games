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
- **Templates.** `TEMPLATE_ART = false` in `ui/templates.js`: nothing is requested until `assets/ui/manifest.json` lands (`design/ART_MODULAR.md` section 5).
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

- **Code.** Game source (`graftwork/**/*.js`): 22 files changed, 121 lines added, 782 removed; one file deleted (`ui/map.js`, 543 lines); 2,617,858 to 2,572,933 bytes (44,925 less). Balance tools (sim, strong, ward_sim, tiers, schools, cardsweep, audit, unlocks): 94.4 to 87.5 KB with the three bot files folded into one driver; `tools/` as a whole 1154 lines added, 1222 removed (the golden tool grew by 6 KB: the Ward fixtures, the closing trace, the comparison flag). Tests: 39 files changed, 686 lines added, 434 removed; 76 suites on main, 77 on the branch (`ui_map` out; `ui_event` and `retire` in). Runner (`node tests/run_graftwork.mjs`, 4 workers), measured back to back on a quiet machine at the `b0ed267f` round: main 74 of 74 in 152 s wall and 407 s of CPU, the branch 75 of 75 in 163 s wall and 429 s of CPU. About 7 percent slower: the wall time is the layout sweep, the longest suite, which now sweeps the reward both bare and as the Ward makes it, and the monkey walks a Ward where it clicked a map node.
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
