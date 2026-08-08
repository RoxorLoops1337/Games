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

- [x] A battered car looks battered. `car.dents` (to 6) and `car.gore` (to 9)
      have been counted since the game was written, and both drew as flat discs
      at fixed angles spread over the whole plan: six mud-coloured dots and
      nine red ones, up to **sixteen fills** of nothing that reads as damage,
      over the top of the driver. A dent is a crumple now — a dark three-lobed
      pit with a bright lip on the side the market's light comes from, the same
      rule every shadow and every coat highlight already follows — and blood
      arrives at the nose and streaks back over the bonnet instead of spotting.
      All of it on the bodywork and clear of the cabin, and in **four fills**
      rather than sixteen. Two retakes: the first version spread both over the
      whole plan and buried the driver at full damage, and the second hung
      marks off the flanks and the nose.

- [x] The crowd barrier is a barrier. It was five flat `fillRect`s — a white
      bar, four upright red blocks and two grey stubs — while every other prop
      in the market had picked up a lit face, a shaded face and snow along its
      top edge. It is drawn in numbers, too: the rink alone rings itself with
      sixteen. Now it has slanted hazard stripes in one path (four upright
      blocks read as a fence panel, not a barrier), a lit top rail, a shaded
      lower one, and a foot at each end; wrecked, it is two snapped rail
      pieces with a foot bent up out of the snow, under a shadow sized to the
      wreck rather than to the whole rail it used to be. One trap worth
      remembering: **`roundRect` opens its own path**, so two of them cannot
      share a `fill()` — stacking both feet into one silently drew the far one
      only, and there is now an assertion that counts feet.

- [x] Wrecks remember what they were. Santa used to lose his hat, his beard
      and his belt the instant you hit him and lie there as an anonymous red
      shopper; that was fixed earlier in the session, but the same defect was
      still in two props. A smashed **snowman** was two plain white discs —
      the carrot, the coal, the scarf and the twigs all vanished on impact.
      It now bursts: body lumps and the head knocked off, the scarf lying
      limp, the carrot in the snow, coal scattered and the twigs snapped flat.
      A wrecked **present** was two plain rectangles, one of them yellow; it
      is a burst box now, with a dark torn interior, the base split into two
      pieces **in its own wrapping paper** so you can still tell which present
      it was, the ribbon snapped into curls, and its contents out on the snow.
      Both are deterministic off the prop's existing seed, and the worst frame
      did not move.

- [x] A felled tree is a felled tree. It was one flat ellipse of hard-coded
      `#2c6b40` and a brown rectangle — and that green was the same on all
      twenty-one markets, while the standing tree has always taken its four
      greens from the theme, so felling one erased the market it stood in. On
      several markets "fell the town tree" **is the goal**, worth 3,000: the
      climax of a run ended in a blob. A conifer on its side is a tapering
      wedge of needles with the trunk out the other end, so that is what it is
      now — the standing tiers unrolled along the fall, in the market's own
      greens, out of a splintered stump, with the branches that came off it.
      And the town tree drops its trimmings: five baubles and the star lying
      in the snow around it, off the prop's own seed. Third wreck in a row
      that had forgotten what it was, after the snowman and the present.

- [x] A flattened carousel is a collapsed carousel — and the last three
      tautologies leave the suite. The carousel is the biggest thing in the
      market at r150 and worth 2,500, and wrecking it produced **two
      concentric discs**, one brown and one translucent red, the same on all
      twenty-one markets — the identical theme-blindness the felled tree had.
      It collapses now: the canopy caved in as five fallen segments in the
      market's own awning colours, the centre pole snapped and lying across,
      the finial come off it, and three horses thrown clear of the ring, each
      still a body and a head. Sixteen fills against the running ride's
      twenty-nine, which is the right way round for a wreck. Fourth wreck in a
      row to be given back what it was, after the snowman, the present and the
      tree — **the pattern is that live art gets the attention and wrecked art
      gets a two-line placeholder**, so it is worth checking the dead branch of
      anything new. Along the way: `assert(x || true)` appeared three times in
      the suite, once written by me two passes ago. All three are real
      assertions now — including the snowfall-independence test, which was
      tweaking two constants and never checking the tweak had any effect, so it
      would have passed comparing a build against itself.

- [x] A missed goal says how close it came. The results card showed
      **"WRECKED 9"** and, directly underneath, an unticked **"Wreck 4
      stalls"** — which reads as a broken goal. They are two different
      counters: `G.wrecks` is everything flattened, and the goal tests
      `G.bigWrecks`, props worth 260 or more. An unticked goal said only that
      you had not done it, so there was nothing on the card to resolve the
      contradiction. All thirteen goals report their own progress now, shown
      as a `1 / 4` chip on the right of any missed row; the one-shot goals
      (Santa, the town tree, the carousel) stay silent, because "0 / 1" next
      to "Run over Santa" is noise. Held together by a property test: for
      every goal, at the `n` it actually asks for on each of the twenty-one
      markets, **progress and pass/fail must agree** — 1,638 cases.

