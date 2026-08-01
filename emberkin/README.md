# EMBERKIN

A creature collector for the browser. Walk the Hollowbrook valley, meet 19 kin,
weaken them, catch them, raise them, and take them up to Crown Hollow.

Play: https://games-71g.pages.dev/emberkin/

## Shape of the thing

- `index.html` — the whole game: markup, CSS, one inline `<script>`. Canvas
  (256×176, integer-scaled) draws the world and battles; every panel — dialogue,
  menus, HP bars, dex, party, bag — is DOM, so text stays crisp at any zoom.
- `art/*.json` — one file per creature, 40×40 character grids plus a palette.
- `art/tiles/*.json` — 16×16 terrain tiles. `art/actors/*.json` — 16×22 walk
  frames and NPCs.
- `art/BRIEF.md` — the style bible the art was drawn against. `art/ROSTER.md` —
  the dex and its concepts.

The script is sectioned; each marker is a real boundary:

| § | what lives there |
|---|---|
| 1 | helpers, the `G` state object, save/load |
| 2 | types, the effectiveness chart, moves, the dex, items, stat maths |
| 3 | maps as char grids, warps, NPCs, encounter tables |
| 4 | sprite rasterising and the missing-art fallbacks |
| 5 | overworld movement, encounters, world rendering |
| 6 | battle resolution and the battle scene |
| 7 | dialogue, menus, screens, battle playback |
| 8 | the square-wave sequencer |
| 9 | boot, input, frame loop, the `window.EK` test export |

## Art pipeline

Art is data, and the data is authored with a see-it loop:

```bash
node tools/spritegrid/render.mjs emberkin/art/cindercub.json --out /tmp/art --scale 8
node tools/spritegrid/render.mjs emberkin/art/*.json --out /tmp/art --sheet all.png
```

`render.mjs` validates the grid and writes a PNG you can actually look at
(zero dependencies — it encodes the PNG itself). When the JSON changes, stamp
it back into the game:

```bash
node tools/spritegrid/embed.mjs          # write the ART:BEGIN…ART:END block
node tools/spritegrid/embed.mjs --check  # CI: fail if index.html is stale
```

Never hand-edit the generated block in `index.html` — edit the JSON and re-embed.

## How a turn works

`doTurn(action)` resolves an entire turn immediately and returns a list of log
entries, each carrying an HP/status snapshot. State is consistent the moment it
returns; the UI just plays the list back at reading speed. That is why the
tests can drive real battles without touching the renderer, and why the HP bars
can lag the text without ever disagreeing with it.

## Tests

```bash
npm run test:emberkin     # logic + render + art + "is the embed stale?"
npm run check             # the whole repo
```

- `tests/emberkin.test.mjs` — data sanity, type maths, damage, capture,
  levelling, evolution, map connectivity, save round-trip.
- `tests/emberkin_render.test.mjs` — draws every map and every battle state
  against a no-op canvas, then plays the opening through simulated key presses.
- `tests/emberkin_art.test.mjs` — enforces the mechanical half of the art brief:
  grid size, palette completeness, continuous dark outline, feet on the ground
  line, evolutions bigger than their pre-evolutions, matched walk frames.

`tests/emberkin_lib.mjs` stubs a DOM and evals the inline script with
`__EK_HEADLESS__`, exposing the real functions through `window.EK`. Write new
tests with it rather than re-implementing game logic.

## Balance dials

- Encounter rate: `enc.rate` per map (0.12–0.14).
- XP curve `xpFor(lvl) = 0.8·lvl³`; XP gain `yield · foeLevel / 7`.
- Stats: `statAt = ⌊base·2·lvl/100⌋ + 5`, HP adds `lvl + 10`.
- Capture: `captureChance()` — HP ratio × species `rate` × orb `mul` × status.
- Crit rate 1/16, crit multiplier 1.5, STAB 1.5, damage roll 0.85–1.0.
- Status chip damage: max/16 per turn (burn, snare).
- A creature is immune to the status of its own element (`IMMUNE_TO`).
