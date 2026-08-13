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
- **The course** is declared at the leader screen and travels the whole trek:
  a fourth card on every table, and a rule to go by. See below.
- **Shove** puts what it hits a slot further back. **Crush** hits harder for
  every other body in the target's lane, so a stacked line is a liability.
  **Hoard** grows while a card waits unplayed in your hand.
- **The line needs room.** At the end of every turn a side with a slot to spare
  passes warmth down the whole line — Regen 1 on everybody — and a side packed
  into all six slots has nowhere to fall back to, so the cold gets into
  somebody. It is one rule with two faces, and it is what makes "should I put
  this down?" a question instead of a reflex. The board says which face you are
  on, under your own side of the table.
- **Schemes.** A counter says *when*; a scheme says *what*, one turn early, in
  words on the table. A foe that lunges names the warden **and the slot it is
  standing in** — move them and it hits empty snow and loses its whole turn,
  leave somebody else there and that body takes an ordinary blow instead of a
  double one. One that calls the pack needs a free slot on its own side to put
  the new body in. One that breathes on a lane needs a warden still in that
  lane. Every scheme can be taken away, and every way of taking it away is
  free: moving is not your action for the turn.

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

Anything one tick from going off draws a line to what it will hit — at the
warden it has *named*, if it named one — and the single unit that resolves
first wears a NEXT tag — faint by default, bright
while ORDER is held open. Dragging a piece of gear writes what it would do on
the things it would do it to, with a cross over anything the hit would kill;
the numbers come from the same table the card text does, so the preview and the
effect cannot disagree. A foe that has committed to a scheme flies a ribbon
saying so, in the band outside its own lane, until it fires or somebody takes
it away. A short account of the last few things that happened
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

Every reward can be spent five ways: take a card, **copy** something already in
the caravan (charms and all), **burn** something out of it, **redeal** the whole
offer for scrip, or **pass** — which pays you scrip for walking on. A smaller
deck draws what it needs, so thinning is a real play rather than a punishment,
and a caravan that already has what it needs has a reason to say no.

The cards on offer are not random: the pool reads what the deck already holds —
its tribe, its keywords, the statuses its text keeps mentioning — and leans that
way, while making sure a caravan short of bodies is shown bodies. Rarity still
sets the floor; a lean never turns a rare into a common.

### The course

Before a single card is drawn, at the leader screen, the caravan declares a
**course** — one of five, free, and it costs you the other four. A course does
two things: it puts a **fourth card on every table** for the rest of the trek,
always one going your way, and it hands you a rule to travel by.

| | the extra card | the rule |
|---|---|---|
| **The Hearth Road** | hearth | every warden you set down arrives with Spice 2 |
| **The Deep Cold** | frost | every wave walks in already carrying Frost 1 |
| **The Scrap Trail** | scrap | the first gear you use each fight does not cost the turn |
| **A Full Line** | wardens | a full board never costs your line its warmth, and the warmth is doubled |
| **A Heavy Pack** | gear | gear you use goes back into the deck instead of the used pile |

The course can be changed later at any reward screen for scrip, which is the
one way a run pivots once it has seen its own hand.

### What the caravan is short of

The last zone is a check on the deck rather than on the play. That is measured,
not felt — see the probe below — so rather than hide it the game says so out
loud. **THE CARAVAN** on the trail screen lists five things a deck needs by the
time it gets there, each with what it has against what it wants: bodies, a hard
hit, a wall, mending, and a lean deck. The worst of them is named in a sentence
on the trail, on the reward screen and at the trader, so nobody has to lose a
run to find out what was missing.

### Tempering, and where to find it

**Temper** puts +2 attack and +3 health on a card of your choice and leaves the
deck exactly the size it was. It is the strongest thing in the run, and it lives
in **three places at three prices**:

- **the trader** takes scrip for it, once a visit
- **a camp** will work the fire instead of mending anybody that night
- **a reward screen** will do it in place of the card you were going to take

A caravan can carry **four tempered cards** and no more — the fire only does so
much. The cap is what makes three doors a question of *when* and *what it costs*
rather than simply four times the power; without it a competent pilot went
straight to a 67% win rate.

This started as one service at one node, and that was a single point of failure
wearing a decision's coat: miss the shop on a map of nine and lose the run. It
was worth fourteen points of win rate on its own. Spread across three doors it
is worth two, and being penniless is survivable — which is the fix, and the cost
of the fix, stated together.

Buying a card at the trader also **lets you leave one on the counter**. Without
that, a purchase was a trap for three iterations running: a penniless caravan
beat a well-funded one by nine points, because every card bought was one more
card between the deck and the card it wanted. A sale that trades up instead of
bulking out is the version that was always intended.