- [x] …and the live checklist shows it too. The results card gained per-goal
      progress last pass and the checklist you actually play against did not,
      which is the wrong way round: mid-run is when knowing you are on 3 of 4
      changes what you aim at. Every unticked goal now carries its own count,
      right-aligned at the plate's edge in amber, and the plate is measured
      off the row **including** the number — so "Score 5,800 with one car
      3,120 / 5,800" widens it rather than printing out over the market. The
      width cache is keyed on the progress as well as the text, or the plate
      would stop growing as a number got longer mid-run.

- [x] A child carries a balloon. Every archetype carries the thing that says
      what it is — the pensioner's stick, the parent's pram, Santa's fur and
      beard, the shopper's bag — and the child had nothing at all, while being
      the smallest person in the market at r9 and the subject of one of the
      thirteen goals. The game asked you to hunt for the thing it had made
      hardest to see. Three things had to be right. The balloon is **drawn
      outside `drawPerson`**, batched by colour in world space, so a child who
      has fallen to the batch tier still carries one: adding `kid` to
      `lodAlways` instead cost **461 fills** on the worst frame, against six
      for the batched pass. It is **sized in screen pixels** with a floor of
      9, the same trick the drive camera uses for `CAR_MIN_PX` — at `p.r*0.5`
      it came out under two pixels across at the drive zoom. And every ellipse
      is opened by its own `moveTo`: without one, `ctx.ellipse` joins the
      current point and a batch of them fills a polygon spanning every child
      in the market. It did exactly that, in five colours, across the whole
      screen — **and the suite was green**. There is an assertion for it now.
      Finished the next pass: at the widest drive zoom a bare balloon was
      merely present rather than findable, because a small bright object does
      not separate from a market already full of baubles, lights and wrapped
      presents on colour alone. A dark rim round the lot — one stroke for
      every child on screen — and a floor of 11px instead of 9 is what makes
      them pick out. Same lesson as the shopper's dropped bag, one scale down.

- [x] A child's balloon is let go, not deleted. It vanished the frame they
      were hit — the same thing the smashed snowman and the wrecked present
      used to do with everything that said what they were, except this one
      gets to float away. It is released from where it was floating rather
      than from the body, in the colour the child was carrying, and it keeps
      climbing: everything else in `stepFx` falls, and drag alone would stall
      a balloon in mid-air a few frames after the child let go. Not one roll —
      the drift comes off the child's own coat and walk phase, so a beat added
      inside `killPerson` cannot move a market's score.

- [x] The stalls got the counter they were always described as having. Eight
      trades lay their stock out and the code that draws it is called "what is
      actually laid out on the counter" — there was no counter. Bratwurst,
      baubles, wool and the rest floated on a flat wooden face, touching
      nothing, eight stickers in a row. There is a plank now: lit along its top
      lip, falling into shade down its apron, standing on two legs, and every
      item on it drops a short flattened shadow pushed the way the market's one
      light points. The stock has always halved at `wear > 0.5` with nothing to
      show for why, so that is where the plank snaps: past half wrecked it is a
      stub with a splintered end and the right half of the stall is bare. The
      whole thing follows `face`, so a stall turned away shows the plank behind
      its stock as a back shelf and skips the legs you could not see anyway.
      One trap on the way: batching the contact shadows into a single path
      without a `moveTo` between the ellipses joins them into one polygon
      across the whole row — the suite stayed green and the screenshot did not,
      which is now an assertion. 2487 → 2625 fills at the worst frame, against
      a 3400 budget.

- [x] A market you have not reached is shuttered, not smudged. The picker used
      to paint every locked tile's full plan — stalls, lanes, lamps, the lot —
      and then throw `filter:grayscale(1)` over it. On a first-run menu that is
      twenty of twenty-one tiles rendered as grey mush that still, if you look,
      shows you the layout of every market you have not earned. Locked tiles
      now paint a closed stall instead: shutter down in slats, awning furled to
      a striped bar, snow settling on the roof, lights off — in the theme's own
      colours, because which market it is was never the secret and where its
      stalls stand is. It is one fixed drawing for all of them, which is the
      property the suite holds: two markets that share a theme but not a shape
      must be byte-identical shuttered and must not be unshuttered, or the
      check proves nothing. 17 rects against 197 for MIDNIGHT MASS's plan.

- [x] The nitro exhaust is a jet, not a row of dots. The one power move in the
      game drew `circle(x, y, size * k)` under `lighter` — a string of round
      bubbles trailing off the back bumper with no direction, no taper and no
      heat. A flame has a direction: it is stretched along the way it was
      thrown, white-hot at the pipe end it came out of, and it frays into
      smoke as it cools (`FLAME_SMOKE`, and smoke is drawn `source-over`
      because smoke does not add light to a night market). Every bit of the
      shape is read off the velocity the spawn had already rolled — the spawn
      itself is untouched, so no market is rescored. Two harness notes:
      `carRec` records an ellipse's rotation now, but on `shapes` only, because
      several tests read the *last* slot of an `all` entry as its colour and
      appending there silently turned four of them red. And `api.MAX_PULL` does
      not exist (it is `api.C.MAX_PULL`): `-undefined` is NaN, NaN sails
      through `doBoost`'s `sp < 25` gate, and the nitro fires on a car that is
      not moving.

