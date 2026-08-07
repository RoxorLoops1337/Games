# Merry Crashmas — roadmap

The game is `merry_crashmas/index.html` (one file, four inline scripts sharing a
scope). Tests: `tests/merry_crashmas.test.mjs`, run with `npm run test:crashmas`;
`npm run check` must be green before every push.

The brief this roadmap serves, in the owner's words: **more gore detail in the
replay, rounds that look different from each other, and more of a game — more
addictive, more challenge, puzzles, cars that behave differently over time.**

## CURRENT PHASE: D2 — execute plan 2

The owner asked for 15 more levels, designed rather than generated, and then a
critique cycle. Work the phases in order; when a phase's exit condition is met,
edit this block to name the next one.

- [x] **A — fifteen more markets (markets 7–21).** Done: 21 markets, each with
  its own idea, new set pieces (ice rink, parade, choir stand, bollard chicanes,
  extra snowbanks) and a spiral layout. All beatable blind, targets tuned to
  ~0.8× the median blind run.
- [x] **B — three critics.** Done: design, feel and code critiques on disk under
  `.polish/`. Between them: no persisted progress, goals that are arithmetically
  impossible, a camera that loses the car at speed, portrait unplayable, and a
  market that scored itself between runs.
- [x] **C — synthesis.** Done: `.polish/crashmas-plan.md`, 19 items, ordered,
  with five critic conflicts resolved and six proposals cut.
- [x] **D — execute the plan.** Done: all 19 items of `.polish/crashmas-plan.md`
  shipped, one per pass, each with assertions and a browser check. Three of them
  turned up cosmetic systems feeding on the simulation seed (see the note below);
  four deviated from the plan's specifics and say so in `.polish/crashmas-plan.md`.
- [x] **E — three more critics, then back to C.** Done: design, feel and code
  critiques on disk as `.polish/crashmas-critique-*-2.md`, and
  `.polish/crashmas-plan-2.md` — 15 items, six conflicts resolved, eight
  proposals cut. Two of the critics' findings were regressions from phase D and
  were hotfixed straight away (the rink's fence collider, and the shout guard
  eating 63% of kill pops). The synthesis verified the load-bearing claims
  first: `drawAim` moving the car is real and decides pass/fail on market 1,
  and it turned up a fifth cosmetic system feeding on the simulation seed.
- **D2 — execute plan 2.** Work `.polish/crashmas-plan-2.md` top to bottom, one
  item per pass, ticking `### [ ]` → `### [x]`. Items 1–10 are done. **Next:
  item 11** (the edge of town, not the edge of the canvas). Exit: all 15 ticked, then
  phase E again.

## Working agreement for each pass

1. Take the **top unchecked item**. One item per pass; finish it properly rather
   than starting three.
2. Build it, cover it with real assertions in the suite (the harness boots the
   game headlessly — see the top of the test file).
3. Verify it in a real browser with Playwright (`/opt/pw-browsers/chromium`),
   including a screenshot you actually look at. Rendering bugs do not show up in
   the headless suite.
4. Re-run the angle sweep if the change touches balance, and retune `par` so a
   blind full-power run lands near target on every market.
5. Check the frame cost if the change adds anything drawn. The suite has a
   draw-budget test; the worst case is level 6 with every buffer saturated.
6. `npm run check`, commit, PR, merge, tick the item here with a one-line note.

## Done

- [x] Slingshot launch, top-down car physics, bounce and spin
- [x] Six markets, procedural from a seed, score targets scaled off market value
- [x] Combos, banners, nitro, pickups, ice
- [x] Snowbank ramps, airtime, barrel rolls, landing slams
- [x] Crowd archetypes: shopper / elder / parent with pram / kid / Santa
- [x] Crying, tears, dropped shopping, panic flee
- [x] Blood: pools, spray, chunks, limbs, pixels, tyre smears, lens splatter
- [x] Instant replay of the run's best two seconds, slow motion, letterboxed
- [x] Replay gore pass: arterial arcs, mist, limbs, chunks, stains, camera kick
- [x] Per-market themes (dusk / alpine / night / nordic / blizzard / eve) —
      ground, stalls, trees, light colour, snowfall, fog, darkness
