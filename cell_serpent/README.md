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
- Two cells per snake carry a **chest**: aim for them first. Chests give Beats and a skill fragment.
- Upgrades: after **5 cells destroyed**, then every **10**. Pick 1 of 3, with 4 **Free Refreshes** per run. The first two
  picks are capsule upgrades only (attack speed, extra note, extra burst, damage); skills and passives join after that.

## Between runs (the hub)

- **Battle**: stage select. Clear a stage to unlock the next. The first run starts straight in stage 1.
- **Skills**: nine skills (Sterile Swab, Spinning Daggers, Medical Tower, Snot Dragon, Acupuncture, Massage Stick,
  Disinfectant Bubble, Satellite Storm, Abyssal Maw). Four are owned from the start, the rest unlock with fragments.
  Fragments plus Beats level a skill up (permanent damage bonus).
- **Stats**: Attack, Crit, Cooldown, Vitality, Fortune, Second Wind, bought with Beats.
- **Shop**: Beat Box (Beats) and Spark Box (Sparkles) hold skill fragments.
- Two currencies: **Beats** (gold music-note coins, from cells and clears) and **Sparkles** (pink star gems, from clearing
  a stage for the first time).

## Files

`sim.js` (pure simulation and the whole meta economy), `art_draw.js` (all art, drawn in code in the Hocus Vocus chibi
candy style), `render.js`, `audio.js`, `main.js` (input, hub, screens, save), `assets/` (the duo PNGs, baked from the
Hocus Vocus kit). Tests: `npm run test:serpent`.
