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

**Names not in the code, declared — and in which of the two ways.** Two guards
already stop an entry being *dropped* while something still points at it. Neither
could see the reverse — an entry describing code that no longer exists — because
a design record is *supposed* to name absent things, and no check could tell a
legitimate dead-end reference from a stale FINDING. It can now. Every code-shaped
name this file uses must exist in the game, the probe or the tools, **or be
declared below**, and the two reasons are kept apart because they rot differently:

<!-- gone: auraOn — the aura cards were cut and took the primitive with them
     (see FINDING — the aura idea did not work); its four readers went too -->
<!-- external: letterSpacing — a canvas/CSS property this game does not use;
     named to state a known error in the text stub, not code that was removed -->

`gone` is something this project built and deleted; `external` is something it
never had. Both are checked in both directions — a declared name that turns up in
the code fails here, because the entry describing its absence is then the stale
one. A name in backticks that is *prose* (a retired topic, a fragment of a card
name) is not a declaration's problem: the check only looks at camelCase, dotted
and UPPER_SNAKE tokens, because those are the only shapes a lost function or
constant comes in.

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

*3. The file holds at about 35 entries. Every round that adds one retires one.*

Ten entries were cut two rounds ago and the file was back over 1,500 lines two
rounds later, because the cut was a one-off and the adding is not. A cut rate
that does not match the add rate is not a policy, it is a mood — so the steady
state is stated instead: a round that writes three entries owes three
retirements.

**And this rule used to name TWO numbers — ~35 entries and ~1,400 lines — which
is one number too many.** The file sat at 33 entries and 1,672 lines: in bounds
on one control and 270 over on the other, which means the two were never
measuring the same thing and one of them had to go. The line count goes, and
the reason is that it is **in direct conflict with rule 2**.

Rule 2 says an entry a later measurement contradicts is rewritten in place, with
the retracted claim kept *inside* it as the thing that was wrong and why. That
makes entries GROW, on purpose — the *courses* entry is longer now than when it
said "the courses are indistinguishable", and every one of those extra lines is
a correction somebody would otherwise re-derive. A line budget prices exactly
that growth as a cost and pushes toward the two things rule 2 forbids: dropping
the retracted claim, or appending a short correction next to the old entry
instead of folding it in. **A file whose job is to record what turned out to be
wrong cannot be governed by how long it is.**

This is the same mistake rule 1 already records, one level up: the README was
held at exactly 999 lines for two rounds and the reference section lost real
detail to keep the number. A line count is a proxy for readability and it is a
bad one, because nobody reads this file front to back — they grep it, land on
one entry, and act on it. **What a reader pays is the length of ONE entry, and
what they risk is landing on a stale one.** The entry count controls the first
(more entries, more places to land) and rule 2 controls the second. Neither is
the total.

So: **~35 entries, no line target.** If entries individually get bloated that is
a real problem and the fix is rule 1 — cut the sentences that are not
measurements — not a budget on the sum.

What gets dropped, in order, when the count is over:

1. **Anything settled tight enough to stop constraining a decision.** The
   telegraph is the model case: worth exactly 0 at 840 runs an arm, ladder 28
   with it and 28 without. That is a *better* result than "unresolved", and it
   is precisely why it can go — nothing downstream will ever turn on it again.
2. **Anything superseded by a general form.** Five defect write-ups for one
   screen retire when the rule that prevents the whole class is written down.
3. **Anything whose numbers now live inside a bigger entry.** A finding is not
   deleted when it gets folded up; it is deleted when keeping it separate makes
   somebody read two entries to learn one thing.

What never gets dropped: a DEAD END (the cost of re-walking one is the whole
reason the label exists), a RULE that still binds, or anything a current
measurement contradicts — that gets **rewritten**, which is rule 2.

---

Everything below came out of the probe or the shot walk and is kept because it
changes what you would do next. Dead ends are named as such, so nobody drives
down one twice.

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

### FINDING — the winning hands carry fewer bodies and more gear; two explanations are dead

`topic: dealt-hands`

Best dealt hand **40%**, worst **26%** — a 14-point spread, the largest effect
measured in this game. Eight hands dealt by seed:

```
top half vs bottom half
  bodies    3.5  vs  4.3      ← so GEAR 2.5 vs 1.7, the same fact backwards
  atk       1.8  vs  2.9
  hp        8.5  vs  9.4
  counter   2.5  vs  2.6        (no difference)
  keywords  2.5  vs  2.5        (no difference)
```

**Two explanations have been offered for this and both are now dead.**

**The rubber band is not it.** `answer * 0.5`, `* 0.30`, `* 0.20` and `DEEP_BITE`
halved all give bodies 3.5 vs 4.3 and atk 1.8 vs 2.9. The same decks win whatever
the difficulty scaler does.

**And the room rule is not it either, which was this file's own stated design
identity for exactly one round.** The claim was that fewer bodies keeps slots
free, free slots mean warmth, and warmth is worth +17. The test was named — do
the winning decks stand on emptier boards — and then run:

```
                        top half   bottom half
free slots a turn         2.79        2.78
warmed on                  90%         90%
```

**Identical.** On real runs the deck grows to fill the board either way, so the
starting hand's body count does not decide board occupancy at all. A design
identity was declared on this a round ago and it is withdrawn.

**What is left is a description, not a mechanism, and it is stated as such.**
Hands are six cards, so "fewer bodies" and "more gear" are the same number:
**2.5 pieces of gear against 1.7**. Gear-heavy hands win by 14 points. That is
consistent with the purse finding (money buys gear and charms and is worth +19)
and with holding gear being the only non-denial habit to price above zero — but
consistency is not a mechanism, and the mechanism is untested. Two guesses have
now died here; the third will be a measurement or it will not be written down.

**THE THIRD ATTEMPT WAS A MEASUREMENT, AS PROMISED, AND IT LANDS.** The pilot's
plays are recorded per run now, so the question "do gear-heavy hands do something
different with a turn" has an answer rather than a story:

```
per RUN   (confounded — winners live longer)   gear 67.7 vs 57.8 · wardens 62.2 vs 61.8 · turns 168 vs 157
per TURN  (the one that answers it)            gear 0.403 vs 0.368 · wardens 0.371 vs 0.394
```

**It is a substitution, not more activity.** Total actions a turn are 0.774
against 0.762 — the same. The winning hands spend **more of their turns on gear
and fewer on bodies**: 9.5% more gear plays per turn, 6% fewer deployments.

The per-run figure is shown next to it deliberately, because on its own it says
"winners play 17% more gear" and that is mostly just winners living 11 turns
longer. Two explanations died here on guesses; this one is a count, and the
confound it could have hidden behind is printed rather than quietly divided out.

**What it is not:** proof of cause. These decks differ in composition by
construction, so "they play more gear" partly restates "they were dealt more
gear". It is a description of how the winning hands are played, and it is
consistent with the two largest things in the file — the trader rung is +19 and
gear is most of what money buys, and holding gear is the only habit besides
denial ever to price above zero.

### FINDING — Cold wins because it is the only course that takes a turn

`topic: course-why`

Cold beats Hearth by **8 points at 3.1σ**, which is a bigger effect than the
fight rung. The reason is in the five course definitions, which this file had
never actually read:

| course | what it gives | what kind of thing that is |
|---|---|---|
| **Cold** | the first wave's front arrives carrying **Frost 1** | **a turn** |
| Hearth | Spice 1 on deploy, one warden saved per fight | damage, then a body |
| Scrap | first gear each fight is free, the fallen come back patched | a turn's action, then a body |
| Bodies | a packed board keeps its warmth, Shell 2 on deploy | the room rule, then armour |
| Gear | gear leans, and it comes back round | resources |

**Frost skips a foe's whole turn. Nothing else on that list does.** Cold has
already been nerfed once for exactly this — the note above its definition records
that Frost on EVERY arrival measured 41% against a 22% baseline "while the other
four sat at 29-32 — not a choice, a favourite". It was cut back to the front of
the first wave only, and it is *still* 8 points clear.

**This is the fourth independent time this game has said tempo beats resources.**
Denying a scheme is worth +10 and every damage habit prices at zero, because a
denied scheme is a foe's wasted turn. Hearth was rewritten three times around
damage and measured nothing each time, and its own note concludes "every other
course changes what the fight IS; Hearth changed a number in it". Now the course
table says it again from the top.

So the leader screen currently offers **one tempo choice and four resource
choices**, and the tempo one wins. The fix is not to nerf Cold a second time —
that was tried and it is still ahead. It is that the other four need a rule that
costs the foes a turn rather than paying the player a resource, and that is a
design round of its own rather than a coefficient.

**AND THE HYPOTHESIS WAS TESTED, AND IT IS NOT ENOUGH.** "Tempo beats resources"
predicts that giving the weakest course a turn-cost should close the gap. Hearth
is the weakest at 38%, and it was given one: the warden its rule saves stays up
AND whatever felled it is Frozen 1. At 840 runs an arm:

```
hearth, three resource rules      38%
hearth, plus a turn-cost rule     38%      ← the fourth rewrite, the fourth zero
cold                              46%
```

**Zero.** Which sharpens the finding rather than confirming it. Cold's Frost lands
on **the front of the first wave — turn one, before anything has happened.**
Everything Hearth has ever tried lands late: a body saved after it was nearly
lost, a foe frozen after it already killed. **A turn taken at the end of a fight
is worth what a resource is worth: nothing.** The currency was never the whole
story; the timing is. The next attempt at this course moves *when* its rule fires,
not what it pays in — and reverted rather than shipped, on the standing rule that
a mechanic measuring zero is not free.

**AND THE TIMING THEORY IS DEAD TOO. Five rewrites, five zeros.** The last round
concluded it was not the currency but the timing — Cold's Frost lands on turn one
and everything Hearth tries lands late. Clean test: take Hearth's existing save
and move it to the START of the fight, same currency, different moment (the first
warden deployed each fight arrives with Shell 6, a pre-paid save). At 840 an arm:

```
hearth, save at the moment of death   38%
hearth, save moved to turn one        38%      ← fifth rewrite, fifth zero
cold                                  46%
```

The full record on this one course:

| what Hearth was given | result |
|---|---|
| Spice 2 on deploy | nothing |
| Spice kept up turn after turn | nothing |
| a body saved, at the moment of death | nothing |
| a foe's turn taken, at the moment of death | nothing |
| a body saved, moved to turn one | nothing |

**Neither the currency nor the timing explains it — it was MAGNITUDE, and the
sixth attempt is the first that lands.** Five rewrites had asked *what* Hearth
pays in and *when* it pays; none had asked *how much*. Every Hearth rule was
bounded to ONCE A FIGHT while Cold's Frost lands on the whole front of the first
wave. The claim standing in this entry for four rounds — "regen is a threshold
good, there is no setting between +0 and +17" — is **false**. There is a dial and
it was never turned. At 420 runs an arm, against Hearth's 38%:

