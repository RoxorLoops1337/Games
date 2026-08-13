# The Emberkin playthrough probe

`playthrough.mjs` plays the game. Not a simulation of it — the real
`emberkin/index.html`, loaded headless through `tests/emberkin_lib.mjs`, with the
real encounter tables, the real card resolution, the real trainers. It walks from
Rowan's study to Crown Hollow, fights everything it meets, and counts the things
that make a run tedious rather than describing them.

It exists because "is this boring" is not a question you can answer by reading
the source, and because eight passes went into how the game looks before anybody
asked whether it was any good to play.

**Read this before believing a number it prints.** Fourteen passes of work on
this game have produced roughly six changes to the game and forty-two fixes to
this tool. That ratio is not an accident and it is not over. The section at the
bottom is the list of every mistake this probe has made, because the next one is
much more likely to be a variation on those than something new.

```bash
node tools/emberkin/playthrough.mjs --runs 60           # a party of four
node tools/emberkin/playthrough.mjs --runs 60 --solo    # one kin, no switching
node tools/emberkin/playthrough.mjs --runs 60 --starter sproutle
node tools/emberkin/playthrough.mjs --runs 60 --rested  # heal before each trainer
```

## The two modes are two different games

`--solo` keeps one kin and never switches. Default carries a party of four,
catches, switches into matchups, restocks in town. These are not
harder-and-easier versions of one thing; they are different games, and a change
that helps one can do nothing for the other. **Judge a change against both**, and
if it only moves one, say which.

**`--vs` is the one to reach for.** Everything before it is the baseline arm,
everything after is the variant, and both run in one invocation over the same
seeds — `Math.random` is seeded per run, so run 7 is the same run in both arms and
the printed interval is on the *difference*. `--set NAME=VALUE` rewrites a
top-level constant in the game's source before it is evalled, so a tuning dial can
be compared against itself:

```bash
node tools/emberkin/playthrough.mjs --runs 60 --solo --vs --set PLAN_CHIP=0.25
node tools/emberkin/playthrough.mjs --runs 60 --vs --ban whetstone
```

Prefer it over comparing against a number from a previous pass — that is worth
±.05 on the danger line (mistake 39), and it is how a shipped bug went unnoticed
for a whole pass (mistake 40). The report is deterministic now; absolute figures
from before pass 35 are not directly comparable to figures after it, because
seeding changed the stream. The paired differences are.

`--ban a,b` takes a comma-separated list, so two cards can be struck out together
and asked whether they add up or overlap.

`--ban <id>` plays the run with a card struck out of the reward offers, the chest
pulls and the starting deck. `--force <id>` pins three copies into the deck that
nothing may swap out. The two together are what a single card is worth. Prefer
`--ban` for the clean reading: force also costs three deck slots, so it mixes a
card's strength with the price of carrying it.

`--build value|grow|rarity` changes how the run builds its deck — by what a card
does per energy, by its permanence keywords, or by taking whichever card is
rarest. `rarity` is the default and the baseline. The other two exist because a
conclusion drawn under one policy is a conclusion about that policy: see mistake
30, where "the deck does not decide the run" turned out to mean "always taking
the rarest card converges".

`--starter <name>` runs every run on one starter. Rotating is right for a
headline number, but sixty rotated runs is twenty per starter, and twenty is not
a sample — see mistake 41.

`--rested` heals the party before each trainer. That was the default until pass
15 and it made every trainer read as unloseable. It is kept because the gap
between the two columns is how much of a trainer's difficulty is the walk that
came before it.

## What each number means, and what it is divided by

| line | means | normalised by | comparable across modes? |
| --- | --- | --- | --- |
| `steps walked` | how much walking a whole run takes | per run | no — a party splits XP and walks further |
| `fights` | encounters in a run; the `one every N steps` figure is the useful half | per run / per fight | the rate, yes |
| `never in doubt` | fights where the **party mean** HP never fell below 70% | per fight | **NO** — see mistake 2 |
| `no kin in doubt` | fights where the **worst-off kin** never fell below 70% | per fight | **yes — this is the one** |
| `cost of a fight` | party-mean HP the fight took off | per fight | **NO** — see mistake 1 |
| `the same, in kin` | the same quantity in kin-bars | per fight | **yes** |
| `turns per fight` | player turns, including the one you win on | per fight | yes |
| `over in one turn` | fights the foe answered at most once in | per fight | yes |
| `foe max HP` | the pool a wild fight is played over | per wild kin | only at equal end level |
| `walks back to heal` | trips to town because the party was spent | per fight | **NO** — the trigger is a party mean |
| `wipes` | fights lost outright | per fight | partly — a party is genuinely harder to wipe, and that part is real |
| `ran from a fight` | escapes | per fight | yes |
| **`lost or ran`** | **the danger line** — losing and running are the same outcome with a different walk home | per fight | yes |
| `salves drunk`, `switched mid-fight` | what the policy actually did | per fight | yes |
| `by starter` | the headline split three ways | per fight, within starter | yes |
| `trainer` table | per hand-authored fight | pooled across runs | yes |
| `matchup` table | the cross-tab, by how the fight read before a blow was struck | pooled across runs | yes |
| `played/drawn` | of the fights this card reached your hand, the share where it was worth playing at least once | once per card per fight, both halves | bounded by 100%; see mistakes 7-9, 18 |
| `when payable` | the same, over the fights the card could actually have been **paid for** at a moment the policy was choosing | once per card per fight | **this is the card-quality column** — see mistake 21 |

Every rate carries a **95% interval** (`mean ±half-width`, 1.96 standard errors
across runs). Under the wipe line the report prints how many runs a claim of a
given size would need, from the spread that sample just showed.

**If two builds' intervals overlap, this tool has not told you which is better.**
Staring at the means will not change that. Say so in the write-up rather than
picking the flattering reading — that mistake has been made in this project and
caught by the next sample twice.

## The cross-tab is the instrument, not the headline

Most real findings here came from the per-matchup or per-trainer table, not the
run average. A bucket with a 20% share moving eight points is under two points of
headline, which the headline's own interval cannot resolve. **Go after a named
bucket and report the bucket.**

## Two rules, from getting this wrong repeatedly

1. **Average the ratios, never ratio the averages.** `avg(x) / avg(fights)` lets
   a long run outvote a short one, which is not what "per fight" means.
   Everything goes through `rate()`, which takes each run's own ratio.
2. **If a quantity divides by the party, it is not comparable between the modes.**
   Those lines say so on the line itself and print a party-free twin underneath.
   The twin is the one to compare.

And one habit: **a probe decision is a hypothesis about players.** When a number
will not move, suspect the policy before the game. The audit table of what this
probe decides differently from a person lives in `emberkin/README.md`.

## The ledger

Every mistake this tool has made, in the order it was caught. Three families,
and the family is more useful than the individual entry.

### Denominators — a quantity whose meaning changes with something else

1. **`cost of a fight` read a party mean** (pass 17). Solo 25% against party 7%
   looked like a threefold difficulty gap. In kin-bars it was 0.19 ±0.03 against
   0.21 ±0.03 — the same number twice. Nearly tuned the game to close it.
2. **`never in doubt` read a party mean** (pass 19). With four kin, one being
   taken to zero is 25% party damage and passes a 30% bar. Party mode read
   37-40% and looked immune to four passes of fixes; on the worst-off kin it is
   **10% ±1**. Four passes of "party mode won't move" were four passes of reading
   a number that could not move.
3. **`never in doubt` read an absolute floor** (pass 16), so a fight entered at
   half health failed it whatever happened inside the fight — conflating a
   dangerous fight with an already-hurt party. `cost of a fight` was added beside
   it. Note that this and mistake 2 are the *same line* caught twice, a pass
   apart, for different reasons.
4. **The turn loop broke on the killing blow without counting that turn**
   (pass 18). A fight where the player swung twice and the foe answered once
   filed as "over in one turn" — the metric party mode had been failing for four
   passes, a quarter of it this.
5. **Four lines used ratio-of-averages** (pass 20): foe max HP, salves, flees,
   switches.
6. **`walks back to heal` fires off a party-mean trigger** (pass 20), so four kin
   must take four times the damage to trip it. Marked within-mode-only.
7. **A card counted as drawn every turn it sat in hand** (pass 22). A Retain card
   sits in hand all fight, so it was counted four times against the one time it
   can be played. The entire bottom of the played/drawn table was every card with
   Retain on it. Hunker 25% → 90%.
8. **That fix left the numerator per-play** (pass 23). `drawn` became once per
   card per fight and `played` stayed once per play, so a kin move you can throw
   every turn scored 221% — twenty-two rows of the table read over 100%, a number
   that cannot mean anything under the heading it is printed with. Caught by
   reading the table while writing this doc, which is the first time that has
   happened. Counted the same way on both sides now.
9. **The hand was only read at the top of the turn** (pass 23). Draw effects put
   cards into the hand mid-turn and the policy plays them in the same pass, so
   those cards were played without ever being counted as drawn — eight rows still
   read over 100% after entry 8 was fixed, all of them cheap cards that come off a
   draw. The hand is read before every decision that looks at it. The ratio is
   bounded by 100% now, and reads: of the fights where this card reached your
   hand, the share where it was worth playing at least once.

### Policy — the probe declining to do something a person does

10. **Cheapest-first card play** (pass 12). Every two-energy card looked dead
    because the swing is reserved out of three energy, so a 2-cost card only got
    played when two 1-cost cards had not already eaten the budget. Bulwark 1% →
    52%. Three passes of deck tuning had been aimed at this.
11. **Healed the party before every trainer** (pass 15). Every trainer was
    measured against four rested kin: a fight none of them can win and nobody
    actually has.
12. **Never drank a salve** despite carrying a bag (pass 16). Every wipe it ever
    reported was one a player had an item to prevent — and the wipe rate is what
    three passes steered by.
13. **Never fled** (pass 17). Teaching it to flee moved fights out of the wipe
    column into the run column and changed the danger not at all: .196 wipes
    became .085 wipes plus .166 runs. Hence `lost or ran`.
14. **Took a random card from the reward offer** (pass 17), depressing
    played/drawn across the whole pool.
15. **The salve rule drank on any dip below a third** (pass 17), so it drank
    again the next turn, because a hurt kin is still hurt after one salve — 2.65
    salves a fight and the average fight up to 5.91 turns. This one was
    *introduced* by the fix for mistake 12, one pass earlier.
16. **Skipped the reward card after trainer wins** (pass 21). `REWARD_ODDS.wild`
    has legendary at 0, so a trainer win is the only place in a normal run one can
    come from — the entire legendary tier read as "never drawn in any run".
17. **The scorer had no branch for `vt: 'energy'`, `fx.healFull` or `fx.atk`**
    (pass 21). Eternal Spark was taken four times and played 0 of 182 draws. This
    is mistake 10 recurring, three passes after the lesson was written down.
18. **The scorer had no branch for `fx.draw`** (pass 23). The `vt: 'draw'` half
    was scored at "a card is worth about a card"; the `fx` half was worth nothing,
    so Ward Stance's draw and War Cry's two were invisible. Third time a missing
    branch in this function has been mistaken for a dead card. **When a card looks
    dead, read `worth()` before reading the card.**

19. **Nobody checked whether a card could be paid for** (pass 23-24). played/drawn
    slopes with price on its own: median 100% at cost 0, 69% at cost 1, 30% at
    cost 2, 21% at cost 3. Reading it as card quality reads the price. `when
    payable` divides by the fights the card was affordable at a decision point, and
    a card that is never payable prints `never` rather than a percentage.

23. **`might` was priced as a four-turn buff when it is a run-long purchase**
    (pass 25). `G.might` is saved with the run and added to every attack from
    every kin for the rest of it; the scorer read `v * left * 2`, where `left` is
    the current fight's runway capped at four turns. A run has eighty-odd fights
    left at any point, so +2 damage a swing is worth several hundred points, not
    eight. The probe was declining them: **Temper 31% → 96%** of the fights it
    could be paid for, **Grit 44% → 90%**, War Cry → 100%. Six passes of reading
    the might cards went through that price, and it is the fourth time a
    mis-scored effect has been mistaken for a weak card (see 17, 18).
    Consequence worth stating: playing them correctly made the player stronger,
    so the headline moved — solo lost-or-ran .311 → .247, party turns 3.50 →
    3.08. **That is a re-baseline, not a regression.** The old numbers described a
    player throwing away permanent damage.

27. **The report never showed what a run accumulates** (pass 26). Every number
    was per fight or per run; nothing said what a run *builds*. `G.might` reached
    **+499** on every attack by Crown Hollow — against a wild kin's 174 HP —
    and no line in the report would ever have said so. `might at the end` is
    printed now. If a quantity persists across fights, the per-fight table cannot
    see it, and this tool is mostly per-fight tables.

28. **The probe never collected the win** (pass 27). The real game hands over
    gems on every win and a trainer's prize on top of a duel; this loop drives
    combat directly and skipped both. A run started with 500 shards, spent them
    at the first restock, and was broke for the remaining hundred-odd fights.
    **Every salve, orb and walk-back number this tool has ever reported was
    measured on a player with no income.** With the win paying, salves went from
    .086 to .287 a fight in solo, and the fights got *longer* — 3.60 to 4.08
    turns, over-in-one 13% to 8% — because the player survives instead of
    fleeing.
29. **Gems buy chests, and the probe walked past every one** (pass 27) with 237
    in its pocket at Crown Hollow — the entire second half of the card economy,
    never once measured. It buys the best chest it can afford on a town visit
    now, and anything better than the worst card in the deck goes in.

30. **"The deck does not decide the run" was a claim about the policy** (pass
    28). Pass 27 measured the best and worst thirds of sixty runs, found the decks
    identical, and concluded the deck cannot be what makes a run good — from a
    probe that always took the rarest card, which of course converges. Given a
    second policy (`--build value`, ranking by what a card does per energy) the
    decks and the outcomes both move a long way: solo lost-or-ran **.246 ±.027 →
    .162 ±.023**, wipes .111 → .073, and the deck goes from 73% epic to 60% rare.
    **The deck decides the run; a rarity-greedy player is simply playing badly.**
    A within-policy comparison cannot see a between-policy effect, and every
    cross-tab in this report is within-policy.
31. **"Money has no sink" was the shopping list** (pass 28). The report showed
    1093-2995 shards unspent at Crown Hollow. The shop sells seven things and the
    probe bought the two cheapest — five bloom orbs, four salves — then stopped.
    Buying better orbs and more salves absorbs it (down to 363-530) and moves no
    headline at all, which is the actual finding: past the floor, money buys
    nothing measurable.

32. **`combo` and `kill` were scored by neither scorer** (pass 29), and `worth()`
    applied a **5% penalty** to combo cards for carrying the upside it never
    counted. The game adds combo to a card's value before any effect reads it, so
    Berserk is a 6-value card that puts 11 on the board. Fourteen cards carry
    combo, kill or grow. Rescoring moved three of the four "underpowered epics"
    that pass 28 named: **Berserk 13 → 28, Reaper 16 → 32, Bulwark 15 → 24.** Only
    Ward Stance, the one with no keyword at all, stayed where it was. Fifth time a
    mis-scored effect has been mistaken for a weak card — and the first time the
    ledger's own advice (*read `worth()` before reading the card*) was followed
    first and prevented four card changes.
33. **Scoring `grow` overcorrected** (pass 29). Doubling a card's value for it
    prices the card at its endgame from the first offer, so the value build loaded
    up on Whetstone — base value 3, ceiling 15 — sixty fights before it gets
    there. Dropped. Worth noting that the measurement did *not* settle this: .276
    ±.024 with it against .261 ±.022 without, which overlap. It is out on
    principle, and the first draft of the comment beside it claimed the numbers
    decided it. They did not.

34. **"Every line stays inside its interval" was checked against three lines**
    (pass 31, about pass 30). The flatness table read the danger line,
    no-kin-in-doubt and wipes, and the sentence claimed all of them. Grit moved
    **turns per fight** — 3.67 ±0.15 to 4.05 ±0.24 when banned — which is outside
    by a hair. Ward Stance and War Cry hold up; the sentence did not. If a claim
    says *every* line, read every line.
35. **A ban-gap measures load-bearing, not strength** (pass 31). Grit was given a
    second compounding axis; its contribution nearly doubled (19 points of
    permanent might a run to 34) and its play rate went 89% to 98%, while the gap
    between having it and banning it stayed at +0.38 → +0.41 turns. Both numbers
    are true and they answer different questions. **The deck substitutes**, so a
    stronger card is not a more important one — which is what the ban-gap is for,
    and why the buff was reverted.

36. **The turn policy is a model of the rules, and a card that changes the rules
    invalidates it** (pass 32). Second Wind lets a kin move twice; the probe's
    turn is *swing once, then spend what is left*, so it read 1-3 plays in 200-300
    draws through four separate fixes — nothing took the second swing; the support
    pass spent the budget before the card was wanted; reserving the turn failed
    because the swing takes the best move and ate the reserve; capping the swing
    starved it entirely, 4.60 turns a fight. Each attempt measured the plumbing.
    **Before calling a new mechanic weak, check the policy can express it.**
37. **A price that is an arithmetic wall is not a price** (pass 32). Second Wind
    at one energy asks for swing + card + swing out of three, which is exactly
    three in the best case and impossible whenever a kin move costs two. It read
    2 plays in 306 draws. That is not a card nobody wants, it is a card nobody
    *can* play, and the two look identical in the table.

38. **The one beat a wild fight had was never counted** (pass 33). Cornering has
    been in the game since pass 18, and six passes wrote "wild fights have no
    shape" without ever measuring whether it fires. It does: **1.25 beats per wild
    fight, 23% of wild fights with none.** The report is per-fight averages and
    per-card tables, and a *structural* property of a fight fits in neither, so
    nothing surfaced it. `cornered beats` and `telegraphed beats` are printed now.
    Related to entry 27 and the same shape: if the report cannot see a kind of
    quantity, no amount of staring at it will.

### Sampling — a claim the sample could not carry

39. **One 60-run sample is not a baseline for the danger line** (pass 34). Two
    samples of the *identical* build read **.223 ±.037 and .273 ±.039** lost-or-ran,
    and 36% against 39% never-in-doubt. A whole pass was aimed at a 5-point drift
    that turned out to be about twice the sampling error — and against the high
    sample, three separate ban runs all looked load-bearing when none was. This is
    entry 36's shape recurring: two 30-run samples of one build read 36% and 41%
    in pass 18, it was written down, and the lesson was applied to *rates* but not
    to the **baseline a comparison is made against.** Re-measure the baseline in
    the same sitting as the thing you are comparing to it.

40. **The wipe rate was reported at 14 runs for three passes** (pass 15). It
    ranged .155 to .364 on *identical* builds. Every wipe claim in passes 12-14
    was noise wearing a decimal point. Intervals were added; runs went to 30, then
    60.
41. **Rotating starters means sixty runs is twenty per starter** (pass 21).
    Cindercub's lost-or-ran read .237, .358 and .438 across three samples of
    builds that never touched Ember. A per-starter claim needs `--starter`.

40. **"Off" that was not off** (pass 35, about pass 34). `PLAN_CHIP = 0` scaled
    the chip's damage to zero but did not skip the block, and `useMove` spends
    `b.foeEdge` on its way through — so a gathering wild kin threw away the
    sharpen it had just gained and pass 33's whole result was silently reverted in
    the act of shipping the dial "off". Party over-in-one read 20.6% against the
    4% pass 33 measured. **Scaling a value to zero is not the same as skipping the
    code.** Found by the first paired run, which is exactly the thing the paired
    mode was built for.

41. **`--set` swallowed to the semicolon** (pass 36). Half this game's dials are
    declared two to a statement — `const FOE_HP_MUL = 4.0, WILD_DMG_MUL = .70;` —
    so rewriting to the `;` deleted the second one and the run threw on load. The
    sweep that found this read a crash as *every metric identical*, which under
    seeding is precisely what a dead dial looks like, so the first pass of it
    reported `FOE_HP_MUL`, `WILD_DMG_MUL`, `CORNER_AT`, `CORNER_EDGE`,
    `RALLY_SHARE`, `RALLY_CAP`, `FOE_POTION` and `FOE_POTION_AT` as doing nothing.
    Two bugs stacked: the patch, and a screen that could not tell *no effect* from
    *no output*. **A check for "did nothing" has to first check that something
    ran.**

43. **The trainer table was a cliff, and the cliff was ours** (pass 109). At
    `--runs 40` the trainers read 15% and 25% lost for the first two and then
    83-95% for every one after, with the later fights *shorter* — the shape of a
    party being deleted rather than out-fought. It was not the game. `fights`
    printed **0**, and `stat.fights++` fires only when `!duelId`, so the run was
    duelling trainers without ever walking a route. Logging the party at the
    moment `duel()` starts settled it in one run: level 6 against t_mio's 15/16,
    level 9 against t_hale's 17/18/19, level 9 against t_wick3's **28/29/31** —
    and 100% HP at every trainer, which also contradicts `duel()`'s own comment
    that a player "arrives having walked the route. What the party has left when
    it gets there is the fight." The harness's stated assumption was broken and
    the number that showed it was sitting three lines above the table.
    **A shocking number wants the harness checked before the game: `fights 0`
    beside a difficulty cliff is the whole answer, printed in advance.**
    Not fixed here — recorded, because four passes had gone into this and a
    balance change made on it would have been the loudest wrong thing this
    project has done.

