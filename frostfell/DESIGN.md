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

So every entry carries a `topic:` key, and the suite requires the 38 keys to be
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
| **the ladder total** | skill is worth something | **≥ 28 points** |

They are different guarantees and they can move in opposite directions, so both
are quoted every round or neither is. The three aura cards are exactly that case,
measured on one footing at `FF_RUNS=70`:

| build | careless | + fight | + trader | + steering | total |
|---|---|---|---|---|---|
| no new cards | 8% | 26% | 39% | 38% | **30** |
| the three always-on | **10%** | 19% | 37% | 38% | **28** |
| + the two conditional | 9% | 22% | 37% | 34% | **25** |

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

### RULE — three cards rewrite a rule; two more were built, taught and cut

`topic: auras`

Fifty-six of fifty-seven cards measured indistinguishable from the pool median.
Two rounds read that as a *tiering* problem. It is a **shape** problem: every card
in the pool was built out of stats, keywords or per-unit hooks, and **all three
are local**. A card whose whole effect lands on one body cannot change how the
other five are played.

Three cards now hang a **global** rule off a living body, each read at exactly one
site, and none carrying bigger numbers than an ordinary card of its tier:

| card | rewrites | charges |
|---|---|---|
| Coldbearer | a packed line warms anyway | takes Frost **2** a turn, forever, while packed |
| Backdrift | back column burns 2, front burns 1 | re-prices all **6** slots |
| Grudgehorn | keeps its Spice for the rest of the **run** | falling empties the bank |

**Two more were built and are now deleted, and the deleting is the finding.**
Dawnpiper inverted turn order; Trailmarshal put a body down without spending the
turn. They were the two most interesting rules of the five. Both were held out of
the offer for one round on the argument that the probe's pilot could not express
the habits they need, so the arm was blind to their upside.

That argument was then tested rather than repeated. `SKILL.shelter` was added to
keep an aura-carrier out of the front column, `SKILL.keepSlot` already held a slot
back, and at `FF_RUNS=70` with both on:

| build | careless | + fight | + trader | + steering | ladder |
|---|---|---|---|---|---|
| the three always-on | 10% | 19% | 37% | 38% | **28** |
| + the two conditional | 9% | 22% | 37% | 34% | **25** |

They were drafted and played — **50 and 156 times across 360 runs**, with the
shelter firing **95** times — so they are not blind-spotted. They simply cost
three points. **A card that needs a plan and still does not pay once the plan is
taught is not an unlucky card, it is a bad one.** Deleted rather than shelved
again, because a second round of `noPool` is a way of not deciding.

**The general rule that survives them: an always-on rule is safe to put in a pool
and a conditional one is not**, because the pool charges every card the same
frequency cost whether or not the holder knows what to do with it.

One thing found while building them, worth more than the cards: `def()` let a
second card claim an id and **win silently**. One of the five was named
`cairnwarden`, which already existed 100 lines down — the later definition
overwrote it, the new card vanished from the game entirely, and the suite went
green at 602 checks because every one happened to test the survivor. It throws now.

**And one habit priced at zero, which is worth keeping as a number.** The FIRST
version of `shelter` protected *any* body that could not survive the biggest swing
on the board, and cost **7 points at the fight rung** (12/13/36/36 against
12/20/40/39). That is the third time "careful placement" has cost this pilot
points. Narrowed to aura-carriers only it fires 95 times in 360 runs and prices at
**0**, which is the honest reading: protecting the thing carrying a rule is worth
something, protecting fragile bodies in general is worth less than the swings you
give up.

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

### FINDING — what would settle the missing nine points, and what it costs

`topic: missing-nine`

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

`topic: trader-rung`

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

### FINDING — the careless board is emptier, not fuller

`topic: careless-board`

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

`topic: mitewing`

Mitewing — a tier-1 trash mob, **4 health and 2 attack** — was in the top 2 of
the late-zone death table for 5 rounds running, and it is still there: **16% of
88 late deaths** at 210 runs an arm, second only to the Frostwyrm's 27%.
Counting each foe's *share of the damage the fell actually swings* (tick rate
over counter, times attack) explains it: a 1-counter Aimless body swings every
turn and walks past every wall, so its share is 2 damage a turn where a beast on
a 4-counter lands 20 every fourth. A death table ranks who landed the last blow;
a damage-share table ranks who did the work. Keep both.

### FINDING — Hearth, and a fact about how damage works

`topic: hearth`

