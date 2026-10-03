# INKWOVEN

A rogue storybook. Two heroes, one living book, a deck of gem-socketed cards.

Play: https://games-71g.pages.dev/rogue_book/
Art sheet (every sprite, icon and scene the game paints): `rogue_book/gallery.html`

The Living Book is being erased by a spreading blankness called the Blank. You lead two heroes
across its pages, paint the map open with Ink, fight with a shared deck where every card belongs to
one hero, and rewrite the ending. Three chapters, three bosses, four heroes, ten Ink Trials, a
Daily Tale, a Library of meta unlocks, a bestiary, achievements and a story to find.

## What is in the box

- **Map**: a hex page of fog. Spend 1 Ink to paint a hex next to the painted area, or use a one-use
  Brush (stroke, wave, fan, splash, halo, blot) to paint a whole shape. Landmarks show as silhouettes
  before you reach them. Fights, elites, treasures, shops, camps, forges, fables (events), wells and
  the chapter boss. The camera knows where the HUD is (the brush bar included): Fit and the minimum zoom
  show the whole page with no hex under a panel, any hex can be dragged clear of the HUD at every zoom,
  and the party is kept clear of it.
- **Combat**: 3 Energy, draw 5. Heroes stand front or back row and cards change with the row. One free
  row swap per turn, extra swaps cost 1 Energy. Enemies telegraph their intent.
- **Gems**: red, blue, green, gold and wild sockets on cards change how they play.
- **Treasures** (relics): bend the rules; boss treasures come with a price.
- **Heroes**: Hanae (blade, front), Kuro (inkweaver, back), Suzu and Raiga (unlocked by clearing
  chapters 1 and 2).
- **Meta**: Inkstones buy Library unlocks, Ink Trials 1 to 10 stack difficulty, the Daily Tale is
  the same seeded run for everybody on a date.

## Controls

Touch, mouse and keyboard all work. On a phone hold the device sideways (portrait shows a "turn your
device sideways" panel with a Play anyway button).

- **Combat**: tap a card to lift it, tap again (or drag it up) to play, tap an enemy for attacks.
  Keys: 1 to 9 and 0 select a card, Left and Right walk cards then targets, Enter plays, E ends the
  turn, S swaps rows, D and G open the piles, Z toggles animation speed, Esc puts a card back.
- **Map**: tap fog beside the painted page to paint it for 1 Ink, tap painted ground to walk. Keys:
  Q E A D Z C move the hex cursor, Enter or Space activates it, Esc backs out.
- **Title**: C continue, N new tale, D daily, L library, S settings, H how to play.

## Art and sound

Everything is drawn in canvas code and synthesized with WebAudio. There are no image or sound files
and no network access. The style is "Sumi-Shonen": a calligraphic ink line, cel shading, halftone,
paper grain and gold leaf. `ART_BIBLE.md` has the rules.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `css/` | the page, the stage (1280x720, scaled by CSS) and per-screen styles |
| `js/util.js`, `data*.js` | deterministic RNG, closed vocabularies, the effect DSL, validators, all content |
| `js/combat.js`, `map.js`, `run.js`, `meta.js` | pure logic: no DOM, no timers |
| `js/art*.js` | the canvas art toolkit, heroes, 51 enemies, cards, icons, scenes, map tiles, effects |
| `js/audio.js` | synthesized music and sound effects |
| `js/ui.js`, `scene.js`, `screen_*.js`, `tutorial.js`, `main.js` | the presentation layer and screens |
| `DESIGN.md` | the design bible and every module contract |
| `CONTENT_SPEC.md` | the content quotas, fixed ids and the 51-enemy roster |
| `ART_BIBLE.md` | the art direction |

All scripts are classic scripts in one global scope. Each file owns one `const` namespace
(`U`, `DATA`, `ART`, `AUDIO`, `COMBAT`, `MAP`, `RUN`, `META`, `UI`, `SCENE`, `GAME`) or is one IIFE
that extends one. There is no `Math.random` anywhere; every roll goes through `U.rng`.

## Develop

    npm run test:rogue_book                  all suites, in parallel
    node tests/rogue_book_all.mjs --strict   also demands every script and fixed id exists
    node tests/rogue_book_<name>.test.mjs    one suite
    npm run check                            the repo gate: build plus every game's tests

Tools:

    node tools/rogue_book/shot.mjs ...       headless Chromium screenshots and a UI-driving QA player
    node tools/rogue_book/bot.mjs --help     the balance bot: plays complete runs through the real RUN, COMBAT and MAP

The balance targets (greedy bot at Ink Trial 0): chapter 1 clear 85 to 97%, chapter 2 60 to 80%,
full clear 15 to 35%, every hero pair within 8 to 45%. They are written in `CONTENT_SPEC.md` section 7.

Saves live in `localStorage` under keys that start with `rb_` (`rb_profile_v1`, `rb_run_v1`). Never rename them.

House rules (enforced by `tests/rogue_book_hygiene.test.mjs`): no em or en dashes anywhere, pointer
events only, no network, no `eval`, ES2020 only, ids in code must exist in the closed lists.
