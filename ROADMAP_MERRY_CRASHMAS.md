# Merry Crashmas — roadmap

The game is `merry_crashmas/index.html` (one file, four inline scripts sharing a
scope). Tests: `tests/merry_crashmas.test.mjs`, run with `npm run test:crashmas`;
`npm run check` must be green before every push.

The brief this roadmap serves, in the owner's words: **more gore detail in the
replay, rounds that look different from each other, and more of a game — more
addictive, more challenge, puzzles, cars that behave differently over time.**

## CURRENT PHASE: E2 — three more critics, then synthesis

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
- [x] **D2 — execute plan 2.** Done: all 15 items of `.polish/crashmas-plan-2.md`
  shipped, one per pass, each with assertions, a browser check and a regression
  check that reverts the fix and watches the new assertion fail. Two of them
  turned up further cosmetic systems feeding on the simulation seed (the tear
  spawn, and the tear's own speed rolls); one needed `par` re-derived (market 1,
  when run length changed); and three exposed harness gaps that had been making
  measured layouts untestable — `measureText` answering a flat 30,
  `createLinearGradient` returning undefined, and no way to read a `roundRect`.
- **E2 — three more critics, then synthesis.** Next: design, feel and code
  critiques of the game as it now stands, as `.polish/crashmas-critique-*-3.md`,
  then a plan 3. Exit: plan 3 on disk, then D3.

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
- [x] Fairy lights strung between the stalls: sagging cables with coloured
      bulbs, paired off the finished prop list with no RNG, one stroke for
      every cable in shot and one fill per bulb colour. A cable with a stall
      gone from one end hangs slack; with both gone it is cut.
- [x] Weather that reads: wind that gusts on a clock, snow that streaks in a
      blizzard and falls in dots on a still night, and fog as drifting banks
      rather than one flat wash.
- [x] A gate across the launch lane with the market's name on it — scenery
      only, no collider, so the empty third of every aim frame finally says
      where you are about to drive.
- [x] A hanging sign on every stall with its trade's pictogram — the whole
      market's worth in eight draw calls, so a hundred stalls cost what eight
      do.
- [x] The sling is a machine: a trodden pad with tyre scuff, posts with snow on
      the tops, and a band that thins from 8.5px to 5.6px as you stretch it.
- [x] Blood is liquid, not fog. Every decal used to be its own translucent
      ellipse, so three hundred of them stacked into a flat maroon haze with no
      edge in it. They are stamped opaque into a half-res layer of their own —
      where an overlap is a union, not a sum — and the finished silhouette goes
      over the snow once at alpha .72, with a dark rim, a darker centre where
      the pools are deep, and lobed blobs instead of ovals. The whole field is
      four fills at any decal count (2748 → 2509 worst-frame fills), and the
      trail through a flattened market finally reads from the wide camera.
- [x] The market picker shows the markets. Twenty-one identical mint pills
      became twenty-one tiles, each painting the market's own plan — the same
      `laneAt()` the generator walks, in the market's own theme colours — so
      rows, wave, funnel, chevron, plaza ring and spiral are all told apart at
      a glance, with the number as a badge on the plan, the full name on two
      fixed lines, stars and your best score. No `genMarket` and no `rnd()`:
      the jitter is an integer hash off the level seed, asserted not to move
      either random stream.
- [x] The results card is a scorecard for the wreckage, not a black screen with
      numbers on it: the overlay comes down from .94 to .80 so the market you
      just flattened shows through, the card names which market ("6 · CHRISTMAS
      EVE"), the earned stars land one at a time at 0.20/0.48/0.76s, and a run
      that beats your record on that market gets a NEW BEST badge and is told
      what the old figure was. The record quoted is read *after* the save is
      written, so a failed run that still set one no longer quotes a stale
      number.
- [x] Spilt glühwein is a puddle. A wrecked stand drops a pot of scalding wine
      that kills anything walking into it for `SPILL_HOT` = 3.5s, and it was
      drawn as two concentric circles — at the drive camera, a screen-wide flat
      red plate with nothing in it that said liquid, heat, or where the lethal
      edge was. It is lobed now, with a dark rim where the wine meets the snow,
      a wet sheen, a warm additive core and pale vapour rising off it in the
      light pass — and it goes dull and stops steaming at exactly the moment it
      stops killing, which the game had never signalled at all. The kill window
      and the look read the same constant. Lobe seed off `vrnd()`.
- [x] The combo banner is a ribbon. It was 46px of bare red on whatever the
      market happened to be under it — fine over snow, unreadable over a lit
      stall counter, which is the brightest thing in the game and exactly where
      a combo happens. Now a notched ribbon in the HUD's own materials (tails,
      plate, lit band, hairline — three fills and one stroke) with the text
      drawn twice, dark copy under colour. Sized off the frame (46px at 810
      tall, 24px at 375, was 46 everywhere), shrunk to fit rather than running
      off the edge, and placed clear of the combo plate always and the score
      panel whenever it is wide enough to reach it.
