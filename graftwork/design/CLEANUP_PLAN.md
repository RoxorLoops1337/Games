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