87. **The one cut every player sees first was the one cut with no transition**
    (pass 176). The opening, photographed end to end for the first time — the
    title is DOM, so a film cannot see it, and every pass until now had looked
    at beats in isolation.

        title → click → 120ms later: the study, mid-sentence.
        fade 0, wipe 0, at every sample.

    A door in this game goes through black at `.3`. Waking up after a loss goes
    through black at `.5`. **The most careful transition in the file, skipped at
    the one cut every player sees first.** It opens through `OPEN_FADE = .45`
    now — longer than a door because there is nothing behind it, no longer than
    waking up because you are not meant to have lost anything.

    Timed from inside the page rather than from screenshots (the first attempt
    read the fade as finishing in ~150ms, which was screenshot latency, not the
    game):

        world fully lit at   464ms
        Rowan speaks at      609ms

    **And the panels came free.** `screenCovered()` is true while a fade runs,
    and the class it drives already takes the dialogue box out of the way — 173's
    work, three passes old, doing the job without being asked. Without it,
    opening through black would have shown Elder Rowan talking over an empty
    screen, which is worse than the cut.

    **Then the suite caught me, correctly, with the wrong kind of net.**
    Reformatting `startNew` from one line to a function broke:

        ✗ and New journey really does destroy it — this is not a cosmetic ordering

    …which was a regex over `function startNew() { show(els.title, false);
    wipeSave()` — **the physical line**. The claim was as true as ever; only the
    layout moved. Rewritten to assert it behaviourally: save, start a new
    journey, look for the save. **Rule 68 arriving from the other direction — I
    have spent six passes saying a net should name the claim, and here was one
    of mine that named a line.**

    A note on the instrument: the first attempt built a contact sheet by
    embedding full-page screenshots as base64 in HTML, and it rendered the
    base64 as text. Not worth debugging — individual frames read fine, and a
    strip is a convenience, not the evidence.

86. **The ambush happened to the trainer and not to you** (pass 175). The only
    "somebody noticed you" beat in the game, never filmed. `ALERT` is spot .55 +
    walk .55 + land .25 = 1.35s: the frame closes to two 22px bars, the trainer's
    marker goes white and double size with a fast bob, he walks over, the bars
    retract.

    **All of it happens to him.** He jolts, he walks, he gets a cue. The one
    thing on screen that is YOU turns to face him — `p.dir` is set — and then
    stands perfectly still for the whole one and a third seconds.

    **And the reaction was already half built and dead.** `p.bump` is set when
    you walk into a wall and decayed every frame, and **nothing read it**: a
    timer that drove nothing, in a file where every other one drives a picture.
    Two hits in the whole file, set and decay. So the recoil the player never
    had was already paid for. It draws now, and being called out sets the same
    field — one nudge, two meanings, both already meant to be there.

    **Then the fix drew nothing, and only a measurement said so.** The recoil is
    an arc — nothing at either end of the bump's life, most in the middle — and
    the decay lived BELOW the input ladder. An ambush returns before it. So the
    value sat frozen at full for the entire 1.35s and the player moved **zero
    pixels**, while the source read perfectly plausibly. Measured by differencing
    the frame with the bump against the frame without:

        before   0 pixels, every frame of the beat
        after    0 → 170 → 253 → 170 → 0 over .18s

    The decay moved up beside `G.fade` and `G.wipe`. **A display value whose
    driver sits below the beat that owns the frame is a display value that does
    not exist** — the inverse of 173's rule, and it is the same shape: something
    visible, gated behind something that is not running.

    **And then a break that did not bite caught my own prose.** The comment I
    wrote said the trick was reading how far the bump had DECAYED rather than
    reading the value. Swapped it deliberately to prove the net — and the suite
    stayed green, because `sin((1-k)π)` and `sin(kπ)` are the same curve. **The
    claim was false and I had just written it into the source.** Corrected, with
    the correction stated. *A break that does not bite is worth as much pointed
    at your own comment as at the code* — 171 said a comment claiming a fix is a
    testable assertion; this is that, one week later, in my own hand.

85. **Two guarantees holding each other up, one of them unnetted** (pass 174).
    173's rule as a sweep: **27 clocks** enumerated from every `+= dt` and
    `-= dt` in the file, and each asked whether it can run while
    `screenCovered()` is true.

    **Driven live, two covers.** A wipe into a fight (14 clocks running) and a
    door (3). Exactly two advanced under cover, and both are right:

    - `b.entry`, on 17 covered frames — because the game already gates it more
      precisely than `screenCovered()` can: `if (G.wipe <= WIPE_T * .5)`. The
      creatures slide in **as the bars retract**, which is the reveal.
      **`screenCovered()` is a blunt predicate** — a wipe is only fully opaque
      at its midpoint — and the one place that needed the finer distinction
      already had it.
    - `G.warp.t`, on 10 — a cover's own clock must run or the cover never ends.

    **Forced, every one of them fails.** Setting each display beat live under
    each cover, all eight advance behind it. That proves nothing on its own:
    the question is reachability, and every one of those combinations is
    unreachable for two reasons that hold each other up.

        1. every display beat BLOCKS THE INPUT LADDER while it runs, so nothing
           that starts a cover can happen while one is live — netted in 172; and
        2. each beat NULLS ITSELF before running the callback that starts the
           next thing: `G.rustle = null; r.go();` — and `r.go()` is what calls
           `startBattle`, which raises the bars.

    **The first was netted. The second was not** — and it is one line's ordering
    inside each of three step functions. Reverse it anywhere and the beat's
    remaining time burns behind a wipe or a fade with nothing to catch it.
    Netted now, proved by reversing each of the three:

        ✗ rustle is already finished when what it starts begins (got true, want false)

    **A sweep that reports clean because nothing was running is not a clean
    sweep.** The first version of this one watched a real wipe and a real door
    and saw 14 and 3 clocks — most of the game's beats were simply not live, and
    it would have reported clean about them by never asking. Forcing each one
    live is what turned "no findings" into "no findings, and here is why they
    cannot happen".

84. **A beat spent behind a curtain has not been shown, it has been consumed**
    (pass 173). Two transitions that had scenes and had never been interrogated:
    the door, and the wipe into a fight. Both looked fine on film. Both were
    hiding something a film cannot see.

    **The door, timed.** The curtain shuts over 0.17s, the map swaps at 0.183s,
    `G.fade` opens the far side over **0.300s** — and `PLACE_IN` is **0.300s,
    starting at that same instant**. All of the ease that `drawPlace`'s own
    comment describes — *"it eases on the way in so it arrives rather than
    snaps"* — was spent underneath the fade. The world appeared with the name
    already fully in place. A comment describing a quality nobody could see.

    **The wipe, shot rather than filmed.** Every battle panel is up at full
    strength **one frame into the wipe — 0.53s of the 0.55s**. Both HUDs, the
    intent chip, the whole card row, the action buttons and the aimed-card line,
    sitting over the closing bars and the map you were still walking on. The
    bars exist to hide a transition and hid the world and nothing else.

    **A film could not have found either.** A film grabs the canvas and the
    panels are DOM — the same blindness that let the intent chip outlive its foe
    until 169. The wipe needed a *still*, at peak cover, with the DOM in frame.

    **And the fix found its own second case, twice.** First attempt named six
    panels and missed `#dialogue`; shot again, it was the only thing left on
    screen. Named it, shot again — and `#toast` was still there at **0.99
    opacity over a picture that was 97% black**, saying "Dewdrip — new to the
    dex" about a fight nobody had been shown. Which is when the two halves
    joined up: the toast's clock was burning behind the bars exactly as the
    plaque's ease was burning behind the fade. **One rule, two beats, found
    ninety minutes apart.**

    So the condition has a name — `screenCovered()` — and three callers: the
    plaque's clock, the toast's clock, and the class that takes the panels out
    of the wipe. Holding the clock rather than delaying the raise self-corrects
    for every entrance: a warp's .3, the loss handler's .5, the bars' .55, and
    the paths with no cover at all.

    **Waiting is not starving, netted separately** (170's rule, now twice
    useful): the plaque still arrives at full and still leaves; the toast still
    runs out. Break the fade's decay and both fail — *it still arrives at full*
    and *and still leaves (cleared at frame -1)*.

    Two instrument notes, both mine:
    - **My probe read `hand@1.00` inside a parent at `opacity:0`.** Opacity does
      not inherit — a child of a transparent parent still computes 1. The same
      ancestor blindness as 166's hit test, in a new costume. The picture
      settled it.
    - **A one-frame leak that was not there.** The net sampled `screenCovered()`
      BEFORE stepping, and the game's toast tick runs after the wipe decays in
      the same frame — so on the frame the bars finish, the screen is already
      open. Sampling after the step is the value the game actually used.

83. **Doing on purpose what 171 found by accident** (pass 172). 171's lesson —
    *a comment that claims a fix is a testable assertion* — as a job.

    **The sweep, mechanically.** Every backtick-quoted identifier a comment
    names, checked against the file with all comments stripped out, so "does the
    code do what the comment says" is asked of code and not of other comments.
    **104 identifiers. Clean.** No comment names a field the game does not have;
    the `b.burst`-vs-`b.crit` shape does not recur. One genuinely stale name: a
    comment called the early-return ladder `update` and the function is `step`.

    **The detector was wrong before the game was.** Its first version forbade a
    preceding dot — meant to catch a wrong owner, and it rejected every ordinary
    property access instead. **Six of its nine findings were that flaw**, not
    the game's. A detector whose false-positive rate is two thirds teaches you
    to skim its output, which is how a real one gets skimmed too.

    **Then the claim worth netting.** `enterMap` clears seven beats under a
    comment making two claims: that every beat owning the screen is abandoned
    when the map moves, and that every one of them blocks input while it runs.
    Both check out by hand — the `step` ladder gates on nine, `enterMap` clears
    seven, `alert` is cleared just above, and `warp` is deliberately excluded
    because `warpStep` is what calls `enterMap`. So: no bug, and a claim that
    will rot the moment somebody adds a beat.

    It is a net now, and **the list of beats is read out of the ladder** rather
    than written into the test.

    **And I wrote the same fault into it on the first attempt.** The section's
    own comment said *"a beat added to `step` and forgotten in `enterMap` fails
    this"* — while the behavioural half iterated a hardcoded list, so it would
    have done nothing of the kind. Caught by planting exactly that: a `newbeat`
    line in the ladder, no clear in `enterMap`. Now:

        ✗ newbeat was abandoned

    **A comment in a test is a claim like any other.** This pass was sent to
    find prose that overstates its code, and produced some.

    Two smaller ones. The ladder writes `return;`, not `return true;` — the
    first parser required the latter and found **two of nine** guarded beats,
    reporting a clean parse. *A parser that silently under-reads is the same
    fault as a net that cannot fail: it agrees with you.* And `gotcha` gates the
    frame from an inline block rather than a `…Step(dt)` call, so no pattern
    over that shape can see it; it is named explicitly, with the reason, rather
    than quietly missing from a list that claims to be complete.

    Finally, two beats that had never been filmed: the wipe into a fight
    (`wipein`) and a door (`door`). Both read correctly — bars close over the
    overworld, the arena swaps underneath, bars retract on the fight; the
    curtain shuts, the map changes, the fade opens it. Scenes added so the next
    pass can ask the six questions of them without building the rig again.

82. **A fix that named the wrong field, and said otherwise in prose** (pass 171).
    Sent to hunt the shape that had paid off three passes running — *a rule
    written down and applied to one of its cases*. The sweep came back mostly
    clean, and then found something worse than what it was looking for.

    **The sweep, with counts.** Draw-order guards: the place plaque is the only
    canvas layer drawn between the world and the screen-takers, and it now names
    both cases (168). Everything after it — flourish, gotcha, chest, blackout,
    fade, warp, wipe — is drawn later and therefore covers it by construction.
    Panel hiding: three battle-exit paths (win, run, lose) × eight panels,
    **measured, all clean**; the apparent asymmetry between the three
    `show(…, false)` sites is cosmetic, because `battleBar(on)` hides `#intent`
    as well as `#battlebar`, so all three hide the same effective set. The mend
    is clean on all five questions and sequential with its own dialogue.

    **Then the real one.** `mx` is
    `72 − shake − wind(windM) + lunge(lungeM) − recoil(recoilM)`: four ways the
    player's sprite can be displaced, and the level's clear-list named three.
    Adding `windM` is a one-token defensive change — measured, it is 0 at the
    frame the level lands in both shapes of levelling fight.

    But writing the net as *the claim* rather than *the line* — assert every
    beat that draws on or shoves this sprite is zero — turned up a fifth thing:

        ✗ crit is not still running under the level (got 1, want 0)

    **There are two burst fields.** `b.burst` is every landed hit; `b.crit` is
    the crit ring, drawn at cx 72, exactly where the level ring goes. The
    comment at that site said the crit burst had been added to the clear-list —
    calling it *"the third time a fix here has reached most of what it claimed
    rather than all of it"* — and the line under it cleared `b.burst`. **The fix
    named the wrong field, so the one thing it was written to clear was the one
    thing it never cleared, and it asserted the opposite in prose.** A comment
    that is wrong is worse than no comment: it is the thing a reader trusts
    instead of checking.

    **And the net only worked because it dirtied the sprite first.** The section
    shoves the sprite every way it can be shoved right up to the level landing.
    Deleting the entire clear-list AND the dirtying together leaves the suite
    **green at 1126** — that is the demonstration, run deliberately. A net that
    checks a battle where the values were zero anyway cannot fail.

    **The measurement lesson, which nearly cost two false fixes.** An additive
    beat's measured brightness depends on the backdrop it lands on *and* the
    moment it is posed at:

        the same level ring, posed at battle start   22.12   (backdrop 63.5)
        …at the moment it actually plays              4.52   (backdrop 93.6)
        the hit flash, posed at frame zero            0.00   (creatures sliding in)
        …once the arena has settled                  +1.62   (2208 px changed)

    Both of the wrong numbers were TRUE, about pictures the player never sees. I
    doubted pass 170's tuning on the strength of the first, measured level and
    flourish **at the same instant against the same backdrop**, and got 4.52
    against 4.48 — 170's parity holds. **Measure a beat where it happens, and
    measure what it is competing with in the same frame.**

    Finally, an own goal worth writing down: mid break-and-restore I restored
    `index.html` from a scratchpad copy and reached for `git checkout` on the
    test file — which discarded the uncommitted section I had just written.
    Restore uncommitted work the same way you saved it.

81. **The most repeated good thing in the game was ten times quieter than the
    thing that follows it** (pass 170). The level-up, filmed and then measured
    twice — once for timing, once for light — and both numbers said the same
    thing from different directions.

    **Timing.** Driven through a real winning fight: fall 1.97s, XP bar filling
    2.53s, level rings 3.50s (LVL_T is .8s, so to 4.30s), **victory flourish
    3.90s**. Half the level is drawn underneath a field of gold motes rising in
    the same colour. On film it is not a level-up at all.

    The fix is one line, and the rule for it was already written down. The game
    clears `flashM`, `lungeM`, `recoilM` and the crit burst when a level lands,
    under a comment explaining why: *two beats running at once are
    indistinguishable and the one not yet read wins.* **The rule was applied to
    everything that comes BEFORE the level and to nothing that comes after.**
    That is the third pass running that this shape has turned up — 168's plaque
    guard, 169's foe-cannot-act, and now this. It is worth going looking for.

    Waiting costs at most 0.8s and only on fights that levelled, which is the
    one case where there is something extra to look at. `lvT` decays every
    frame unconditionally, so it cannot stall — and the net proves that
    separately, because *waiting is not starving* is a different claim from
    *they do not overlap* and freezing `lvT` satisfies the second while
    destroying the first.

    **Light.** Then the harder question: with the screen to itself, does the
    beat actually read? Not by eye — by pixels. Draw the frame, set `lvT = 0`,
    draw again, difference the mean luminance over the 68x52 box the rings and
    sparks live in:

        the level beat adds   0.48
        the flourish adds     4.92     to the same box

    **Ten times.** Three one-pixel rings at half alpha cannot carry a beat: a
    ring is an outline, and what was missing was light. A short warm glow on the
    ground under the creature — the same device the flourish already uses,
    scoped to the one who earned it — plus thicker, brighter rings.

    **And then it overshot, which the same measurement caught.** First attempt:
    **8.81 against the flourish's 4.59**, nearly twice as loud — a local event
    shouting down a field-wide one. Dialled the glow alpha .5 → .22 and
    re-measured: **4.52 against 4.59.** Parity, not dominance. *A number that
    can tell you a thing is too quiet can tell you it is too loud, and tuning by
    eye would have kept whichever version I looked at last.*

    Two smaller notes. `wait` delays a FILM's start as well as a still's, so
    `levelup` (wait 4500) cannot film the beat it is named for; `levelwin` walks
    the simulation forward in sixtieths inside `go()` instead — a film cannot be
    given a start offset, so the scene has to seek itself. And a measurement
    that runs a loop until `lvT` hits zero then reads the flourish is measuring
    a different picture: the new gate lets the battle finish at that exact
    instant, so the arena is gone. The 0.059 it printed was true and meaningless.