- [x] The driver is a man in a seat. He was four discs — face, hat, bobble and
      one dark dot — which at the garage card's 170px and the replay's close-in
      read as an egg with a bite out of it. Now shoulders in a red coat under
      the head, a white beard hanging down his front, two eyes on the face
      (*not* in the beard — the first attempt buried them and he read as a
      snowman), gloves on a wheel ring between the beard and the windscreen,
      and the mouth that already opened when he shouts. Nine fills on the one
      object in every frame of the game.
- [x] Santa looks like Santa. He is the most valuable target in the market,
      has a goal named after him and an edge marker that says SANTA — and he
      wore whichever of the eight shopper coats his seed rolled, identified
      only by a small red disc that his own hat drew *over* his beard. Now a
      red coat with a white fur trim (the coat's own outline, so it costs
      nothing), a black belt and gold buckle at the waist, and a head laid out
      around the face the crying pass draws: beard behind the mouth, hat
      forward on the crown, fur band where the squeezed eyes land, bobble on
      the hat. He reads as the jackpot from the drive camera now.
- [x] A wrecked stall is a wreck of *that* stall. Six trades left six identical
      brown heaps flying the same scrap of the theme's awning — none of what
      the stall sold, and not even the stripe it had been flying a second
      earlier. The scrap now carries `tradeOf(o).stripe`, and the stock is
      thrown out across the snow around it: sausages and charcoal, mulled-wine
      cups, toy blocks, chestnuts, candles, lebkuchen. Nine items in one fill a
      colour, positioned off the same integer hash the market plan uses, so a
      wreck is identical every frame and rolls nothing.
- [x] The brief shows the market. It is where you decide how to attack one, and
      the market itself was a black smear behind the card — so the overlay came
      down to the finale's .82, and the market's own plan (the picker's
      `paintMarketThumb`) now sits beside the blurb in the row the blurb
      already had. No extra card height: LET'S RUIN CHRISTMAS still lands on
      screen at 1440×810, 1280×720, 1024×640 and two landscape phones, which
      needed the plan trimmed after the first attempt pushed it 4px off a
      1024×640 window.
- [x] Wrecked set pieces stop being brown discs. Lined up live against wrecked,
      the glühwein stand and the barrel were each a single flat disc where the
      live version had a glowing copper pot with a gold rim, or hoops and (for
      a fireworks crate) three tubes and a fuse. A wrecked stand is now the pot
      on its side with the rim still on it, a snapped trestle and the cups off
      the counter; a wrecked barrel is five staves sprung out of a hoop — one
      rotated ellipse each, so the whole thing is a single path — and a crate
      that has gone off leaves its spent tubes, which a plain barrel does not.
- [x] A flattened Santa is still Santa. A shopper's bobble hat survives being
      run over because the corpse draws whatever `p.hat` says; Santa's hat is
      decided by his *kind*, so the market's jackpot lost its fur trim, belt,
      beard and hat the instant you hit it and lay there as an anonymous red
      shopper. The corpse keeps the lot now — trim on the torso outline, belt
      and buckle across it, beard under the chin, hat and bobble knocked
      forward past the head — with the X struck over the hat rather than under
      it.
- [x] A pram that was sent flying stays sent flying. There is a goal called
      "send N prams flying" and the pram was an effect with a 1.6s life: it
      tumbled out of the parent's hands and then evaporated, while everything
      else you wreck in this market stays wrecked. It lands in `debris` now via
      `restFx` — the hook that already decides what a limb or a chunk leaves
      where it comes to rest — and is drawn on its side with the blanket half
      out of it, one wheel still on and one off.
- [x] Height reads. Seen from directly above, the only cue that the car is in
      the air is its shadow — and the shadow *shrank* as the car climbed while
      the car grew to `1 + z/380`, so at the top of a ramp jump the shadow had
      vanished underneath a car that had merely got bigger. It keeps its size
      now (+15% at 320 up), softens rather than disappearing (.32 → .25), and
      travels along the scene's one light direction far enough to clear the
      grown body — 194px out at z=320 against a 100px half-length. Split into
      `carShadow(z)` so the separation is measured, not eyeballed.
