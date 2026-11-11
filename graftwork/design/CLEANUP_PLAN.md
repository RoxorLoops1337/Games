# Graftwork cleanup and optimisation

Baseline: main at `1449c24d` (installable app and offline copy). End of the code work: `228c8db7` (the UI dead-code sweep merged); this docs pass changes no code. Every phase kept the game's behaviour, visuals, saves and RNG streams identical unless this file says otherwise.

## Summary

### Final numbers

| measure | before | after | source |
|---|---|---|---|
| game source (`graftwork/**/*.js` without assets): files, lines, bytes | 134 files, 34,444 lines, 2,651,395 bytes | 131 files, 34,117 lines, 2,648,293 bytes | `git ls-tree` at `1449c24d` and `228c8db7`; `git diff --shortstat`: 121 files changed, 2,901 lines added, 3,228 removed. The net is small because the previews (rigs, painted UI parts, templates), the baked grade, `ui/util.js` and the frozen-screen bookkeeping were added while the dead code went |
| Ward art (`assets/ward`) | 347 files, 6,518,072 bytes | 189 files, 3,918,226 bytes | `git ls-tree -l`; the painted UI parts (29 files, 1.19 MB) and rigs (19 files, 0.23 MB) are new and off by default |
| offline copy (`sw-manifest.json`) | 662 files, 11,582,035 bytes | 549 files, 10,406,858 bytes | the `count` and `bytes` of the committed manifest at both commits |
| opening the Ward, 1280 x 720, cold cache | 167 requests, 4.12 MB | 34 requests, 0.81 MB | Results, "One path per job" (real Chromium) |
| decoded images once the Ward is open | 87.9 MB in 210 images | 26.0 MB in 74 images | same |
| Act 2 fight tick (procedural enemies), 1x / 4x CPU | 2,219 ms / 10,021 ms | 36.7 ms / 195 ms | Results, "Performance and bug fixes" (no GPU, read the ratio: 60x) |
| fresh Ward tick, 1x / 4x CPU | 48.0 ms / 226.5 ms | 30.1 ms / 124.5 ms | same |
| a fight under Pause / title under Settings, 1x | 28.8 ms / 38.1 ms | 5.1 ms / 6.4 ms | Results, "Frozen screens under modals" |
| suites | 70 at the baseline (78 at the peak, after the rigs) | 71 | `git ls-tree` of `tests/graftwork_*.test.mjs`; Results, "Tests and tools" |
| hygiene allowlist | 623 entries at phase 0 (`78db835c`): unused exports 25, test-only dead 89, `export` only used in its file 211, unreferenced locals 32, duplicate helpers 264, unnamed tools 2; no reasons | 199 entries: test-only dead 68 (test seams), duplicate helpers 131 (different functions sharing a name), every other list 0; 199 of 199 carry a written reason | the allowlist file at both commits; `node tools/graftwork_hygiene.mjs` now: clean |
| runner (`node tests/run_graftwork.mjs`, 4 workers, shared machine) | 435.4 s wall, 501 s CPU (78 suites, old runner) | 416.7 s wall, 504 s CPU (71 suites, new runner); this docs pass: see the last line of this table | Results, "Tests and tools"; read the CPU, the machine is shared |
| `graftwork/CLAUDE.md` | 64,308 bytes, 274 lines (37 KB at the audit) | under 32 KB, under 160 lines, every file mapped and checked by `hygiene` | this pass |
| this pass, runner | | 71 of 71 suites, 146.2 s wall, 503 s CPU, 4 workers | `node tests/run_graftwork.mjs` on `cleanup-docs` |

### What a player can see changed
1. The Classic node map is retired: every run, the Daily included, is a Ward run; a saved Classic run is closed like Abandon, its progress counted, with one notice on the title.
2. Rules fixes: "Cut the Line.", Slip Knot, Granny Knot, Odile's declaration (a tab on the Thread rail, key G; her max HP 92 to 88), The Grafter, Free Sample, the cut hooks, the Locksmith's text, six resonance texts and their Thread half, Resonance Lens (Elite and Boss fights count Resonance 3 as 6); 12 junk cards nothing could add are gone.
3. Act 2 and 3 fights are about 60x cheaper (the baked grade); the Ward asks for 34 files instead of 167; monsters no longer vanish after a fight.
4. Pause really pauses: every screen under a modal is frozen (an enemy turn no longer plays on behind Settings or the deck view).
5. The map walk is the puppet (title monsters walk too); a room is its block until its own kit pieces arrive, never a painting.
6. Two previews, off unless asked for (`?art=1`, `?rig=1`, `?preview=1` or Settings > "Painted art (preview)"): painted UI parts and painted character rigs.

### What was done, which PR, proof used

| step | PR | proof |
|---|---|---|
| Phase 0: golden master recorder (`tools/graftwork_golden.mjs`), hygiene audit and test with an allowlist | #2715 | the tools themselves: the reference record, the allowlist |
| Baked enemy grade, cached Ward backdrop, one quality controller, `V.born` and the templates 404 | #2716 | per-tick timings in real Chromium, pixel diffs, `perf3` and `grade` written to fail on the old code |
| Rules fixes, 12 junk cards removed, saves with unknown ids load | #2717 | `rules_fixes` blocks that failed before, balance at N = 1000, golden engine traces |
| One path per job, load only what is drawn | #2718 | golden master (only the `assets` section moved, by design), request counts and bytes, 12 pixel comparisons with 0 pixels different, `ward_loading` |
| Screens under a modal freeze | #2719 | `frozen` (11 blocks, each failed on the old loop), 30 pixel comparisons, golden master, tick timings |
| Classic map retired | #2720 | identical Ward balance tables, 1,080 run hashes, golden master, the 28 Ward fixture saves resume to the same end, the 20 Classic saves closed like Abandon |
| Rules leftovers | #2721 | `rules_fixes` sections 9 to 12, Lens balance at N = 500 |
| Character rigs (preview) | #2722 | golden master equal to the base with the preview off, `rig` (22 checks), no request under `assets/rigs/` while off |
| Rules follow-ups | #2723 | `rules_fixes` sections 13 to 18, balance at N = 500 |
| Tests and tools: tooltip sweep suite, counted budgets, folds 78 to 71, frozen bot tuning | #2724 | recorded sweeps identical frame for frame, assertions compared as multisets, 432 run hashes |
| Painted UI parts (preview) | #2725 | golden master: only the Settings screen (the new row) differs, `ui_art` (13 checks) |
| Leftovers of tests and tools: shared layout harness, behaviour checks instead of source text, tool argument guards | #2726 | byte identical layout records, mutations of the code that each fail a check |
| Dead-code sweep (engine, data, tools) | #2727 | golden master 0 differences on 23,215 keys, balance tables identical line for line |
| Dead-code sweep (ui, art, lab), `ui/util.js`, `ui/lights.js` removed | merge `228c8db7` (no PR number in the history) | golden master `--only ui,assets` 0 differences, 18 preview pictures identical |
| Docs: CLAUDE.md rewritten, the module map checked by `hygiene`, `design/` pruned, this summary | branch `cleanup-docs` | `hygiene` (new module map check, proved on a throwaway repo), the runner |