- [x] Market layout shapes: rows / wave / plaza ring / funnel / chevron
- [x] Three per-market goals from a pool of 13, driving the star rating
- [x] Car garage: five cars, own art and handling, unlocked by lifetime kills
- [x] 21 markets: ice rink, gauntlet, parade, alleys, boulevard, frozen lake,
      bonfire, choir, rooftops, crossroads, spiral, grand market, midnight mass
- [x] Lighting pass: darkness layer with the lamps cut out of it, warm glow
      added over, one light direction for every shadow, shaded stalls, and a
      grain on the snow floor
- [x] Crowd pass: boot prints in the snow, breath in the cold, bobble hats and
      hair that read from above, coat highlights that follow the scene's light
- [x] Headlights: a nine-disc cone that cuts the darkness and adds its own
      glow, reaching further the faster you go
- [x] Six stall trades — bratwurst grill, glühwein pots, toys, chestnut
      brazier, candles, lebkuchen hearts — each with its own awning colour,
      counter and (for the grills) a chimney and a plume. Picked from the
      prop's existing seed, never a fresh `rnd()`.
- [x] HUD pass: one plate behind every panel (base, lit band, hairline), the
      score plate measured off its own contents so the goals stop printing
      outside it, tick boxes instead of ○/✓ glyphs, and the launch hint in a
      pill. Presents got a lid, a shade, a snow cap and a bow.
- [x] Set dressing: conifers with spiked tiers, glass baubles and a star;
      snowmen with twig arms, a scarf and a face nothing covers; nutcrackers
      with shoulders, epaulettes and a beard; the big tree's hoops replaced by
      a string of twinkling bulbs.
- [x] Effects: blood soaks into the snow before it sits on it, splats throw a
      scatter of droplets, pools carry a wet sheen — all batched into one path
      each so the field still costs one fill a decal. Forced pop-ups climb
      clear of each other instead of printing through.
- [x] Replay: the caption sits on a cached scrim that darkens both ends of the
      frame into the letterbox bars, instead of being printed onto a lit stall.
      The carousel got horses, a scalloped hem and a finial.
- [x] Fireworks crates: two in five barrels carry rockets, drawn with tubes and
      a fuse so you can see it coming. Wrecking one sends a volley streaking
      across the market that bursts into sparks. Cosmetic-stream only — a crate
      scores exactly what a barrel does.
- [x] Cars: panel shading that follows the market's light rather than the
      bodywork, glass with a glint, headlamps and brake lights, and five
      silhouettes you can tell apart — van roof box, sports wing and stripes,
      monster roll bars and stacks, a sack on the sleigh.
- [x] The car picker shows the cars: each card paints its own vehicle by
      borrowing drawCar, plus launch/bounce/damage bars. Five on one row, and
      the brief now fits the frame at 810, 720 and on a landscape phone —
      where LET'S RUIN CHRISTMAS was 193px below the fold before.
- [x] The finale is an ending: fireworks going off over the wreckage behind
      the card, a campaign-wide wreck count and the star total alongside the
      score, and an overlay you can actually see the market through.
- [x] The title screen looks at a market: its own drifting camera on the last
      market rather than the aim framing's empty launch lane, no HUD, and an
      overlay you can see through.
- [x] Pickups and ice: the three things you steer into get their own coloured
      glow from the light pass and a breathing ring, and ice reads as a cracked
      sheet with facets and a rim rather than a pale disc with three scratches.

## Next

- [ ] **Upgrades between markets.** A currency (presents?) earned per market,
      spent on nitro charges, plough duration, mass, ramp lift, restitution.
      Persist alongside the existing `merry_crashmas_*` keys. This is the
      addiction loop: never finish a market without having earned something.
- [ ] **Puzzle markets.** Hand-authored constraints rather than a bigger crowd:
      one car and a bank shot off two nutcrackers; a market behind a wall with
      one ramp in; a market where the only route is over the roofs; a Santa who
      runs and must be caught before he reaches the grotto.
- [ ] **Hazards that chain.** Gas canisters behind the bratwurst grills, glühwein
      vats that boil over, a fireworks stall, a strung-lights cable that whips
      down a whole row. Chain reactions are the cheapest spectacle there is.
