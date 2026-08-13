# FROSTFELL

A deckbuilding trek through the long winter. Lead a caravan of wardens across a
frozen world: counter-based card battles, charms, waves, and a deck you rebuild
every run.

Play: https://games-71g.pages.dev/frostfell/
Typeface specimen: https://games-71g.pages.dev/frostfell/fonts.html

Landscape only, built for a phone held sideways. One file — `index.html` carries
the markup, the CSS, the fonts and the whole game.

The stage is 720 tall, always; its width follows the device, so a 20:9 phone
gets the extra width rather than two black bars. Everything that touches an
edge is placed against a safe inset so a notch never eats it, and the render
suite checks every screen at five device shapes for touch targets under 40px,
anything hanging off the stage, and anything hiding under a notch.

## The rules, briefly

- **The board** is two lanes deep, three columns a side. Column 0 is the front,
  nearest the middle of the table. A swing hits the **front-most foe in the
  attacker's own lane**; if that lane is clear it reaches across, and a unit
  with nothing in front of it will walk into the lane where the fighting is
  rather than stand there.
- **One action per turn.** Play a card, ring the redraw bell, or pass. There is
  no mana — the turn *is* the cost. Moving a warden already on the board is
  free, and so is calling in the next wave early.
- **Counters** are the clock. Every unit counts down one per turn; at zero it
  triggers — ability *and* swing — then resets. A counter driven to zero by a
  card fires immediately, which is where the combos live.
- **Resolution order** is fixed and visible: every foe before every warden,
  front of the table before the back, top lane before bottom. The ORDER toggle
  numbers the board so you can read it before you commit.
- **The redraw bell** throws your hand away and deals a fresh one. It costs the
  turn unless it has charged (four turns without ringing), in which case it is
  free.
- **Waves.** Fights arrive in more than one piece. The wave clock is on the far
  side of the table; CALL pulls the next one in early, which is often the
  strongest play on the board — a wave that lands on your terms is half a wave.
- **Hurt.** A warden that falls comes back with half its attack and half its
  health, and shakes it off by seeing a whole fight through. Damage carries
  between fights; camps and the trader mend it.
- **Combos.** Kills inside one turn are counted together and paid for. Clearing
  a board in a single action is the play the whole game points at.
- **Charms** bolt permanently onto a card. **Sigils** put that warden on the
  board before the first bell. **Bells** are run-wide and chosen after a beast
  falls — an extra card each hand, a slower wave clock, a fatter purse.
- **Events** are forks in the road: a shrine, a stopped caravan, a hot spring,
  a bell in a dead tree, somebody else's fire. Every option is a real trade.
- **Rest stops** hand out one small permanent kindness; **shrines** take a card
  overnight and give it back better; **packs** hunt a named way — in the dark
  behind Shell, at a run, in the briar, starving, or in relays.
- **Shove** puts what it hits a slot further back. **Crush** hits harder for
  every other body in the target's lane, so a stacked line is a liability.
  **Hoard** grows while a card waits unplayed in your hand.

## Beyond one run

- **The collection** on the title screen lists every warden, every piece of
  gear, every charm and all four leaders. What is still locked says exactly
  what it wants and how far along you are — the counters are ones the game
  already keeps: foes felled, best single turn, zones crossed without losing
  anybody.
- **Winters** are the optional difficulty. Each is one sentence and a price in
  points — thicker snow brings waves a turn sooner, a lean purse costs a third
  more, a weary leader sets out hurt — and the hardest total a tribe has ever
  carried across the fell is remembered next to its name.
- **The Stranger** is the fourth leader, earned by crossing a zone without
  losing a warden.

## Teaching, sound, and feel

A first run comes with hints that watch rather than block — each waits for the
player to do the thing it names, stays up long enough to read even when the
action that clears it has already happened, and the whole sequence goes away
with one tap. HOW TO PLAY is a three-page rulebook covering the fight, every
status and every keyword; it is on the title screen and behind `?` in a fight.

The score is a step sequencer, not a loop: three voices over sixteen steps with
the root, scale and tempo chosen by where you are — and it runs on its own
randomness, because a run has to play the same way twice.

## Playing it with a thumb

Drag a card to a slot, or tap it once to pick it up and tap where it goes —
either works, which matters on a phone. A held card lights the exact slot it
would land in and paints a ghost of itself standing there. A drop that would
not work says why in a sentence rather than silently refusing. Holding a card
still for a moment opens it to read instead of costing you the drag.

## Reading a fight

Anything one tick from going off draws a line to what it will hit, and the
single unit that resolves first wears a NEXT tag — faint by default, bright
while ORDER is held open. Dragging a piece of gear writes what it would do on
the things it would do it to, with a cross over anything the hit would kill;
the numbers come from the same table the card text does, so the preview and the
effect cannot disagree. A short account of the last few things that happened
runs down the left. The deck and the used pile are stacks you can tap and read
— sorted by name, because the draw order is not yours to see.

