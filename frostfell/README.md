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

### What the guide was not teaching

The fight ablation has priced every habit a pilot can have for six rounds. Two
survive every round: **keeping a slot in reserve** and **denying schemes**. The
guide taught the first and had **not one word** about the second — nine hints
about deploying, counters, the front row, the room rule, the bell and the waves,
and nothing at all about the one line of red text a foe puts on the table a turn
before it does something to you. A hint list that omits the most valuable thing
in the game is not a guide, it is a tour.

Fixing it took three things, and two of them were only visible by walking the
opening in the shots and reading the hints in order as a new player:

1. **The hint.** It names an action and clears when the action lands, like every
   other hint that works: kill it, freeze it, or take away what it needs.
2. **Something to point at.** Sampled across forty openings, only **seventeen**
   contained a foe with a scheme anywhere in them — so more than half of all new
   players met the rule for the first time in the second zone, having already
   lost to it once. The very first fight of a run now always contains something
   with a plan in it.
3. **A moment to point at it.** The first version landed on turn five of the
   opening with the log already reading *"Chillfang lunges at Bramblewick for
   6"* — the rule explained immediately after the player lost to it, pointing at
   red text that was no longer on screen. A scheme exists for exactly one turn,
   between the foe committing and the foe doing, so this hint **holds** rather
   than skipping: it waits, silently, until there is red text on the table, and
   speaks the moment there is. It is the only hint in the list that does; every
   other one describes something permanently true of the fight.

Holding took three more goes than it should have, and each failure is worth
keeping because each is a different way to get a waiting rule wrong:

- **The clock was in the wrong unit.** Seconds are not shared between a player
  thinking for thirty of them and a screenshot tool stepping the same fight in
  four hundred milliseconds — so the thing being photographed was not the thing
  being played, and the shot walk never once caught the hint firing. The budget
  is **turns taken** now, counted across fights, which both of them experience
  the same way.
- **It deadlocked on its own completion.** `when` wanted red text on the table
  and `done` wanted that red text resolved, so after the scheme fires both are
  false at once and the hint held forever. Seven identical screenshots in a row
  before it was spotted. It remembers having had its moment now.
- **It waited for the wrong thing.** The first `done` wanted a *denial*
  specifically, and a player who has not learned the rule yet is not going to
  deny anything — a hint that teaches denial cannot require denial to go away.
  It clears when the scheme resolves, landed or denied: either way the player
  has watched the whole cycle, which is the thing being taught.

**Does it teach denial now, or merely mention it?** Read in order, at 1280x720,
it teaches: the hint arrives with `LUNGE AT SNOWPUP` in red under Chillfang and
the target line drawn across the table to Snowpup, Snowpup is standing in the
front column, and there is a free slot behind it to slide into. The rule, the
instance, the named victim and the answer are all on the screen at once, and
moving is free. That is a lesson. It was a sentence.