Open after the cleanup (owner decisions, each recorded below): Back-Alley Swap moves a graft with strip then add (charges the Price again and can lose the graft); the Knitter and Scissor Nurse passives have no player text; a voided cut still triggers Bobbin and Pin Cushion; `ASSIST_DEFAULT` disagrees with `SETTING_DEFAULTS.assist` on `gentle`; the four layout faults of `OPEN_WARD`; Ascension 1 has no Ward rule.

## The plan as approved

What the audit found on the baseline: 134 source files (about 2.6 MB of JS), 75 test files, 16 tools; little function-level junk, but stacked fallbacks from superseded systems (Ward rooms: kit over tall paintings over low paintings over blocks; the map walk: puppet over painted 4-frame walks over a step swap over the hop) and about 2.7 MB of downloads nobody saw when the Ward opened; `clamp`, `TAU`, `hash` written up to nine times; settings defaults in three files; CLAUDE.md 37 KB of history and `design/` 0.5 MB with five perf JSON dumps.

Phases: 0 safety net (golden master, hygiene), 1 dead code, 2 one path per job, 3 consolidation, 4 docs; the performance fixes and the rules fixes in parallel as their own steps, each with tests and before and after numbers. Owner decisions, all approved and done: screens under a modal freeze; the Classic map is retired in its own PR; the 12 unreachable junk cards go (saves naming them keep loading); `lab/rooms.html` goes; the rules bugs are fixed, each with a regression test and a balance re-check. The review's list of performance and bug findings was done in full (Results, "Performance and bug fixes").

Rules for everyone: never rename save keys, ids or the folder; a Ward run saved before the cleanup resumes after it; no behaviour change hides inside a cleanup commit; run only Graftwork suites; no em dashes.

## Results

### Performance and bug fixes

Method: real Chromium (Playwright, headless), 1000 x 462 at DPR 2 (canvas 1643 x 924), Graphics High, Effects off, service worker blocked; `app.stop()`, then `app.tick(1/60)` plus a 1 px `getImageData` flush, median of 40 ticks (24 under throttle), best of 2 or 3 runs. Before = `7695b8cf`. No GPU and shared cores: read ratios. Pixel comparisons: same seed, seeded `Math.random`, frozen clock, reduced motion.

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

- **Baked grade** (`art/grade.js`; no context is given a filter any more). Pixel difference per channel (0 to 255): Act 2 fight mean 0.095, max 7, 0.36 percent of pixels off by more than 2; Act 3 boss mean 0.033, max 7. Opaque body pixels are identical; what differs is low alpha (glows, hatching, edges) where the old filter worked on 8 bit premultiplied pixels. Graphics Low (no grade, as before): 0 pixels differ. Browsers without canvas filters now show the same graded figures as Chrome; the fallback hero's wet glints differ more (max 23 on about 60 pixels).
- **Ward backdrop**: one baked layer, one blit; the gutters show a still frame of it.
- **One quality controller**: `post.js autoQuality` is gone; with 20 s of 33.3 ms frames on the idle title, Effects High used to fall to Low within 5 s, now it stays.
- **`V.born`**: cleared on enter (a monster could be invisible after returning from a fight; reproduced by test on the old code).
- **Templates**: nothing is requested until the painted art is switched on (now the preview switch, `ui/preview.js`).
- **Small ones**: mip level 0 is the decoded image, `unlockState` once per visit, display-mode queries once per window, the wall plan kept until a room changes (proven by call counts in `perf3`). Not done: the App row of Settings is still asked every frame (the install offer can arrive while Settings is open).
- Tests: `grade` (colour maths against the CSS filter definitions, 63 enemies and 3 heroes, a real Chromium fill) and `perf3` (one check per fix), each run against the old code first and failing there.

### Rules fixes (branch `cleanup-bugs`)

Every item has a regression test in `tests/graftwork_rules_fixes.test.mjs` that failed on the code before the fix (`RF_ALL=1` lists every failing block). The engine is unchanged for a run that holds none of the cards below.

