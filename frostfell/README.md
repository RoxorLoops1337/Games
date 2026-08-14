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

This file is both the reference and the design record. The reference comes
first and the reasoning sits under it, because a rule you cannot find quickly is
a rule nobody reads — everything a player needs is in the two tables below and
the section they point at.

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

**The reasoning.** [What the instruments have settled](#what-the-instruments-have-settled)
is the design record: what has been measured, what it changed, and which roads
turned out to be dead ends. Twenty rounds of *how each number got there* has been
cut from it — what is left is what would change what you do next.

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
- **The line needs room, and one gap is not room.** At the end of every turn:

  | | |
  |---|---|
  | **two or more free slots** | the line can rotate — warmth down all of it, Regen 1 on everybody |
  | **exactly one free slot** | cramped: no warmth, but no cold either |
  | **none free** | nowhere to fall back to, and the cold gets into somebody |

  It is what makes "should I put this down?" a question instead of a reflex, and
  the line under your own side of the table says which of the three you are on.
  The bar used to be one gap, and [that was the problem](#the-rule-the-board-is-built-around-was-not-a-decision).
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

### What the guide teaches, and what a lesson is worth

The fight ablation has priced every habit for six rounds and **denying schemes**
is the only one that has ever cleared the band. The guide had not one word about
it — nine hints about deploying, counters, the front row, the room rule, the bell
and the waves, and nothing about the one line of red text a foe puts on the table
a turn before it acts. It has one now, and a second beat behind it: a scheme that
lands in the first zone, on a run that has never denied one, says once what would
have taken it away.

Every hint names an ACTION and clears when the action lands. Two that shipped as
statements — the front row, the room rule — sat on screen for three turns while
the player waited them out, and clear on a move now. The scheme hint HOLDS: it
waits for red text to exist rather than being skipped past it, and clears when
that text resolves either way, because a player who has not learned the rule yet
is not going to deny anything.

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


### What it would cost to split it, if it ever comes to that

`index.html` is past 8,500 lines. One file is still the right call — no build
step, no import graph, and the whole game is greppable — but three sections have
quietly grown a second job, and this is written down so the next round is not
guessing.

**Rendering (§9, ~2,000 lines) does two things.** It draws the *board* — cards,
creatures, statuses, the fight — and it draws the *screens* — title, trail,
shop, camp, reward, collection, help. The board half is coupled to the battle
state and changes when the rules change. The screen half is coupled to nothing
except layout, and it is where every phone bug of the last three rounds lived.
Splitting those two is the cleanest cut in the file and the only one that pays
for itself: **the cost is one more `<script>` block and the loss of shared
locals** (`txt`, `panel`, `lineH`, `C`, the layout constants), which would have
to move to a shared prelude or be passed. Perhaps 40 lines of plumbing.

**The battle engine (§6, ~1,200 lines) carries the beat queue.** `beat()`, the
animation scheduling and `drainAll` are timing, not rules, and they are the
reason the engine cannot be reasoned about without also holding the renderer in
your head. Pulling the queue out is a smaller cut than it looks — it has four
entry points — but it **cannot be done without a test-visible change**, because
the suites drive `drainAll` directly. Cost: a day of test churn for a clarity
win, not a correctness one.

**The run layer (§7) has absorbed the trail, the shop, the camp, the rest stop,
the shrine, events, and the reward screen** — seven node kinds whose only shared
code is `advance()`. It reads as one thing and is seven. This is the section
that grows every round and the one where a split would most reduce the chance of
a change to the shop breaking the shrine. It is also the **most expensive** to
cut, because every node reaches into `g.run` and `g.ui` freely, and formalising
that would touch the save format — which the project rules say not to rename.

**The recommendation, unexecuted:** if a split ever happens, take the screen
renderer out first and stop. It is the only one of the three where the cost is
plumbing rather than risk, and it is where the bugs actually are.


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
node tools/frostfell/playthrough.mjs --tribe scrap --course pack --out DIR
node tools/frostfell/playthrough.mjs --careless
```

One run, start to finish, in a real browser, taking a note at every decision and
a screenshot at every beat that matters. The probe measures across hundreds of
runs and prints numbers; this is the opposite, and after seventeen rounds of
tuning against a probe the thing nobody had was a **transcript**.

**It has an opinion.** It used to take option zero everywhere, which made it a
transcript of a passive player rather than a competent one — and a passive
player's complaints are not the game's problems. It plays like somebody who has
read the rules now, and `--careless` plays like somebody who has not.

### What the transcripts found

`playthrough.mjs` writes a whole run down turn by turn (`--tribe --course
--careless`). Four leaders, four courses, one transcript each, and all four
agreed on three things that became work: the trader was being walked out of with
a full purse (a meal is what was missing), the first zone was where a careless
run actually ended, and Hearth was told it was short of a hard hit it was already
carrying.

The transcripts also found a winning line the ladder could not see, because
every rung fights whatever the trail puts in front of it and none of them
chooses to walk away. That became the dodge arm, and then
[the quiet road](#the-quiet-road).

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

**Temper** puts +2 attack and +3 health on a card and leaves the deck the size
it was. It lives in **three places at three prices**: the trader takes scrip for
it once a visit, a camp will work the fire instead of mending anybody that
night, and a reward screen will do it in place of the card you were going to
take. A caravan can carry **three tempered cards** and no more — without the cap
a competent pilot went straight to 67%.

It started as one service at one node, which was a single point of failure
wearing a decision's coat: miss the shop on a map of nine and lose the run. It
was worth fourteen points alone; spread across three doors it is worth two and
being penniless is survivable. That is the fix and the cost of the fix, together.

### Scars, and tending them

A warden that falls comes back **Hurt** — half its attack and half its health
until it sees a fight through. One that falls **while it is already Hurt** keeps
something: a **scar**, one of three, permanent until somebody takes it off. Two
is as many as one warden can carry.

The scar table has been in the file since the first week — three scars, applied
by `rebuildCard`, removable at the trader for thirty scrip — and **nothing in
the game ever handed one out**. "TEND A HURT — 30" was a button that could not
do anything, sitting on the counter for nineteen iterations. What found it was
[the ware table](#every-ware-is-worth-buying): a pilot that was actually trying
to buy everything on the counter bought that one zero times.

So this is the missing half rather than a new system. Hurt is the warning; a
scar is what happens if you send it straight back out anyway. It makes resting a
decision, and it is escapable three ways — rest it, mend it, or pay her.

### A hot meal, and why the trader has a bottom

**+1 attack and +2 health** on a card, no card added, **as many as you can pay
for** — 34 scrip, then 60, then 86, and so on up, capped at twelve for a run
(set far above where real play lands; an average crossing eats five and a half).
Sold at the trader *and* on the reward screen, so scrip earned in a fight has
somewhere to go without giving up a fight to reach a shop.

It is the answer to *"the trader is a one-purchase stop — prices or payouts?"*,
and it was neither. Four transcripts walked out holding 138–328 scrip: she was
affordable and had run out of things worth buying. The counter needed a bottom,
not a discount.

Two other things on that counter exist for measured reasons. **The bell** is the
one run-wide upgrade money can buy — when tempering spread to three doors, money
stopped being worth anything at all and penniless measured level with
well-funded. **Buying a card lets you leave one behind**, because without that a
purchase was a trap for three rounds running: a penniless caravan beat a funded
one by nine points, every card bought being one more between the deck and the
card it wanted.

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
### The suites

| | |
|---|---|
| `frostfell.test.mjs` | the rules — combat, statuses, cards, economy, saves |
| `frostfell_render.test.mjs` | every screen draws, at eight device shapes, with every touch target and every line of type measured in CSS pixels |
| `frostfell_tutorial.test.mjs` | the guided run, beat by beat |
| `frostfell_run.test.mjs` | the balance probe: bots that play whole runs |

**`tests/.frostfell-arms.json` is committed**, and that is the point: an arm
that runs stamps its headline and sample there, and a reading that lived only on
the machine that took it starts blank in a fresh clone — exactly the rot it was
built to stop. There is no age counter; one was tried and it churned the file on
every check for a number git already knows better.

`FF_RUNS=n` sets the sample. Everything else is an arm you turn up on its own:
`FF_ABLATE`, `FF_HABIT`, `FF_COURSE`, `FF_MONEY`, `FF_LESSON`, `FF_NOSCARS`.
`FF_CONTRAST=1` prints how much text the contrast check actually paired.

The shot walk is `tools/frostfell/shots.mjs` (`--size`, `--phone
iphone-se|iphone-14|pixel-7|galaxy-fold`), and `tools/frostfell/playthrough.mjs`
writes a whole run down turn by turn (`--tribe --course --careless`).

---

## What the instruments have settled

Everything below came out of the probe or the shot walk. It is kept because it
changes what you would do next; twenty rounds of *how each number got there* has
been cut, and where a road turned out to be a dead end it is named as one so
nobody drives down it twice.

### The ladder

Four pilots, each the one above it plus one more thing it knows how to do, so
the gap between two rows is that one thing:

| pilot | | worth |
|---|---|---|
| careless | takes the leftmost card, swings at the nearest thing | 6% |
| + the fight | reads the board: denies schemes, places bodies, holds gear | 21% (**+15**) |
| + the trader | spends well | 40% (**+19**) |
| + steering the pool | drafts to a course | 38% (−2) |


**The commitment is withdrawn, and here is what was done first.** For three
rounds this file said the fight *should* be the rung that matters, and for three
rounds the trader was bigger. Rather than write it a fourth time, the round that
had to choose went looking for where the money actually goes — and then tried to
cut it.

The looking worked. The cutting mostly did not, and both are below under
[what the purse buys](#what-a-bottomless-purse-is-buying). What is left is a
statement of what this game is rather than what it was supposed to be: **the
fight is the rung that carries the skill and the trader is the rung that carries
the run.** The fight is what separates a player from themselves — it is the only
place a habit has ever priced above the band, and it is worth more every round.
The trader is what separates a good run from a bad one, because money buys a
choice of several individually-sufficient things (see below). Those are two
different questions and the game answers both. It does not need them to be the
same size, and the one attempt to force it cost ten points of win rate across
every rung including the beginner's.

**Steering the pool prices at roughly nothing and that is not the courses'
fault** — measured on its own at 450 runs an arm, all five courses beat
declaring nothing and sit inside two standard deviations of each other. They are
level. What prices at zero is the *drafting*, because a pilot that takes the
best card on offer is already doing most of what steering can do.

### What a bottomless purse is buying

The gap between "as it ships" and "a bottomless purse" had been printed for
rounds with nobody asking which ware it was. Asking is one arm: give a rich
pilot everything except one thing at a time, and whatever it cannot do without
is where the money goes.

```
no charm    44%   −17 of the 21        no temper  64%   no cost
no meal     61%   no cost              no sigil   64%   no cost
no heal     61%   no cost              no card    65%   no cost
no bell     62%   no cost              no burn    61%   no cost
```

**Seventeen of twenty-one points were charms**, because nothing stopped a rich
pilot buying every one in every shop and hanging them all on whichever warden
was already biggest. Not the meal, which these notes had been blaming for
rounds; not tempering; not cards.

Two fixes were tried and both failures are worth more than the one that shipped.
**A cap of two charms a warden** narrowed the economy exactly as designed (the
trader's rung fell +20 → +10) and took ten points off *every* rung, halving the
careless floor — charms were never the rich pilot's lever alone, and a cap takes
a slice out of everybody. Buffing the survivors did not bring it back. **A rising
price** measured nothing and could not have: the bottomless arm is *defined* as
"prices do not matter", so it cannot see a price. That arm measures what money
can BUY. Only quantity moves it.

Shipped: the trader carries **three charms in a whole run** and then has none,
each dearer than the last. The ladder is unchanged; the bottomless arm drops
five points. Charms won at rewards, caches and camps are not counted.

**And the rest of the gap is redundancy, not compounding.** The subtractive arm
left eighteen points unexplained, so the arm was run the other way: a
*penniless* pilot handed exactly one ware for free.

```
free bell   53%  (+24)      free temper  30%  (+1)
free meal   52%  (+23)      free heal    29%   (0)
free charm  45%  (+16)      free card    28%   (−1)
free sigil  42%  (+13)
```

Neither "one ware" nor "all of them a little": **any one of four wares is
individually sufficient.** A penniless pilot handed a bell, or a meal, or a
charm alone already beats the pilot paying full price for everything — which is
exactly why removing one thing from a rich pilot mostly costs nothing. The
others substitute for it.

So no single cut can close the gap, and cutting further means cutting what a
normal purse buys too, which was tried and measured and cost ten points. The
word "compounding" is retired.

### What the instrument cannot see

**It can price a teaching change after all** — and last round said it could not.
The claim was that the careless pilot is blind rather than slow, so nothing that
makes a decision easier to notice could move it. That is a claim about the
instrument, and it was testable: a pilot identical to the careless one except
that it starts denying schemes once the game has TOLD it about one, against a
control that is never told and one that always knew.

```
never told   7%   166/210 saw the second zone
told once   18%   196/210
always knew 19%   202/210
```

At 210 runs an arm, band ±2.1: **being told carries eleven of the twelve points
that knowing is worth.** The limit was real for the pilot as built, not for the
instrument — careless was the wrong floor because it could not be taught.

### The dose does not matter, and the subject is everything

The lesson fired twice, in the first zone, about schemes, because those were the
first numbers anybody wrote. Swept (`FF_LESSON=1`, 210 an arm):

```
told once  18%   told twice  18%   told 4 times  18%   every zone  18%
```

**The dose is irrelevant** — once is the whole effect, so once ships.

**The subject is everything.** A second lesson for the room rule was built,
measured at zero, blamed on the pilot expressing the habit badly, rebuilt with
the right expression, and measured at zero again. Both readings together are the
finding: keeping a slot back is a real habit that is worth nothing *to a
beginner*, because it only pays if the rest of your play is good enough to use
the warmth. A denied scheme is a foe's wasted turn whoever you are. **A habit
worth teaching has to pay on its own, and almost none do.**

### Is one-at-a-time the wrong question? No.

Settled at 180 runs an arm: **denial alone is worth 18 of the 20 the whole set
is worth**, keeping a slot back is +2, and everything else is zero.

**And a round was spent trying to change it rather than confirm it.** The
intervention believed in was this: keeping a slot back pays in warmth, warmth is
Regen, and the mending ledger proves Regen is a currency this game refunds — so
warmth was made to pay in **Spice** instead, which is damage, which is the thing
the game actually values. It made the fight *worse* (+16 → +10) and keeping a
slot back went from +2 to −1. Across all six shapes above, the best any second
habit ever reached was **placement at +4** under the fallen-keep-half variant —
1.3 standard deviations, inside the band.

**Why the board resists, as far as this can tell.** A scheme is the only thing
on the table whose outcome depends on what you do in the window between it being
announced and it happening. Everything else — where a body stands, when gear is
spent, whether a slot is free — is arithmetic the pilot can compensate for
elsewhere on the same turn. Denial is not worth eighteen points because denial is
strong; it is worth eighteen points because it is the only *event*. A second
habit that clears the band probably needs a second telegraph, not a better
payout, and that is a bigger change than a round.

The fight ablation had said the same thing for six rounds — denial clears the
band, nothing else does — and that reads as "nineteen of twenty decisions are
fake". But removing one habit leaves the pilot every other way of coping, and
the *set* is worth twenty points. A set worth twenty made of parts worth zero is
the signature of things that substitute, which is exactly what the money gap
turned out to be. So the ablation was run the other way: start from the pilot
that knows nothing, turn one habit on.

```
only denying schemes         24%  +18 of the 20
only keeping a slot back      8%   +2
only filling the front first  7%   +1
everything else               6%    0        (±3.0 at 180 runs an arm)
```

**It is not substitution. The fight really is one decision and some decoration.**
Denial alone recovers eighteen of the twenty points the whole set is worth.

Worth recording how nearly this went the other way: at the default sample the
same table read keeping-a-slot at **+5** with a ±2.8 band, and that was written
down as a finding before it was turned up. At 180 an arm it is +2. A ranking
inside its own band is noise — this suite says so in four places and it still
caught me.


### The quiet road

That arm read **−16**, which does not describe a decision — a fork where one
side is always wrong is furniture with a signpost on it. The game had a rule
that *punished* ducking (what you walk away from walks after you) and nothing
that paid for it.

So the quiet road pays in the one thing a fight can never give: **a camp reached
by walking past a fight mends the whole line instead of six.** Worth everything
when the caravan is hurt and nothing when it is not, still paid for in the card,
the scrip and the pack closing two steps, and spent when used.

**And now measured, by the pilot that had to be built to measure it.** A pilot
that ducks *everything* never arrives at a fork hurt, so it can never want the
mend — the same limitation as the careless pilot's, and the same fix. A third
arm takes every fight until the caravan is genuinely hurt, then takes the quiet
road if it leads to a camp:

```
takes every fight          44%
walks past what it can     31%   −13
ducks to a camp when hurt  44%    ±0
```

**Ducking everything loses sixteen points; ducking only when hurt is level with
fighting.** That is the shape a decision has — worth the same overall, worth
different amounts on different steps.

That first reading was worthless and the counter that proved it is now in the
output: the hurt-ducker was taking the quiet road at **2% of the forks that
offered it**, arriving with the same cards, the same meals and the same power as
the fighter. It was not exercising the choice; "level" meant "played the same
run".

**So the rule was widened and the pilot was fixed.** Every quiet place now pays
in what that place is *for* — the camp in rest (the whole line mends), the rest
stop in choice (four blessings instead of three), the shrine in the blessing
costing nothing (a second card comes back blessed too). None of them is scrip or
a card, which is what a fight gives.

And the pilot ducks for the thing that is actually scarce. **The line is 7-8%
wounded at the forks that offer the choice** — camps, meals, mend-all and the
room rule's warmth clear damage faster than it accrues, so mending is not
scarce and a rule paid in mending cannot be a decision. The blessing is scarce
(three tempered cards a run and no more), so the pilot ducks for a shrine.

```
takes every fight                 46%        23.7 cards · 0.1 tempered · fought 73%
walks past what it can            35%   −11  13.8 cards · 2.9 tempered · fought 28%
ducks to a quiet stop when hurt   38%    −8  21.9 cards · 2.5 tempered · fought 67%
```

**Now it is exercised and now it costs something.** The tell is the third
column: the hurt-ducker used to arrive with *identical* cards, meals and power
to the fighter, and now arrives with two and a half tempered cards against the
fighter's nought and more power (9.3 against 8.9) off fewer fights. It takes the
quiet road at 37% of the forks that offer it and loses eight points doing it —
a decision priced wrong rather than a rule nobody plays around.

The structural finding underneath it is the next section.

### Where the mending actually comes from

"Damage is not a pressure in this game" was a closing sentence, and four
suspects were named without anybody counting them. Counted, the way the charms
were: read the caravan's wound total on every pass of the run loop and attribute
each change to the transition it happened on.

**88% of every point of damage the caravan takes gets mended**, and:

```
a fight ENDING (the fallen come back whole)   60%
camp                                          18%
shop (mend-all)                               17%
rest / event                                   5%
warmth                                         0%
```

(It was 92% and 65% before the beast's night's rest came out — that change is
worth four points of the ledger even though it is worth nothing on the ladder,
which is the clearest evidence that this ledger and the win rate are measuring
different things.)

The list was wrong. It is not camps and it is not meals and **warmth does not
register at all** — the single biggest entry is a warden falling, because a
fallen warden's damage is wiped to nought before it comes back Hurt. Two thirds
of the "mending" in this game is not healing; it is a knockout being undone,
which is a different mechanic wearing mending's clothes.

**Six shapes have now been measured against it.** All at 180 runs an arm
(band ±3.0), against a baseline of fight +16 and a 30-point ladder:

```
a fallen warden comes back missing 35%   fight  +9   worse
warmth 2 instead of 1                    fight +17   a global buff, ladder 37
warmth pays in Spice, not Regen          fight +10   worse, ladder 22
the fallen keep half and lose Hurt       fight +10   ladder 39 — a different game
only the FIRST loss of a fight is wiped  fight +11   no change
no beast's night's rest                  fight +19   ladder 34   ← shipped
```

**And the +19 did not survive the bigger sample.** Re-measured at 210 runs an
arm it reads +15 and the ladder reads 32 — identical to the baseline, which is
the same trap as last round's keeping-a-slot-at-+5: three points at ±3.0 is a
direction, and directions evaporate. It is kept anyway, and the reason is not
the number: it removes a five-point refund of attrition at every zone boundary
and a constant with it, and it measures neutral. **Simpler and level is a good
enough reason to keep a change. Moving the fight's rung is not a claim this can
make.**

The two that make the ladder *bigger* both do it by making the trader and the
draft matter more, which is the opposite of what was wanted.

### Read state, don't intercept calls

Five instruments in five rounds measured nothing, and they failed in three ways
worth knowing before you build a sixth.

**Wrapping an export sees nothing.** `FF.buy`, `FF.takeCard` and `FF.triggerUnit`
are exports; the game calls the module-scoped versions internally. Read the
state instead — the deck's contents, the board's counters, the price at the
pilot's decision point.

**A stub that drops state lies quietly.** The canvas stub's `save`/`restore`
carried the transform and not the style, so one faded draw silenced the contrast
check for the rest of the frame — 96% of the text went unexamined and the check
reported clean.

**A perfectly instrumented table can answer a different question.** "Nobody buys
this ware" was three findings wearing one face — bad, unaffordable, or never
taught to want. "Nobody plays this card" was a table about the *pool*: divided
by copies actually carried, the three cards at the bottom for four rounds were
mid-table. The habit table printed a podium drawn from noise until it was made
to refuse above a ±2.0 band. And the touch check measured stage units rather
than CSS pixels for seventeen rounds.

### What a good card looks like

Written down before the cards were, after two rounds of building cards and then
measuring them and cutting five of six. The rule is in the source above
`const CARDS`, in full; in short: **a good card makes the player choose between
two things they want, on the board, differently each turn.** Four tests — it
asks a question answered differently on different turns; the question is asked
on the board; it costs something the player wanted; and it does not answer a
question the board already asks. If you cannot say what it costs, it is not
finished.

The round that wrote it first built three cards against it, and all three
shipped — the first content round in three that did not cut most of what it
made.

### Schemes are most of what the fight is worth

Denying schemes is the only fight habit that has ever cleared the band (+6 to
+7); the rest sit inside it. That is not the board being fake — the locked-deck
arm settles that — it is that the board's other decisions are cheap
individually and the scheme is not.

Three schemes: `mark` (deny by sliding the named warden, which needs a slot to
slide into), `gather` (deny by leaving them no free slot — the one moment where
killing something is the wrong play), `chill` (deny by emptying the lane). Deny
a gather and the foe has thrown its whole turn at nothing; deny a chill and you
have stopped only the extra. That is the variety, and it is in *how* rather than
in *how many*.

**A scheme must be `solo`** — it is the foe's turn rather than an effect on top
of its swing. A non-solo scheme is simply a buff to the fell: adding one took
zone-two arrivals from 156 in 210 down to 127 and the careless floor from 6% to
4%. `mark` and `gather` are solo.

**Dead ends:** a fourth scheme targeting the *hand* (the board is the shared
surface; a scheme the board cannot answer is not a scheme), and a tier-1 foe
carrying one (the first zone is where somebody learns what a telegraph is — a
timer there is not a decision).

Spreading a scheme onto a new foe breaks any test that assumes one way of
denying. The tutorial suite asserted that emptying the player's side denies
whatever the opening rolled — true of `mark` and `chill`, false of `gather`.
Deny the thing the scheme actually needs.

### The room rule

Three states, and it is the rule the board is built around:

- **two or more free slots** — the whole line takes Regen 1
- **exactly one** — cramped; nothing
- **none** — Frost 1 on somebody, and they lose their next trigger

It took three shapes to get here. As a two-state rule it measured **exactly
+0** at 750 runs an arm — a measured zero, not a noisy one. The third state is
what made keeping a slot back a decision instead of a habit.

It is symmetric, and the two sides do not meet it equally often: the foes' line
runs emptier than the player's, so in practice it is a rule for one side of the
table. That asymmetry is intentional and is why the fell's line is allowed to
fill up.

### The careless board is emptier, not fuller

Measured this round, and it corrects five rounds of assumption. Free slots by
share of turns:

```
careful pilot   0:2%  1:6%  2:32%  3:22%  4:22%  5:16%
careless pilot  0:4%  1:6%  2:14%  3:24%  4:29%  5:22%
```

A beginner does not drown by packing the board. Their wardens die, the board
empties, nothing blocks, and the leader takes the hits. Any change aimed at the
packed-board failure is aimed at something that happens on 4% of their turns.

### The most lethal thing in the game has four health

Mitewing was in the top two of the late-zone death table for five rounds. It is
a tier-1 trash mob — four health, two attack. Counting each foe's *share of the
damage the fell actually swings* (tick rate over counter, times attack) explains
it: a cheap Aimless body with a one-counter walks past every wall and swings
every single turn. A death table ranks who landed the last blow; a damage-share
table ranks who did the work. Keep both.

### Hearth, and a finding about the game

Hearth read bottom of the course table for several rounds through five attempts
to fix it. The pool was not leaning — 13 hearth cards against 14 frost and 13
scrap. The rule was: Regen is a **threshold good**. Healing that does not
outrun the incoming does nothing at all, and healing that does outrun it makes
the warden unkillable — there is no middle, so every tuning pass either did
nothing or broke it. That is a fact about how the game's damage works, not about
Hearth, and it applies to anything that mends.

### And the shot walk is still the only thing that sees

Three assertions over eight shapes is 667 checks and none of them has ever found
what a person finds by looking. The clipped collection names, the collided trail
labels, the dim question mark — all three came from opening a PNG. So three
screens nobody had ever examined at 2400x1080 were opened, and all three were
wrong:

- **The shrine** drew both buttons on top of the stone's foot and its shadow (the
  stone is scaled 1.7× from y=330 and reaches past 520; the buttons sat at 452),
  with the explainer line at 536 half-swallowed by the snow bank. The row moved
  below the shadow and the explainer above the buttons.
- **The camp** was a single flame hanging in empty air with no pit, no logs and
  no glow — on the one screen whose subtitle is *one quiet hour before the road*,
  and in a game where every other light is additive. It has logs and a fire-glow
  now.
- **The rest stop** has no fault to fix and one to record: on a 20:9 stage the
  three cards cluster in the middle third and the bottom half is empty snow. The
  screen is laid out for 16:9 and merely survives being stretched.

### Which screens actually use the width

That last point raised the obvious question — is the stage-width system
decoration? — so every screen was walked at 2400x1080. It is not:

| uses it | ignores it |
|---|---|
| the battle (board and hand both span) | the title |
| the trail (road edge to edge, a panel in each corner) | camp, rest stop, shrine, event |
| the collection (twelve tiles across) | the ending |
| the leader screen (three columns) | |
| victory (the stat row spans) | |
| the trader and the reward screen (ware row spans) | |

Six use it and five ignore it, and the five that ignore it are all the same
shape: a title, one piece of art, and a centred row of two to four buttons. They
have three things to say and a 20:9 stage does not give them a fourth. **The
system is used by the screens that have something to spread and ignored by the
ones that do not, which is the correct answer rather than a gap** — widening a
shrine would mean inventing content for it.

**And it found a limit in the contrast check** — an outlined glyph on a nearly
white snow bank passes, because an outline is what the rule measures for
outlined text, and edge definition is not figure-ground.

**Taking the worse of outline and ground was then tried, and the instrument
cannot support it.** The rule is right. Implemented, it flagged three things —
a leader's name under its portrait, a warden's name on its card — all perfectly
legible, and all the same artefact: the ground is attributed by which filled
path's *bounding box* contains the text, and this game draws creatures as
multi-segment blobs whose boxes reach well past their ink. Single arcs are now
tested as circles, which is a real improvement and fixes none of these, because
a blob is not an arc. Doing it properly means the stub has to rasterise, which
is a larger instrument than the bug justifies. **The rule stays outline-first
and the reason is now measured rather than assumed.**

### And a third thing nobody was checking

Touch was rewritten in CSS pixels and found seven controls too small. Type got a
floor and a stacking rule and found five collisions. Nothing had ever asked
whether the text could be **seen**.

The first pass found exactly one thing, which was suspiciously few — and it was.
The stub's `save`/`restore` carried the transform and not the *style*, so one
`globalAlpha = 0.35` anywhere in a frame stayed 0.35 for every draw after it,
and the check — which skips deliberately faded text — skipped almost all of it.
**Thirteen of fifteen strings on the title screen were never looked at.** Fixed,
coverage went from 18 texts a frame to 457.

Widening it then needed the right model, because **every glyph in this game is
outlined**. `txt` strokes a dark rounded outline behind the fill unless told not
to, so an outlined glyph reads as a shape against its own outline rather than
against whatever is behind it. A naive check called a white unit name over an
orange creature 2.2:1 and it is perfectly legible. So: for outlined text the
ground is the outline; for text drawn with the outline suppressed it is whatever
was painted underneath. Ratios are real WCAG — 4.5:1 body, 3:1 large.

With coverage 25× wider and the model right, **the palette holds**: nothing in
the game fails. The one thing it ever caught — the collection's undiscovered `?`
at 3.4:1 against its own outline on a phone — is fixed, and re-introducing it
makes the check fire again, which is how you know it still has teeth.

### Nothing is half-tested now

The 653x280 shape in the render suite is a folding phone's *cover* display, and
the type check used to skip it with a note: at 280 tall the floor is 23 stage
units and the leader screen could not hold seven winters as a name over a
description in a fixed 44-unit row. Excluding a shape with a documented reason
is right once and a habit twice, so the row measures its own contents instead
and the exclusion is gone. **Every shape is checked for everything it is in the
list for.**

### Smaller things, settled

- **Money is worth about sixteen points**, penniless to bottomless. Still the
  widest single lever in the game, and now understood rather than just measured
  — see below.
- **A hot meal** is the ware everyone buys, at every price step. It is doing the
  trader's job and that is allowed.
- **Every card is played** in a full sweep, all 58 of them.
- **Scars** cost the careless pilot about a point and do not explain any of the
  course table.

---

## Nobody had played it on a phone

Twenty-three rounds of shots were taken at 1280x720 in a desktop Chromium — a
game built landscape-first for a thumb, never photographed on anything shaped
like a phone. Two rounds of real handset shots turned up two whole classes of
bug no check covered.

**Touch.** The check compared hit boxes to 40 *stage units* for seventeen
rounds. The stage is up to 1760 wide and the phone is 667 CSS pixels across, so
every target was half the size the check believed: seven controls under the 44px
both platforms ask for, and PASS was twenty-four pixels tall. `TOUCH_MIN`/
`TOUCH_SLOP` give small controls a forgiving second pass in `hitAt`, so what is
priced is the effective target rather than the drawn one.

**Type.** Nothing checked it. The informational text was rendering at six and a
half pixels. `TEXT_MIN_CSS = 9` floors every size in `txt()` — one line, in the
one place every string goes through, inert on a desktop.

Flooring the size then broke the *layout* three ways, because every line step in
the file was a number chosen for the size the text used to be. `wrapText` and
`fitText` go through `textSize()` now; every hardcoded step goes through
`lineH(size, step)`, which returns the step unchanged when the floor is inert.
The help pages were a fixed grid with a hard slice at five lines and cut the
rules off mid-sentence; they are measured and flowed now — two columns, one wide
column, a second sheet with arrows — and nothing is cut.

The render suite covers all of it in CSS pixels, on every screen at eight
shapes: no text below the floor, no two lines of a paragraph closer than the
taller of them, and no text that cannot be read off its own background.

**The supported floor is a phone held sideways**: 375 CSS pixels tall.

## The probe was half particle effects

Forty per cent of the balance probe's samples were `fx.pop` and `fx.burst`,
building floating text and particle objects — sixty and four hundred at a time —
for runs with no screen attached. Gating the particle systems on having a canvas
took the suite from 26.7s to 9.4s. The sample went from eight runs a tribe
(±9.7, a band too wide to stand behind) to thirty (±5.0) in less wall time than
the old suite took.
