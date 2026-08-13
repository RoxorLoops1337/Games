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
[every ware is worth buying](#every-ware-is-worth-buying),
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
careless            ░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓███     7%
+ the fight         ░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓████████    17%
+ the trader        ░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓████████████████    33%
+ steering the pool ░▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓████████████████    34%
```

**Twenty-seven points for playing well: ten from the fight, sixteen from the
trader, one from steering the pool.**

A round earlier the same ladder read 22 / 34 / 37 with the fight at +15 — the
biggest rung for the first time, off the back of [making the room rule a
decision](#the-rule-the-board-is-built-around-was-not-a-decision). It reads +10
now. Nothing was done to the fight in between, so **the honest reading is that
the fight/trader split is not stable at 210 runs a rung** and neither number
should be quoted to the point. What has been stable for three rounds is the
shape: the careless floor near 7, the ceiling in the middle thirties, and
somewhere between twenty-five and thirty points separating them.

**The careless floor, and what it costs.** Last round it read 7%, one under the
floor, and named scars as the likely cause without testing it. Tested: the same
210 runs an arm with every scar stripped as it is handed out, and the careless
pilot reads **8%**. So the guess was right this time — scars compound over a run
and their three escapes (rest, mend, pay her) are all things a careless pilot
never does.

**That is a price worth paying, and here is the reasoning rather than the
verdict.** A point of careless win rate buys a rule that turns a dead button on
the trader's counter into a service, makes Hurt a warning with something behind
it, and gives resting a reason to exist. The pilot losing that point is a bot
that never rests, never mends and never visits the trader — a human who does any
one of those three does not pay it at all. It stays, and the floor is stated at
what it actually is rather than rounded up.

### The rule the board is built around was not a decision

Last round, "keeping a slot in reserve" fell from +5 to 0 and the note said it
was on the edge of readable and would get its own turned-up run. It got one:
**750 runs an arm, band ±1.5, and the answer was exactly +0.** A measured zero,
not a noisy one — the room rule, the rule the whole board is built around, was
worth nothing to the pilot.

The instinct is to reach for the rule's numbers. That would have been wrong,
because a habit reads zero two ways — doing it is worth nothing, or the moment
to do it never comes — and nothing on the instrument could tell them apart. So
two counters went in, and they answered it in one line:

```
free slots on the player line, by share of turns:  0:3%  1:17%  2:17%  3:22%  4:24%  5:18%
```

**The line stood on a fully packed board for three per cent of turns.** Warmth
was on for the other ninety-seven. A rule whose penalty side fires three times
in a hundred is not a decision; it is a passive heal with a footnote, and the
habit of avoiding the penalty is worth nothing because there is nothing to
avoid.

So the bar moved from one gap to two, and the middle became [its own
state](#the-rules-briefly): cramped, no warmth, no cold. That takes the live
question from three per cent of turns to twenty *without making the game
harsher* — the state that was silently free is now merely neutral — and it puts
a cost on the body you put down on a board of four, which is where most fights
actually happen.

It worked, and the size of it is worth being plain about:

| | before | after |
|---|---|---|
| keeping a slot in reserve | **+0** (±1.5, n=750) | **+2** (±1.5, n=750) |
| a body held back, per deployment | 19% | 32% |
| turns spent at two free slots | 17% | 25% |
| the fight rung | +8 | **+15** |

**The habit is worth +2, and the +8 that the consolidated table once reported is
not quoted here.** Two readings disagreed — +8 at 210 runs an arm, +2 at 750 —
and they did not overlap, so the bigger one was measured again on its own
against the game as it now stands. It came back +2 a second time. A number that
survives two independent runs at the tighter band beats one that appeared once
at the looser one, and the small answer is the true one.

Which leaves an honest loose end: **the habit is worth +2 and the rung it sits
in went up by seven.** Those are not the same quantity — a rung is the whole
fight played well against the whole fight played badly, and the room change
alters the shape of every turn, not just the moments when the pilot declines a
play. But the gap is not explained, and it is written down rather than papered
over. The second and third rows are what is not in doubt: the pilot changed its
behaviour sharply, hugging the new threshold, which is what a live question
looks like from the outside.

### And it is a decision for one side of the table only

The room rule is symmetric — it has always applied to the foes too — but the two
sides do not meet it equally often:

```
free slots, player line:  0:4%  1:6%  2:25%  3:22%  4:24%  5:18%     ≤2 on 35% of turns
free slots, foes' line:   0:2%  1:5%  2: 9%  3:22%  4:36%  5:26%     ≤2 on 16% of turns
```

**This is intentional, and the reason is worth stating rather than fixing.** A
rule that prices a decision can only be a decision for the side that makes
decisions. The caravan is six wardens a player assembles and chooses to commit;
the fell arrives in waves and chooses nothing. Applied to the foes the same rule
is not a decision at all — it is weather, and it should be, because it is the
same winter for everybody and only one side of the table can do anything about
it.

The foes are not untouched by their own board being full, either: the **gather**
scheme needs a free slot on their side to put the new body in, so a packed fell
line already denies itself. That interaction pulls the same rope from the other
end, and it is the one that gives the player a reason to *stop* clearing the
enemy back row.

### Which rung should matter, and a note on what this instrument cannot see

Three rungs within four points of each other is the flattest this ladder has
read, and the question it raises — *should one of them be the thing that
matters?* — has an answer, so here it is in writing.

**The fight should be the rung that matters most, and it is not.** The reason is
not that flat is wrong; it is that the three rungs are not three things a player
*learns*, they are three things a player *does*, and they cost wildly different
amounts of attention. The fight rung is fifteen or twenty decisions a fight
across a dozen fights. The trader rung is three shop visits. The steering rung
is one button at the leader screen and a redeal or two. Pricing all three the
same means the thing a player spends ninety per cent of the run doing is worth
the same as a button pressed once. That is the imbalance worth naming, and it is
a different complaint from "the total is too small" — the total is fine.

**And it was fixed the round after.** The diagnosis above was that the fight's
habits overlapped and the answer was to find a decision the others did not
already imply — not to turn the existing ones up. That is what happened, and it
came from the opposite direction: not by inventing a decision, but by finding
that [one the game already had was not being
asked](#the-rule-the-board-is-built-around-was-not-a-decision). The room rule
was live on three per cent of turns. It is live on twenty now, and **the fight
rung went from +8 to +15 — the biggest on the ladder for the first time.**

The general lesson is worth more than the fix: before adding a decision, check
whether the ones already written down are being *reached*. A rule with a
condition nobody meets is indistinguishable from a rule that is not there, and
it will not show up as a missing feature — it shows up as a habit worth zero.

**And a limit of the instrument, which came up trying to answer a different
question.** The careless rung is a bot that ignores the guide completely. So
when the guide gets better — as it did this round, gaining a hint for the single
most valuable habit in the game — **the ladder cannot show it**. The careless
pilot is a floor on *difficulty*, not a proxy for a new player. Any claim that
better teaching moved that number would be false, and none is made below.

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

### Every ware is worth buying

The counter has nine things on it. The probe now buys all nine, and the table of
what it bought is the instrument — because a ware nobody buys in a whole run is
furniture, and until this round nobody had asked.

Asking turned up three different answers wearing one face:

- **The pilot was not looking.** It had never once pressed the sigil or a charm
  in nineteen iterations. That is not evidence about the ware, it is evidence
  about the pilot — and a sigil is a free deployment every fight for the rest of
  the run *and* a thinner draw pile, which is not a ware anybody should be
  passing over. Both are on its list now, and both get bought.
- **The ware was genuinely dead.** [Tending a hurt](#scars-and-tending-them)
  could not be bought because nothing in the game had ever handed out a scar.
- **The counting was wrong.** Half the counter is bought by pressing a button
  that opens a chooser rather than by calling `buy` directly, so a wrapper round
  the exported function saw three wares out of nine and called the other six
  dead. Counted where the pilot decides instead.

```
a hot meal    ██████████████████████████  2855
a card        ██████████                  1090
mend all      ██████                       696
temper        ████                         409
burn a card   ██                           202
a bell        █                            134
a charm       █                            123
a sigil       █                             59
tend a hurt   ·                             23
```

The meal dominating is by design — it is the sink, and it is the only ware sold
at two different nodes. What the table is for is the bottom: **a ware at zero is
now a failing check**, so a dead button cannot sit on that counter for another
nineteen iterations.

### Every card is worth playing — and the table that said otherwise

Three cards sat at the bottom of the usage table for four rounds through two
rebalances: lanternmoth, patchkit, thornoil. Given the ware table's lesson —
that "nobody bought it" is three findings wearing one face — the same question
went to the deck, and **the table was measuring the wrong thing.**

Raw plays is a number about the *pool*, not about the card. The three at the
bottom were carried into a finished deck about sixty times each; the three at
the top, nine hundred — because the top three are **starter cards**, in every
deck from the first step of every run. Divide it out and what is left is a
number about the card: how often a caravan that *has* one finds a moment for it.

On that measure the bottom was **thornoil 2.75 and patchkit 2.99** against a top
of eleven — and **lanternmoth was fine all along**, at 4.81, low on the raw
table only because it is a rare-2 card the pool rarely offers. One of the three
named cards was never a problem.

The other two were a blind spot in the pilot rather than in the cards. Every
ally-targeted item was scored as though it were a heal — aimed at whoever was
most wounded, and worth nothing if nobody was. **Thorns is retaliation**: it
wants whatever is about to be *hit*, which is a soaker or the front of a lane
with something swinging into it, and has nothing to do with who is hurt.
**Shell is damage prevented**, which the scoring counted as zero. Taught both:

| | before | after |
|---|---|---|
| thornoil | 2.75 | **off the bottom five entirely** |
| patchkit | 2.99 | 3.63 |

Thorn Oil was an instrument artefact. Patch Kit moved and is still low. The
bottom of the fair table is now a different five — galewisp, lastlight,
snowhare, hookline, patchkit — which is what happens when a measurement stops
being wrong, and **none of them is chased this round**: a table that has just
changed shape is not evidence about its own new bottom.

### The most lethal thing in the game has four health

Mitewing has been in the top two of the late-zone death table for five rounds.
It is a **tier-1 trash mob**: four health, two attack, the weakest foe in the
bestiary. Counting what each foe contributes to the damage the fell actually
swings — its tick rate over its counter, times its attack — explains it:

```
Mitewing     ██████████████████████  9%   counter 1 · aimless — no wall stops it
Glutton      ██████████████████████  9%   counter 5
Frostwyrm    █████████████████████   9%   counter 5
Rime Knight  ██████████████████      8%   counter 4
```

**Its counter is 1.** It takes five turns for a Frostwyrm's one, and ten in the
front row, so a trash mob swings as much in total as the biggest monsters in the
game. That part is fine — it is what makes it frightening rather than trivial.

What was not fine is that **Aimless outranked Soak** in the targeting order. So
every answer the game spends its first hint teaching — the front of a lane takes
the hits, put a wall up, move somebody out of the way — was *inert* against the
foe doing the most damage in the game. Six wardens in the pool carry a taunt and
none of them could do anything about it. The only answer was to kill it, and its
mother whistles for more.

So Mitewing's numbers are untouched and **a taunt now beats everything**, Aimless
included. That is one line of targeting order, and it makes the keyword that was
"beats Longshot" into the answer to the fastest thing on the table.

**And then the answer turned out to cost more than the problem.** Six cards in
fifty-three carry Soak and no leader starts with one, so a pilot that does not
go looking will never hold one — the Kettle Titan's lesson, in a second place.
So the pilot was told to go looking, and both numbers were measured:

| | Mitewing's share of late deaths | the top rung |
|---|---|---|
| pilot chases a taunt | 25% | 30% |
| pilot does not | 33% | **34%** |

**A taunt does not prevent damage; it concentrates it.** One warden takes
everything instead of the line spreading it out and the room rule mending all of
it. Drafting toward a soaker moved Mitewing eight points down the death table
and cost four points of win rate doing it.

So the targeting order ships and the drafting advice does not. What was fixed is
**fairness** — the game's first hint teaches you to put a wall up, and now that
works on everything — not power. Mitewing is still a third of the late-zone
death table, and the honest verdict is that it is a good fight that most decks
have no answer to, rather than a tax. Putting a taunt in a starting deck is a
thing to try; it is not a thing to claim.

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

It read **+13 for dodging** three rounds ago. It reads **−5** now, and the
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
    +6  denying schemes                   +7  declaring a course at all
     0  keeping a slot in reserve          0  buying a fresh offer
     0  repositioning (removed)            0  tempering instead of taking
    -2  holding gear until it earns        0  picking what the deck lacks
    -3  filling the front of both lanes   -5  walking on when it wants nothing
     0  calling waves early (removed)
```

**This table is not a ranking, and pretending otherwise has cost four rounds.**
A round ago the same six habits at the same sample read +9 / +8 / +6 / +6 with
nothing between them; nothing was done to any of them in between and they now
read +6 / 0 / 0 / −2 / −3. Six numbers each carrying ±2.8, re-rolled every
round, will produce a different podium every time.

The only figures on this page that have survived being asked twice are the ones
measured **one habit at a time at 750 runs an arm**, where the band is ±1.5:

| | |
|---|---|
| keeping a slot in reserve | **+2**, measured twice, two rounds apart |
| denying schemes | positive in every reading ever taken, magnitude unsettled |

`FF_HABIT=<key>` exists for exactly this. The consolidated table stays because
it is cheap and it catches signs; it is no longer read for order.

And the economy: **penniless 30%, as it ships 34%, a bottomless purse 54% —
money is worth four points.** It had read four when the only things to spend on
were one-a-visit; a meal gave the purse a bottom and the number went up, which
is what a working economy looks like.

The bottomless-purse arm is the reason meals have a **cap of twelve**. Handed
free money and prices at a fiftieth, the pilot ate its way to **93%** — money
buying a run outright rather than paying for one. The cap sits far above where
real play lands (5.4 meals an average crossing) and exists purely so the
degenerate case has a floor to hit; it took that arm from 93% to 56%.

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

**Scrap, settled.** Last round's table read Scrap at 25% at the ordinary sample
and it was flagged rather than acted on. Turned up to 600 runs an arm (band
±1.9) it read **30% against a 34% baseline for declaring no course at all** — so
the 25% was noise, but a real finding was underneath it, and it was sitting in
plain text:

> **scrap** — "The first gear you use each fight does not cost the turn."
> **gear** — "gear you use goes back into the deck, **and the first one each fight is free**."

One course's whole rule was a strict subset of another's. Of course it measured
worse than nothing. The free gear is now Scrap's alone and recycling is Gear's
alone — tempo against value, which is an actual choice — and Scrap gets a second
rule that no other course could have: it is the tribe that patches things back
together, and the game just grew a thing to be patched, so **on the Scrap Trail
a warden that goes down comes back patched rather than Hurt**, and never scars.

Re-measured at 600 runs an arm: **none 36%, Cold 43%, Bodies 38%, Gear 38%,
Scrap 35%, Hearth 33%.** Scrap is fixed — up five points and inside the field.
(It holds: at 450 an arm a round later, with the room rule and Cold both changed
underneath it, Scrap reads 36 against a 40 baseline.)

**Cold, settled — and the guess was wrong.** Last round left Cold at 43% with a
written hypothesis: the new scar rule rewards not taking damage, and Cold is the
damage-prevention course. That was testable, so it got tested — the same pilots
on the same seeds with every scar stripped the moment it is handed out, at 450
runs an arm:

| | none | hearth | cold | scrap | bodies | gear |
|---|---|---|---|---|---|---|
| scars on | 40 | 35 | **44** | 36 | 36 | 39 |
| scars off | 37 | 35 | **42** | 36 | 35 | 39 |

Cold's lead does not move. **Scars are not the mechanism**, and writing the
guess down is what made it cheap to find that out.

What it actually is, is a rule this round made more valuable somewhere else.
**Frost skips a trigger, and a foe that does not trigger does not fire the
scheme it committed to** — so Cold is automatic scheme denial, on the front of
every wave, for free. Scheme denial is the most valuable habit in the fight, and
it is worth *more* than it was, because every opening now carries a schemer. A
course that hands you the best habit in the game without asking is not a choice.

So Cold is cut a second time — iteration 15 took it from wave-wide to the front
of a wave; this takes it to the front of the **first** wave. The thing walking
at you when the bell rings arrives cold; the reinforcements do not. Re-measured
at 450 runs an arm:

```
none    ████████████████████  40%
cold    █████████████████████ 41%     (was 44)
gear    ████████████████████  39%
scrap   ██████████████████    36%
bodies  ██████████████████    36%
hearth  ██████████████████    35%
```

Cold is now level with declaring nothing, and the whole field spans six points —
which is the standard this file has been claiming and, at this sample, finally
meeting.

### Hearth: five attempts, and a finding about the game instead

Hearth read 34 against 40 for declaring no course at all — worse than not
declaring, and the last course still failing. The brief said to check the pool
lean before the rule, because Scrap's problem had turned out to be neither of
the things it looked like. The pool is **13 hearth cards against 14 frost and 13
scrap**: the lean is level. So it was the rule, and the rule was damage — Spice
on deploy plus Spice every other turn, about one extra point per trigger, in a
game whose fight ablation prices denying a scheme and keeping room far above
hitting harder.

Five versions, each measured at 450 runs an arm against a 36% baseline:

| Hearth's rule | |
|---|---|
| Spice on deploy, Spice every other turn (as it was) | 34% |
| once a fight, the first warden that would fall stays standing | 34% |
| **warmth 2** — a line with room is warmed twice over | **52%** |
| warmth 2, every other turn only | 50% |
| warmth 2, only on a line keeping three slots clear | 53% |
| warmth 2, only on the leader | 53% |

**There is no setting between +0 and +17**, and that is a finding about the game
rather than about this course. **Regen is a threshold good.** Any amount of
warmth-2 tops the line back up, so halving how often it happens costs two
points; making the player pay a permanent body for it costs *nothing*, because
sustain outbids bodies; and putting it on the leader alone is worth as much as
putting it on all six, because the leader is the thing whose death ends the run.

So Hearth ships with the bounded rule — once a fight, the first warden that
would fall stays standing — and **the gap is reported rather than forced**. It
reads 34 against 36, two points, inside the ±2.2 band. The reason that gap
closed is not this course: **the baseline came down from 40 to 36 this round.**
Shipping a 53% outlier to close a two-point deficit would have been the worst
trade in the file.

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