80. **The screen kept promising a swing from a creature lying on its side**
    (pass 169). Filmed the kill, and the brief's question — are the foe's death
    and your victory two beats or one mush? — came back **two beats, cleanly
    separated**, with numbers: the `faint` plays at 1.97s, the fall runs 0.55s,
    and the flourish starts at 3.52s. Nothing to fix there.

    What the measurement found instead was a **falsehood on screen for a second
    and a half**. The intent chip — "Foe: Mist Spray · hits 9" — is a promise
    about a NEXT TURN, and it went on saying it over a foe that had fallen and
    faded, right up until the flourish hid the panels.

    **The film could not have found this and neither could the eye.** A film
    grabs the canvas; the chip is DOM. It took probing the DOM on a timer
    through the same driven kill — the 167 move, applied to the moment rather
    than to a layout.

    - **Gated on the PICTURE, not the state.** The outcome is settled the
      instant the card resolves, about two seconds before the creature is seen
      to fall. Clearing on `foe.hp` or `b.over` would take the foe's intent off
      the screen while it is still standing there mid-exchange. Same reason the
      bar follows `dispF`.
    - **Knowing the answer is no use if nothing asks.** The chip lives in
      `renderHand`, which runs when the PLAYBACK ends — a second and a half
      after the fall — so the first fix changed the condition and the screen
      did not change at all. It is redrawn at the faint now, and redrawing the
      chip alone rather than the whole hand, because rebuilding the row
      mid-playback would reset the cards' transitions under a running beat.
    - **Two ways a foe stops being able to act, and they had to be found
      separately.** It falls, or an orb takes it — and the second is not a
      variant of the first, because the creature is alive and about to be
      yours. Measured through a successful catch, the chip promised
      "Foe: Rip Curl · hits 7-8" from the suck all the way to the click. That
      is 168's lesson (*a rule applied to one of its cases*) arriving one pass
      later, in my own fix.
    - And `foeAfield` is deliberately **not** `inOrb`, which the draw already
      has: `inOrb` asks "should I skip the normal sprite draw" and excludes the
      suck, where the creature is still drawn, shrinking. Two conditions that
      overlap are still two questions — the same trap 167 hit from the other
      side.

    **The net that could not say anything.** The first version tested
    `foeAfield` and counted the redraw sites, and *not the wiring between them*.
    Reverting the gate — putting `const it = b.intent` straight back — broke the
    game and **nothing failed**, because `renderIntent` returns early when
    headless and the DOM stub hands back a fresh element each call, so no suite
    could ever read the chip. Extracting `intentLine(b)` as a **value** made the
    break bite on the first try: *a fallen foe says nothing (got "Foe: <b>Mist
    Spray</b> · hits 9", want "")*. **If a break does not bite, the net is not a
    net — and "I planted a fault and nothing happened" is a result about the
    test, never about the code.**

    **And the scene walked into a trap the ledger already records.** `playCard`
    BUILDS a log and returns it; `submitLog` plays it back, and the fall is set
    by a `faint` entry during that playback. Calling `playCard` alone left the
    foe on 0 HP with `downF` never set and the flourish starting 0.02s after the
    hit — a timeline I nearly wrote up as a finding. Entry 78 records this exact
    trap for `doAction` in the catching scene, one scene earlier. Two smaller
    ones in the same setup: **the deck is shuffled**, so pinning the damage roll
    alone still dealt a different hand each run and pinning had to cover
    `startBattle`; and `cardText` is a DECK-card function that reads
    `CARDS[id].txt`, so asking it for a kin card's text throws — the game
    branches on `src === 'kin'` at every live call site, and I checked all three
    before believing it was mine.

    One thing measured and left alone: the second between the fall finishing and
    the flourish starting is **not dead air**. The DOM is showing "Cindercub
    gained 53 EXP." and the XP bar is filling. The measurement stopped a fix.

79. **A wind-up that never wound up** (pass 168). The evolution, filmed. And the
    thing worth carrying out of this one is that **the eye could not have called
    it** — the fault was in the arithmetic of a rotation, and it took a number.

    The wheel behind the creature is twelve spokes with a comment that says
    "turning behind it, faster the closer it gets". It rotated by
    `G.t * (.35 + heat * 2.6)` — **a product of absolute time and a rate that
    changes**, which is not the angle a thing turning at that rate would be at.
    The derivative of `t·r(t)` carries a `t·r'(t)` term, so every time the rate
    moved, the wheel teleported.

    Driven headlessly and differenced frame by frame:

        phase     vel first -> last     min      max   reverses?
        hold          0.4 ->     1.6                      no
        build         1.0 ->     6.0                      no
        burst      -424.6 ->    -3.0  -424.6              YES
        settle       -3.0 ->     9.7    -3.0      9.7     YES
        quiet        -0.3 ->    -0.3                      YES

    **Three sign flips in four and a half seconds**, where the intent was one
    wind-up and one release. The 425 rad/s reversal at the burst only goes
    unnoticed because the white-out happens to cover it — luck, not design — and
    the settle's reversal is in plain view for a full second. Integrating the
    angle in `evoStep`, where `dt` is, gives 0.4 → 2.9 climbing, one flip at the
    moment the creature changes, and −3.0 → −0.3 unwinding. Peak 425 → 3.0.

    **The direction flip survives, and works properly for the first time.** With
    an accumulated angle, flipping the sign of the RATE reverses the spin
    without moving the wheel. Flipping the sign of an ANGLE teleports it. That
    was the whole bug in one sentence.

    **Anything that turns and is drawn from `t * rate` has this bug** the moment
    `rate` stops being constant — so I grepped every `rotate(` in the game
    rather than leaving that as a remark. There is one other spoked wheel, on
    the win flourish, and it turns at `a.t * .5`: a CONSTANT rate, where the
    product is exactly the integral and there is nothing to fix. Two wheels, one
    bug, and the difference between them is the whole rule.

    **Then the scene found a real one by misbehaving.** `evolving` enters a map
    and evolves in the same breath, so every frame of the first film carried a
    ROUTE ONE plaque in the corner. Scene artefact — and then both: the plaque
    really was drawing over the evolution. The call site already said *"a plaque
    has no business sitting on top of a catch or a wipe"* and then named one
    screen-taker (`!G.battle`). An evolution replaces the world exactly as a
    battle does. **A rule written down and then applied to one of its cases.**
    Latent rather than live — a level comes from a fight, and a fight cannot
    start and finish inside the plaque's two seconds — but one token, against an
    intent already spelled out on the line above it.

    **Three scenes for one moment, and that is correct.** `evolve` drives a real
    battle first, so nineteen frames of any film of it are the fight and the
    change falls off the end of the strip. `evolve2` seeks to the last breath of
    `build` for a still. Neither can film the arc, so `evolving` starts the beat
    from nothing. One scene per question, not one scene per subject.

    And the question that paid off in 167 — measure the subject against the DOM
    — came back **genuinely clean** here: five probe points across the creature,
    both window sizes, nothing but `#view`. Worth reporting as a number rather
    than as silence, because "I checked and it was fine" and "I forgot to check"
    read identically in a commit.

78. **The moment was happening behind a health bar** (pass 167). Two surveys
    clean, so: stop surveying, film something. The catch — 24 frames at 150ms —
    and **seventeen of them are the wait**, which is the point of a catch. What
    the film said, in one sentence: *the two and a half seconds of dead air has
    no escalation, because every wobble looks exactly like the last one.*

    - **The shake now knows which shake it is.** The game already counts the
      holds and already says so afterwards — "Three shakes. You had it." — but
      the picture said the same thing three times. The third rock is the one
      that nearly held.
    - **The hush.** Escalating the rock made the ORB louder without making the
      MOMENT bigger: an 8px object on a 256px canvas is still the only thing
      moving while the kin, the ground and the sky carry on as though nothing
      were being decided. Everything that is not the orb steps back, further
      with each hold, and is released on the click — a resolution delivered
      under a vignette reads as a continuation rather than an answer.
    - **…and then the measurement that reframed the whole pass.** The orb rests
      at canvas (178, 70). Measured against the DOM, that is **inside the
      player's HUD plate on a phone** and two pixels above it on a desktop.
      Every bit of work on this beat was happening behind a health bar on the
      layout most people will play on — and a canvas vignette cannot dim a DOM
      panel. Only the panel can. The hush now reaches the panels too.
      **166 had quietly made this worse**: moving the action row up by 20px for
      the thumb moved it toward the orb.

    **A moment you are photographing to judge a change to it has to pose the
    same way twice.** The throw is a dice roll, and three films taken to judge
    one change came back as a three-shake catch, a three-shake catch, and a
    one-shake break — and the third was not comparable to either, which is a
    quiet way to conclude anything you like. The scene pins the roll now.
    A second scene (`hush`) exists because `wait` delays the FILM's start as
    well as the still's, so a 3s wait on `catching` would begin recording after
    the throw had finished. Two questions, two scenes.

    **And the nets caught me twice, in opposite directions.**
    - `b.orb` does not exist after `submitLog`: `tryCatch` leaves an `orbPlan`
      and the log PLAYBACK turns it into a live throw. The first version
      asserted on the wrong instant and reported "no throw is playing" about a
      throw that was about to play.
    - The first "one condition, not two" net counted inline copies by regex and
      also matched `inOrb` — which asks a genuinely DIFFERENT question (is the
      creature inside the orb, true through the click). **A net that cannot tell
      two conditions apart is naming markup**, which is rule 68 arriving from a
      new angle. Replaced with the claim: both layers CALL the named one.
    - **And I pinned the scene's dice and not the suite's, one file later.**
      The net went green sixteen times and then failed under `npm run check`:
      two runs in fourteen roll a zero-shake break — correctly played, and it
      simply never reaches the beats being tested. Caught only because the full
      check disagreed with the suite run alone, which is the one signal that
      distinguishes a flaky net from a passing one. **A flaky net is worse than
      no net: it teaches you to re-run.**
    - And a false alarm of my own making: planting a throw inside `drawOrb`
      appeared not to bite, which would have meant the draw-coverage check was
      vacuous. It bit perfectly — `grep -E "✗|Error" | head -2` had eaten the
      stack trace. **The filter on the evidence is part of the instrument.**

77. **Measuring the thing instead of a proxy for it** (pass 166). 165's survey
    grew a second mode — `node tools/emberkin/survey.mjs targets` — that opens
    eleven screens at 390x760 and measures every tappable element against a 44px
    thumb. Three real sets came back, and **the number that mattered was never
    the border box**.

    **What a thumb gets is not `getBoundingClientRect`.** It is the region where
    a tap still resolves to the element: padding counts, a `::after` spacer
    counts, and a sibling painted on top takes it away again — and none of those
    three move the rect. The probe walks outward from the centre a pixel at a
    time and asks the browser's own hit test where the target stops. Measuring
    the proxy would have made one of the three repairs literally unverifiable,
    and an unverifiable repair is a guess.

    - **The way out of every screen was the smallest target in the game.** The
      back chip is 21x10 of text with no padding, on all eight screens that have
      one — an **8px** tall hit area. It keeps its size; a transparent spacer
      gives the thumb something to land on, so nothing moves by a pixel.
    - **The four buttons pressed every turn of every fight**: 24px. And the
      first repair *did not work* — the box went to 44 and the reachable area
      stayed at 24, because `#acts` is anchored by its top and the button grew
      straight down into the panel that carries the selected card's text.
      **Growing a target into whatever sits below it is not growing it.** The
      row now moves up by exactly what it gained.
    - **Rename and Done**, at 18px, and the chest shelf at 43. The chest fix is
      written as a rule about list rows rather than about chests, so the next
      list gets it for free.

    **Size is only half the question.** Two targets can each clear 44px and
    still sit close enough that one fingertip covers both, which a size check
    cannot see at all — so the survey also reports centre-to-centre distance,
    and separately asks of every target *what does a tap at your own centre
    actually hit*. The game is clean on both. The proximity check was still
    proved by shrinking a row until it fired, because **a check that has never
    said anything and a check that cannot say anything look identical.**

    **Five errors in the instrument, and it reported the game clean twice more
    than it should have:**
    1. **A phantom on all eleven screens.** The setup drove `takeStarter` from
       outside and so never hid the title, which stays laid out underneath
       everything: "New journey" measured as a live 145x38 button on every
       screen, and `elementFromPoint` confirmed a tap really would have hit it.
       `shot.mjs` clicks past the title exactly like a player and says why; the
       survey now does too.
    2. **21 ordinary list rows called unreachable**, because the bound used was
       the window. On a phone `#screen` is a 310px panel holding 1004px of dex,
       so a scrolled-out cell still reports a rect inside a 760px window. The
       bound is the SCROLLER.
    3. **An ancestor counted as a hit.** `at.contains(el)` was in the
       reachability test, so a tap landing on `#screen` counted as reaching the
       back chip — and the chip measured 44px tall when its box is 10. *The
       instrument agreed with a fix that had not been made yet.* A descendant is
       a hit (the click bubbles up); an ancestor is a miss.
    4. **A 2px probe step reported 40 for a box that is exactly 44.** The
       tempting repair is to relax the threshold, which is 164's mistake in a
       new costume. A 44px box spans 44 integer rows: measure in 1px steps and
       count the centre pixel.
    5. **A stray `*/` left the back-chip rule outside its comment**, and CSS
       error recovery swallowed it as part of an invalid selector. The survey
       dutifully reported the chip unchanged at 8px — which is the one case in
       this list where the instrument was right and I was wrong to doubt it.

    And the pair-dedupe key was built from one end of the pair plus the other's
    text, so it differed depending on which end you started from and deduped
    nothing. It only showed up **because the check was being proved** — the real
    game has no near-pairs, so the bug would have sat there indefinitely.

    The size a thumb needs is now `--tap: 44px`, named once, asked for by every
    touch rule. Same move as `PARTY_MAX` in 163, same reason: four rules that
    agree on a number today are four rules that will disagree later.

76. **Asking all ten screens at once instead of aiming a camera** (pass 165).
    164 found a real fault by measuring the DOM after the pixels had lied, so
    165 stopped aiming: a **survey** — `tools/emberkin/survey.mjs`, alongside
    `shot.mjs` — that opens ten screens at a desktop and a phone size and asks
    every visible element one question. *Is your text wider than the box you are
    drawn in, with nothing above you clipping it?* **1901 elements, two faults,
    neither of which any shot in the library had shown.**

    - **A dex cell's type chips.** `.types` is a flex row and had **no wrap rule
      at all**, so the longest dual — VERDANT + GLOOM — laid its second chip
      **8px past a 96px cell**, over the creature beside it. Now it wraps: a
      chip is a word, it may move to the next line, it may not be halved, and it
      may never be read as belonging to the neighbour.
    - **The Prism chest's odds, 13px over — one row, at one width.** Not a
      responsive breakpoint: Prism is the dearest chest, so `1620gems` is the
      widest price, so its description column is the narrowest of the four, and
      only there does the line run out. The rule said `white-space:nowrap` on
      the WHOLE line. That is half a claim stated as a whole one — it correctly
      forbids breaking "45%" from "epic" and *also* forbids the break between
      "45% epic" and "20% legendary", which is the break you wanted. **The
      nowrap belongs on the item, not the line**, and the separator is glued to
      the item before it with `&nbsp;` so a wrapped line opens with a number
      rather than a stray dot.

    **The general shape: a row of separable items needs two rules, and one of
    them is easy to forget.** Free to break BETWEEN items, forbidden to break
    INSIDE one. Both faults were that pair with a half missing — the dex row had
    neither, the chest row had only the second.

    **Four errors in the instrument before it found anything**, which is the
    real content of this entry:
    1. Setup named an item that does not exist (`emberroot`) and an export that
       is not exported (`EK.openMainMenu`). Both threw silently into a
       `(setup failed)` row I nearly read as a clean screen.
    2. I "tightened" the detector to require the element's **bounding rect** to
       escape its card. It then walked 1902 elements and reported **clean with a
       known fault in place**. *Overflowing text does not extend an element's
       rect* — the box stays at its containing width and the glyphs paint
       outside it. `scrollWidth` vs `clientWidth` is the only detector that sees
       this, and `getBoundingClientRect` — the instrument 75 trusted over the
       pixels — is blind to it.
    3. Walking ancestors for a clipping parent disqualified **everything**:
       `#screen` is `overflow:auto`, so every element in the game has a clipping
       ancestor. The walk has to STOP AT THE CARD; what matters is whether the
       text is caught before it reaches its neighbours, not before it reaches
       the window.
    4. Measuring the odds against the price, `row.querySelector('.tally, b, .cost')`
       returned the chest NAME. **`querySelector` uses document order, not
       selector order** — a comma list is not a priority list.

    Twice in that sequence the instrument told me the game was clean. **A survey
    that reports nothing has two explanations and only one of them is good**, so
    it prints its coverage (`1900 elements walked`) and it is proved by
    reintroducing a known fault and watching it bite — the same proof a test
    gets. It also now skips elements with no text: the chest's metal strap is
    `left:-2px; right:-2px` because a strap that stops at the box is not a
    strap, and a survey that reports two known-benign rows every run teaches you
    to skip its output.

75. **I wrote a fix for a fault that was not there** (pass 164). Finishing 74's
    question — the nickname in the OTHER places `dispName` lands. Four sites,
    three clean, one real. And the interesting part is the one I got wrong.

    **The battle HUD looked broken and was not.** The phone screenshot appeared
    to show a twelve-character nickname spilling out of the left edge of its
    plate, over the arena. It is a flex item with no `min-width:0`, which is
    EXACTLY the root cause found in 74, so the diagnosis fitted perfectly. I
    wrote the rule, shot it again, and the picture looked unchanged — which is
    what finally made me measure the DOM instead of the pixels:
    **108px name inside a 180px plate, `scrollWidth === clientWidth`, at both
    sizes.** Nothing was overflowing. What I had been reading as spill was the
    DIALOGUE BOX drawn over the plate.
    The rule was reverted. Shipping it would have been harmless CSS carrying a
    comment that described a fault the game never had — a false story in the
    source, which is worse than the dead rule.
    **"When a shot looks wrong, suspect the scene first" is written in this file
    three times and I still needed the measurement to believe it.** The pixels
    are an instrument with a known failure mode; `getBoundingClientRect` is not.

    **The one that was real, found by the same measurement.** The box card is
    the narrowest thing in the game that takes a name — 74px of text beside a
    40px sprite on a desktop, 69px on a phone — and a twelve-character nickname
    measures 120px. It ran **46px past its own card**. Clipped now.
    It ELLIPSES where the stat block WRAPS, and the difference is the room:
    these are grid cells, and a name that wrapped would make one card a line
    taller than the five beside it — the ragged row 157 spent three attempts
    removing. The detail pane above shows the name in full, so nothing is lost.

    **Clean, with the property named:**
    - **The nickname is the only typed input in the game.** One `<input>`, one
      `.value` read, no `prompt()`, no `contenteditable`.
    - **The gotcha card** names `caught.name` — the SPECIES — and fires before
      the profile screen where naming happens. It can never show a nickname.
    - **The forced-switch prompt** names the FOE, and a foe is built by `mkMon`
      without one.

    And a smaller lesson inside the net: my first two assertions counted `<input`
    (2 — one is prose in a comment) and `/\\.value/` (3 — `Object.values` matches
    it). **A regex that is nearly right gives a number that is confidently
    wrong**, and the fix is to count the real thing, not to adjust the expected
    number until it passes.

74. **The one thing in this game a player types** (pass 163). No pass had ever
    driven that input. The profile screen lets you nickname a kin, and
    `dispName()` — `nick || name` — lands in `innerHTML` at **fifty-five sites**.
    - **A nickname of `A<B` opened a `<b>` element in the middle of a name**, and
      the `</b>` that followed closed the wrong one, so the rest of the screen
      went bold and the DOM was corrupt from that row down. `m.nick` is SAVED,
      so it stayed corrupt for the rest of the run.
    - **`<3` was already safe, and that is luck, not design.** `<` before a
      DIGIT is not a tag start, so a parser emits it as text. The breaking case
      is `<` before a letter. Worth writing down because my first instinct was
      to claim `<3` as the realistic exploit, and reading the actual parse rule
      is what stopped me overstating it.
    - Fixed **at the boundary, not at the fifty-five**: `commitNick` strips
      angle brackets. One gate cannot drift out of step with itself the way
      fifty-five escapes would. `&` is deliberately kept — a bare ampersand
      renders as itself and stripping it would turn "Bo & Ed" into "Bo  Ed".
    - And in the same line: `.trim()` ran BEFORE `.slice(0, 12)`, so cutting at
      twelve could land mid-space and produce `"Ashling the "`. It trims twice
      now. Same shape as 73 — the degenerate output of a computed value.

    **Then the layout half, which only the picture could find.** `.kindetail
    .portrait` is `float:right` and `.pname` is a FLEX container — and a flex
    container's contents are not line boxes, so nothing in it wrapped around the
    float. At twelve characters the level chip was drawn **on top of the
    portrait frame**.

    **And my first fix was wrong, which the next shot said immediately.**
    `overflow:hidden` + `text-overflow:ellipsis` cleared the float but clipped
    `Ashling them` to `Ashling t…` — a name the player chose, cut for space the
    panel had going spare underneath, while the kin row three inches to its left
    showed the whole thing. It **wraps** now: the level drops to the next line
    and `overflow-wrap:anywhere` handles a twelve-letter word.
    **Clearing a collision is not the same as solving it.** The first fix made
    the overlap go away and made the screen worse.

73. **"It cost you 1 shards." — the same sentence, one pass later** (pass 162).
    Swept every computed number the game prints beside a noun, by the method
    that worked last time: compute the expression over a range and READ THE
    SENTENCE. Three faults, two clean with nameable reasons, and one of the
    three was in the line I had rewritten the pass before.
    - **The win flourish already got it right on the canvas** — `+1 gem`,
      `+2 gems` — and the TOAST for the same win, fired in the same moment two
      inches away, said `+1 gems`. One number, one event, two places,
      disagreeing. The private copy of the rule was the tell.
    - **`1 gems short.`** on the chest screen.
    - **`It cost you 1 shards.`** for anybody holding four to seven shards.
      Pass 72 rewrote that exact sentence for ZERO and walked straight past ONE.
      **Fixing a degenerate value is not the same as fixing degenerate values.**
      A `countOf(n, one, many)` now stands between every count and its noun.
    - **Clean, and why:** `Collection — N spare` works at any count because
      "spare" is an adjective; `Nobody left to beat. N kin still unfound.`
      cannot reach zero, because the ternary above it takes the other branch
      when nothing is left, and `kin` is invariant in this game's usage anyway.
      Trainer prizes are 240–3000 and can never be one — but they go through the
      helper regardless, because an invariant that holds by accident is a
      landmine and the helper costs nothing.

    **And the net that had to be rewritten was mine.** Pass 72's assertion named
    the MARKUP — ``It cost you ${lost} shards.`` — so it failed the moment the
    line improved. That is rule 68 exactly, written down in pass 157 and then
    broken by me in 161. **Writing a rule down protects the code you write while
    you are thinking about it and nothing after that** (which is entry 64's
    lesson, arriving for the third time). The assertion now names the claim: a
    real charge still states its amount.

72. **"It cost you 0 shards."** (pass 161). Generalising 70's blind spot —
    what else does the game show only to somebody who has been here before? —
    across the states no scene had ever produced. **Most came back clean, and
    the clean ones are half the entry.**
    - **The pause menu.** Kin, Dex, Box, Deck and Sound carry a sub; **Bag does
      not**, which looks exactly like the 158 fault one level up. It is not.
      The menu's own title reads `Hollowbrook · 500 shards · 260 gems` — Bag is
      the one row whose number is already on the screen, one line above it, and
      putting it on the row would print it twice. The rule holds: collections
      carry their count, actions (Fullscreen, Save, Close) carry none, and
      Bag's lives in the title. **Clean, and the property that exempts it is
      nameable.**
    - **The Wayhouse landing after a wipe.** My first shot of it showed a silent
      room and I nearly wrote that down as the fault. It is not — `finishBattle`
      says two lines, blacks out, opens the room and has Sable speak. The
      `wipe` scene mashes A through everything to reach the Wayhouse, so the
      line it exists to deliver had never been in a picture. **The instrument,
      again, not the game** — and the third time this exact shape has appeared
      (levelup in 65, gotcha in 67). A `wipeland` scene now stops advancing the
      moment the map becomes the Wayhouse.

    **The fault, once the line was finally on screen.** Sable's fee is a quarter
    of your shards, FLOORED. Anybody holding fewer than four is told *"It cost
    you 0 shards"* — and that is precisely the player most likely to be broke,
    because they have just lost everything they had. A number that is always
    zero reads as a bug, and it turned the only piece of kindness in the losing
    beat into a clerical error. She says nothing was asked for now, and does not
    explain why, which is how she talks everywhere else.
    The net checks BOTH branches and that `G.money -= lost` survives, so the
    wording fix cannot be mistaken for a quiet removal of the loss — breaking
    that line is one of the two on-purpose breaks.

    **An edge state is not always rare.** The zero-shard branch is not an
    unlikely corner; it is the DEFAULT for the player the beat is written for.
    Ask who actually arrives in a state before deciding it is an edge.

71. **Played the first twenty minutes, and the fault was on the screen before
    them** (pass 160). Nine passes of consistency work; this one went back to
    driving the game. Most of what the drive measured came back healthy, and
    **the healthy numbers are the finding as much as the fault is**:
    - **The opening is six presses.** Three lines of Rowan, one real choice, the
      gotcha, and you are walking. Nothing to trim.
    - **The early fights have no dead turns.** Over 60 Route One fights at the
      starting level: **0%** of turns had nothing affordable, **0%** had exactly
      one play, **100%** offered two or more. The hand always poses a question.
    - **The starter choice is fair.** Cindercub / Dewdrip / Sproutle run 5.1 /
      5.8 / 5.5 turns per fight and finish at a median low of 0.90 / 0.88 / 0.93
      HP. The first decision in the game does not decide the first hour's pace.
    - **First level after three fights.**
    - **What the drive DID find, and did not act on:** the opening has decisions
      but no stakes. 60 fights, 60 wins, median lowest HP **0.82**, and only 8%
      ever dropped below half. That is a balance judgement and the standing rule
      is no balance change without a PAIRED measurement — this is a single arm.
      Recorded for a pass that can run both.

    **And then the screen before the game.** The title had only ever been
    photographed by a first-time player, because `Continue` only exists when
    there is a save — so every shot of it ever taken showed one button, and that
    button was `New journey`, which calls `wipeSave()`. Seeded a save and looked
    at what a returning player actually sees:
    - `New journey` **above** `Continue`, identical weight, identical colour,
      nothing marking one as destructive;
    - while the KEYBOARD already disagreed — `justPressed('a')` on the title
      runs `startCont` whenever a save exists.
    The layout follows the key now: one `returning` flag, set in the same line
    that reveals the button, drives `order:-1` on Continue and demotes the one
    that wipes a run. A first-time title is untouched — both rules are gated, so
    there is nothing to protect and nothing to demote.

    The PHONE layout confirmed it harder than the desktop one did: the touch
    buttons are labelled from `btnLabels()`, which on the title already reads
    `['Continue', 'New']` when a save exists — so the gold A button said
    Continue while the panel two inches above it led with New journey. The
    screen was contradicting itself in one picture.

    **A screen with a conditional element has a state your instrument has never
    seen, and the condition is usually "the player has been here before".**
    Every scene in this library starts from a fresh store. That is the blind
    spot, and it is not the same blind spot as a posed state (entry 67) — the
    scene was honest, the STARTING CONDITION was narrow.

70. **Four asked, three clean, one shipped** (pass 159). The set-level sweep
    had four open questions and the rule is fix ONE per pass, so all four were
    checked and only the last was touched. **Reporting the clean ones is half
    the pass** — a question answered "no fault here" is answered.
    - **The "X — back" chip.** One CSS rule (`right:12px; top:10px`), one render
      line, one phone adjustment for the control band. Same corner, size and
      colour everywhere by construction. **Clean.**
    - **Where the panel starts.** `#screen` is a single rule every screen shares
      and so is `#screen h2`. The top and left edges cannot drift. **Clean.**
    - **Gold.** Real dilution: `--gold` is the h2 on every screen, the level in
      a kin row, the dex number of a caught kin, the item tally, the energy
      cost, the selection ring on five different card types, and the kin card's
      border. At least four meanings — heading, level, selection, "this is a kin
      thing". But it is also the game's accent, and repainting a project's
      identity colour on a consistency argument is a taste call I do not get to
      make unilaterally. **Recorded, not changed.**
    - **The box had no detail pane.** Shipped.

    The box is the screen you stand in to decide who to bring, and it was the
    one screen that could not answer the question that decision turns on. The
    party screen puts a stat block beside its list; the dex puts a detail pane
    under its grid; the box had neither, so "what does this one know" meant
    withdrawing it, opening the party screen, and putting it back. Third
    instalment of the same fault: 157 found the box row dropped the status chip,
    158 found it used a different noun for the collection, and this is the box
    dropping the whole answer.

    **The picture rejected two placements before it kept one.**
    - *Under the grids*, the way the dex does it — the dex's grid is nineteen
      cells and fits, this one is a party plus a box that runs to thirty-odd
      cards, so the pane landed below every one of them and off the bottom of
      the screen. **It was there and it was invisible**, which is worse than
      absent because a source net can see it and be satisfied.
    - *Above the grids*, which is right — except a full-width panel leading a
      screen draws straight through the `.back` chip, since the chip is
      absolutely positioned and every other screen opens with a short `<h2>`
      that sits to its left. Reserved the corner rather than moving the chip:
      the chip being in the same place on every screen is the whole point of it.
    - And the first attempt at reserving it used `:first-child`, which is the
      BACK CHIP — the panel is the second child. **A selector that matches
      nothing fails exactly like a rule that does nothing.** The shot caught it.

    **The cost, stated rather than skipped:** on a phone the pane fills most of
    the viewport and leaves a sliver of the grid, so browsing means scrolling
    down and inspecting means scrolling back up. Checked with `--touch --size
    390x760`; the chip is clear and the block reads, but this is a real trade
    and not a free one. The desktop case is unambiguously better and the dex
    already asks for the same scroll, which is why it was kept.

69. **One collection, three screens, three names for it** (pass 158). Asked of
    the SET rather than of any one screen, which is the only way this was ever
    going to be visible. Every inventory in the game heads itself
    `Name — count`: `Dex — 13 caught / 16 seen / 19`, `Box — 26`,
    `Deck — 8/12 (min 5)`, `Collection — 4 spare`, `Bag — 500 shards`,
    `Gem chests — 260 gems`. The party broke that pattern in both of the ways
    available at once:
    - the pause menu said `Kin  6/6`,
    - the party screen said `Your kin` — **a different noun and no number**,
    - and the box screen, listing the SAME six creatures, headed them
      `Party — 6/6`.
    The one you open most was the odd one out, and `6/6` is the fact that
    matters — a full party is why a new catch goes to the box instead.
    `kin` is the game's own word (the battle button, `Choose your kin`, the card
    text); `Party` was the outlier. One `kinHeading()` now writes it for both
    screens and the menu takes its count from the same `partyTally()`.
    On the way: the cap was a bare `6` in four places, one of which draws the
    EMPTY SLOTS and one of which decides whether a catch joins you — two numbers
    that must agree and had no reason to. `PARTY_MAX` now.
    **The screens that are NOT in this family are prompts** — "Choose your kin",
    "What comes out?", "Take a card" — which ask a question rather than report
    an inventory. That is the property that exempts them, and the net says so.