Hearth read bottom of the course table for several rounds through 5 attempts to
fix it, and at 450 runs an arm it is level now — **39% against a 40% no-course
baseline**, inside the ±2.2 band. The pool was never the cause: 13 hearth cards
against 14 frost and 13 scrap. The rule was: Regen is a **threshold good**. Healing that does not outrun
the incoming does nothing at all, and healing that does outrun it makes the
warden unkillable — there is no middle, so every tuning pass either did nothing
or broke it. A fact about the game's damage, not about Hearth.

### FINDING — six screens nobody had opened, and what was wrong with them

`topic: six-screens`

The shot walk takes 35 screens and about 6 of them had ever been looked at. Six
more, at 2400x1080. Every one had something a person would notice and no suite
could:

- **The statuses help page drew the letter "N" in all 10 pips.** Every status
  has carried an `icon` field since the first week and *nothing had ever read
  it* — the board draws the value in the pip, which is right mid-fight, so the
  one screen whose job is teaching you what a Frost is showed ten identical
  N's. It has 10 marks now: a flake, a flame, a shield, a spark, a chevron down
  and up, an hourglass, a cross, a spiked ring, a coin.
- **The shrine's snow cap was painted over its own blurb** — the art was pinned
  at a constant y and drawn AFTER the text, so a 2-line blurb ran into a stone
  that reaches 62 units above its centre. The art is placed off the bottom of
  the text now and drawn first, so the words win whatever happens.
- **The help page let the game read through it.** A `.92` scrim over a lit
  leader screen still showed CHOOSE A LEADER and three tribe names behind the
  status list. `.97`.
- **The boss is drawn at exactly the size of an ordinary foe.** The Hollow King
  has 82 health beside a Chillfang's 12 and occupies the same slab, with the
  same frame, at the same scale. Nothing on the board says a beast is a beast.
  *Not fixed — it is a slab-layout change, not a paint job.*
- **The rest stop promises a fire and a stone and draws neither.** Its subtitle
  is *somebody left the fire banked and a note under a stone*; the screen is 3
  buttons on empty snow, and on a 20:9 stage they sit in the middle third with
  the bottom half empty. The camp got logs and a fire-glow 2 rounds ago; this
  screen got nothing. *Not fixed.*
- **The victory screen is beige.** A rotating starburst of dusty pink and khaki
  wedges over hard-edged grey polygons, in a game that is blue everywhere else,
  with 10 cards squeezed to ~95 units each so none of their text is readable,
  and a stat row reporting `0 in one · 0 clean kills` on a *win*. *Not fixed.*

Two smaller ones: the ORDER overlay hangs its resolution numbers half outside
the left edge of each slab, in circles the same size and colour as the counter
badge — a slab in ORDER shows 3 numbers in near-identical pips. And the
collection's last row of 7 tiles is left-aligned under 4 rows of 16, which reads
as unfinished.

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

### RULE — a horizontal sweep is never written by hand

`topic: sweeps`

`for (x = 0; x <= VW; x += step)` followed by `lineTo(VW, …)` stops at the last
multiple of `step` below VW and then runs a straight line to the corner, drawing
a hard edge **VW % step** units in from the right. Whether it is visible depends
on a number nobody looks at, so it had been written by hand four times and was
broken in three of them:

```
aurora bands  step 64   clean at 1280 and 1600, 28-unit seam at 1180
far ridges    step 40   clean at 1280 and 1600, 20-unit seam at 1180
the ground    step 48   BROKEN AT ALL THREE — 28 at 1180, 32 at 1280, 16 at 1600
dusk ridges   step 60   found by eye at 1600 the round before
```

**3 of 4 hand-written sweeps were broken at a width the game actually builds.**
The ground one had been there since the first sky, at every width, and survived
38 rounds of looking at screenshots — a 16-to-32-unit sliver
at the extreme edge under the near scenery reads as framing.

All six sweeps go through `sweepX(c, step, fn)`, which spans −step to VW+step and
leaves the caller no arithmetic to get wrong, and the suite fails if the
hand-written form comes back. The general form: **when a bug's visibility depends
on an incidental number, fixing the instance is worth almost nothing — the next
one will pick a different step.**

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

### FINDING — smaller things, settled

`topic: smaller-things`

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

### FINDING — nobody had played it on a phone

`topic: phone`

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

### FINDING — the ladder is pooled, and getting there found a five-round bug

`topic: parallelism`

The pilot lives in `tests/frostfell_pilot.mjs`, tweaks are serialisable
descriptors at 16 call sites, and `tests/frostfell_pool.mjs` runs a reusable
worker pool. Measured on the card arm, 63 arms x 18 runs, wall clock including
worker startup:

```
FF_JOBS=1   9.1s   (inline, no worker, no clone)
FF_JOBS=2   5.3s   1.72x
FF_JOBS=3   5.7s   1.60x
FF_JOBS=4   7.0s   1.30x
```