```
+1 regen to the ONE most-hurt warden a turn      52%      ← SHIPPED
+1 regen to the two most hurt                    51%
+1 regen to the whole line                       58%
```

**The first warden buys +14 of the available +20.** The curve is steeply
diminishing and the second point of it is worth nothing at all (52 → 51 is inside
±5). So the smallest setting that works is what ships: `emberline`, one extra
point of regen on the single most-hurt warden each upkeep. Hearth goes 38% → 52%
and the course table inverts — Hearth is now the *best* of the five and Cold, at
45%, is second.

**AND THE METHOD GENERALISES, WHICH IS WORTH MORE THAN THE COURSE.** Two more
courses sat on the courseless baseline, each with exactly one number in it, and
both numbers were literals inside a closure — which is why nobody had swept
them: *a dial nobody can turn reads exactly like no dial*. Named as fields and
swept at 450 runs an arm against 40% for declaring nothing:

```
BODIES  Shell 2 (was)  41%   Shell 4  44%   Shell 6  47%   Shell 9  52%
SCRAP   1 free (ships) 40%   2 free   40%   3 free   39%   ALL free 45%
                                              family-of-4 bar ±8.9
```

**Bodies has a dial and Scrap does not.** Bodies spans 11 points and clears;
Scrap spans 6 and does not, even at the setting where every piece of gear in
every fight is free — which is the most that rule can possibly be worth. Three
courses, three different answers, from one arm each. The magnitude sweep is now
the *first* thing to try on a flat mechanic, not the last.

Two shapes of dial, and they want different decisions. Hearth's saturates: the
first point buys +14 of +20 and there is an obvious place to stop. **Bodies' does
not** — every two points of Shell buys about three and a half points of win rate
straight through the range measured, with no knee. A monotone dial with no knee
licenses "the amount matters" and picks nothing; the setting is then a design
decision and calling it a finding would be dressing one as the other. Shell 6
ships (47%, level with Gear, above Cold) rather than Shell 9 (52%, tying Hearth
for top) because creating a second favourite is what Cold was cut back twice for.

**AND SCRAP LANDS ON THE THIRD ATTEMPT, WHICH COMPLETES A PATTERN.** Two rules
failed — free gear (tempo) and a larger opening hand (cards) — and the third is
on the axis every course that works uses: **something on the board, every fight,
from turn one.** Every warden Scrap sets down arrives carrying Thorns. At 960
runs an arm against 40% for declaring nothing:

```
+0 (was) 40%   ·   +1 41%   ·   +2 44%   ·   +4 48%      spread 8, bar ±6.1  CLEARS
```

Monotone, which the two failed sweeps never were — they read `40/40/39/45` and
`40/40/37/39`, the shape of noise. Thorns 4 ships: the smallest setting measured
that clears, putting Scrap at 48% in a field running 45 to 52.

**Three stuck courses, three fixes, one shape.** Hearth failed five times paying
in damage and timing; Scrap failed twice paying in tempo and cards; Bodies was
never broken, only quiet. All three came off the floor the same way — put the
rule on the board, every fight, from turn one, then turn its one number up until
it measures. **It took eight nulls between them to see it**, and the reason it
took so long is that every failure looked like a question about WHAT the rule
pays in, and the answer was about WHEN and WHERE it fires.

**The older half of Scrap's diagnosis, which still stands.** The amount was not
what was wrong with the first two rules, so no rewrite of the amount would have
fixed them — and there is a reading in the
fight arm that says why: the pilot's gear-before-body threshold measured FLAT
end to end. If *when* you spend gear does not matter, a course whose rule is
"spend gear sooner" cannot matter either, however much of it you are handed.

**So a second axis was tried and it is also flat, which narrows the question
rather than answering it.** "Change what it pays in, not how much" was the
conclusion, and the axis picked was card advantage — a larger opening hand,
chosen because the constructed-deck arm had just shown at p=0.009 that what a
caravan holds decides runs. At 450 an arm against 40% for declaring nothing:

```
+0 (ships) 40%   ·   +1 40%   ·   +2 37%   ·   +3 39%      spread 3, bar ±8.9
```

**AND HEARTH'S RATE DIAL IS A THIRD NULL, IN THE OTHER DIRECTION.** With Scrap
fixed the course table read Hearth 53% against a pack of four at 44/44/44/42 —
one favourite and four courses nobody can tell apart, which is not a field. This
entry's own note said the first regen point buys +14 of +20, measured from +1,
+2 and the whole line: three points all at or above one point a turn. Below +1
there is no smaller amount, because regen is an integer — but there is a smaller
RATE. At 600 runs an arm:

```
every turn 53%   ·   every 2nd 47%   ·   every 3rd 47%      6 points, 1.9σ
```

**It does not clear**, so it is reverted rather than shipped, and the dial is
removed rather than left in at a default that changes nothing.

**What fixed the field was the pack coming up, not the favourite coming down.**
Scrap's thorns took it 40% → 47% and Bodies' Shell 6 sits at 46%, so the gap
from Hearth to the next course is about three points rather than nine —
without touching Hearth at all. Worth remembering the next time a table has one
tall bar: *there are two ways to close a gap, and the one that does not touch
the thing that works is usually safer.*

**The older Scrap nulls, which still stand.** Reverted on the standing rule that
a mechanic measuring zero is not free — two rules tried, two nulls, and the pair
ruled out the whole "hand" half of the game for that course — how much you hold and when you spend it — at every
magnitude either was tried at.

What is left untried is the axis every course that WORKS uses: **something that
happens on the board during a fight, every fight, from turn one.** Hearth mends
the line each upkeep, Bodies puts armour on every arrival, Cold takes the opening
wave's turn. Scrap's only rule on that axis is `patched`, and it fires on a
death — late and rare, the same shape that took Hearth five rewrites to escape.
Scrap has now failed twice for the reason Hearth failed five times, which is the
strongest hint available about where the third attempt goes.

**And the sweep arm stopped re-asking.** Scrap comes out of it: re-sweeping a
third magnitude on a course whose problem is demonstrably not magnitude costs
1,350 runs a round to re-learn the same null. Both readings live in the course's
own definition where the next person to touch it will read them.

Shipping the +17 version would have been the same mistake Cold made when Frost
landed on every arrival: 58% against a 40% courseless baseline is not a choice,
it is the answer. **The dial existed the whole time; five rounds were spent
looking for a different mechanism because "it measures zero" was read as "this
kind of thing measures zero" rather than "this amount of it does".** That is the
transferable half: a null on a magnitude-bearing mechanic is a null *at that
magnitude*, and none of the five previous tests varied one.

### FINDING — the courses are not indistinguishable; the baseline was

`topic: courses`

For a dozen rounds this table said no course beats another. It was asking the
wrong comparison. Every course was measured against **declaring nothing** — a
middling baseline where the gaps are about 4 points against a bar of ±4.9, so
nothing clears and the honest-looking conclusion is "they are all the same".

Nobody chooses between "cold" and "no course". The leader screen offers five and
asks which. **Best against worst**, at 450 runs an arm on the shipped build:

```
no course 40%  ·  hearth 52%  ·  gear 47%  ·  cold 45%  ·  scrap 40%  ·  bodies 40%

hearth 52%  vs  bodies 40%    12 points on a difference band of ±3.8  =  3.2σ
family of two bar   2.24σ     CLEARS
```

**The spread is real and it clears the bar.** The null was an artefact of what
the courses were compared against, and the arm prints both comparisons now.

**AND IT IS SETTLED, at the sample the arithmetic asked for.** Best-against-worst
failed to clear three rounds running — 3.2σ, then 2.1σ, then 1.7σ — and was
reported as news each time, which is a claim being re-announced rather than
resolved. The same method the deck arm used answers it: a course arm is a plain
win rate, so the band is binomial and the requirement is
`n = (1.29·√(2p(1−p))·100·z / Δ)²`. To resolve a 9-point spread at the
family-of-five bar: **683 runs an arm**, against the 210 it had been run at.

At 720 an arm:

```
none 47  ·  hearth 57  ·  scrap 55  ·  cold 54  ·  gear 51  ·  bodies 49
HEARTH 57 vs BODIES 49 — 8 points at 2.8σ on a ±2.9 band      CLEARS
```

**The courses genuinely differ and the instrument could not see it at 210.**
Two rounds running now, a number that would not resolve has resolved as soon as
somebody worked out the sample instead of deepening by feel — and both times the
prediction was right first try. *An unresolved claim is a sample-size question
until somebody does the arithmetic, and re-reporting it is not the same as
answering it.*

**And the RANKING inside it has moved once, which matters more than the spread.**
For a dozen rounds this table read `cold 46% · hearth 38%` and one entry up drew
a whole theory of tempo from it. Hearth's magnitude fix (see *course-why*) put
Hearth on top at 52% and left the spread almost unchanged at 12 points. So the
finding that survives is **not** "cold is the strong one" — that was a fact about
one under-tuned course, and it was read as a fact about the game for four rounds.
What survives is the shape: **five courses, one of them roughly 12 points clear
of the floor, and three of them piled at the courseless baseline of 40%.** Scrap
and Bodies pay 0 points over declaring nothing. They are the next magnitude
question, and the answer to them is now known to be a dial rather than a
mechanism.

This is the same lesson as the locked-deck arm one entry down, in a smaller
costume: **the comparison you set up decides what you are able to see**, and a
baseline chosen for convenience is a choice about the answer.

**And the older half of this entry, which still stands.** The worry the table was
built for was that a narrow course starves the board — declare for one thing and
you cannot answer a named wave. It does not: the narrowest pool answers a
telegraph **77%** of the time against **78%** for declaring nothing, and every
course stands 3.0–3.4 bodies. A course narrows what you are offered and does not
narrow what you can field.

### FINDING — the Frostwyrm is the wall of the deep fell, on purpose

`topic: frostwyrm`

One ordinary foe kills **24%** of real runs — a quarter of every death in the
game, and more than any beast. Its stat line, against the other five tier-3 foes:

| | hp | atk | cnt | keyword |
|---|---|---|---|---|
| **Frostwyrm** | **22** | **6** | 5 | **barrage** |
| Glutton | 20 | 5 | 5 | soak |
| Rime Knight | 18 | 5 | 4 | longshot |
| Packmother | 18 | 3 | 4 | crush 2 |
| Icewarden | 16 | 4 | 3 | soak |
| Stormcaller | 14 | 3 | 3 | longshot |

**It is the largest body in the ordinary pool on both axes and the only one that
pairs top attack with Barrage** — six damage to every warden in its lane, so a
stacked line takes eighteen. Six tier-3 foes and 68% of deaths in zone 3 puts a
uniform foe at about 11% of all deaths; the Frostwyrm is at **24%, 2.2x its
share.**