- **Snip, Tailor's Shears, Hemostatic Snip ("Cut the Line.")** did nothing; the effect now cashes the Line as a cut (same payout, hooks, 3 paying cuts a turn, an enemy can cancel). Shears and Hemostatic Snip join the Line first and then start the next one; Snip has no school and leaves the rail empty; a replay does not cut twice.
- **Scissor Loop, Surgeon's Knot, Surge Loop, Spent Thread** ("when it cuts the Line") never fired; they now fire on a cut by school and by effect. **Reef Knot** gives 1 Echo on every cut. **Barbed Knot, Whip Stitch, Running Stitch, Blanket Stitch, Cross Ply, Mattress Stitch, Fine Gilt Thread, Clove Hitch, Tight Seam** ("when it extends") no longer fire on a cut.
- **Slip Knot** now goes Slack instead of cutting; **Granny Knot** ties a knot on any standing Line with no school count.
- **Odile's declaration** ("once per turn, a card may be declared Gilded") had no engine and no control: a tab on the Thread rail (click, key G, gamepad left trigger). **Odile's max HP is 88 (was 92)**, the one retune.
- **The Grafter, Locksmith, Understudy's Shadow and every Act 3 jam, silence or fray** read a private card list that missed the 20 Thread cards and 51 grafts; fixed.
- **School resonance**: six of 14 texts were wrong (Ember 3 and 6, Echo 3 and 6, Hoard 6, Gilded 6); the rule did not change, the test rebuilds the text from the engine.
- **Free Sample** waives every kind of Price (it used to waive 7 kinds; 27 grafts were charged in full, max HP prices before the waiver); eight grafts with a Price inside a hook got it as its own mod. **Numb** keeps the same prices. **Ascension 8** text names the reroll lock. The locked heroes' stale unlock sentence is removed.
- **Codex, Junk tab**: 7 cards (was 19); the 12 nothing could add are gone (proven by a walk over every registry; a test fails on any junk card without a source).
- **Saves**: a run save naming a card, graft, relic or potion that no longer exists drops that entry and loads; a save without such ids is returned byte for byte.

Balance (strong bot, Ascension 0, all pool, target 25 to 40 percent per hero, spread at most 12; same seeds before and after). Win percent Marrow / Wick / Odile:

| measure | before | after the fixes, no retune | final (Odile 88 HP) |
|---|---|---|---|
| all pool, N = 60 | 30 / 42 / 48 | 43 / 28 / 45 | 45 / 33 / 42 |
| all pool, N = 500 | 31 / 36 / 37 | 35 / 35 / 40 | 36 / 34 / 38 |
| all pool, N = 1000 | 32 / 33 / 37 | 33 / 32 / 41 | 34 / 32 / 39 |
| start pool, N = 500 | 43 / 45 / 49 | 42 / 47 / 56 | 41 / 47 / 52 |
| random, sloppy, passive wins of 180 | 0, 0, 1 | 0, 0, 0 | 0, 0, 0 |
| unlock pacing (200 players, 30 runs): strong, careful median | 39, 45 | 39, 48 | 39, 49 |

N = 60 is too small for a 12 point band (one standard deviation is 6 points); the verdict is read at N = 1000: 34 / 32 / 39. The fixes moved one hero: Odile's declaration is worth about 6 points (`GW_DECLARE=0`); 92 to 88 HP brought her from 41 to 38.5. The strong bot learned to declare and to hold a "Cut the Line." card (`GW_HOLDCUT=0`). The five items found here and not fixed were all fixed in "Rules leftovers".

### One path per job, load only what is drawn (phase 2)

Before = `428b6499`.

- **Ward rooms: the modular kit, else the procedural block.** The painted room renderer is gone (tall and `_low` paintings, wall crop, cross-fade, dark copy). A room is its block until the images of ITS recipe have settled (`KR.recipeFor`), the kit from then on.
- **Map walking: the puppet, else the hop.** The painted 4-frame cycle, the `_b` step swap, `PUPPET_PREF` and `wantsPuppet` are gone; the title monsters use the Ward's `gait` and `drawActor`.
- **Loading: nothing ahead.** `assets.preload`, `kitPreload`, the whole-kit gate are gone; a screen asks for what it draws; the plans in hand are asked for when the Ward opens and when the hand changes.
- **Pipeline.** `tools/graftwork_art_build.py --prune` (new) brought `assets/ward` to what is drawn: 39 room entries, 2 card entries and 45 fields out of the manifest, 158 files deleted (38 `_low` paintings, 18 tall paintings no card shows, 64 walk frames, 38 `_b` step frames). The manifest names exactly the files on disk (tested). `lab/rooms.html` and `lab/rooms.js` are deleted.

What a player can see: a room is a block while its kit pieces download (it used to be a block, then its painting, until the WHOLE kit was in); the title monsters walk with the puppet; an illustration not in hand shows its glyph until it arrives; "Stitching rooms" shows only while a built room waits; kit rooms keep the decoded size across a quality change. Kept on purpose: `plot_empty` (the painted plot tile), the see-through block (alpha 0.55), kit images exempt from eviction (25 MB decoded at @2x), `KR.recipeHeld` for a room that grows.

Real Chromium, cold cache, title until idle, then a fresh Ward:

| | before | after |
|---|---|---|
| title, 1280 x 720: requests / bytes | 176 / 3,568,815 | 173 / 3,506,337 |
| opening the Ward, 1280 x 720 | 167 / 4,120,230 | 34 / 808,788 |
| opening the Ward, 1000 x 462 at DPR 2 | 170 / 4,163,530 | 34 / 808,788 |
| decoded images once the Ward is open | 87.9 MB in 210 images | 26.0 MB in 74 images |
| Slow 4G, CPU 4x: first room drawn from the kit | 21.8 to 22.1 s | 0.7 to 1.2 s |
| same: everything the Ward asked for has arrived | 22.5 s | 5.2 to 5.7 s |
| files / bytes under `graftwork/assets` | 526 / 9,034,506 | 368 / 6,434,660 |
| offline copy: files / bytes | 663 / 11,594,262 | 505 / 8,991,106 |

Proof: golden master against `428b6499`, 33,681 keys identical, 112 differ, all in the `assets` section (what was asked of the network; the draw-call hashes of the kit scenes identical, the title scene different by design); 12 pixel comparisons (title, Wards, ghosts, big rooms, desktop and phone): 0 pixels differ. Tests: `ward_loading` (new, fails on `428b6499`), the monsters block of `ui_title`, `art_assets`; 35 allowlist entries pruned; 74 of 74 suites.

### Frozen screens under modals

The frame loop (`ui/core.js`) runs only the top screen of the stack. Every screen opened with `app.push` is a modal and freezes everything under it (Pause, Settings, `app_panel`, `install_help`, `offline_prompt`, the Codex, the Archive, the Wardrobe, the deck view); pickers that are part of their own screen are not modals.

