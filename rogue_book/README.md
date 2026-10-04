# ECHOWAKE

A rogue ballad. Two heroes, one silent land, a deck of gem-socketed cards.

Play: https://games-71g.pages.dev/rogue_book/
Art sheet (every sprite, icon and scene the game draws): `rogue_book/gallery.html`

A yokai called the Hush has eaten every sound, and the land has gone grey and still. You lead two
heroes across it, wake the map hex by hex with Echo, and fight with a shared deck where every card
belongs to one hero. Every hex you wake plays a note, so the path you choose writes a melody. Three
verses, three bosses, four heroes, ten Tempo Trials, a Daily Jam, a Hall of Echoes of meta unlocks,
a bestiary, achievements and a story to find.

## What is in the box

- **Map**: a hex land under the Hush. Spend 1 Echo to wake a hex next to the awake ground, or sing a
  one-use Song (Drum Line `stroke`, Ripple `wave`, Shout `fan`, Beat Drop `splash`, Chorus `halo`,
  Hum `blot`) to wake a whole shape. Every woken hex sings one note of the land's hidden tune, and the
  map music sleeps under the Hush until you wake it. Landmarks are heard from afar as silhouettes
  before you reach them. Fights, elites, treasures, shops, camps, forges, fables (events), temple bells,
  Songbirds and the verse keeper. The camera knows where the HUD is (the Song tray included): Fit and
  the minimum zoom show the whole land with no hex under a panel, any hex can be dragged clear of the
  HUD at every zoom, and the party is kept clear of it.
- **Combat**: 3 Energy, draw 5. Heroes stand front or back row and cards change with the row. One free
  row swap per turn, extra swaps cost 1 Energy. Enemies telegraph their intent.
- **Gems**: red, blue, green, gold and wild sockets on cards change how they play.
- **Treasures** (relics): bend the rules; boss treasures come with a price.
- **Heroes**: Hanae (blade, front), Kuro (the Songweaver, a flute, back), Suzu and Raiga (unlocked by clearing
  verses 1 and 2).
- **Meta**: Chimes buy Hall of Echoes unlocks, Tempo Trials 1 to 10 stack difficulty, the Daily Jam is
  the same seeded journey for everybody on a date.

## Controls

Touch, mouse and keyboard all work. On a phone hold the device sideways (portrait shows a "turn your
device sideways" panel with a Play anyway button).

- **Combat**: tap a card to lift it, tap again (or drag it up) to play, tap an enemy for attacks.
  Keys: 1 to 9 and 0 select a card, Left and Right walk cards then targets, Enter plays, E ends the
  turn, S swaps rows, D and G open the piles, Z toggles animation speed, Esc puts a card back.
- **Map**: tap silent ground beside the awake land to wake it for 1 Echo, tap awake ground to walk. Keys:
  Q E A D Z C move the hex cursor, Enter or Space activates it, Esc backs out.
- **Title**: C continue, N new journey, D daily, L Hall of Echoes, S settings, H how to play.

## Art and sound

Everything is drawn in canvas code and synthesized with WebAudio. There are no image or sound files
and no network access. The style is "Sumi-Shonen": an inked anime line, cel shading, screen tone and
gold leaf over a grey, hushed land that blooms back into colour. Every hex you wake sings a note of
the land's hidden tune, and the map music sleeps under the Hush until you wake it. `ART_BIBLE.md` has
the rules.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `css/` | the shell, the stage (1280x720, scaled by CSS) and per-screen styles |
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
that extends one. There is no unseeded random call anywhere; every roll goes through `U.rng`.

## Develop

    npm run test:rogue_book                  all suites, in parallel
    node tests/rogue_book_all.mjs --strict   also demands every script and fixed id exists
    node tests/rogue_book_<name>.test.mjs    one suite
    npm run check                            the repo gate: build plus every game's tests

Tools:

    node tools/rogue_book/shot.mjs ...       headless Chromium screenshots and a UI-driving QA player
    node tools/rogue_book/bot.mjs --help     the balance bot: plays complete runs through the real RUN, COMBAT and MAP

The balance targets (greedy bot at Tempo Trial 0): verse 1 clear 85 to 97%, verse 2 60 to 80%,
full clear 15 to 35%, every hero pair within 8 to 45%. They are written in `CONTENT_SPEC.md` section 7.

Saves live in `localStorage` under keys that start with `rb_` (`rb_profile_v1`, `rb_run_v1`). Never rename them. Internal ids keep the original names (DESIGN 1.1).

House rules (enforced by `tests/rogue_book_hygiene.test.mjs`): no em or en dashes anywhere, pointer
events only, no network, no `eval`, ES2020 only, ids in code must exist in the closed lists.
