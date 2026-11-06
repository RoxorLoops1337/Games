# Content unlocks

Owner requirement: new things unlock slowly after every run, everything is open after roughly 30 to 50 runs.
Model and constants: `data/unlocks.js` (top of file). Logic: `engine/unlock.js`. Simulator: `tools/graftwork_unlocks.mjs`. Tests: `tests/graftwork_unlock.test.mjs`.

## Inventory (150 cards, 128 grafts, 92 relics, 27 potions, 55 events are gateable)
| kind | total | start (open) | locked | start share |
|---|---|---|---|---|
| cards (non starter, non junk) | 150 | 58 | 92 | 39% |
| grafts | 128 | 46 | 82 | 36% |
| relics (kits not counted) | 92 | 34 | 58 | 37% |
| potions | 27 | 13 | 14 | 48% |
| events | 55 | 27 | 28 | 49% |
| total | 452 | 178 | 274 | 39% |

Never gated: starter decks, hero kit relics, junk, all enemies, elites and bosses (Acts 1 to 3), Overload, Temper, the Thread rules, ascension rules.
Heroes: Marrow at start, Wick and Odile by run count (below). Ascensions still unlock with wins. Cosmetics and Credit are separate.

### Starting pool (what a new player has)
- Cards: per hero 16 (12 commons, 4 uncommons: attacks, blocks, heals, one Thread card each) and 10 neutral. Marrow: Blood (self cost, heal), Rust (block, attrition), Thread chains. Wick: Ember (Burn), Static (chain damage), defence (apron, wax). Odile: Gilded/Hoard (gold), Echo (replays), plain attacks. No rare cards.
- Grafts: all 7 schools have tier 1 (safe) and tier 2 (greedy) grafts, 7 safe uncommons, 6 weird so each offer is still safe / greedy / weird. No safe rares, no greedy rares, no weird rares.
- Relics: 15 commons, 11 uncommons, 2 rares, 4 of the 8 boss relics, 2 of 3 shop relics (the Overload gambling boss relics wait).
- Potions: 9 commons plus Vapors and Ether, Strain Relief, Tourniquet. Events: 8 neutral, 7 in Act 1, 6 each in Acts 2 and 3.

## Unlock Points (UP)
Each finished run pays UP, clamped to `[FLOOR 2, RUN_CAP 32]`:
`2 + 0.04 per floor + 0.8 per elite (max 6) + 4.5 per boss + Act reached (0 / 2 / 6) + win 14 (+0.8 per ascension) + 0.5 per first lifetime kill of an enemy type (max 8) + 2.5 per new achievement (max 3)`.
Assist runs pay at most half the cap. An abandoned run under 3 floors pays 0. Practice pays nothing. Daily runs pay normally.
Total cost of everything: 901 UP, so the hard minimum is 29 runs (901 / 32), even for a flawless stream (test: `a perfect-run stream`).

## Queue and cost curve
Locked items are split into streams (cards per hero, neutral cards, grafts, relics, potions, events), each sorted by power (rarity, then tier, cost, Act), chunked into drops of 3 (potions and events 2) and merged by relative position, so rares of every kind arrive last (101 steps). Item cost = base by kind x rarity multiplier x a curve from 0.55 (first) to 1.65 (last), normalised so the sum is `TARGET_TOTAL`. A step opens as soon as the unspent UP covers it; leftovers carry over.
Hero cards wait until the hero is unlocked. Affinity: among the first 6 open steps, the step of the hero you have played most (at least 2 runs) is taken first, so after playing Wick, Wick cards come first. Total cost is unchanged.
Heroes (`HERO_GATES`): Wick after 5 finished runs once Act 2 has been reached (7 runs at the latest), Odile after 11 finished runs including a win (15 at the latest). Median in the simulation: run 5 and run 11 (run 15 for players who never win).

## Pacing (tools/graftwork_unlocks.mjs 200 players, runs drawn from real bot runs through the real recordRunEnd)
The bots play better than real beginners, so skill tiers are emulated by handicap: strong = strong bot at A0, careful = careful bot at A5, sloppy = never-graft bot at A6.

