# EMBERKIN

A creature collector crossed with a deck-builder. Walk the Hollowbrook valley,
meet 19 kin, catch them, raise them — and fight with a hand of cards. Your kin
brings its own moves to the deck; you bring everything else.

Play: https://games-71g.pages.dev/emberkin/

## Shape of the thing

- `index.html` — the whole game: markup, CSS, one inline `<script>`. Canvas
  (256×208, integer-scaled) draws the world and battles; every panel — dialogue,
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
| 2b | cards, rarities, growth rules, chests |
| 3 | maps as char grids, warps, NPCs, encounter tables |
| 4 | sprite rasterising and the missing-art fallbacks |
| 5 | overworld movement, encounters, world rendering |
| 6 | the card battle — deck, hand, energy, turns — and the battle scene |
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

## Controls

| | keyboard | touch |
|---|---|---|
| walk | arrows / WASD | the joystick — put a thumb down anywhere in the left zone and it appears there |
| talk, confirm | Z · Enter · Space | the **Talk** button, or tap the text box |
| menu, back | X · Esc | the **Menu** button |
| aim a card | ← → | tap it |
| play the aimed card | ↑ · Z · Enter | tap it again, or drag it up |
| play a card outright | its number, 1-5 | — |
| end the turn | E | the **End turn** button |
| fullscreen | — | ⛶, top right, or Fullscreen in the field menu |
| mute | M | Sound, in the field menu |

The two touch buttons relabel themselves for what they do right now — Talk /
Menu in the world, Play / Menu in a fight, Next while someone is talking.

A card takes one click with a mouse, because hovering already aimed it, and two
taps with a finger — aim, then confirm — so a fat-fingered tap never spends
energy by accident. Dragging is the third way: lift a card past a third of the
hand's height, it lights gold and says **▲ PLAY**, and letting go plays it. Menus,
lists and every screen take a plain tap, and the long ones (deck, dex, box) scroll
under a finger. The line above the hand spells out whichever card you are aiming
at, since the card itself is too small to hold its own rules text. Playing a card
resolves instantly and you keep your turn; only what happens *to* you plays back a
line at a time.

### Fitting the screen

`layoutFor(vw, vh, touch)` is a pure function — viewport in, layout out — and
everything else follows from what it returns:

| mode | when | what it looks like |
|------|------|--------------------|
| `none` | mouse | integer-scaled, centred, no on-screen controls |
| `side` | landscape touch with ≥96px to spare either side | game at full screen height, joystick in the left gutter, buttons in the right |
| `below` | portrait touch with ≥190px underneath | game at full width up top, controls in the band below |
| `overlay` | neither margin is big enough | controls sit on the game's corners |

The controls are `position:fixed` children of `<body>`, not of the stage, so
in `side` and `below` they never cover a pixel of the game. Panel text is sized
in `em` off one font-size on the stage, so the whole UI scales with it. Because
the function is pure, the suite checks every phone and tablet viewport without a
browser.

## How a battle works

Each turn you are dealt five cards and three energy. The deck is your support
cards plus the active kin's own moves, shuffled together — switch kin and its
move cards leave with it. Spend energy on whatever you like, then end the turn
and take the foe's telegraphed hit.

`playCard(i)`, `endTurn()` and `doAction()` each resolve immediately and return
a list of log entries carrying HP/status snapshots. State is consistent the
moment they return; the UI plays the list back at reading speed. That is why
the tests drive real battles without touching the renderer, and why the HP bars
can lag the text without ever disagreeing with it.

### Cards

A card has one growable number, `v`, and `vt` says what that number is — damage,
shield, heal, max HP, attack, guard, draw or energy. Growth is the point:

| field | what it does |
|-------|--------------|
| `grow` | permanent, saved with that copy — the card is stronger forever |
| `bgrow` | grows for this battle only, on every copy in the piles |
| `kill` | permanent, but only when this card lands the killing blow |
| `exhaust` | one use, then out of the deck for the rest of the fight |

Cards are owned as individual copies, because each one grows on its own: two
Jabs in the same deck end up different cards. Growth stops at `growCap(id)` —
several times the card's own value — because a card that grows forever
eventually plays the game for you.

Kin move cards are priced by weight (`moveCost`): a real move plus a support
card is a turn, and three real moves is not. That is where the deck earns its
place. Foes carry `FOE_HP_MUL` times their normal HP in a fight, because a hand
lands two or three cards where a move landed one.

### Chests

Rare gems come from winning; Vane in the Hollowbrook shop turns them into
cards. Four tiers, each costing roughly triple the last and shifting its odds up
the rarity table — Silver never drops a legendary, Prism drops one in five.

## Tests

```bash
npm run test:emberkin     # logic + cards + render + story + art + embed freshness
npm run check             # the whole repo
```

- `tests/emberkin.test.mjs` — data sanity, type maths, damage, capture,
  levelling, evolution, map connectivity, save round-trip, and the card battle
  end to end (hand, energy, piles, switching, shields).
- `tests/emberkin_cards.test.mjs` — the deck-builder itself: growth sticks to
  the copy that earned it, battle growth does not survive the battle, exhaust
  means gone, kill bonuses only fire on kills, growth respects its ceiling,
  chest odds improve with price, and deck size limits hold.
- `tests/emberkin_render.test.mjs` — draws every map and every battle state
  against a no-op canvas, plays the opening through simulated key presses, and
  checks the touch layout: `layoutFor` across a table of real phone and tablet
  viewports, the joystick's dead zone and dominant axis, and that the drag and
  scroll affordances are still wired up in the markup.
- `tests/emberkin_art.test.mjs` — enforces the mechanical half of the art brief:
  grid size, palette completeness, continuous dark outline, feet on the ground
  line, evolutions bigger than their pre-evolutions, matched walk frames.

`tests/emberkin_lib.mjs` stubs a DOM and evals the inline script with
`__EK_HEADLESS__`, exposing the real functions through `window.EK`. Write new
tests with it rather than re-implementing game logic.

## Balance dials

- Battle: `BASE_ENERGY` 3, `HAND_SIZE` 5, `FOE_HP_MUL` 2.0, `moveCost` by move power.
- Card growth ceiling: `growCap` = card value × `capMul` (default 4).
- Chest costs and odds: the `CHESTS` table. Gem payouts: `gemReward`.
- Encounter rate: `enc.rate` per map (0.12–0.14).
- XP curve `xpFor(lvl) = 0.8·lvl³`; XP gain `yield · foeLevel / 7`.
- Stats: `statAt = ⌊base·2·lvl/100⌋ + 5`, HP adds `lvl + 10`.
- Capture: `captureChance()` — HP ratio × species `rate` × orb `mul` × status.
- Crit rate 1/16, crit multiplier 1.5, STAB 1.5, damage roll 0.85–1.0.
- Status chip damage: max/16 per turn (burn, snare). Shock costs the player a
  point of energy; chill costs a card.
- A creature is immune to the status of its own element (`IMMUNE_TO`).
