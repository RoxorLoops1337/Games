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

**Two rules, and neither of them is a line count.**

*1. Every entry states a number, and an entry that cannot state one gets cut.*
A line count is a proxy for readability and it failed as one — holding the README
at exactly 999 for two rounds cost the reference section real detail while the
design record kept growing, which is precisely backwards. A record of
measurements should be allowed to grow; what it may not do is accumulate
sentences that are not measurements.

*2. An entry a later measurement contradicts is REWRITTEN IN PLACE. Never
appended to, never left standing next to its own correction.*

The second rule is the one that decides whether this file is still useful at
2,000 lines, and it is the one that was missing. Rule 1 only stops the file
filling with prose; it does nothing about the far worse failure, which is a file
where every entry states a number and a third of the numbers are superseded.
Nobody reads a design record front to back — they grep it, land on one entry, and
act on it. An entry that was true four rounds ago and is quietly wrong now is
therefore not neutral, it is a trap, and appending a correction underneath it
does not spring the trap for a reader who never scrolls that far.

It has already bitten twice in one round. Two entries below were rewritten
head-to-toe rather than annotated: *rarity carries no information* had shipped a
card change that the next round's ladder disproved, and *the probe can be 2.6x
faster* projected a speedup that came in at 1.7x when it was actually built. Both
now read as what is currently true, with the retracted claim kept **inside** the
entry as the thing that was wrong and why — which is the part worth keeping.

**The mechanical half, which one round ago was written off as impossible.**

"Rule 2 cannot be checked by a script" was wrong, and it was wrong because it
aimed at the hard question instead of the useful one. No script can know whether
an entry is still *true*. But rule 2's failure mode is not subtle and it is
always the same shape: **two entries about the same thing, one of them stale.**
That is checkable.

So every entry carries a `topic:` key, and the suite requires them to be
**unique**. Writing a second entry about the ladder now fails `npm run check`,
and the only way through is to fold it into the first — which is precisely what
rule 2 asks for. It is not a freshness proof; nothing can be. It removes the
failure mode that actually happened three times in one round, which was a
correction sitting *next to* the thing it corrected instead of inside it.

Rule 1 is checked the same way: every entry must contain a digit. Prose about a
measurement is not a measurement.

---

Everything below came out of the probe or the shot walk and is kept because it
changes what you would do next. Dead ends are named as such, so nobody drives
down one twice.

### FINDING — which entries the unlock bug actually reached, counted rather than waved at

`topic: unlock-audit`

Last round found that unlocks accumulated across runs, so early arms played a
smaller card pool than late ones, and one table got "not comparable" written next
to it. There are **38** entries. The right question is which of them the bug could
physically reach, and that is not a judgement call — it is a curve.

Reconstructing the pre-fix behaviour (clear `G.meta.found`, then play the
careless arm and watch it refill):

```
after   1 careless run  :  3/12 unlocked
after   4 runs          :  6/12
after  16 runs          :  8/12
after  79 runs          :  9/12
after 128 runs          : 12/12   ← saturated, and it never moves again
```

**The pool stops changing after 128 runs of one process.** Every section of the
probe runs in file order, and the ladder is the first: at `FF_RUNS=70` it plays
840 runs before section two begins, at the default `FF_RUNS=30` it plays 360. So
**every arm outside the ladder started at run 361 or later and was measured on a
fully saturated pool.**

**1 of 38 entries was affected, and it is the ladder** — already rewritten, and
re-measured on the fixed footing. The reach of the bug *inside* the ladder is
also exact: at `FF_RUNS=70` runs 1–128 of the careless arm's 210 (61% of it) and
nothing else; at `FF_RUNS=30` the whole careless arm plus the first 38 runs of
the fight arm. That is why the careless rung moved most when it was fixed (7% →
10%) and the trader and steering rungs barely moved at all.

