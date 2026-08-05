# EMBERKIN

A creature collector crossed with a deck-builder. Walk the Hollowbrook valley,
meet 19 kin, catch them, raise them — and fight with a hand of cards. Your kin
brings the attacks; your deck makes them land harder. Every win offers another
card.

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
| 2 | types, the effectiveness chart, moves by element, the dex, items, stat maths |
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
| take a card after a win | ← → then Z | tap it, or **Skip** |
| play the aimed card | ↑ · Z · Enter | tap it again, or drag it up |
| play a card outright | its number, 1-5 | — |
| end the turn | E | the **End turn** button |
| fullscreen | — | ⛶, top right, or Fullscreen in the field menu |
| mute | M | Sound, in the field menu |

The two touch buttons relabel themselves for what they do right now — Talk /
Menu in the world, Play / Menu in a fight, Next while someone is talking.

The aim moves itself onto a card you can afford whenever the hand changes under
you — dealing a hand, or spending the card you were on — but never when you
walked it somewhere yourself, since looking at a card you cannot pay for yet is
a fair thing to want to do.

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

Each turn you are dealt five cards and three energy. The deck has two halves
shuffled together: the active kin's own moves, which are the only cards that
deal damage, and your support cards, which sharpen them. Switch kin and its move
cards leave with it. Spend energy on whatever you like, then end the turn and
take the foe's telegraphed hit.

`playCard(i)`, `endTurn()` and `doAction()` each resolve immediately and return
a list of log entries carrying HP/status snapshots. State is consistent the
moment they return; the UI plays the list back at reading speed. That is why
the tests drive real battles without touching the renderer, and why the HP bars
can lag the text without ever disagreeing with it.

Two invariants are worth stating because breaking either one deadlocks or
corrupts a run, and both did:

- **Every path out of the foe's turn ends in `startPlayerTurn`.** A foe can die
  on its own turn — burn or snare finishing it, thorns answering the hit it
  landed — and `afterFoe` has to send the next one in *and* hand the turn back.
- **`FOE_HP_MUL` never leaves the battle.** `toughen` is undone by `untoughen`
  when you catch a foe, and the max-HP a card grants is booked per kin in
  `b.maxAdds` so a switch cannot hand the bill to somebody else.
- **Drawing a message and advancing it agree on which message that is.** Both go
  through `shownDialogue()`. They used to disagree: an unread `battleSay` line
  still pending when the fight ended meant every press was applied to an
  invisible message whose `hold` nothing was ticking any more, and the run was
  over — no button did anything again. Message holds age in `step` and nowhere
  else, so a message can never be left holding a timer that never runs down.
- **Playback treats an impossible HP bar as settled.** The next log line waits
  for the bars to catch up; a bar that never arrives used to wait for ever.
- **Recoil and drain are paid on what came off, not on what was rolled.**
  Hitting a foe with 3 HP left for 300 recoiled as though it had dealt 300, so a
  heavy move could kill its own user finishing something already beaten.

And `frame()` catches. An exception used to escape, stop the
`requestAnimationFrame` chain, and freeze the page on its last drawn frame with
the buttons still labelled for a state the game had already left. A bug should
cost a frame, not the save.

### Cards

**The kin brings the attacks. The deck makes them land harder.** Nothing in your
own deck damages the foe by itself — a support card that did would make the kin
an accessory to the deck, and it is meant to be the other way round. Every point
of damage in the game comes out of a move the active kin knows.

A card has one growable number, `v`, and `vt` says what that number is:

| `vt` | what the number does |
|------|----------------------|
| `edge` | the **next** attack hits for +v — spend it on the right move |
| `atk` | +v on every attack for the rest of the battle |
| `might` | +v on every attack **for ever**, saved with the run |
| `shield` | soak v damage this round |
| `def` | take v less from every hit for the rest of the battle |
| `heal` / `maxhp` | heal v / +v maximum HP for the battle |
| `draw` / `energy` | draw v / +v energy (every turn, for a power) |

and `fx` carries the riders: `st` puts a status on everything you hit, `hits`
gives your attacks extra swings, `mul` multiplies their damage, `thorns` answers
back, `drain` heals you for a share of what the next attack deals.

Growth is the point:

| field | what it does |
|-------|--------------|
| `grow` | permanent, saved with that copy — the card is stronger forever |
| `bgrow` | grows for this battle only, on every copy in the piles |
| `kill` | permanent, but only when **the attack it sharpened** lands the kill |
| `exhaust` | one use, then out of the deck for the rest of the fight |

Cards are owned as individual copies, because each one grows on its own: two
Whets in the same deck end up different cards. Growth stops at `growCap(id)` —
several times the card's own value — because a card that grows forever
eventually plays the game for you.

**The number on the card is the number on the bar.** `attackBonus()` collects
everything the deck has stacked onto the next swing and `useMove` adds it flat.
Buffs deliberately do *not* go through `effStat` and the level-scaled damage
formula: a card that reads "+4" would be worth about 1 to a level-5 kin and
about 12 to a level-50 one, and then growing it by +1 would stop meaning
anything you can read off the card.

