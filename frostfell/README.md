# FROSTFELL

A deckbuilding trek through the long winter. Lead a caravan of wardens across a
frozen world: counter-based card battles, charms, waves, and a deck you rebuild
every run.

Play: https://games-71g.pages.dev/frostfell/ · specimen: `/frostfell/fonts.html`

Landscape only, built for a phone held sideways. One file — `index.html` carries
the markup, the CSS, the fonts and the whole game. The stage is 720 tall,
always; its width follows the device, so a 20:9 phone gets the extra width
rather than two black bars. Everything that touches an edge sits against a safe
inset, and the render suite checks every screen at five device shapes for touch
targets under 40px, anything off the stage, and anything under a notch.

---

## PART ONE — the reference

**Three parts, and every heading says which.** One is the reference, two is the
code, three is the design record — **FINDINGS** (true, and they change what you
would do next), **RULES** (settled, and they constrain what comes next) and
**DEAD ENDS** (built, measured, thrown away). The dead ends are the more valuable
half, so they are labelled rather than buried.

| | |
|---|---|
| [The rules, briefly](#the-rules-briefly) | the board, the turn, counters, waves, the front row, the room rule |
| [Building a deck](#building-a-deck) | rewards, the course, the caravan read, tempering, the trader |
| [Beyond one run](#beyond-one-run) | the collection, winters, the Stranger |
| [Beasts](#beasts) | what each one does when it turns over |
| [Layout of the source](#layout-of-the-source) | twelve numbered sections, one file, no assets |
| [The typefaces](#the-typefaces) | Frostcut and Frostwork, cut from source |
| [Tests](#tests) | four suites, and what each one is for |
| [The two tools](#the-two-tools) | the transcript and the shot walk |

---

## The rules, briefly

- **The board** is two lanes deep, three columns a side; column 0 is the front.
  A swing hits the **front-most foe in the attacker's own lane**, reaching across
  if that lane is clear, and a unit with nothing in front of it walks into the
  lane where the fighting is.
- **One action per turn** — play a card, ring the redraw bell, or pass. There is
  no mana, the turn *is* the cost; moving a warden already down is free, and so
  is calling the next wave early.
- **Counters** are the clock: every unit counts down one a turn and at zero it
  triggers — ability *and* swing — then resets. A counter driven to zero by a
  card fires immediately, which is where the combos live.
- **The front row runs double.** Counters tick twice as fast in column 0, both
  sides, marked `×2`. A slow heavy hitter forward swings sooner and is hit for
  it; a fragile one back is safe and late. Moving is free, so it is a question
  you answer every turn rather than once at deployment.
- **Resolution order** is fixed and visible — every foe before every warden,
  front before back, top lane before bottom — and ORDER numbers the board.
- **Schemes.** A counter says *when*; a scheme says *what*, one turn early, in
  words on the table. A foe that lunges names the warden **and the slot** — move
  them and it hits empty snow and loses its whole turn; leave somebody else and
  that body takes an ordinary blow instead of a double one. One that calls the
  pack needs a free slot on its own side; one that breathes on a lane needs a
  warden still in it. **Every scheme can be taken away, and taking it away is
  free**, because moving is not your action.
- **Waves, and the lane one is coming to.** Fights arrive in more than one piece.
  The wave clock is across the table and CALL pulls the next one in early, often
  the strongest play on the board. One turn before a wave lands the clock
  **names the lane it is walking into**, and if anybody at all is standing there
  when it arrives it turns around and waits — a scheme with the sides reversed.
- **The line needs room, and one gap is not room.** At the end of every turn:

  | | |
  |---|---|
  | **two or more free slots** | the line rotates — warmth down all of it, Regen 1 on everybody |
  | **exactly one free slot** | cramped: no warmth, but no cold either |
  | **none free** | nowhere to fall back to, and the cold gets into somebody |

  It makes "should I put this down?" a question instead of a reflex, and the line
  under your side of the table says which of the three you are on. The bar used
  to be one gap, and [that was the problem](#the-rule-the-board-is-built-around-was-not-a-decision).
- **The redraw bell** throws your hand away for a fresh one. It costs the turn
  unless it has charged — four turns without ringing — and then it is free.
- **Hurt.** A warden that falls comes back at half attack and half health and
  shakes it off by seeing a fight through. Damage carries between fights.
- **Combos.** Kills inside one turn are counted together and paid for.
- **The cold closes in.** Past thirty turns the warmth stops and the frost bites
  harder every five turns, both sides alike. A fight that cannot end is worse
  than one that is lost, and per-card tuning cannot fix a class of bug the next
  healing card reopens — so the world ends it.
- **The fell answers the caravan.** Half the difficulty curve is the road and
  half is what you carry: it reads **the best six cards you hold** over the six
  slots, so an empty slot counts as the weakness it is, and absorbs about half of
  a deck advantage — deliberately not all. In the last zone the bar is lower and
  the part past a margin bitten harder: a wall meets a winter built to match.
- **What you walk away from walks after you.** Duck a fight and whatever was
  there closes two steps. The first six are free, nothing follows you in the
  first zone, and it never decays — so ducking one bad pack when the line is hurt
  stays a decision and ducking everything means meeting the beast with a pack at
  your back. The trail says so before you pick.
- **Shove** puts what it hits a slot further back; **Crush** hits harder for
  every other body in the target's lane, so a stacked line is a liability;
  **Hoard** grows while a card waits unplayed in your hand.
- **Charms** bolt permanently onto a card; **sigils** put that warden on the
  board before the first bell; **bells** are run-wide, chosen after a beast falls
  — an extra card each hand, a slower wave clock, a fatter purse.
- **Events** are forks in the road — a shrine, a stopped caravan, a hot spring, a
  bell in a dead tree, somebody else's fire — and every option is a real trade.
  **Rest stops** hand out a small permanent kindness, **shrines** take a card
  overnight and give it back better, **packs** hunt a named way.
- **The course** is declared at the leader screen and travels the whole trek: a
  fourth card on every table and a rule to go by (below).

## Beyond one run

- **Seals** are eight named ways to cross, struck on the title screen and lit as
  earned: cross at all, without losing a warden, carrying eight cards or fewer,
  holding your declared course, having bought nothing, under a winter of five,
  felling every beast, once with each tribe. They cost nothing and change no
  rule — a reason to set out again, and a crossing that earns nothing says so.
- **The collection** lists every warden, item, charm and leader; what is locked
  says what it wants and how far along you are, off counters the game keeps.
- **Winters** are the optional difficulty — one sentence and a price in points
  each, and the hardest total a tribe has carried across is kept by its name.
- **The Stranger** is the fourth leader, earned by crossing a zone without losing
  a warden.

## Teaching, sound, and feel

A first run comes with hints that watch rather than block: each waits for the
player to do the thing it names, stays readable even when the action has already
happened, and the whole sequence goes away with one tap. HOW TO PLAY is a
three-page rulebook on the title screen and behind `?` in a fight.

### What the guide teaches, and what a lesson is worth

The fight ablation has priced every habit for six rounds and **denying schemes**
is the only one that has ever cleared the band — and the guide had not one word
about it. Nine hints about deploying, counters, the front row, the room rule, the
bell and the waves, and nothing about the red text a foe puts on the table a turn
before it acts. It has one now, and a beat behind it: a scheme landing in the
first zone on a run that has never denied one says once what would have stopped
it.

Every hint names an ACTION and clears when the action lands; two that shipped as
statements sat on screen for three turns while the player waited them out. The
scheme hint HOLDS — it waits for red text to exist rather than being skipped past
it — because a player who has not learned the rule will not deny anything.

## Playing it with a thumb, and reading a fight

Drag a card to a slot, or tap to pick it up and tap where it goes — either works,
which matters on a phone. A held card lights the slot it would land in and paints
a ghost of itself there; a drop that would not work says why rather than silently
refusing; holding a card still opens it to read.

Anything one tick from going off draws a line to what it will hit — at the warden
it *named*, if it named one — and whatever resolves first wears a NEXT tag, faint
by default and bright while ORDER is held open. Dragging gear writes what it
would do on the things it would do it to, with a cross over anything the hit
would kill, off the same table the card text uses, so preview and effect cannot
disagree. A foe committed to a scheme flies a ribbon in the band outside its lane
until it fires or somebody takes it away. A short log runs down the left; the
deck and used pile are stacks you can tap and read, sorted by name, because the
draw order is not yours to see.

## PART TWO — the code

`index.html` is one script in twelve numbered sections — utilities, palette,
statuses, card data, state, the battle engine, the run layer, juice, rendering,
input, audio, boot. The section index sits at the top of the script.

Nothing is loaded from disk. Every creature is drawn by one procedural renderer
(`drawCreature`) from a recipe — silhouette, surface, stance, tail, ears, mouth,
markings, props, a distinguishing mark and an idle — so the cast comes out of one
sketchbook and scales to any screen without an image file. Fur grows tufts along
its underside, ice takes flat facets, metal gets a specular band and rivets. A
creature paws, shivers, sways, hovers or breathes depending on what it is, and
comes apart on death the same way: ice shatters, metal falls over, fur goes up in
a puff. Taller silhouettes carry a head genuinely separate from the body; the
small round ones keep the fused bean the cast is built on. Eye size and spacing
come from a stable hash of the recipe, and brows and lids follow what a creature
is — a foe gets an angry brow, a heavy lid and a tooth over a closed mouth.
**The rules suite refuses to let two creatures share a whole row of that table**,
which is what stops the cast being one drawing in sixty-six colours.

Each zone owns its foreground and weather: conifers under drifting snow in the
Whitewood, broken plates over black water in a scouring wind on the Long Shelf, a
jagged skyline with one watchfire still burning under falling ash at Hollow
Peak.

### What it would cost to split it, if it ever comes to that

`index.html` is past 8,500 lines. One file is still the right call — no build
step, no import graph, the whole game greppable — but three sections have quietly
grown a second job, written down here so the next round is not guessing.

- **Rendering (§9, ~2,000 lines) does two things**: the *board*, coupled to the
  battle state, and the *screens*, coupled to nothing but layout and where every
  phone bug of the last three rounds lived. The cleanest cut and the only one
  that pays for itself — **one more `<script>` block and the loss of shared
  locals** (`txt`, `panel`, `lineH`, `C`, the layout constants), perhaps 40 lines
  of plumbing.
- **The battle engine (§6, ~1,200 lines) carries the beat queue.** `beat()`, the
  animation scheduling and `drainAll` are timing rather than rules, and are why
  the engine cannot be reasoned about without holding the renderer in your head.
  Four entry points, but it **cannot be done without a test-visible change**
  because the suites drive `drainAll`: a day of test churn for clarity, not
  correctness.
- **The run layer (§7) has absorbed seven node kinds** whose only shared code is
  `advance()`. It reads as one thing and is seven, grows every round, and is the
  **most expensive** to cut: every node reaches into `g.run` and `g.ui` freely
  and formalising that would touch the save format, which must not be renamed.

**The recommendation, unexecuted:** take the screen renderer out first and stop.
The only one where the cost is plumbing rather than risk, and where the bugs
are.

## The typefaces

Two families, cut from source in `tools/frostfont/` and embedded as WOFF:
**Frostcut**, the display face — heavy, condensed, faceted bowls, icicle wedges
on the arms — and **Frostwork**, the UI face in regular and bold, with a tall
x-height and flat-cut terminals, built to survive an 11px label.

```
node tools/frostfont/build.mjs   # rebuild + re-embed (--check, --specimen)
```

## The two tools

```
node tools/frostfell/playthrough.mjs --tribe scrap --course pack --out DIR
node tools/frostfell/shots.mjs --size 2400x1080 --phone iphone-se
```

**The transcript** plays one run start to finish in a real browser, noting every
decision and shooting every beat that matters — the opposite of the probe, which
measures hundreds of runs and prints numbers. **It has an opinion**: it plays
like somebody who has read the rules, and `--careless` like somebody who has not.
Taking option zero everywhere, what it did at first, is a transcript of a passive
player, and a passive player's complaints are not the game's.

**The shot walk** opens the real file in Chromium and walks the route a player
walks — boot, title, rulebook, collection, leader, trail, a whole first fight,
reward, shop, camp, rest, shrine, event, a beast, the end — leaving a PNG of
each. The headless suites prove the game does not throw; only this tells you two
labels overlap. Both drive the game through `window.FF`, the same handle the
suites use, so neither can drift out of step with the rules.

### What the transcripts found

Four leaders, four courses, one transcript each, and all four agreed on three
things that became work: the trader was walked out of with a full purse (a meal
was what was missing), the first zone was where a careless run actually ended,
and Hearth was told it was short of a hard hit it already carried. They also
found a winning line the ladder could not see, because every rung fights whatever
the trail puts in front of it — that became the dodge arm and then
[the quiet road](#finding--the-quiet-road).

## Building a deck

Every reward can be spent five ways: take a card, **copy** something already in
the caravan (charms and all), **burn** something out of it, **redeal** for
scrip, or **pass**, which pays scrip for walking on. A smaller deck draws what
it needs, so thinning is a play rather than a punishment. The offers are not
random: the pool reads the deck's tribe, keywords and statuses and leans that
way, while making sure a caravan short of bodies is shown bodies. Rarity sets
the floor; a lean never turns a rare into a common.

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

The last zone is a check on the deck rather than the play — measured, not felt —
so the game says so out loud. **THE CARAVAN** on the trail screen lists five
things a deck needs by then, each with what it has against what it wants: bodies,
a hard hit, a wall, mending, a lean deck. The worst is named on the trail, the
reward screen and at the trader, so nobody loses a run to find out what was
missing.

### Tempering, and where to find it

**Temper** puts +2 attack and +3 health on a card without growing the deck. It
lives in **three places at three prices** — the trader once a visit, a camp
working the fire instead of mending, a reward screen in place of the card. A
caravan carries **three tempered cards** and no more; without the cap a competent
pilot went straight to 67%. It started as one service at one node, a single point
of failure wearing a decision's coat, and was worth fourteen points alone; spread
across three doors it is worth two and being penniless is survivable.

### Scars, and tending them

A warden that falls comes back **Hurt** — half attack, half health, until it
sees a fight through. One that falls **while already Hurt** keeps a **scar**, one
of three, permanent until somebody takes it off; two is the most one warden can
carry.

The scar table had been in the file since the first week and **nothing ever
handed one out**: "TEND A HURT — 30" sat on the counter for nineteen iterations
unable to do anything. What found it was a pilot actually trying to buy
everything, which bought that one zero times. Hurt is the warning; a scar is what
happens if you send it straight back out. Escapable three ways — rest it, mend
it, or pay her.

### A hot meal, and why the trader has a bottom

**+1 attack and +2 health** on a card, no card added, **as many as you can pay
for** — 34 scrip, then 60, then 86, capped at twelve a run (far above where real
play lands; an average crossing eats five and a half). Sold at the trader *and*
on the reward screen, so scrip earned in a fight has somewhere to go.

It answers *"the trader is a one-purchase stop — prices or payouts?"* with
neither: four transcripts walked out holding 138–328 scrip, so she was affordable
and had run out of things worth buying. The counter needed a bottom, not a
discount. Two others exist for measured reasons — **the bell** is the one
run-wide upgrade money can buy (when tempering spread to three doors, penniless
measured level with well-funded), and **buying a card lets you leave one
behind**, because without that a purchase was a trap: a penniless caravan beat a
funded one by nine points, every card bought being one more between the deck and
the card it wanted.

## Beasts

Each one turns over at half health, once, and fights differently afterwards.
Mother Glacier calves and comes apart into shardlings, the White Stag stops
circling and starts running, the Hollow King's crown cracks, the Weeper stops
weeping, the Kettle Titan's boiler goes, and the Last Winter deepens.

**The Kettle Titan** took three passes and two were wrong, which is why the
argument is kept. It stokes — every trigger it gains an attack and keeps it —
and with Barrage that made the fight a timer. It was landing **three of every
five deaths in the last zone**.

*First pass:* cap the stoking at +6, draw it as **HEAT**, let frost vent the
boiler — bounded, visible counterplay. The death count barely moved. *Second
pass, measure why:* a caravan held frost gear on **23% of turns facing it**, and
on none at all if it had drafted no frost. A counter most players cannot reach is
a rule they read once and then lose to, so the room provides it — **A Handful of
Snow**, dealt at the start of that fight and nowhere else, returning to hand each
use and costing the turn. Frost in hand went to 99%, the card became the second
most played in the game, and the death count *still* did not move. *Third pass:*
so it was never only the answer. The beast carried the largest stat line in the
game **and** Barrage **and** Smackback **and** the climbing attack. Smackback is
gone — it punished the player for the only thing that ends the fight — and 92/8
came down to 84/7. It went from **36 of 61 late deaths to 6 of 54**.

**Endings.** A defeat draws what actually stopped you — the run remembers the
blow that took the leader, by name and well enough to draw the thing again. A
crossing lays out the caravan that made it, every card of it.

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

**`tests/.frostfell-arms.json` is committed**: an arm that runs stamps its
headline and sample there, and a reading that lived only on the machine that took
it starts blank in a fresh clone. No age counter — one churned the file every
check for a number git knows better.

**Two standard deviations, and the suite says so rather than the author
remembering to.** Twice running, a three-point reading at ±3.0 was written down
as "a direction" and evaporated at the larger sample: keeping a slot back +5 → +2,
the beast's rest +19 → +15. So every additive row prints `(noise: under 2σ)`
unless it clears twice its own band — and the band itself is now
[measured rather than derived](#rule--measure-the-band-do-not-derive-it).

**An ARM stamps; a MODIFIER does not.** "Six arms exist and three are stamped"
was a miscount, not rot. Eight knobs gate a section and every one writes a
reading — `FF_ABLATE`, `FF_COURSE`, `FF_MONEY`, `FF_LESSON`, `FF_PAIRS`,
`FF_PAIR`, `FF_NOWAVE`, `FF_NOSCARS`. Three cannot: `FF_RUNS` sets the sample,
`FF_HABIT` narrows `FF_ABLATE` and reports through its table, `FF_CONTRAST`
prints coverage and asserts nothing. **The suite reads the list off its own
source**, so the next knob cannot go unlisted.

---

## PART THREE — what has been measured

Everything below came out of the probe or the shot walk and is kept because it
changes what you would do next. Dead ends are named as such, so nobody drives
down one twice.

### FINDING — the ladder

Four pilots, each the one above it plus one more thing it knows how to do, so
the gap between two rows is that one thing:

| pilot | | worth |
|---|---|---|
| careless | takes the leftmost card, swings at the nearest thing | 9% |
| + the fight | denies schemes, answers a named wave, places bodies, holds gear | 26% (**+17**) |
| + the trader | spends well | 39% (**+13**) |
| + steering the pool | drafts to a course | 38% (−1) |

**The commitment is withdrawn.** For three rounds this file said the fight
*should* be the rung that matters and the trader was bigger every time. Rather
than write it a fourth time, the round that had to choose went looking for where
the money goes and then tried to cut it: the looking worked, the cutting mostly
did not, and both are under
[what the purse buys](#finding--what-a-bottomless-purse-is-buying).

What is left is a statement of what this game is rather than what it was meant to
be: **the fight is the rung that carries the skill and the trader is the rung
that carries the run.** The fight separates a player from themselves — the only
place a habit has ever priced above the band. The trader separates a good run
from a bad one, because money buys a choice of several individually-sufficient
things. Two different questions, both answered; the one attempt to force them to
the same size cost ten points across every rung including the beginner's.

**Steering prices at roughly nothing and that is not the courses' fault** — at
450 runs an arm all five beat declaring nothing and sit within two standard
deviations of each other. What prices at zero is the *drafting*: a pilot that
takes the best card on offer is already doing most of what steering can do.

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
pilot buying every one in every shop. From the other end, **any one of four
wares is individually sufficient**: a penniless pilot handed a bell, a meal or a
charm alone already beats one paying full price for everything. That is why
removing a single thing from a rich pilot costs nothing — the others substitute.
The gap is **redundancy, not compounding**, and no single cut closes it. What
shipped is the narrowest useful limit: the trader carries three charms a run,
each dearer than the last, and charms won elsewhere are not counted.

### FINDING — what the instrument cannot see

**It can price a teaching change after all**, and one round said it could not:
the claim was that the careless pilot is blind rather than slow. That is a claim
about the instrument and it was testable — a pilot identical to the careless one
except that it starts denying schemes once the game has TOLD it about one,
against controls that are never told and that always knew (210 an arm, ±2.1):

```
never told 7%   ·   told once 18%   ·   always knew 19%
```

**Being told carries eleven of the twelve points that knowing is worth.** The
limit was real for the pilot as built, not for the instrument.

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

For four rounds, at 180–210 an arm, attacked subtractively, additively and
through the mending ledger: **denial alone was worth 17–18 of the 20 the whole
set is worth**, keeping a slot back +2, everything else zero. Eight shapes were
measured against that, all tabled under
[DEAD ENDS](#dead-ends--everything-built-measured-and-thrown-away). **The ninth
looked like it moved it**, at 210 an arm:

```
                            set   denial alone   floor
before the telegraph        +17     17 of 17       7%
after                       +17      8 of 17       9%
```

That was reported as three standard deviations and it is not. The right band for
a difference of differences is ±4.7 on the derived formula, which makes nine
points **1.9σ** — under this suite's own bar. It survives anyway, but only
because the band itself turned out to be wrong; see below. The set is worth
exactly what it was, and no other habit clears its band alone (placement is the
best of them at +1).

**So the habits were turned on two at a time, which no arm had ever done.** All
fifteen pairs, 210 an arm, each measured as the pair against the sum of its parts
— `interaction = pair − none − (a − none) − (b − none)`.

Four measured rates go into that, so its band is twice a single row's — ±5.5 —
and nothing counts under 11.0. **Nothing reaches it.** The largest is holding
gear + keeping a slot back at **+6.2**, 1.1σ. Run four times as deep
(`FF_PAIR=holdGear+keepSlot`, 750 an arm) it reads **+2.0**. The standout
evaporated, exactly as keeping a slot back went +5 → +2 and the beast's rest went
+19 → +15. Three for three for the rule this suite adopted last round.

The cumulative ladder, best single first from a pilot that knows nothing (9%):

```
                deny  place  holdGear  reposition  wave  keepSlot
cumulative %     17     18       22        22       22      26
alone           +8.6   +1.9     +0.5      +0.0     +0.0    −2.9
```

Apart they sum to +8.1; together they are +17.6. That looks like nine points
living in combination, and at this sample it is not resolvable: the difference
between a set and the sum of its parts is built out of eight measured rates and
carries a band far wider than nine points.

**Why the board resists.** A scheme is the only thing on the table whose outcome
depends on what you do in the window between announcement and execution.
Everything else — where a body stands, when gear is spent, whether a slot is
free — is arithmetic the pilot compensates for elsewhere on the same turn.
Denial is worth what it is worth because it is the only **event**.

So a second event was built: **a wave that names its lane one turn out**, and
standing in that lane makes it *wait* — the answer takes its turn away, exactly
as denying a scheme does. It took three cuts to get there.

**Cut one — the wave arrives BEHIND the holder.** Ladder 34 → 23, placement
+1 → −1. Committing a wave to one lane concentrates the fell where a wave spread
across free slots did not: **adding a mechanic to the foes' side buffs the
foes**, the same lesson a non-solo scheme taught two rounds earlier. Rejected.

**Cut two — only the FRONT slot holds it.** The best ladder of the three, nearly
shipped, and it fails a different check: *declaring a course must never be worse
than declaring none*.

```
                        no course   best course   (210 an arm, ±3.3)
no telegraph                  36%     44% (cold)
front-only hold               44%     41% (cold)   ← invariant broken
anywhere-in-the-lane hold     39%     44% (gear)
```

The front-only rule is worth **+8 to a run carrying no course and nothing to any
of the five**, which is not a decision but a tax on a narrow pool. A mechanic
that only rewards the widest possible deck makes the game's own specialisations
worse. (The pool explanation for *why* is refuted below; the invariant break is
reason enough on its own.)

**Cut three — anyone anywhere in the lane holds it.** Shipped: two points of the
fight rung against cut two, and the courses back on top. Measured the only way
that means anything, same build and same seeds with the flag down (`FF_NOWAVE`,
210 an arm):

```
                       careless   fight   trader   steering   total
telegraph off              8%      +16      +14        −1       29
telegraph on (ships)       9%      +17      +13        −1       29
```

Read honestly: **the ladder is the same length and every rung moves by one.**
The version of this table published a round earlier said the floor rose four and
the ladder lost three, and that was a cross-build comparison — see
[the trader's rung](#finding--the-traders-rung-never-fell). What survives is the
mechanism rather than a number: it is the second telegraph, it is shaped like the
first, and neither of the things that sank the earlier cuts — a stronger fell, a
punished specialist — survived into the shipped one.

### RULE — measure the band, do not derive it

**Every band this suite prints is the textbook one for a proportion, and it
assumes the arms are independent samples. They are not** — every arm plays the
same seeds, so two arms differ only by what the pilot did with an identical
trail. Paired samples make the band on a *difference* narrower than the formula
says, and a band that is wrong in the safe direction is still wrong: it rejects
real results.

So `FF_PAIRS` measures it. The same comparison at five seed bases, and the
spread of the answers *is* the band — no formula, no independence assumption:

```
a gain (denying schemes vs none)   8.6  8.1  7.1  9.5  13.3   sd ±2.4  (±3.9 derived)
an interaction (deny + keepSlot)   3.3 −0.5  6.7 −2.9  −2.9   sd ±4.2  (±5.5 derived)
```

Run again at 750 an arm on the pair that mattered, the interaction band reads
±1.6 against ±2.9 derived. **So the derived band is 1.3–1.9× too wide** across
two samples. Not a rounding error and not a revolution, but enough to change
verdicts at the margin — and the margin is where every argument in this file
happens. The fight finding above is one: denial's fall from 17-of-17 to 8-of-17
is 1.9σ derived and **2.6σ measured**. It survives, on a number nobody had
checked.

Two wrong versions came first and both are instructive. One measured three bases
and got ±0.7 — five times too wide, and far the most quotable number of the
round. Five bases give ±2.4: **a standard deviation from three points is not a
standard deviation.** The other measured an interaction of exactly 0.0 at all
five bases and called the band 110× too narrow; it had picked the first two
habits in the list, and `reposition` is a switch over an empty block, so its arms
are byte-identical and the interaction is zero by construction. A band of zero is
a broken instrument, not a narrow one. The assertion that caught it stays in the
suite.

**On the measured band no pair clears** — 2σ is ±8.3 and the best is +6.2; run
four times deeper that same pair reads +2.0 against ±3.1. The pairs answer is
unchanged either way, and every band this file has ever quoted is now known to
be an upper bound.

### FINDING — the trader's rung never fell

The telegraph was reported as taking the trader from +18 to +13, and the five
points were explained away in one sentence as floor compression. Both halves
were wrong, for the reason this file has now named four times: **the +18 came
from a different build**, a round earlier.

Same build, same seeds, one flag down (`FF_NOWAVE=1`, 210 an arm, ±3.3):

```
rung                     off     on     odds ratio off → on
careless (the floor)      8%     9%
the fight                +16    +17      3.63 → 3.55
the trader               +14    +13      1.94 → 1.82
steering the pool         −1     −1      0.96 → 0.96
```

The telegraph moves the floor by **one point, not four**, and the trader by one.
There were never five points to explain.

The compression arithmetic is printed now rather than gestured at: hold every
odds ratio at its flag-down value — odds, not points, because points cannot stay
constant when a floor moves — put the floor where the telegraph put it, and read
off what each rung would be worth if *only* the floor changed. **Fight +17,
trader +15**; they read +17 and +13, so compression accounts for the fight rung
exactly and over-predicts the trader by two, inside the band.

**The finding is about the instrument.** A rung compared across builds is not a
measurement, and the sentence explaining the gap was explaining an artefact.

### FINDING — courses do not starve the board

The front-slot-only telegraph paid a courseless run +8 and every course nothing.
The suspicion that raised was structural and older than the telegraph: a course
narrows what you draw, so perhaps it narrows the pool below what the board's
geometry needs. Measured directly — on every turn a wave has named a lane,
whether that lane is held, and whether the pilot *could* hold it (a creature in
hand and a free slot in the lane). 450 runs an arm, about 6,000 live telegraphs
each:

```
              held   could   bodies standing
bodies         84%     96%        3.4
scrap          84%     93%        3.4
hearth         82%     94%        3.2
cold           82%     94%        3.2
no course      78%     92%        3.0
gear           76%     91%        2.9
```

**Declaring nothing is second-worst.** Every course answers a named wave more
than nine times in ten and the two that lean on bodies answer *more* often than
an open pool, so a supply explanation for the +8 is dead. The +8 was real at 2.4σ
and now has no explanation, which is where it is left: the version that produced
it does not ship, and inventing a second story for a number measured on rejected
code is the move this round spent its time undoing.

### FINDING — the quiet road

Walking past a fight measured **−16**, which does not describe a decision: a fork
where one side is always wrong is furniture with a signpost on it. The game
punished ducking and nothing paid for it, so every quiet place now pays in what
that place is *for* — the camp in rest, the rest stop in choice (four blessings,
not three), the shrine in the blessing costing nothing. None of them is scrip or
a card, which is what a fight gives.

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
fewer fights. Walking past everything has come in from −16 to −8 and ducking only
when hurt costs 6 — priced wrong rather than unplayable.

### FINDING — where the mending actually comes from

Read the caravan's wound total on every pass of the run loop, attribute each
change to the transition it happened on. **87% of every point of damage taken
gets mended**, and:

```
a fight ENDING (the fallen come back whole)   63%
camp 16%   ·   shop (mend-all) 15%   ·   rest/event 6%   ·   warmth 0%
```

The suspect list was wrong. Not camps, not meals, and **warmth does not register
at all** — the biggest entry is a warden *falling*, because its damage is wiped
to nought before it comes back Hurt. **Two thirds of the "mending" in this game
is not healing; it is a knockout being undone.** That is why the line is 7%
wounded at the forks where it should be deciding, why every rule paid in mending
has been dead on arrival, and why keeping a slot back for warmth prices at
nothing: there is nothing for it to save you from.

Five dials were tried and are tabled under DEAD ENDS. The one that shipped — the
beast's night's rest coming out — moved the ledger 92% → 87% and the fight-ending
share 65% → 63%, and moved the *win rate* not at all. **The clearest evidence
that this ledger and the ladder measure different things.**

### FINDING — read state, don't intercept calls

Six instruments in six rounds measured nothing, and they failed in four ways
worth knowing before you build a seventh.

**Wrapping an export sees nothing.** `FF.buy`, `FF.takeCard` and `FF.triggerUnit`
are exports; the game calls the module-scoped versions internally. Read the state
instead — the deck, the board's counters, the price at the decision point.

**A stub that drops state lies quietly.** `save`/`restore` carried the transform
and not the style, so one faded draw silenced the contrast check for the rest of
the frame: 96% of the text unexamined, and it reported clean.

**A perfectly instrumented table can answer a different question.** "Nobody buys
this ware" was three findings wearing one face — bad, unaffordable, never taught
to want. "Nobody plays this card" was a table about the *pool*: per copy carried,
the three cards at the bottom for four rounds were mid-table. And the touch check
measured stage units rather than CSS pixels for seventeen rounds.

**A band can be derived correctly and still be wrong.** Every band here assumed
independent arms and the arms share seeds; see
[measure the band](#rule--measure-the-band-do-not-derive-it).

### RULE — what a good card looks like

Written down before the cards were, after two rounds of building cards, measuring
them and cutting five of six. In full above `const CARDS`; in short, **a good
card makes the player choose between two things they want, on the board,
differently each turn.** Four tests: it asks a question answered differently on
different turns, the question is asked on the board, it costs something the
player wanted, and it does not answer a question the board already asks. If you
cannot say what it costs, it is not finished. The round that wrote it built three
cards against it and all three shipped — the first content round in three that
did not cut most of what it made.

### FINDING — schemes are most of what the fight is worth

Denying schemes is the only fight habit that has ever cleared the band on its
own. That is not the board being fake — the locked-deck arm settles that — it is
that the board's other decisions are cheap individually and the scheme is not.

Three of them: `mark` (deny by sliding the named warden, which needs a slot to
slide into), `gather` (deny by leaving no free slot — the one moment where
killing something is the wrong play), `chill` (deny by emptying the lane). Deny a
gather and the foe threw its whole turn at nothing; deny a chill and you stopped
only the extra. The variety is in *how*, not *how many*.

**A scheme must be `solo`** — the foe's turn rather than an effect on top of its
swing. A non-solo scheme is a buff to the fell: adding one took zone-two arrivals
from 156 in 210 to 127 and the careless floor from 6% to 4%.

Spreading a scheme onto a new foe breaks any test that assumes one way of
denying: the tutorial suite asserted that emptying the player's side denies
whatever the opening rolled — true of `mark` and `chill`, false of `gather`.
**Deny the thing the scheme actually needs.**

### RULE — the room rule

Three states, and it is the rule the board is built around:

- **two or more free slots** — the whole line takes Regen 1
- **exactly one** — cramped; nothing
- **none** — Frost 1 on somebody, and they lose their next trigger

It took three shapes. As a two-state rule it measured **exactly +0** at 750 runs
an arm — a measured zero, not a noisy one — and the third state is what made
keeping a slot back a decision instead of a habit. It is symmetric but the sides
do not meet it equally often: the foes' line runs emptier, so in practice it is a
rule for one side of the table. That asymmetry is intentional.

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

Mitewing — a tier-1 trash mob, four health, two attack — was in the top two of
the late-zone death table for five rounds. Counting each foe's *share of the
damage the fell actually swings* (tick rate over counter, times attack) explains
it: a cheap Aimless body with a one-counter walks past every wall and swings
every turn. A death table ranks who landed the last blow; a damage-share table
ranks who did the work. Keep both.

### FINDING — Hearth, and a fact about how damage works

Hearth read bottom of the course table for several rounds through five attempts
to fix it. The pool was not leaning — 13 hearth cards against 14 frost and 13
scrap. The rule was: Regen is a **threshold good**. Healing that does not outrun
the incoming does nothing at all, and healing that does outrun it makes the
warden unkillable — there is no middle, so every tuning pass either did nothing
or broke it. A fact about the game's damage, not about Hearth.

### FINDING — the shot walk is still the only thing that sees

Three assertions over eight shapes is 668 checks and none has ever found what a
person finds by looking — the clipped collection names, the collided trail
labels, the dim question mark all came from opening a PNG. Three screens nobody
had examined at 2400x1080 were opened and all three were wrong: **the shrine**
drew both buttons on the stone's foot and its shadow with the explainer
half-swallowed by the snow bank; **the camp** was a flame hanging in empty air
with no pit, logs or glow, on the one screen subtitled *one quiet hour before the
road*; **the rest stop** has no fault to fix and one to record — on a 20:9 stage
its cards cluster in the middle third and the bottom half is empty snow, because
it is laid out for 16:9 and merely survives being stretched.

At 2400x1080 **six screens use the width** (battle, trail, collection, leader,
victory, the ware row) and **five ignore it** (title, camp, rest stop, shrine,
event, ending). The five are all one shape — a title, one piece of art, a centred
row of buttons — with three things to say and no fourth. **The width is used by
the screens with something to spread**, which is the right answer rather than a
gap.

### FINDING — contrast, the third thing nobody was checking

Touch found seven controls too small; type got a floor and found five
collisions. Nothing had ever asked whether the text could be **seen**.

The first pass found exactly one thing, which was suspiciously few — and it was.
The stub's `save`/`restore` carried the transform and not the *style*, so one
`globalAlpha = 0.35` stayed 0.35 for every draw after it and the check, which
skips faded text, skipped almost all of it. **Thirteen of fifteen strings on the
title screen were never looked at.** Fixed, coverage went 18 texts a frame → 457.

Widening it needed the right model, because **every glyph here is outlined**:
`txt` strokes a dark outline behind the fill unless told not to, so an outlined
glyph reads against its own outline rather than what is behind it — a naive
check called a legible white name over an orange creature 2.2:1. Both are
measured and the worse one answers. Ratios are real WCAG, 4.5:1 body and 3:1
large.

With coverage 25× wider and the model right, **the palette holds**. The one
thing it ever caught — the collection's undiscovered `?` at 3.4:1 on a phone —
is fixed, and re-introducing it makes the check fire, which is how you know it
has teeth.

**What the raster's resolution costs**, across 3,676 strings at eight shapes:
7 (0%) sit inside a single 8-unit cell, 3,669 (100%) straddle one, and 97 (3%)
of those cross two or more *real* grounds. A line of body type is 13 units tall
and tens wide, so essentially everything straddles; the 97 are the interesting
ones — a caption half on a panel and half off. On those the anchor lookup was
never *wrong* (its cell was always one of the real grounds) but it was one of
two answers picked by where the anchor landed. Quiet rather than safe, so the
check takes the **worst** ground a string covers.

"Covers" needs a share, because the box is approximate in both directions — the
stub does not track `textBaseline`:

```
share threshold   0.05   0.10   0.15   0.25   0.40
strings failing     16      7      0      0      0
```

The sub-15% grounds are band artefacts and they are identifiable rather than
assumed: `"BRAMBLEWICK"` and `"HEARTHKIN"` on `#ffd9a8`, warden names on their
card's dark slab with the top of the band reaching into the creature above.
**0.25 ships**, and the thresholds either side of it agree.

### FINDING — smaller things, settled

- **Nothing is half-tested.** 653x280 is a folding phone's *cover* display and
  the type check used to skip it with a note — at 280 tall the floor is 23 stage
  units and the leader screen could not hold seven winters in a fixed 44-unit
  row. Excluding a shape with a documented reason is right once and a habit
  twice, so the row measures its own contents and the exclusion is gone.
- **Money is worth about sixteen points**, penniless to bottomless — the widest
  single lever in the game, and now understood rather than just measured.
- **A hot meal** is the ware everyone buys at every price step. It is doing the
  trader's job and that is allowed.
- **Every card is played** in a full sweep, all 58 of them.
- **Scars** cost the careless pilot about a point and explain none of the course
  table.

---

### DEAD ENDS — everything built, measured and thrown away

The most valuable half of this file: each was built, run against the probe and
removed, and the number is why.

**Eight shapes tried against "the fight is one decision"**, at 180–210 an arm
(baseline fight +16 / ladder 30):

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

The last two fail for opposite reasons — the first made the foes stronger, the
second made a wide deck stronger — and both are tabled under
[the fight](#finding--the-fight-is-one-decision-and-some-decoration).

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
  instrument; it needed the raster first.
- **An age counter on the stamped arm readings.** Churned the file every check
  for something git already knows.
- **A seed band from three samples.** ±0.7, and ±2.4 from five. Three points do
  not make a standard deviation.
- **A pair interaction measured on `reposition`.** Its arms are byte-identical,
  so the interaction is 0.0 by construction and the "band" came out 110×
  narrower than derived.

### FINDING — nobody had played it on a phone

Twenty-three rounds of shots were taken in a desktop Chromium — a game built
landscape-first for a thumb, never photographed on anything shaped like one. Two
rounds of handset shots turned up two classes of bug no check covered.

**Touch** was compared against 40 *stage units* for seventeen rounds. The stage
is up to 1760 wide and a phone 667 CSS pixels across, so every target was half
the size the check believed: seven controls under 44px, PASS twenty-four tall.

**Type** was not checked at all and was rendering at six and a half pixels.
`TEXT_MIN_CSS = 9` floors every size in `txt()` — one line, in the one place
every string goes through, inert on a desktop. Flooring it broke the *layout*
three ways, because every line step was a number chosen for the size the text
used to be: `wrapText` and `fitText` go through `textSize()` now and every
hardcoded step through `lineH(size, step)`. The help pages were a fixed grid with
a hard five-line slice that cut the rules off mid-sentence, and are measured and
flowed now. **The supported floor is a phone held sideways**: 375 CSS pixels.

### FINDING — the probe was half particle effects

Forty per cent of the balance probe's samples were `fx.pop` and `fx.burst`,
building floating text and particle objects — sixty and four hundred at a time —
for runs with no screen attached. Gating the particle systems on having a canvas
took the suite from 26.7s to 9.4s, and the sample from eight runs a tribe (±9.7,
too wide to stand behind) to thirty (±5.0) in less wall time than the old took.