One entry still **cites** ladder rungs rather than measuring its own
([the fight is one decision](#finding--the-fight-is-one-decision-and-some-decoration)).
It survives: it is about effects of 13–18 points against a rung the fix moved by
1–2. A second one — "the trader's rung never fell" — has been **cut**, because
the whole argument it was having turned out to be inside the rung's own band.

**The generalisable part is the shape of the check, not the answer.** A bug in
accumulated state has a reach that can be measured — how many runs until it stops
mattering — and once you have that number, "which findings are affected" is
arithmetic over the section order rather than a re-run of everything. Re-running
all 38 would have cost hours and found one.

### FINDING — where a run is actually decided, and it is not the deck

`topic: variance`

Two rounds of card work ended in "not supported": 56 of 57 cards are
indistinguishable from the pool median, and three cards built specifically to
break that straddle three ordinary wardens. Both are findings *about cards*. The
question underneath had never been asked — **where is a run's outcome decided at
all** — and it turns out to be separable into three factors exactly.

The trick is that `give` pushes cards onto a locked deck in list order, so **the
same cards in a different order is the same deck with a different shuffle**, on
the same seed, against the same trail. No engine change and no second RNG. That
splits what the seed bundles together into the trail and the draw.

6 decks x 3 draw orders x 108 trails = **1,944 runs**, each cell one deterministic
run, so every point of variance belongs to a factor rather than to noise:

```
                                   1,944 runs      648 runs
the TRAIL  (map, foes, rewards)      16.2%          21.6%
the DECK   (which cards you hold)     4.8%           3.8%
the DRAW   (what order they come)     0.1%           0.2%
everything left (interactions)       78.9%          74.4%
```

Both depths are shown because the ordering is the finding and it is stable across
a 3x change in sample. **The trail decides three to six times more than the deck,
and the draw order decides nothing at all** — best draw order 7% against worst 5%,
on a factor that gets three bites at every deck. Best deck 16% against worst 0%,
so decks do differ; they just differ far less than trails do.

**Which answers the question the card rounds could not.** Cards do not matter
because they are competing against a trail that matters five times more and an
interaction term that swamps both. To make cards matter you would have to shrink
the trail's share — fewer forced fights, less variance in what a zone puts in
front of you, more of the run's difficulty coming from a knob the player sets.
That is a change to the map, not to the pool, and no number of new cards reaches
it.

**The 79% is the honest headline, not a leftover.** At one run per cell the
three-way interaction cannot be separated from anything else, so that figure is
"this deck, on this trail, in this order" — a *matchup* term. A game whose
outcome is three quarters matchup is not a deck-strength game and was never going
to behave like one. That is a design statement rather than a bug, and it is the
first time this file has been able to make it.

### FINDING — the ladder cannot read anything smaller than six points

`topic: ladder-band`

Every band in this file has been measured rather than derived — for a gap, for an
interaction, for a set. The one number nobody had done it for is **the headline**:
the ladder total, which is supposed to say whether the game rewards skill.

The whole ladder, run at five seed bases, 210 runs an arm:

```
totals      27, 27, 26, 33, 28    sd ±2.8   → 2σ = ±5.5
the fight    9, 12,  9, 13, 11    sd ±1.8
the trader  19, 17, 13, 15, 13    sd ±2.6
steering    -1, -2,  4,  5,  4    sd ±3.2
```

**The instrument cannot detect a change smaller than 6 points in the total.** The
26–32 target set last round was chosen to accommodate three readings and turns
out to be almost exactly 2σ — right by luck, not by measurement, and now right by
measurement.

Two consequences, and they bind everything above:

**No single-point move anywhere in this file means anything.** Not a rung, not a
total, not a floor. Several rounds have reported one and reasoned about it.

**"Steering prices at zero" is not a finding.** Its five readings run −2 to +5
with sd ±3.2, so "worth nothing" and "worth five points" are the same measurement.
The honest statement is that steering has never been resolved, and settling it
needs about **4x this sample** — which is now affordable, since the probe is
pooled.

### FINDING — the trail is the lever, and it is the BOSS, not the fights

`topic: trail`

The trail decides **32.5%** of how far a locked run gets and the deck **4.4%** —
six times the lever, and untouched in forty rounds. So one concrete change was
made to what a zone puts in front of you, and it is the wrong one, which is the
useful part.

**What was built and reverted.** Every foe in an encounter is `pick(src)`, an
independent uniform draw from the zone's tiers, so a three-foe fight can roll
three of the heaviest bodies in the pool or three of the lightest and nothing
notices. Encounters were drawn to a strength BUDGET instead — same mean, variance
held inside 18%:

```
budget off    trail 32.6% of the zone-reached variance
budget on     trail 32.5%
```

**Nothing. Not a small effect — nothing.** Which rules out the whole class, and
that is worth more than a change that moved 2 points would have been.

**Where it actually is.** Fixing the boss per zone instead of drawing it:

```
boss drawn per run   trail 32.5%
boss fixed per zone  trail 13.9%
```

**Over half the trail's influence is which beast waits at the end of a zone.**
One draw per zone, against the hundreds of foe draws inside it — and the reason
is leverage rather than count: a zone's boss is the gate, so its identity decides
whether the zone is passed at all, while an ordinary fight is one of seven.

The comparison is honest about its confound: fixing the boss to a single member
of the list also moved the mean (1.31 zones to 1.05), because that member is not
the average beast. The *variance* effect is far too large to be that — a mean
shift cannot halve a factor's share — but the clean version of this experiment
draws the boss and then scales it toward a common strength, which is the change
to make and is not made here.

The code is reverted rather than shipped, on this file's own rule: **a mechanic
that measures zero on the thing it was built for is not free** — it is a rule
every future change has to reason around. Same verdict as `SKILL.shelter`.

### FINDING — the deck share was mine, not the game's

`topic: variance-decks`

The variance arm's first cut used **six hand-picked decks**, chosen to span what I
believed the space was: one weak starter, one strong mid-run caravan, a frost
pile, a scrap pile. That is picking the fish before the trip, and it inflated the
answer by three times.

Dealt instead — 8 decks of six cards sampled from the draftable pool by a fixed
seed, `FF_VSEED` to re-deal:

```
                    hand-picked    dealt
the DECK               4.8%         1.6%     (won/lost)
the TRAIL             16.2%        13.9%
```

**The deck's share of the won/lost variance is 1.6%, not 4.8%** — cards matter
even less than the round that measured them said. The finding survives its own
correction and gets stronger; what does not survive is the number I quoted.

**And the response variable was nearly all zeroes.** A locked six-card deck
crosses about 3% of the time, so "did it win" is 0 in 97 cells of 100 and most of
its variance is the rarity of a 1. Measured on HOW FAR IT GOT (zone 0–3), the
same runs read:

```
the TRAIL 32.5% · the DECK 4.4% · the DRAW 0.0%
```

Same ordering, six times the resolution. **The 79% "everything else" splits too**:
averaging over the three draw orders gives a deck-by-trail cell with three
observations in it, so the two-way term comes out on its own —

```
the MATCHUP (this deck on this trail)   27.1%
the three-way remainder                 64.2%
```

**The matchup term is bigger than the trail's own main effect.** A game whose
outcome is a quarter "this deck against this trail" is a game of specific
encounters, not of deck strength — which is a design statement, and the thing to
change if you want cards to matter is how much a single pairing decides, not how
good the cards are.

### FINDING — three entries state nulls this instrument cannot support

`topic: null-audit`

The ladder's own spread is **±2.8, so 2σ is ±5.5**. A null result on it therefore
does not mean "no effect" — it means **"no effect larger than 6 points"**, and the
difference matters for every entry whose headline is a null.

Audited across what is left after the cut, **3 entries** rest on one:

| entry | claims | what the instrument can actually say |
|---|---|---|
| [courses](#finding--courses-do-not-starve-the-board) | no course runs away with the run | none of the five differs by more than 6 points |
| [the telegraph](#finding--the-telegraph-is-feedback-not-a-decision) | it is feedback, not a decision | it is worth less than 6 points |
| [the lesson's dose](#finding--the-dose-of-a-lesson-is-irrelevant-the-subject-is-everything) | 18/18/18/18, dose is irrelevant | four doses within 6 points of each other |

None of the three is wrong. All three would read exactly the same if the true
effect were **five points**, which for a game whose whole skill ladder is 27
points is not nothing. Settling any of them needs **4x the sample** — about 840
runs an arm, roughly four minutes each now that the probe is pooled, which is
affordable and has simply never been spent.

Everything else in the file rests either on an effect above 6 points (denial +10,
the purse −17/+26, being told +11, the fight set 17–18) or on a different
instrument entirely — the card tables use a family bar over hundreds of runs and
the mending and contrast tables are proportions over tens of thousands of turns.
**The 6-point rule is a rule about the ladder, not about the file.**

### FINDING — the ladder, and which of its numbers is the one being defended

`topic: ladder`

Four pilots, each the one above it plus one more thing it knows how to do, so
the gap between two rows is that one thing. `FF_RUNS=70`, 210 runs an arm:

| pilot | | worth |
|---|---|---|
| careless | takes the leftmost card, swings at the nearest thing | 10% |
| + the fight | denies schemes, answers a named wave, places bodies, holds gear | 19% (**+9**) |
| + the trader | spends well | 37% (**+18**) |
| + steering the pool | drafts to a course | 38% (+1) |

**Every reading before this round is on a different footing and is not
comparable.** Unlocks used to accumulate across runs, so the four arms each
played a different card pool — see [parallelism](#finding--the-ladder-is-pooled-and-getting-there-found-a-five-round-bug).
The pilot saturates the meta now, and this is the first ladder in which the four
arms are actually playing the same game.

**TWO NUMBERS, TWO TARGETS, AND THEY ARE NOT THE SAME PROMISE.** This had been
fudged: a round reported "the floor is unchanged" while quoting the total, which
is how a 9% → 7% careless reading survived a round without anyone deciding
anything.

| | what it promises | target |
|---|---|---|
| **the careless floor** | a beginner crosses sometimes | **8–12%** |
| **the ladder total** | skill is worth something | **26–32 points** |

**The total's target was set from one reading and the very next measurement
missed it.** It was written as "≥ 28" off a single 28-point ladder; the next three
measurements of near-identical builds read **30, 28 and 27**. A target derived
from n=1 is not a target, it is that one number wearing a promise, and it would
have had the next round "fixing" a one-point move that is pure spread. The range
above is the observed spread of the same instrument on the same footing.

They are different guarantees and they can move in opposite directions, so both
are quoted every round or neither is. The three aura cards are exactly that case,
measured on one footing at `FF_RUNS=70`:

| build | careless | + fight | + trader | + steering | total |
|---|---|---|---|---|---|
| no new cards | 8% | 26% | 39% | 38% | **30** |
| the three always-on | **10%** | 19% | 37% | 38% | **28** |
| + the two conditional | 9% | 22% | 37% | 34% | **25** |

(Those were taken with `SKILL.shelter` on, since deleted; the shipped build now
reads **10 / 19 / 38 / 37 = 27**, a one-point move inside the spread.)

**The three cards raise the beginner's floor by two points and cost the total
two.** That is a real trade and it is the right side of it: a card that helps a
weak pilot slightly compresses a ladder by definition, because the ladder is
measured from the weak pilot upward. Both numbers stay inside their targets, and
the two conditional cards fail both, which is why they are gone.

**Read the total, not the rungs.** The fight and the trader have swapped nine
points between them across rounds in which neither was touched. Most of that was
the unlock bug; some of it is simply that a rung is a difference of two arms and
carries twice the band.

**The commitment is withdrawn.** For three rounds this file said the fight
*should* be the rung that matters and the trader was bigger every time. What is
left is a statement of what this game is rather than what it was meant to be:
**the fight is the rung that carries the skill and the trader is the rung that
carries the run.** Two different questions, both answered; the one attempt to
force them to the same size cost ten points across every rung.

**Steering prices at roughly nothing and that is not the courses' fault** — at
450 runs an arm all five beat declaring nothing and sit within two standard
deviations of each other. What prices at zero is the *drafting*: a pilot that
takes the best card on offer is already doing most of what steering can do.

### FINDING — what a bottomless purse is buying

`topic: purse`

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

`topic: instrument-limits`

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

`topic: lesson`

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

`topic: fight-habits`

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

### RULE — the scale matters across baselines, not against one

`topic: scale`

The card table turned out to be flat only in points, so every finding in this
file measured against a low baseline was re-read in odds: the lesson arm at a 9%
floor, the whole one-at-a-time ablation, the dodge arm, the ladder.

```
                        points        odds        both at 210–750 an arm
lesson, told once       +6            1.78x       1.9σ → 2.5σ paired
ablation, deny          +7            1.93x       2.0σ → 2.6σ paired
ablation, keepSlot      −3            0.65x       1.1σ → 1.4σ paired
deny alone, deep       +10            2.52x       5.6σ → 7.2σ paired
dodge, walks past       −8            0.71x       1.7σ → 2.2σ paired
ladder, the fight      +17            3.55x       4.4σ → 5.7σ paired
ladder, steering        −1            0.96x       0.2σ
```

**Not one conclusion changes**, and the reason is worth more than the exercise.
Every one of these compares an arm against **the same control**. With a fixed
baseline the odds ratio is monotonic in the arm's percentage, so the two scales
rank identically and test the same null — only the magnitudes read differently.
The card table was different in exactly the way that matters: it compared a **3%
locked floor** against a 40% pool baseline, and a fixed point-difference means
wildly different things at those two ends.

One correction fell out of doing it. A naive odds σ is built from four counts
with no pairing correction, so it is conservative by the same **1.29x** the
points band was calibrated by — the third column above. Read raw, the lesson arm
and the dodge arm both drop under 2σ; read with the same correction the file
already applies to points, they clear. **A new scale needs the old calibration
carried over, or it invents a disagreement.**

So: **points against a fixed control, odds across different ones.** The careless
floor's story has been told on the right scale for ten rounds after all.

### FINDING — the aura idea did not work, measured against a named control group

`topic: auras`

Fifty-six of fifty-seven cards measured indistinguishable from the pool median.
The diagnosis was that every card was stats, keywords or a per-unit hook — **all
three local** — so nothing you pick up changes how you play the other five bodies.
The prescription was an **aura**: a global rule hung off a living body, priced by
the slot it takes and the risk of losing the rule when the body falls.

Three shipped: **Coldbearer** (a packed line warms anyway, and it takes Frost 2 a
turn for it), **Backdrift** (the back column burns 2 and the front burns 1), and
**Grudgehorn** (keeps its Spice for the rest of the run; falling empties the bank).

**The prescription did not work, and this is the measurement that says so.**
Pricing all 60 cards demands 3.34σ per test and nothing ever clears — a sentence
this file has written three times, and it is a statement about the sample, not the
pool. So the question was asked properly instead: name the three auras and three
ordinary wardens in advance, giving a **6-test family** with a 2.64σ bar, and run
it at **360 runs an arm**:

```
backdrift    1.49x  1.1σ   AURA          pikeling   1.16x  0.4σ   control
coldbearer   0.92x  0.2σ   AURA          snowpup    1.00x  0.0σ   control
grudgehorn   0.61x  1.1σ   AURA          shoveler   0.76x  0.6σ   control
0 of 6 clear · best-to-worst spans 2.5x on a 4% floor
```

**The three auras straddle the three ordinary wardens.** Best of the six is an
aura and worst of the six is an aura, and neither is distinguishable from a
Snowpup. A rule that rewrites the room rule, the column clock or run-scoped
memory buys you no more than an 8-health body with Longshot.

**A trap worth recording, because it caught me first.** A shallower pass —
all 60 cards, 120 runs an arm, against a 2% floor — put Backdrift **3rd of 60 at
5.95x** and that reads like a triumph. It is the baseline effect this file
already has a rule about: a lower floor inflates every odds ratio, and a smaller
sample widens every tail. The honest comparison against a control group at three
times the depth shrinks 5.95x to **1.49x, 1.1σ**.

**So: stop building auras.** Two of the five were already cut for costing the
ladder three points; the surviving three are ordinary cards with interesting
text, which is worth something to a player and nothing to the pool's flatness.
The flat pool is still flat and the explanation is not "the cards were too local".

The three stay in — at `FF_RUNS=70` they read careless **10%** against 8% without
them and 28 points against 30, so they raise the beginner's floor by two and cost
the total two — but nothing here licenses five more.

One thing found while building them, worth more than the cards: `def()` let a
second card claim an id and **win silently**. One of the five was named
`cairnwarden`, which already existed 100 lines down — the later definition
overwrote it, the new card vanished from the game entirely, and the suite went
green at 602 checks because every one happened to test the survivor. It throws now.

### DEAD ENDS — the two cards and the habit built to rescue them

`topic: shelter`

**Dawnpiper** (your wardens tick before the foes) and **Trailmarshal** (a body onto
the board without spending the turn) were the two most interesting rules of the
five and both are deleted. They were held out of the offer for one round on the
argument that the probe's pilot could not express the habits they need. That
argument was then tested: with the habits on they were drafted and played **50 and
156 times across 360 runs** and the ladder read **25 points against 28** without
them. Not blind-spotted — just worse.

**`SKILL.shelter`, the habit built to rescue Dawnpiper, is deleted too, and both
its numbers are the point:**

```
shelter any body that cannot survive the biggest swing   −7 at the fight rung
                                                          (12/13/36/36 vs 12/20/40/39)
shelter aura-carriers only                                 0, firing 95 times in 360 runs
```

Neither version earns a row in the ablation table. A habit that prices at zero is
not free — it is a switch every future pilot change has to reason around, implying
forever that somebody should care.

The wide number is the one to remember: **that is the third time "careful
placement" has cost this pilot points.** The front column ticks twice, swings go
to the front of a lane, and a pilot that keeps bodies out of the fighting is a
pilot doing less fighting. That is no longer a quirk of one heuristic; it is what
this board is.

### FINDING — the cards do differentiate, on the scale that works

`topic: card-worth`

A flat removal table has two readings and only one of them is health. Taking a
card out of a POOL asks what the pool misses, and a pool substitutes — the offer
shows something similar next time, which is exactly the redundancy the purse
turned out to be made of. "44 of 57 inside a standard deviation" is equally what
a set of interchangeable cards looks like.

So the same question from the other end: **lock a minimal 6-card deck, hand it
two copies of one card, and see what that card is worth from a standing start
where nothing can substitute for it.** 630 runs an arm, all 57.

```
the locked floor                                   3%
worth most:  frostmite +6.3 · avalanche +4.8 · blastcap +3.8
worth least: shoveler −1.6 · pryrod −1.3 · hookline −1.3
best to worst spans 7.9 points · 0 of 57 clear the 3.33σ family bar
```

**In points that table is flat too — and points are the wrong scale here**, which
is a lesson this file learned two rounds ago arguing about compression. The floor
is 3%. A card "worth +6 points" has more than *trebled* the win rate, and the
points column calls that noise.

The same table in odds against the floor, with the band taken off the four counts
rather than a proportion's formula:

```
frostmite   3% → 10%    3.59x    4.8σ
avalanche   3% →  8%    2.81x    3.7σ
blastcap    3% →  7%    2.43x    3.2σ
shoveler    3% →  2%    0.66x    1.1σ
best to worst spans 5.4x
```

**Frostmite and avalanche clear the 3.33σ family bar; the table spans 5.4× in
odds.** The cards differentiate — a locked deck's chances more than treble on the
best of them and fall by a third on the worst. What was flat was the *ruler*.

The arm prints both scales now. The removal table below stands as it was: from a
full pool nothing is load-bearing, because the pool substitutes. Both are true,
and together they say the thing worth knowing — **a card matters when you cannot
replace it, and the offer can almost always replace it.**

### FINDING — no card in the game is load-bearing

`topic: card-removal`

Fifty-eight cards had been priced by one table — *every card is played* — which
is a statement about the POOL and has never said anything about a card.
`FF_CARDS` takes one out of the offer and plays whole trails without it, all 57
draftable cards, 630 runs an arm:

```
baseline                                        40%
±2.1 on a removal · family bar 3.33σ = ±6.9
the run misses most:  snowbomb −5.7 · hookline −3.8 · patchkit −3.0
does best without:    flarehound +5.1 · bellowsbear +4.6 · bellhammer +4.4
```

**Nothing clears, either way. 44 of 57 sit inside a single standard deviation of
the baseline.**

The bar is the interesting part. At a naive 2σ (±4.2) this table has **five
"findings"** — snowbomb and hookline as load-bearing, flarehound, bellowsbear
and bellhammer as liabilities — and that is precisely what a 5% error rate
produces when you run it 57 times. The bar here is the FAMILY one: Bonferroni,
3.33σ, the per-test threshold that keeps the chance of *any* false positive at
5% across the whole table. Nothing survives it.

So the deck is a pool and not a puzzle with a key. No card is a trap and none is
a must-take, which is the healthiest thing a 57-card pool can be — and it is now
measured rather than asserted from "every card is played".

One limit, stated rather than discovered later: a card removed from the OFFER can
still arrive in a starting deck, so this prices **draftability**. A card that
only ever comes free with a leader reads as zero here whatever it is worth.

**And one result that sits in tension with it, kept here rather than filed
somewhere it would not be read.** Removing a card from the pool entirely costs
nothing measurable. Making one card five times *rarer* — Frostmite common → rare,
one character — cost the ladder 2, 5, 2 and 1 points at its four rungs. Both are
this file's own measurements and both are believed.

They are reconcilable and the reconciliation is the useful part: **removal is
compensated and rarity is not.** Take a card out of the offer and the offer shows
something else in the same slot, so the pilot's hand is the same size and roughly
the same strength — that is the substitution the flat table is made of. Move a
card down the frequency curve and nothing fills the gap; the slot it used to
occupy in an early offer now holds a *median* card instead of the best common in
the game, and the beginner who most needed the strong card is the one who now
sees it least. The pool substitutes for absence. It cannot substitute for scarcity.

### FINDING — denial, settled

`topic: denial`

Every conclusion in this file rests on one number and last round it cleared its
own bar by **four tenths of a point** — +7 against a 2σ of 6.6 at 180 runs an
arm. That is not a foundation, it is a coincidence waiting to be re-rolled, and
it was written down as an aside.

Run alone and deep (`FF_HABIT=deny FF_ABLATE=250`, **750 runs an arm**):

```
knowing nothing                8%
denying schemes and nothing else   18%     +10 of the 16 the whole set is worth
band ±1.6 · 2σ = ±3.2 · the reading is 6.3σ
```

**It survives, with 6.8 points of daylight instead of 0.4.** The next best habit
at the same depth is holding gear at +2, inside the band. Six rounds of building
on denial were building on something real; the four tenths were a small-sample
artefact of the arm, not a property of the finding.

### RULE — what a beginner should meet, and whether they do

`topic: first-fight`

The careless floor drifted **5% → 9% across three rounds** and nobody decided
that: it moved while other things were being changed. A floor is a design
choice, so here is the choice, stated in the numbers that describe an
EXPERIENCE rather than an outcome:

| | target | now |
|---|---|---|
| sees the second zone | ≥ 75% — the game has to show what it is | **81%** (170/210) |
| sees the third | 15–35% — often enough to be a place, rare enough to be a prize | **25%** (52/210) |
| crosses | under 12% — a crossing is earned, not stumbled into | **9%** |

**At target on all three.** And the drift is smaller than the win rate made it
look: at the 5% floor a careless run saw the second zone 163 times in 210 and
the third 50 times; at 9% it is 170 and 52. **A beginner's run goes exactly as
far as it used to** — 3% further into the second zone, 1% into the third — and
simply finishes the last one slightly more often. The four points of win rate
are the tail of the distribution moving, not the shape of it.

### FINDING — the telegraph is feedback, not a decision

`topic: telegraph`

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

`topic: band`

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

### FINDING — courses do not starve the board

`topic: courses`

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

`topic: quiet-road`

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

`topic: mending`

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

`topic: probe-wrappers`

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

`topic: card-doctrine`

Written down before the cards were, after 2 rounds of building cards, measuring
them and cutting **5 of 6**. In full above `const CARDS`; in short, **a good card
makes the player choose between two things they want, on the board, differently
each turn.** Four tests: it asks a question answered differently on different
turns, the question is asked on the board, it costs something the player wanted,
and it does not answer a question the board already asks. If you cannot say what
it costs, it is not finished. The round that wrote it built **3 cards against it
and shipped 3** — the first content round in 3 that did not cut most of what it
made. The rule has a test now, too: from a locked floor the 57-card pool spans
**5.4x in odds** between its best card and its worst, so "a card is a choice"
is a measured claim rather than a hope.

### FINDING — schemes are most of what the fight is worth

`topic: schemes`

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

`topic: room-rule`

Three states, and it is the rule the board is built around:

- **two or more free slots** — the whole line takes Regen 1
- **exactly one** — cramped; nothing
- **none** — Frost 1 on somebody, and they lose their next trigger

It took three shapes. As a two-state rule it measured **exactly +0** at 750 runs
an arm — a measured zero, not a noisy one — and the third state is what made
keeping a slot back a decision instead of a habit. It is symmetric but the sides
do not meet it equally often: the foes' line runs emptier, so in practice it is a
rule for one side of the table. That asymmetry is intentional.

### FINDING — the defeat screen, looked at properly, had five defects

`topic: defeat-screen`

It shipped last round with one pass and one glance at one size. Opened at
1280x720, 2400x1080 and a phone, it had **five** things wrong with it, and the
severity ordering is the finding: the worst one was invisible at the size it was
built at.

1. **A hard vertical seam through all three ridges.** The ridge loop stepped
   `x += 60` from 0 and then closed with `lineTo(VW, VH)`, so it dropped straight
   down from the last multiple of 60. At **VW=1280** that lands at 1260 — 20 units
   from the edge, indistinguishable from the frame. At **VW=1600** it lands at
   1560 and cuts a 40-unit-wide notch out of the weather. *Built at one size,
   broken at another, and only the three-size walk could see it.*
2. **The name was drawn across the creature's feet.** `drawCreature(x, y, h)`
   draws a body about **2.2h** tall anchored near its middle, so an 88-unit
   Frostwyrm spans ky−110 to ky+88. This is the **third** measurement of that
   anchor: +30 put the name on the belly, +78 put it on the feet, and both were
   guesses. It is hung off a computed `feet` now, as is the shadow — which had
   been drawn at ky+0.2h, *inside* the creature, where nothing could see it.
3. **The last log line sat on the plate's top border**, four units inside it,
   with the corner radius cutting its descenders. On **both** end screens.
4. **The ninth stat wrapped to a row of its own**, centred under the other eight,
   looking like an accident — because `perRow` was the constant **8** and a loss
   shows **9** cells. Nine fit at every size the game builds: even at VW=1180 the
   narrowest stage, nine cells of 122 sit inside the safe area with room over.
5. **Ninety identical dashes is not snow, it is a scratched lens.** One length,
   one weight, one of four alphas. Replaced with 120 streaks on a single depth
   number driving length, alpha, width, drift and fall *together* — the fix that
   matters is the coupling, not the variation. A streak that is long and dim
   reads as noise however carefully each property was randomised alone.

The pattern across 2, 3 and 4 is the same one the shrine and the reward captions
had: **a lower element pinned to a constant while an upper element moved.** Three
rounds, three screens, one bug. Everything on this screen is now derived from the
element above it, and `statTop` from the portrait's actual bottom.

### RULE — a horizontal sweep is never written by hand, and there is no vertical one

`topic: sweeps`

`for (x = 0; x <= VW; x += step)` followed by `lineTo(VW, …)` stops at the last
multiple of `step` below VW and then runs a straight line to the corner, drawing
a hard edge **VW % step** units in from the right. Whether it is visible depends
on a number nobody looks at, so it had been written by hand four times and was
broken in three:

```
aurora bands  step 64   clean at 1280 and 1600, 28-unit seam at 1180
far ridges    step 40   clean at 1280 and 1600, 20-unit seam at 1180
the ground    step 48   BROKEN AT ALL THREE — 28 at 1180, 32 at 1280, 16 at 1600
dusk ridges   step 60   found by eye at 1600 the round before
```

**3 of 4 hand-written sweeps were broken at a width the game actually builds.**
The ground one had been there since the first sky, at every width, and survived
38 rounds of looking at screenshots because a 16-to-32-unit sliver at the extreme
edge under the near scenery reads as framing.

All six go through `sweepX(c, step, fn)`, which spans −step to VW+step and leaves
the caller no arithmetic to get wrong.

**And the vertical case, which is the obvious next question: there are ZERO, and
that is structural rather than lucky.** `VH` is a `const 720`; `VW` is recomputed
from the window's aspect ratio on every resize. A sweep whose step does not
divide VW is broken at *some* widths and clean at others — which is exactly how
the ground seam hid for 38 rounds. A sweep whose step did not divide VH would be
broken at every size on every device, permanently, and could not survive one
round. The whole file contains **2** stepped loops: `sweepX` itself and one
`i += 2` that is exact by construction. The suite asserts that count, so a third
one has to justify itself.

**The generalisable part: when a bug's visibility depends on an incidental
number, fixing the instance is worth almost nothing** — the next one picks a
different step. Make the arithmetic unreachable instead.

### FINDING — the shot walk is still the only thing that sees

`topic: shot-walk`

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

`topic: contrast`

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

### DEAD ENDS — everything built, measured and thrown away

`topic: dead-ends`

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
- **Letting rounded rectangles stamp into the contrast raster.** `rr` is what
  every panel, plate and slab is made of, so it looks like an obvious widening.
  53 failures, nearly all wrong: a slab is a rounded rect and the badges drawn
  ON it are hand-built paths that do not stamp, so the slab won every lookup and
  a health number on a green shield read against the slab body at 1.2:1. The
  rule holds only while the shapes that do not stamp are also not the ones text
  sits on. What did survive from the attempt: `arcTo` is tracked now, and a
  translucent fill no longer counts as a ground.
- **A seed band from three samples.** ±0.7, and ±2.4 from five. Three points do
  not make a standard deviation.
- **A pair interaction measured on `reposition`.** Its arms are byte-identical,
  so the interaction is 0.0 by construction and the "band" came out 110×
  narrower than derived.

### FINDING — rarity carries no information, and one card was fixed

`topic: rarity`

The odds table is the first evidence anyone has had about what a card is worth,
and the rarity tiers were assigned by hand years before it existed. Checked
against each other, 630 runs an arm:

```
common    18 cards · median 1.05x · range 0.63–3.02x
uncommon  31 cards · median 1.05x · range 0.54–2.18x
rare       8 cards · median 1.05x · range 0.72–2.49x
```

**All three medians are identical.** The best card in the game — Frostmite at
**3.02x, 4.3σ** — was a common, so the draft weighting showed it 5 times as
often as the rares it beats; and 4 of the 8 rares sit below the overall median,
Snowbeard and Bellowsbear at 0.72x.

**The change that shipped was wrong and has been reverted.** Frostmite went
common → rare on the reasoning that a common worth 3.5x is a bug. The ladder,
same seeds and same sample, disagreed:

| | careless | + fight | + trader | + steering |
|---|---|---|---|---|
| Frostmite common | **9%** | **26%** | **39%** | **38%** |
| Frostmite rare | **7%** | **21%** | **37%** | **37%** |

Four rungs, all down, off one character. No single move clears its own band; four
consistent moves off a one-line change do. **The measurement that licensed the
promotion could not see the thing the promotion changed** — the locked-deck arm
*hands* the card over, so rarity does nothing inside it. Worth was measured in
the one context where the dial being turned is inert.

So the finding stands and the action inverts: rarity carries no information
about worth, AND worth carries no licence over rarity. In a draft the tier is
pure frequency, and thinning the strongest early common out of a beginner's hand
costs the careless pilot two points and the fight rung five. **A strong common is
the floor holding itself up, not an imbalance.**

The eight cards sitting between 2σ and the family bar would still need about
**2.8x the sample (1,750 runs an arm, ~100,000 runs)** to be licensed — but note
what that would license: a statement about worth, which is now known not to be a
reason to touch a tier.

### RULE — a worth measured in a locked deck cannot license a frequency change

`topic: arm-licence`

The general form of the mistake above, because it is the third costume the same
error has worn in three rounds (after the points-vs-odds scale error and the
band that was 1.3x too wide).

**An arm can only license a change to something the arm can see.** The locked
deck was built to answer "is this card any good, with nothing able to substitute
for it" and it answers that well. It cannot answer "how often should this card
appear", because it does not draft — it deals. Reading a number off one and
spending it on the other is not a small extrapolation; it is a claim about a
mechanism the instrument had switched off.

The check, before any change: **name the arm, then name the thing the change
alters, then say where in the arm that thing appears.** If the honest answer is
"it doesn't", the arm is silent on the change however loud the number is.


### FINDING — where the probe's minute goes, measured after guessing wrong three times

`topic: parallelism`

**`FF_TIME=1` prints a per-section table, and it should have existed three rounds
ago.** "Where does the time go" was reasoned about three times and answered wrong
three times — once blaming three sweeps that are switched off by default. The
measurement took ten minutes to build and settled it immediately:

```
before pooling            after
  23.8s  playing well      15.3s
  21.3s  money             12.6s
  12.4s  reward screen      7.9s
   5.1s  the ladder         4.9s   (pooled the round before)
  ---------------------------------
  82s total                64s total
```

**The three slowest sections were 70% of the probe and none of them was pooled.**
They are pooled now: fourteen arms of the fight ablation go out in one call, the
money section's three, the reward screen's seven, the courses' six. The whole
probe is **22% faster** and inline-vs-pooled output stays byte-identical, which is
the standing check.

What made the ablations poolable is **per-job config**: each arm sets a SKILL or
DRAFT flag before it plays, and the flag travels *with* the job rather than being
toggled globally. Without that, batching them is impossible and the alternative —
draining the pool once per arm — is slower than not pooling.

**AND FROSTFELL IS NO LONGER THE OUTLIER, SO THIS STOPS HERE.** `npm run check`
timed per suite, 39 of them:

```
247.8s  blacksite     ← 46% of the whole check
 89.8s  crashmas
 54.0s  frostfell     ← 10%, third
 48.9s  ironbridge
 33.2s  dungeon
--------
531.9s  total
```

blacksite alone is **4.6x** frostfell. Frostfell was the slowest thing in the
check when the pooling work started and it is now a tenth of it, so further
optimisation here is misplaced effort — and the other suites are not this
project's to touch. **The optimisation is done.**

**The parallelism itself, and its ceiling.** The pilot lives in
`tests/frostfell_pilot.mjs`, tweaks are serialisable descriptors, and workers are
reused. Measured on one arm, wall clock including startup:

```
FF_JOBS=1   9.1s      FF_JOBS=3   5.7s
FF_JOBS=2   5.3s      FF_JOBS=4   7.0s
```

It peaks at half the cores; `JOBS` defaults from that table. An earlier estimate
of 2.6x came from timing three separate probe *processes*, which measures how the
OS interleaves three programs.

**The rule for whether two arms may share a pool call** is not whether they read
pilot state — that is solved, the counters come home — but **whether anything
mutates that state between them.** The duck arm's `seek` and `dodge` share a call;
`sore` gets its own, because three `DUCKS` counters are zeroed between them and a
batched call would absorb all three arms' forks before the reset could run. A
reset between arms is a barrier.

### FINDING — the bug the pooling work actually found

`topic: unlock-bug`

Pooling the ladder was supposed to be a speedup. It was 3%. What it found instead
is the most consequential bug in this file's history.

**`playRun` was not a function of its arguments, and had not been for the whole
life of the probe.** Unlocks accumulate in `G.meta.found` as runs finish and
`cardPool` filters on it, so a run's offer depended on how many runs that thread
had already played. Seed 4242 played **100 turns and then 25**.

The ladder runs its four arms in sequence, so careless played with **3** things
unlocked and careful with **12**. Part of every rung this file printed was the
unlock state rather than the pilot, and the arms were never paired on identical
trails, only on identical seeds. The pilot saturates the meta at import now, so a
run is a function of its arguments and nothing else.

**The check that should have caught it passed throughout, and that is the lesson.**
`a seed is a promise` is the LAST thing in the probe, where the meta has already
saturated and two consecutive plays necessarily agree — a determinism check placed
exactly where determinism cannot fail. It replays a seed after every other run in
the file now.

**And merging counters is silent when it is wrong.** The pilot fills thirteen
module-level counters and a dozen tables read them afterwards. The first merge
summed `DUCKS.bar` — a **0.22 threshold**, not a count — into 0.66, changing which
forks the duck arm counted, and concatenated `ROOM.free` — a histogram — into a
**twelve-slot board on a six-slot game**. Neither failed an assertion. Both were
caught by diffing the whole probe's output inline against pooled, which is now the
standing check: `FF_JOBS=1` and the default must produce **byte-identical output**,
and they do at `FF_RUNS=70`.

### RULE — the source split is retracted

`topic: source-split`

Three rounds ago this file recommended taking the screen renderer out of
`index.html` first — "the cost is one more `<script>` block, perhaps 40 lines of
plumbing". `index.html` is past **8,900 lines** now, 400 more than when that was
written, and the recommendation is **withdrawn**.

Two reasons, both concrete. The plumbing estimate was right for the wrong
reason: top-level `const` in a classic script lives in the shared global lexical
environment, so a second `<script>` would see `txt`, `panel`, `C` and the layout
constants **for free** — but it also means the split buys no isolation, only a
second place to look. And the headless loader every suite depends on extracts
*the* inline script by pattern; two blocks means changing the one file that all
5 suites and both tools load through, to gain navigability.

The evidence says navigability is not the problem. **36 rounds and the bugs found
by looking are layout and z-order** — a snow cap over a blurb, a caption pinned
at a constant y, a portrait drawn after its own label. Not one of them was "the
code could not be found". A split that costs a change to the shared loader to
solve a problem nothing has reported is the wrong trade, and saying so is worth
more than leaving a plan nobody executes at the top of the file.
