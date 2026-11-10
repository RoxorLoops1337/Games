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

- Ward saves: shape, field order, rng use and the order of every random draw are unchanged. Proof: `tests/fixtures/graftwork_wardsave_5f3e252.json` (28 saves recorded on the baseline at every kind of moment, each with the end it reaches) is resumed by `tests/graftwork_regression.test.mjs`, and the Ward balance table and per-run trace hashes are identical before and after (Results).
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
- The bot (`tools/graftwork_strong.mjs`) learned two things first: it scores every card with and without the declaration and declares when the Thread gains (`GW_DECLARE=0` switches it off), and it holds a "Cut the Line." card while another affordable card could still start or extend the Line (`GW_HOLDCUT=0`). The second made no measurable difference (the middle column was run before it, except N = 1000).
- Unlock pacing stays in its targets (strong 33 to 40, careful 45 to 55).

Not fixed, found on the way (owner decisions):

- **Resonance Lens** (rare relic, "each school at Resonance 3 counts as Resonance 5") does nothing: it sets tier 5 and every rule asks for 3 or 6. The text itself promises nothing a player could see. Either make it 6, which is strong, or redesign it.
- The Thread half of resonance (tier 3 adds a stitch to that school's payout, tier 6 pays its cuts twice) is in the engine and in no text.
- Relic and hero hooks on a cut check `p.paid === false`, a field the engine never sets, so a 4th cut in a turn (which pays nothing) still triggers them. Rare.
- A waived Price still reads on the graft patch of the card: the patch does not mark it as waived.
- The golden master must be recorded again after this branch: the engine traces change by design.

### Classic retirement

What the player sees is the list under "Classic retirement: what changes for the player". Measured on the branch against main at `428b6499`:

- **Code.** Game source (`graftwork/**/*.js`): 22 files changed, 121 lines added, 783 removed; one file deleted (`ui/map.js`, 543 lines); 2,663,622 to 2,618,607 bytes (45,015 less). Balance tools (sim, strong, ward_sim, tiers, schools, cardsweep, audit, unlocks): 92.7 to 86.2 KB with the three bot files folded into one driver; `tools/` as a whole 1142 lines added, 1207 removed (the golden tool grew by 6 KB: the Ward fixtures, the closing trace, the comparison flag). Tests: 35 files changed, 667 lines added, 420 removed; 73 suites on main, 74 now (`ui_map` out; `ui_event` and `retire` in). Runner (`node tests/run_graftwork.mjs`, 4 workers, one run each, back to back on a shared machine): main 73 of 73 in 286 s wall and 462 s of CPU, the branch 74 of 74 in 251 s wall and 471 s of CPU. The wall time is the layout sweep, the longest suite; read it as unchanged.
- **A Ward run did not change.** Same seeds before and after, three ways:
  - the balance table (`tools/graftwork_ward_sim.mjs 60 0 <policy>`, both unlock pools) and unlock pacing (`tools/graftwork_unlocks.mjs 200 30`), recorded on `5f3e252b` before the first change and again on the finished branch, are identical line for line:

    | strong, A0, N=60 | marrow | wick | odile |
    |---|---|---|---|
    | all pool | 18/60 (30%) | 25/60 (42%) | 29/60 (48%) |
    | start pool | 21/60 (35%) | 23/60 (38%) | 29/60 (48%) |

    random 0/180, sloppy 0/180, passive 1/180 (odile); unlock pacing strong median 39 runs (p10 36, p90 43), careful 45, sloppy 144.
  - 1080 runs (six policies, both pools, ascension 0 and 5), each hashed over its serialized state at every morning and at the end: every hash identical;
  - the golden master, below.
- **Golden master.** Base `428b6499` recorded with the tool of main, the branch with `--classic-rng --resume-from <base>`, `compare --common`: 25,043 keys identical, 1,348 different (engine 408, ui 864, assets 76, resume 0).
  - Identical: all 24 Ward runs the two records share (3 heroes x 8 seeds, 3,689 trace steps: every morning, walk, fight, reward, graft, shop, forge and event choice with hp, gold and the rng state after it; final deck, relics, stats, the save bytes), all 36 resume cases (the base's own saved payloads continued by the new code to the same end, and the bytes the new code saves at the same point), every card, graft, potion, enemy and building probe, and the draw streams of 15 of the 33 UI scenes and 6 of the 8 asset scenes in all four variants: `combat`, `combat_boss`, `combat_elite`, `combat_three`, `combat_tips`, `end_won`, `forge`, `forge_temper`, `pause`, `reward_boss`, `ward_morning`, `ward_midday`, `ward_evening`, `ward_night`, `ward_built`; `combat_art`, `combat_art_boss`, `shop_ward`, `ward_kit_morning`, `ward_kit_built`, `ward_kit_night`.
  - Different, every one because the old tool drove that probe or scene on a Classic run, or because the title changed:

    | Keys | Why |
    |---|---|
    | `engine/runs/<hero>.ward.{a0,deep}/{endInfo,metaAfter}` (12) | One career profile played the Classic and the Ward seeds of a hero in a row; it now holds Ward runs only. The 24 run traces themselves are identical. |
    | `engine/probes/relic/<relic>/shop` (96, every relic that is not a Ward relic) | The shop after the probe fight was a Classic shop; every shop is now the Dispensary (plans for sale, Ward relics in the pool). |
    | `engine/probes/event/<event>/choiceN/next` (145) and `/run` (155) | The probe run went to the map after an event and carried a map; it now goes back to the Ward. `choices` and `result` of every choice are identical. |
    | `ui/title`, `title_intro`, `title_select`, `title_veteran`, `assets/title_kit` | The title changed: no mode tag on the Daily slab, no switch on hero select. |
    | `ui/settings`, `settings_app`, `install_help`, `codex`, `archive`, `wardrobe` | Drawn over the title menu. The draw log of the two builds differs only by the `WARD` tag behind them. |
    | `ui/deckview` | Opened from the map screen in the old script, from the Ward now: the screen under it differs. |
    | `ui/graft`, `graft_decline`, `event`, `event_picker` | The hash after `enter` and after `inputs` is identical; the last part differs because leaving the screen went to the map and now goes to the Ward. |
    | `ui/end_dead` | Identical through `enter` and `inputs`; the last part is the title it returns to (the tag). |
    | `ui/reward`, `assets/combat_art_kill` | The elite's relic was rolled from the Classic pool, which had no Ward relics (Blunt Shears became Spare Fuse). The fight before it is identical. |
    | `ui/shop` | The scene was a Classic shop; it is the Dispensary now (the Building plans button, another relic on the shelf). `assets/shop_ward`, the shop of a Ward run, is identical. |

    Only in the base: the Classic runs, their resume cases, the scenes `map` and `map_act3`. Only in the branch: an Endless run per hero, the Daily modifiers on Ward runs, the 28 Ward fixture saves, the closing of the 20 old saves.
  - Check of the engine rows: the tool of main was copied outside the repo and four lines of it changed, so that the career plays Ward runs only and the relic shop and event probes treat their run as a Ward run without a map (the game code of the base untouched). Recorded from the base, its engine section equals the branch on all 13,478 common keys, 0 differences.
- **Old Ward saves resume.** 28 saves recorded on `5f3e252b` (every Ward hour, mid walk, fights, reward, graft, event, shop, forge, the Grafter) reach the same end, to the hash of the final save; the golden master continues the base's own saved payloads to the same end and writes the same bytes at every save point.
- **Old Classic saves are closed.** 20 saves from before the Ward: each one leaves the meta exactly as the Abandon button would (compared field by field against that path), is deleted, and sets the notice.
- **Hygiene.** `tools/graftwork_hygiene.mjs` is clean; five allowlist entries that named deleted code were pruned and nothing was added to the list. Dead code the retirement left behind was deleted, not listed.
- **Real browser** (Chromium, 1280 x 720 and 1000 x 462 at DPR 2): title without mode tags, hero select without the switch, Begin lands in the Ward, a route into a fight, reward, back on the Ward; a Classic save gives the notice once and no Continue, a click under the notice does nothing, a reload shows no second notice and counts nothing twice; three old Ward saves (evening, mid walk on a reward, the Dispensary) resume with the save unchanged. No page error.