- [ ] **Daily market.** Seed of the day, one attempt, submit to the existing KV
      leaderboard (`functions/api/board.js`). Compare against yesterday.
- [ ] **Endless mode.** Markets keep generating, targets ramp, one car at a time,
      run ends when a market is missed.
- [ ] **Weather that bites.** Blizzard should actually reduce what you can see
      before launch; fog banks that hide a crowd until you are in it; wind that
      pushes the car mid-flight.
- [x] **Sound pass.** Done in plan item 17: wails capped at three voices inside
      900px, an engine drone that tracks speed, squish pitched by the combo, a
      landing voice of its own, a resumable context and a baked noise bank —
      211.8 oscillator spawns a second down to 24.
- [ ] **Ragdoll pass.** Bodies currently slide and stop. Limbs that trail, bodies
      that fold over the bonnet and get carried, pile-ups against stalls.
- [ ] **Menu cover.** `cover.webp` + `cover.webm` so the games index shows real
      footage like the other entries.

## Notes for whoever picks this up

- **A phone plays landscape whatever way it is held.** Real orientation lock is
  Android-and-fullscreen-only and iOS Safari has never had it, so `fit()` turns
  `#wrap` a quarter turn instead when the window is portrait and under
  `ROT_MAX_SIDE` (820) wide. Everything inside comes along; only `toCanvas()`
  has to know, and it does the inverse rotation. **Consequences:** `vw`/`vh`
  inside the wrap still mean the *viewport*, so they are swapped relative to the
  game — see `body.rot .card`. And media queries cannot see the game's frame at
  all, so the compact layouts are driven by `body.short` / `body.narrow`, which
  `fit()` sets from `VW`/`VH`. Add a media query at your peril.
- Fullscreen rides the first tap and the START button (it needs a gesture), and
  latches only when the request resolves, so a refusal does not burn the
  session.
- **The market is lit, not tinted.** `drawLights()` runs two passes: a darkness
  layer (`darkLayer()`, deliberately half resolution — nothing on it has an edge)
  filled at `TH.dark` with the lamps punched out by `destination-out`, then the
  warm glow added over the scene with `lighter`. Both draw a 128px sprite baked
  once by `bakeLight()`; **never build a gradient inside a frame**, the draw
  budget test asserts `createRadialGradient` is never called. The whole scene
  shares one light direction (`SUN_DX`/`SUN_DY`) and `shadow()` is the only thing
  that should know it. The snow floor's grain (`snowPattern()`) is built from a
  fixed integer hash, **not** `rnd()` or `vrnd()`: a texture that moves with the
  seed is a texture you cannot screenshot twice.

- The market generator is one function, `genMarket(lv)`, driven entirely by the
  level's seed. Everything about a market's look lives in `THEMES`; its shape in
  `lv.shape` and the `laneAt()` helper.
- Goals live in `GOALS` with a `gen`/`test` pair each; adding one is a few lines.
  `needs` gates a goal on the market containing something (santa, carousel…).
- Cosmetics must never draw from `rnd`/`rr`. Those are the simulation's seed:
  anything that changes how many draws happen — a suppressed pop-up, one more
  blood splat, an extra snowflake — moves every market's score. Scenery uses
  `vrnd`/`vrr`. Already caught in `seedSnow`, `popText`, `addGore` and the
  screen shake; grep for the rest before adding any.
- The replay records people and props near the car at 30Hz and writes them back
  during playback, restoring afterwards — see the test that asserts the market is
  untouched. Anything new that moves during a run needs recording too, or it will
  sit still in the replay.
- Frame cost is dominated by fill area, not call count. The far crowd is batched
  by colour. LOD is measured by `lodQ(p) = p.r * 720 / cam.tz` — a reference 720p
  viewport, never the live `cam.s`, or a bigger monitor silently buys itself a
  more expensive frame. Three tiers: batch below `LOD_MID` (10.5), coat/head/
  hat/arms up to `LOD_FINE` (14), the full kit above it, which in practice means
  the replay camera. Santa and pram carriers (`lodAlways`) never batch.
