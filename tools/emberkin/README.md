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