**The ladder cannot show any of this**, and it would be dishonest to imply
otherwise — see [which rung should
matter](#which-rung-should-matter-and-a-note-on-what-this-instrument-cannot-see).
What it did show is a consequence of point 2: with a schemer guaranteed in every
opening, **denying schemes went from +4 to +10** on the habit table, because
there is now more of it to do.

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

### And what it feels like to walk it

Numbers do not say whether a rule reads as pressure or as a tax, so here is a
run played start to finish under all three, written down while playing it.

**The arc is legible now, and it was not before.** The fell's answer opens at
−33% and closes to +2% by the second beast, and you can watch it move step by
step: −33, −25, −18, −12, −7, +1, +2. That is the caravan catching up to the
trail, and it reads as progress rather than as a difficulty knob — which is why
that number is [now on the trail screen](#the-rules-briefly) instead of only in
a debug tool. It was the clearest picture of a run's shape in the game and the
player could not see it.

**The trader is a proper stop.** Zone one: tempered, mended, *walked out with
seventeen scrip*. Zone two: a bell, a temper, a mend, a meal, walked out with
fifty-four and the next meal priced at sixty. Both times the **purse** ran out,
not the counter. That is what a working economy feels like from the inside, and
it is one round old.

**What follows you reads as pressure, but it arrives late and quietly.** A
competent player who only ducks the obviously-right forks — the shop when rich,
the rest when hurt — accumulates about eight against a free six, so the warning
appears in the second zone at 10% and is small enough to ignore right up until
the run is nearly over. That is arguably exactly right: the rule is aimed at the
player who ducks *systematically*, and [the probe says it costs that player ten
points](#does-walking-past-a-fight-pay). But it is worth being honest that a
player who is not dodging on purpose will barely meet it.

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
### The suites

| | |
|---|---|
| `frostfell.test.mjs` | the rules — combat, statuses, cards, economy, saves |
| `frostfell_render.test.mjs` | every screen draws, at eight device shapes, with every touch target and every line of type measured in CSS pixels |
| `frostfell_tutorial.test.mjs` | the guided run, beat by beat |
| `frostfell_run.test.mjs` | the balance probe: bots that play whole runs |

`FF_RUNS=n` sets the sample. Everything else is an arm you turn up on its own:
`FF_ABLATE`, `FF_HABIT`, `FF_COURSE`, `FF_MONEY`, `FF_NOSCARS`.

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
| + the trader | spends well | 41% (**+20**) |
| + steering the pool | drafts to a course | 40% (−1) |

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
The trader is what separates a good run from a bad one, because money buys
permanent power and permanent power compounds across three zones. Those are two
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

Two things were then tried, and the failures are worth more than the fix:

**A cap of two charms a warden — built, measured, thrown away.** It narrowed
the economy exactly as designed: the trader's rung fell from +20 to +10. It
also took **ten points off every rung**, including halving the careless floor,
because charms were never the rich pilot's lever alone — they were a large
share of everybody's power, and a cap takes a slice out of all of it. Making
each remaining charm stronger to compensate did not bring it back. A narrowing
that is really a nerf is not a narrowing.

**A rising price — no effect, and it could not have had one.** The bottomless
arm is *defined* as "prices do not matter", so it cannot see a price by
construction. That arm measures what money can BUY, not what it costs. Only a
limit on quantity moves it.

What shipped is the quantity limit at its narrowest useful point: the trader
carries **three charms in a whole run** and then has none, and each one costs
more than the last. The shipped ladder is unchanged to within noise; the
bottomless arm drops five points. Charms won at rewards, caches and camps are
not counted — the fell gives away as many as it likes.

Eighteen points of the gap remain. They are not one ware; they are the fact
that money buys permanent power and permanent power compounds across three
zones. Cutting further means cutting what a normal purse buys too, which was
tried and measured and cost the whole game.

### What the instrument cannot see

**It can price a teaching change after all** — and last round said it could not.
The claim was that the careless pilot is blind rather than slow, so nothing that
makes a decision easier to notice could move it. That is a claim about the
instrument, and it was testable: a pilot identical to the careless one except
that it starts denying schemes once the game has TOLD it about one, against a
control that is never told and one that always knew.

```
never told   6%
told once   11%
always knew 12%
```

**Being told carries five of the six points knowing is worth.** The limit was
real for the pilot as it was built, not for the instrument — careless was the
wrong floor because it could not be taught, not because teaching cannot be
measured. A teachable pilot is the right floor and it exists now.

**It cannot see a choice its pilots do not make.** Every rung fights whatever
the trail puts in front of it; none of them walks away. A separate arm had to be
built to find out what walking past a fight costs.

### The quiet road

That arm read **−16 points**, which does not describe a decision. A fork where
one side is always wrong is furniture with a signpost on it — and the game had
a rule that *punished* ducking (what you walk away from walks after you, and
the trail says so before the fork) and nothing at all that paid for it.

So the quiet road pays in the one thing a fight can never give. **A camp
reached by walking past a fight mends the whole line instead of six.** It is
worth everything when the caravan is hurt and nothing at all when it is not,
which is the shape a decision has, and it is still paid for — in the card, in
the scrip, and in the pack getting two steps closer. It is spent when used: a
standing bonus would just be a different constant.

**The dodge arm still reads −16, and that is the instrument, not the rule.** A
pilot that walks past everything it can never arrives at the fork hurt and never
gets to want the mend. Pricing a situational choice needs a pilot that makes it
situationally, which this one is not. Ducking everything should still lose;
ducking the pack that would finish you should not.

### Read state, don't intercept calls

Four instruments in four rounds measured nothing, and three of them failed the
same way: `FF.buy`, `FF.takeCard` and `FF.triggerUnit` are *exports*, and the
game calls the module-scoped versions internally, so a wrapper round the export
sees none of it. Read the state instead — the deck's contents, the board's
counters, the price at the pilot's decision point.

The fourth is worse and more useful: a table can be perfectly instrumented and
still answer a different question than the one you asked.

- **"Nobody buys this ware"** was three findings wearing one face: a ware that is
  bad, a ware that is good but never affordable, and a ware the *pilot* was
  never taught to want.
- **"Nobody plays this card"** was a table about the *pool*, not the cards.
  Divided by copies actually carried, the three cards at the bottom for four
  rounds were mid-table, and the real answer — plays per copy carried — has run
  since.
- **The habit table** printed a podium drawn from noise for several rounds. It
  now refuses to print above a ±2.0 band.
- **The touch check** measured stage units, not CSS pixels, for seventeen
  rounds. Rewritten, it found seven controls too small to hit.

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

Denying schemes is the only fight habit that has ever priced above the band
(+6 to +7); the rest sit inside it. That is not the board being fake — the
locked-deck arm settles that — it is that the board's other decisions are cheap
individually and the scheme is not.

Three schemes: `mark` (deny by sliding the named warden, which needs a slot to
slide into), `gather` (deny by leaving them no free slot — the one moment where
killing something is the wrong play), `chill` (deny by emptying the lane).

**A scheme must be `solo`.** A non-solo scheme is an effect *on top of* the
foe's swing, so spreading them across the bestiary is simply a buff to the fell:
measured, adding one took zone-two arrivals from 156 in 210 down to 127 and the
careless floor from 6% to 4%. A solo scheme *is* the foe's turn — it whistles
instead of swinging — which makes denying it worth the whole turn and makes
carrying more of them safe. `mark` and `gather` are solo.

Denial pays differently by how you did it, which is the answer to "three schemes
is not enough variety": deny a gather by leaving no slot and the foe has thrown
its turn at nothing; deny a chill by emptying the lane and you have stopped only
the extra.

**Dead end:** a fourth scheme that targeted the *hand*. The board is the shared
surface; a scheme the board cannot answer is not a scheme.

Spreading a scheme onto a new foe breaks any test that assumes *one* way of
denying. The tutorial suite asserted that emptying the player's side denies
whatever the opening rolled — true of `mark` and `chill`, false of `gather`,
which wants a free slot on the fell's side. Deny the thing the scheme actually
needs, not the thing that happened to work.

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

### And a third thing nobody was checking

Touch was rewritten in CSS pixels and found seven controls too small to hit.
Type got a floor and a stacking rule and found five collisions. Nothing had ever
asked whether the text could be **seen**, which is a strange gap in a game
painted in dim blues on darker blues.

The canvas stub records the colour every shape was filled in *and its bounding
box*, so each line of text is paired with the shape actually underneath it
rather than with whatever happened to be drawn most recently. The ratio is real
WCAG: 4.5:1 for body text, 3:1 for large. Things deliberately faded — a sold-out
ware, a locked leader — are drawn under a `globalAlpha` and are exempt.

It found the collection's undiscovered-tile `?`: a dim grey drawn straight onto
the creature silhouette behind it, which is whatever colour that beast happens
to be — **2.1:1 against a Hearth orange**, on every screen shape at once. It has
its own dark disc now.

Walking the same shots turned up the other half by eye: every tile name in the
collection was clipping into its neighbour, because `fitText` shrank them to fit
and the text floor pushed them straight back up. The floor wins — that is what
it is for — so the names are cut to the tile with an ellipsis and the whole
thing is one tap away.

### Nothing is half-tested now

The 653x280 shape in the render suite is a folding phone's *cover* display, and
the type check used to skip it with a note: at 280 tall the floor is 23 stage
units and the leader screen could not hold seven winters as a name over a
description in a fixed 44-unit row. Excluding a shape with a documented reason
is the right move once and a habit twice, so the row measures its own contents
instead, the list flows from the header, and the WINTER total sits under the
last row rather than at a fixed offset. **Every shape in the list is now checked
for everything it is in the list for.**

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
game built landscape-first for a thumb, never once photographed on anything
shaped like a phone or driven by anything shaped like a finger. Two rounds of
walking real handset shots turned up two whole classes of bug that no check
covered.

**Touch.** The check had been comparing hit boxes to 40 *stage units* for
seventeen rounds. The stage is up to 1760 wide and the phone it is drawn on is
667 CSS pixels across, so every target was about half the size the check
believed. In CSS pixels, seven controls were under the 44px both platforms ask
for and PASS was twenty-four pixels tall. `TOUCH_MIN`/`TOUCH_SLOP` give small
controls a forgiving second pass in `hitAt`, so what the check prices is the
effective target rather than the drawn one.

**Type.** Nothing checked text at all. The informational text of a game built
for a phone was rendering at six and a half pixels. `TEXT_MIN_CSS = 9` floors
every size in `txt()` — one line, in the one place every string goes through —
and on a desktop the floor is inert and nothing changes.

Flooring the size then broke the *layout*, three ways, because every line step
in the file was a number chosen for the size the text used to be:

- `wrapText` wrapped at the requested size and `txt` drew at the floored one, so
  card text overflowed its box. Both go through `textSize()` now.
- `fitText` shrank a label that `txt` floored straight back up.
- Every hardcoded step — `y + 24 + k * 17` — stacked glyphs on top of each
  other. They all go through `lineH(size, step)`, which returns the step
  unchanged when the floor is inert.

And the help pages, which were a fixed grid with a hard slice at five lines, cut
the rules off mid-sentence on a phone. They are measured and flowed now: two
columns when the entries fit, one wide column when they do not, a second sheet
with arrows when even that runs out. Nothing is cut.

The render suite covers both now, in CSS pixels, on every screen at eight
shapes: **no text below the floor, and no two lines of a paragraph closer
together than the taller of them.** It found two collisions nothing had ever
seen — the title's seal note landing on the run counter whenever a saved run
pushed the block down, and the trader's bell text sitting on its own name.

**The supported floor is a phone held sideways**: 375 CSS pixels tall (iPhone
SE), 390 on a 14. The `653x280` shape in the suite is a folding phone's *cover*
display; touch targets are checked there, type is not. At 280 tall the text
floor is 23 stage units and the leader screen genuinely cannot hold seven
winters as a name and a description.

## The probe was half particle effects

Forty per cent of the balance probe's samples were `fx.pop` and `fx.burst`,
building floating text and particle objects — sixty and four hundred at a time —
for runs with no screen attached. Gating the particle systems on having a canvas
took the suite from 26.7s to 9.4s. The sample went from eight runs a tribe
(±9.7, a band too wide to stand behind) to thirty (±5.0) in less wall time than
the old suite took.
