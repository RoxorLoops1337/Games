# Merry Crashmas — roadmap

The game is `merry_crashmas/index.html` (one file, four inline scripts sharing a
scope). Tests: `tests/merry_crashmas.test.mjs`, run with `npm run test:crashmas`;
`npm run check` must be green before every push.

The brief this roadmap serves, in the owner's words: **more gore detail in the
replay, rounds that look different from each other, and more of a game — more
addictive, more challenge, puzzles, cars that behave differently over time.**

## CURRENT PHASE: D — execute the plan

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
- **D — execute the plan.** Work `.polish/crashmas-plan.md` top to bottom, one
  item per pass, ticking `### [ ]` → `### [x]` as each ships. Items 1–15 are
  done. **Next: item 16** (HUD legibility pass). Exit: all 19 ticked.
- **E — three more critics, then back to C.** Repeat the cycle.

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
- [ ] **Sound pass.** The synth is thin: engine note that tracks speed, crowd
      panic layer that rises with how many are fleeing, a proper level-clear
      jingle, a replay sting that is not two notes.
- [ ] **Ragdoll pass.** Bodies currently slide and stop. Limbs that trail, bodies
      that fold over the bonnet and get carried, pile-ups against stalls.
- [ ] **Menu cover.** `cover.webp` + `cover.webm` so the games index shows real
      footage like the other entries.

## Notes for whoever picks this up

- The market generator is one function, `genMarket(lv)`, driven entirely by the
  level's seed. Everything about a market's look lives in `THEMES`; its shape in
  `lv.shape` and the `laneAt()` helper.
- Goals live in `GOALS` with a `gen`/`test` pair each; adding one is a few lines.
  `needs` gates a goal on the market containing something (santa, carousel…).
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
