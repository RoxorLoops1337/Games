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

**Two parts here and a third file.** Part one is the reference, part two is the
code, and **[DESIGN.md](DESIGN.md) is the design record** — every FINDING, RULE
and DEAD END, with the number that made it one.

That split replaces a 1000-line cap on this file, which had become a bad rule:
holding it cost the reference real detail two rounds running while the design
record kept growing, which is backwards. **This file stays under 500 lines
because it is reference and has to be readable; the record is allowed to grow,
and every entry in it has to state a number.**

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
  to be one gap, and [that was the problem](DESIGN.md#rule--the-room-rule).
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
[the quiet road](DESIGN.md#finding--the-quiet-road).

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
[measured rather than derived](DESIGN.md#rule--a-band-is-measured-and-it-applies-to-every-number-here).

**An ARM stamps; a MODIFIER does not.** Nine knobs gate a section and every one
writes a reading — `FF_ABLATE`, `FF_COURSE`, `FF_MONEY`, `FF_LESSON`,
`FF_PAIRS`, `FF_PAIR`, `FF_NOWAVE`, `FF_NOSCARS`, `FF_CALIBRATE`. Three cannot:
`FF_RUNS` sets the sample, `FF_HABIT` narrows `FF_ABLATE` and reports through its
table, `FF_CONTRAST` prints coverage and asserts nothing. **The suite reads the
list off its own source**, so the next knob cannot go unlisted.

The contrast check has three constants of its own — the raster cell (`FF_CELL`),
the share of a string a ground must cover to count (`FF_SHARE`), and the
vertical band around the anchor (`FF_BAND_UP`/`FF_BAND_DN`). All three are
overridable so they can be swept; what the sweep found is in
[DESIGN.md](DESIGN.md#finding--contrast-the-third-thing-nobody-was-checking).