- Time has an owner (`ui/frame_state.js`): `app.t` is the top screen's clock and a covered screen gets its own back; a tween or `app.after` timer belongs to the screen that was on top when it was made. The combat queue, hit-stop, `Fx`, the Ward walk, the die and toasts stop with their screen; the transition layer is painted into the snapshot (`app.belowOverlay`) and goes on after; the post layer holds its effect timers; the Ward banner shifts by the frozen time (`thaw`), the heartbeat rests (`freeze`). `app.timeScale`, `app.paused`, `app.rawDt` are gone.
- The lower stack is painted once into ONE canvas of the backing-store size and blitted; it is painted again when the stack, the backing store, a setting or cosmetic (`flow.saveMeta()` applies the settings at once), loaded art or the quality tier changes, or on `app.refreshBelow()`; released when one screen is left; no image is evicted while a modal is open.
- Frozen rectangles, tips, tap targets and fullscreen hot spots are dropped. Three input leaks are closed (button shortcuts behind Pause, the Ward claiming finger drags under the deck view, the title's fullscreen corner under Settings).
- Never frozen: audio, saving, the install toast, the offline download, the quality controller, the 30 fps idle governor (only the top screen's `calm()` counts).
- The unused frame-skip mechanism is gone (`still()`, `FLAGS.skip`, `app.staticFrame`, `app.noSkip`, `app.markDirty`, the busy probes, `post.busy`, `CH.ripplesActive`).

Tick cost (method as above, before = `428b6499`, a loaded machine: read the ratios):

| ms per tick | 1x before | 1x after | | 4x before | 4x after | |
|---|---|---|---|---|---|---|
| title + Settings | 38.1 | 6.4 | 6.0x | 178.5 | 34.0 | 5.3x |
| Ward + Pause | 32.1 | 5.8 | 5.5x | 131.3 | 25.2 | 5.2x |
| Ward + deck view | 55.3 | 27.7 | 2.0x | 224.9 | 112.5 | 2.0x |
| fight + Settings | 36.3 | 6.6 | 5.5x | 158.9 | 37.6 | 4.2x |
| fight + Pause | 28.8 | 5.1 | 5.6x | 143.6 | 22.9 | 6.3x |
| title, Ward, fight alone | 36.8, 27.8, 27.3 | 36.3, 25.4, 25.0 | same | | | |

A modal costs itself plus one blit; opening it costs one extra frame of the lower screen; the snapshot is 6.1 MB on the phone size, 0 after closing.

Bugs this fixed (each has a test): the deck view opened from Pause never appeared with motion on; Settings and the deck view opened from a fight let the enemy turn play on behind them (10 HP lost behind Settings in the test); a timer could change the screen under an open deck view; the three input leaks.

Proof: 30 pixel comparisons with reduced motion, 0 pixels differ; with motion 22 of 30 identical, the rest explained (the deck view now shows over Pause, a pulse and a flicker that now stand still); golden master engine, resume and assets identical, `ui` differs in the modal scenes only. Tests: `frozen` (11 blocks, each failed on the old loop). Known limits: ambient motion that reads the wall clock (lamps on cards, portrait breathing, icon liquids, the room pulse) continues at the wall-clock phase after a modal.

### Classic retirement

What the player sees:
1. Hero select has no mode switch; a stored `meta.settings.mode` is ignored and left alone.
2. The Daily Run is always a Ward run (no `WARD` / `CLASSIC` tag).
3. The map screen is gone, with its two first-time tips (`mapnodes`, `resonance`; `meta.tips` keeps them, unread).
4. A saved Classic run cannot be continued: a run save with no `mode` or a mode but `ward` is closed exactly as Abandon closes a run (`recordRunEnd` with `run.abandoned`: history, stats, Codex sightings, Credit, practice decks, Unlock Points, achievements), deleted, and the title shows one notice until dismissed. Practice saves still resume.
5. Endless after a win opens the next loop on a fresh Ward floor (it used to route a Ward run to an empty map screen).
6. Boss practice is a bare run (`newRun({ bare: true })`): its fixed shuffle changed once.
7. Codex: "Each floor is a hospital you build".
8. Ascension 1 ("One extra elite on every map") never acted in the Ward and still does not: a Ward rule for it is an owner decision.

Nothing else is lost: all 59 achievements, every relic perk, event and Daily modifier work in the Ward. Kept on purpose because the Ward uses it: rewards, offers, shop, forge, events and `R`; acts as floors, ascension 2 to 10, Daily modifiers, Endless; `makeEncounter` (boss, final, and the combat screen's fallback); `run.row`, `run.node`, `run.map` (always `-1`, `null`, `null`); `run.mode = 'ward'` (what tells a Ward save from a retired one); `stats.floors` (rooms that opened something); `drawNodeIcon` (the Ward's trigger seals), the `mapStep` sound, "Continue to the map" on the reward and Forge buttons. Deleted: `ui/map.js` (543 lines), `genMap`, `availableNodes`, `enterNode`, `runMode`, `startEvent`, the mode switch, the map backgrounds and node styles, `graftwork_ui_map` (its event half is `ui_event`), the Classic bot drivers and `GW_MODE`. One shared bot driver, `tools/graftwork_driver.mjs`, holds every policy.

- **Code**: 22 game files changed, 121 lines added, 782 removed; 2,617,858 to 2,572,933 bytes.
- **A Ward run did not change**: the balance table and unlock pacing identical line for line (strong A0 N = 60 all pool 45 / 33 / 42 percent, start pool 38 / 45 / 57; pacing medians strong 39, careful 49, sloppy 151); 1,080 runs hashed at every morning and the end, every hash identical.
- **Golden master** (base `79cb478d`, `compare --common`): 24,656 keys identical; every one of the 1,292 that differ was driven by a Classic run in the old tool or shows the title without the mode tag; the engine rows, recorded from the base with a copy of the tool that plays Ward runs only, equal the branch on all 13,055 keys.
- **Saves**: the 28 Ward saves of `tests/fixtures/graftwork_wardsave_5f3e252.json` resume to the same end, to the hash of the final save; the 20 Classic saves of `tests/fixtures/graftwork_oldsave_0675399.json` each leave the meta exactly as Abandon would, are deleted and set the notice.
- **Real browser**: no mode tags, Begin lands in the Ward, a Classic save gives the notice once and counts nothing twice, three old Ward saves resume unchanged.

Layout faults the port found, older than the retirement and still open (listed as `OPEN_WARD` in `tests/graftwork_ui_layout.test.mjs`; an entry that stops matching fails until it is deleted): the elite reward with a relic, a potion and the plan row at text scale 125 and 150 and on the phone stages; the boss reward's plan row caption cut at those scales; the Ward hand on the two small phone stages (a plan's name over its cost, the deck counter lines touch); the Dispensary on the smallest phone stage (a long boon cut, "Featherweight" 2 px too wide).

### Rules leftovers (branch `cleanup-leftovers`)

Each has a block in `rules_fixes` (sections 9 to 12) that failed before.

- **Cut hooks fired on unpaid cuts**: `seamCut` now carries `paid: false` for a cut past the turn's 3 paying cuts (and the event `capped: true`); Marrow's passive, Spool, Bobbin, Seam Ripper, Blunt Shears, Tapestry Frame, Second Colour, Pin Cushion, Surgeon's Knot and Surge Loop skip it.
- **A waived Price still read as due**: `cardSpec` names the waived grafts (`spec.waived`) and `priceOnCard` in engine/text.js labels them "Waived".
- **The Thread half of resonance** (tier 3 adds a stitch, tier 6 doubles the cut) is now in the texts (`RESONANCE_THREAD`): the Resonance keyword, the Codex, the deck view strip, the graft screen.
- **Resonance Lens** did nothing (tier 5); now "In Elite and Boss fights, each school at Resonance 3 counts as Resonance 6", decided in `resonanceOf(run, kind)`.

Lens balance (strong bot, all pool, 500 runs per hero, relic held from the first morning; "inert" keeps the relic list and RNG the same): Ascension 0, all 1,500 runs: none 34.1, inert 34.2, **Lens 39.5 (+5.3)**, Graft Press 39.9, Tapestry Frame 39.9, Pin Cushion 39.1, Cold Vault 36.1. Ascension 5 against the inert Lens 21.8: **Lens 30.7 (+8.9)**, Tapestry Frame 29.1, Pin Cushion 28.4, Graft Press 28.1. Verdict: strong, at the top of the rare relics, under the 10 point bar; nothing retuned.

### Rules follow-ups (branch `cleanup-rules2`)

Each has a block in `rules_fixes` (sections 13 to 18) that failed before.

- **A waived Price came back under Numb**: the muted copy carries the id it was muted from (`of`); `isWaived` in engine/cards.js is the one place the waiver is read.
- **Reforge dropped the waiver, strip then sew again waived twice**: a waiver belongs to one sewing; `sewGraft` / `unsewGraft` are the only ways a live graft joins or leaves a card (`applyGraft`, `stripGraft`, Reforge, `R.moveGraft` use them); tempering keeps it; `repairRun` drops stale entries from old saves.
- **Cut hooks fired on the turn-end cash**: `seamCut` (relics, hero, enemies) fires for a cut only; a new enemy hook `seamCash` fires for every cash (`kind` 'cut' or 'end') before payment and may cancel it (Ferric Warden, Scissor Nurse, Locksmith moved to it). `info.stitches` and `info.pays` are what was paid; per-stitch readers use them.
- **The Locksmith's Block** is on its Sealed status text; **the deck view tip** no longer covers the graft panel (`glossRegion`); **the Codex Rules header** reads `RULES.length`.

Balance of the cut hooks (strong bot, A0, 500 runs per hero, Marrow / Wick / Odile): all pool 29 / 31 / 33 before, 31 / 30 / 32 after; start pool 43 / 44 / 56 before, 42 / 44 / 54 after. The largest move, 1.6 points, is inside the noise; nothing retuned. (The six items this section's draft listed as seen and not touched are the six it fixed.)

### Character rigs (preview)

The owner rejected painted walk frames; the map walk became the puppet. The part sheets of nine characters arrived, so a character can be a skeleton with painted parts, OFF by default: `previewOn('rig', app.settings)` in `ui/preview.js` (`?rig=1`, `?preview=1`, or the Settings toggle `previewArt`).

- **What exists**: `tools/graftwork_rig_build.py` (raw sheets and `tools/graftwork_rig_meta.json` in, `assets/rigs/` out: one atlas per character at `@1x` and `@2x` and `manifest.json`, about 220 KB), `ui/rig.js`, `ui/rigs.js`, the Ward's `drawActor` behind the switch, the Rig lab of `lab/anim.html`, `tests/graftwork_rig.test.mjs`. Docs: ART_MODULAR.md section 7, ANIMATOR_GUIDE.md section 6.
- **Default look unchanged**: with the preview off the golden master equals the base (26,158 keys, 0 differences) and nothing under `assets/rigs/` is requested.
- **The walk**: feet alternate by construction; a planted sole does not move in the world on level ground (0.000 units over 4 s); on the floor diagonals it follows `RIG_TUNE.depth` (0.5) of the screen-y travel, because a flat painted leg cannot foreshorten.

| character | verdict | same person as the standing sprite? |
|---|---|---|
| marrow | ships | yes; the sheet's trousers are dark charcoal (the sprite's are cream) |
| wick | ships, head BORROWED from the standing sprite | yes with the borrowed head (the sheet's own head is another character) |
| odile | ships | yes |
| knitter | ships | yes, slimmer arms |
| night_nurse | ships | mostly: slimmer, no cape collar; one piece per leg |
| npc_nurse, npc_patient | ship (the Ward draws no NPC today: lab only in practice) | yes |
| candy_striper | lab only, stays on the puppet | no: no skirt, loose hair instead of pigtails |
| npc_porter | lab only | no: a slim upright boy, the sprite is stocky |

- **Redo list for the artist**: (1) wick: a head with her hair, fringe, headscarf and leaf crown in the sprite's three-quarter view; (2) candy_striper: the two-tier striped skirt as its own part, pigtails with red ribbons, each leg as thigh, shin and boot; (3) npc_porter: the whole figure in the sprite's build with both arms on the cart handle; (4) marrow: the four leg pieces in the cream cloth; (5) night_nurse: loose leg pieces, the cape collar, a stockier body; (6) every sheet: one scale, limbs straight and loose (12 px gaps), a note which side is the screen left.
- **Battles are not touched.** To use rigs there: a 2 px per unit atlas, attack, hit, block and collapse poses on the battle timing (`J.atkTiming`), parts composed offscreen before the hurt flash, and wick's own head first.

Found on the way, still open (owner decisions):
- **Back-Alley Swap** (`e_back_alley_swap`) moves a graft with `R.stripGraft` and `R.addGraft`: the max HP Price is charged again (78 to 74 measured), and when the destination cannot take the graft it is stripped and lost while the 20 gold are paid. `R.moveGraft` is the safe path.
- **Knitter and Scissor Nurse passives have no player text** (the Knitter heals 3 per extend and takes 50 percent more from a cut; the Nurse takes 2 Block per cashed Line and snips a Line of 4 or more).
- A payout an enemy voids still counts as a cut for Bobbin and Pin Cushion. The `capped` flag of `seamCut` is read by tests only.

### Long hidden limbs (rig preview)

The owner: "the legs have to be longer even behind the apron; every humanoid character should have arms and legs that fit the rig, and then something like an apron is layered over it." Branch `rig-longlimbs`.

- **What exists**: the build grows limb tubes into the body (`extend`, `extend_top` in tools/graftwork_rig_build.py) and chooses the length per limb with `--fit` from the pose envelope of ui/rig.js (`node tools/graftwork_rig_pose.mjs`), written into the meta as `fit`; the runtime pins every thigh's top in the hips (`thighM`); garment layers of Marrow (tunic), Odile (coat) and the Night Nurse (skirt) are cut higher so the cloth covers the pelvis; Odile's thighs are the upper parts of her leg pieces, grown; the sheet linter `tools/graftwork_rig_check.py`; the assembled A-pose slicer (`"source": "assembled"`) and `--export`; X-ray in the Rig lab. Spec: ART_MODULAR.md section 7 "Rig sheet spec v2: layers"; how it moves: ANIMATOR_GUIDE.md section 6.
- **Default look unchanged**: golden master `--only ui,assets` against the base (dcddd93f), 0 differences on 7,689 keys. With the preview off nothing under `assets/rigs/` is requested.
- **Feet unchanged**: bones, feet, contact point, bbox and height of all nine rigs are identical to the base; the ground contact tests pass unchanged.
- **The new checks on the base build**: leg ends uncovered: marrow near thigh 72 px in 15 of 104 poses, night_nurse near leg 426 px in 47; every other shipped leg end was already under the cloth. Thighs reaching 35 percent of hip to knee above the hip: none on the base (2 to 5 units of 8 to 12 needed); all fourteen after. Upper arms: their painted caps are the shoulders and sit beside the torso, measured, not asserted.

| character | thigh extension near / far (units) | verdict |
|---|---|---|
| marrow | 10 / 6 | ships |
| wick | 8 / 7 | ships |
| odile | 8 / 8 (thighs grown from the leg pieces) | ships |
| knitter | 3 / 9 | ships |
| night_nurse | 3 / 2 (one-piece legs; the near leg's wide top trimmed under the dress) | ships |
| npc_nurse | 9 / 8 | ships |
| npc_patient | 8 / 7 | ships |

- **The knee, then** (second pass): the knee folded up to 133 degrees on the floor diagonals (base: marrow 87 / 112, wick 112 / 133, odile 79 / 93, knitter 113, npc_nurse 107 / 118, npc_patient 92 / 116, near / far); now the drawn thigh and the shin meet at no more than `RIG_TUNE.knee` (69 degrees) scaled by the shin (Wick 0.75 of it): marrow 67 / 76, wick 71 / 61, odile 70 / 68, knitter 67, npc_nurse 67 / 71, npc_patient within its limit (the check reads the knee to sole edge, the table the bone). Round knee and ankle ends. Wick's pale stub at 0.56, 1.06 and 1.25 down-right and Marrow's cuff behind the boot at 0.00 to 0.50 are gone in the 4x strips; no foot moves, the ground contact tests are unchanged, the swing foot still clears the floor.
- **Cloth strips** (`RIG_TUNE.cloth`, on in the preview, off with reduced motion): 8 strips per garment on a chain of knots (billow, lean, knee push), seamless by construction. In the 4x strips it reads a little better than the single shear (the hem curves back and makes room for the knee; no seam, no tear), and it is subtle. Cost per frame: marrow 70 to 130 canvas calls, wick 69 to 99, odile 72 to 102.
- **What still needs the artist** (the linter's sentences): plain long thigh tubes with straight tops for every sheet; Odile's thighs as their own pieces; the garments as pieces of their own (tunic, coat, the nurses' skirts are cut out of the torso); loose pieces in their own boxes (candy_striper, npc_patient, npc_porter, npc_nurse, knitter groups); one scale per sheet (upper arms and boots differ by 10 to 26 percent between the sides). Best: the assembled two-layer figure. Wick's shins are short for her boots: longer shins in the art would let her knee fold less still.

### Painted UI parts (preview)

The artist's UI art (ten card frames, the back, a cost gem, three panels, five buttons, HP tube, energy dial, block plate, two chips, the Budget gauge, two icon sheets, the title key art) is built into `assets/ui/` and drawn only as a PREVIEW (`?art=1`, `?preview=1`, or Settings > "Painted art (preview)"). Rebuild: `python3 -I tools/graftwork_ui_build.py --raw <raw dir>`, then `node tools/graftwork_sw_build.mjs`; details in ART_MODULAR.md "What is built"; look in `lab/art.html`.

- **Default look unchanged**: golden master, 25,653 of 26,000 keys identical; the 202 that differ are the Settings screen with its new row. Nothing under `assets/ui/` is requested while off.
- **Size**: 29 files, 1.13 MB (budget 2.0 MB): two atlases, ten frames, the back, the key art, `manifest.json`. A fight with the preview on asks for about 15 files at @2x.
- **Cards**: the 3:4 art is brought to 220:310 by adding 65 rows in the plain rails; the text window is smaller than the procedural one (163 x 93 against 176 x 141), so a sweep of all 177 cards with up to three grafts found no spill but text down to 7 px with three grafts (the procedural face goes down to 11).
- **Performance**: not slower (Chromium, alternating blocks): 27.8 against 24.3 ms a tick on the desktop, 32.3 against 29.6 on the phone; `drawImage` calls per frame 25 to 59.
- **Tests**: `ui_art` (13 checks); `perf3`, `templates`, `ui_title` changed.
- **Not done on purpose**: stateful panels (rows, plates, chips, tabs), the deck view and Codex gauge cells, the Ward panels, seven card backs, relic, potion and status glyphs stay procedural; 13 of 16 rules icons and the `thread` intent have no place yet.

### Tests and tools (branch `cleanup-tests`)

No game code touched; assertions counted as executed calls of `node:assert`.

- **Runner**: one suite set the wall time (`ui_layout`, 21,354 frames, 18,308 of them the tooltip sweep). The sweep is now `tip_layout` on `tests/graftwork_layout_lib.mjs`: the same 18,308 frames, 5,523 tip layouts and 128 known faults in the same order (recorded copies of both versions); it rests 4 frames on still screens and 12 on moving ones (3, 4 and 6 everywhere lost tips). The runner remembers each suite's time in the system temp folder and starts the slowest first; the summary prints CPU seconds.

| pair | before (old runner, 78 suites) | after (new runner, 71 suites) |
|---|---|---|
| 1 | 435.4 s wall, 501 s CPU | 416.7 s wall, 504 s CPU (no remembered times) |
| 2 | 270.5 s wall, 492 s CPU | 306.0 s wall, 486 s CPU (remembered order) |

The total CPU is the same; what changed is the longest single suite (`ui_layout` 158 s before; `tip_layout` 109 s and `ui_layout` 48 s after), so a 4 worker schedule falls from 158 to about 122 s on idle cores (an estimate).
- **Wall-clock assertions replaced by counted canvas calls** (`canvasCalls()`): `art_cards` under 1500 calls a frame (measured 1178), `art_chars` under 2600 (1923), `art_icons` under 700 (137 to 527), `ui_core` under 3200 (2702); Playwright waits raised to 120 s with the reason beside them. Under load 30 the old `art_chars` bound failed on unchanged code; the counted one did not.
- **Source-text assertions replaced by behaviour** (`fullrun`, `q3_flow`, `sw`, `art_assets`): 26 out, 52 in; seven mutations of `sw.js` each fail `sw`.
- **One owner for the dash rule**: `hygiene` (en dashes and escapes too); about 1,300 duplicate dash assertions in 27 suites are gone.
- **Folds**: 78 suites to 71 (`fullrun` into `regression`, `meta2` into `meta`, `perf` into `perf2` and `quality`, `q3_flow`, `r3_tips`, `ui_reward_tip`, `ui_polish`, `ui_clickthrough` into the suites of their screens; `s3_intents` is `intents`; `tip_layout` new), the moved assertions identical as a multiset.
- **Tools**: the strong bot's 13 tuning switches are constants at their defaults (432 run hashes and the `ward_sim`, `sim`, `strong` tables identical before and after); `graftwork_icons.py` reproduces the icons byte for byte; the golden tool lost `--classic-rng` (version 3). The fresh full reference recorded then (no flags, on `dd6ef9a6`, 29,036 keys, 1.6 MB) was kept outside the repo, in a session scratch folder (`/tmp/claude-0/-home-user-Games/2d970048-5ad2-5fe3-9283-45242a3d6a9d/scratchpad/tests/golden_cleanup_tests_final.json`), so it may be gone: record a new base from the commit you start on and `compare` against that.

### Leftovers of "Tests and tools" (branch `cleanup-leftover-tests`)

- **`ui_layout` on the shared harness**: its 160-line copy of the harness, `OPEN_ON_PHONE`, the stale `OPEN_DESK` and unused imports are gone; a recording of every analysed frame is byte identical before and after (3,046 frames, 489 tip layouts, 127 known problems).
- **Source text out, behaviour in**: `puppet` (two synthetic figures in Chromium: the hem band and the trouser feather), `anim_frames` (the walk is the puppet or the hop, never a frame, plus the lab's `pm` switch), `lab_anim` (the aura is a draw, every scene runs as a page), `rig` (the Rig lab page in Chromium, a real fight with the preview on asks for no rig). Each replacement was shown to fail on a mutated copy of the code. `tests/graftwork_browser_lib.mjs` holds the shared Chromium helpers.
- **Folds**: `kit_assets` joined `art_assets` (70 suites on that branch; with `ui_art` from the painted UI branch, 71 on main).
- **Tool guards**: `graftwork_art_build.py` once rewrote the committed manifest from an empty raw folder. Now every tool that writes committed files (`art_build`, `kit_build`, `icons`, `sw_build`, `profile`) prints usage for `--help` and `-h`, refuses an unknown option, and stops before writing without raw input; `hygiene` runs each and compares the files and `git status` before and after.
- Executed assertions, before and after: `ui_layout` 68 and 68, `art_assets` + `kit_assets` 3,371 and 3,371, `rig` 27,867 and 27,899, `lab_anim` 152 and 186, `hygiene` 92 and 146. The leftovers it listed were done by the engine sweep.

### Dead-code sweep (engine, data, tools) (branch `cleanup-sweep-engine`)

Start `526d7ff9`. No rule, number, rng order or save shape changed.

- **Export keywords** dropped from 63 engine and data names nothing else imports (`SEAM_CUTS_TURN` stays exported).
- **Test-only code** removed: meta.js `setting`, `setSetting`, `tipSeen`, `markTip`, `isSeen`; ward.js `sizeOf`; `ENEMY_LIST`; data/ward_kit.js `wallSegments`; `startPlayerTurn` no longer exported.
- **Duplicate helpers**: `data/helpers.js` (new) holds the content helpers two or three files wrote out (`dmg blk debuff buff ST CUSTOM`, `OVL TEMP LINE2`, `hasD hasB dmgOrBlock`, `isJunk`, `allCards`, `SCHOOL_ORDER`).
- **Rules written twice, now once**: card cost (`rawCost`), the act encounter pool (`actEnemies`), the school list (`SCHOOL_LIST`).
- **Settings defaults**: `SETTING_DEFAULTS` in engine/meta.js is the one table; `DEFAULT_SETTINGS` (a new meta) is it without the display keys, same keys and order as before, so a new save is unchanged.
- **Allowlist reasons**: `tests/graftwork_hygiene_allow.json` may carry `reasons`; a reason for a gone entry fails; `--unexplained` lists entries without one.
- Kept on purpose (with reasons): `setStorage`, `clearRoute`, `freeConnected`, `GAIT_KINDS`, 23 duplicate names that are different functions; `run.rerolls` and `meta.unlocked.relics` (saved fields). Not changed: the afflictions Proxy (0.6 percent of the CPU of a bot run, not worth the risk).
- Seen, not touched (a behaviour change): `defaultMeta()` copies `DEFAULT_SETTINGS` shallowly, so toggling Assist on a brand-new profile writes into the defaults for that page (fix: copy `assist` too). The old Ward walk (`shortestPaths`, `T.move`) is kept alive by the sim (`GW_OLDWALK`) and `ward`.

Numbers: engine + data 57 to 58 files, 642,280 to 641,145 bytes. Allowlist 566 to 444 entries. Proof: golden master `--only engine,assets,resume` 0 differences on 23,215 keys (and 3,189 resume keys from the base's payloads); balance tables identical line for line (strong all pool 23 / 22 / 25 of 60, start pool 23 / 24 / 35; pacing medians strong 38, careful 48, sloppy 151); 72 of 72 suites (569.5 s wall, 528 s CPU). Its follow-ups for the UI side were done in the next section, except the Assist default.

### Dead-code sweep (ui, art, lab) (branch `cleanup-sweep-ui`)

Start `526d7ff9`, merged with the engine sweep (`90620240`) before the last round. Nothing a player can see changed.

- **Removed**: `ui/lights.js` (registered by three backdrops, the boss plate and `main.js`, never rendered); `art/backgrounds.js` wrappers and leftovers; the 26 unreferenced locals and 20 unused exports of ui/ and art/ (among them `drawImageSmart`, `flushTips`, `drawPinnedTip`, `graftLines`, `CELL`, `cellXY`); unused imports in 23 files and what only they kept alive; code only tests reached (`drawStrainMeter`, `drawDeckIcon`, `drawCardText`, `THREAD_LESSONS`, the never shown `forge` and `shop` tips); `export` dropped from 137 names.
- **One leaf module, `ui/util.js`** (no imports): `TAU`, `lerp`, `clamp`, `clampOrdered` (the ternary clamp, different for inverted bounds), `hash01` and `hash32` (FNV-1a), the offscreen canvas helpers, `mulberry32`, the Math.random range; only copies with the same text were folded.
- **Engine-sweep follow-ups done**: ui/settings.js `DEFAULTS` and ui/a11y.js `A11Y_DEFAULTS` pick from `SETTING_DEFAULTS`; main.js reads volumes, `TEXT_STEPS` and `QUALITY` from them; `plural` from engine/text.js; school lists from `SCHOOL_LIST`. Not done: `ASSIST_DEFAULT` stays (the `assist` suite reaches it with a meta without an assist block and expects Gentle foes off; the table says on: a behaviour decision).
- **Numbers**: 57 files, 624 lines removed, 257 added; ui 1,356,090 to 1,335,361 bytes, art 548,753 to 541,752. Allowlist: unused exports 20 to 0, test-only dead 88 to 68, `export` only in own file 200 to 0, unreferenced locals 26 to 0, duplicate helpers 232 to 131; every entry left carries a reason.
- Kept on purpose: 64 test seams and data tables of ui/ and art/, `ui/perf_flags.js` (the profiler's A/B switches), `ui/frame_state.js`, the two previews; `win` / `nav` of fullscreen, install and offline (each closes over its own host); an unused import of `propAt` in `ui/ward_kit_iso.js` (deleting it makes data/ward_kit.js `propAt` an unused export: delete both together).
- Not done: a `layoutText` cache (it would remove the measuring calls the golden draw logs record); splitting `ui/combat.js`.
- **Proof**: golden master `--only ui,assets` 0 differences against the base and against main; with both previews on, 18 pictures of the game identical to main, the lab pages within main's own spread; 71 of 71 suites.
- Found, not touched: `void x;` silencers in nine files (some compute through calls with effects, each needs reading); `depthOrder`'s `focus` and the block painters' `dark` parameter are unused.

### Docs (branch `cleanup-docs`)

- `graftwork/CLAUDE.md` rewritten: 64,308 bytes and 274 lines to under 32 KB and under 160 lines; every source file in one module map, which `hygiene` now checks both ways (a file the map does not name, a path it names that is gone), proved on a throwaway repo in `tests/graftwork_hygiene.test.mjs`.
- `design/`: five perf JSON dumps nothing read are deleted (PERF.md keeps their numbers), BUILD_PLAN.md (round 4 ownership) is deleted, four Classic-era playtest records are merged into PLAYTESTS.md, README.md is a one line per file index; JUICE.md took the creative director's juice rules from CLAUDE.md. The game README no longer says there are no art files.