**Not a bug, and the check is that it is legible.** Barrage is announced, the
lane is visible, and the counter of 5 is the slowest in the tier — it is a thing
you can see coming and answer by not stacking a lane. A wall that kills twice its
share while telegraphing how is the shape a last zone is supposed to have. What
would make it a bug is if it killed at that rate on a counter of 2, or without a
keyword to read; it does neither.

### FINDING — the locked-deck arm was measuring the cage

`topic: trail`

Two rounds of this file said **"the trail is the biggest lever in the game, six
times the deck"**, and built on it. Every number behind that sentence came from a
caravan that cannot draft, shop or temper — a deliberately crippled run that
crosses 2% of the time. Run on REAL runs, which cross 32%, almost nothing about
it survives.

```
                                   locked        LIVE (real runs)
crossing rate                        2%            32%
zones reached, average              1.28           2.10
the TRAIL (won/lost variance)        7.7%          29.5%
the DECK                             0.5%           0.9%
the MATCHUP                         29.8%          21.7%
deaths in zone 2                      73%            33%
deaths in zone 3                      26%            67%
top killer                    The Weeper 19%   Frostwyrm 24%
The Weeper's share of deaths         19.4%          4.7%
```

**The wall moves from zone 2 to zone 3, and the top killer stops being a beast at
all.** On a locked deck the two Long Shelf bosses are 37% of every death; on a
real run the Frostwyrm — an ordinary foe — kills more than any beast, and the
Weeper falls by four times.

**And the variance share was the wrong statistic to reason with.** The deck
explains 0.9% of the variance on real runs, which sounds like "the deck barely
matters" and is how this file has been reading it. But the same arm reports **best
starting deck 40% against worst 26%** — a **14-point spread in win rate**, larger
than any single rung of the skill ladder. Both are true: a share of variance
answers "how much of the spread does this factor account for, given how much the
others vary", and an effect size answers "how much does changing this change your
odds". **The deck is a 14-point lever that happens to sit next to a trail that
varies more.** Three rounds of "cards do not matter" rested on conflating the two.

What survives: **the trail is still the largest single factor** (29.5% against the
deck's 0.9% of variance), and **the draw order is still worth nothing** (0.0% in
both arms, best draw order 33% against worst 32%). What does not survive is every
specific claim about *where* the trail's influence sits.

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

### FINDING — gear-heavy hands win by 14 and the pilot's gear dial is flat

`topic: gear`

The variance arm's surviving explanation, after two dead ones, was gear: the top
half of dealt decks carries **2.5 pieces of gear against 1.7**, and — the part
that made it a candidate rather than a coincidence — it plays more gear **per
turn**, not merely more per run. Two things fit that, and for two rounds the file
printed both and tested neither:

* the **deck** is better — gear beats bodies, and this is about what you carry;
* the **pilot** is worse — it deploys a warden whenever it can and only jumps the
  queue with gear worth 6 or more, so a gear-heavy hand forces good play on it by
  removing the bodies it would otherwise waste turns on.

The second was untestable only because `holdGear` is a **switch**, and off means
"gear always first" — one end of a dial rather than the dial. `GEAR.bar` is the
dial. Swept end to end on the decks the pilot already draws, 450 runs a bar:

```
gear always first (2.5)   44%        gear worth 8+ first    42%
gear worth 4+ first       45%        gear never first (99)  43%
gear worth 6+ first       40%   ← what ships
                    spread 5 points · family-of-5 bar ±9.2
```

**Flat, end to end.** Playing every piece of gear the moment it is drawable and
never playing one before a body are **within 2 points of each other**, and the
whole range is inside its own family band. So the second explanation is dead:
no setting of the pilot's gear preference buys a point, and the 14 points cannot
be about how much gear the pilot chooses to play.

**The shallow run said the opposite and that is the reusable half.** At 72 runs
a bar the same five read `43/46/47/46/39` with the shipped bar on top and a clean
story about a well-tuned pilot; at 450 they read `44/45/40/42/43` with the
shipped bar at the bottom. **The ranking inverted completely between samples**
while the spread stayed inside the band both times — which is exactly what a flat
dial looks like, and exactly what a ranking read off a small sample will hide.
The arm is gated on the **spread**, not on where the shipped value ranks, because
a ranking inside its own band is noise no matter how satisfying its shape.

**AND THEN THE 14 POINTS TURNED OUT NOT TO BE A NUMBER AT ALL.** Three rounds of
work chased "gear-heavy hands win by 14 points". That figure is the win-rate gap
between the top and bottom halves of eight decks — **where the halves were made
by sorting on win rate.** Sort eight noisy rates, split them down the middle, and
the halves differ by construction with no deck needing to differ from any other.
It is not a finding, it is the definition of the split, and it was printed as a
headline for three rounds because nobody asked what the number would be if
nothing were true.

The composition gaps are the half worth keeping — they are *not* selected on —
but they had never carried a band either. There are exactly C(8,4) = **70** ways
to split eight decks in half, so the null is enumerated rather than assumed: every
split, every gap, no normality and no RNG. At 2,592 runs:

```
gear played a run  +16.1  p=0.09     bodies carried  −1.8   p=0.11
gear per turn      +0.112 p=0.06     free slots      +0.28  p=0.06
```

**Suggestive, and not one of them clears** — least of all across a family of
four. The honest statement is that the winning decks *may* carry and spend more
gear and stand on emptier boards, and this instrument cannot say so yet.

**The obvious next move was tried in the same round and it did not work,** which
is worth more than the guess was. With eight decks the smallest p a permutation
test can return is 1/70 = **0.014**, so p=0.06 is the fourth most extreme split of
seventy and the resolution looked like the problem. Fourteen decks gives
C(14,7) = **3,432** splits and a floor near 0.0003 — plenty of resolution. It read:

```
gear played a run  +4.6   p=0.52     bodies carried  −0.6   p=0.53
gear per turn      +0.038 p=0.33     free slots      +0.16  p=0.23
```

**Further away, not closer.** The effect sizes roughly quartered. One honest
confound: the 14-deck pass ran 60 runs a deck against the 8-deck pass's 108, so
each deck's rate is noisier, the sort is noisier, and the composition gaps
attenuate — the two are not a controlled comparison of deck count. What they ARE
is two configurations, and **the gaps failed to clear in both.**

**AND THE DIRECT ARM WAS BUILT, AND IT ANSWERS IN ONE RUN.** Everything above is
observational: deal decks at random, sort them by outcome, ask what the winning
end has in common. Four rounds of that produced one artefact and four nulls. The
direct question — deal decks that differ **on purpose** and run them against the
same trails — had never been asked.

Six decks of 4 gear + 2 wardens against six of 5 wardens + 1 gear, sampled from
the same pool by the same seeded shuffle, alternately so neither side is dealt
what the other already spent, on the same seeds. Two wardens is the floor a
caravan can function on, so the contrast is as wide as the game allows rather
than as wide as looks impressive. At **3,600 runs a side**:

```
                    crossed        how far it got (0-3)
4 gear + 2 wardens    4.1%              1.36 zones
5 wardens + 1 gear    1.4%              1.24 zones
                     +2.7 points        +0.13 zones
             p=0.009 over 924       p=0.009 over 924
```

**Composition is real, and both responses agree at p=0.009.** The null is the
same enumeration used above — every way of calling six of the twelve decks one
thing — so nothing is assumed about independence, which matters because runs
sharing a deck are correlated and the binomial band (±0.5) badly overstates the
certainty.

**The direction of the retracted headline was right and its size was nonsense.**
Gear beats bodies; it beats them by **2.7 points**, not fourteen. In relative
terms that is a tripled crossing rate, which sounds enormous and is measured
against a 1.4% floor — the honest absolute number is small, and both are worth
saying.

**AND RUN LIVE, THE EFFECT SIZE SURVIVES AND THE RESOLUTION DOES NOT.** The
locked arm is a caravan that cannot draft, shop or temper, so the limit was
named in the same breath as the finding. The same twelve built decks as STARTING
hands in real runs, 3,600 a side:

```
                    locked          live (the deck grows)
4 gear + 2 wardens   4.1%                40.6%
5 wardens + 1 gear   1.4%                37.6%
                    +2.7  p=0.009       +3.0  p=0.288
```

**The point estimate is the same — +2.7 against +3.0 — and it stops clearing.**
That is not the finding washing out, and calling it that would be as wrong as
calling it confirmed. What changes is the noise: locked decks cross 1–5% of the
time and live ones 31–49%, so deck-to-deck variance grows by far more than the
gap does, and the permutation null goes from p=0.009 to p=0.288.

Which is worth more than either number. **The locked arm's clean p came from the
floor suppressing variance, not from the effect being larger there** — a cage
can make a finding look sharper as easily as it can hide one, and four rounds of
this file's cages have all been the hiding kind. The honest statement: a
gear-heavy start is worth about three points whether or not you draft, and the
instrument can only prove it where the game is crippled.

**The transferable half is about method, not gear.** Four rounds of observational
work on a question that a constructed comparison settled in one run, and the
reason the observational versions kept failing was never the sample size — it was
that sorting on the outcome cannot separate a cause from the sorting. *When a
finding refuses to resolve, check whether the question is observational before
buying more runs.*
### FINDING — the three unsupported nulls, spent and settled

`topic: null-audit`

The ladder's 2σ is ±5.5, so a null on it means **"no effect larger than 6
points"** — and three entries rested on one. Settling each was costed at 4x the
sample, about four minutes now the probe is pooled, and had never been spent.
Twelve minutes. Spent:

| entry | at 210/arm | at 840/arm | verdict |
|---|---|---|---|
| **courses** | five within 2σ | 38–46% against 42%, family bar ±4.9, **0 of 6 clear** | null CONFIRMED |
| **the lesson's dose** | 18/18/18/18 | all doses **18%**, band **±1.1** | null CONFIRMED, tightly |
| **the telegraph** | worth "roughly nothing" | ladder **28 points with it, 28 without** | null CONFIRMED, exactly |

**All three hold, and two of them are now much stronger claims than they were.**
The lesson's dose is not "within 6 points" any more, it is within **2** — once,
twice and every-zone are the same number at a band of ±1.1. The telegraph is not
"worth roughly nothing", it is worth **nothing measurable**: 11/22/38/39 with the
telegraph on and 11/22/38/39 with it off, rung for rung, over 840 runs an arm.

The courses are the interesting one. **The null is confirmed and the spread is
still 8 points wide** — cold 46%, hearth 38% — which the family bar of ±4.9 does
not let anyone call. Confirming a null is not the same as showing the thing is
flat; it means no course clears the bar for *being named the best*, which at six
simultaneous questions is a high bar. A seventh round at 4x again would resolve
it and nobody has asked the question that badly.

