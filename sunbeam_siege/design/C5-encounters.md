# C5 Encounters: the difficulty curve

Files: `src/data/encounters.js` (`SB.data.encounters`, `SB.data.encounterRules`), `tests/encounter-test.js` (`node tests/encounter-test.js`, add `--fix` to rewrite stored threat numbers). 98 encounters: 3 acts x (14 prowl, 10 night, 4 elite) = 84, 7 bosses, 7 event fights. `tutorial` is `{}`.

## Budgets and bands (A07 section 10)
Threat = sum of enemy `threat` over every wave at hpScale 1. Dynamic summons (Dog Walker leash, Court Rats, Coils) and Night Visitors are not counted; the enemy agents priced them into the summoner.

| Act | Prowl | Night | Elite | Boss | Band (prowl, night, elite) | Boss band |
|---|---|---|---|---|---|---|
| 1 | 12 (soft open 8) | 20 | 28 | 45 | 0.90 to 1.12 of budget | 1.00 to 1.25 |
| 2 | 20 | 32 | 42 | 70 | same | same |
| 3 | 30 | 46 | 60 | 100 | same | same |

Inside the band each encounter carries a tier. Prowl tiers: soft (Act 1 row 1 only, budget 8), light (0.90 to 1.00), standard (0.97 to 1.08), hard (1.05 to 1.12). Night slots: A (0.90 to 1.04), B (0.98 to 1.12), any (0.98 to 1.04). The test enforces both the band and the tier window.

Actual means from the test: prowl 0.93 / 1.01 / 1.01 of budget, night 1.03 / 1.01 / 1.00, elite 1.03 / 1.00 / 0.99, boss 1.13 / 1.05 / 1.08 (bosses sit above budget because adds are in the wave script).

## The curve by night
`hpScale = 1 + 0.05 * (night - 1)`. Rows 1 to 3 of an act are the act's Night A number, rows 4 to 6 its Night B, rows 7 to 8 the boss night (`nodeNight(act,row)`). Effective threat is threat x hpScale (mean of the pool that can appear):

| Night | hpScale | Prowl | Night battle | Elite | Boss |
|---|---|---|---|---|---|
| 1 | 1.00 | 10.8 | 20.0 | | |
| 2 | 1.05 | 12.6 | 22.1 | 30.2 | |
| 3 | 1.10 | | | | 56.1 |
| 4 | 1.15 | 22.9 | 36.4 | | |
| 5 | 1.20 | 24.3 | 39.4 | 50.4 | |
| 6 | 1.25 | | | | 91.9 |
| 7 | 1.30 | 38.4 | 58.9 | | |
| 8 | 1.35 | 41.0 | 63.0 | 80.3 | |
| 9 | 1.40 | | | | 150.7 |

Each act opens harder than the last one closed: prowl effective threat goes 12.6 (Night 2) to 22.9 (Night 4), then 24.3 (Night 5) to 38.4 (Night 7). That is the A07 "x1.65 then x1.5" budget step plus the hpScale drift. Inside an act the climb is gentle (+5% a night) so the wall is the act change, not the night counter.

## Expected Warmth loss per fight (design target, unhealed)
A07 targets 28, 38, 48 loss per act against a 50 max. RULES sets max Warmth at 40, 45, 50, so the loss is held at the same fraction of max: 56%, 76%, 96%. A path holds on average 2.4 prowls, 1.65 nights, 0.47 elites before the boss; weights prowl 1, night 1.8, elite 2.6.

| Act | Prowl | Night | Elite | Boss | Max Warmth |
|---|---|---|---|---|---|
| 1 | 3.4 | 6.1 | 8.8 | 14 | 40 |
| 2 | 5.2 | 9.3 | 13.5 | 19.8 | 45 |
| 3 | 7.3 | 13.1 | 18.9 | 25 | 50 |

Boss loss targets are 35%, 44%, 50% of max, against the 40% boss heal. These are playtest targets, not engine rules (`encounterRules.curve`, `expectedLoss`).

