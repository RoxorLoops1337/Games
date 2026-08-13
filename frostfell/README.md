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

---

## Where things are

Nineteen iterations in, this file is both the reference and the design record.
The reference comes first; the reasoning is kept below it, because a rule you
cannot find quickly is a rule nobody reads.

**The rules, in order of how often you need them**

| | |
|---|---|
| [The rules, briefly](#the-rules-briefly) | the board, the turn, counters, waves, the front row, the room rule |
| [Building a deck](#building-a-deck) | rewards, the course, the caravan read, tempering, the trader |
| [Beyond one run](#beyond-one-run) | the collection, winters, the Stranger |
| [Something to chase](#something-to-chase) | seals |
| [Beasts](#beasts) | what each one does when it turns over |

**The code**

| | |
|---|---|
| [Layout of the source](#layout-of-the-source) | twelve numbered sections, one file, no assets |
| [The typefaces](#the-typefaces) | Frostcut and Frostwork, cut from source |
| [Tests](#tests) | four suites, and what each one is for |
| [Looking at it](#looking-at-it) | the Playwright shot walk |

**The instruments, and what they have found.** These are the reasoning, kept
because every balance decision in the game came out of one of them:
[the ladder](#the-ladder), [the same deck two pilots](#the-same-deck-two-pilots),
[which habits are worth anything](#which-parts-of-playing-well-are-worth-anything),
[does walking past a fight pay](#does-walking-past-a-fight-pay),
[what four transcripts had in common](#what-four-runs-had-in-common).

---

## The rules, briefly

- **The board** is two lanes deep, three columns a side. Column 0 is the front,
  nearest the middle of the table. A swing hits the **front-most foe in the
  attacker's own lane**; if that lane is clear it reaches across, and a unit
  with nothing in front of it will walk into the lane where the fighting is
  rather than stand there.
- **The fell answers the caravan.** Part of the difficulty curve is the road —
  which step, which zone — and part of it is what the caravan is carrying. A
  lean line meets a lean winter and a built-up one meets a hard winter. It
  absorbs about half of a deck advantage, deliberately not all of it: building
  a deck still pays, because the fights it wins are bigger, but it stops being
  the whole of whether a run is winnable. What it reads is **the best six cards
  you hold** — the line the board can actually field, leader included — divided
  by the six slots, so an empty slot counts as the weakness it is. A run sets
  out well under the bar and grows into it.
- **The last zone asks more of a caravan that has more.** The deep fell holds
  the same line to a lower bar, and the part of the reading past a margin is
  bitten harder than it would be in the zones before. A caravan that scraped
  over meets the last zone it always did; one built into a wall meets a winter
  built to match.
- **What you walk away from walks after you.** Take the quiet fork at a junction
  that had a fight on it and whatever was there closes two steps. The first six
  are free, nothing picks up your trail in the first zone at all, and it never
  decays — so ducking one bad pack when the line is hurt stays a decision, and
  ducking every fight on the trail is a choice to arrive at the beast with a
  pack at your back. The trail says so, at the fork, before you pick.
- **The front row runs double.** Counters tick down twice as fast in column 0,
  on both sides of the table, and anything standing there wears a `×2` beside
  its counter. Put your slow heavy hitter forward and it swings sooner and gets
  hit for it; keep the fragile one back and it is safe and late. Moving is free,
  so this is a question you answer every turn rather than once at deployment.
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
- **The cold closes in.** Past thirty turns the warmth stops and the frost
  starts taking a little more out of everything on the table every five turns,
  both sides alike. A fight that cannot end is worse than a fight that is lost,
  and per-card tuning does not fix a class of bug that the next healing card
  reopens — so the world ends it.
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

## Something to chase

**Seals** are eight named ways to cross, struck on the title screen and lit as
they are earned: cross at all, cross without losing a warden, cross carrying
eight cards or fewer, hold the course you declared, cross having never bought a
thing, cross under a winter of five, fell every beast in the game, cross once
with each tribe. They cost nothing and change no rule — they are a reason to set
out again, and a crossing that earns nothing new says so.

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

Every rule the game grew after the sound did now has a voice of its own: a foe
drawing breath as it commits to a scheme, the inverted answer when the scheme is
denied, the long hiss of a boiler venting, four falling notes when the fire goes
out and the cold takes the room, two hammer blows and a ring at the anvil, a
bought bell, and a dry handful of snow. A rule you cannot hear is a rule you
learn twice as slowly.

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

## Playing it

```
node tools/frostfell/playthrough.mjs                       # → /tmp/ff-play
node tools/frostfell/playthrough.mjs --tribe scrap --course pack --out DIR
```

One run, start to finish, in a real browser, taking a note at every decision and
a screenshot at every beat that matters. The probe measures the game across
hundreds of runs and prints numbers; this is the opposite, and after seventeen
rounds of tuning against a probe the thing nobody had was a **transcript**.

**It has an opinion.** It used to take option zero everywhere, which made it a
transcript of a passive player rather than a competent one — and a passive
player's complaints are not the game's problems. It now plays like somebody who
has read the rules: it ranks the fork by what the caravan is short of, denies
schemes and keeps a slot in reserve in the fight (the four habits the ablation
says pay), buys bell → temper → mend → meals until the purse gives out, and
scores rewards against the caravan read. The passive pilot fought 38% of its
steps; this one fights 52–75%.

### What four runs had in common

Four leaders, four courses, one transcript each. The brief's point stands: one
run is an anecdote. All four agreed on three things, and all three became work.

| | before | after this round |
|---|---|---|
| caravan power over 21 steps | flat, 5.4 → 6.7 | grows, 4.9 → 8.0–9.3 |
| scrip left at the end | 138–328 | 21–106 |
| "nothing affordable" at the trader | every visit, 2–3 a run | never — the purse runs out, not the counter |

- **The caravan never grew.** Every run read between 5.4 and 6.7 from the first
  step to the last while the deck went from eight cards to twenty-one. It was an
  average over the whole deck, and an average cannot grow: every good card
  drafted is divided by one more card drafted. So the trail, which scales to
  what the caravan is carrying, spent every run answering a caravan that had not
  moved — and quietly discounting itself, because the reading sat *below* the
  bar for most of every trip.
- **The purse was never empty.** Every run walked out of two or three shops
  holding enough to buy anything on the counter. Not a pricing problem and not a
  payout problem: she had run out of things worth buying.
- **Fighting was optional.** All four crossed most of the trail without needing
  to take a fight they were offered a way around.

The three fixes are [the line, not the deck](#the-rules-briefly), [a hot
meal](#a-hot-meal), and [what follows you](#the-rules-briefly) — each measured
below.

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
deck exactly the size it was. It lives in **three places at three prices**:

- **the trader** takes scrip for it, once a visit
- **a camp** will work the fire instead of mending anybody that night
- **a reward screen** will do it in place of the card you were going to take

A caravan can carry **three tempered cards** and no more — the fire only does so
much. The cap is what makes three doors a question of *when* and *what it costs*
rather than simply three times the power; without it a competent pilot went
straight to a 67% win rate.

This started as one service at one node, and that was a single point of failure
wearing a decision's coat: miss the shop on a map of nine and lose the run. It
was worth fourteen points of win rate on its own. Spread across three doors it
is worth two, and being penniless is survivable — which is the fix, and the cost
of the fix, stated together.

### A hot meal

**+1 attack and +2 health** on a card, no card added, **as many as you can pay
for** — 34 scrip, then 60, then 86, and so on up. Sold at the trader *and* on
the reward screen, so scrip earned in a fight has somewhere to go without giving
up a fight to reach a shop. There is a ceiling of twelve for a whole run, set
far above where real play lands (an average crossing eats five and a half and
then the purse gives out); it exists so that a caravan handed absurd money
cannot simply buy the run.

This is the answer to *"the trader is a one-purchase stop — is it the prices or
the payouts?"*, and it was neither. Four transcripts walked out of her stall
holding between 138 and 328 scrip: she was affordable, and she had run out of
things worth buying. The bell is one a visit, tempering is capped for the run,
and everything else on her counter adds a card. The counter needed a bottom, not
a discount.

**And the trader has one thing nobody else sells: a bell.** The run-wide
upgrades otherwise only fall out of a dead beast — one more card every fight, a
slower wave clock, a fatter purse — and she has one, expensively. That exists
because the moment tempering spread to three doors, money stopped being worth
anything at all: penniless and well-funded measured identically. A currency that
changes nothing is a currency to cut or to re-point, and this is the re-pointing.
It put scrip back to five points of win rate.

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

**The Kettle Titan** is the one the probe has an opinion about, and the whole
argument is worth keeping because it took three passes and two of them were
wrong.

It stokes: every trigger it gains an attack and keeps it, and attached to
Barrage that made the fight a timer rather than a fight. It was landing **three
of every five deaths in the last zone**, the same way every time.

*First pass:* cap the stoking at +6, draw the number on the beast as **HEAT**,
and make **frost vent the boiler** and take all of it back at once. Counterplay,
bounded and visible. It moved the death count by almost nothing.

*Second pass — measure why.* The probe counted what a caravan actually held
while facing it: **some frost gear in hand on 23% of turns**, and for a caravan
that never drafted a frost card, on none of them. A counter most players cannot
reach is not counterplay; it is a rule they read once and then lose to. So the
room provides it: **A Handful of Snow** is dealt into the hand at the start of
that fight and nowhere else, goes straight back to the hand every time it is
used, and costs the turn — which is the trade the fight is about. Frost in hand
went to 99%, the card became the second most played in the game, and the death
count *still* did not move.

*Third pass — so it was never only the answer.* By elimination: the beast was
too big for its slot. It carried the largest stat line in the game **and**
Barrage **and** Smackback **and** the climbing attack. Smackback is gone — it
punished the player for the only thing that ends the fight — and 92/8 came down
to 84/7, level with the other beast of that zone.

It went from **36 of 61 late deaths to 6 of 54**, and the top of that list is an
ordinary foe again.

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

### The ladder

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

The instrument draws its own results now. Each row is one pilot and the bar is
**where its runs ended** — how many fell in the first zone, the second, the
third, and how many crossed:

```
                    zone 1 ░   zone 2 ▒   zone 3 ▓   crossed █        won
careless            ░░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓████    8%
+ the fight         ░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓████████   17%
+ the trader        ░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓████████████   25%
+ steering the pool ░░▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓██████████████   30%
```

**Twenty-two points for playing well: nine from the fight, eight from the
trader, five from steering the pool.**

The ceiling came from 42% to 30% and the careless pilot held at 8, which was the
round's hardest ask because the two pull against each other: **every win a
careless run has is a last-zone win**, so anything that makes the last zone
harder for everybody lands on exactly the runs the floor protects. Two attempts
proved it — a flat term on the deep road took the ceiling 41 → 37 and the floor
8 → 6; reading the whole caravan answer harder in the deep fell did the same
thing again more subtly. What separates them is [the
margin](#the-rules-briefly): only the part of the reading past +0.10 is bitten,
and it is bitten hard. The careless caravan reads under the margin and never
feels it — measured at two very different bite settings, it sat at 8% in both.

### Does walking past a fight pay

The transcripts found a winning line the ladder could not see: **eight fights in
twenty-one steps, and the run crossed.** Every rung above fights whatever the
trail happens to put in front of it — none of them *chooses* to walk away — so
no amount of turning the ladder up would ever have shown it.

So: two pilots, identical in every respect except what they do at a fork with a
fight on one side of it.

```
takes every fight     ██████████████████     35%   fought 75% of steps, arrived at 8.9
                                             23.0 cards · 0.1 tempered · 5.4 meals · 91 unspent
walks past what it can███████████████        30%   fought 28% of steps, arrived at 8.5
                                             13.4 cards · 2.5 tempered · 3.1 meals · 43 unspent
```

It read **+13 for dodging** before this round. It reads **−5** now, and the
second line under each bar is why the first fix did not work and the second one
did.

*First attempt:* tax the difficulty curve — a caravan that had not been fighting
loses its discount for being thin. It measured as **nothing**, and the reason is
the whole lesson: **the dodger's caravan was not thin.** It arrived at 8.2
against the fighter's 7.4. Everything it walks *towards* instead of a fight — a
camp, a rest, a cache, a shop — builds a caravan too. A rule aimed at weak
caravans cannot catch a strong one.

*What the second line actually said:* the fighter arrived holding twenty-three
cards, **no temper at all**, and **527 unspent scrip**. The dodger arrived with
thirteen cards, three tempers and fifty. The trail was making the player choose
between fighting and *spending*, and spending is where a caravan concentrates —
a fight paid in cards, which make a deck bigger rather than a caravan stronger,
and hid the exchange behind the node you gave up to fight.

So the fix was two things and neither of them was a difficulty knob:

- **A meal is sold on the reward screen too**, out of the scrip the fight just
  paid. Unspent scrip went 527 → 91 and the fighter now eats 5.4 meals a run.
- **[What you walk away from walks after you](#the-rules-briefly)** — because
  once fighting paid properly, ducking still had to cost something.

Fighting is the better line now, and it is better because it *pays* better, not
because ducking was made painful. The difficulty term is the smaller half.

### The same deck, two pilots

A locked arm: the identical deck for the whole trail, nothing drafted, bought or
burned, so every point between the rows is the fight and only the fight.

```
weak deck, played badly   ██                               4%
weak deck, played well    ███████                         13%
strong deck, played badly █████                           10%
strong deck, played well  █████████                       18%
```

**Skill now closes more than a whole deck gap** — a weak deck played well (13%)
beats a strong one played badly (10%). The first version of this arm measured
*zero for every combination* — a caravan that does not grow cannot cross the
trail at all, whoever is holding it, so there was never a gap for skill to
close. That is what the fell answering the caravan is for.

### Which parts of playing well are worth anything

A second instrument switches each of the careful pilot's fight habits off one at
a time and re-runs the sweep. Whatever the pilot can stop doing without losing
win rate was never a decision:

`FF_ABLATE=150` turns this section up on its own — the habits sit two to seven
points apart and the suite's usual band is five, which is exactly why the same
habit read +3 one round and −2 the next. Run at 450 runs an arm, the verdict was
blunt: **three of the six habits were actively hurting the pilot.**

```
before, at 450 runs an arm:        after the cull, at 210:
    +5  denying schemes                +9  denying schemes
    +2  holding gear                   +2  holding gear
    +0  keeping a slot                 +2  keeping a slot
    -3  calling waves early             0  repositioning at all (removed)
    -4  placing bodies "where hit"     -1  filling the front of both lanes
    -7  keeping the leader at the back -5  calling waves early (removed)
```

Cutting the three negatives took the fight pilot from **17% to 26%**.

- **Keeping the leader at the back** — in from the first round, priced at −7. The
  leader is usually the strongest thing the caravan owns and the front row burns
  two counters a turn; a leader kept out of reach is a leader that never swings.
- **Placing bodies "where they will be hit"** — priced at −4 against simply
  filling the nearest free slot, across two rewrites of the heuristic.
- **Calling waves early** — priced at −3, then measured again in both directions
  at 210 runs an arm and cost five points each time.
- **Repositioning** has now been measured in both directions too — pull the
  wounded back, walk the healthy forward — and neither is a decision. The pilot
  does none. Where a body goes down is the question the geometry asks, and it is
  asked once, at deployment.

The lesson worth keeping is about the instrument, not the game: **for four
rounds these numbers were read at a sample where the band was wider than the
effect**, and three habits that were costing the pilot points survived because
of it.

### One table, one game

Every habit number above had been measured against a game that has since moved —
tempering flipped +5 to −8 in one round because the temper cap changed
underneath it. So all of it is run **together, once, against the game as it
stands**, at 300 runs an arm:

```
IN THE FIGHT (±2.8)                    ON THE REWARD SCREEN (±2.6)
    +5  keeping a slot in reserve        +7  declaring a course at all
    +4  denying schemes                    0  buying a fresh offer
    +4  holding gear until it earns        0  tempering instead of taking
    -1  filling the front of both lanes    0  picking what the deck lacks
     0  repositioning (removed)           -5  walking on when it wants nothing
     0  calling waves early (removed)
```

**Scheme denial is not carrying the fight rung, and this is the third reading in
a row that says so a different way.** It read +14 two rounds ago and +10 last
round; against the current game it is +4, level with holding gear and behind
keeping a slot. The habit did not change — the game did, twice, and each time
the number came down. The spread across the top three is now inside two standard
deviations of each other, which is the healthiest this table has read.

And the economy: **penniless 23%, as it ships 30%, a bottomless purse 35% —
money is worth seven points.** It had read four when the only things to spend on
were one-a-visit; a meal gave the purse a bottom and the number went up, which
is what a working economy looks like.

The bottomless-purse arm is the reason meals have a **cap of twelve**. Handed
free money and prices at a fiftieth, the pilot ate its way to **93%** — money
buying a run outright rather than paying for one. The cap sits far above where
real play lands (5.4 meals an average crossing) and exists purely so the
degenerate case has a floor to hit; it took that arm to 35%.

### And the same for the reward screen

`FF_ABLATE` prices that rung's habits too, and it needed to: steering the pool
had collapsed to a single point, and the reason turned out not to be the
courses.

```
before, at 450 runs an arm:        after the cull:
    +8  declaring a course             +8  declaring a course
    +5  tempering instead of taking     0  buying a fresh offer
    +1  buying a fresh offer            0  tempering instead of taking
    +1  picking what the deck lacks     0  walking on when it wants nothing
    -4  walking on when it wants none   0  picking what the deck lacks
```

**Declaring a course is worth eight points and nothing else on that screen is
worth anything** — the levelling did not make the courses irrelevant, it made
them equal, which is what levelling is for.

What was dragging the rung down was *walking on*, put in two rounds ago on the
sound reasoning that a fat deck draws badly. The reasoning was right and the
trigger was wrong: it passed for scrip rather than for the deck.

**And tempering instead of taking flipped from +5 to −8 inside one round**, which
is the most useful thing this instrument has shown: the temper cap came down from
four to three in the same round, and with only three tempers in a whole run,
spending a reward on one is spending a card to move a number the trader was going
to move anyway. Habits are not independent, and a number measured before a rule
changed is not a number about the game as it stands.

Redealing, tempering and the caravan read all stay in the *game* — a redeal is an
option worth having, tempering off a reward screen is right for a caravan three
steps from a trader, and telling a player what their deck lacks is worth doing
whether or not a scoring rule can use it. The pilot no longer pretends any of
them is a rule it can measure.

### And the courses, settled

`FF_COURSE=150` turns that comparison up on its own, the way `FF_ABLATE` does the
habits. At **450 runs an arm** (band ±2.2), against a 35% baseline with no course
at all: Bodies 43%, Hearth 42%, Cold 42%, Gear 41%, Scrap 38%. Four of the five
sit inside two standard deviations of each other and all five beat declaring
nothing. **They are genuinely level, not luck** — which the ten-point swings at
the smaller sample could not have told you either way.

That reading is from before this round's changes, and this round moved the trail
under it. At the suite's ordinary 210 runs an arm the same table now reads Gear
38%, Cold 35%, none 33%, Hearth 33%, Bodies 32%, **Scrap 25%** — four of them
still level, and Scrap eight points off the field, which is over two standard
deviations. That is a lead worth turning `FF_COURSE` up on, not a finding worth
acting on at this sample; it is on the list rather than in the game.

This is the reason the front row runs double. Before that rule the same table
read `+5 / +1 / 0 / 0 / 0 / −9` — one habit worth anything, four worth nothing,
and "placing bodies where they will be hit" **nine points worse than filling the
nearest free slot**. That is what a board with no geometry looks like: swings go
to the front of a lane and stragglers walk toward the fighting, so six slots
behave like two. Depth now costs and pays, and five of the six habits price
above the noise floor.

The suite also prints **what ends a good run in the last zone**, aggregated by
name across every death — the run always remembered the blow that took the
leader, it just never counted them. One death is an anecdote; two hundred is a
design note, and it was: one beast was landing three late deaths in five.

Three things worth saying plainly about that table.

**The fight rung is still small — four points — and that is now an honest
number rather than a broken one.** In-fight play is made of six real decisions
instead of one habit plus one active mistake, and the ablation above prices each
of them; but a run's outcome is still dominated by the deck it is holding, so
skilled play inside a fight moves fewer points than the reward screen does.
Saying otherwise would need a different game, not a different bot.

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