| tier | min | p10 | median | p90 | max | avg UP/run |
|---|---|---|---|---|---|---|
| strong | 32 | 35 | 37 | 39 | 42 | 24.8 |
| careful | 43 | 47 | 50 | 54 | 58 | 18.2 |
| sloppy | 60 | 64 | 70 | 76 | 85 | 13.1 |

Unlocked percent after run: 
```
tier        1   3   5  10  15  20  25  30  35  40  50  60  70
strong      9  20  29  46  62  72  82  90  97 100 100 100 100
careful     9  18  26  40  54  63  70  77  83  89  99 100 100
sloppy      6  14  19  30  42  50  57  64  69  74  84  93  99
```
Early runs are generous on purpose (first kills and achievements pay a lot at the start, cheap steps first); the last 10 percent is the slow part.

## Engine rules
- `meta.unlocked` gains `ids` (set of unlock ids), `points`, `lifetime`, `played`, `killed`, `maxAct`, `v`. Unlock id = `kind:itemId` (`card:m_lancet`), derived from item ids, never renamed.
- `RUN.newRun({ unlocked })`: omitted or `'all'` = everything open (tools, old tests, old saved runs), `'start'` = starting pool, an id array or a meta object = that set. The set is snapshotted in `run.unlockedAtStart`. Daily runs force `'start'`. `main.js` passes the player's meta (Practice too, Assist uses the player set).
- Gated rolls: graft offers, shop cards, grafts, relics and potions, relic rewards (elite and boss), potion drops, events, `R.addRelic(null)`, `R.addPotion(null)`, `R.addGraftRandom`. If a filter empties a pool the roll falls back to the full pool (no soft lock). A saved run may hold locked cards; nothing re-validates a deck.
- Old saves (no `unlocked.v`): every codex entry already seen stays open, 5 UP per finished run (max 160) are granted once and spent through the queue, the hero counts come from `meta.history`. Idempotent.

## API (engine/unlock.js, re-exported by engine/meta.js)
- `unlockState(meta)` returns `{ points, lifetime, nextCost, queue: [ { stepId, kind, hero, cost, items: [ { unlockId, kind, itemId, name, rarity, hero, hint, cost } ] } x5 ], unlockedCount, total, startCount, percent, done, heroes: [ { id, name, unlocked, hint } ], upCap, inventory }`.
- `awardRun(meta, run, result)` is called by `recordRunEnd`; the result is `res.unlock = { up, parts, capped, newKills, newAchievements, points, nextCost, unlockedNow: [ item view ], unlockedCount, total, percent, done }`. Hero unlocks still arrive in `res.newUnlocks`.
- `isUnlocked(meta, unlockId)`, `isItemUnlocked(meta, kind, itemId)` (ungated items are open), `unlockIdOf(itemId)`, `lockedHint(itemId)`, `heroHint(meta, id)`, `unlockedIds(meta)`, `withUnlocks(meta, opts)`, `computeUP(digest, newKills, newAch)`, `stepCost`, `nextStep`.
- Codex: locked = `!isItemUnlocked(...)` (show silhouette plus `lockedHint`), unseen = unlocked but not in `meta.seen`.

## Balance check (strong bot, A0, 150 runs per hero)
`GW_UNLOCK=all|start node tools/graftwork_strong.mjs 150 0` (the sim reads the env var).
| pool | marrow | wick | odile |
|---|---|---|---|
| everything unlocked | 38% | 45% | 53% |
| starting pool only | 70% | 75% | 76% |

The starting pool is not crippled: the bot wins MORE with it (about +29 points), so the target of "within 6 points" is met in the safe direction only. Locking one kind at a time moves the bot by: weird grafts +12, boss and shop relics +13, all non weird grafts +9, all relics +17, potions +5, cards 0. The bot takes every elite relic and the best-looking graft without judging traps, so a bigger pool dilutes it; humans filter better. Unlocks therefore add depth and options, not raw power. If the owner wants the gap closer, move more weird grafts and Overload relics into the start list.
`tools/graftwork_strong.mjs` now picks the best boss relic from a measured ranking (the plain sim still takes the first), which lifted the all-unlocked numbers from about 31% to about 45%.
