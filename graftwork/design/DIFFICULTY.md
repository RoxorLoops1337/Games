# DIFFICULTY (owner rule: "you shouldn't be able to win with random cards")

Dying and starting over is part of the game. Only good choices and some luck win. Tuning is data and engine numbers only (no UI).

## Skill tiers (tools/graftwork_tiers.mjs)
| tier | policy |
|---|---|
| RANDOM | random legal card, random target, may end the turn at any step, random graft / reward / shop / forge / event / map choices, random skips |
| SLOPPY | plays cards left to right at the first enemy, never reads an intent, no Block planning, first graft offered (skips when it does not fit), buys any relic it can afford, rests when hurt |
| CAREFUL | `POLICIES.careful` of graftwork_sim.mjs plus a 9 percent slip rate per play (a random playable card, one slip in four ends the turn). `careful_pure` is the unmodified sim policy |
| STRONG | `POLICIES.strong` of graftwork_strong.mjs (Thread aware, card picks, Temper) |

Why the slip: the sim careful and the strong bot share one card evaluator, and an ablation (strong with careful's fight, graft logic, shop picks, no Temper or Overload, Thread payouts +1 or +2 stitches) moved the win rate by under 4 points each. In this sim, build choices barely matter; tactics do. So the careful tier models a human who reads intents but misplays now and then. Unmodified, `careful_pure` sits 5 to 10 points under strong.

## Commands
```
node tools/graftwork_tiers.mjs                         # all four tiers at A0 (random 1000, sloppy 1000, careful 300 per hero, strong 300 per hero)
node tools/graftwork_tiers.mjs sloppy 3000 0           # tier, runs (per hero for careful and strong), ascension
node tools/graftwork_tiers.mjs sloppy 1000 0 assist    # all four Assist options on
node tools/graftwork_tiers.mjs strong 300 0 - marrow   # one hero
GW_TAG=b node tools/graftwork_tiers.mjs strong 100 0   # another seed batch;  GW_SLIP=0.09 sets the careful slip rate
node tests/graftwork_difficulty.test.mjs               # the gate (about 12 s)
```

## Targets (A0, no Assist) and measured numbers
Measured on both content pools (`GW_UNLOCK=all` and `GW_UNLOCK=start`, the pool a new player has, see UNLOCKS.md). Random 1000, sloppy 1000, careful and strong 300 per hero.
| tier | target | before (all pool) | after, all pool | after, start pool |
|---|---|---|---|---|
| RANDOM | 0 wins in 1000, median death Act 1 | 0.0 percent | 0.0 percent, median floor 5 | 0.0 percent, median floor 5 |
| SLOPPY | under 1 percent | 1.4 to 1.9 percent | 0.3 percent | 0.6 percent |
| CAREFUL | 5 to 15 percent | 30.6 percent (pure) | 5.4 percent (pure 11.4) | 14.1 percent (pure 25.7) |
| STRONG | 25 to 40 percent | 36.1 percent | 23.7 percent | 43.4 percent |

Act 1 stays approachable: first-fight death 0.0 percent for STRONG and CAREFUL on both pools, first-two-fights at most 0.1 percent. Act 1 numbers were not touched.

Known gap: the start pool is about 20 points easier for the strong bot than the full pool. Part of that is a bot artifact (a bigger pool dilutes a bot that takes every relic and best-scored graft without avoiding trap items). Closing it means teaching the bot trap avoidance (graftwork_schools.mjs relics gives per-relic deltas), not hardening content further, otherwise the full pool falls under 20 percent.

## What was changed
Only Act 2 and Act 3 enemy HP: data/enemies_2.js x1.134 in total (bosses too, The Broker 102), data/enemies_3.js x1.232 in total (The Impresario 128, The Grafter 220). Act 3 is where lucky or sloppy runs used to finish. Hero HP, Act 1 and the starter decks are unchanged.

## Assist
Sloppy with Sturdy + Kind Strain + Mercy: about 15 percent wins (in the 5 to 20 target). With all four options (the panel default, `ASSIST_DEFAULT`): about 49 percent, too generous; Gentle foes (x0.8 damage) and Mercy are the big pieces (Gentle alone 9.7, Mercy alone 5.8, kind 0.8, sturdy 2.8). Not changed because tests/graftwork_assist.test.mjs pins x1.3 HP, x0.8 damage and the half-HP revive. Even Sturdy 1.15 and Gentle 0.9 still gave about 23 percent, so lowering means a design call on Gentle plus Mercy together. Careful and strong with all options win 92 and 99 percent, so Assist is a different game; it never counts for ascension or achievements.

## Luck
STRONG across seed batches at the earlier Act 3 numbers (GW_TAG a, b, c, 300 per hero): 29, 34, 33 percent, a 5 point spread. Inside the 20 to 45 band, so luck matters.

## Re-measure
Run all four tiers after any data change to enemies, relics, grafts or hero numbers. Keep RANDOM < SLOPPY < CAREFUL < STRONG with the gaps above.