**It peaks at half the cores.** An earlier projection of 2.6x came from timing
three separate probe *processes*, which measures how well the OS interleaves
three programs, not how well one program splits. `JOBS` defaults from this table.

**The ladder is pooled now too** — twelve jobs, four modes x three tribes, in one
call so the threads stay fed instead of draining three times.

**And it bought 3%, not a halving.** End to end at `FF_RUNS=70`: **76.9s pooled
against 79.2s inline.** The ladder is 840 of the probe's many thousands of runs,
so pooling it moves the total barely at all — the habit sweeps, the money sweeps
and the course sweeps still run inline and are most of the wall clock. Anyone
expecting the round's slowest measurement to halve should read that number
first: the slowest measurement was never the ladder.

What the work was actually worth is below, and it is not speed.

**1. `playRun` was not a function of its arguments, and had not been for the
whole life of this file.** Unlocks accumulate in `G.meta.found` as runs finish
and `cardPool` filters on it, so a run's offer depended on how many runs that
thread had already played. Seed 4242 played **100 turns and then 25**. The four
ladder arms run in sequence, so careless played with 3 things unlocked and
careful with 12: **part of every rung this file has printed was the unlock state
rather than the pilot**, and the arms were never paired on identical trails, only
on identical seeds. It is very likely most of the rung-to-rung volatility this
file has been documenting for six rounds. The pilot saturates the meta at import
now. Every number in this file measured before that is on a different footing and
is marked where it matters.

The `a seed is a promise` check passed throughout — because it is the LAST thing
in the probe, where the meta has already saturated and two consecutive plays
necessarily agree. **A determinism check placed exactly where determinism is
trivially true.** It now replays a seed after every other run in the file.

**2. Merging counters is silent when it is wrong.** The pilot fills thirteen
module-level counters and a dozen tables read them afterwards. The first merge
summed `DUCKS.bar` — a **0.22 threshold**, not a count — into 0.66, changing which
forks the duck arm counted, and concatenated `ROOM.free` — a histogram — into a
**twelve-slot board on a six-slot game**. Neither failed an assertion. Both were
caught by diffing the whole probe's output inline against pooled, which is now
the standing check: `FF_JOBS=1` and the default must produce **byte-identical
output**, and they do.

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

### FINDING — what a family-bar sweep of the whole file would cost

`topic: family-sweep`

`FF_CARDS` at 630 an arm took most of a round to answer one question, so: what
would it cost to run *every* arm at a sample where the family bar means
something, and can the probe be made fast enough for that to be routine?

**The probe was profiled for the first time since the particle fix, and it is
21% faster.** Two findings from the flame graph, both fixed:

```
saveRun          7.6% of the whole probe — serialising a deck, a trail and a
                 log on every state change to a stub no bot ever reads back.
                 `store.mute`, read inside saveRun rather than in the store:
                 muting the store alone was worth 2%, because the expensive
                 half is building the object and stringifying it.
freeSlots        2.6% — it asked `slotFree` six times and each of those built a
                 filtered copy of the unit list and searched it. Six list copies
                 and six scans to answer what one scan answers.
26.2s → 20.7s at FF_RUNS=20, and the suite's output is byte-identical.
```

**Declined, and costed:** `weightedCards` builds its offer by pushing *w* copies
of every card id into an array and picking one at random — 4.9% of the probe,
plus a share of the 4.5% in GC. A cumulative-weight search is the textbook fix
and it would change **which card a given seed draws**, so every absolute number
in this file would shift. 7% is not worth re-baselining the record. Recorded so
the next round does not rediscover it.

**And the arithmetic.** A full-file family-bar sweep means about 12 arms at the
depth the calibration says is honest — call it 750 runs an arm — plus the two
57-card tables at 630. That is roughly **80,000 runs**. At the probe's current
rate of about 2,200 runs a minute that is **36 minutes**; before this round's fix
it was 46.

So it is affordable but not routine — a background job, not something an
ordinary check pays for. Getting it under 10 minutes needs another 3.5x, and
after the two fixes above there is no single hot spot left worth that: the
profile's top entry is now the pilot's own `carefulTurn` at 6.3%. **The next 3x
is a different probe, not a faster one** — running tribes in parallel workers is
the only thing on the table that could deliver it.

### FINDING — the probe was half particle effects

`topic: probe-speed`

Forty per cent of the balance probe's samples were `fx.pop` and `fx.burst`,
building floating text and particle objects — sixty and four hundred at a time —
for runs with no screen attached. Gating the particle systems on having a canvas
took the suite from 26.7s to 9.4s, and the sample from eight runs a tribe (±9.7,
too wide to stand behind) to thirty (±5.0) in less wall time than the old took.
