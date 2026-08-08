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