An `edge` survives a miss. Spending two turns setting up a Soulfang and losing
it to a 5% accuracy roll is how you teach someone never to set anything up.

Kin move cards are priced by weight (`moveCost`), so a turn is roughly one real
move plus the support you stack onto it. Foes carry `FOE_HP_MUL` times their
normal HP — only a little over 1, now that the deck sharpens attacks instead of
adding its own.

### Elements

Every kin fights with its own element. Nothing learns a `Wild` move — a
Cindercub bites with fire, not with a generic Nip — so each element carries a
full kit: a quick opener, a first-strike, a workhorse, a heavy fang, a piece of
utility and a finisher. `Wild` survives only as the type of `falter`, the move
you are handed when every real one is spent. The suite enforces both halves: no
kin learns outside its own types, and every element has the whole kit.

That means STAB and the type chart are always in play, which is the point — the
chart is the game's main lever and a deck of colourless moves left it idle.

### What a card says it does

A move card shows **the damage it will do to the foe in front of you**, not a
power rating. Power is an internal number nobody can act on: 45 means one thing
at level 5 and another at level 50, and nothing at all against something that
resists it. `moveDamage()` rolls the real formula against the real foe with the
whole deck stack applied, and shows the range:

    Ember Spit    Ember · deal 20-24, may burn      (vs a Verdant foe)
    Ember Spit    Ember · deal 5-6, may burn        (vs a Tide foe)
    Ember Spit    Ember · deal 24-28, may burn      (with an Edge banked)

On the party screen there is nobody to measure against, so `moveDamageNeutral()`
uses a stated yardstick — a same-level target that neither resists the element
nor is weak to it — and the screen says `~15 dmg`. A mirror of the kin itself
would resist its own element and make every move read as feeble.

### A card after every win

Every win — wild, trainer, the legendary — offers three cards and a **No
thanks**, and the deck grows one card at a time out of what you were actually
offered. A harder fight offers from further up the rarity table (`REWARD_ODDS`:
wild → trainer → legendary). The offer never repeats a card inside one draw,
because a choice between two Guards is not a choice.

`rollReward()` only rolls; picking is what commits, so nothing is spent if the
game is interrupted mid-offer. There is nothing behind the offer to go back to,
so **Back means No thanks** rather than being a button that looks live and does
nothing.

### Chests

Rare gems come from winning; Vane in the Hollowbrook shop turns them into
cards. Four tiers, each costing roughly triple the last and shifting its odds up
the rarity table — Silver never drops a legendary, Prism drops one in five.

### Trainers

A trainer gets exactly one ambush. Walk into their line and they call you out;
after that the sight is spent (`seen_<id>` in the flags) whatever the outcome,
and the rematch is there when you walk up and ask for it. Without that rule a
trainer standing on the only road out of town re-challenges you every time you
walk back, and one loss becomes a soft-lock you cannot train your way out of —
the grass is on their far side.

The rival's first team is the same level as your starter. He already holds the
kin that beats yours; two levels on top of that made the opening fight
unwinnable, which the story suite missed for a while because it fought that
battle with a stacked party. It fights it with the level-5 starter now.

## Tests

```bash
npm run test:emberkin     # logic + cards + render + story + art + embed freshness
npm run check             # the whole repo
```

- `tests/emberkin.test.mjs` — data sanity, type maths, damage, capture,
  levelling, evolution, map connectivity, save round-trip, and the card battle
  end to end (hand, energy, piles, switching, shields).
- `tests/emberkin_cards.test.mjs` — the deck-builder itself. Every card in the
  table is played in a controlled fight and the thing it promises is checked, so
  a card cannot be added with a `vt` or an `fx` that nothing reads — and the
  audit proves itself by failing a planted card whose value nothing applies.
  Also: that no card in your deck deals damage, that a support card adds exactly the number it prints
  at level 5 and at level 50, that an edge is spent by the next attack that
  connects and survives a miss, that every win offers three distinct cards and
  harder fights offer better ones, and that growth sticks to
  the copy that earned it, battle growth does not survive the battle, exhaust
  means gone, kill bonuses only fire on kills, growth respects its ceiling,
  chest odds improve with price, and deck size limits hold.
  The logic suite does the same for moves: every `fx` a move can carry — drain,
  recoil, self and foe stat stages, statuses against a target that is not immune
  to them, priority — is exercised against a foe that cannot die mid-measurement.
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

- Battle: `BASE_ENERGY` 3, `HAND_SIZE` 5, `FOE_HP_MUL` 1.4, `moveCost` by move power.
- Support maths: flat, `attackBonus()` — `mods.atk` + `mods.edge` + `G.might`, × `mods.mul`, over `mods.hits` swings.
- Card reward odds per win: `REWARD_ODDS`, `REWARD_PICKS` 3.
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