- [x] The nitro halo stops plating the frame. It was the last thing in the
      light pass still drawn as a raw `circle()` — a flat 190-unit disc with a
      hard edge at a constant .16 for the whole 0.55s, which at the drive
      camera greys out two thirds of the screen at the exact moment the most is
      happening in it. It is a baked sprite like every other light now, and it
      burns down from 360px at α.30 to 270px at α.08 over the boost instead of
      snapping off. The carnage under it reads again.
- [x] Two more trades, so a row of stalls stops repeating itself every sixth
      one: **baubles** (purple awning, four glass balls on a rail with gold
      caps and glints) and **woollens** (teal awning, stacks of folded hats and
      scarves). Each carries the full kit the six had — stripe, counter,
      hanging pictogram, and its own stock to throw across the snow when it is
      wrecked — with a test that holds every trade to all four so a ninth
      cannot be half-added.
- [x] Shoppers carry the shopping they drop. A panicking shopper has thrown a
      bag into the snow since the crowd was first written, out of hands that
      had never been holding one. Now shoppers and pensioners walk the market
      with a bag — handles, a dark rim and a fold across the top — and the
      colour in the hand is the colour that lands, off a single `BAG_COLS`
      list so the two cannot drift apart. Three details cost a retake each:
      the coat ellipse is drawn *after* the arms, so the first bag at the
      hand's 0.9r was half-buried and now hangs outboard and low; two of the
      four colours were a shade off lit snow and needed the rim; and a
      pensioner's stick is always in the right hand, so the bag takes the
      left. Parents have both hands on a pram, Santa has a sleigh, and the
      dead hold nothing up. The `ri(0, 3)` that used to pick the dropped
      colour is still rolled and thrown away — deleting it would renumber the
      simulation stream and rescore all twenty-one markets.

- [x] The edge of town, not the edge of the canvas (plan 2 item 11). The
      camera is allowed a long look past the fence — `CAM_OVERSHOOT` plus the
      drive leash that keeps the car near the middle of the frame put the
      fence at mid-screen, 924 world units of out-of-world on the shortest
      market. That camera is right; what was wrong is that out-of-world was a
      flat `fillRect` of `TH.sky` against a light snow floor, a seven-to-one
      luminance step across a ten-pixel fence stroke, with blood decals from
      bodies flung over the fence floating in it. Now the snow fades through
      the floor tint into night over 980 units — a cached gradient, so no
      frame builds one — with three bands of conifer silhouettes packed
      against the fence and thinning outwards, each band smaller, further out
      and more transparent than the one in front. Placed off a stateless hash
      of the index, so neither random stream is touched and a market's
      treeline is as fixed as its stalls. Blood and replay stains are clipped
      to the fence. Two dead ends on the way: a tree-coloured middle stop in
      the gradient turned the whole band green, and trees spread evenly across
      the fade read as scattered confetti rather than as a wood.

- [x] The goal checklist gets a plate wide enough for it, and two tautological
      tests get teeth (plan 2 item 12). The plate's *height* was measured off
      its contents; its width was two hard-coded numbers, so thirteen of the
      sixty-three goal lines finished up to 45px past the right edge — on the
      raw market, in grey — which is the exact failure the plate was added to
      fix, one axis over. It is measured off the widest goal it has to carry
      now, once per set of goal texts, and clamped so it can never reach the
      car counter. Zero lines overflow at 1280×720, 520×400 or 430×320.
      Alongside: the suite stopped containing assertions that cannot fail.
      `0.115 * 720 < 0.18 * 720` and `14 + 168 < 390 - 14 - 118` were three
      copies of `drawHUD`'s own numbers; both now read the rectangles
      `drawHUD` actually draws, via a new `hudCarsRect()` accessor. The
      harness's `measureText` stopped answering a flat 30 for every string —
      it derives from the live font, so a layout the game measures for itself
      can be checked at all. Three zero-assertion smoke tests were renamed to
      say "does not throw", which is what they do. `G.runBest` deleted:
      written on every combo, never read, one character away from `G.bestRun`,
      which is the one the goal pool actually tests.