68. **The same kin, two screens, two descriptions — and one of them dropped the
    thing you came to find out** (pass 157). Found by laying the world screens
    out side by side, which had never been done. The dex draws types as coloured
    chips and so does the party stat block and the party list row; the BOX card
    printed `Lv26 Verdant/Gloom` in plain grey text. Same fact, two idioms.
    Worse than cosmetic: the box row also carried **no status chip at all**, so
    a kin with BURN on it looked exactly like a healthy one — on the screen you
    stand in to decide who to bring, which is the one place that matters.
    Found all the readers first: eight sites call `typeChips`, and only two
    spelled a type out. One `kinSub(m)` now writes the list line for both rows.
    **The other plain-text reader was left alone on purpose** — the forced-switch
    prompt is a SENTENCE about the foe out there ("Bramblor is out there —
    Lv25 Verdant/Gloom") and chips inside prose read as a rash. That is the
    property that exempts it: it is not a list row, and the net says so.

    **The picture disagreed with me twice before it agreed.** Chips are wider
    than the text they replaced, and the CSS comment above the old rule warned
    that at slim width there is only ~86px beside a 40px sprite:
    - *First try* — chips at full size. Dual types stacked, so those cards ran a
      line taller than their neighbours.
    - *Second try* — shrink the chip so a dual type fits inline. **Worse.** Now
      SHORT names fit level+chip on one line and long ones did not: three
      different bar heights in one row of three cards, two of them the same
      species at different levels.
    - *Third* — stop letting it flow. `flex-basis:100%` on the level, so it
      takes a whole line always and the chips share the next one. Every card in
      the grid is the same shape whatever is on it.
    **A layout that depends on how long a name happens to be is not a layout.**
    Only the third of these was shippable and only the pictures could say which.

    One more, on a pre-existing net: it asserted the exact markup
    (`<small class="meta"><span>Lv…`) rather than the claim it was written for,
    which was that the level and the types stay separable units so a separator
    cannot be stranded. The claim survived this change; the spelling did not.
    Rewritten to assert the claim. **A net that names the markup fails when the
    markup changes for a good reason, and passes when it changes for a bad one.**

67. **A tool that cannot fail is not reporting on anything** (pass 156). Three
    scenes in one sitting had handed back a photograph of the room a beat
    happens in with no beat in it — and every one was reported as a successful
    shot, and two of them were looked at and believed. So the sweep, and then
    the guard.

    **The sweep.** Grepping every scene for a hand-assigned `G.*` beat object
    and for beat loops that only call `endTurn` came back with three posed
    scenes and two endTurn loops, and **most of them were fine**:
    - `ambush` poses `G.alert`, but derives `stop` the way `trainerSight()`
      does and its beats match `ALERT`. Verified, and already carrying a note
      saying it had been doubted once.
    - `dexcatch` poses a gotcha, says so in its own comment, and takes the
      string from the game's `dexTally()`. It proves the line FITS; whether it
      appears on the right catches is the suite's job.
    - `wipe`'s endTurn-only loop is CORRECT — the scene's whole subject is
      losing, and ending turns against something far too strong is exactly how
      you lose. Its comment says so and is right.
    Only `gotcha` was rotten. **A rate is not a disease; check each one.**

    **The one that was rotten** had two faults stacked. It posed the card, and
    the posed card carried `t: .9` while a still waits 1200ms and the gotcha
    dismisses itself at `t > 2`. So it photographed an empty room. The comment
    on `dexstarter`, twenty lines below, has spelled out that exact arithmetic
    about that exact number for several passes — **the scene it describes was
    never fixed**. FIRST CATCH had therefore never been looked at once.
    Caught for real now: a knocked-down wild kin, an orb thrown through
    `doAction` (not `tryCatch` — go through the bag's own path or the orb
    animation that holds the log never runs), and the card the game makes.
    One more, found on the way: `G.mapId = 'route_one'` does NOT load
    route_one — `enterMap` does. Set alone it left Rowan's lab drawn behind the
    card, so the first catch appeared to happen indoors.

    **The guard**, which is the durable half. A scene may now declare `wait`
    (ms to hold the shutter — the orb throw is ~3.5s of deliberate dead air and
    1200ms photographs the middle of it) and `needs` — a predicate checked AT
    the shutter. If it comes back false the tool says the shot does not contain
    its subject instead of quietly writing the file. Declared on all seven beat
    scenes, it immediately failed two of them, which is the entire point.
    And a second lesson inside the first: the first `needs` written for
    `levelup` was `lvl > 24 || !!G.flourish || !!G.screen`, and the reward
    screen satisfied it. **A check with an escape hatch in it is a check that
    cannot fail.** Tightened to name the subject alone, all seven pass.
    Broken on purpose: dropping `gotcha`'s `wait` reproduces the original
    silent-empty-room exactly.

66. **The instrument had never photographed the thing it was named after**
    (pass 155). The `evolve` scene HAND-BUILT `G.evoAnim` — beat index 2, its
    own durations, `swapped: false`, `res: null`. `evoStep` flips `swapped` on
    the way INTO the burst, so that combination is a state the game cannot
    reach: every picture ever taken of the evolution showed the OLD creature
    inside a white-out whose entire purpose is to reveal the new one, and the
    scene could never reach its own last line. Driven properly — a win that tips
    a Cindercub over Lv16 — the beats are `hold/old build/old burst/new
    settle/new quiet/new`, and the reveal lands where it should.
    Two drive faults on the way, both worth keeping: **ending the turn is not
    attacking** (the first film ran a loop of nothing but `endTurn` against a
    foe on 1 HP and recorded twelve frames of the Cindercub being chewed on —
    the player's swing comes out of a CARD), and **the card offer stands between
    the win and the evolution** (`settle` is the reward screen's `done`, so a
    film that stopped at "WON +1 gem" was stopping one screen short of its
    subject).
    **A scene that constructs its own state photographs a state the game cannot
    produce. Drive it to the moment; do not pose it.**
    The endTurn loop was COPIED FROM `levelup`, whose own comment ends "so one
    ended turn wins, the XP lands, and the level fires in among the win lines,
    which is where it has to be judged" — and its film was six frames of two
    creatures standing still, the fight never resolving. Same fix, same scene
    family. **A comment describing a fix is not evidence the fix is in; the
    picture is.**
    Not solved and recorded rather than claimed: holding the film ON the
    "grew to level 25" line. The win lines play back through the LOG, not
    through `battleMsg`, so a hold that reads `d.lines[d.i]` never matches. The
    beat mashes A every 120ms, which is not a player, so the film also cannot
    say whether the level-up reads as a moment at a human pace. That needs a
    beat the tool does not have.

    And what the drive found on the way, which is the actual fix in this pass:
    **the list of screens that refuse to close lived twice, and the copies
    disagreed.** `renderScreen` puts an "X — back" chip in the corner of every
    screen; three branches blanked it by rewriting `html`. The forced party
    screen — your kin is down, the game is demanding a replacement — locks on
    `opt.force` rather than on its kind, so it kept the chip. On a phone that
    chip is the ONLY thing that closes a screen. Worse, `closeScreen` played the
    back blip BEFORE its guards returned, so the game made the sound of closing
    and stayed put. `reward` was in `renderScreen`'s copy and not in
    `closeScreen`'s, and closing a reward screen drops `s.opt.done` — which is
    `settle`: the evolution waiting on that win, and the save.
    One `screenLocked(s)` now answers for the chip and the refusal, and the
    refusal comes before the sound.
    **I photographed this screen an hour earlier, for a different pass, and the
    words "X — back" are legible in that shot.** Looking at a picture is not the
    same as reading it; what made it visible was tracing a different question
    through the same function.

65. **The alarm was reading the middle of a roll it should have read the top of**
    (pass 154). Fourth pass of the shown-against-resolved sweep, and the first
    where the fault was not a wrong number but a wrong *statistic*. Every damage
    figure in the game comes from one roll, uniform [.85, 1]. Three screens each
    picked a single point off that roll and each picked a different one, which
    was fine until something started making a decision out of one.
    - **Capture came back clean, and had to be measured to know it.** The bag
      prints `captureChance` as "6% catch"; `tryCatch` never uses that number, it
      uses `p^(1/4)` four times. Four quarter-powers compose back to `p` on
      paper, and on paper is exactly where this drifts. 162 configurations across
      the dex, 40,000 throws each: worst row **0.7 points** out, which is
      sampling noise at that count. The line is honest. The XP line is honest by
      construction — `gained N EXP` prints the same `gain` it adds. **Two of the
      three answers this pass were "nothing is wrong", and both took the full
      measurement to reach. That is the cost of knowing rather than assuming.**
    - **The one that was wrong.** `readIntent` estimates at `roll: .925` — the
      mean — and stored one number. `intentLethal`, built two passes earlier on
      top of it, then answered *"will this kill me on average"*, a question no
      player has ever asked. Sat at exactly one HP above what the chip said was
      coming — the strongest statement of safety the screen has — the swing
      killed you in **31.2% of 20,000 measured swings**, and the alarm was silent
      in **all fifty** matchups. Not a rounding error: a band, several HP wide at
      every level, where the game said you live and the dice said otherwise.
      The intent now carries both ends; the line prints the middle-to-top range
      and the alarm reads the top. Re-measured: **0.0%**, with a 5.8% residual
      that is exactly the 1/16 crit the chip has always said it does not cover.
    - **And the mirror of it.** `moveVersusFoe` and `moveDamageNeutral` used
      `roll: 1` — the *ceiling* — and the switch screen printed it as `~8 dmg`.
      A tilde promises the middle; this was the one figure on the screen it could
      not have been. Both now return the range the card in hand has always shown,
      through one shared `rangeText`, so every damage figure in the game is said
      the same way.

    **Which point of a distribution a number is, is part of what the number
    means.** A mean is right for "what will this cost me", a ceiling is right for
    "can this kill me", and a range is right for anything a player reads before
    committing — but a single field cannot be more than one of them, and the
    place that discovers this is the feature built on top two passes later.

64. **The same fault, in the function I wrote to fix the last one** (pass 153).
    Asking 152's question of every other number the game shows a player: freeze
    the randomness, compare shown against resolved.

    The card's own range came back CLEAN — 29 of 29 dealt inside it, because
    `moveDamage` has always folded `attackBonus()` in. That is the control, and
    it is what made the other reading legible.

    `moveVersusFoe` did not. It is the figure on the switch screen, added in
    pass 147 to stop that screen printing foe-agnostic numbers — and it applied
    the type matchup while ignoring the banked bonus the swing spends. With an
    edge up it understated a replacement by up to a quarter: 17 of 29 exact,
    p90 1.24. After: 28 of 30 exact, p90 1.00.

    Worth being plain about. This is the identical class of fault as the
    telegraph's, in a function written SIX PASSES LATER, by the same hand, in
    the pass whose entire point was that a screen must show what the resolution
    will do. Knowing the shape of a mistake is not the same as not making it. The
    only thing that caught it was running the same measurement again on a
    different number.

    `attackBonus()` reads only `b.mods` and `G.might` — nothing about which kin
    is holding it — so it belongs to whoever swings, including somebody still on
    the bench. That is why the switch screen was entitled to it.

    A drive fault too, small and worth the line: the new test set `b.mods.edge`
    where `b` in that scope was not the battle, so it silently set a property on
    the wrong object and reported no change. The measurement script had already
    proved the fix; the test was lying about it. Bind `g.B()` explicitly.

    **Ask the question again on the next number. A rule you have just written
    down protects the code you write while you are thinking about it, and
    nothing after that.**

63. **The telegraph named a number the foe was never going to deal** (pass 152).
    The measurement 151 recorded and refused to act on, isolated.

    Eliminated in order. My own drive first, because RAW EK CALLS RETURN A LOG
    and that shape has misled this project repeatedly — the drive called
    `readIntent()` a second time each turn, which is a real fault (it MUTATES
    `b.cornered` and `b.foeEdge`) but changed the measurement not at all: median
    1.11x either way. Then roll and crit, by freezing the roll at the .925 the
    estimate assumes and turning crits off: the bias was UNCHANGED, median 1.11,
    42 swings over against 17 under. Only the tail moved, which is what a crit
    is.

    So it was structural, and it was one line. The swing computes

        dmg = floor((roll.dmg + bonus.flat) * mul)

    where `mul` is the wild damper or the trainer ramp, halved against a
    resistance, times the settling penalty. The telegraph computed
    `damageOf(...).dmg + foeEdge` and applied NONE of it. The chip named the raw
    number and the foe then multiplied it.

    That is why the error looked like noise: the factor differs by
    wild-vs-trainer and by the foe's level, so it ran 0.50 to 1.35 with no
    single value to notice. And it is why it mattered — two passes had built a
    lethal warning and the in-fight bag's incoming figure on that number, so the
    warning stayed silent in cases where the player died.

    `foeSwingMul(b, eff)` now, read by the swing and by the telegraph, which is
    the rule this project keeps relearning: two things about the same fact share
    the function or they drift. With the roll frozen: 48 of 61 exact, ZERO over.
    With real rolls and crits: median 1.00, 21 over against 31 under — balanced
    around the mean roll, which is what an honest estimate looks like.

    **A measurement you cannot explain is worth recording and worth NOT acting
    on. It survived a pass in the ledger, and the pass that picked it up spent
    its whole budget eliminating candidates in order rather than guessing. The
    guess would have been the roll.**

62. **The placeholder was guarding the number two passes had been built on**
    (pass 151). Acting on 150 deliberately: grep the suites for assertions that
    are placeholders rather than claims. Most `!!` checks turned out to be
    honest existence claims — "this species has art", "this warp targets a real
    map". One was not:

        ok(!!b0.intent && !!b0.intent.name, 'the foe telegraphs what it will do')

    "What it will do", checked by asking whether a name exists. And two passes
    had since built on that number — the lethal warning on the chip, and the
    incoming figure in the in-fight bag. Nothing anywhere asked whether the
    telegraph tells the truth.

    What is now pinned: the intent names a specific real move, and the SWING
    USES IT rather than choosing again. `foeChoose` has noise in it, so a second
    call at swing time would disagree — the code reads `b.intent.id` first, and
    both a source net and a drive hold it there. Broken on purpose: with the
    swing re-choosing, 8 of 38 telegraphs stop matching.

    **What is not resolved, and is written here rather than shipped.** Measuring
    the telegraphed number against what the swing actually took off, over 73
    swings: the foe deals MORE than told in 46 of them, median 1.14x, p90 1.38x,
    max 1.95x. The estimate uses `roll: .925` and the real roll is uniform
    [.85, 1.0] — mean exactly .925 — so roll variance alone can only produce
    ratios in [0.92, 1.08]. Something else moves between the telegraph and the
    swing and I did not isolate it. Ruled out: status ticks (measured the swing
    from the log, not the HP delta), and a different move being chosen (the
    swing honours the intent). NOT ruled out: my own drive, which calls
    `endTurn()` directly rather than through `submitLog`, a shape that has
    misled this project before.

    A speculative fix to combat maths on an unisolated cause is worth less than
    nothing, so none was made.

    **Grep your suites for the assertions you wrote when you were not worried.
    The one guarding the number everything later gets built on is exactly the
    one nobody re-read.**

61. **Two copies and a preposition** (pass 150). Sequence as the instrument
    again: walk the first hour in order and print what the game says at each
    beat. The gate sweep the last pass suggested came back thin — there are
    exactly two one-time teaching gates in the game and 149 fixed one of them.
    What the walk turned up instead was in the menu's running answer to "what am
    I doing now":

        Forager Pell is still standing, in Route One.

    You are not in a route. You are OUT ON one, and the game's own voice says so
    elsewhere — *"The tall grass out on the route"*. It read wrong every time the
    aim pointed at Route One, which is two of the nine trainers and the whole
    first half-hour.

    The cause is the same one this project keeps finding: `AIM_ORDER` carried a
    fourth column saying where each trainer stands, a THIRD hand-written copy of
    a fact the map data already owns. And the net for it — written by me, in the
    pass that added the gate column precisely because a copy had drifted — said:

        ok(/./.test(where), `${id} says where it is`)

    "Says something." The weakest assertion in the suite, guarding the one
    column that had nobody checking it, in a section whose own comment is about
    copies drifting.

    Both die together. Each map carries `at` — how the place is said inside a
    sentence, *in Hollowbrook*, *out on Route One*, *down on the Stillmere
    shore*, *up in Crown Hollow* — and the aim asks the map the trainer actually
    stands on. Move a trainer to another map and the line follows him; the
    hand-written column would have gone on naming the old one.

    **The assertion you write for a column you are not worried about is the
    assertion that will be guarding it when it breaks. `/./` is not a check, it
    is a placeholder that passes.**

60. **The lesson was gated on the wrong kind of fight** (pass 149). The first
    sixty seconds, driven beat by beat and COUNTED rather than admired. Title to
    walking out of the study: seventeen presses, of which eight were a lecture
    delivered after the celebration and before the player had taken a step.

    One of those eight is the tell. *"Each turn you get three energy and five
    cards. Spend it however you like, then end the turn and take what comes."* —
    said to somebody holding no cards, looking at no hand. And the game already
    teaches that properly, in a one-time nudge that names the actual keys and
    the actual button:

        Five cards, three energy. Left and right pick one, up plays it…
        When you have spent what you can, end the turn: E, or the button…

    Gated on `opt.wild`. **The first fight in the game is the rival**, a trainer,
    standing on the only road out of town before any grass — so the place that
    teaches the hand properly could not fire until after the fight a new player
    has already had to win. Rowan was covering for a lesson that arrived late.

    The two control lines fire on the first fight of any kind now; the orb line
    stays gated on wild, because it needs something catchable to be about. Each
    lesson at the moment it is usable, and the study is a line shorter.

    Note the shape, which is not the one the last four passes trained me for.
    Nothing here was missing and nothing was wrong. The teaching existed, was
    better than the alternative, and was simply wired to a condition one step
    off the one that mattered — `wild` instead of `first`. A grep for "is this
    taught" answers yes. Only walking the opening in order shows that it is
    taught second.

    **Count the presses. An experience is a sequence, and a sequence has an
    order that reading the source in any other order will not show you.**

59. **Generalising the last pass found two screens already right and one half
    done** (pass 148). The question, asked of every overlay rather than of the
    one I had just fixed: which screens cover something they are asking about?

    The swap screen and the reward offer both came back CLEAN, and that is the
    result. Each already shows the card coming in and how many of each you hold,
    with a comment recording that it was asked deliberately — *"Removing one of
    three Edges and removing your only Snack are different decisions and read
    identically without this."* Two-thirds of a generalisation being already
    handled is what it looks like when earlier passes did their job.

    The bag was half done, and its own comment said what it was for: *"opening
    the bag mid-fight covers the arena and both HP bars… the number goes where
    the decision is."* It brought your HP. It did not bring what was coming at
    it — and the decision the comment names, a Salve that restores 30 against a
    Great Salve that restores 90, is a decision about surviving the next swing.
    One side of a subtraction: the intent chip's exact old fault, one screen
    over, written by the same hand that had just fixed it.

    It reads `intentThrough`/`intentLethal` — the functions extracted last pass —
    so the two screens cannot disagree about the same swing, and says it in the
    chip's own words so one teaches the other. The net that matters proves it:
    a version reading the RAW swing instead of what lands has the bag saying 35
    while the chip says 0, with forty shield up. Same moment, same fight, two
    screens differing by the whole swing.

    **Generalising a fix is worth doing even when most of it comes back clean.
    The clean answers are evidence, and the one that is not clean is usually the
    same mistake you have just learned to see.**

58. **The screen that asks the question covers the answer** (pass 147). Second
    column of battle states. The forced switch — your kin is down, the fight is
    still running, pick somebody to send out — is a good screen: the downed kin
    greyed at 0/63, stats, moves with damage and PP, *"Choose who steps up."*

    And the foe is not on it. The screen covers the arena, so the creature you
    are choosing somebody to face is behind the thing asking you to choose. The
    matchup IS the decision and the screen showed everything except it.

    Worse, quietly: the move list printed damage from `moveDamageNeutral`, which
    computes against a dummy with NO TYPES. Foe-agnostic by design — right in
    the town menu, exactly wrong here. Brookite's Tide moves read 16/22/27 into
    a Verdant/Gloom foe that resists all three; the real numbers are 7/10/12.
    The screen was not merely silent about the matchup, it was printing
    confident numbers that were wrong by half at the moment they mattered most.

    `damageOf` takes any attacker, so the true reading was one call away.
    `moveVersusFoe(mon, id)` returns `{dmg, eff}` or null out of a fight, and
    the cards carry STRONG / RESISTED / NOTHING. Nothing is marked at 1× — a
    mark on everything marks nothing. The prompt names what is out there, with
    its level and its types, for a player who knows the chart and needs only
    that.

    Three things checked and dropped cheaply, which is most of what a sweep is
    for. `m.status` is a single string, so status STACKING does not exist here
    and the tiny-chips worry was about a different game's dials that had leaked
    into my own brief. The failed-catch prose is already four distinct lines
    scaled to shakes — *"Three shakes. You had it."* And `dec_broke` was clean
    the pass before.

    Two drive faults, both mine. A break script whose party held only the kin it
    was asking about cannot tell "reads the kin you are looking at" from "reads
    the kin on the field" — the two are the same object. And adding a class
    conditionally emitted `class="movecard "` with a trailing space, which broke
    a pre-existing net matching the exact string; the sloppiness was in the
    source, so that is where it was fixed.

    **A screen that overlays the thing it is asking about has to bring the thing
    with it. And a number computed for the general case becomes a lie the moment
    the screen is shown for a specific one.**

57. **The line said what it was for, and did half of it** (pass 146). The cast
    sweep's method, pointed at a screen instead of a script: shoot the battle in
    four states — fresh, nearly dead, out of energy, endgame — and read them
    side by side rather than admiring each one.

    The second frame is the finding. Nine HP out of sixty-three, burning, and
    the foe telegraphing `about 30`. The player is dead next turn and the screen
    says so nowhere. It reads in exactly the same colour, in exactly the same
    place, as it does at full health — while `9/63` sits on the other side of
    the arena for the player to hold in their head.

    And the chip was already doing arithmetic. It subtracts guard and shield to
    print what LANDS beside what is swung, and colours that green or amber. Its
    own comment says why it exists:

        the whole reason that line exists is to answer
        "can I take this, or do I need to block?"

    It answers the first half. "How much lands" has no meaning without "how much
    is left", and both numbers were already on screen. So the chip finishes the
    sentence now: at 9 against 30 it reads `· enough to finish you` and the
    FRAME goes red and pulses.

    The frame, not the words, because `#intent b` was already `--hp-bad` — the
    move's name is red every turn of the game. A warning written in more red
    reads as more chip. When a colour is already spent on ordinary state, it
    cannot also be the alarm.

    The comparison is against what LANDS, not what is swung, which is what makes
    blocking answer the warning — put up enough shield and it goes away. A net
    that read the raw number would have passed every other check and quietly
    broken that.

    Two things looked at and deliberately left. The foe's bar carries no number
    while yours does; that asymmetry is the genre's, and this game answers it
    with the telegraph rather than with a number, which is the deck-builder's
    answer and a coherent one. And a kin at 14% looks identical to one at full —
    only the bar and a chip change. That is an art question, not a correctness
    one, and it is the owner's call.

    **When a comment says what a line is for, read the line against the comment.
    This one had been telling anybody who looked that it was half-finished.**

56. **The line was never wrong. He was** (pass 145). A closing sweep of the
    dialogue seam: dump what all seventeen npcs say at four points in the story
    — fresh, mid-route, post-Warden, post-ending — and read the four columns
    side by side rather than each person in turn.

    Everybody came back reactive except Bell, who is deliberately need-driven
    rather than progress-driven. What the LAST column showed instead was a
    continuity fault no amount of reading one character at a time would find:

        Wick (hollowbrook)   I am going north. Try to keep up.
        Wick (emberwood)     You went up without me. I heard.
        Wick (crown_hollow)  I am staying up here a while.

    Three copies of one man, on screen at once, the first of them still promising
    to set off. And the Emberwood Wick `requires: 't_wick1'`, so there had been
    two of him from the instant the first fight was won — the whole game.

    The fix is not a rewrite. His line is the best line he has; he simply never
    did it. `leaves: '<flag>'` generalises what `block` already did to an npc's
    presence — gone once some flag is set — and `block` turns out to be the
    special case where that flag is the npc's own id, plus "stands in a path".
    Town Wick `leaves: 't_wick1'` and goes when he says he will; wood Wick
    `leaves: 'beatVespyr'`, the exact flag that puts the summit Wick on the
    mountain. His parting line moves into `lose`, where it is heard at the
    moment he says it.

    Three drives were wrong before the game was, all the same shape — a filter
    that could not tell two reasons apart:

    - `npcActive` is false for a GATED npc as well as a departed one, so a
      "who leaves when beaten?" filter that sets only `{gotStarter, ownId}`
      collects the two later Wicks, who have not arrived.
    - A hand-written progression that forced `beatVespyr` on from the start put
      the summit Wick on the mountain before the first fight in the game and
      reported a double the drive had invented. Walk `AIM_ORDER` — the game's
      own ordered trainer list, gates included.
    - And `stayed >= 8` went stale twice inside one pass as each Wick learned to
      leave. Derived now: every trainer is either still standing or gone.

    **A character who is in two places is not a dialogue bug, and you will not
    find it by reading dialogue. It only shows up when you lay the whole cast
    out at one moment in the story and look down the column.**

55. **The gate was on a proxy, and the net took three goes to say why** (pass
    144). Elder Rowan is the character the whole game says is paying attention,
    and she had one piece of navigation: *"Crown Hollow, past the Warden."* It
    was gated on `dexCount(2) >= 8` — a PROXY for "far enough along", when the
    game has the actual fact one flag away. Wrong in both directions at once:
    somebody who had beaten the Warden with a thin dex was never told the path
    had opened, and somebody who had already stood on the mountain was still
    being sent past a man who is not on the map any more.

    Then the mirror question, generalised rather than repeated: *once a blocking
    npc steps off the path, is anybody ELSE still sending you past them?* That
    swept up a second instance I had not read — Wick's Emberwood parting line,
    *"The Warden will not let either of us up. Not yet."*, said for the whole
    rest of the game including on the walk back down.

    The net for it took three formulations, and the two failures are the entry:

    1. Reading `talkLines` and `after` off the fields **cannot see Rowan at
       all** — she is a `script` npc and her words never touch either. It found
       Wick, reported the sweep clean, and would have shipped as a net for a
       fault it structurally could not observe. Drive `talkTo` and read
       `G.dialogue`: that covers script, lines, after and the trainer fallback
       in one shape.
    2. "Nobody may NAME a departed blocker" is the wrong claim. *"Hale stepped
       aside for you"* names him, and is the fix rather than the bug.
    3. And the sweep state was too late: with every flag set Rowan gives the
       ENDING speech, so her mid-game branch never ran. A sweep needs to happen
       at the point in the story the fault lives at.

    What is actually wrong is a line that does not MOVE. If somebody mentions
    the blocker while the blocker is in the way, they must say something
    different once he has stepped off it. One check, both instances caught,
    nothing named.

    Also this pass: Bell and Vane, who both talk about money and had never
    looked at yours. Vane names a price ladder — *"Silver is a nibble, Prism is
    a mortgage, everything between is a decision"* — without ever checking which
    rung you are on. Bell's orb count is asked of `ITEMS` by kind and Vane's
    floor comes off `CHESTS`, so neither repeats a list or a price.

    **A gate on a proxy fails in BOTH directions, and only one of them looks
    like a bug. The silent direction — the player who qualified by the real fact
    and was never told — leaves no trace at all.**

54. **Nine voices, one shared sentence** (pass 143). The same method as 142,
    pointed at the dialogue 142 did not touch: dump the nine trainers' intro,
    lose, win and `after` in one go and read them together.

    All nine have a voice. Dorn guards a stretch — *"Nothing gets past me on
    this stretch"* / *"Something got past me."* Ivo lives in the trees and the
    trees are disappointed. Mio got everything she has out of that water. Pell's
    whole idea is that the grass teaches you things. Then six of the nine said
    one shared sentence for the rest of the game:

        Good match. Go on.

    Only the three Wicks had ever been given a parting line, and only because
    the rival is the one the story keeps returning to. The other six lost once
    and stopped being people.

    Six, except the sixth is right. Warden Hale had a comment on him explaining
    that he is the only npc who LEAVES the map when beaten, so a parting line
    could never be read by anybody — and a net already held every blocker to it.
    The codebase knew, and I nearly wrote him one anyway. So the set is five,
    and the invariant that replaces the exception asks `npcActive` rather than
    naming him: a trainer still standing there once beaten must have something
    to say, and one who is gone must not.

    All five read state that already existed except one. Pell reads the dex,
    Ivo and Coll read each other's flags — the two Emberwood rangers, who have
    always both been in the save and were never allowed to mention it — and Mio
    reads your party for anything of the Tide type. Only Dorn needed `G.been`,
    added the pass before for Isa, which is what makes his running joke work:
    beaten, still on his stretch, watching you walk past it to the wood and then
    to the top of the mountain.

    Two drives were wrong before the game was. `npcActive` gates on `requires`
    as well as `block`, so setting one trainer's flag at a time silently skipped
    the two later Wicks — a loop testing six of nine and saying so only in a
    number I had guessed wrong. And a regex meant to strip the five new `after`
    blocks matched three of them, because two end on a different line than I
    assumed; the net fired correctly on the three, which is exactly how a
    half-applied patch disguises itself as a passing check. Delete the property
    off the object instead of pattern-matching the source when you can.

    **When one member of a set is legitimately exempt, find the property that
    makes it exempt and ask for THAT. "All except Hale" is a note about today;
    "all that are still on the map" is the rule.**

53. **Four signposts that kept pointing after you had arrived** (pass 142).
    Seventeen people live in this valley. Nine are trainers and get a second
    line once beaten; Rowan has a script; Sable, Bell and Vane have jobs. That
    leaves exactly four with nothing at all — Old Tam, Bly, Ranger Isa, Sheller
    Ann — and reading their lines together, every one of them turned out to be
    the same kind of thing:

        Tam  the tall grass is thick with kin, something will jump you
        Bly  the Wayhouse patches your kin up for free
        Isa  Emberwood, north of here — mind the roots
        Ann  Lanterneel come in at the shallows. Do not put your hand near the light

    Four signposts. Every one is advice for somebody who has just arrived, and
    every one was still being given at the end of the game — to a player who had
    caught the grass, used the Wayhouse forty times, walked the road north and
    come back down, and had the thing in the shallows in their party.

    And the game already knew, in three cases out of four, without anything
    being added: `dexCount(2)` for Tam, live party HP for Bly, `G.dex.lanterneel`
    for Ann — the dex has always known which of the three people Ann is talking
    to. Only Isa needed new state, and needing it is itself the finding: nothing
    anywhere recorded which maps you had stood in.

    The mechanism was half-built too. `after` had been allowed to be a function
    since pass 113, so a trainer's parting line could stop being true — but
    `lines` could not, for no reason except that trainers were where it was
    first needed. Five separate call sites read `npc.lines` directly and only
    one of them would have honoured a function. One accessor now, so a person
    who wants to notice something can do it wherever they stand, including from
    behind a counter.

    One writing note worth keeping. Tam's boast was a number and the player's
    tally is a number, and at six they collided: *"Six kinds in the book. I
    managed six."* Driving all fourteen readings and READING them is what caught
    it — a test asserting "Tam mentions the count" would have passed. It is
    comparative now, and there is a check that no count makes him say the same
    number twice.

    **Read a game's incidental dialogue together rather than one line at a time.
    Lines written at different moments for different reasons turn out to share a
    job, and the job is usually one the game has since outgrown.**

52. **The exemption list was a to-do list, and I had been adding to it** (pass
    141). Acting on 51 directly: grep your own suite for the names it has to
    special-case. Three came back, and the biggest was mine.

    The cue invariant carried nineteen hand-written names under a comment
    saying that declaring each new one was the point — *"the check made me
    declare the new two rather than quietly widening to let them through"*.
    That was true four times running and it was still the wrong shape. Every
    one of those nineteen came out of a pure function or a table sitting right
    there: `hitCue`, `faintCue`, `battleTrack`, `placeTrack`, `STEP_CUE`. The
    list was not knowledge the suite lacked. It was knowledge it declined to
    ask for.

    Asking is stronger in both directions, and the proof is that the rewrite
    catches two classes the old shape could not detect **at all**: a `hitCue`
    branch returning a name `playCue` never defined, and a tile mapped to a
    footstep that was never written. The old form only checked *literals*
    against the table, so anything reached through a variable was exempt from
    both directions rather than one. Meanwhile a theme nothing points at still
    fails, which is the true claim — a sound nobody can reach.

    One cue could not be asked for: `step_grass` lived as `|| 'step_grass'` at
    the single call site, so neither the table nor the regex could see it. That
    is the same fault one level down — a fact parked where nothing can read it —
    and the fix is the same one: `stepCue(tile)` makes the default part of the
    answer. The invariant now puts **every tile character in every map** through
    the game's own choice.

    The other two: the sky check hand-listed six `GRADE` keys, when `GRADE` is
    keyed by map kind and map id and both already say whether they are indoors —
    and it carried a *second* exemption inside the first (`|| id === 'route'`)
    for the generic route grade, which has no shaft because it is not a place.
    Asking the MAPS instead of the table removes both, and covers `hollowbrook`,
    which is not a `GRADE` key at all and so had never been checked. Proven:
    delete the town's shaft and hollowbrook is now flagged; under the old list
    nothing happened. And the "every species can actually be obtained" net —
    the same one that had carved out the shrine — hand-copied `STARTERS`.
    Proven: drop a kin from `STARTERS` and from the grass and the hand-copy
    still vouches for it.

    **A list of names in a test is a claim you are making on the program's
    behalf. Ask the program instead — it is usually one function call away, and
    the answer covers the cases you did not think to write down.**

51. **Two nets had the bug written into them as an exemption** (pass 140). The
    dex has a `habitat(id)` line whose whole job is to answer "where do I find
    this". For eighteen of nineteen kin it does: *Found in Route One (Lv3–6)*,
    *Evolves from Brookite at level 34*, *A kin Elder Rowan hands out*. For the
    nineteenth — the legendary the entire game is built toward, with its own
    theme, its own opening line, its own reward, and a promise elsewhere that
    it *"will gather on the shrine again — bring more orbs"* — it printed
    **"Not found in the wild. Not anywhere, really."**

    The cause was structural, not a typo. `habitat` answers by reading map
    data, and the shrine encounter was a hardcoded branch in `tryMove` keyed on
    `G.mapId === 'crown_hollow' && p.y <= 8`, with the rate and the cooldown
    written out inline. Nothing else in the program could see it, so nothing
    else could agree with it.

    The part worth the entry is what the suite was doing. TWO existing nets
    already covered this ground and both had carved the gap out by name:

        spawnable.add('vespyr');       // scripted shrine encounter
        ok(id === 'vespyr' || /Rowan/.test(h), ...)

    The first asserts the encounter exists by *being* the assertion. The second
    excuses the one kin that was being lied about from having to explain
    itself. Neither is a mistake at the time it was written — when the fact
    lives nowhere readable, an exemption is the only thing a test CAN do. That
    is the tell. Both exemptions disappeared the moment the encounter became a
    field on the map, and the net that replaced them is the claim the section
    was always trying to make: **no kin may return the fallback.**

    Being data also made the branch drivable for the first time. The rate is
    `.18` and the cooldown 25 steps, so reaching it in a test used to mean
    rolling and hoping; the drive now sets `legend.rate = 1` on the same field
    the game reads, and checks the row bound and the beaten-gate besides.

    **An exemption in a test is a map of where the program keeps a fact
    somewhere nothing can read it. Grep your own suite for the names it has to
    special-case.**

50. **The errand was the one thing that never announced itself** (pass 139).
    Rowan hands you the game with "there are nineteen kin in this valley — I
    want every one of them written down". The menu carries a running tally. The
    ending counts what is still unwritten. Three separate pieces of prose agree
    the dex is the point of playing — and both moments the dex actually MOVES
    were silent. `seeMon` wrote a line and returned nothing; `catchMon` set a 2
    and returned nothing. Meeting a species for the first time was pixel-for-
    pixel the same event as meeting your fiftieth Emberpup, and catching the
    nineteenth read exactly like catching a fourth.

    Nothing was broken. The fact was sitting in `G.dex` the whole time and no
    caller had ever been in a position to ask for it, because the two functions
    that knew threw the answer away. Five sound passes in a row have now been
    found the same way, and this one was not even about sound — the prose is
    just where a game says out loud what it thinks matters, so anywhere the
    words draw a distinction the feedback does not is a gap by definition.

    Two things worth keeping from the shooting. The film mode CANNOT photograph
    the description bar — `--film` grabs the canvas and the bar is a DOM
    overlay, so nine frames came back as nine empty arenas. And a still cannot
    be staged at the element either: this tool calls `renderDialogue()` after
    `go()` to make the panel agree with `G`, so a line written straight at the
    element is wiped a moment later and the shot comes back with no bar at all.
    Both of those looked, at a glance, exactly like "the note is not being
    made". Three cuts of one scene, and the game was right every time.

    **When a function knows something and returns nothing, nobody downstream
    can be blamed for not saying it. And a picture that shows nothing is a
    claim about the instrument until you have proved it is a claim about the
    game.**

49. **Seven passes at one width** (pass 133). Every --touch shot in this
    project was taken at 390 wide. It is the width where the portrait buttons —
    82px placed at percentages of a band half the window across — just about
    do not overlap; below about 390 they do, and an iPhone SE is 375. I had
    been carefully enumerating the BRANCHES of `layoutFor` and had never
    thought of it as having a continuous parameter as well.
    Sweeping 264 / 375 / 390 / 560 / 768 / 1024 found a second thing the single
    width had hidden: the aimed card sits 3.1px under the description bar at
    390 and 10.3px under it at 264. The narrow phone is three times worse and a
    sweep at one size cannot say so in either direction.
    **A layout has a width as well as branches. One sample of a continuous
    parameter is one sample, and the value you happen to have chosen is the one
    the code was tuned against.**

48. **A drive that skipped the frame proved the opposite of the truth** (pass
    131). Reading the click handler — `pressKey('a')` with no release — and
    `pressKey` — `if (!keys.has(k)) fired.add(k)` — says a tap advances a
    dialogue once and never again. So I drove it: press, step, press, step. It
    advanced every time, and I wrote off the fault as a misreading.
    It was the drive that was wrong. `fired.clear()` lives in `frame`, not in
    `step`, so calling `step` directly never clears the pulse: `fired` still
    held 'a' from the first press, `justPressed` stayed true for ever, and
    every tap "worked" for a reason that has nothing to do with the game. Put
    the clear in the loop and all four taps after the first do nothing, exactly
    as the source said. On a phone that is the whole tap-to-advance affordance
    dying after one line, and a keyboard player never sees it because their
    first Z releases 'a' for them.
    **When a drive contradicts a plain reading of the source, suspect the
    drive. Ask which parts of the real loop it left out — the thing you did not
    call is the thing that would have cleared the state you are measuring.**
    Corollary, from the fix: `tapKey` releases BEFORE it presses as well as
    after, so a tap lands even when something else has left the key held. The
    first version only released after, and the test caught that it could not
    recover from a stuck key.

47. **The fallback layout was the least-looked-at code in the project** (pass
    127). `layoutFor` has four branches. Three of them get used by somebody
    obvious — a desktop window, a tablet in landscape, a phone held upright.
    The fourth, `overlay`, is what a landscape phone gets when the gutters come
    out under 96px, and it is the one nobody chooses to test because nobody
    pictures a player in it. The first photograph ever taken of it showed the
    Play button — pressed every single turn — hanging off the bottom of the
    screen, the Menu button sitting on top of the last card of the fan, and the
    word "move" printed across the card you were aiming at. The button bug was
    plain once seen: the branch shrinks the buttons to 64px and gives them no
    vertical offsets of their own, so they keep `bottom:calc(50% - 96px)`,
    written for an 82px pair in a full-height column, which inside a box 34% of
    390px tall evaluates to -30px.
    Two passes earlier the same tool could not produce ANY touch layout, and
    that was invisible for the same reason: nothing failed, there was simply no
    picture. **Enumerate the branches of a layout function and ask which of them
    has a photograph. The one that has never had a player in your imagination is
    the one that has never had a screenshot either.**

46. **A save could reach a state the game could not get out of** (pass 121).
    The worst thing found in this project, and found while reading npc data to
    build something else. Warden Hale stands on (8,2) in the Emberwood — the
    single-tile neck of the only path to Crown Hollow — and npcs are
    impassable, so he is the gate itself. Beating him set `n.gone = true` on
    the MAPS object. MAPS is a module-level const and the save blob has never
    carried npc state, so that field lived exactly as long as the tab did.
    Reload a save taken after beating him and he is back in the neck with
    `t_hale` already set, which means his after-line instead of a rematch, and
    there is no second route: Crown Hollow, the shrine, the legendary and the
    last fight are unreachable for the rest of that save's life. The same
    field failed the other way too — a new run in the same tab found him still
    gone, the pass open from minute one, the Warden never fighting.
    Two suites asserted this behaviour and both passed, because both read
    `hale.gone` — the field, not the question the game asks. Reproduced against
    the pre-fix source with the lib's `patch` hook before claiming it, which is
    the step that turns "I think this was broken" into a fact.
    **State that decides whether a path is open belongs in the save. A field on
    shared module data is not state, it is a cache with the lifetime of a tab —
    and a test that reads the field instead of asking the function will agree
    with it right up to the reload.**

44. **The test agreed with the bug, so the bug shipped green** (pass 118, about
    pass 117). The menu's new aim line read straight down `AIM_ORDER` and named
    Wick's last fight in Crown Hollow as the thing to do next. It is not: that
    npc carries `requires: 'beatVespyr'`, so the menu spent that whole stretch
    of the game sending players up a mountain to fight a man who is not there
    yet, past the shrine that puts him there. Nine assertions covered this and
    every one passed, because the test set `t_wick3` before `beatVespyr` too —
    I wrote the list and the check against the list in the same sitting, out of
    the same wrong picture of the valley, and a check written from the same
    head as the code confirms the head, not the game. What found it was reading
    the npc data to write a *different* feature. The fix is not a reorder: the
    gate column now mirrors each npc's own `requires`, gated trainers are
    skipped rather than pointed at, and a new section compares that column
    against the map data — an invariant tied to the source of truth, which is
    the only kind of check that can disagree with me. It immediately found a
    second drift I had not noticed (`t_wick1` needs `gotStarter`).
    **A test that shares an assumption with the code under test proves the
    assumption is consistent, not that it is true. Tie the check to the data
    the feature copies from, not to the copy.**

42. **A mechanism measured at its shipped rate reads as nothing** (pass 38). Wild
    pairs ship at a quarter of encounters, and paired at that rate the effect on
    fight length is +0.20 ±0.25 — a null result. At full strength it is
    **+1.30 ±0.28**, one of the largest effects ever found here. A rate divides an
    effect, and a per-fight average divides it again. **Test the mechanism at full
    strength, then choose the rate** — they are two questions, and one
    underpowered run answers them wrongly as one.

### Documentation — a note that was wrong for longer than any bug

45. **"A three-cost card can never be afforded here"** (pass 24). It sat in
    `playthrough.mjs` for two passes as a known limitation and was never true.
    Chain discounts a card by one for every card already played that turn, which
    is exactly the mechanic for this: Titanheart and Overkill are played **90%**
    and **84%** of the fights they are payable in. Kinbond, the only three-cost
    without Chain, is still payable in about two fights in five; it goes unplayed
    because heal-to-full is worth only the HP you are missing. A limitation nobody
    re-tests outranks a bug, because a bug eventually contradicts something and a
    note like this just gets cited.

### What the pattern says

- **Nine of forty-two are denominators.** If a number will not move, or moves the
  wrong way, or differs between the modes by more than feels right, check what it
  divides by before touching the game.
- **The same line has been wrong twice** (entries 2 and 3), **a fix has
  introduced the next mistake** twice (12 → 15, and 7 → 8 in the same function
  one pass apart), and **a lesson has recurred after being written down** twice
  (10 → 17 → 18). Writing it down is necessary and is not sufficient. What it
  does buy is entry 8, which is the first mistake here found by reading the
  output against its own documentation rather than by tripping over it.
- **Two premises handed to this tool turned out to be artefacts of it** — the
  cost gap and the party-immunity — and in both cases the right move was to
  report that and change nothing. A pass that changes nothing is a real outcome.

---

## The other instrument: `shot.mjs`

`playthrough.mjs` answers "is this any good to play". `shot.mjs` answers "is this
any good to look at", and the two questions have turned out to have nothing to do
with each other.

```bash
node tools/emberkin/shot.mjs                       # every scene, into /tmp
node tools/emberkin/shot.mjs battle out.png        # one scene, somewhere
node tools/emberkin/shot.mjs --film evolve 9 450   # a scene as it plays, tiled
node tools/emberkin/shot.mjs --size 390x760 title  # at somebody else's window
```

Scenes: `title`, `study`, `town`, `wayhouse`, `shop`, `route`, `shore`,
`hollow`, `battle`, `pair`, `duel`, `evolve`, `gotcha`, `reward`, `deck`,
`catching`, `sight`, `legendary`.

`--stats` reads the frame back and reports the range it actually occupies —
luminance min/max, mean, standard deviation, mean saturation. It exists because
Crown Hollow looked like fog and the two plausible culprits each changed nothing
when dialled back; guessing which of five stacked wash layers flattened a map
does not work, and the numbers said the map was not flat at all. Use it whenever
an impression of a frame is about to become a change to the game. Each one says how big to
shoot it and how to drive the game into that state; a still waits 1200ms for the
entry animation to finish, a film waits 60ms so it starts at the trigger.

Three things this has established, none of which were visible in the source:

- **Film anything with a timeline.** A frozen frame lies about it. Stepping the
  evolution's own timer by hand while holding `G.t` still made its rotating light
  wheel look painted on; it turns, and accelerates as the beat builds, and none
  of that survives a still.
- **`--size` is not a nicety.** The stage picks an integer scale from the window
  and lays itself out around it, so a screen can be right at one size and broken
  at another. The title screen was composed at 900×800 and had never been seen at
  a phone's, where a different scale applies and five lines of text wrap to
  eight.
- **Everything actually fixed on this track came from looking; everything planned
  from reading the code alone turned out to be unnecessary.** Five beats
  inspected on suspicion — the world's movement, the arena's layers, the
  evolution, the catch, a trainer noticing you — were already right. Four faults
  found were each invisible until photographed: the dead margin around small
  maps, unlit windows, no impact frame on fifteen hits in sixteen, and screens
  parked at the top of a box they did not fill. **Suspicion has a bad record here
  and the camera has a good one.**
- **But a photograph is an impression, and an impression is not a measurement.**
  Crown Hollow read as fog in the picture and measured as having more tonal range
  than the map it was being compared against. The camera is right about *where to
  look*; it is not automatically right about *what is wrong*. Shoot to find the
  question, measure before answering it.

### Two beats on one sprite in one frame

Filming a real level-up finally worked — a Lv24 kin one XP short, the foe's HP
set to 1 so a single ended turn wins, the whole thing inside the film window.
The gold `63` leaves the foe and the ring fires on your own kin.

But the foe retaliates in the same instant, so the frame carries the level ring
*and* the hit flash on the same sprite, and the two cannot be told apart in a
photograph. That is not a bug — it is the answer to a question that had not been
asked yet: **beats can land on top of each other, and no beat has ever been
judged with another one running.** A level-up during a win, a faint plus a wipe,
an evolution straight after a gotcha. Every beat in this game has been designed
and photographed alone.

### The legendary scene photographed a corpse for five passes

Every shot of the climax of the game showed the player's kin as a flat brown
shape with almost no colour in it. Read as a lighting fault three separate
times, most memorably as "Crown Hollow drains the kin".

`--stats` gained a box — `--stats 62,86,16,14` measures that rectangle of the
canvas rather than the whole frame — because a whole-frame number cannot answer
a question about one sprite: the creature is a few hundred pixels out of fifty
thousand, and the first attempt at this measured a box that mostly contained
the *stand* the kin was standing on, which is washed in the foe's element.

Tight on the body it was unmistakable: sat 0.312 in an ordinary fight against
0.105 in the legendary, and the highlight ceiling more than halved. Then the
isolation: same fight, same foe, only `b.foe.types` changed.

    Ember    lum  31..254  mean 164  sd 81.2  sat 0.312
    Aether   lum  31..254  mean 164  sd 81.2  sat 0.312
    Tide     lum  31..254  mean 164  sd 81.2  sat 0.312

Byte-identical. The foe's element does not touch the player's kin at all; the
`grade: 0` on battle air does exactly what its comment claims. Printing the
state gave the answer in one line: **`mineHp: 0`.** The scene sent the Lv5
starter against a Lv26 legendary, which moves first and one-shots it, and a
fainted kin is drawn dropped ten pixels and at 30% alpha — which is precisely
what "drained of colour" looks like.

Two things follow. The status line now says `MINE-DOWN` / `FOE-DOWN`, because a
KO'd sprite is far too easy to read as a lighting problem. And the general rule,
which has now cost four investigations: **before explaining what a frame looks
like, check what the game thinks is in it.** Three of the four wrong theories
here were about rendering; the answer was always state.

### A screen opened with the wrong options renders its fallback, which looks finished

The `swap` scene passed `{ mon }` where the screen wanted `{ newCard }`. So
`ownedCard(s.opt.newCard)` came back empty, the "coming in" card and the "Your
deck" heading were both skipped, and the photograph showed a wall of twelve
cards asking **which one to discard with nothing shown to discard it for**. That
reads as a serious design fault. It was entirely my own doing: passed the right
option, the screen puts War Cry at the top, glowing, labelled *coming in ·
LEGENDARY*, and both sides of the trade are visible.

Third time a scene has photographed a fallback path and had it read as finished
work — after the `mistspray` lozenge and the stale dialogue panel. The shape is
always the same and worth stating once: **the paths a program takes when it is
given something wrong are built to look unremarkable.** That is correct for
players and actively hostile to review. Before believing a screen is badly
designed, check that it was handed what it asks for.

### A graceful fallback hides a wrong id

The `gotcha` scene passed **`mistspray`** as a species for four passes.
`mistspray` is a *move*. The screen drew the art system's graceful fallback — a
coloured lozenge with two eyes — and it looked like a finished design every time
it was photographed: it is exactly what a real creature whose art is not in yet
would look like, and the repo's whole art policy is that a missing asset must
never break anything.

That policy is right for players and blind for an instrument. So the harness now
checks, immediately after `go()` and never later, that every species the scene
has put on screen is in the dex — the gotcha's, the evolution's two ends, both
sides of a fight, and the party. **Immediately** matters: a beat with its own
clock has expired by the time the shot is taken, and the first version of this
check ran with the status line and never fired once. It was only caught by
re-introducing the original bug and confirming the guard printed.

The general shape: *a fallback designed to be invisible in play is invisible to
review as well.* Anywhere the game degrades gracefully, the tool has to be told
the difference, because the picture cannot show it.

### Half a turn is not a turn

The `turn` scene plays a card and ends the turn — the two things a player does —
and getting it to record a whole exchange took three goes, none of them about
rendering:

- **`playCard` resolves and animates on its own; `endTurn` returns only the
  foe's answer.** Calling both in one tick threw the player's half away. The
  first film showed a number leaving the player's kin and nothing ever leaving
  the foe, which reads as "my attack has no beat" and is really "my attack was
  never in the log".
- **Most cards are support and have no arena beat, correctly.** The second film
  spent 1.6 seconds on nothing because the card drawn was Focus: it costs
  energy and buffs, and both of those are DOM. Nothing was wrong.
- **Which means a film is structurally blind to half a fight.** Energy, the
  hand, the intent line and the aimed-card description are all panels. The fault
  that was actually there — a card in hand you cannot read — only appeared in a
  still.

### `--stats` cannot see a screen

It reads the canvas. The reward screen, the deck screen and the study therefore
all report the *same* numbers — 10..197, mean 51, sd 28.1 — because the DOM
panels are not on the canvas and what is being measured is the study room behind
all three. Same family as the limitation below, and the same rule: **know which
layer an instrument is looking at before you believe a number from it.** Screens
are judged by eye from a still; only canvas work can be measured.

### `--size` and `--film` do not combine

A still screenshots the page — the canvas plus the DOM panels laid out around
it. A film grabs the 256x208 canvas, which is the same pixels at every window
size and contains none of the panels. So anything drawn on the canvas needs no
size check at all, and anything in a panel can only be checked with a still.
Filming the grass rustle at a phone's aspect returned a picture identical to the
desktop one. That is the correct answer and not an obvious one.

### Two hazards in driving the game from outside

- **`G.dialogue = null` does not close the dialogue.** The box is a DOM overlay
  hidden by `renderDialogue`, which only runs on a dialogue event — so clearing
  the state from outside leaves the panel on screen with its last line still in
  it. Three shots of the shore came back with Elder Rowan talking over the water
  while the state print said no dialogue was up. Scenes now dismiss the opening
  monologue the way a player does, by advancing it, before `go()` runs. (The game
  itself is fine: every path that clears a dialogue in play also hides the panel,
  which is why there are four separate `show(els.dialogue, false)` calls at those
  sites.)
- **The status line prints what is *covering* the scene**, not just the mode and
  map — dialogue, screen, gotcha, evolution, wipe. That line is the only reason
  the hazard above was found rather than worked around.

88. **Eight elements, one place, and a rule the arena states and then stops at
    the horizon** (pass 177). The arena's own comment says what makes a backdrop
    read as somewhere: *"things further away are lighter, lower in contrast and
    closer to the sky colour."* It applies that to three ridges and stops. The
    element — the only thing that distinguishes a fight against a Tide kin from
    a fight against an Ember one — was a `.16` wash over the top 68 pixels and
    nothing under it.

    Rendered on a real canvas, all eight, and read the pixels back:

        SPREAD across the eight (max - min)
        sky    luminance  12.19   hue  332.0
        ridge  luminance   0.12   hue    1.2      <- sky bleed into the box
        field  luminance   0.00   hue    0.0      <- bit-identical, all eight

    Seven eighths of the picture said *the same field* while the top 58 pixels
    said *somewhere cold*. That is a filter over one place, not eight places.

    Fixed with the arena's own rule extended past the horizon: `GROUND_HAZE
    = .12`, a gradient of the element falling from the far edge of the field to
    nothing at the bank — light, strongest where the air between you and the
    ground is thickest. `.08` was too faint to see and `.18` swung the ridges
    141° of hue, which is the ground becoming the element rather than taking it.
    At `.12` the field moves 16.2° of hue and 1.77 of luminance across the eight.

    It goes over the scenery and **under the kin**, which is the line `draw()`
    already holds the map's weather to — a wash over the finished frame lands on
    the kin, and Crown Hollow's violet once turned Cindercub to mud. Verified
    with the same Cindercub in four fights from one page: bit-identical orange.

    **Two instrument failures, both the scene.** Shooting the four fights from
    four fresh pages gave a brown Cindercub in the Tide one — which is exactly
    what the mud comment describes, so it read as the fix failing. It was art
    that had not finished loading. Sampled in a controlled page with only the
    foe changed: `(163, 98.9, 80.5)` against Ember and `(162.8, 99, 80.6)`
    against Tide. Not the game. And the first grid drew both stands empty,
    because it rendered into a fresh canvas before the sprites existed.

    **And a tautology of my own.** The wiring net had `ok(at < arena.length)`
    under a comment claiming it proved the haze sits under the kin. That is true
    of any index `findIndex` can return — no break can make it fail. Replaced
    with the claim it was pretending to make: the haze must come after the last
    transform in the arena, which is the stands, so the ground the kin stand ON
    is lit too. Seven planted faults, all seven bite.

89. **A lifetime written for every speck of air, computed every frame, and
    thrown away on the next line** (pass 178). Took job (d) — measure the eight
    MAPS the way 177 measured the eight arenas — and the world came back clean:
    every map has its own AIR entry, every outdoor map its own WEATHER and WIND,
    frame luminance spread 44.57 and hue spread 296 degrees across the eight.
    Eight places, not one. The finding was three levels down from the question.

    First the dials, neutralised one at a time, as mean absolute pixel change:

        grade 6.46   vig 3.50   tint 4.88   motes 0.033   mc 0.009   drift 0.068

    which reads as *half the weather table is decoration nobody can see*. It is
    not. **A mean over 53,248 pixels is the wrong statistic for 28 specks.**
    Counted where they land instead: 16-35 pixels lit per frame, changing 70-81
    of 255 at those pixels, peaking at 152. Perfectly visible. Nearly "fixed"
    something that was not broken.

    What WAS broken sat four lines into `drawMotes`:

        const life = 6 + fx * 5;
        ...
        void life;

    A per-mote lifetime, six to eleven seconds, computed for every speck on
    every frame and explicitly discarded. Without it the position wrapped modulo
    the frame, so a speck running off one edge reappeared at the other **at
    whatever brightness it was**. Measured over 30s at 60fps on all eight maps,
    counting only arrivals with nothing lit within 2px of them last frame:

        baseline   mean brightness at birth 102.9   100% arrived visible   peak 182
        life spent mean brightness at birth   1.0     0% arrived visible   peak   2

    `life` is spent now: a speck is born from nothing at the seed the lattice
    gave it, drifts, and is gone to nothing, and there is no wrap left to pop
    at. Cost: about a quarter fewer lit pixels per frame, because a speck now
    spends part of its life dim — which is what a fade is.

    **Two instruments wrong before one was right.** The first metric was
    edge-brightness over middle-brightness, which went from 0.955 to 1.225 —
    *worse* — because removing the wrap stopped scrambling positions, so `fy`
    started predicting both a speck's row and its brightness. The second counted
    every dark-to-lit pixel, which is 72% "births" for the trivial reason that a
    drifting 1px speck lights a new pixel every step: **that measures motion,
    not popping.** Only the third — arrivals with nothing lit within 2px last
    frame — measures the thing.

    **And the sentence again.** The wiring net counted drawn rects against
    specks with `a > 0`, at an arbitrary moment. `sin(k*PI)` is exactly zero on
    a set of measure zero, so both sides were always 28 and deleting the guard
    changed nothing — 177's lesson, one pass later, in a new disguise. The
    guard has a real threshold now (below `1/255` the fill changes nothing) and
    the net SEARCHES for a moment when it fires. Five planted faults, all five
    bite, including putting `void life` back.

90. **The sweep, and the one dead value that was costing the player something**
    (pass 179). Took job (c), deferred since 176: fields written in one place and
    read in none. `void life` (178) and `p.bump` (175) were both found by
    accident; this looked on purpose.

    **Four instruments before one worked, and every one of them agreed with me
    in a different way.**
    - v1 counted only `obj.name` reads, so every top-level const and function
      came back dead. 771 names written, 514 read.
    - v2 blanked comments with `[^:]`, which matches a newline — so it ate one
      line per comment and every line number it printed was a lie. Then `blank`
      replaced newlines with spaces: 11,125 lines became 10,136. Then `lineAt`
      counted inside the script body while the script starts partway down the
      HTML. Three separate off-by-a-lot bugs in one number. **I read the wrong
      code for a full round because of it.**
    - v3 blanked whole template literals — and `${r.newName}` is a read, so it
      reported `newName` dead when line 9639 reads it. **One more step and I
      would have deleted live code.**
    - v4 hand-paired the backticks instead: nested templates mis-nested and it
      called `toastT`, `chestOpen` and `spin` dead, all three plainly alive.
    - v5 left templates as code, so an apostrophe in template prose opened a
      fake string and blanked the real code after it.
    - v6 is a one-pass scanner. It still cannot tell a regex literal from a
      division, and that is printed rather than hidden.

    And **the sweep reported four clean runs that were the script crashing** —
    a splice had deleted the line that defines `OFFSET`. Only insisting the
    planted faults BITE caught it. That rule was written down one pass earlier.

    Four faults, kept permanently: a battle field written and never read (must
    be found), an unused const (must be found), a field read only through a
    computed key (must NOT be found), and a field read only inside a template
    (must NOT be found).

    **Five dead values confirmed by hand**, not just by the sweep:

        c.replaced       written, comment says why, read by nothing
        b.foeHeals       b.foeHeals++ and nothing reads it
        b.maxAdd         zeroed, accumulated, read by nothing (b.maxAdds IS read)
        log sM / sF      both kin's status recorded per beat, read by nothing
        G.screen.prev    the mode a screen was opened from, read by nothing

    Four are dead weight. The fifth was a hole in the game, with its own comment
    sitting on it:

        c.replaced = (CARDS[worst.id] || …).name;   // so the offer can say so

    A deck at `DECK_MAX` makes room by throwing out your weakest card. Driven
    with a full deck, a three-pull silver chest removed three cards and named
    none of them — **you lose a card per pull and are never told which.** The
    shelf says it now, in gold, under each card it gave you. Five planted
    faults, all five bite.

91. **The menu remembered where you came from and then threw you in the grass**
    (pass 180). Took job (f): the four dead values 179 confirmed and left. The
    most suggestive was `G.screen.prev` — `openScreen` writes the mode a screen
    was opened FROM and `closeScreen` never reads it, reconstructing the mode
    as `G.battle ? 'battle' : 'world'` instead.

    Driven through the real input ladder rather than read:

        row    prev recorded   mode after back   menu after back
        Kin    menu            world             gone
        Dex    menu            world             gone
        Bag    menu            world             gone
        Box    menu            world             gone
        Deck   menu            world             gone

    Every row of the pause menu dropped you into the grass. **Checking your Bag
    and then your Deck meant opening the menu twice.** And the rule was already
    written for exactly one case: a profile opened with `back: 'party'` returns
    to the party list, because that one call site names its own way back.

    `prev` is spent now, and the menu row with it — `openScreen` takes both
    BEFORE `closeMenu()` throws the menu away, which is the whole subtlety:
    capture them one line later and the row is always 0. Coming back is quiet,
    because closing a screen has already played its own note.

        Kin   -> back -> menu, cursor on Kin   -> back -> world
        Deck  -> back -> menu, cursor on Deck  -> back -> world
        party -> bag -> deck, all in one visit

    Netted with the rows READ OUT of the menu the game builds, so a row added or
    renamed cannot fall outside it. Six planted faults, all six bite — including
    capturing `prev` one line too late, and reopening the menu in cases that
    never had one.

    **Left standing, and named here rather than quietly cut:** `b.foeHeals`,
    `b.maxAdd` and the battle log's `sM`/`sF` are still written and still read
    by nothing. They cost the player nothing, so cutting them is weight, not a
    fix, and this pass measured one fault and fixed that one.

92. **The rule reached one menu because it was keyed on the mode** (pass 181).
    Took job (g): drive the battle's Actions menu the way 180 drove the pause
    menu. 180 gave the pause menu its way back with `s.prev === 'menu'` — which
    reads the MODE. `openBattleActions` never sets a mode, so the rule could not
    reach it, and in a fight:

        row   screen   prev recorded   mode after back   menu after back
        Kin   party    battle          battle            gone
        Bag   bag      battle          battle            gone

    Checking a kin and then an item meant opening Actions twice. **A fix applied
    to one of its cases, one pass after writing the fix.**

    Keyed on the MENU now — `prevMenu` — so both are one sentence: a screen goes
    back to whatever was on screen before it. And the same ordering trap as 180,
    one level up: the battle rows read `closeMenu(); openScreen(…)`, so the
    provenance was thrown away by the CALLER a line before openScreen could read
    it. openScreen closes the menu itself; the redundant call is gone.

    Also: the doc comment said *"Up opens the non-card actions"* for as long as
    this menu has existed. **B** opens it; Up plays the card you are on.

    **FIVE scene errors before one measurement was worth anything**, and the
    biggest is a fact about the harness worth writing down:

    - `pressKey('x')` does nothing — `x` is a raw key, the action is `b` (180).
    - Pressing on frame one measures the entry animation, not the menu.
    - `advanceDialogue()` refuses while `hold > 0`, and hold only decays inside
      `step()` — so calling it in a loop advances nothing, 600 times.
    - **`frame(now)` takes a WALL-CLOCK TIMESTAMP in ms, not a dt.** It computes
      `dt` from `now - frame.last`. Feeding it the same number twice advances
      ZERO time while input still fires: every timer stands still and the
      opening log sat at `hold 0.38` forever. Pass 180's probe had this too —
      its conclusions survive only because they were input-driven, not clocked.
    - `G.bag = { orb: 3 }` — no such item. The shelf threw on `it.kind` and the
      game showed "Something went wrong", **which only turned up because I
      looked at the screenshot.** A bag holding an id ITEMS does not have will
      crash the shelf; that can only come from a corrupted save, so it is
      recorded here and not fixed on the way past.

    Six planted faults, all six bite — including putting `closeMenu()` back in
    front of `openScreen`, and removing 180's pause-menu return.

93. **A check that never ran is not a check that survived** (pass 182). Took job
    (e), the tautology sweep, deferred since 179. Five passes had produced a
    check or an instrument that could not fail, and reading the suite does not
    find them — 177's sat under a comment claiming it proved something. So:
    `tools/emberkin/tautology.mjs`, which runs the render suite against 17
    mutants and asks which checks ever died.

    First it needed the suite to say what PASSED. `EK_TRACE=1` prints every
    check with its section; `EK_GAME` points the loader at a mutant so nothing
    in the working tree is edited.

    **The sweep's first two findings were its own.**

    (1) Aims written from memory. Three mutations named the sections they should
    reach, and `'the opening'` matched a section from an older pass while the
    real failures landed in `'the game opens the way it changes any other
    scene'`. It reported 0/15 and 0/2 — two confident false accusations. Aims
    are checked against the section names the suite actually printed now, and an
    aim naming no section (or two) stops the sweep.

    (2) **The one that matters.** Four mutations made the suite THROW, so every
    check after the throw never ran — and the sweep counted all of them as
    survivors. Deleting the pause menu's return cost 90 checks and read back as
    *"not one of them died"*, which is the loudest thing this tool can say. It
    was 179's crash-that-read-as-clean, in the instrument built to catch exactly
    that.

        pause menu return deleted   1257/1347 ran, 2 failures   <- crash
        after hardening the nets    1347/1347 ran, 22 failures

    The throws were mine: `g.G.menu.i` in the nets written in 180 and 181. A net
    that dies takes every check behind it off the board, so those reads go
    through a guard now and a break produces a failure instead of silence. The
    four menu mutants went from 10/54 and 4/38 to 25/54 and 10/38.

    The sweep proves itself before it accuses anything, and refuses to report if
    it cannot:
    - a **planted sentence** — `ok(at < arr.length)` after a findIndex, 177's
      exact shape — sits in the suite beside a real check on the same subject.
      A working sweep kills the real one and leaves the sentence standing.
      **KEEP IT.** Deleting it does not tidy the suite; it blinds the sweep.
    - a **planted crash** mutant that must be reported as a crash, because
      hardening the suite left the crash detector with no live case, and an
      unexercised guard is not a proven one.
    - every aim must name exactly one real section.

    Five faults planted against the sweep, all five bite. After the fixes every
    aimed section has checks that die; the false flags are gone.

    Also measured, in one grep: **`#movemenu` is dead markup** — a div, two CSS
    rules and an entry in the panel-hiding sweep, opened by nothing. Named here
    rather than cut; it costs the player nothing.

94. **A fight opened through closing bars and ended on a hard cut** (pass 183).
    Back to looking, after six passes of instruments. 176 found the title->world
    cut had nothing over it; this asked the same of every OTHER change of scene,
    by driving each one and sampling the covers across it:

        world -> battle          wipe 0.550    35/36 frames covered
        world -> world (door)    fade 0.300    30/31 frames covered
        battle -> world (a win)  nothing        0/86 frames covered
        evolution -> world       nothing        0/282 frames covered

    **The way out of the game's central activity was the one cut with nothing
    over it** — the arena simply gone, the map simply there. And the same for an
    evolution's 282 frames.

    Both paths already met at the same `saveGame()`, so they take the same way
    back: `backToWorld()`, `BATTLE_OUT = .22`. Shorter than a door because you
    are being put somewhere you already were, and `max` so a cover already
    running is never cut short. Timed from inside the page, the map is fully lit
    229ms after the fight lets go. Measured after: 13/100 and 13/296 frames
    covered, both ending on a clear screen.

    **Four scene errors, and one instrument that changed meaning under its own
    fix.**
    - Posing `b.over = 'win'` does not end a fight: the flourish and the offer
      go unplayed and it never finishes. Driven with the suite's `autoFight`.
    - The reward offer is a LOCKED screen — `closeScreen` refuses it on purpose,
      so it has to be answered with `screenSelect()`, not dismissed. Dismissing
      it parked the fight in mode 'screen' for ever.
    - `warpAt` takes the MAP first; scanning coordinates with the wrong
      signature found no doors on a map that has them.
    - The exit window opened at the fight's START, so the ENTRY wipe's 35
      covered frames were counted as the exit's.
    - And after the fix, the window closed the instant mode became 'world' —
      one frame before the cover it was built to measure — and reported 0
      covered frames for a cover that was up. **The window has to run to the
      point the player can MOVE.**

    Five planted faults, all five bite, and `tools/emberkin/tautology.mjs` now
    aims two mutants at the new section: 4 of its 12 checks die.

95. **Winning a fight and gaining a level were the same sound** (pass 184).
    183's shape again — one property, every case. The property: does this beat
    have a voice of its own? Every beat that takes the screen, driven through
    its real entry point and with `playCue` recording instead of returning:

        a door                     door
        the opening                world
        arriving somewhere         place
        a fight starting           battle, dex
        blows landing              weak / crit / strong
        throwing an orb            throw, wobble, click, catch, gotcha
        an evolution               evo … level
        a chest                    chest
        blacking out               blackout, heal, world
        being spotted              spotted

    All of them speak. The fault was one level finer: **the victory flourish
    played `level`, and so did the card offer behind it.** This file argues the
    rule three times — a menu that opens and one that confirms, the chest that
    borrowed the catch, the crit that arrived as an ordinary hit — and then the
    beat that ends every fight you win borrowed the level-up's climb. Measured
    on one win that levelled, dice pinned, one sitting:

        before   weak, weak, weak, downed, level, level, world, level, select
        after    weak, weak, weak, downed, level, win,   world, offer, select

    The offer was found in the same measurement and fixed at the same time —
    fixing only the flourish is exactly how 180's fix reached one menu and not
    the other. `level` CLIMBS because something grew; `win` RESOLVES (a fifth
    falling onto the root, octave under); `offer` LIFTS and stops, unresolved,
    because an offer is a question. Written, not heard: nothing in this repo
    can play them back, so the net compares NOTES — two names with the same body
    would still be one sound, and the suite now refuses any duplicate in the
    whole table.

    **Five scene errors, and the last one is a new kind.**
    - `openChest()` is not the chest beat; the cue lives in the shelf's select
      handler. `healParty()` is not a loss. Setting `G.alert` by hand is not
      being spotted. All three read as SILENT.
    - `autoFight` never submits a log, and `submitLog` only QUEUES one — the
      cues fire as `playbackStep` walks it, a frame at a time. Every blow in the
      game read as silent until the loop stepped.
    - A trainer looks the way it FACES; standing behind one is not being seen.
    - `String.replace` with a string patches the FIRST occurrence only, and
      `const ac = audio();` appears twice — the spy stubbed a different function
      and recorded nothing.
    - **And a comment created a call site.** The doc comment for `screenCue`
      spelled out a literal `playCue` example, and the suite's harvester reads
      comments as source: a cue named nowhere in the game turned up as fired.

    `screenCue` exists because a cue named inside a ternary is unreachable to a
    suite that harvests literals and ASKS pure functions for the rest — the
    existing cue net caught that immediately, and the fix is the one its own
    comment argues for. Five planted faults, all five bite; two sweep mutants
    aim here and 2 of the section's 14 checks die.

96. **The two beats that change what your kin IS named only the name**
    (pass 185). Job (p), 183's shape again: one property, every case. The
    property — does a beat that changes something NAME its consequence? Driven
    with say/setToast/snap/flourish all recorded, most of them do: the blackout
    says what it cost, the gotcha says where the kin went, the chest says what
    it replaced (179), the flourish says the gems. Two did not:

        a level (8->10)   hp 25->29  atk 13->16  def 12->13  spd 13->15
                          said "grew to level 9!" twice, naming none of it
        an evolution      hp 49->54  atk 27->36  def 22->28  spd 25->37
                          said "Cindercub became Pyrelynx!"

    **Every other line in this game names its number** — "Shield up to 8", "hit
    for +4", "took 43", "gained 385 EXP", "It cost you 12 shards". One helper
    (`gainLine`) for both beats, because fixing one is how 180's fix reached one
    menu and not the other. Only what MOVED is named, so nothing reads "+0".

        Cindercub grew to level 9! +2 HP, +2 ATK, +1 SPD.
        Cindercub became Pyrelynx! +5 HP, +9 ATK, +6 GUARD, +12 SPD.

    **The words are the game's own.** The first draft said "attack, defence,
    speed" — a second vocabulary for stats the profile already calls ATK, GUARD
    and SPD, and long enough that the worst case (an eleven-letter nickname,
    level 99, all four moving) ran 368px into a 367px bar on a phone. The
    game's own words fit at 367.

    **Two instruments were blind before one saw.** Spying on say() and setToast
    reported a level, a catch and a trainer win as saying NOTHING — the game
    speaks mostly through `snap`, the battle log, which was not being watched.
    Then the overflow check used scrollWidth on a box that WRAPS, where
    scrollWidth always equals clientWidth: a control line four times too long
    also reported "fits". In a fight the log is `#dialogue.narrow` — nowrap,
    overflow hidden, ellipsis — and only with that class on does scrollWidth
    mean anything. The control now spills 955px and reads ELLIPSISED, so "fits"
    is worth something.

    **And the sweep learned to tell a crash from a shorter run.** A mutant that
    emptied `gainLine` made a section assert fewer times — it was reading its
    labels out of the game's own output — and 182's crash detector called that a
    crash. A crash is the suite never reaching its summary line; that is what it
    looks for now. The net was fixed too, so its check count no longer depends
    on the thing under test.

    Five planted faults, all five bite. Two sweep mutants aim here.

97. **The one long beat you could not press past** (pass 186). Job (q): every
    beat that takes the screen has to hand it back. Driven through their real
    entry points, all nine do, and none is starved by a cover — that half came
    back clean. What did not was which ones answer a key:

        beat          left alone   pressing A   skips?
        warp            12 fr        12 fr        NO    0.19s, a curtain
        evoAnim        282 fr       282 fr        NO    4.45s
        alert           87 fr        87 fr        NO    a trainer walking up
        rustle          26 fr        26 fr        NO
        mend            73 fr        73 fr        NO
        blackout        67 fr        67 fr        NO
        chestOpen      101 fr        45 fr        yes
        flourish        86 fr         1 fr        yes
        gotcha         126 fr         1 fr        yes

    The ladder's own comment says *"any key skips the tail of it — nobody should
    have to sit through a flourish twice"*. That mercy went to the 1.4s flourish,
    the 1.6s chest and the 2s gotcha, and not to the **4.45s evolution** — three
    times the next-longest beat, and the only one that can fire twice in a row,
    because its own ending looks for another evolution and starts it.

    Fixed the way the CHEST states the rule, in the chest's own words: *the thing
    you paid for should never be the part that gets cut.* A press skips AHEAD to
    the burst, never past it. 282 frames -> 131, and the 131 that remain are
    burst + settle + quiet.

    **A pre-existing net said the opposite, and it was right about something
    else.** `ok(evoPhase() === 'hold' || 'build')` after a mash, under a comment
    saying "the one moment the genre is built around used to run at the speed you
    mashed A". Measured:

        left alone   burst at frame 151, ends at 282 — the change takes 131
        mashing A    burst at frame   0, ends at 131 — the change takes 131

    The moment is untouchable either way; only the run-up can be cut. That net
    was testing a PROXY for its own claim, so the claim is netted now instead —
    a mash must not shorten the change by a frame — and the earlier finding is
    preserved rather than overruled.

    **And two of my own reporting errors.** A planted break "killed nothing"
    because the anchor omitted a trailing comment — the mutation MISSED (184's
    lesson). Then the corrected break showed no failures because the suite
    CRASHED, and I was grepping for failures: `step()` is raw where `frame()`
    has a try/catch, so a throw inside a beat takes the whole suite down. The
    drive is wrapped now and the break produces four failures instead of
    silence.

    **Known limitation, not fixed here:** the sweep scores
    `every beat that can be pressed past still can` as 0 killed, while the same
    mutation run by hand demonstrably kills a check in that section. The
    section-scoring is wrong for that case. Named rather than papered over.

98. **The suite was reading a different file from the one it ran** (pass 187).
    Chased the false zero named in 97. `tools/emberkin/tautology.mjs` scored
    `every beat that can be pressed past still can` as 0 killed, while the same
    mutation by hand plainly killed a check in it.

    The cause is one line. `loadGame` honours `EK_GAME` so the sweep can point
    it at a mutant; the suite's `SRC` — which **135 checks** read — was a
    hardcoded path. So under every mutant the driven checks saw the mutation and
    every source check saw the original. Structurally invisible, since the day
    the sweep was built.

        the same mutant, before   1427 rows parsed, 1 failure
        the same mutant, after    1427 rows parsed, 2 failures
        the whole set, before     105 of 1427 killed by 25 mutations
        the whole set, after      108 of 1427

    **Three checks.** The honest number is small, because most of these mutants
    change behaviour rather than text — and the count is not the point. The
    point is that the sweep's loudest possible output, "not one of them died",
    was wrong for a section that was perfectly nettable.

    So the sweep carries a third self-proof beside the planted sentence and the
    planted crash: a **PLANTED SOURCE** mutant, a text-only change to `id="pad"`
    that the stub DOM never looks up, so nothing driven can feel it. Only a
    source check can. If it stops biting, the two reads have drifted apart
    again, and the sweep refuses to report — as it does if the plant is deleted
    at all. Both guards verified to exit 1.

    Netted in the suite too, by difference and about the FILE rather than any
    one check: `SRC` must be `GAME` byte for byte, and the loaded game must
    agree with the source the suite is asserting against. Reverting the one line
    fails it directly ("SRC is the file GAME names, byte for byte — got 583509,
    want 583551"); pointing it at another game entirely fires ten failures;
    editing the game correctly stays quiet, because both reads move together.

    **A rule this project already had, applied to itself:** read the list out of
    the code. The suite was reading the code out of the wrong file.

99. **A section that asserted difference and never checked it** (pass 188).
    Spent the instrument. 75 of ~88 sections had never had a mutant aimed at
    them; 187 was what made a 0 from the sweep mean anything. Eight new mutants,
    aimed at the largest of those sections:

        wide: two maps lit the same way            0 killed  <-
        wide: a place loses its weather            1
        wide: a theme loses its lead               3
        wide: the hand is a row, not a fan        25
        wide: a card face says nothing            25
        wide: a count never pluralises             4
        wide: the stats block goes blank          29
        wide: a screen lists nothing               0 killed  <-

    Both zeroes checked by hand — anchors present, runs reaching the end — as
    184 and 186 taught. One was mine and one was real.

    **The real one.** `every map is lit as its own place` carries 57 checks, and
    giving the lab hollowbrook's exact weather row killed none of them. The
    section DOES check for collapse — of `GRADE`, the older per-map wash — and
    never of `AIR`, the six-dial table (tint, grade, vig, motes, mc, drift)
    added later, which is what pass 178 measured when it asked whether the
    valley reads as eight places. **The rule was stated and asked of one of its
    two tables.** Netted now, by difference and read out of MAPS: no two maps
    share a row, no row is the fallback wearing a name, every map has one, and
    no row names a map that does not exist. Three breaks bite; changing a single
    channel of one map correctly stays quiet.

    **The one that was mine.** `a screen lists nothing` broke `screenList`, and
    that section tests `shelve` — a different function it never calls. The
    mutation MISSED, which reads exactly like a section that cannot fail. Re-
    aimed at `shelve`, it kills three.

    And an honest limitation of the tool, found on the way: an empty
    `screenList('bag')` IS caught — by the `emberkin` logic suite, which this
    sweep does not run. **The sweep drives one suite of five, so a check living
    in another suite reads as absent.** Named here rather than mistaken for a
    hole next time.

100. **Choosing a card you cannot see, on a screen you cannot leave**
    (pass 189). Took job (n), offered five times and never taken: every beat
    that owns the screen, shot at 390x760 with `pointer:coarse` — which is not
    the same as a narrow window, because the game branches on it.

    Nine beats, and eight of them sat identically inside the stage. One did not:
    the swap screen's card row ran **141px off the bottom**. `#view` 2px and
    `#knob` 26px turned up on every beat AND on a plain world screen with no
    beat at all, so they are the layout, not a finding.

    Then the sharper question, because the panel is `overflow: auto` and CAN be
    scrolled: does moving the cursor bring the selection into view? Walking it
    down, on a phone:

        swap   worst selection 392px outside the box   scrollTop stayed 0
        deck   worst selection 357px outside the box   scrollTop stayed 0
        box    worst selection 456px outside the box   scrollTop stayed 0
        party  worst selection   0px                   (it fits)

    **Nothing ever scrolled it.** Three screens put the thing under your cursor
    hundreds of pixels below the visible box — and `swap` is LOCKED, so you were
    picking a card you could not see on a screen you were not allowed to leave.

    `scrollFor(sel, box)` is a value, because the panel is markup the headless
    suite cannot measure: given where the selection sits and where the window
    is, it says where the window goes, and it moves the LEAST it can so a list
    already in view does not shift under your thumb. Spent once, in
    `renderScreen`, after the markup — the element under the cursor does not
    exist before it — so every screen gets it rather than one kind.

        after:  every worst selection 0px outside the box
                swap 92/248/404   deck 0/57/213/369   box 89/155/350/456
                party never moves at all

    Five planted faults, all five bite; two sweep mutants kill five checks each.
    One break's anchor also caught unrelated code — the claim it was meant to
    prove is covered by another break, and that is said here rather than
    counted as a clean proof.

101. **The cursor counted a row that was not the grid it was in** (pass 190).
    189 shot the beats on a phone; this walked the cursor through every SCREEN
    at 390x760, the list of kinds harvested from the game's own openScreen call
    sites.

        screen    gridCols said   really across   down moved by
        dex             3               3               3
        box             2               2               2
        deck            3               3               3
        shop            2               2               2
        swap            1               3               1     <-

    `gridCols` counts a row off the rendered grid — and it counted the first row
    IN THE DOCUMENT. The swap screen shows the card coming in ABOVE the deck you
    are choosing from, in a `.cardrow` of its own. Measured, its cells sat
    **1 / 3 / 3 / 3 / 2** down the panel, so the first row was that lone card and
    the answer was 1: up and down moved a single card at a time through a grid
    three across, on the one screen `screenLocked` will not let you leave.

    This is the same fault its own comment already records once — "they fell to
    the `< 2` branch and returned 1 — up and down moved by a single cell in a
    grid two and three across" — arriving by a different route. Fixed by
    counting the row the CURSOR is in, which is the grid being navigated by
    definition, with the panel as the fallback when there is no cursor.
    `colsFrom(tops)` is the counting, as a value. After: swap reads 3, moves 3,
    and lands in the same column a row down; every other screen is unchanged.

    **Two instrument over-reports, both mine, both checked before being
    believed.** The bag read "changed column" because `offsetLeft` is relative to
    each shelf's own container — driven, the cursor goes from Salves to Orbs at
    offsetLeft 12 both times, which is the same column of the next shelf. And
    starter / reward / profile read "stayed on the same row" because a single-row
    grid has nowhere to go down to; the clamp is correct.

    A planted break also missed on indentation — four spaces where the file has
    two — and read exactly like a net that could not fail, until the anchor was
    checked. With the right anchor it kills four.

102. **The card in your hand promised what the swing would not pay** (pass 191).
    One property, every case: does every number the player is SHOWN agree with
    the number the game USES? The pairs were harvested out of the code, not out
    of memory, and swept with crits off — a range saying 8-11 is not lying when a
    crit lands 16.

        case                          shown        used         bench screen
        a plain swing                 9-10         9-10         9-10      ok
        with an edge banked (+6)      15-16        15-16        15-16     ok
        with might                    12-13        12-13        12-13     ok
        with a multiplier             13-15        13-15        13-15     ok
        with two hits                 9-10 x2      18-20        9-10      ok
        with the atk stage up         17-20        17-20        17-20     ok
        against something that resists 6-7         6-7          6-7       ok
        just switched in              9-10         5-6          9-10      <-
        switched in, edge banked      15-16        9-9          15-16     <-

    Eight agreed to the hit point. The ninth: `b.settling` is set when you choose
    to switch, and `useMove` multiplies that turn's swing by `SETTLE_MUL` = .6 —
    the price of the switch, and the whole reason a switch is a moment you can be
    caught in. Neither preview knew. Driven through a REAL switch rather than a
    posed flag, a card reading "deal 11-13" landed for **7**, and all 300 swings
    fell outside the range they were shown.

    The rule is the foe's too, and the foe's TELEGRAPH already folds it in —
    `foeSwingMul` ends `return b.foeSettling ? mul * SETTLE_MUL : mul;`, added by
    the pass that found the telegraph understating the foe by a median 1.11x.
    Same rule, same file, one side measured. Fixed with `mineSwingMul(b)` on the
    line beside it, used by both previews; a helper rather than a term inside
    `attackBonus`, because the swing applies the damper itself from a flag it has
    already cleared and folding it in would charge it twice.

        after: shown 5-6 / used 5-6, bench 6-7 / swing 7,
               and the next card back to the full 11-13

    **Also measured, all honest:** the shelf price against the shards taken (7 of
    7), the energy drawn on a card against the energy the play takes (5 of 5),
    the HP bar and the EXP bar against their own fractions (36.59% / 41.90%, to
    the second decimal), the level printed against `mon.lvl`, the dex tally
    against the dex.

    **Two instrument over-reports, both checked before being believed.** "Great
    Salve: says 90, gave 40" was a level-16 Cindercub with a 41 HP maximum — on a
    kin with room it gives exactly 90. And a swing dealing 0 in whichever case
    the roll landed in was `b.mods.hits` being written back as `undefined`,
    making `bonus.hits` NaN so the hit loop ran zero times; then, once that was
    fixed, a shocked kin jolted stiff one swing in four — the suite failed one
    run in three until each trial cleared the status it never meant to measure.

    **Recorded, not fixed:** the profile prints ATK 22 for a kin swinging at 44
    with the stage up. The stat block is the creature's stats, and stages are a
    battle-only thing it has no chip for; changing that is a second change.

    Four planted faults, all four bite (one of them also trips an older
    section's "by exactly what was banked"). Two sweep mutants aimed here; the
    section reports 17 of 37 checks killed, and the sweep's three self-proofs
    held — it refuses to report at all if they do not.

103. **The other empty, which had no words at all** (pass 192).
    One property, every case: does every screen say something when it is empty?
    Eleven kinds, harvested from the game's own `openScreen` call sites, each
    emptied out and read at 390x760 — `renderScreen` returns before it builds any
    html under HEADLESS, so this had to run in a real page.

        screen   emptied by                    rows  what it says
        bag      no items at all                  0  "Empty. Even the lint."
        box      nothing stored                   1  "Nothing stored yet."
        deck     no cards set aside              10  "Everything you own is in the deck."
        dex      nothing seen                    19  "Dex — 0 caught / 0 seen / 19"
        party    one kin                          1  "Kin — 1/6" + five empty slots
        starter  cannot be empty                  3  three cards and a lede
        reward   an offer with no cards           1  the skip card
        profile  cannot be empty                  2  the kin
        shop     nothing you can afford           7  — NOTHING
        chests   no gems for any chest            4  — NOTHING
        swap     an empty deck                    0  "pick the one it replaces" (unreachable)

    Three screens can hold nothing and all three have a line. The FOURTH empty
    had none: a shelf that is full and every row on it refused. Measured — a shop
    with no shards is **7 of 7 dead**, the chest wall with no gems **4 of 4**, a
    bag of orbs while you are stood on a footpath **3 of 3** — and the panel said
    nothing above any of them. To the player that is the same screen as the empty
    one, and every press on it is a refusal.

    Fixed with `shelfNote(kind, list, inFight)` and `rowDead(kind, k, inFight)`
    beside `shelve`, where the shelf rules already live. The row's dimmed frame
    and the line above it now come from the ONE function — the row had been
    computing `!afford || (use && !use.ok)` inline, which is the second reading
    this file keeps finding. And out of a fight the refusals are already written,
    one per row, so when the whole shelf agrees on why it says the row's own
    words rather than inventing a sentence about the same fact:

        bag of orbs only          -> "Save those for the wild."
        bag of salves, nobody hurt-> "Nobody needs that."
        one orb and one salve     -> "Nothing in here is any use out on the path."
        shop, 0 shards            -> "Nothing here you can afford yet. Shards come off beaten trainers."
        chests, 0 gems            -> "Not enough gems for any of them yet. Gems come off every fight you win."
        one takeable row, or any fight -> nothing at all

    Lifting the decision out of `renderScreen` is what makes it testable: the
    suite drives `shelfNote` and `rowDead` for real in every case instead of
    matching the template, because a headless render never reaches the html.

    **Recorded, not fixed:** the swap screen with an empty deck says "pick the
    one it replaces" with nothing to pick, and it is LOCKED. Unreachable —
    `openScreen('swap')` only fires at DECK_MAX and the deck screen enforces
    DECK_MIN — so it is named here rather than papered over.

    Four planted faults, all four bite; two sweep mutants aimed at the new
    section.

104. **Seven screens name their price; the eighth took two things silently** (pass 193).
    One property, every case: does every screen say what it will cost BEFORE you
    commit? The commit points were harvested out of `screenSelect` and the
    battle's own actions — every place something is spent or taken away — then
    each was driven through its real entry point and the state diffed across the
    press.

        commit point           what the row says before      what it cost
        buy from the shop      "200sh"                       shards 5000->4800
        open a gem chest       "60gems"                      gems 9999->9939
        use a salve            "x2" and who would drink it   bag x2->x1, hp 1->31
        store a kin            "Pick on a party kin stores it" party 2->1, box 0->1
        take a reward card     "none in your deck"           deck +1, owned +1
        swap a card out        "pick the one it replaces"    deck 11->10
        take a starter         "Rowan will not be talked round"  irreversible
        switch a kin           "KIN — 2/6" and a roster      <- NOTHING

    Seven price themselves on the row you are about to press. The eighth is the
    one place the game charges you twice and says neither: the switch hands the
    foe a flat opening (`SWITCH_PUNISH` scaled to its level — 4, 19, 31 at levels
    4, 16, 40) AND sets `b.settling`, which is the .6 damper pass 191 put on the
    card in your hand. By the time the card shows the damped number you are
    already committed. The log says "this will hurt" AFTER the press, which is
    not the same as being told.

    Fixed with `switchCost(b)` beside `SWITCH_PUNISH`, returning both halves as a
    value. `doAction` spends it and the party screen reads it, so the price shown
    is the price paid:

        Stepping out costs the turn. Kindlark gets a +19 opening, and whoever
        comes in swings at 60% until they find their feet.

    Drawn only where a switch would actually be charged — a FORCED switch after a
    faint is free (measured: `foeEdge` unchanged, `settling` 0), so the line
    belongs to the choice rather than to the screen, and the forced branch keeps
    its own "Choose who steps up" prompt.

    **The instrument over-report, and it was a big one.** Reading `b.foeEdge`
    before and after `doAction` gave 0, 37 and 60 against a price of 4, 19 and
    31 — because `doAction` plays the foe's whole answer: a foe PLAN can add edge
    of its own (`if (p.edge) b.foeEdge += n`) and its swing SPENDS the lot
    (`if (atkSide === 'foe') b.foeEdge = 0`). A delta measured across the action
    is the whole turn, not the act. Patching the source to record the charge at
    the instant it happens showed shown and charged agreeing exactly at every
    level. The suite keeps that spy — and a check beside it saying so, because
    the spy is anchored to the very line under test, so a mutation there kills
    the spy rather than being caught by it.

    A count of `switchCost(` came back 2, not the 3 that was written first: the
    definition reads `switchCost = (b)`, and neither the export nor the doc
    comment carries a paren. Counted rather than assumed, which is the same rule
    that caught a doc comment inventing a call site in pass 184.

    **And then the line was invisible.** Photographed at 390x760 it was not on
    the screen: both this line and the forced switch's "Choose who steps up"
    prompt were built AFTER the roster and the stat block, which on a phone is
    below the fold — in the DOM, off the screen, `scrollTop` 0. A price nobody
    can see is not a price that was named, and it is the same fault the starter
    screen's own comment records ("a player could make the one irreversible
    choice in the game without knowing a third option existed"). Both lines now
    sit directly under the heading, above the list: measured again, top 111 in a
    panel whose bottom is 359, visible with no scrolling.

    Four planted faults, all four bite; two sweep mutants aimed at the new
    section, which reports 7 of 35 killed.

105. **A sentence in the DOM is not a sentence on the screen** (pass 194).
    Pass 193 shipped a line that rendered below the fold and had to be moved
    before it counted. That is a seam, not an incident, so it was taken
    deliberately: every `<p>`, `h2` and `h3` the screens build, harvested out of
    the code, raised in a real page at 390x760 with pointer:coarse, and measured
    against the panel's visible box at the scroll position the game itself
    leaves the screen in.

    Fifty sentences across sixteen raisings. **Eleven were outside the box**, and
    the worst two were not below the fold at all — they were off the TOP:

        screen   sentence                                    top    panel
        swap     "What comes out?"                            -66   OFF THE TOP
        swap     "A deck holds 12 … pick the one it replaces" -46   OFF THE TOP
        box      "Pick on a boxed kin withdraws it · …"      1003   below the fold
        dex      the habitat line under a 19-cell grid        985   below the fold
        deck     "Everything you own is in the deck."         725   below the fold
        dex      the creature blurb                           948   below the fold
        deck     "Collection — 0 spare"                       691   below the fold
        box      "Box — 9"                                    446   below the fold
        starter  the third kin's dex line                     419   below the fold
        shop     "In a fight"                                 311   below the fold

    `scrollFor` — pass 189's fix, which puts the window where the cursor is —
    was the hand that did it. On `swap` the cursor lives below the question, so
    opening the screen scrolled the question away: measured `scrollTop` 92 with
    the heading at -66. And `swap` is the ONE screen `screenLocked` refuses to
    close. The sentence telling you what you were choosing, gone, on the screen
    you are not allowed to leave. Pass 189 fixed being unable to see the CARDS
    on this screen; nobody then asked where the question had gone.

    Fixed by pinning the question rather than moving it: swap's `h2` and lede go
    in a `.shead` that is `position:sticky`, so the deck scrolls under a block
    that keeps saying what the screen is asking. After: both sentences at 24 and
    44, inside a 310px panel.

    **And the cover immediately created the fault it was covering.** A block
    pinned to the top means the top of the window is no longer the top of what
    you can SEE, so `scrollFor` scrolling a card to `sel.top` parked it behind
    the very sentence the block exists to show — measured on a patched copy,
    **72px of the selected card hidden** on seven of eleven cards. `scrollFor`
    now takes a `pad`, and `renderScreen` measures the pinned block rather than
    assuming one. After: 0px behind, 0px outside, for every card in the list, on
    the phone and on a desktop viewport.

    Two offsets, because the panel's own padding differs: `top:-12px`, and
    `-24px` under `body.touch` where `#screen` pads by 24. At `top:0` the block
    stuck 24px down from the glass and cards scrolled through the gap above it —
    visible in the photograph, not in any number.

    The other nine sentences are below the fold on screens that scroll and
    close, where the cursor walks to them. Recorded, not fixed: one change,
    measured.

    Four planted faults, all four bite; two sweep mutants aimed at the new
    section, which reports 5 of 16 killed.

    **The sweep caught something the suite could not.** Changing `scrollFor`'s
    signature silently orphaned pass 189's two mutants — they still named the
    old one-argument line, which no longer exists, so they were testing nothing.
    The sweep refuses to be quiet about that ("its anchor is not in the file")
    and both were repointed at the current line. A mutant is a claim about the
    code, and it rots the moment the code moves under it; nothing in the suites
    would ever have gone red.

106. **The scroll affordance nobody had ever sampled a pixel of** (pass 195).
    The panel has said "there is more below" since the deck first overflowed —
    two `local` covers that scroll WITH the content and two marks pinned to the
    frame, the covers listed OVER the marks, so a mark shows at an edge with
    content beyond it and is hidden at an edge you have reached. Sound in
    structure, written down in its own comment, and never once measured.

    Measured at 390x760 with the content and the scroll position held still and
    the ONLY difference being whether the pinned layers paint (luminance out of
    255, the mark against the same pixel without it):

        screen    content/panel   more below   at the end       after
        box          1158/310         2.43        1.00      18.83 / 3.39
        dex          1016/310         3.21        1.00      23.42 / 3.39
        deck          761/310         0.98        1.02       7.03 / 4.20
        swap          902/310         0.92        0.46       6.63 / 1.90
        starter       501/310         3.14        0.54      22.52 / 1.82
        reward/profile/chests (fit)   0.51-1.02             3.55-4.20

    Every scrolling screen sat within ~2 luminance of a screen that CANNOT
    scroll, and on `deck` the mark was fainter when there was more below than
    when there was not. The cause is not the mechanism, it is the colour: the
    marks were black, and `#screen` runs to `#0d0913` at the bottom. Darkening a
    colour of luminance 10 by 60% removes six luminance. There was nothing left
    to take.

    The marks are now the panel's own edge colour, `#4a3560` — lighter, which is
    the only direction available on a near-black surface. Same layers, same
    order, same sizes, same attachments; only the ink changed. Paired
    before/after through one instrument, above.

    The suite cannot render CSS, so it reads the declaration out of the file and
    checks the property the pixels were about: five layers, covers listed before
    marks, each cover deeper than the mark it hides, each mark fading to
    transparent, and — the net that would have failed for this game's whole life
    — each mark LIGHTER than the panel end it is drawn on, with more than 30
    luminance of headroom.

    **Recorded, not fixed.** The top edge still carries no information: ~1.8
    luminance whether scrolled or not, on screens that scroll and screens that
    do not, even with the lighter ink. And the bottom mark is a BACKGROUND, so
    it only shows where the content above it is transparent — which is why `box`
    and `dex` and `starter` move by 15-21 and the dense card grids of `deck` and
    `swap` move by 3-5. Making it show through content means drawing it in the
    foreground, which is a different change.

    **Three instrument faults in one pass, all mine.** (1) The first version
    injected its own hard-coded background string and therefore measured its own
    constant — editing the game's CSS changed not one number. Read the subject,
    not a copy. (2) The metric was a signed DROP, because the mark had always
    been a shadow; a mark that LIGHTENS read as zero and the script cheerfully
    reported that the fix did nothing. (3) The suite anchored on `#screen{`,
    which matches `body.touch #screen{ padding-top:24px; }` hundreds of lines
    earlier, and duly parsed 26 "layers" out of a rule belonging to something
    else. Each one produced a confident, wrong table before it was caught.

    Four planted faults, all four bite; two sweep mutants aimed at the new
    section. Every mutant anchor in the sweep re-audited against the file after
    the CSS moved — none orphaned.

107. **A rule written for the labels was repainting the chips** (pass 196).
    First pass with pixels at the whole panel rather than its edges: 319 text
    nodes across fourteen raisings at 390x760, each measured against the ground
    it ACTUALLY landed on — ink from the computed style, ground from the pixels
    of the same frame with every glyph turned transparent, then WCAG.

    Most of the quiet things are quiet on purpose and are recorded, not fixed:

        1.13  dex      an unseen slot's "?"          a ghost, which is the point
        2.23  reward   the skip card's glyph
        2.40  shop     a row you cannot afford       the dimming IS the refusal (192)
        2.58  dex      the blank type chip "-"
        2.62  dex      the slot numbers
        3.32  shop     a price you cannot meet
        3.98  party    the "/45" under the HP that moves

    One was not a choice. `.pickcard .matchup span` was written for the two
    LABELS — "strong into", "soft against" — but `typeChips` emits spans too, so
    the rule repainted the CHIPS and beat `.tp`'s own ink on specificity. On the
    one irreversible choice in the game, the block naming what your starter is
    strong and soft against read:

        Verdant 1.08:1   Tide 1.17:1   Ember 1.28:1   Spark 1.47:1   Stone 1.84:1

    …dim grey on saturated type colour. And the size compounded the same way:
    `.matchup` is .58em and `.tp` is another .58em inside it, so the chips came
    out at **3.7px** against 6.38px labels — a third of the card's own text, in
    ink that is not there. `:not(.tp)` on the label rule and a `font-size:1em`
    reset on the chip: every one now at its own ink, 6.38px, the size of the
    words introducing it. Below-3:1 across the whole sweep fell from 25 to 18.

    **The net then found a second case on its own.** Written expecting the
    palette to pass, it computes the chip's ink against every one of the eight
    type colours and reported `Gloom #7a5fc4` at **3.89:1** — the only ground
    that fails, and one no screen in the sweep happened to raise. Moving it is a
    palette decision reaching every Gloom-tinted card and sprite accent, so the
    bar stays at 4.5 for the other seven and Gloom is PINNED at what it measures
    today: the section fails if Gloom gets worse, and also fails if it ever
    passes, so the exception cannot outlive the problem.

    **The instrument lied twice before it was believed.** (1) Chromium resolves
    `color-mix()` to `color(srgb r g b)` with values in 0..1, not 0..255;
    reading those as 8-bit turned every card pip into near-black and invented a
    1.08 contrast on twelve rows that were perfectly fine. (2) `opacity` is not
    in the colour at all — it applies to the element and every ancestor — so the
    ink a player sees is the product of the lot, and the first run had none of
    it. Both were caught by interrogating one element in the page and finding
    the number disagreed with the CSS.

    Four planted faults, all four bite; two sweep mutants aimed at the new
    section; every mutant anchor re-audited — none orphaned.

108. **The mark was keyed on the value, not the band** (pass 197).
    The type chart is the spine of this game and its colours had just been
    measured; its BEHAVIOUR had only ever been checked through whatever fights
    happened to be driven. So every voice that speaks about `CHART` was driven
    over the whole domain instead — all 64 ordered pairs, and every unordered
    pair of types as well, because a defender can carry two and that is where
    the chart's entries stop being values and become products.

        effect()      agrees with the chart on all 64 pairs
        resistedBy    agrees on all 361 creature pairings
        effWord       bands, and has always banded
        the card mark KEYED ON THE STRING: '2', '0.5', '0'

    Those three keys are every value a SINGLE-typed defender can produce. The
    reachable set is **0.25, 0.5, 1, 2, 4** — so two of the five had no key and
    the card fell silent at exactly the two matchups worth telegraphing, a
    quadruple hit and a doubly-resisted one. **19 of 288 attacker/defender
    combinations**, against five of the nineteen creatures in the dex:

        Magmane     Ember/Stone     silent to Ember and Tide
        Kindlark    Ember/Spark     silent to Stone
        Lanterneel  Tide/Gloom      silent to Spark
        Bramblor    Verdant/Gloom   silent to Verdant
        Frillamb    Verdant/Tide    silent to Tide and Stone

    `effMark(e)` is a band now, in the words already here — `effWord`, the line
    the log prints on the same swing, has always said "brutally effective" for 2
    and 4 alike, and the card now agrees with it instead of saying nothing.
    Neutral stays unmarked. After: 0 of 288 silent.

    **Recorded, not fixed.** The starter screen harvests `CHART[d.types[0]]` and
    its mirror, so on a dual-typed kin it names what beats the FIRST type and
    drops the second — Kindlark (Ember/Spark) would read "soft against Tide,
    Stone" where the truth is Stone alone. Unreachable today: all three of
    `STARTERS` are single-typed. Pinned rather than fixed, from both sides —
    the suite asserts each starter is single-typed AND that the harvest still
    disagrees on a dual kin, so it fails the day a dual-typed starter is added,
    which is the day it would start lying.

    **A planted fault did not bite, and that was the finding inside the
    finding.** Painting NOTHING-at-all as a good hit sailed through, because the
    colour loop walks the REACHABLE multipliers and 0 is not one of them —
    nothing in `CHART` is an immunity, so the branch is held in reserve. An
    unreachable branch still needs its net; it has one now, and the fault bites.

    Four planted faults, all four bite; every mutant anchor re-audited — none
    orphaned. Render suite 1644 -> 1747 checks.

    **And the sweep's own number was worth reading rather than quoting.** With
    two mutants aimed at the section it reported **2 of 103 killed** — which
    looks like a weak section and is really a gap in the mutant set: 64 of those
    103 are the pair enumeration, and nothing in the set touched `effect`. A
    third mutant now collapses it to reading `defTypes[0]` alone; under it the
    reachable set drops to 0.5, 1, 2 and every dual-typed creature loses its
    extreme matchup, so the enumeration is load-bearing rather than decorative.
