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