**The general point, which is worth more than the three results:** "the
instrument cannot support this" is a statement with a price tag on it, and the
price was four minutes each. A file that says "unresolved" and does not spend the
four minutes is choosing not to know.

### FINDING — what this file is mostly about, counted

`topic: file-shape`

Of **35** entries, **22 are about the game** and **13 are about the instruments
and my own mistakes** — 63/37. That is a defensible stock. The flow is not:

```
the last five rounds added      2 game entries
                                6 instrument/method entries
the ladder over those rounds    27, 27, 27, 27, 27 points · 10% floor every time
```

**Nothing shipped in five rounds has moved the ladder, and the reason is visible
in the ratio.** The rounds went into the probe being wrong (unlocks accumulating,
counters merging badly, a band nobody had measured, a timing bar that fired on
six suites) and each of those was worth finding — the unlock bug alone invalidated
a headline — but none of them is a change to Frostfell.

**The game is not finished, and saying so is not the same as saying the work is
documentation.** Three live questions each have a named next measurement:

| question | the next measurement |
|---|---|
| why do gear-heavy hands win by 14 points | the mechanism, after two dead guesses |
| why is Cold 8 clear, and can another course be made to matter | move a course's rule EARLIER, not change its currency |
| the trader is +19 and the fight is +9 | whether that is the game it wants to be |

**The rule this suggests, and it is about how rounds are spent:** an instrument
finding is worth having when it changes what a number means — the unlock bug
changed every ladder in the file. It is not worth having when it only changes how
fast the number arrives. Five rounds is enough time in the workshop.

**THE RULE APPLIED BACKWARDS, which is the point of writing one.** Every method
entry was re-read against it — did this change what a number MEANS, or only how
fast it arrived?

| entry | verdict |
|---|---|
| the unlock bug | **means** — invalidated every ladder in the file |
| the ladder's own band | **means** — every single-point claim, retired |
| points vs odds (scale) | **means** — one table's conclusion reversed |
| a band is measured, not derived | **means** — every band quoted here |
| an arm can only license what it can see | **means** — a card change reverted |
| the deck share was mine | **means** — 4.8% became 1.6% |
| nulls the ladder cannot support | **means** — three of them then settled |
| read state, don't intercept calls | **means** — three wrappers measured nothing |
| the instrument's limits | **means** — it can price a teaching change after all |
| contrast, and the sweep rule | **means** — both found defects nobody could see |
| **the probe is 22% faster** | **SPEED ONLY — cut** |

**One of thirteen was speed.** The parallelism entry recorded a real 82s → 64s and
changed no number's meaning; the bug that work turned up is kept (it invalidated
every ladder) and the speed is not. The audit entry folded into it, because two
entries about one bug is what rule 2 exists to stop.

That is a better ratio than the flow suggested — the method work has mostly been
worth it. What the flow says instead is that **five rounds of it in a row is too
many**, whatever each one was worth on its own.

**AND THE RETIREMENTS, AUDITED — because the count has been held at 33 for eight
rounds by one-in-one-out, and a habit that keeps a number steady is exactly the
kind that hides a drop.** Every topic set from the last fourteen commits to this
file, diffed: **12 retired, 32 → 33 across the span.**

| retired | where it went |
|---|---|
| `probe-wrappers` | a row of the instrument table — *read state, don't intercept calls* |
| `shelter` | a clause in the fight entry, with the 25 points kept |
| `ladder-band` | absorbed whole by `sample-size` |
| `card-worth`, `first-fight`, `telegraph`, `defeat-screen`, `shot-walk`, `source-split`, `unlock-audit`, `parallelism` | folded into a surviving entry, number intact |
| **`boss-norm`** | **dropped** |

**Eleven of twelve were honest and the twelfth was not, in the way that costs
most.** `boss-norm` held the largest single lever anyone has measured here —
fixing the boss per zone takes the trail's share from 32.5% to 13.9% — and when
it went, `index.html` was left saying *"see DESIGN.md for what to do about the
boss"* about an entry that had not existed for four rounds, while the DEAD ENDS
entry went on calling itself *everything built, measured and thrown away*. A
completeness claim that outlives its own falsification is precisely what rule 2
is for, and one-in-one-out is what put the pressure on.

Both halves are fixed and both are now checked: a dead end kept as a code comment
tags itself `dead-ends: <slug>` and the slug must appear in the entry, and every
`DESIGN.md#anchor` the README links to must resolve. **The count target is
retired too** — rule 3 says *about 35* and asserts ≤38, and squeezing to hold 33
against a rule that never asked for it is how the one drop happened.

### FINDING — the ladder, and which of its numbers is the one being defended

`topic: ladder`

Five pilots, each the one above it plus one more thing it knows how to do, so
the gap between two rows is that one thing. **At 516 runs an arm**, which is
where the rungs were finally settled rather than guessed at:

| pilot | | worth |
|---|---|---|
| careless | takes the leftmost card, swings at the nearest thing | 10% |
| + the fight | denies schemes, answers a named wave, places bodies, holds gear | 27% (**+17**) |
| + the trader | spends well | 44% (**+17**) |
| + steering the pool | drafts to a course | 47% (+3) |
| + choosing its road | takes every fight rather than an arbitrary fork | 55% (+8) |

**45 points, ± 7.** The total had read 33 for two rounds and 27 for four before
that, and the only thing that ever moved it was *deleting* three cards.

**BUT IT IS THREE RUNGS, NOT FOUR, AND THAT IS THE READING.** The bottom two
print as ranges — +3 and +8 against a 2σ band of ±8.0 — and this is at *twenty
times* what the default check can afford. Sized properly they want 14,700 and
2,064 runs an arm. A rung nobody will ever pay to read is not a measurement, so
`steering the pool` and `choosing its road` are one rung: they are the same habit
seen twice, one steering the CARD POOL toward what the deck wants and the other
steering the TRAIL toward the fights the deck can take. Apart, ±8 swallows both.
Together they read **+11** and clear.

The five pilot modes are untouched and the shape chart still draws all five rows.
This changed what the ladder claims to have measured, not what it ran.

**AND THEN IT WAS RUN AT THE SAMPLE THAT SETTLES IT — 1,317 AN ARM, 3,951 RUNS.**
Not "it now asks for less": the corrected forecast was paid, and every rung
clears. No `?` anywhere in the row for the first time in the ladder's history:

| the fight | the trader | steering the run | |
|---|---|---|---|
| **+15** | **+18** | **+12** | **= 45 ± 4** |

**The fold is vindicated by the same run.** Apart at that sample the halves read
`steering the pool +7` and `choosing its road +5?` — so the trail half *still*
does not clear at four times the sample that was supposed to settle it, while the
two together read +12 and clear comfortably. One rung of +12 says something; two
rungs of "+7 and a range" say less than that, at three times the price.

45 points, ±4, three resolved rungs. The total has read 27, 33 and 42 across the
project's history and every one of those was quoted against a band it could not
support; this is the first one that can be.

**AND THE RUNG IS NOT A DECISION, WHICH IS THE MORE USEFUL HALF.** A rung worth
+9 says a pilot that takes every fight beats one that picks arbitrarily. It does
not say the fork is a CHOICE — that needs a strategy which beats taking
everything, and nobody had looked for one. Five now have, at 600 runs an arm:

```
takes every fight                       51%
spends a full purse before fighting     50%   −1
banks zone one, coasts zone three       49%   −2
ducks to a quiet stop when hurt         47%   −4
skips the packs and beasts              44%   −7
walks past what it can                  34%  −17
```

**Nothing beats it.** The best of five is −1 against a family bar of ±8.2, and
the ordering runs monotonically down with how much fighting each does. **The
trail screen asks a question with one right answer**, which is furniture with a
signpost on it — the exact thing this file wrote about the quiet road two rounds
ago and then fixed, reappearing one level up.

**AND THE FIX WAS THE LESSON THE COURSES HAD JUST FINISHED TEACHING.** Every
quiet-road payout fired ONCE, at the moment you stepped on the node — the camp
mends, the rest stop offers a fourth blessing, the shrine asks for nothing. That
is the "lands late and rare" shape that failed five times on Hearth and twice on
Scrap, and all three courses came off the floor the same way: something on the
board, every fight, from turn one. The quiet road needed the same thing, and the
right move was not a fourth guessed reprice but the axis already paid for.

So the quiet road leaves the caravan RESTED, and a rested line mends its
most-hurt warden every upkeep for the next few fights — Hearth's own shape,
which is the one payout on this board measured to be worth anything. Earned by
walking rather than declared, and it decays. At 450 runs an arm, ducking-when-
hurt against taking everything:

```
rest lasts 0 fights (as it was)   ducking −3
rest lasts 1 fight                ducking +3      ← ships
rest lasts 2 fights               ducking +2
rest lasts 4 fights               ducking +1
```

**The sign flips.** *Level* is the target rather than better — a fork where one
side always wins is furniture with a signpost, and a fork where the two sides
sit inside a band is a question worth asking. One fight is both the smallest
setting and the best, so there is nothing to guard against: **longer rests are
worse**, because a rest that outlasts the trouble it was taken for stops being a
reason to walk now.

**AND THE FIRST CUT PAID PEOPLE WHO DID NOT MAKE THE CHOICE.** Shipping it
lifted the COURSELESS baseline by eight points and pulled the ladder from 46 to
42 — a strange result for a rule meant to make one fork a decision. Run with the
dial forced off and on, the same ladder reads:

```
rest off   8 / 26 / 39 / 42 / 54      = 46, fifth rung +12
rest on   12 / 29 / 45 / 51 / 54      = 42, fifth rung  +3
```

**Every rung lifted except the one that always fights**, which is the tell. The
rest was granted for any non-fight node opposite a fight, and the CARELESS pilot
picks an arbitrary fork — so it landed on quiet nodes about half the time and
banked a rest it never chose. A rule paying for the outcome rather than the
choice is the quiet road's own original defect, inverted.

Fixed by granting it only where rest is actually to be had — camp, rest stop,
shrine — because **a shop is not rest and neither is a cache**. The sweep is
unchanged afterwards (−3 / +3 / +2 / +1), which is exactly right: the ducking
pilot steers for those three nodes anyway, so the decision keeps its value and
only the accident stops paying. The
question that finally moved it was not "what else can be tuned" but **what is
the ladder not asking about at all**.

Every rung was a thing the pilot KNOWS — how to fight, how to spend, how to
steer the offers. None was about which way it GOES, and the top rung had been
choosing forks with `(seed + step) % length` since the trail was built: an
arbitrary pick, once a step, on the one screen that offers a decision. The dodge
arm has had the number for rounds — it reads "takes every fight" at 49% against
the ladder's 41% — and nobody made it a rung.