## Variety
Every act holds 8 or more archetypes across prowls and nights and 6 or more families (tested). Answers forced:
- Swarms and sweep: Pantry Raid, Rat Pack, Dust Bunnies. Armor: Thimble Armada, Toy Soldiers, Gnome on Parade, Grooming Day.
- Climbers and fliers: Garden Raid, Hornet Hollow, Glider Raid, Skybridge, Wolf at the Flap, Chandelier.
- Napper punishers: Light Sleepers, Midnight Wheel, Slumber Party, Night Shift, Sleepover Disaster, Clock Tower, Reveille, Snooze Button.
- Dog packs: Puppy Class, Kennel Club, Beagle Choir, Bark Park, Yowl and Bay, Pack Hunt, Alpha's Walk, Dog Walker nights.
- Cleaners: Lint Trap, Deep Clean, Robot Army, Total Sanitation, Static Cling, the Vacuum boss. Act 1 has none because no cleaner is available there.
- Also thieves, parasites, countdowns, wet applicators, heavy walls (Knock does nothing), hostages, mirrors (Tomcat), weather, puzzles (Laser Dot).
Each encounter lists `question`, `counterplay[]`, `pressure[]` (deck tags it tests) and an `omenBan` where an omen would break it (Quiet House on Witching Hour fights).

## Structure rules
- Prowl 3 waves, night 4, elite 4 (plus elite unit), boss per enemies-bosses.js. Wave 1 is round 1; last wave arrives by round 4 (prowl) or 5. A wave never exceeds 5 pest Room on one floor (tested), and no wave is under 8% or over 58% of the total (elite 65%).
- Prowl and night waves spawn in the Cellar only. Elites and bosses use their data `spawnFloor`. Event fights may use windows (the Chandelier drops spiders onto the Attic).
- Elites: one per data elite, from wave 1 or 2, with escorts that ask a second question (Duchess with rats, Fence with thieves, Cucumber with scares).
- Bosses use the data wave scripts. Test fails on any difference except one declared deviation.

## Selection (`encounterRules.pick`)
Run-wide no repeats (A07 asks per act). Weights: prowl by row group and tier (Act 1 row 1 is soft only; rows 4 to 5 favor hard 30 to 35%; mystery battles favor standard), night by slot (A takes A and any, B takes B and any), elite flat. Multipliers: x0.35 same archetype as the last fight on the path, x0.5 same family, x0.7 same archetype two back, x0.25 if another node in the same row already has it, up to x1.5 for encounters whose `pressure` tags match the deck. Fallback relaxes rows, then slot, then repeat. A 3000 run simulation shows no repeats and every encounter reachable (min 176, max 1083 appearances).

## Night Visitors
About 25% of a normal wave (budget / waves). Band is 0.75x to 1.75x of that, one extra threat from the third Witching Hour on. Tables per act (3 each) of weighted packs, spawning at the Cellar back. Act 1 uses ghost mice, Nightcap, Hamster and Night Fleas or Hornets; Act 2 adds Spider, Possum, Owl; Act 3 adds Alarm Clock, Owl and Ghost, Spider and Tick. Rowdy Hour x1.5, Stopped Clock x1.5, the Great Bath x2 (`nightVisitorMult`).

## Needs and flags
1. Boss data bug: the Great Bath (Size 5) and its Plug Chain both spawn on the Attic in wave 1, 6 Room in 5. I put the Plug on the Parlor and flagged it with `dataDeviation`. Fix in enemies-bosses.js or keep mine. The Bath's own Plug summon (onlyIfAbsent floor 3) has the same problem.
2. `count`, `mod` {name, skin, hpMult, fluff} on spawn entries. `pest_add_*` ids must resolve in `SB.content.pest`.
3. Pigeon flock reuses Crow and Magpie in Act 3 (`actExempt`); no pigeon pest exists. Roomba Mk II is a Mk II-modded Robot Vacuum plus the fleet; it has no elite unit (`eliteProxy`).
4. Warmth loss targets use RULES maxes, not A07's 50. Playtest `curve.typeWeight` first.
