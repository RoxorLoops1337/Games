# FROSTFELL — the design record

Everything below came out of the probe or the shot walk and is kept because it
changes what you would do next. The reference — the rules, the code, the tests —
is in [README.md](README.md).

**Three labels, and every entry carries one.**

| | |
|---|---|
| **FINDING** | true, and it changes what you would do next |
| **RULE** | settled, and it constrains what comes next |
| **DEAD ENDS** | built, measured, thrown away — the most valuable half |

**The rule this file lives by, replacing the 1000-line cap on the README:**
*every entry states a number, and an entry that cannot state one gets cut.* A
line count is a proxy for readability and it failed as one — holding the README
at exactly 999 for two rounds cost the reference section real detail while the
design record kept growing, which is precisely backwards. A record of
measurements should be allowed to grow; what it may not do is accumulate
sentences that are not measurements.

---

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

That was reported as three standard deviations and it is not. On the
[measured band](#rule--a-band-is-measured-and-it-applies-to-every-number-here) a
difference of two gains carries ±4.3, which makes nine points **2.2σ** — it
clears, but by a margin that took two rounds of arguing about the band to
establish rather than the three sigma it was announced as. The set is worth
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

**Cut three — anyone anywhere in the lane holds it.** Shipped, and priced at
roughly nothing — see [what it actually does to a turn](#finding--the-telegraph-is-feedback-not-a-decision).
Measured the only way that means anything, same build and same seeds with the
flag down (`FF_NOWAVE`, 210 an arm):

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

### FINDING — the telegraph is feedback, not a decision

`FF_NOWAVE` said the wave telegraph is worth about nothing: floor +1, fight +1,
trader −1, ladder unchanged. That is not a verdict on its own — a mechanic can
be worth keeping for what it does to a turn rather than to a win rate — but
"it feels better" is not evidence. Here is evidence, across 210 runs and 2,348
fights:

```
a lane is named on                                    2,837 of 31,967 turns   (9%)
deployments while one is live that go somewhere
  the pilot would not otherwise have put them            37 of 728            (5%)
waves that turned around and waited, per fight
  a pilot that reads the telegraph                     0.82
  a pilot that never reads it                          0.63
```

**Three quarters of the effect is free.** Reading it is worth +0.20 held waves a
fight; the other 0.63 happens to everybody, because on a two-lane board
"somebody is standing in this lane" is a condition the board has usually already
met. The mechanic asks a question the geometry has answered.

That is also the structural reason it cannot be tuned into a decision without
breaking something else. Loosen the requirement and it is trivially satisfied;
tighten it to the front slot and it becomes a tax on a narrow pool, which is
exactly the cut that broke the course invariant. **The decision space is
squeezed shut between the two.**

**It stays, relabelled.** It fires 0.8 times a fight, it is legible, it costs
nothing in balance, and it is the most frequent named event on the board after a
scheme. What it is not, and what this file previously called it, is *the second
event* — the fight is still one decision, and the telegraph is the feedback
around it.

### RULE — a band is measured, and it applies to every number here

A round proved the printed band wrong and then left every number in the file
quoted against it. This is the correction, and it has two halves that point in
opposite directions.

**The formula was applied to the wrong quantity.** `sqrt(p(1−p)/n)` is the
spread of ONE arm. Almost nothing here is one arm: a rung is a *difference* of
two, an interaction is built from four. A difference carries √2 times a row's
band and an interaction 2×, and for six rounds both were quoted against a single
row's — **too narrow**. That half is arithmetic and certain.

**The arms are not independent.** They play the same seeds, so two arms differ
only by what the pilot did with an identical trail, which makes the real band
narrower than any formula says — **too wide**. That half has to be measured.

`FF_CALIBRATE` measures it, at 210 an arm:

```
a GAP (denying schemes vs none), 12 bases, 5.2 to 14.8
   measured ±3.03 · derived ±3.90 for two arms · factor 1.29x
an INTERACTION (deny + keepSlot), 12 bases, −4.3 to 10.0
   measured ±4.29 · derived ±5.52 for four arms · factor 1.29x
```

Both shapes give **1.29**, which is the first encouraging thing about this whole
line of work. **Net: the suite used to quote ±2.76 for a gap; the truth is
±3.03, so the old gates were 10% too GENEROUS** — the opposite direction from
what the previous round announced, and by a tenth rather than a factor.

**It took five wrong versions to get one number, and every one of them was
confidently reported.** Three bases gave ±0.7 (five times too wide, and easily
the most quotable figure of its round). An interaction measured on `reposition`
gave exactly 0.0 at every base, because `reposition` is a switch over an empty
block, so its arms are byte-identical and the interaction is zero by
construction — a band of zero is a broken instrument, not a narrow one, and the
assertion that caught it stays in the suite. A measured two-arm band was
compared against a derived one-arm band and the ratio reported as a correction.
And **two independent five-base estimates of the same factor came out 1.63 and
1.13** for a gap, and 1.33 and 0.72 for an interaction — pointing in opposite
directions, which is what settled the method: a five-point standard deviation
carries about a third of itself in error. Twelve bases, and the two shapes
agree.

**A rule out of it:** *the number of samples a spread is estimated from is part
of the estimate.* Five is enough to notice an effect and not enough to correct
by.

The factors are stamped in `.frostfell-arms.json` and **every band in the probe
divides by them** — `BAND.row`, `BAND.gap`, `BAND.inter`, `BAND.set`, one per
shape. Re-run against the corrected band, of the three verdicts sitting nearest
the line:

| arm | quoted before | measured now | verdict | changed |
|---|---|---|---|---|
| `FF_ABLATE=60` | ±3.0 | ±3.3 | denial **+7** against 2σ = 6.6 — clears by 0.4 | no |
| `FF_LESSON=1` | ±2.1 | ±2.3 | being told **+6** against 4.6 | no |
| the dodge arm | ±3.3 | ±3.6 | walking past **−8** against 7.2 — clears by 0.8; ducking-when-hurt **−6** does not | no |

**None of the three.** A tenth is not enough to move a verdict that was not
already sitting on the line, and none of these were. **That retires the worry**:
the file's conclusions were not resting on a broken band. It is worth having
established with numbers rather than assumed in either direction — and worth
noticing that denial, the one finding this whole project rests on, clears its
own bar by four tenths of a point.

### FINDING — what would settle the missing nine points, and what it costs

The set of six habits is worth +17.6 and they sum to +8.1 apart. That difference
is built out of seven arms and its band is **±9.6** at 210 an arm, so +9.5 is
under 2σ and always was.

The suite prints the sample that would settle it rather than shrugging: **850
runs an arm, 4.05× the usual** — twenty-seven arms, twenty-three thousand runs.
That is affordable, so it was run.

```
                     210 an arm        852 an arm
apart                    +8.1              +11.5
together                +17.6              +15.0
difference               +9.5   ±9.6        +3.5   ±4.8
```

**The gap shrank with the sample, which is what a null looks like.** Nine points
at 210 an arm, three and a half at 852, both inside their bands — and settling
+3.5 would now need 6,218 an arm, another 7.3× on top. There is no hidden
combination. **The habits add.**

That closes the thread the pairs table opened: no pair beats its halves, the set
does not beat its parts, and the fight is one decision with a lot of arithmetic
around it.

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
[a band is measured](#rule--a-band-is-measured-and-it-applies-to-every-number-here).

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

**Three constants, all three swept.** The cell size, the coverage share a ground
must reach to count, and the vertical band around the anchor are numbers
somebody picked, and one round swept exactly one of them:

```
FF_CELL         2    4    6    8   12   16   24        clean 6–16   (ships 8)
failures       16   16    0    0    0    0    2
FF_SHARE     0.05 0.10 0.15 0.25 0.40 0.60             clean ≥0.15  (ships 0.25)
failures       16    7    0    0    0    0
FF_BAND     ±.15 ±.25 ±.35 ±.45 ±.55                   clean throughout (ships ±0.35)
failures        0    0    0    0    0
```

**The band does not matter, the share has a floor, and the cell has a window
with the shipped value in the middle of it.** So the clean bill is not a
coincidence of three numbers — but it is not unconditional either, and what
surfaces at every edge is the same handful of strings: `"BRAMBLEWICK"`,
`"HEARTHKIN"`, `"FROSTBORN"` — warden and leader names whose measurement band
overlaps the creature drawn above them. At a fine cell they read against the
creature (`#e8873a`, 1.2–2.2:1), at a coarse one against the card (`#ffd9a8`,
1.1:1), and every one carries a dark outline that makes it legible. **Which
colour wins is decided by resolution, and that is the honest limit of a raster
this coarse.**

The sweep also found a real bug in the instrument: the band was written as
−0.38/+0.28, guessing at an alphabetic baseline, when `txt` sets
`textBaseline = 'middle'` for **every string in the game**. It looked a tenth of
a line too high on every label in the file. It is symmetric now.

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
