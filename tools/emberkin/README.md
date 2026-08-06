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
this game have produced roughly six changes to the game and twenty fixes to
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

`--starter <name>` runs every run on one starter. Rotating is right for a
headline number, but sixty rotated runs is twenty per starter, and twenty is not
a sample — see mistake 20.

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
| `played/drawn` | of the fights this card reached your hand, the share where it was worth playing at least once | once per card per fight, both halves | bounded by 100%; see mistakes 7-9, 18 and the 3-cost limitation |

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

### Sampling — a claim the sample could not carry

19. **The wipe rate was reported at 14 runs for three passes** (pass 15). It
    ranged .155 to .364 on *identical* builds. Every wipe claim in passes 12-14
    was noise wearing a decimal point. Intervals were added; runs went to 30, then
    60.
20. **Rotating starters means sixty runs is twenty per starter** (pass 21).
    Cindercub's lost-or-ran read .237, .358 and .438 across three samples of
    builds that never touched Ember. A per-starter claim needs `--starter`.

### What the pattern says

- **Nine of twenty are denominators.** If a number will not move, or moves the
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
