# LoopDoku

A logic puzzle game with **RoxorLoops & Jasmin**, the Danish beatbox and singing duo.

**Play:** https://games-71g.pages.dev/LoopDoku/

Part of the RoxorLoops1337/Games repo (folder `LoopDoku/`). Run the commands below from inside that folder.

Put one performer in every row, every column and every coloured zone of the stage. Performers never touch, not even at a
corner. Every puzzle has exactly one answer and can be solved by logic alone, no guessing.

No ads, ever. Now and then the game asks players to support the duo instead (follow, tip, Patreon, merch).

## How to play
- **Tap** a square to cross it out (X). Tap an X to remove it.
- **Slide** your finger to paint a row of X's (or wipe them).
- **Double-tap**, **press and hold**, or **right-click** to drop a performer. A wrong performer costs one of your 3 mics.
- **Arrows** in front of every row and above every column cross out the whole line in one tap (tap again to wipe it).
- **Ask Jasmin** for a hint, **Undo**, or **Clear X's**. Keys: arrows, Space = X, Enter = performer, Z = undo, H = hint.

Every performer you place adds a layer to the Loop Station, a live beatbox loop. A solved board plays the whole song.

## Levels
| Pack | Boards | Gigs | What it takes |
|---|---|---|---|
| Easy | 5x5, 6x6 | 40 | singles and simple blocks |
| Normal | 6x6, 7x7 | 40 | more blocking squares |
| Chill XL | 8x8 to 10x10 | 30 | big boards, easy logic: a relaxing long play |
| Hard | 7x7, 8x8 | 40 | "squeezes": zones that own a row or column |
| Expert | 8x8, 9x9 | 40 | double squeezes |
| Terror | 7x7, 8x8 | 30 | small boards that need what-if reasoning |
| Extreme | 9x9, 10x10 | 30 | what-if reasoning on big boards |
| Meltdown | 8x8, 9x9 | 20 | four or more what-ifs on a small board: extremely hard, still no guessing |
| Nightmare | 10x10 | 12 | three or more deep what-ifs on the biggest board |

Packs open as you go (for example 3 Easy gigs open Normal and Chill XL; 8 Hard gigs open Terror). There is also a **Daily Jam** for double points.

**Keep playing:** wins in a row add up to +50%, the first win of each day pays more the longer your day streak, three wins a day complete the daily set (+50), and the win screen always shows how close the next look and the next pack are.

## Looks (skins)
Ten artists pitched a look for the game. The owners picked two, and the other eight unlock with the points you earn.

| Look | Artist | Cost |
|---|---|---|
| Neon Club Night | DJ Lumen | free (opens the game) |
| Anime Idol Stage | Kira Cel | free |
| Comic Pop-Art | Kapow Kenji | 300 |
| Stickerbomb | Pia Peel | 450 |
| Paper Craft | Scissors Sol | 600 |
| Studio Gear | Analog Ana | 800 |
| Riso Gig Poster | Xerox Rex | 1000 |
| Jelly Candy | Gummi Gus | 1200 |
| Watercolour Storybook | Wren Wash | 1500 |
| 16-bit Arcade | Bitcrush Benny | 1800 |

Points per gig: Easy 15, Normal 30, Chill XL 40, Hard 60, Expert 100, Terror 150, Extreme 200, Meltdown 300 and Nightmare 350. You get +50% for 3 stars and +20%
for 2 stars. A replay pays 20%, and the Daily Jam pays double.

## For the owners: links and settings
Edit `CONFIG` at the top of `tools/loopdoku-meta.src.js`, then run `node tools/build.mjs`:
- `links.patreon` and `links.tip` are empty. Add your Patreon page and a tip link (PayPal.me, MobilePay, Ko-fi...) and their
  buttons appear on the support screen.
- `supportAfterWins` and `supportEvery` set how often the support screen shows (after the 3rd win, then every 4 wins).
- `points`, skin `cost` values and pack unlock rules are all in the same place.

## Project layout
| Path | What |
|---|---|
| `index.html` | opens the look you used last |
| `comic.html` ... `neon.html` | the ten looks; each is one self-contained page |
| `loopdoku-core.js` | rules, input, beatbox and voice sound (WebAudio), the Loop Station, the demo (built) |
| `loopdoku-levels.js` | the level packs (generated) |
| `loopdoku-meta.js` | saves, points, packs, unlocks, Daily Jam, support screen, shared menus (built) |
| `rj-cast.js` | the duo's approved chibi drawing kit (used by Anime Idol Stage) |
| `tools/` | sources (`*.src.js`), the level generator, the build, tests and checks |
| `SKIN_CONTRACT.md` | what every look must implement |

Everything is drawn in code and the sound is synthesized. There are no image or audio assets apart from the shop thumbnails.

## Develop
```bash
npm install                 # playwright-core, for the browser checks
node tools/serve.mjs 5320   # http://localhost:5320
node tools/build.mjs        # rebuild loopdoku-core.js, -levels.js, -meta.js from tools/
node tools/test_core.mjs    # rules, every level's uniqueness, points, unlocks, support timing
node tools/check_all.mjs    # the above plus a phone-emulated playthrough of every look
```
Levels live in `tools/packs/<pack>.jsonl` (one puzzle per line; the order sets the level numbers, so only append). Find more with
`node tools/gen_levels.mjs --race <pack> <total> tools/packs/<pack>.jsonl`, then `node tools/merge_levels.mjs` and `node tools/build.mjs`.

Made for and with RoxorLoops & Jasmin, "100% organic music with the human voice". https://roxorloopsandjasmin.com