## Layout of the source

`index.html` is one script in twelve numbered sections — utilities, palette,
statuses, card data, state, the battle engine, the run layer, juice, rendering,
input, audio, boot. The section index sits at the top of the script.

Nothing is loaded from disk. Every creature in the game is drawn by one
procedural renderer (`drawCreature`) from a recipe — silhouette, surface,
stance, tail, ears, mouth, markings, props, a distinguishing mark, and an idle — so the whole cast comes out of the same
sketchbook and scales to any screen without a single image file. Fur grows
tufts along its underside, ice takes flat facets, metal gets one specular band
and a row of rivets. A creature paws the ground, shivers, sways, hovers or
breathes depending on what it is, and it comes apart on death the same way:
ice shatters, metal falls over, fur goes up in a puff.

The taller silhouettes carry a head that is genuinely separate from the body,
with a neck between them; the small round ones keep the fused bean the cast is
built on. Everything that touches down has legs and feet, four of them if it
walks on four; tails are brushes, whips, plumes, fins or stubs; and every
creature carries one distinguishing mark — a scar, an eyepatch, freckles, a
lit coal on the chest, a fringe of icicles, a bandage, a monocle, a leaf. The
rules suite refuses to let two creatures share a whole row of that table, which
is what stops the cast being one drawing in sixty-six colours.

Faces move too. Eye size and spacing come from a stable hash of the recipe, so
no two land on the same numbers by accident, and brows and lids are derived
from what a creature is: a foe gets an angry brow, a heavy lid, and a tooth
showing over a closed mouth. Cute, and still hungry.

Each zone owns its foreground and its weather — conifers with snow on the
branches in the Whitewood, broken plates over black water on the Long Shelf, a
jagged skyline with one watchfire still burning at Hollow Peak — under drifting
snow, a scouring wind, and falling ash respectively.

## The typefaces

Two families, cut from source in `tools/frostfont/` and embedded as WOFF:

- **Frostcut** — the display face. Heavy, condensed, faceted bowls, icicle
  wedges on the arms.
- **Frostwork** — the UI face, regular and bold. Tall x-height, flat-cut
  terminals, built to survive an 11px label.

```
node tools/frostfont/build.mjs             # rebuild + re-embed
node tools/frostfont/build.mjs --check     # fail if the embed is stale
node tools/frostfont/build.mjs --specimen  # write fonts.html
```

## Looking at it

```
node tools/frostfell/shots.mjs                  # → /tmp/frostfell-shots
node tools/frostfell/shots.mjs --size 2400x1080 # a taller phone
```

Opens the real file in the preinstalled Chromium, walks the route a player
walks — boot, title, rulebook, collection, leader, trail, a whole first fight,
reward, shop, camp, rest, shrine, event, a beast, the end — and leaves a PNG of
each. The headless suites prove the game does not throw; only this tells you
that two labels overlap or that a colour has vanished into the backdrop. It
drives the game through `window.FF`, the same handle the suites use, so the
walk cannot drift out of step with the rules.

## Building a deck

Every reward can be spent three ways: take one of the three cards, **copy**
something already in the caravan (charms and all), or **burn** something out of
it. A smaller deck draws what it needs, so thinning is a real play rather than
a punishment. The trader will burn a card for money too.

The three cards on offer are not random: the pool reads what the deck already
holds — its tribe, its keywords, the statuses its text keeps mentioning — and
leans that way, while making sure a caravan short of bodies is shown bodies.
Rarity still sets the floor; a lean never turns a rare into a common.

## Beasts

Each one turns over at half health, once, and fights differently afterwards.
Mother Glacier calves and comes apart into shardlings, the White Stag stops
circling and starts running, the Hollow King's crown cracks, the Weeper stops
weeping, the Kettle Titan's boiler goes, and the Last Winter deepens.

## Endings

A defeat draws what actually stopped you — the run remembers the blow that took
the leader, by name and well enough to draw the thing again. A crossing lays
out the caravan that made it, every card of it.

## Tests

```
npm run test:frostfell    # rules, render, teaching, and a bot that plays whole runs
npm run test:frostfont    # rebuilds both faces and byte-compares the embed
```

The suites run headless against the real functions through `window.FF` — there
is no second implementation of the rules to drift from.

`frostfell_run` is the balance instrument, and it plays every run twice: once
with a careless pilot that deploys whatever is leftmost and throws gear at the
nearest thing, and once with a careful one that repositions, pulls a wounded
warden out of the front line, holds gear until it kills, and rings for a wave
while its own board is set. **The gap between their win rates is the number
that says whether playing well is worth anything** — currently 8% against 17%,
so it is worth about nine points of win rate.