- [x] The garage says what a car you have not earned actually is. A locked card
      was a picture, a name and a wall — no stat bars at all, so nothing on the
      screen told you what you were grinding towards; and the two unlock
      currencies were told completely differently, a star car counting down
      ("★ 20 (2 to go)") and a shopper car quoting a flat total ("4,000 lifetime
      shoppers") that never said whether you were at twelve or at 3,999. Every
      card carries its three bars now, slate instead of gold when the car is not
      yours, and a locked one gets a green progress bar under a line that reads
      the same way whichever currency it is: "268 / 400 shoppers", "★ 18 / 20
      stars". `carProgress` returns 1 the moment `carUnlocked` does, so the bar
      and the gate cannot drift. It matters most on a phone, where
      `body.short .car i{display:none}` hides the lock line outright — the bar
      is then the only thing left saying you are getting closer, and there was
      nothing there before.

- [x] The glühwein stand is a pot on a trestle, not a pink plate. Fifteen of
      these stand in a market and the live one was four concentric circles — a
      brown disc, a red disc, a pulsing orange disc and a gold ring — the exact
      flat-plate-with-a-hard-edge shape this codebase has fixed everywhere else.
      The funny part is that the pattern ran backwards here: the *wreck* was
      already detailed, and it is the wreck that says what the thing is (a
      copper pot on a trestle, wine in it, cups that had been on the counter).
      So the live one is built out of the wreck's own vocabulary: crossed
      planks reaching past the pot, a lit side on the copper, the wine catching
      the light, a ladle standing in it, four mugs round the rim and steam off
      the top on a rolling phase rather than a particle system. The mugs are
      spread evenly and turned by the stand's seed — four independent `mkRand`
      angles clump, and two mugs on top of each other read as one odd blob,
      which is exactly what the first screenshot showed. 2625 → 2802 fills at
      the worst frame against a 3400 budget.

- [x] The snow on a stall roof drifted. It was the biggest patch of snow in the
      frame and the only one in the game with no shape to it — a rounded
      rectangle with a lit band across the top and a blue band across the
      bottom, four straight edges on something that is supposed to have settled
      there. `snowCapPath` now sags the lower edge in `SNOW_LOBES` lobes off
      `mkRand` and the stall's own seed, and the blue underside is the *same
      path* dropped six pixels, so the shade follows every lobe instead of
      cutting across them — one function, so the two are provably the same
      shape. Two soft banks sit on top of it. Every roof in a market drifts
      differently and every roof drifts the same way on every frame. Two harness
      notes: a curve's bulge is in the control point, not the endpoint, so
      `carRec` collects control points in a new `ctrls` array (not in `all` —
      appending there turns four unrelated tests red, as the ellipse-rotation
      pass already found); and an RNG-purity check that builds its fixture with
      `addProp` is measuring the fixture, since `addProp` rolls its own seed.
      2802 → 2914 fills at the worst frame against a 3400 budget.

- [x] Snow settles on the trees. Every conifer in the game — 209 across the
      campaign plus the town tree in each market — stood bare in a market whose
      ground, roofs and snowmen are all snow, the one prop family that ignored
      the weather. Each tier now carries a load: the same spiked ring shifted
      towards the light, drawn *under* the tier so what shows is a crescent
      along the branches rather than a halo round them (drawing it over buries
      the tree in white, which is what the first attempt did and only the
      screenshot showed). The felled crown keeps its load too. The catch worth
      recording: the crescent is part of the silhouette, and the collider is a
      circle of exactly `r` — the first version reached 1.11r, promising a hit
      the physics will not give. `TREE_TIER` came in from 0.945 to 0.87 so the
      snow, not the needles, is what ends the silhouette; the tree is the same
      size on screen and now ends in white. 2914 → 2982 fills at the worst
      frame against a 3400 budget.

- [x] A barrel lid is staves and banked snow, not a biscuit. 633 barrels across
      the campaign — the second most common thing in the game after the stalls —
      and the top of one was a flat brown disc with a hoop drawn on it. It is a
      lid now: `BARREL_STAVES` seams running from inside the rim out to just
      short of it, and snow drifted against one side of that rim. The snow disc
      is barely wider than the lid that covers its middle, so the dark side is
      buried entirely and only the part the offset pushes clear survives —
      banked, not ringed, which is the difference between a crescent and a
      halo. Reaching exactly 100% of the collider and not a pixel more: this is
      the third pass in a row where the new silhouette wanted to spill past `r`,
      so the assertion now measures the recorded path rather than the
      arithmetic, and excludes the ground shadow, which is not something you
      can hit. 2982 → 3036 fills at the worst frame — 89% of the 3400 budget,
      which is the first number in a while worth watching.

- [x] Props got LOD, and the budget started measuring the frames that were
      actually the expensive ones. I flagged last pass that the worst frame was
      at 89% of budget; measuring properly turned up something worse. **The
      draw-budget test only ever checked one camera** — the car at 800px/s,
      tz 1072. Two cameras are wider: the aim frame, which holds the whole
      market and which you look at before every single launch, and the frame
      right after the launch at 2,000px/s. The aim frame was at **3,913 fills
      against a 3,400 budget** — 15% over, on the screen the game opens on, and
      nothing had ever counted it. Props had no LOD at all, which was fine when
      a stall was a brown box and is not fine now that it carries a counter,
      stock, a drifted roof and a plume. `PROP_FINE` is per kind, not one
      number — a stall's collider is 97 and a barrel's is 27, so a single
      threshold either strips a stall you can still read or keeps a stave seam
      one pixel wide; each threshold sits between what that prop measures on
      the drive camera and on the aim camera. Distant shadows collapse from two
      ellipses to one (that second ellipse was ~200 fills a frame nobody could
      see), and the seven tree baubles batch into three colour passes the way
      their highlights already did. Aim frame **3,913 → 2,759 fills** and about
      20% faster in a real browser, measured interleaved over three runs;
      the drive and launch cameras are unchanged in time, because fill *area*
      dominates and everything dropped is tiny. The budget is no longer one
      flat number: a wider shot legitimately costs more in total, so what is
      pinned is **fills per prop on camera** — 11.9 wide, 16.8 at launch, 18.0
      driving, and it must never rise as the camera pulls back. That is the
      number a new piece of art with no LOD on it moves, and a flat total let
      it hide behind the wider shot for six passes.

- [x] The snow plough is a blade that ends where it hits. One of the two things
      you can pick up, on screen for its whole eight seconds, and it was a flat
      white trapezoid and a red bar: bolted to nothing, with no back to it,
      still white after going through a crowd — on the front of a car that had
      already been given panel shading, a glass glint and brake lights. It is a
      curved band now, wide and shallow the way a plough is, sweeping back past
      the front wheels, with a steel scraping edge, a lit lip, and the blood it
      has collected off the same `car.bloody` the tyre tracks already read.
      The correctness half: the old art reached `CARL*0.72` and the pickup only
      lets you hit `CARL/2 + 12`, so the blade drew a promise 10% longer than
      the physics keeps. `plowReach()` is now the one expression `inCar` and the
      drawing share, and the suite checks it from both ends — no drawn point
      past it, and a person at the tip is hit while one just beyond is not.
      Note for the next pass: `emberkin_cards` went red once during this pass
      on "the arriving swing is the weaker one (622 vs 608)" and passed five
      times out of five when run alone. It is a randomised suite; not ours.

- [x] Every prop is now inside the shape you can hit, and one test says so.
      Four passes running had turned up a silhouette drawn past its own
      collider — the tree's snow at 111%, the barrel's bank, the plough's blade
      and its wings — each found by happening to look at that one prop. So the
      sweep exists: for every kind in `PROPS`, at three seeds, nothing it draws
      may reach past its circle or its box. It found three more straight away,
      one of them mine from two passes ago: **the glühwein trestle at 135%**
      (the pot sits inside the trestle now rather than the trestle round the
      pot — same footprint, honest silhouette), **the crowd barrier's end feet
      at 150%**, and **the nutcracker's shoulders at 114%**. Two rules make the
      sweep mean something rather than fire on everything: only *opaque* art
      counts as silhouette, because the lit-side wash every round prop carries
      is a tenth-alpha ellipse that softens an edge rather than making one; and
      a stall's awning is a named exception with a reason — it is a canopy over
      the counter and you drive under it. Both rules are load-bearing: dropping
      either makes the sweep red. It also refuses to pass if the art has gone
      the other way and shrunk, so this cannot be satisfied by making
      everything smaller.

- [x] The pram reads as a pram at the tier that has to swerve for it. It is the
      one silhouette a goal names — "send 3 prams flying" — and the one thing
      `lodAlways` keeps out of the batch *precisely because it has to read
      before you hit it*, and up close it was a phone: a rounded rectangle, a
      pale rectangle inside it, and two near-black wheels drawn only at the
      replay tier and drawn *inside* the dark body where nothing could see
      them. Four wheels now, outside the body at four corners in one path; a
      hood over the head end in a colour deliberately outside `COATS`, because
      a hood the same red as the coat pushing it merges into one shape; and a
      handle bar for the hands that were already reaching for one. The tiering
      is the interesting half: the hood *replaced* the blanket as the middle
      tier's second colour rather than joining it, and the bar rides on the
      arms' own stroke. A pram is never batched, so at launch speed ninety-odd
      are in shot and one extra fill each is 194 off the budget — the ceiling
      added two passes ago caught exactly that (3,571 → 3,765) the first time
      the bar was a fill. Ends up better at every tier for the same 5 fills
      driving, and the suite now pins that number exactly rather than roomily,
      because it caught nothing at 7.

- [x] The pram you send flying is the pram you were looking at. Last pass gave
      the pushed pram a hood and four wheels and left its other two drawings
      alone, so the game had one object in three states that had drifted apart:
      the one in the air had no hood and two wheels both at the same end, and
      the three were three different **sizes** — 1.24r while pushed, 2 × 15 in
      the air whatever the parent's size, 1.6 × that again once landed. It grew
      by three quarters on the way up and shrank by a fifth on touchdown, and
      nobody had noticed because you never see two of the three at once.
      `PRAM_W` is now the one number all three read, off the pushing parent's
      own `r`; the flying pram carries the hood and four wheels; and the landed
      one keeps its "one wheel came off" beat while wearing the same crumpled
      hood. Screenshotting the three side by side is the only way this shows —
      which is why it lasted a whole pass.

- [x] The hat that comes off is the hat they were wearing. Third pass in a row
      on the same shape of defect — one object, several drawings, drifted apart
      — and this one was a hardcode at both ends: the knocked-off hat was one
      red at the spawn and a slightly different red at the draw, so whichever
      of the five `HATS` a shopper had on, the hat that flew off was red. Its
      bobble also trailed behind the crown like a collar, which is the exact
      fault the *worn* hat had a comment about having fixed. `hatOf(p)` is the
      one source now, read by the middle tier, the fine tier and the spawn, and
      the fx draws `f.col` with the bobble on the crown. The suite greps the
      source for both dead literals, so re-hardcoding one is caught rather than
      just being caught by eye.
  - **Known and deliberately not fixed:** Santa's drawn hat is unconditional
      but the fx only spawns on `p.hat`, which is `rnd() < 0.72` — so roughly
      one Santa in four wears a hat that never comes off. Fixing it means four
      more `rr()` calls inside `killPerson` for those Santas, which renumbers
      every roll after it and rescores all twenty-one markets. Same reasoning
      as the discarded `ri(0,3)` kept in the bag drop.

- [x] A rocket burns down behind itself instead of towing a matchstick. Found
      by finally looking at the finale, which nothing had ever screenshotted:
      twenty-one markets flattened, fireworks going up over the wreckage, and
      every rocket trail was a round-capped stroke of constant width and
      constant alpha — a matchstick with a bright dot on one end and a *hard
      rounded cap at the back*, where a rocket is supposed to be thinning into
      nothing. It is two tapered wedges now, full width at the head and a point
      at the tail, the inner one shorter and brighter, so the trail reads as
      burning down rather than as a drawn line. Same fix serves every barrel
      crate, not just the finale. Two notes: the finale's SHOPPERS/WRECKED read
      zero in my first probe and I nearly filed it as a bug — it was the
      fixture setting `G.kills` rather than `G.totalKills`, and the real wiring
      is correct, which is what checking rather than assuming is for. And the
      "fireworks are drawn by the light pass" test counts pieces per rocket, so
      it went from `n * 3` to `n * 4` and had to be updated with a pointer to
      why.

- [x] The man behind the wheel is one man. Found by putting all five cars in
      one picture, which nothing had ever done — you only ever see one car at a
      time, so five drawings of the same thing can drift apart forever. Every
      part of him was measured in the *vehicle*: his width in `CARL` and his
      depth in `CARW`, two numbers that vary independently across the garage.
      So he came out not five sizes of one man but five different **builds** —
      a face 49% wider in the truck than in the coupe, shoulders 0.85
      wide-to-deep in the coupe against 0.66 in the truck, stretched fore-and-
      aft in the van. He is built in his own unit now (`DRIVER = 38`, the
      hatchback's width, so the reference car comes out pixel-identical),
      anchored so his hands stay at the windscreen whatever the car is long.
      The cabin around him still scales, so a truck cab dwarfing its driver is
      what you get, which is correct. The test that should have caught this was
      **called** `every car carries the same driver` and only ever checked that
      his parts were all still present — the fourth time a measurement gap has
      hidden a regression behind a test that looked like it covered it.
  - The same picture, at four times size, turned up a second one in the same
      object: **the eyes were on the hat and the mouth was inside the beard.**
      Both are drawn over the face, and between them they covered all but a
      **0.6px** crescent of it, so the only skin showing was a sliver and what
      you actually saw was two dark dots on a red field and a dark hole in a
      white blob. An earlier pass has a comment about moving the eyes off the
      beard — it moved them onto the hat instead. The hat covers the crown and
      stops short of the eyes now, the beard is a shallow ellipse across the
      chin rather than a disc shoved out in front of the face, and there is a
      **7.2px** band of face between them carrying both eyes and the mouth. The
      old assertion said `the mouth should be in the beard, where a mouth is`,
      which is exactly how a mouth wholly buried in whiskers got signed off;
      it now asserts the opposite, with a pointer to the new test. Five
      revert-variants, each failing on its own assertion: the driver in car
      units (49% spread), eyes back on the hat, the beard back to a disc (fires
      twice — the mouth *and* the beard shape), a driver too big for the coupe's
      cabin, and the bobble back inside the crown. One assertion was dropped
      for being unfalsifiable: a shoulders-aspect check that could not fail
      while both shoulder dimensions were already pinned.

- [x] The carousel you are told to wreck looks wrecked. It is the biggest thing
      in the market at r150, worth 2,500, and the only prop with a goal that
      names it — so its wreck is the payoff for an objective, not just debris.
      A wreck pass had already been done on it, and screenshotting it beside the
      live one anyway turned up three things. **It cast the standing ride's
      shadow**: the `shadow()` call sat above the `if (o.dead)` branch, so a
      collapsed canopy threw the same hard, high, far-offset shadow as one held
      up on a pole, which is most of why the wreck still read as an intact ride
      seen from further off. **The horses had lost their poles** — the
      barley-sugar poles are the one thing that says fairground ride rather
      than striped tent, and the wreck had three horses lying loose in the snow
      with nothing to say what they had come off, the same defect the snowman's
      carrot and the present's paper were fixed for. And **the fallen segments
      still met at a clean apex at dead centre**, so the wreck described an
      intact hub and read as a pinwheel rather than as a roof that had come
      down; each one slides off the hub it was nailed to now.
  - The old assertion said `and it has no poles left standing`, which is
      exactly how the missing poles got signed off — second pass in a row where
      the test that blessed the defect had to be inverted with a pointer to the
      new one. It now pins one batched stroke pass (snapped poles lying with the
      horses) rather than none.
  - Also worth writing down: **my first version of the pole-visibility
      assertion passed the broken variant.** It measured a pole end's distance
      from the horse's *centre*, and a horse is a 17-by-8 ellipse — 20px out is
      12px clear across the waist and 3px clear along the spine. It measures
      against the body's own edge in that direction now (1 on the boundary,
      2.40 as shipped, 1.46 for a pole laid along the spine). The same shape as
      the collider sweep's early measurement bug: an easy radius stood in for
      the geometry that mattered.
  - One line of investigation abandoned on the evidence: the collider sweep
      only ever looks at *live* props, so I extended it to wrecks expecting the
      usual find. Wrecks run to 164% of the collider (bigtree, glühwein,
      snowman) — deliberately, because debris scatters and a dead prop is not
      collidable at all, so nothing about it promises a hit. The bound that
      would fit is the snowman test's ad-hoc 2.2r, and nothing in the kit comes
      near it, so the sweep would have been a test that cannot fail. Not added.

- [x] A market can happen before sunrise, and the glow learned to scale with
      the night it is cutting. Content pass rather than a defect hunt, and the
      content turned one up anyway. Twenty-one markets, six themes, and every
      one of them happened **after sunset**: `dark` ran 0.42 to 0.78 and never
      lower, so the only thing that changed market to market was how far into
      the evening it was, and `night` was carrying five of the twenty-one.
      **FIRST LIGHT** is the seventh — the one bright market in the game, snow
      gone lilac in the shadow, lamps still on and doing almost nothing, the
      least snowfall in the set. It is on THE ICE RINK, NARROW ALLEYS and THE
      LONG BOULEVARD, which takes the spread to a flat 2–4 markets per theme.
  - The defect it exposed the moment it was on screen: **the night wash has
      always scaled with `TH.dark` and the glow added over the top of it never
      did.** A lamp put the same light into the frame whether it was cutting a
      0.78 midnight or nothing at all, which is invisible while every theme
      sits between 0.42 and 0.78 — and on a bright one the stalls blew out to
      solid white, the goods vanished off the counters and the glows bloomed
      into each other because there was no darkness left for them to eat.
      `lightGain()` scales the lamp glows, the headlight beams and the nitro
      halo by `TH.dark / LIT_REF`, and `LIT_REF` is deliberately the darkest of
      the six night themes, so **all six get exactly the gain they had** and
      this changes not one pixel of any market that existed before it. The
      suite pins that: gain is exactly 1 on every pre-existing theme, and
      `LIT_REF === min(dark)` so nobody can quietly move them.
  - The load-bearing assertion for the content half is that **a theme is
      cosmetic all the way down**: generate the same market under two different
      themes and it has to come out identical — props, people, target, goals.
      Without that, moving three markets onto a new theme would rescore them,
      and re-deriving three pars is the thing that makes theme work expensive.
  - Measurement note, third pass running: my first version of the drawn-alpha
      check picked the lamp glows out of the frame **by sprite size**, caught a
      pickup glow instead, and reported 0.80 for a market whose lamps were
      correctly at 0.48. It takes them by position now — the frame's first
      image is the night composite and the next `lamps` are the glows.

- [x] A plan shows the thing the market is named for. The picker paints
      twenty-one tiles and each drew stalls, greenery and lamps — **the three
      things every market has** — and nothing at all of `lv.feature`, which is
      the one thing that makes each of the twenty-one its own idea. Eleven
      markets have a feature and **THE ICE RINK's tile had no rink on it**. You
      pick a market off that tile; telling them apart is what it is for. The
      rink is a sheet of ice laid with the ground, the parade a column of
      marchers crossing the aisles, the choir a block of people, the chicane
      five gates of nutcrackers, and the snowbanks wedges pointing the way up
      them. The generator's x for each is deterministic and copied exactly;
      which side of the aisle it lands on is a live `rnd()` at generation time,
      so the plan rolls it the way it already rolls the town tree's — off
      `mkRand`. A plan, not a mirror.
  - The first version had the bollards as one navy square each, and on THE
      GAUNTLET — a night market, dark floor — **the one thing that market is
      built around was invisible on its own tile**. They carry the nutcracker's
      red tunic inside the navy now, which is both honest and legible. Found by
      blowing four tiles up to 4× and looking, which is the only way a 2px mark
      can be judged.
  - Two things were tried and taken back out on the evidence. The choir as
      sixty dots: at tile scale they overlap into exactly the rectangle they
      replaced, so it was sixty arcs a tile, twenty-one tiles a page, for
      identical pixels. And its rail: five fences come out a hairline nobody
      sees.
  - An existing test had to be re-scoped rather than inverted. `a plan costs a
      handful of fills however big the market is` compared market 1 against
      market 21 and asserted the fill delta was **exactly zero** — a real claim
      about the greenery and lamps batching, but it read a feature's fixed
      two-fill cost as a batching failure. It compares the smallest and largest
      **featureless** markets now, so it measures what its name says, with a
      separate ceiling across all twenty-one (worst tile: 4 fills).

- [x] Blood mist has an edge that falls off. The owner's brief opens with *more
      gore detail in the replay*, so I drove a real run, let the game hand over
      to its own replay, and looked at it. Six puffs of mist go up per kill and
      the replay camera sits at **tz 470** over the thickest part of the run —
      so a fifteen-kill clip puts about **ninety** of them in the same few
      hundred pixels. Each was a `circle().fill()`: a hard-edged disc at one
      flat alpha the whole way across. Ninety of those stack into a single
      lumpy red slab with a visible outline — the largest object on screen
      during the one shot the game makes of its own gore, and the only thing in
      it with no structure at all. It is a baked radial sprite now, the same
      way every lamp in this game is, so a hundred of them read as a cloud that
      thins at its edges; and a puff costs one `drawImage` instead of a fill.
  - **The defect I nearly filed was a capture artifact.** My first replay
      screenshot had the caption washed out and unreadable over a lit stall,
      which looked exactly like a real bug — the letterbox bars were thin in
      the same frame, which is the tell: `bar` and the caption's alpha are the
      same `min(inT, outT)`, so the replay was simply fading out when the
      screenshot fired. I had left the game's own loop running instead of
      stubbing `update`. Frozen properly, the caption is solid white and
      perfectly legible. Second time this session that checking rather than
      assuming saved a wrong entry in this file.
  - The mist sprite is its own bake, not the white light mask — a hundred puffs
      of that would fog the market pale instead of red — and not the themed
      glow either, or the gore would change colour with the market. The suite
      asserts all three, plus one `drawImage` and **zero fills** for ninety
      puffs, and that nothing is rebaked per frame. An existing assertion moved
      with it: `the light sprites are baked once` counts the bakery, so it went
      from `4 + kinds` to `5 + kinds` with the reason written next to it.

- [x] The plough you pick up is the plough you get. **Fourth object in this run
      of passes with two drawings that had drifted apart**, after the pram, the
      hat and the driver — and this one was left behind by a pass of my own. A
      few passes ago the car's plough was rebuilt from a flat white trapezoid
      and a red bar into a curved band with a steel cutting edge and a lit lip.
      The **pickup** that gives it to you was never touched, so the thing you
      drive over stayed the exact art the car had stopped wearing: you were
      promised a trapezoid and given a blade. `plowBlade(tip, wing, bx, th,
      bloody)` is the one definition now, every offset a multiple of the
      blade's own thickness, so the same silhouette comes out at any size — at
      `th = PLOW_T` it reproduces the car's blade to the pixel, which is the
      point: the car does not move, the pickup comes to meet it.
  - The pickup's blade is deliberately **stubbier for its span** than the
      car's, and that is not a cheat: bolted on, two thirds of the depth sits
      over the bumper and all you see is the front edge, so a band that matched
      the car's proportions read as a piece of wire lying in the snow. It got
      two mounting arms and a hitch as well — that is what says "this comes off
      a vehicle" rather than "this is a snowdrift".
  - **My first version of the shared-curve assertion was wrong and said so
      loudly.** It measured the bow as a fraction of the blade's *length*,
      which compares two deliberately different proportions and reported a
      difference that was not one (0.102 against 0.148). The bow scales with
      *thickness*, so that is what it measures now — and both come out at 0.444
      on the nose. Fourth pass running with a measurement note; the pattern is
      always the same, an easy number standing in for the one that matters.
  - Also caught by the source-grep: only **one** of the trapezoid's two colours
      was dead. `#eef5ff` is still the snow puff the car throws up, so grepping
      for it would have been asserting something untrue. Only `#9fb4cd` is
      pinned.

- [x] Every pickup is found by its colour, not just by being bright. Follow-on
      from the plough pass — I noticed at drive zoom that the plough sat under
      a white smear where the other two sat under a green and a gold one, and
      came back to measure it instead of guessing. Sampled out of a real
      browser frame against bare snow: the plough's glow moved the luminance
      **112 → 157 and the saturation 0.256 → 0.284**, which is to say not at
      all. Its colour was `140,210,255`, a pale blue — **the snow's own hue**,
      so adding it lifted all three channels by about the same 1.4× and the
      only signal left was "something over there is bright". The nitro's green
      and the star's gold both swing the hue and read as *a green one* and *a
      gold one* from across a market. The plough wears the red off its own
      hitch now — the single thing on a steel blade that is not steel — and the
      ring in the light pass takes the same colour, so the light and the art
      agree.
  - The suite holds the measurement as an angle: a glow's colour must point
      more than 15° away from the snow it lies on, **on every one of the seven
      themes**, and no two pickups may point within 15° of each other. The old
      plough blue comes out at 4°; the shipped set is nitro 16°, plough 28°,
      star 20°.
  - The seven-theme sweep earned its keep immediately. One of the revert
      variants tried a violet glow, which looks obviously distinct on the six
      night markets and lands **14° from FIRST LIGHT's lilac snow** — it would
      have shipped looking fine and disappeared on three markets. A
      single-theme check would have passed it.

- [x] An edge marker's label sits on a plate, like every other word in the
      game. Screenshotted the aim frame with all three landmark goals live —
      the screen you look at before every launch — and the SANTA marker was
      **the one piece of text in the whole game printed straight onto the
      market**: red type over red awnings and red presents, carrying a
      one-pixel dark copy behind it and nothing else. The score, the checklist,
      CARS LEFT, the driver's shout and the hint along the bottom all sit on a
      dark rounded plate; the odd one out was the line that tells you where the
      most valuable target in the market is. It gets a pill in the HUD's own
      materials now, and the label's own measured width already sets the clamp
      that keeps it inside the frame, so the plate inherits that for free.
  - Two things checked and left alone rather than "improved". The marker set
      looked incomplete at first — only tree, carousel, Santa and the jump on
      your line get one, four of thirteen goals — but every other goal names
      either a count (stalls, combo, score) or a kind of person spread through
      the whole crowd, and the nitro goal is satisfied by the charge you start
      each run with. There is nothing left to point at. And the labels' `SANTA
      3380` distance reads in world pixels, which is a unit the player has no
      feel for; there is no better one to hand and a bar or a dot would say
      less, so it stays.
  - The plate-inside-the-frame assertion sweeps all five ways a marker can
      leave the frame, not just the right edge where I happened to see it.
      Dropping the clamp puts the plate at x 1202–1290 in a 1280-wide view,
      which is what that assertion catches.

- [x] An upside-down car is that car upside down. Two goals name the barrel
      roll and nothing had ever looked at the car mid-flip, so I put all four
      of its states side by side. **The underside was one chassis for all five
      cars.** Flip Santa's sleigh — which rides on runners and has no wheels at
      all — and four wheels appeared under it; flip the monster truck and its
      huge ones shrank to a hatchback's. A fitted plough fell off on the way
      over, which is not a thing a bolted-on blade does. And the comment on
      that branch had said *"chassis, axles, spinning wheels"* since it was
      written, with no axles in the code under it.
  - **Fifth object in this run with two drawings that had drifted apart**,
      after the pram, the hat, the driver and the plough pickup — and the only
      one you see for half a second at a time, which is exactly why it lasted.
      The wheels underneath are now the same four, the same size, in the same
      places as the ones on top; the sleigh keeps its runners; the plough stays
      bolted on; the axles exist.
  - The assertion that carries it compares the upright wheels against the
      upside-down ones **position by position and size by size, for every car
      in the garage**, rather than checking that some wheels are present. That
      is the difference between this test and the one it sits next to, which
      passed the whole time the defect was there.

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
- [~] **Ragdoll pass.** Started: limbs done. A corpse's four limbs were four
      fixed line segments in the body's own frame — the same starfish at
      400px/s mid-tumble as lying still, which is exactly what "bodies slide
      and stop" looked like up close. They are jointed now, with a knee and an
      elbow, and they trail: swept hard behind at the moment of impact,
      opening out as the body settles, arms lateral and legs trailing back
      once it stops. A harder hit fans the pair wider. Every bit of it is a
      pure function of `fly`, `squash` and `side` — the three things the
      replay restores — so a corpse poses the same way in the clip as it did
      live, and not one random draw is involved: a ragdoll that rolled for its
      spread would move all twenty-one markets. Still to do: bodies that fold
      over the bonnet and get carried, and pile-ups against stalls.
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
