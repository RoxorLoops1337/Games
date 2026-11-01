# Cell Serpent

A Cell Survivor - Shoot Defense style game, with RoxorLoops & Jasmin as the cell.

## How a run works

- One run is one **stage**: one long virus snake crawls down a winding lane toward the membrane at the bottom. Each
  stage has its own lane shape (`PATH_KINDS`) and now and then the snake **surges** for a second (with a warning).
- The cell only **slides left and right** along its row. It fires notes **straight up**, so where you stand is your aim.
  Every cell takes about 10 to 20 shots at the start (numbers are shown x10 so they read big).
- The snake is **one connected chain**. A destroyed cell is removed and the cells in front slide back to close the gap,
  so it just gets shorter and every kill pushes the face away from the membrane.
- The **face is shielded** (no HP, cannot be targeted) until every other cell is gone, then it pops and the stage is cleared.
  If the face reaches the membrane it drains HP until you finish the cells behind it.
- Snakes are long (32 cells in stage 1, growing by 4 per stage, 150 max). Lane shapes include tall hairpins, big lobes and castle steps.
- About one cell in 15 carries a **chest** (at least two): aim for them first. Chests give Beats and a skill fragment.
- Upgrades come only from the **yellow upgrade cells** (a star on a yellow cell, about one per 7 cells, at least 4 per
  snake). Pop one, then pick 1 of 3 with 4 **Free Refreshes** per run. The first two picks are capsule upgrades only
  (attack speed, extra note, extra burst, damage); skills and passives join after that. Each card has a **rarity** (Common, Rare, Epic, Legendary, Mythic, Godlike) that scales its effect. One of the three is always
  common, and every pick raises your luck so better rarities slowly become likelier. Cards show the numbers
  (for example "Notes per shot: 2 -> 3") and the HUD shows what the capsule does right now.
- **Groove**: every note that lands builds the groove meter (+1.5% damage per point, up to 20). Stop hitting and it fades.
  The cell glows when the groove is high.
- **Boss shield wave**: on boss stages a wave of shields rolls down the snake like a beat. Cells inside it cannot be hit, so
  time your shots.
- Every stage has its own **species** (colour, cell style, face and headgear): Love-Struck, Rustic, Sneezy, Grumpy, Sleepy,
  Disco, Sour, Mighty, Frosty, Gloomy. Only the head has a face. Bomb cells are red with a fuse, armor cells have a plate.

## Between runs (the hub)

- **Battle**: stage select. Clear a stage to unlock the next. The first run starts straight in stage 1.
- **Skills**: nine pieces of music gear. Beat Pad (a drum pad under the snake), Spinning Vinyl (orbiting records), Speaker Stack
  (bass thumps), Autotune (homing winged notes), Treble Pins (piercing fan), Drumsticks (sweeping sticks), Hum Bubbles
  (slowing bubbles), Spotlight Storm (percent-HP beams), Bass Drop (executes weak cells). Five are owned from the start, the rest
  unlock with fragments. Skills level up with **fragments only** (permanent damage bonus).
  You choose a **loadout of 5 skills** to take into battle; a run always starts with just your notes and only loadout skills show up as picks. Internal ids (`swab`, `daggers`, ...)
  are save keys and never change.
- **Stats**: Volume, Pitch, Tempo, Stamina, Fame and Encore, bought with Beats.
- **Daily gigs**: three new goals every day (pop cells, clear stages, collect chests, reach a groove, pick upgrades) that pay Beats or Sparkles.
- **Shop**: Beat Box (Beats) and Spark Box (Sparkles) hold skill fragments.
- Two currencies: **Beats** (gold music-note coins, from cells and clears) and **Sparkles** (pink star gems, from clearing
  a stage for the first time).

## Files

`sim.js` (pure simulation and the whole meta economy), `art_draw.js` (all art, drawn in code in the Hocus Vocus chibi
candy style), `render.js`, `audio.js`, `main.js` (input, hub, screens, save), `assets/` (the duo PNGs, baked from the
Hocus Vocus kit). Tests: `npm run test:serpent`.

## Performance notes

Static art is baked once: cells, skills, glows, HUD text and the stage background are all cached canvases that are blitted.
Cells off screen are skipped, the hub stops rendering the game behind it, and the game lowers its resolution (down to 1x) by
itself when frames run slow, then raises it again when it runs fast.
