# Stacking Cats

Live at `https://games-71g.pages.dev/stacking_cats/`. Plain ES modules, no build step; `build.js` only copies the folder.

- `cats.js`: data only (30 cats, snacks, 20 items, 9 Kingdom buildings and their bonus rules, enemy types, themes, unlock rules, meta-stat helpers). Add a cat by adding an entry here AND a draw block in `art_cats.js` (`ACC[id]`). `tests/stacking_cats_sim.test.mjs` checks every cat attacks and has text.
- `sim.js`: the whole game rules, pure and seeded (`newGame({seed})`, `step(g, dt)`). No DOM. The renderer reads state and drains `g.ev` for visual and sound events. Tuning knobs are in `TUNE`.
- `art_util.js`, `art_cats.js`, `art_world.js`, `art_kingdom.js`: all art is procedural canvas drawing (no image files). Cats are drawn once into a 120x120 box and cached by `main.js`.
- `main.js`: renderer, effects, HUD and all DOM screens. `audio.js`: synth sound and music.
- Save key `stacking_cats_save_v1` (never rename). Unlock stats and coins are committed when a run ends; `save.kingdom` holds coins and building levels (additive fields only).
- Progression: coins earned in a run go to the Cat Kingdom; building levels become `g.meta` (see `kingdomBonuses`) and are added in `calcMods`. Items live on `cat.items` (cached sums via `itemFx`), the backpack is `g.stash`. `g.curCat` marks which cat is acting so damage, kills and healing are credited (damage meter, wave report, game over chart). `estDps` feeds the before/after previews, so keep it in step when you change attack numbers.

Tests: `npm run test:stackingcats` (sim rules, kingdom/items/coins/stats, a bot that plays whole runs with and without a built kingdom to keep difficulty fair and progression meaningful, and a headless art and wiring smoke test).
When you change `TUNE`, enemy stats or cat numbers, run the balance test and read the printed wave spread.
No em dashes in any text.