- [x] The run ends when there is nothing left to hit (plan 2 item 13). Market 1
      — the first market anyone plays — spent 2.0 to 3.3 seconds per car, ten
      seconds a market, watching a car roll across empty snow with the score
      frozen. A run now ends after 1.2s without a point if nothing live is
      inside the corridor the car still has the speed to sweep. Two things had
      to be right for that to work. The horizon is the car's **actual**
      roll-out — the closed form of `stepCar`'s own decay down to `STOP_SPD` —
      not a flat 700px: at 150px/s the car has ~180px left in it, and a fixed
      radius kept the run alive on stalls it was never going to reach. And the
      shape is the **corridor** the car sweeps, not a cone: at 75° either side
      a cone is most of a half-plane, and market 1's tail was a car coasting
      *past* stalls 110–310px off its shoulder. The fence counts as something
      to hit — genmarket pulls it in so a long shot bounces back into the crowd
      — but only while a bounce would leave the car above `STOP_SPD`. Dead time
      on market 1: 10.4s → 5.5s, worst car 3.3s → 1.9s. `previewPath` shares
      the same function, so the aim dot stops where the car stops; preview
      error per car actually **improved** to 0.3–4.6%. Raising `STOP_SPD` was
      the cheap fix and stayed rejected — it is at 110, just above `KILL_SPD`
      85, so the next notch starts eating kills, and there is a test for that.
      Run length moves scores: market 1's `par` re-derived 0.1241 → 0.1580
      (target 3,700 → 4,700), which is the only market that moved out of band.

- [x] The particle buffer stops eating the score pops (plan 2 item 14). One
      MIDNIGHT MASS run makes 12,390 tears out of 19,707 particles, sits
      pinned at the 899 cap, and `addFx`'s eviction took the front 200 entries
      whatever they were — which deleted **8 of the 12 score pops mid-flight**.
      The game was throwing away the only thing on screen that says what you
      just earned, to make room for crying. Three changes: text is now the
      last thing evicted rather than the first; tears are not spawned for
      anyone the camera cannot see (the same call `wailSlot` already makes for
      audio); and `drawFx` finally culls against the frame the way
      `drawGround`'s gore, debris and track loops always have. Zero pops lost
      on markets 1, 11 and 21, and every score is byte-identical — **all four
      `rr()` draws stay unconditional whether the tear is spawned or not**.
      That last part is the whole item: hoisting `vx` and `vy` onto one shared
      speed roll cost a draw and dropped the tutorial from 10/10 to 8/10 on
      the first try, and skipping the rolls outright puts markets out of band.
      Fifth system in this family, after `seedSnow`, `popText`, `addGore` and
      the shake.

- [x] Portrait stops being a 20-pixel car (plan 2 item 15) — the last item of
      plan 2. `z` is world units down the frame, so one number is a 58px car on
      a desktop and a **23px** one on a phone, with a 7px shopper under it.
      Plan 1 item 6 made a market launchable in portrait by driving the zoom
      off the width; this is what that cost on the other side. Two changes and
      one consolidation. The drive zoom is capped by the thing that actually
      matters — never let the car fall under `CAR_MIN_PX` (34) of screen —
      which never binds at 720 high or above and holds a 390-high frame at
      z 860 instead of stretching to 1300, road ahead traded for being able to
      see what you are driving. And the width term may still pull the picture
      back, but not past `MIN_FILL` (0.6) of the height-driven zoom: on a
      tablet held upright (820×1180) it had shrunk the view to 43% of what the
      height allowed and left **31% of the screen outside the playfield**.
      Then the consolidation, which the first version needed and did not have:
      `camTarget` frames the aim view by placing the sling a fixed distance in
      from the left edge, so it has to know the scale `camApply` will use — it
      had its own copy of the formula, and the moment `MIN_FILL` entered one
      and not the other a full pull went off the left edge of a tall window.
      One `camScale(z)` now. Phone: car 23→34px, shopper 7.9→11.6px. Tablet:
      car 30→43px, frame filled 69%→98%. Desktop unchanged.

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
- [ ] **Weather that bites.** The *look* is done — gusting wind, streaking
      snow, drifting fog banks. What is left is the part that changes play:
      fog that actually hides a crowd until you are in it, and wind that
      pushes the car mid-flight. Both move the simulation, so both need the
      21 pars re-derived.
- [x] **Sound pass.** Done in plan item 17: wails capped at three voices inside
      900px, an engine drone that tracks speed, squish pitched by the combo, a
      landing voice of its own, a resumable context and a baked noise bank —
      211.8 oscillator spawns a second down to 24.
- [ ] **Ragdoll pass.** Bodies currently slide and stop. Limbs that trail, bodies
      that fold over the bonnet and get carried, pile-ups against stalls.
- [x] **Menu cover.** Done: `cover.webp` + `cover.webm`, recorded by
      `tools/crashmas_cover.mjs` out of the browser itself (captureStream into
      a MediaRecorder — there is no ffmpeg here). Rerun it after anything that
      changes how the game looks.

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
