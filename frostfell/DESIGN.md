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

*3. The file holds at about 35 entries. Every round that adds one retires one.*

Ten entries were cut two rounds ago and the file was back over 1,500 lines two
rounds later, because the cut was a one-off and the adding is not. A cut rate
that does not match the add rate is not a policy, it is a mood — so the steady
state is stated instead: **~35 entries, ~1,400 lines**, and a round that writes
three entries owes three retirements.

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

**The shallow run said the opposite and that is the reusable half.** At 72 runs a
bar the same five read `43/46/47/46/39` with the shipped bar on top and a clean
story about a well-tuned pilot; at 450 they read `44/45/40/42/43` with the
shipped bar at the bottom. **The ranking inverted completely between samples**
while the spread stayed inside the band both times — which is exactly what a flat
dial looks like, and exactly what a ranking read off a small sample will hide.
The arm is gated on the **spread**, not on where the shipped value ranks, because
a ranking inside its own band is noise no matter how satisfying its shape.

What remains open: the 14 points are about the deck, or about something the pilot
has no dial for at all. Given that the matchup term is 27% and the deck's own main
effect is 1.6%, "gear-heavy decks beat particular trails" is the live candidate,
and it needs a matchup-split rather than another pilot knob.

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

### FINDING — the ladder, and which of its numbers is the one being defended

`topic: ladder`

Four pilots, each the one above it plus one more thing it knows how to do, so
the gap between two rows is that one thing. `FF_RUNS=70`, 210 runs an arm:

| pilot | | worth |
|---|---|---|
| careless | takes the leftmost card, swings at the nearest thing | 8% |
| + the fight | denies schemes, answers a named wave, places bodies, holds gear | 26% (**+18**) |
| + the trader | spends well | 39% (**+13**) |
| + steering the pool | drafts to a course | 41% (+2) |

**33 points, and the six-point jump from 27 came from taking three cards out**,
not from anything added to a pilot — see [auras](#finding--the-prescription-for-a-flat-pool-was-an-aura-and-it-did-not-work).
That is the largest single move the ladder has made, and it was made by deletion.

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
nobody had done.** Denial alone reads **+15** and the set of six reads **+17**.
Since the six are not additive that is not literally "the other five sum to +2",
but it does bound them: whatever the other five contribute on top of denial, it
is about two points, and three of them price negative on their own. The habit
table is not five small positives and one large one. It is **one habit and five
passengers**, and two of the passengers (repositioning, calling waves early) are
already dead switches kept only so the ablation has a row.

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
schemes on it. It does license the reverse of what four rounds assumed: the fight
rung is not "six habits worth +17 together". It is **denial, worth +15, with five
habits that mostly get in its way.**

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