## Beasts

Each one turns over at half health, once, and fights differently afterwards.
Mother Glacier calves and comes apart into shardlings, the White Stag stops
circling and starts running, the Hollow King's crown cracks, the Weeper stops
weeping, the Kettle Titan's boiler goes, and the Last Winter deepens.

**The Kettle Titan** is the one the probe has an opinion about. It stokes: every
trigger it gains an attack and keeps it, and attached to Barrage that made the
fight a timer rather than a fight — it was landing three of every five deaths in
the last zone, the same way every time, whatever the player did. The stoking now
stops at +6, the number is drawn on the beast as **HEAT**, and **frost vents the
boiler** and takes all of it back at once. A beast that gets stronger every turn
is frightening; a beast that gets stronger every turn and cannot be answered is
a difficulty setting.

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

`frostfell_run` is the balance instrument, and it plays every run four times,
by a **cumulative ladder** of pilots — each one is the pilot above it plus one
more thing it knows how to do, so the difference between two rows is that one
thing and nothing else:

- **careless** — deploys whatever is leftmost, throws gear at the nearest
  thing, takes the leftmost card off every reward screen, buys the first thing
  it can afford.
- **+ the fight** — repositions, denies every scheme it can read, pulls a
  wounded warden out of the front line, keeps a slot in reserve, spends gear
  only when the gear earns the turn, rings for a wave while its own board is
  set.
- **+ the trader** — mends, tempers, burns to stay lean, and buys a card only
  when the caravan is actually short of one.
- **+ steering the pool** — declares a course, redeals an offer that is not
  worth its price, and passes on offers a full caravan does not need.

At **210 runs a rung** (`FF_RUNS=70`, about two and a half minutes):

```
careless:            20/210 won (10%) · 124/55  reached zone 2/3 · died 86/69/35 by zone
+ the fight:         46/210 won (22%) · 160/91  reached zone 2/3 · died 50/69/45 by zone
+ the trader:        62/210 won (30%) · 173/115 reached zone 2/3 · died 37/58/53 by zone
+ steering the pool: 93/210 won (44%) · 195/154 reached zone 2/3 · died 15/41/61 by zone
```

**Thirty-four points for playing well: twelve from the fight, eight from the
trader, fourteen from steering the pool.** The economy, measured the same way:
penniless 44%, as it ships 44%, bottomless purse 48%. Each course, handed over
rather than declared, against a 42% baseline with none: Cold 53%, Hearth 48%,
Bodies 47%, Scrap 44%, Gear 43%.

The suite also prints **what ends a good run in the last zone**, aggregated by
name across every death — the run always remembered the blow that took the
leader, it just never counted them. One death is an anecdote; two hundred is a
design note, and it was: one beast was landing three late deaths in five.

Three things worth saying plainly about that table.

**The gap is no longer concentrated in one node.** For one iteration the trader
was worth fourteen points on its own, which reads as a working economy and is
actually a single point of failure: one shop node on a map of nine deciding the
run. Tempering now lives at a camp and on the reward screen as well, so a broke
caravan still has roads to strength — and the price of that is that money is
worth about nothing on its own. Both halves of that are the same fix, and the
suite is held to the *total* gap rather than to any one rung, because the rungs
move whenever the doors do.

**Steering the pool measures at nothing**, and that is the honest headline. No
course at all wins 36%; the five courses land between 35% and 40%, against a
standard deviation of three. The pool's own leaning was already a good steer,
and a blunter one laid over the top does not beat it.

Getting there took three shapes, two of which were worse than no course at all:
weighting the whole pool six-to-one drowned out the safety net that shows a
body-starved caravan bodies, and guaranteeing one slot in three was the same
fault, smaller. The shipped shape adds a *fourth* card, so it cannot make an
offer worse — it buys agency and a rule to travel by, not wins.

The rules attached to the courses are a different story, and the probe earned
its keep on one of them. **A Full Line** shipped internally paying its warmth
double on top of never freezing a packed board, and measured **73%**. Gated
behind a board of five or more it still measured **61%**. A course at those
numbers is not a choice a player makes — it is the answer, and the other four
become decoration. The doubling is gone; the course kept the rule that made it
interesting rather than the one that made it win, and the suite now fails if any
course runs more than twenty points clear of the field.

**Every number here carries a band**, printed with the results: one standard
deviation in points at whatever sample was run. At the default eight seeds a
tribe that band is ±10, which is wider than most of the differences on the
table — so the suite reports at eight and only holds the game to a bar at fifty
or more.

It also reports which cards actually get played. A card that is carried around
a whole run and never found a moment is the card's fault, and the suite fails
on it; a card that never gets *acquired* is a weighting matter, and it prints
that separately.
