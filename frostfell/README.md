# FROSTFELL

A deckbuilding trek through the long winter. Lead a caravan of wardens across a
frozen world: counter-based card battles, charms, waves, and a deck you rebuild
every run.

Play: https://games-71g.pages.dev/frostfell/
Typeface specimen: https://games-71g.pages.dev/frostfell/fonts.html

Landscape only, built for a phone held sideways. One file — `index.html` carries
the markup, the CSS, the fonts and the whole game. The stage is 720 tall,
always; its width follows the device, so a 20:9 phone gets the extra width
rather than two black bars. Everything that touches an edge sits against a safe
inset, and the render suite checks every screen at five device shapes for touch
targets under 40px, anything off the stage, and anything under a notch.

---

## PART ONE — the reference

**This file is in three parts, and every heading says which.** Part one is the
reference, part two is the code, part three is the design record — organised as
**FINDINGS** (true, and they change what you would do next) and **DEAD ENDS**
(built, measured, thrown away). The dead ends are the more valuable half — eight
of them are shapes tried against the fight in the last four rounds — so they are
labelled rather than buried.

| | |
|---|---|
| [The rules, briefly](#the-rules-briefly) | the board, the turn, counters, waves, the front row, the room rule |
| [Building a deck](#building-a-deck) | rewards, the course, the caravan read, tempering, the trader |
| [Beyond one run](#beyond-one-run) | the collection, winters, the Stranger |
| [Something to chase](#something-to-chase) | seals |
| [Beasts](#beasts) | what each one does when it turns over |
| [Layout of the source](#layout-of-the-source) | twelve numbered sections, one file, no assets |
| [The typefaces](#the-typefaces) | Frostcut and Frostwork, cut from source |
| [Tests](#tests) | four suites, and what each one is for |
| [Looking at it](#looking-at-it) | the Playwright shot walk |

---

## The rules, briefly

- **The board** is two lanes deep, three columns a side. Column 0 is the front,
  nearest the middle of the table. A swing hits the **front-most foe in the
  attacker's own lane**; if that lane is clear it reaches across, and a unit
  with nothing in front of it will walk into the lane where the fighting is
  rather than stand there.
- **The fell answers the caravan.** Half the difficulty curve is the road, half
  is what you are carrying: it reads **the best six cards you hold** — the line
  the board can field, leader included — over the six slots, so an empty slot
  counts as the weakness it is. It absorbs about half of a deck advantage,
  deliberately not all of it, so building still pays without deciding the run.
  In the last zone the bar is lower and the part past a margin is bitten
  harder: a caravan built into a wall meets a winter built to match.
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
- **Waves, and the lane one is coming to.** Fights arrive in more than one
  piece. The wave clock is on the far side of the table; CALL pulls the next one
  in early, which is often the strongest play on the board. One turn before a
  wave lands the clock **names the lane it is walking into** — and if anybody at
  all is standing in that lane when it arrives, it turns around and waits. It is
  a scheme with the sides reversed: announced a turn early, and answerable for
  free, because moving is not your action.
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

## PART TWO — the code

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

The taller silhouettes carry a head genuinely separate from the body, with a
neck between; the small round ones keep the fused bean the cast is built on.
Everything that touches down has legs and feet; tails are brushes, whips,
plumes, fins or stubs; and every creature carries one distinguishing mark — a
scar, an eyepatch, freckles, a lit coal, a fringe of icicles, a monocle, a leaf.
The rules suite refuses to let two creatures share a whole row of that table,
which is what stops the cast being one drawing in sixty-six colours. Eye size
and spacing come from a stable hash of the recipe, and brows and lids follow
what a creature is: a foe gets an angry brow, a heavy lid, and a tooth over a
closed mouth. Cute, and still hungry.

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
runs and prints numbers; this is the opposite. **It has an opinion**: it plays
like somebody who has read the rules, and `--careless` plays like somebody who
has not. Taking option zero everywhere — what it did at first — is a transcript
of a passive player, and a passive player's complaints are not the game's.

### What the transcripts found

Four leaders, four courses, one transcript each, and all four agreed on three
things that became work: the trader was being walked out of with a full purse (a
meal is what was missing), the first zone was where a careless run actually
ended, and Hearth was told it was short of a hard hit it was already carrying.

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
**course** — one of five, free, and it costs you the other four. It puts a
**fourth card on every table** for the rest of the trek, always one going your
way, and hands you a rule to travel by.

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
the leader, by name and well enough to draw the thing again. A crossing lays out
the caravan that made it, every card of it.

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

**Two standard deviations, and the suite says so rather than the author
remembering to.** Two rounds running, a three-point reading at ±3.0 was written
down as "a direction" and evaporated at the larger sample — keeping a slot back
went +5 → +2, the beast's-rest change went +19 → +15. One round is bad luck and
two is a habit, so every row of the additive table now prints `(noise: under
2σ)` beside anything that has not cleared twice its own band. A row that clears
it is a finding; nothing else is.

`FF_RUNS=n` sets the sample. Everything else is an arm you turn up on its own:
`FF_ABLATE`, `FF_HABIT`, `FF_COURSE`, `FF_MONEY`, `FF_LESSON`, `FF_NOSCARS`.
`FF_CONTRAST=1` prints how much text the contrast check actually paired.

The shot walk is `tools/frostfell/shots.mjs` (`--size`, `--phone
iphone-se|iphone-14|pixel-7|galaxy-fold`), and `tools/frostfell/playthrough.mjs`
writes a whole run down turn by turn (`--tribe --course --careless`).

---

## PART THREE — what has been measured

Everything below came out of the probe or the shot walk, and is kept because it
changes what you would do next. Where a road turned out to be a dead end it is
named as one, so nobody drives down it twice.

### FINDING — the ladder

Four pilots, each the one above it plus one more thing it knows how to do, so
the gap between two rows is that one thing:

| pilot | | worth |
|---|---|---|
| careless | takes the leftmost card, swings at the nearest thing | 9% |
| + the fight | denies schemes, answers a named wave, places bodies, holds gear | 26% (**+17**) |
| + the trader | spends well | 39% (**+13**) |
| + steering the pool | drafts to a course | 38% (−1) |

**The commitment is withdrawn, and here is what was done first.** For three
rounds this file said the fight *should* be the rung that matters and the trader
was bigger every time. Rather than write it a fourth time, the round that had to
choose went looking for where the money goes and then tried to cut it: the
looking worked, the cutting mostly did not, and both are under
[what the purse buys](#what-a-bottomless-purse-is-buying).

What is left is a statement of what this game is rather than what it was
supposed to be: **the fight is the rung that carries the skill and the trader is
the rung that carries the run.** The fight separates a player from themselves —
it is the only place a habit has ever priced above the band, and it is worth
more every round. The trader separates a good run from a bad one, because money
buys a choice of several individually-sufficient things. Two different questions,
both answered; they do not need to be the same size, and the one attempt to force
it cost ten points of win rate across every rung including the beginner's.

**Steering the pool prices at roughly nothing and that is not the courses'
fault** — measured on its own at 450 runs an arm, all five courses beat
declaring nothing and sit inside two standard deviations of each other. They are
level. What prices at zero is the *drafting*, because a pilot that takes the
best card on offer is already doing most of what steering can do.

### FINDING — what a bottomless purse is buying

Give a rich pilot everything except one thing at a time, then give a penniless
pilot exactly one thing:

```
removed from a rich pilot          given to a penniless one
  no charm   45%  −17 of 21          free bell   53%  +26
  everything else   no cost          free meal   52%  +23
                                     free charm  45%  +16
                                     free sigil  42%  +13
```

**Seventeen of twenty-one points were charms**, because nothing stopped a rich
pilot buying every one in every shop. But from the other end, **any one of four
wares is individually sufficient** — a penniless pilot handed a bell, or a meal,
or a charm alone already beats the pilot paying full price for everything.

That is why removing one thing from a rich pilot mostly costs nothing: the
others substitute. The gap is **redundancy, not compounding**, and no single cut
closes it. What shipped is the narrowest useful limit — the trader carries three
charms in a whole run and each costs more than the last. Charms won at rewards,
caches and camps are not counted.

### FINDING — what the instrument cannot see

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

### FINDING — the dose of a lesson is irrelevant; the subject is everything

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

### FINDING — the fight is one decision and some decoration

For four rounds, at 180–210 runs an arm, attacked subtractively, additively and
through the mending ledger: **denial alone was worth 17–18 of the 20 the whole
set is worth**, keeping a slot back +2, everything else zero. Eight shapes were
measured against that and every one is tabled under
[DEAD ENDS](#dead-ends--everything-built-measured-and-thrown-away).

**The ninth moved it.** With the wave telegraph shipped, at 210 an arm, ±2.8:

```
                            set   denial alone   floor
before the telegraph        +17     17 of 17       7%
after                       +17      8 of 17       9%
```

Denial's share fell by nine points, which is three standard deviations — the
first time in four rounds anything has moved that number. Read carefully,
though: **the set is worth exactly what it was**, and no other habit clears its
band on its own (placement is the best of them at +1). So what the missing nine
points buy is the habits *in combination*, not a second nameable decision. The
fight is no longer one decision; it is not yet two.

**Why the board resists, and the rule that came out of it.** A scheme is the
only thing on the table whose outcome depends on what you do in the window
between it being announced and it happening. Everything else — where a body
stands, when gear is spent, whether a slot is free — is arithmetic the pilot
compensates for elsewhere on the same turn. Denial is not worth eighteen points
because it is strong; it is worth them because it is the only **event**.

So a second event was built: **a wave that names its lane one turn out**, and
standing in that lane makes it *wait* — the answer takes its turn away, exactly
as denying a scheme does. It took three cuts to get there.

**Cut one — the wave arrives BEHIND the holder.** The ladder fell from 34 to 23
and placement went +1 → −1. Committing a wave to one lane concentrates the fell
where a wave spread across free slots did not: **adding a mechanic to the foes'
side buffs the foes**, the same lesson a non-solo scheme taught two rounds
earlier. Rejected.

**Cut two — only the FRONT slot of the named lane holds it.** This is the one
that measured best on the ladder and was nearly shipped. It fails a different
check, and the check caught it: *declaring a course must never be worse than
declaring none*.

```
                        no course   best course   (210 an arm, ±3.3)
no telegraph                  36%     44% (cold)
front-only hold               44%     41% (cold)   ← invariant broken
anywhere-in-the-lane hold     39%     44% (gear)
```

The front-only rule is worth **+8 to a run carrying no course at all and nothing
to any of the five courses**. That is not a decision, it is a tax on a narrow
pool: a course narrows what you draw, and the front slot is the one every other
card already wants. A mechanic that only rewards the widest possible deck makes
the game's own specialisations worse.

**Cut three — anyone anywhere in the lane holds it.** Shipped. It costs two
points of the fight rung against cut two and puts the courses back on top.

```
                       careless   fight   trader   steering   total
no telegraph               5%      +15      +18        −1       32
front-only hold            8%      +19      +12        −5       26
anywhere-in-lane (ships)   9%      +17      +13        −1       29
```

Read honestly: **the fight's rung is up two and the careless floor is up four** —
the floor had been stuck between 5% and 7% for eight rounds — and **the ladder
is three points shorter**, mostly because a floor that rises compresses
everything above it. Steering is back to where it was.

Every individual move here is inside two standard deviations and **the suite
prints them as noise**, which is this round's rule and it applies to the round's
own headline. What is not noise is the mechanism: it is the second telegraph, it
is shaped like the first, and neither of the two things that sank the earlier
cuts — a stronger fell, a punished specialist — survived into the shipped one.

### FINDING — the quiet road

Walking past a fight measured **−16**, which does not describe a decision: a
fork where one side is always wrong is furniture with a signpost on it. The game
punished ducking (what you walk away from walks after you) and nothing paid for
it. So every quiet place now pays in what that place is *for* — the camp in rest,
the rest stop in choice (four blessings, not three), the shrine in the blessing
costing nothing. None of them is scrip or a card, which is what a fight gives.

And the pilot ducks for what is actually **scarce**. The line is 7% wounded at
the forks that offer the choice, so mending is not scarce and a rule paid in
mending cannot be a decision; the blessing is (three a run, capped).

```
takes every fight                 42%   23.4 cards · 0.1 tempered · fought 74%
walks past what it can            34%   13.7 cards · 2.9 tempered · fought 28%
ducks to a quiet stop when hurt   36%   21.8 cards · 2.5 tempered · fought 68%
```

The third column is the tell: the hurt-ducker used to arrive *identical* to the
fighter and now arrives with two and a half tempered cards against nought, off
fewer fights. The penalty for walking past everything has come in from −16 to
−8, and ducking only when hurt costs 6 — priced wrong rather than unplayable.

### FINDING — where the mending actually comes from

Read the caravan's wound total on every pass of the run loop, attribute each
change to the transition it happened on. **87% of every point of damage taken
gets mended**, and:

```
a fight ENDING (the fallen come back whole)   63%
camp 16%   ·   shop (mend-all) 15%   ·   rest/event 6%   ·   warmth 0%
```

The suspect list was wrong. Not camps, not meals, and **warmth does not register
at all** — the biggest entry is a warden *falling*, because a fallen warden's
damage is wiped to nought before it comes back Hurt. **Two thirds of the
"mending" in this game is not healing; it is a knockout being undone.**

That is why the line is 7% wounded at the forks where it should be deciding, why
every rule paid in mending has been dead on arrival, and why keeping a slot back
for warmth prices at nothing: there is nothing for it to save you from.

Five dials were tried against it and are tabled under DEAD ENDS. The one that
shipped — the beast's night's rest coming out — moved the ledger from 92% to 87%
and the fight-ending share from 65% to 63%, and moved the *win rate* not at all.
**That is the clearest evidence that this ledger and the ladder measure different
things.**

### FINDING — read state, don't intercept calls

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

### RULE — what a good card looks like

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

### FINDING — schemes are most of what the fight is worth

Denying schemes is the only fight habit that has ever cleared the band on its
own; the rest sit inside it. That is not the board being fake — the locked-deck
arm settles that — it is that the board's other decisions are cheap
individually and the scheme is not.

Three schemes: `mark` (deny by sliding the named warden, which needs a slot to
slide into), `gather` (deny by leaving them no free slot — the one moment where
killing something is the wrong play), `chill` (deny by emptying the lane). Deny
a gather and the foe has thrown its whole turn at nothing; deny a chill and you
have stopped only the extra. The variety is in *how*, not in *how many*.

**A scheme must be `solo`** — it is the foe's turn rather than an effect on top
of its swing. A non-solo scheme is simply a buff to the fell: adding one took
zone-two arrivals from 156 in 210 down to 127 and the careless floor from 6% to
4%. `mark` and `gather` are solo.

Spreading a scheme onto a new foe breaks any test that assumes one way of
denying. The tutorial suite asserted that emptying the player's side denies
whatever the opening rolled — true of `mark` and `chill`, false of `gather`.
Deny the thing the scheme actually needs.

### RULE — the room rule

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

### FINDING — the careless board is emptier, not fuller

Measured this round, and it corrects five rounds of assumption. Free slots by
share of turns:

```
careful pilot   0:2%  1:6%  2:32%  3:22%  4:22%  5:16%
careless pilot  0:4%  1:6%  2:14%  3:24%  4:29%  5:22%
```

A beginner does not drown by packing the board. Their wardens die, the board
empties, nothing blocks, and the leader takes the hits. Any change aimed at the
packed-board failure is aimed at something that happens on 4% of their turns.

### FINDING — the most lethal thing in the game has four health

Mitewing was in the top two of the late-zone death table for five rounds. It is
a tier-1 trash mob — four health, two attack. Counting each foe's *share of the
damage the fell actually swings* (tick rate over counter, times attack) explains
it: a cheap Aimless body with a one-counter walks past every wall and swings
every single turn. A death table ranks who landed the last blow; a damage-share
table ranks who did the work. Keep both.

### FINDING — Hearth, and a fact about how damage works

Hearth read bottom of the course table for several rounds through five attempts
to fix it. The pool was not leaning — 13 hearth cards against 14 frost and 13
scrap. The rule was: Regen is a **threshold good**. Healing that does not outrun
the incoming does nothing at all, and healing that does outrun it makes the
warden unkillable — there is no middle, so every tuning pass either did nothing
or broke it. A fact about the game's damage, not about Hearth.

### FINDING — the shot walk is still the only thing that sees

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

### FINDING — which screens actually use the width

Walked at 2400x1080. **Six use it** — the battle (board and hand span), the
trail (road edge to edge, a panel in each corner), the collection (twelve tiles
across), the leader screen (three columns), victory (the stat row spans), and
the trader and reward screen (the ware row spans). **Five ignore it** — the
title, camp, rest stop, shrine, event and the ending.

The five are all the same shape: a title, one piece of art, a centred row of two
to four buttons. They have three things to say and a 20:9 stage does not give
them a fourth. **The system is used by the screens that have something to
spread, which is the right answer rather than a gap** — widening a shrine would
mean inventing content for it.

### FINDING — contrast, the third thing nobody was checking

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

### FINDING — nothing is half-tested now

The 653x280 shape in the render suite is a folding phone's *cover* display, and
the type check used to skip it with a note: at 280 tall the floor is 23 stage
units and the leader screen could not hold seven winters as a name over a
description in a fixed 44-unit row. Excluding a shape with a documented reason
is right once and a habit twice, so the row measures its own contents instead
and the exclusion is gone. **Every shape is checked for everything it is in the
list for.**

### FINDING — smaller things, settled

- **Money is worth about sixteen points**, penniless to bottomless. Still the
  widest single lever in the game, and now understood rather than just measured
  — see below.
- **A hot meal** is the ware everyone buys, at every price step. It is doing the
  trader's job and that is allowed.
- **Every card is played** in a full sweep, all 58 of them.
- **Scars** cost the careless pilot about a point and do not explain any of the
  course table.

---

### DEAD ENDS — everything built, measured and thrown away

The most valuable half of this file. Each of these was built, run against the
probe, and removed; the number is why.

**Seven shapes tried against "the fight is one decision"** (all at 180 runs an
arm, baseline fight +16 / ladder 30):

| tried | result |
|---|---|
| a fallen warden comes back missing 35% | fight +9 — punishes the careful pilot hardest |
| warmth 2 instead of 1 | fight +17 but a global buff; the trader's rung took it |
| warmth pays in **Spice**, not Regen | fight +10, ladder 22 — and keeping a slot back went +2 → −1 |
| the fallen keep half and lose Hurt | ladder 39, a different game |
| only the FIRST loss of a fight is wiped | no change |
| the fallen do not travel again until a camp | ladder 33 — neutral, and brutal to play |
| **a wave that names its lane, answered by arriving BEHIND** | ladder 34 → 23, placement +1 → −1 |
| **the same telegraph, held only from the FRONT slot** | best ladder of the three (+19 fight) — and broke "a course is never worse than none" |

The last two are the useful failures, and they fail for opposite reasons: the
first made the foes stronger, the second made a wide deck stronger. Both are
tabled in full under [the fight](#finding--the-fight-is-one-decision-and-some-decoration),
along with the third cut that ships.

Eight shapes now, all at 180–210 runs an arm.

**Other roads that went nowhere:**

- **A fourth scheme targeting the hand.** A scheme the board cannot answer is
  not a scheme; the board is the shared surface.
- **A tier-1 foe carrying a scheme.** The first zone is where somebody learns
  what a telegraph is; a timer there is not a decision.
- **A cap of two charms a warden.** Narrowed the economy exactly as designed
  (trader +20 → +10) and took ten points off *every* rung including the
  beginner's — charms were never the rich pilot's lever alone.
- **A rising charm price.** Measured nothing and could not have: the bottomless
  arm is *defined* as "prices do not matter".
- **A second lesson, for the room rule.** Built twice — once crudely, once with
  the careful pilot's real three-part rule — and zero both times. A habit worth
  teaching has to pay on its own.
- **Taking the worse of outline and ground, on a bbox lookup.** Right rule, wrong
  instrument; it needed the raster below before it could ship.
- **An age counter on the stamped arm readings.** Churned the file on every check
  for something git already knows.

### FINDING — nobody had played it on a phone

Twenty-three rounds of shots were taken in a desktop Chromium — a game built
landscape-first for a thumb, never photographed on anything shaped like one. Two
rounds of real handset shots turned up two classes of bug no check covered.

**Touch** was compared against 40 *stage units* for seventeen rounds. The stage
is up to 1760 wide and a phone is 667 CSS pixels across, so every target was half
the size the check believed: seven controls under 44px, PASS twenty-four tall.

**Type** was not checked at all, and was rendering at six and a half pixels.
`TEXT_MIN_CSS = 9` floors every size in `txt()` — one line, in the one place
every string goes through, inert on a desktop. Flooring it then broke the
*layout* three ways, because every line step in the file was a number chosen for
the size the text used to be. `wrapText` and `fitText` go through `textSize()`
now; every hardcoded step goes through `lineH(size, step)`. The help pages were
a fixed grid with a hard five-line slice that cut the rules off mid-sentence;
they are measured and flowed now. **The supported floor is a phone held
sideways**: 375 CSS pixels tall.

### FINDING — the probe was half particle effects

Forty per cent of the balance probe's samples were `fx.pop` and `fx.burst`,
building floating text and particle objects — sixty and four hundred at a time —
for runs with no screen attached. Gating the particle systems on having a canvas
took the suite from 26.7s to 9.4s, and the sample from eight runs a tribe (±9.7,
too wide to stand behind) to thirty (±5.0) in less wall time than the old took.