So **33 was not the instrument's ceiling; it was the ceiling of what the
instrument was asking.** On a ±2.8 ladder band (2σ = ±5.5) nine points clears
comfortably. The general form is worth more than the number: *a ladder measures
the dimensions you gave it, and a total that will not move is as likely to be a
missing dimension as a game that does not reward skill.*

The six-point jump from 27 to 33 the round before came from taking three cards
out — see [auras](#finding--the-prescription-for-a-flat-pool-was-an-aura-and-it-did-not-work).
Two rounds, two moves, and neither came from tuning anything: one from deleting
content, one from measuring something nobody had measured.

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

**And the rule that outlived the entry it was written in.** Six instruments in
six rounds measured nothing, and the one failure worth carrying forward is that
**wrapping an export sees nothing**: `FF.buy`, `FF.takeCard` and `FF.triggerUnit`
are exports and the game calls the module-scoped versions internally, so three
separate arms hooked functions the game never calls and reported clean zeroes.
*Read the state* — the deck, the board's counters, the price at the decision
point — rather than intercepting the call that is supposed to change it.

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


**AND A STAMP CAN DESCRIBE A GAME THAT NO LONGER EXISTS**, which is the failure
mode the stamp file was not built for and had already suffered. It exists to
catch an arm listed as standing and never run — "no reading recorded, run it".
The opposite defect is worse and looks like an answer: `FF_CARDS` had been
reporting **"widest coldbearer −6.7, best backdrift +1.7"** every default run,
and both cards were CUT two rounds ago. The summary was quoting a measurement of
a card set the game does not have.

A reading is prose with numbers in it and almost none of it can be validated —
but it quotes **card ids**, and those can be. Any lowercase word in a stamp that
used to be a card id and no longer is now fails the suite, against a register of
cut ids kept beside the arms list. It cannot know a number went stale; it can
know the game changed underneath one, which is the case that actually happened.

**And every stamp now carries the BUILD it was taken on**, because the card-id
guard only works on the one part of a reading that is checkable and every NUMBER
in every stamp has the same problem. A date would answer "how old", which is the
wrong question — an arm run before a round that changed nothing it measures is
not stale, and one run before a round that rewrote a course is, on the same day.
The stamp carries a fingerprint of the two files an arm actually measures, the
game and the pilot, and the summary says `ON AN OLDER BUILD — re-run before
quoting` against every reading that does not match. On the round it went in it
flagged **15 of 15**, which is correct and not flattering.

It is deliberately coarse: any edit to either file invalidates every reading,
including a comment or a colour. That over-reports, and that is the right
direction — **a reading wrongly flagged costs a re-run, and a reading wrongly
trusted costs a round of building on it.**

**And a red light nobody can clear is a red light taped over**, so the cost of
clearing it is printed beside it — and then the list was cut until that cost was
something somebody would pay. Every stamp carries its build and the summary sums
each arm's own sample, which turns tidiness into arithmetic: **an arm earns its
place if somebody would pay to re-run it.** Five would not — `FF_PAIR` and
`FF_GIVE` are narrowings that cannot write a reading of their own, `FF_GEARBAR`
and `FF_NOWAVE` are settled nulls nothing depends on, `FF_LIVEBUILT` folded into
`FF_BUILT` as a setting, and `FF_BUILT` retired on the size of its own answer.

**The refresh went from ~35,800 runs across 18 arms to ~3,500 across 13.** That
is rule 3 applied to the instrument rather than the record, and the number is
what made the decision obvious: at 35,800 the honest answer was "a release step
nobody will take", and at 3,500 it is a thing you run before a round you intend
to build on. Run, it read **13 of 13 current, 0 stale.**

**And that banked set lasted zero rounds, which was the fingerprint's fault.**
The same commit that recorded it also wrote a page of comments into the game and
the pilot, so the hash moved before the merge landed. *A marker that invalidates
itself faster than it can be cleared is not a marker, it is noise with a red
light attached.*

Two ways out — run the refresh as the genuinely last step after every edit, or
stop counting edits that cannot affect a measurement. **The second is the only
one that survives contact**: the first is discipline, and discipline fails on
the round somebody fixes a typo after running the arms. A comment cannot change
a win rate, so block comments, whole-line comments and runs of whitespace come
out before the hash. What is left is the code an arm actually exercises, and a
round spent writing prose about measurements leaves every measurement standing.

The property is asserted rather than asserted *about*: the same hash taken over
a copy of the game with a block comment, a line comment and extra whitespace
spliced in has to come out identical, and a changed constant has to move it. It
is one regex away from silently not being true, which is exactly the kind of
claim that needs a test rather than a paragraph.

Re-run, `FF_CARDS` reads *no card of 57 clears 3.33σ, widest sleetrunner −10.8;
giving from a locked floor: 0 clear it, best frostmite +4.2*.

**`FF_GIVE` came off the standing list rather than being run**, and it is the
same defect from the other side. It read "no reading recorded — run it" for three
rounds because it was listed as something that produces a reading, and it is not
one: it narrows `FF_CARDS` to a named handful exactly as `FF_HABIT` narrows
`FF_ABLATE`, and reports through that arm's table. **A modifier listed as an arm
makes the summary claim something untrue about the state of the measurements**,
which is the same harm as an arm never run, and three rounds of reading "run it"
never prompted anyone to ask whether it was runnable.
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
after cutting the auras     +17     15 of 17       9%
```

The set fell to **+12** for two rounds in between and that was written off as
drift. It was not drift: three aura cards were in the pool, and taking them out
put it back to +17. See [auras](#finding--the-prescription-for-a-flat-pool-was-an-aura-and-it-did-not-work).

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

**And the sign on placement is the third measurement of one thing.** "Shelter any
body that cannot survive the biggest swing" priced at **−7** at the fight rung;
"always park the leader in column three" at **−7**; "place bodies where they will
be hit" beat filling the nearest free slot by **+4**. Three separate heuristics,
all of them forms of keeping bodies out of the fighting, all of them negative.
The front column ticks twice and swings land on the front of a lane, so a pilot
that protects its wardens is a pilot doing less fighting. That is not a quirk of
one heuristic; **it is what this board is**, and the two cards built to exploit
the opposite (Dawnpiper, Trailmarshal) were deleted after reading 25 points
against 28 with the habits they needed switched on.

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

**THE CAGE AUDIT, RUN AT LAST — and unlike the courses, this survives.** Every
number above was measured on a `tactics` pilot, which plays the fight and never
shops or drafts. The trail finding evaporated when it met a real run, so this one
was re-measured the same way, 210 runs an arm:

```
                          cage (tactics)   real (careful)
the fight, played well          19%             37%
every habit switched off         7%             25%
THE SET                      12 points       12 points
denial alone                    +15             +10
every other habit           0 to +4, noise   −2 to +3, noise
```

**The set is worth exactly 12 points in both, and denial is the only habit that
clears in either.** The cage was a fair control here — it moves the level, not the
finding.

**One number in this file was stale and is corrected: the set is 12, not 17–18.**
Both arms agree, so that is drift in the game across rounds rather than a cage
artefact.

**And two of the four audited findings were never caged at all**, which reading
the source settles without a run: the purse arm has always used `mode: 'careful'`
— real runs, drafting and shopping — and the lesson arm's careless pilot *is* its
subject rather than its cage, since the question is what a beginner gains from
being told.

**AND "DRIFT" WAS THE WRONG WORD — it moved in two steps and the arms file says
exactly when.** Every turned-up reading is stamped, so the set's history is a
lookup rather than a guess:

```
iter 33   19 points, denial +7
iter 34   17
iter 35   17
iter 36   14        ← Frostmite promoted common → rare
iter 37   12, denial +15   ← five aura cards added, the promotion reverted
```

**Both steps are card-pool changes, not instrument changes.** And the second one
is the interesting half: denial alone became worth **more than the whole set**
(+15 against 12), which is the signature of habits that stopped adding and
started substituting.

**Why nobody noticed a five-point move:** the ablation's per-habit table refuses
to print at the default sample — its band is ±3.0 and a ranking inside its own
band is noise, which is correct — but the SET total is printed every run and is
simply not something anybody was reading. The number was never hidden. It was
never looked at.

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
ladder three points; the surviving three were ordinary cards with interesting
text, which is worth something to a player and nothing to the pool's flatness.
The flat pool is still flat and the explanation is not "the cards were too local".

**And the three are now CUT, because they were never costed and they were not
free.** For two rounds this entry ended "the three stay in — they raise the
beginner's floor by two and cost the total two". That price was read off a
sample that could not support it. Removed, at `FF_RUNS=70`:

```
                       ladder                      fight set
with the three auras   8 / 26 / 39 / 38  = 27       12 points
without them           8 / 26 / 39 / 41  = 33       17 points
```

**They cost the ladder six points and the fight set five.** The entry that said
"two" was wrong by three on one number and by five on the other, and the set's
fall from 19 to 12 — traced across two card-pool changes and written off as
drift for a round — is these three cards. Drift is what an unmeasured change is
called by whoever did not measure it.

Why they cost anything is not mysterious in hindsight: all three hang a global
rule off a body, and the pilot's habits are all about *bodies*. Coldbearer paid
the line's warmth unconditionally, which quietly deleted the room rule — the
single decision the fight set is mostly made of. **A card that removes a decision
does not read as weak, it reads as flat, and it takes the ladder down with it.**

The `auraOn` primitive went with them, and with it the four sites that read it
(`hasRoom`, `isPacked`, `tickRate`, the upkeep coldsink). The rule stands:
**a mechanic that measures zero is not free** — and neither is one that was never
measured at all.

One thing found while building them, worth more than the cards: `def()` let a
second card claim an id and **win silently**. One of the five was named
`cairnwarden`, which already existed 100 lines down — the later definition
overwrote it, the new card vanished from the game entirely, and the suite went
green at 602 checks because every one happened to test the survivor. It throws now.

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

**AND IT IS NOW WORTH MORE THAN THE WHOLE SET, which is an arithmetic problem
nobody had done.** Denial alone reads **+15** and the set reads **+17**. They are
not additive, so that is not literally "the rest sum to +2", but it does bound
them: whatever the others contribute on top of denial is about two points, and
several price negative on their own. The habit table is not a row of small
positives and one large one. It is **one habit and some passengers**.

**AND THE PASSENGERS WERE MISCOUNTED FOR SIX ROUNDS — there are three, not
five.** `reposition` and `wave` were measured, emptied, and kept as switches so a
later round could re-check the sign, which was right; what was wrong is that the
ablation went on *pricing* them. Their on and off arms are byte-identical, so each
contributed a guaranteed 0.0 **and a slot in the Bonferroni family** — the real
habits were being judged against a bar sized for six questions when the arm only
ever asked four. Both halves of that were already written down, in this entry and
in the arm's own comment, one sentence apart; the subtraction was never done. The
pair arm had learned exactly this about `reposition` and filed it under DEAD ENDS.

They are dormant now — kept as switches, never priced, printed with what retired
each. Re-read on four live habits at 750 runs an arm:

```
the set                                    15 points
only denying schemes    19%   +8 of the 15   (leads the next by 6 at ±1.4 — resolved)
only holding gear       13%   +2             inside the band
only keeping a slot     11%    0             inside the band
only filling the front   9%   −2             inside the band
ONLY DENYING 19% against ALL FOUR 26% — the other three are worth +7, 2σ = ±2.8
```

**That is a healthier game than the file has been describing.** "One habit and
five passengers" was partly an artefact of counting two empty switches as
passengers: it is one habit worth 8 and three habits worth 7 together, and the
three clear their bar. What stays true is that each of the three is individually
inside the band — they are substitutes, not additions.

**AND THEN THE DENOMINATOR NOBODY HAD MEASURED, WHICH REVERSES THE DIAGNOSIS.**
A substitute only has work to do on turns the thing it substitutes for is
unavailable, so the question that sizes every "make the other habits stronger"
idea is *how many turns is that*. Read off the board across **622,306 player
turns**:

```
a scheme is on the board            39% of player turns
one this pilot can ACT on           15%
the board is BARE                   61%
```

**Denial is worth +8 on the 15% of turns it exists, and the other three are worth
+7 across the 61% where it does not.** Per turn available that is roughly a
four-to-one density, and it turns six rounds of "denial is strong, the others are
weak" into something else: *the others are weak because a bare board has nothing
on it to decide.* They are not failing at their job; they are being asked to fill
three fifths of the fight with a decision the fight does not contain.

It also explains the schemer dead end in one line. Giving four foes a scheme
converted bare turns into denial turns — it took the 61% down and handed the
share to the habit that was already winning, which is exactly what the arm
measured (denial +11 → +16 of the same set, the others +5 → +2). **The lever is
not the frequency of schemes. It is that 61% of turns are empty**, and the next
attempt belongs there rather than in another habit tweak.

**So the pairs were run against denial specifically** (`FF_PAIRS=45`), each as
`pair - none - (a - none) - (b - none)`, band on an interaction ±5.4:

```
deny + holdGear      −5.9        deny + reposition   +0.0   (dead switch)
deny + keepSlot      −5.9        deny + waves        +0.0   (dead switch)
deny + place         −4.4
```

**Every live pairing with denial is NEGATIVE, and unanimously so.** No single one
clears 2σ — the largest is 1.1σ — but three independent draws landing on the same
side is itself information the individual bands do not carry. The reading that
fits: denial buys a foe's wasted turn, and the other habits spend the pilot's
turn arranging the board to survive turns denial has already deleted. They are
not additive because they are partly **substitutes**, and a set totalling less
than its best member is what a set of substitutes looks like.

This does not license deleting them — a substitute is worth something on the
turns denial is not available, and there is no denial to do on a board with no
schemes on it.

**AND WHEN THE DELETION WAS ACTUALLY TESTED, IT FAILED, BECAUSE THE +15 AND THE
+17 WERE MEASURED IN A CAGE.** "One habit and five passengers" was the line this
entry closed on last round, and the obvious next move was to cut them the way
the aura cards were cut. So the pilot that ONLY denies was run against the pilot
that does all of them — on the `careful` pilot that also shops and drafts, which is
the game, rather than the `tactics` pilot that plays the fight and nothing else.
At 750 runs an arm:

```
only denying schemes          37%
all the habits                42%      the others are worth +5
                                       2σ = ±3.2   —   CLEARS
```

**They carry their weight.** Individually they still price at −2 to +0 in
the subtractive table and the pair table still says they substitute for denial;
collectively, on a pilot that has a purse and a draft to steer, they are worth
five points and that clears the bar. Both things are true and only the second one
answers "should they come out".

The cage is the lesson, and it is the fourth time on this project: **denial +15
against a set of +17 is a fact about the `tactics` pilot.** On the real pilot the
set is +19 and denial is +14 of it. A habit's value depends on what else the
pilot can do, so pricing habits on a pilot stripped of everything else measures
the strip, not the habit — the same shape as the locked-deck cage, the
hand-picked decks, and the courses' convenient baseline.

### RULE — compute the sample before running another one

`topic: sample-size`

Three findings sat unresolved for a total of nine rounds and all three were
settled the same way, in one run each, as soon as somebody stopped deepening by
feel and worked out what the question actually needed. It is the same arithmetic
every time and it was living in three separate entries, which is how a method
gets rediscovered instead of used.

**The formula depends on what kind of thing the arm measures**, and getting that
wrong is most of the difficulty:

```
a plain rate against a baseline    n = (1.29·√(2p(1−p))·100·z / B)²
a DIFFERENCE of two arms (a rung)  n = (1.29·100·z / B)²·(p₁q₁ + p₂q₂)
a CLUSTERED comparison (decks)     n = 2(z·SD_between / B)²   decks a side
```

The 1.29 is the measured calibration — this instrument's bands are narrower than
the formula's because arms share seeds. `z` is the family bar: 2.0 for one
question, 2.24 for two, 2.58 for five.

**`B` is the BAND you want, and it is not the effect you expect. Use `B = Δ/2`,
which is four times the runs.** This is the correction, and it was found by
following the table's own advice and watching it fail. It said `choosing its
road` would resolve at 517 runs an arm; run at 516 it read **+8 against a 2σ band
of 8.0** — sitting exactly on the line, still printed as a range. Not bad luck:
substituting `B = Δ` solves for *the sample at which the effect equals its own
band*, so clearing is a coin flip by construction. All three successes below
cleared because their effects came in bigger than the Δ they were sized for,
which is luck wearing the costume of a method — the fourth attempt was the first
one where the effect came in at its estimate, and it is the one that failed.

**The three worked examples, and what each cost before and after:**

| question | stuck at | the arithmetic said | ran at | answer |
|---|---|---|---|---|
| do gear-heavy decks win | 4 rounds, p=0.29 | 84 decks, 50,400 runs | 84 | **+1.9, p=0.042** |
| best course against worst | 3 rounds, 1.7–3.2σ | 683 runs an arm | 720 | **8 points, 2.8σ** |
| what steering the pool is worth | 2 rounds, +6 then +2 | 920 runs an arm | 510 × 5 bases | **+7.6 ± 1.2** |

**The one that teaches the most is the deck arm**, because it is the only one
where more of the obvious thing would never have worked: the true deck-to-deck
SD is 4.23 and binomial sampling was 2.00, so more runs *per deck* shrink the
smaller term and leave the larger one alone. **Four rounds of deepening bought
nothing because the binding constraint was decks, and nobody had asked which
term was binding.**

**And the fourth example is the one that pays for the other three**, because it
is the first time the method was used on a question whose answer was *no*:

| question | the arithmetic said | ran at | answer |
|---|---|---|---|
| what choosing its road is worth | 517 runs an arm | 516 | **+8 against a ±8 band — still a range** |

Sized properly (`B = 4`) it wants 2,064 an arm, and `steering the pool` wants
14,700. That is the reading that took the ladder from four rungs to three: an
arm nobody will ever pay for is not a measurement, and the two halves fold into
one rung that clears.

**AND THEN THE OBVIOUS WORRY: IS ANYTHING IN THIS FILE SETTLED AT A COIN-FLIP
SAMPLE? Audited, and the answer is no — for a reason worth keeping.** Every
"settled" finding above was sized with the broken form, so the fear is real; what
retires it is that **none of them is settled BY the forecast.** A forecast
decides how much you spend. The verdict is computed afterwards from the sample
actually run:

| finding | how it is judged | sized at | ran at | touched? |
|---|---|---|---|---|
| gear-heavy decks | permutation `p=0.042` over all labellings | 84 a side | 84 | **no** — a p is not a band comparison, and 84 is past even the corrected 64 |
| best course vs worst | `8 points at 2.8σ on a measured band` | 683 an arm | 720 | **no** — the σ is measured, not predicted |
| a ware's worth | against `familyZ(8) = 2.50σ`, measured band | — | — | **no** |
| the ladder rungs | `\|d\| ≥ 2σ` at this sample | 517 an arm | 516 | this is the one that failed, and it is fixed |

*A sample computed wrong makes a measurement expensive or lucky. It cannot make
one false.* What the broken form corrupted is only the promise "run N and it will
resolve" — and there, the damage is exactly what it looks like: **three
forecasts landed and the fourth did not, which at roughly even odds each is what
four coin flips look like.** The method's track record was itself inside its own
band, and nobody had noticed because nobody reports the forecasts that missed.

Two forecasts still used the old form and both now use `4·band`: the pair arm's
set-minus-sum, and the decks comment (`B = 1.5`, 64 decks at 2σ rather than 16).

**The rule, then:** *when a reading moves between rounds, compute the sample
before running another one, and size for the band rather than the effect* — and
when an arm reports something unresolved, it prints the sample it would need
rather than leaving the reader to work it out. The ladder table does this per
rung, which is where the habit came from: it was printing `steering +2` above a
five-base measurement of `+7.6` in the same output, with the headline read first.

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

**AND THE RETROACTIVE PASS, which was queued for three rounds and is done.** The
rule *a ranking inside its own band is noise* was written down, then applied to
exactly one new arm, and every older arm went unaudited — which is a rule
observed once and a habit never. Every ranking read in the probe, swept:

| where | reads a ranking? | verdict |
|---|---|---|
| the courses table | best vs worst | already prints σ and CLEARS / does not |
| the subtractive habit table | six habits ordered | already suppressed under a ±2.0 band |
| the reward-screen table | five habits ordered | already suppressed the same way |
| the gear bar, the course dials | best of 4–5 | gated on the **spread**, not the rank |
| **the additive habit table** | names a top and STAMPS it | **was broken — fixed** |
| **the deck split-half** | halves made by sorting | **was broken — fixed** |
| ware, card, killer censuses | counts, not rates | not a ranking of noisy rates |

Two real violations out of seven, and both mattered. The additive table checked
each row against the FLOOR (`is this habit worth anything`) and then wrote a
sentence claiming the TOP (`which habit is best`) off that check — two rows five
points apart at ±3.3 are the same measurement. It now checks the lead over second
place and says *the top of this table is not resolved* when it cannot name one.
The split-half is the worse one and has its own entry.

**The transferable half: a check against a floor is not a check against a
neighbour, and a table that has both is the easiest place in the world to read
the wrong one.** Four of the seven were already right, which is the only reason
the audit was cheap — but it took writing the rule a fourth time before anyone
went and applied it backwards.

**AND THE BAND HAS A NOTATION NOW, USED EVERYWHERE RATHER THAN ONCE.** A rung
that cannot clear its own band prints `+3?` instead of `+3`, and for one round
that convention existed in exactly one table while five others went on printing
bare differences that the reader had to check by hand against a sentence
underneath. One shared renderer — `RANGE(d, band)` — now marks the gear-bar
spread, both course-dial spreads, the routing verdict, best-against-worst on the
courses, and the money arm. **Six sites, one rule: a number without a `?` cleared
2× its band, a number with one is a range.** The point is not the character; it
is that a reader can no longer land on any single line of probe output and be
unable to tell whether it means anything.

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

**AND THE COST OF ALL THIS INSTRUMENT WORK, TIMED RATHER THAN ASSUMED.** A
per-card sweep, a per-foe sweep, a real advance table and two more device shapes
went into the render suite inside a month, and the rule this repo runs on says
the person who makes a suite slow never sees the total. Measured:

```
195.3s  43%  blacksite   ← the only suite over the 25% bar
 85.0s  19%  crashmas
 47.1s  10%  frostfell
 43.5s  10%  ironbridge
                            452.2s total · median suite 0.7s
```

**Frostfell is third at 10%, well under the bar** — the widening was affordable,
and saying so is only worth anything because the number was taken rather than
guessed. Blacksite is 43% and is not this game's to fix; the rule about not
patching another game's suite cuts both ways, so it is reported and left.

**The generalisable part: when a bug's visibility depends on an incidental
number, fixing the instance is worth almost nothing** — the next one picks a
different step. Make the arithmetic unreachable instead.

**And the same trick, applied to the two coverage lists that had drifted apart.**
The overlap check found a live text collision on the **victory** screen at
653x280 — a fold's cover display. The render suite swept eight shapes; the shot
walk photographed whatever the round happened to name, which was three. So there
were five shapes checked only by assertion and never once looked at, and the
defect sat there until an assertion tripped over it. That is a strange kind of
coverage: every failure the stub finds there is real, and every failure it
**misses** there is invisible twice over — no test and no eye.

Two lists kept in step by discipline drift the first round somebody is busy, so
there is one list: `tools/frostfell/shapes.mjs`, **9 shapes, 4 of them real
devices**. The render suite sweeps it (764 → **852** checks, because the Pixel 7
had been in the shot tool's device list and never in the suite's sweep) and
`shots.mjs --all` walks it, one child process per shape into its own directory.
The suite asserts the tool reads that file rather than a copy, so a future round
cannot quietly hardcode a list again.

One defect found in the doing: the walk wrote every shape into the same output
directory, so a second walk overwrote the first and a stale phone shot was read
as a fresh one during this very round. Per-shape directories now.

**And walking the new shape immediately found what the assertion could not.** On
the fold cover the victory tally read `1 FIGHTS WON 2 FOES FELLED` with the two
labels touching — one word to the eye. The overlap check does not fire on it, and
the reason is worth keeping: the headless stub models a glyph's advance as
`length × size × 0.5`, so by the stub's arithmetic those two 150-unit cells have
a comfortable gutter and by Chromium's they have none. **An approximate width
model finds gross collisions and cannot adjudicate a gutter.** That is the
division of labour between the two instruments, stated in numbers rather than
assumed: the stub catches overlaps at 9 shapes × 12 screens for free; the walk
catches the near-misses, and only where somebody looks.

Fixed the same way as the card names — the labels are fitted to their cell less a
gutter and ellipsised when the floor will not let them shrink that far, so the
fold shows `FIGHTS W…` where a desktop shows `FIGHTS WON`. Truncation is the
cost; the alternative was two labels reading as one.

**AND THE STUB STOPPED GUESSING AT WIDTHS, WHICH TURNED ONE FIX INTO FOUR.**
`length × size × 0.5` was one constant for every character in both faces, and
this game's typeface is GENERATED — every glyph carries an exact advance in font
units, so the error was measurable rather than arguable:

```
                 UPPERCASE   lowercase   space
Frostwork Bold     0.667       0.594     0.331     ← the body face
Frostwork          0.655       0.585     0.332
Frostcut           0.578       0.512     0.284
the stub said      0.500       0.500     0.500
```

**Uppercase in the body face was understated by a third**, which is most of the
game's labels. The advances now come out of `tools/frostfont/alphabet.mjs` — the
same source the shipped `.woff2` is cut from, per character rather than per face,
so an `I` and a `W` stop being the same width. Remaining error, stated rather
than hidden: no kerning pairs and no `letterSpacing`, both of which make the stub
read NARROWER than the truth, so it misses a marginal collision before inventing
one.

**Then the corrected widths showed the check itself was the wrong shape.** With
real advances, `FIGHTS WON` and `FOES FELLED` have **3 units of gap at 23-unit
type** — they never overlapped, so an overlap check could not have caught them
however accurate its arithmetic. What the eye reads as "touching" is a gutter too
thin to separate two words, and the threshold for that is a fraction of the type
size, not zero. A quarter of the size is the bar.

Turned from an overlap check into a gutter check, it found **three more live
defects on the fold cover in its first run** — the trail checklist, the shop
counter, and the reward screen's three buttons — none of which anyone had seen.
Two of the three shared one cause: `button()` drew its label at a fixed 19 units
and **never fitted it to its own button**, in a game where every button had that
bug for forty-nine rounds. It fits now.

**The generalisable half: an instrument's approximations decide which bugs it can
have an opinion about.** The width model was accurate enough for paragraphs and
useless for gutters, and nothing said so until a defect landed exactly there.

**AND THE CHECK NOW SAYS WHAT IT LOOKS AT.** `button()` carried its bug for
forty-nine rounds and the gutter check found it in one run, which argues the
check is good and its AIM is narrow: it swept 9 shapes × 12 screens of one
seeded run, so the strings it examined were whatever that run happened to deal.
Everything the game can draw is enumerable from its own tables, so the share is
a number instead of an impression:

```
names 63/86 (73%)   ·   rules paragraphs 31/62 (50%)   ·   4,184 draws, 729 distinct strings
```

Widened as well as measured: **every card in the pool is now drawn at both sizes
it is ever drawn at** — in hand and on the reward row — at 653x280, the tightest
shape, and put through the same two rules. All of them pass. What is left
uncovered is foes the seeded run never met, which the figure now names rather
than hides.

**AND THE MISSING THIRD OF THE PARAGRAPHS IS NOT A GAP IN THE CHECK.** Rules text
is drawn wrapped, so a paragraph only counts as looked-at when every word of it
appeared somewhere — and at 653x280 it never does. Drawn card by card: **57 of
58 rules texts ellipsise on a fold, and 58 of 58 names.** Including two-word
texts, which is the tell that this is not a long-text problem: a hand card there
is about 36 CSS pixels wide against a 9-pixel legibility floor.

**Not acceptable, and the reason is sharper than "text is cut".** The fold shot
shows two different cards in one hand both reading `EMBER…`. The failure is not
that the rules are truncated — they are one tap away in the inspect panel — it
is that **you cannot tell two cards in your own hand apart.**

Shrinking further is not available; the floor is the floor. So below the width
where a name fits on one line the card changes what it shows: the name WRAPS and
takes the band's full height, and the rules line — unreadable at that size — is
dropped to pay for it. Telling cards apart is the only thing on that face that
has to survive.

**Wrapping at SPACES got 6 of 58 and that was the wrong half of the problem.**
Most cards in this game are one word, so `BONE STEW` and `EMBER FLASK` came out
whole while `KETTLE…`, `WHETS…` and `CINDER…` stayed truncated — *a name that
cannot wrap is the common case, not the exception.* Breaking mid-word is what a
book does when a long word meets a narrow column, and `KETTLE` over `BEAK` reads
as one word beside a picture of the thing.

**EXCEPT THAT IS NOT WHAT IT DREW, AND EVERY CHECK WAS GREEN WHILE IT DIDN'T.**
The shot walk opened the leader screen on a phone and found `CINDE` / `RPUP`,
`KETTL` / `EBEAK`, `WHETS` / `TONE` — the cut is chosen by pixel fit alone, so it
lands wherever the width runs out, which is mid-syllable most of the time. Two
nonsense tokens are worse than the truncation they replaced. The coverage sweep
could not see it and never could: it asks whether a name is drawn WHOLE, and by
that measure `SNO`/`WPUP` and `SNOW`/`PUP` are the same answer — **86 of 86, both
ways.** *A check that counts what is drawn cannot see what is legible.*

Two changes, and the first attempt at the second one made things worse:

* **Shrink before you break.** A typesetter sets the line smaller before
  hyphenating. The band now takes the largest size (down to the 9px floor) that
  holds the whole name, and only breaks if none does.
* **The cut goes where the SECOND piece can start a word** — consonant then
  vowel. Nearly every long name here is a compound (`CINDERPUP`, `SNOWPUP`,
  `WHETSTONE`, `KETTLEBEAK`, `BELLROPE`, `COLDSNAP`), so this puts the whole
  first element on the first line.

**Choosing AMONG the seams took three tries and each wrong one shipped green:**

| rule | what it drew |
|---|---|
| cut after a vowel | `SNO\|WPUP`, `WHE\|TSTONE` — right for `KETTLE\|BEAK` by accident only |
| the latest seam that fits | `BELLRO\|PE` — right for `CINDER\|PUP`, wrong the moment a name's seam is early |
| **nearest to balanced, ties to the later cut** | all six right |

The third is not a third guess: a compound's seam is near the middle *because
both halves are words*, and "latest" only looked right because the four names it
was tested on happened to have late seams. `BELL|ROPE` and `CINDER|PUP` fall out
of one rule. **Two of the three wrong versions were caught by opening a PNG and
the third by adding a sixth name to the pin** — six named cases now, because a
property here would restate the implementation.

**And the band has to HOLD what it lays out**, which is a separate bug the fold
found: `44 * S` for three lines is a prediction about type that has a 9px floor
under it, so at 653x280 `CIN` was drawn above the plate into the frame and `PUP`
below it across the picture. Growing the band pushed a stat pip onto a red ground
at 1.2:1 (the contrast check); closing up the leading put the lines on each other
(the overlap check). **The growth has to come from somewhere, and it comes out of
the picture** — the one element on a fold-size card carrying no information — so
nothing below the window moves and both checks stay green.

Two more things had to be right before it landed at **0 of 58 cut**:

* **The split is balanced, not greedy.** Filling the first line and spilling the
  rest gives `BANKE` / `DEMBERS`, where it is the *second* line that overflows.
  Starting at the middle and walking outward finds `BANKED` / `EMBERS`.
* **Five names need three lines**, not two — `A HANDFUL OF SNOW`, `BELLOWS BEAR`,
  `BANKED EMBERS` — so the band grows when they do. That costs a few units of
  picture on the one device where the picture was never carrying the
  information anyway.

Name coverage on a fold: **52 of 58 cut → 0.**

**And the named gap is closed.** Every foe is now placed on a real board, given
a scheme to telegraph, drawn as a slab and drawn again in the inspect panel, at
653x280. **Names went 73% → 99%** and rules paragraphs 50% → 68%. Two exclusions
are stated rather than quietly applied: text drawn outside the stage (synthetic
boards inherit overlay state from earlier sections, and one overlay stacks
several unit names at a single off-stage anchor — three names at one point
reported as three collisions, which is the harness rather than the game), and
the hand, which is not what this section is for and already carries two checks
of its own.

Counting names and rules separately was itself a correction. Lumped together,
drawing every card in the game moved coverage from 75% to 77% — which reads as
the widening having failed, when what it did was take card names to everything
the game has. A name is drawn whole and a paragraph is drawn wrapped; **one
number over two things measured differently is not a measurement.**

**Both now read 100%, and the last gap was a design fault rather than a coverage
one.** The sweep skipped leaders (`if (def.leader) continue`) because leaders are
not offered as cards, which held rules at 62 of 63 — and the one paragraph nobody
had ever drawn belonged to the Stranger. Drawn, it did not fit: **twelve words,
and the last one never appeared on a card face at any of the four device sizes.**
Not a wrapping bug — a card face is 4 lines at that size and 12 words of that
shape is 5. Nothing in the check could have found it while the entry it needed
was excluded, which is the general shape: **the one text a coverage sweep skips
is the one nobody has ever looked at, so it is exactly where the defect is.** The
fix was the text (12 words → 10), because the alternative was making every card
in the game shorter to suit one leader.

**AND THE WALK PHOTOGRAPHS THREE SHAPES OF NINE, WHICH IS RIGHT — BUT THEY WERE
THE WRONG THREE.** Three rounds running, the only thing that saw a real defect
was a person opening a PNG, so the obvious question is whether the walk should
cover everything the render sweep does. Timed rather than argued about: **918s
for all nine, ~102s a shape**, so the six extra cost about ten minutes. That is
affordable — and it is still the wrong trade, because the binding cost is not
wall-clock. Nine shapes is 342 images and a person opens perhaps five. Walking
more shapes makes more pictures nobody looks at.

What the ten minutes bought instead is the answer: run the nine once, look at the
**tightest** shape, and make that one of the standing three. At 653x280, five
live defects that the 1280x720 / 2400x1080 / iPhone-14 walk had never shown:

| | |
|---|---|
| three-line card names drawn **outside** the name band | `CIN` clipped by the frame, `PUP` across the picture |
| `A KIND WINTER` drawn **through** the KEEN BEASTS row | a clamp to `VH - 104` that lands inside the list |
| `SEALS EARNED` drawn **through** `THE FIRST CROSSING` | a fixed 20-unit gap under a 23-unit line |
| `BOUNTY CHARM` / `SWIFT CHARM` overlapping each other | `drawCharmCard` had no wrap and no ellipsis — at the floor it just overflows |
| the bell's rules line drawn **through** the stall panel, and its price badge **through** the rules line | a fixed 50-unit shelf holding a 23-unit line; text drawn to full width past a 58-unit plate |
| `BELLRO` / `PE` | the seam rule's third correction — see the name-break entry |

**Every one was green in all 876 render checks while it was broken, and five of
the six are the same bug.** `textSize` clamps type up to a 9px readable floor, so
below a certain size a "13-unit line" is 23 units tall while every gap around it
is still scaled by `S` — and the game is full of literals (`+ 21`, `by0 + 17`,
`50`, `44 * S`) that were measured on a desktop. The floor is right; the literals
were predictions about type that has a floor under it. **Anywhere a fixed offset
sits under a `txt()` call, the fold is where it fails**, and that is a grep, not
a walk — the next round can do it exhaustively.

Fixed, each by making the container read its contents: the name band grows and
takes it out of the picture, the winter total moves into the header, the seals
step by `lineH`, the charm name wraps, the bell's shelf sizes itself and the
stalls move down.

So the walk stays at three shapes and the third one changes: **reference desktop,
largest, and the FOLD.** The phone that held that slot is the one that showed the
least, and the other five shapes are the automated sweep's job — it already
covers them, and covering them with pictures nobody opens is not coverage.

### FINDING — every surface was flat, and one direction of light fixed the lot

`topic: depth`

The cards and buttons were called out as looking cheap, and the diagnosis is not
a matter of taste: **every surface in the game was a flat fill with a stroke
round it.** The frame, the name band, the picture, the rules and the stat pips
were all painted at the same value with hairlines between them, so a card had
one plane and the eye had nothing to order it by — it read as a diagram of a
card. Buttons were a rounded rectangle with a white band across the top half,
which is the shape a web page used in 2005.

The fix is not more colours. Almost all of a card's legibility in a game that
looks expensive comes from being **several plates at different depths, lit from
one direction** — a raised frame catches light on its top edge and loses it on
the bottom; a window cut through that frame does the exact opposite. Canvas has
no inner shadow, so two helpers do it by clipping the shape and laying gradients
along its edges:

```
inset(...)   shadow along the top and left, a lip of light along the bottom  — a hole
bevel(...)   light along the top, shadow along the bottom                    — a plate
```

**Four planes on a card** where there was one: a dark frame with its own
thickness, an ice-white face sunk into it, the picture cut through the face, and
a rules well recessed below. Buttons got a dark seat, a body brighter at the top
than the bottom, a rim, and a pressed state that inverts the bevel — which needed
`UI.down`, because the interface had no state saying which control was under the
finger. The stat pips became cast pieces: a gradient down the face, a rim light,
a specular pin, a contact shadow.

**And `panel()` was the multiplier.** Every tray, bar and box in the game goes
through it — **33 call sites** — and it drew a flat fill for fifty rounds. Once
the cards and buttons were lit, the panels were the only surfaces that were not,
and a lit object on an unlit tray reads as a sticker on a sheet of paper. One
change to one function lit the whole interface, with the fall computed off each
caller's own colour so no palette drifted.

**Two things this got wrong before it got right, both worth keeping.**

*A rules well sized to its own text is worse than a fixed one.* It seemed
obviously right — why draw a box bigger than what is in it — and it gave a
one-line gear card a small recess floating with a hand's width of dead face
under it, so four cards in a row had their panels at four different heights and
the row lost its baseline. **A row of cards is read as a row**; the same box in
the same place on every card is the point.

*And measuring in the wrong font truncates strings that fit.* `ellipsize`
hardcoded Frostwork; buttons are set in Frostcut, which is condensed —
**0.578 against 0.655 per uppercase glyph, about 12% narrower** — so the moment
button labels went through it, `BACK TO THE ROAD` was cut to `BACK TO THE RO…`
on a button it fitted comfortably. A truncation is a claim about the string;
measuring in the wrong face makes it a lie about the box.

### FINDING — contrast, the third thing nobody was checking

`topic: contrast`

Touch found seven controls too small; type got a floor and found five
collisions. Nothing had ever asked whether the text could be **seen**.

**And the type check was only half a check for twenty rounds, which the phone
walk found this round.** The stacking check compares consecutive lines in a
COLUMN and catches a line step that stopped growing with its text. The other
axis was never checked, and that is where the floor's remaining damage was: on
the leader screen at 844x390 the floor lifted every preview card's name past
what `fitText` could shrink it to — a preview card is 92 stage units wide and
the floor is about 17 — so four names were drawn straight through each other and
`CINDERPUP CINDERPUP KETTLEBEAK` read as one word across three cards. **Every
one of them passed the floor check and the stacking check**, because each was
individually legible and no two shared a column.

The same rule turned ninety degrees — two strings on one baseline may not
overlap — is **96 new assertions** and it fires on the leader screen at
653x280 and, unprompted, on the **victory screen**, which the shot walk had
never shown at that shape. Two live defects, one of them invisible to the eye
that was looking.

The lesson underneath is about `fitText` and belongs next to it: **it returns a
size, and a size is not a promise that it fits.** It shrinks until the string
fits or until it hits the legibility floor, and on a handset the floor wins
often. Every caller that boxes text has to decide what gives when the box cannot
carry a readable string — here the string does, through `ellipsize`. A name
truncated inside its band reads as "this name is longer than the card"; a name
bleeding over the card beside it reads as a broken renderer.

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
- **Encounters drawn to a strength budget** *(`dead-ends: budget`)*. Every foe is
  an independent uniform draw, so a fight can roll three of the heaviest bodies
  in the pool. Drawn to a budget instead — same mean, variance held inside 18% —
  the trail's share of how far a run gets went 32.6% → 32.5%. Not a small effect,
  nothing, which ruled out the whole class.
- **Fixing the boss per zone instead of drawing it** *(`dead-ends: bossnorm`)*.
  The same arm says this one *works*: it takes the trail from 32.5% to 13.9%, so
  **over half the trail's influence is which beast waits at the end of a zone** —
  one draw a zone against the hundreds of foe draws inside it. Built, and
  reverted anyway: the strengths were already close enough that normalising them
  mostly flattened flavour, and a run you lose to the Frostwyrm is a run you
  remember. Kept because that 32.5% → 13.9% is the largest single lever anyone
  has found here, and the next person who wants one should start by re-reading
  it rather than by re-measuring it.
- **Giving four schemeless foes a scheme** *(`dead-ends: schemers`)*. Six rounds
  of ablation say denying a scheme is worth +11 of a set worth +18, and only 11
  of 24 foes carry one — so the fight's one real decision is available in 46% of
  it. Taking that to 58% (snapfrost, hailhorn, wailer, rimeknight), at 750 runs
  an arm: the set stayed at +18, **denial went +11 → +16 of it, and the other
  habits went +5 (clears, 2σ ±3.2) → +2 (does not)**. Asking the one
  decision more often made the fight *more* one-dimensional. Two of the three
  explanations for a thin fight are now dead — a second kind of event (the wave
  telegraph, 0) and more of the first kind (this, −3 to everything else). What
  is left is that the other three habits are weak, and the next attempt is there.

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

**AND ITS REACH IS A CURVE, WHICH IS WHY THE AUDIT WAS ARITHMETIC RATHER THAN A
RE-RUN.** Reconstructing the pre-fix behaviour — clear `G.meta.found`, play the
careless arm, watch it refill:

```
after   1 run :  3/12 unlocked        after  79 runs :  9/12
after   4 runs:  6/12                 after 128 runs : 12/12  ← and never moves again
after  16 runs:  8/12
```

**The pool stops changing after 128 runs of one process.** Sections run in file
order and the ladder is first — 840 runs at `FF_RUNS=70` — so every arm outside
the ladder started at run 361 or later, on a saturated pool. **1 of 38 entries was
affected.** Re-running all 38 would have cost hours and found one. A bug in
accumulated state has a measurable reach, and once you have that number, "which
findings are affected" is arithmetic over the section order.

