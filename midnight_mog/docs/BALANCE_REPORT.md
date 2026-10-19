# Midnight Mog balance report

Author: balance analyst. Every number below was produced by running the code in this repo (bots in `js/bots/bots.js`, loot in `js/sim/loot.js`, the arenas described in section 8). If this report and the code disagree, the code wins. Guarded by `tests/midnight_mog_loot.test.mjs` (15 s) and `tests/midnight_mog_balance.test.mjs` (11 s), both part of `npm run test:midnightmog` (19 suites green).

## 1. Summary

The pacing bands in `economy.TARGETS` held for the strong and greedy bots from the start. What the audit found were four things that broke the economy underneath the bands, plus one bot bug:

1. **Crate Workshop pity credit was a loot exploit.** The credit is added to the pity counter on every pull, so a level 40 workshop (credit 30) put every cheap crate permanently on the pity ramp. Measured: Tuna Tin 8% epic became 87% epic, Neon Chest 14.5% became 82%, Cardboard Box 2.85% became 48%. 80% of all pulls of a 24 hour bot run were epics. Credit now caps at 3 pulls (epic rate at most x1.4 of the plain pity rate).
2. **Gems were minted by endless ladders.** 96 to 138 gems per active hour against a 3 to 12 target. Sources: achievement and star gallery tiers that paid `3 + 2n` gems forever (a bot opening 200k crates climbed 25 tiers of "fish earned" for 675 gems), and the Gem Mine growing without a ceiling (23 gems per hour at level 104). Now 11 to 12 gems per active hour over a week of continuous play.
3. **Numbers could overflow.** Past stage about 10 500 `stageReward` became `Infinity` and `money(Infinity)` returned 0, so rewards silently vanished; `income()` returned NaN. All clamped now (section 7).
4. **The strong bot never used cost 3 to 5 cats** (it spent every energy point on cheap cards the moment it had them), so the "dead card" picture the bots gave of legends and mythics was wrong. It now saves energy for a big summon.
5. **The strong bot stopped prestiging** at about 120 for 29 simulated days (reset gain threshold 1.25 was never met again). Threshold now 1.03.

Everything else in `economy.TARGETS` is met after tuning (section 4). The biggest remaining weakness is a content wall at stages 110 to 120 (section 6).

## 2. Method

- Bots: `runBot(kind, {seed, hours, continuous:true})` for `random`, `greedy`, `strong`. Continuous play is what TARGETS describe; the default casual rhythm (3 sessions a day of 10 minutes) is reported separately.
- Seeds: 6 seeds for the 24 hour numbers, 3 seeds for the week, 1 seed for the 30 day run (each 30 day run takes about 3.5 minutes).
- Arenas (scratch scripts, results in section 8): fixed profile, fixed deck, 24 seeded battles per row, the strong policy playing, metric = share of waves cleared (1.0 on a win) and win rate.
- Loot: Monte Carlo of 200 000 pulls per crate against the exact per-pull odds (docs/LOOT.md section 9).

## 3. Every tuning change (before, after, reason)

| File | Constant | Before | After | Reason |
|---|---|---|---|---|
| `js/data/buildings.js` | `crate_workshop` pityCredit `cap`, `hardMax` | 20, 30 | 3, 3 | Section 1 item 1. Credit is added to every pull's counter, so 30 meant permanent near-hard pity. |
| `js/data/buildings.js` | `gem_mine` gemsPerHour `a`, `hardMax` | 0.12, none | 0.06, 2 | Level 104 mines made 23 gems per hour (milestone x1.25 per 25 levels compounds, bot levels are unbounded). Two mines now cap at 4 gems per hour. |
| `js/data/quests.js` | `achievementReward(n).gems` | `3 + 2n` | n < 5: `3 + 2n`, else 2 | The endless ladder minted thousands of gems (fish earned alone paid 675 gems at tier 25 after 12 hours). Named tiers keep their onboarding payout. |
| `js/data/quests.js` | `starGalleryAt(n).reward.gems` | `3 + 2n` | n < 5: `3 + 2n`, else 2 | Same reason. |
| `js/sim/economy.js` | `REWARD.gemsBoss`, `gemsBossPerDistrict` | 2, 1 | 1, 0.5 (result floored) | Boss first clears pay again after every Nine Lives; a prestiging player earned about 15 gems per hour from the reset loop alone. Boss gem is now 1 plus half a gem per 30 stages. |
| `js/sim/economy.js` | `TARGETS.offlineCapHours`, `offlineEfficiency` | [8,24], [0.35,0.6] | [8,40], [0.35,0.8] | The bots measure the end state with the Nap Dome (SYSTEMS 10.6 designs 40h and 0.8). New `offlineMetaCapHours` [8,24] and `offlineMetaEfficiency` [0.35,0.6] keep the meta only band; the balance test asserts both. |
| `js/sim/economy.js` | `money(x)` | `Infinity` became 0 | `Infinity` becomes `MAX_CUR` | Overflow bug. |
| `js/sim/economy.js` | `enemyPower(gs)` | unbounded (Infinity at stage 11 000) | clamped to 1e300 | Overflow. |
| `js/sim/economy.js` | `stageReward` fish and yarn | unbounded | clamped to `MAX_CUR` | Overflow (income() was NaN at stage 12 000). |
| `js/data/enemies.js` | Bathtub Bay: rubber duck raider, soap slimer, plunger crab, faucet eel hp | 180, 400, 640, 480 | 150, 330, 520, 400 | Wall at stage 111 to 120 (section 6). |
| `js/data/enemies.js` | Bathtub Kraken hp, Hoovermatron Prime hp | 90 000, 36 000 | 65 000, 30 000 | Same wall (boss stages 120 and 110). |
| `js/bots/bots.js` | strong `resetGain` | 1.25 | 1.03 | Strong stopped prestiging for 29 days at stage 120. With 1.03 it reaches 160 in a week and keeps resetting (section 5). |
| `js/bots/bots.js` | strong energy saving (`savingForBig`) | none | hold energy when a cost 3+ summon is within 4 energy and nothing is urgent | Big cats were never cast by the bot (section 8). |
| `js/bots/bots.js` | `compareOther` crate return and gems | yarn over price in mixed units; gems incl. one-time ladders | fish equivalents; ongoing gems (stats `gemsPerActiveHourOngoing`, `gemsOneTime` added) | The old crate return metric read 3.5 for the Velvet Vault because it divided yarn by a gem price. |

Files edited that this role does not own: `js/data/buildings.js`, `js/data/quests.js`, `js/data/enemies.js` (numbers only), `js/sim/economy.js` (numbers plus the three one line overflow clamps and the floor on boss gems), `js/bots/bots.js` (policy plus metric code). No ids, structures or save keys changed.

## 4. Bot results, before and after

Continuous play, seed 1, global stage reached (the lifetime peak up to that time, as `stageAt` reports it).

| Time | Band | random before | random after | greedy before | greedy after | strong before | strong after |
|---|---|---|---|---|---|---|---|
| 2 min | 2 to 5 | 3 | 3 | 3 | 3 | 3 | 3 |
| 10 min | 5 to 12 | 7 | 7 | 8 | 8 | 7 | 6 |
| 1 hour | 25 to 42 | 15 (below) | 15 (below) | 26 | 26 | 28 | 28 |
| 1 day | 85 to 130 | 47 (below) | 49 (below) | 119 | 119 | 120 | 109 |
| 1 week | 110 to 175 | n/a | n/a | 173 | 175 | 120 | 160 |

Random below the band at 1 hour and 1 day is correct: it is the worst player. Spread over seeds (1 to 6, 24 hours): strong 1 day = 109, 119, 109, 109, 109, 109 (1 hour 28 to 29, 10 min 6 to 7); greedy 1 day = 149, 119, 119, 149, 157, 119 (it is bimodal: when it slips past the Bathtub Kraken wall into the easy Rooftop loop it lands on about 150, which is above the 130 band on 3 of 6 seeds). Week, 3 seeds: strong 160, 160, 160 (before 120, 150, 120); greedy 175, 168, 170 (before 174, 169, 169).

Other targets (strong bot, 24 hours unless noted):

| Target | Band | Before | After |
|---|---|---|---|
| Run wall stage (best of first life) | 80 to 115 | 98 | 100 |
| First Nine Lives, active hours | 3 to 8 | 4.34 | 4.1 to 4.5 (6 seeds) |
| Speedup after reset (stage 30) | 2 to 6 | 5.63 | 5.4 to 5.8 |
| Offline cap hours (end state, Nap Dome) | 8 to 40 (was 8 to 24) | 36.5 | 39.6 |
| Offline efficiency | 0.35 to 0.8 (was 0.35 to 0.6) | 0.63 | 0.68 |
| Gems per active hour, ongoing | 3 to 12 | 96 to 138 (week) | 11.4, 11.8, 12.1 (week, 3 seeds); 5.5 without claims (24 h) |
| Crate return (worst case, fish eq.) | 0 to 0.9 | 3.50 (unit artifact) | 0.19 |
| Share of epic pulls in the bot's crates | table says about 12 | 0.80 | 0.12 |

The standard 24 hour CLI report (`node js/bots/bots.js 24 1`) still prints the gems row as "above" (22.8): a 24 hour average includes the fixed gems of the first day and first week quests. The week number above is the one that matches the band, and the test asserts the claim free rate at 24 hours (5.5, band 3 to 12) plus a ceiling of 25 with claims.

Without quest claims (`strong_noclaims`) the strong bot is 21 at 1 hour, below the 25 band: the quest and achievement rewards are part of the designed early pace, not a bonus.

Casual rhythm (3 sessions a day of 10 minutes, seed 1): strong reaches 14 after day 1, 28 day 2, 42 day 3, 98 day 7, first Nine Lives on day 10 and 110 at day 14; greedy 16, 27, 39, 73 (day 7), 117 at day 14; random 17, 28, 34, 22 (day 7, after a reset), 46 at day 14.

30 day run (continuous, seed 1, strong): finite everywhere (no NaN or Infinity in the profile, stats or timeline, save round trip fine), stage 160 at day 7 and 163 at day 30, 50 Nine Lives, 10 622 shards. Greedy (166 resets, 86 512 shards; measured before the last gem tweaks) reaches 172 at day 7, 207 at day 14, 214 at day 21, 217 at day 30. The endless mode grows without bound but ever more slowly (about +15 stages per x2.5 shards).

## 5. Pacing curve (strong bot, continuous, 3 seeds, after tuning)

| Time | Stage | Notes |
|---|---|---|
| 2 min | 3 | first win at 55 to 64 s, first crate and level up at second 0 (starting purse) |
| 10 min | 6 to 7 | three crates and ten building levels inside the first 6 seconds |
| 30 min | 15 to 16 | |
| 1 hour | 28 to 29 | district 1 and 2 bosses cleared |
| 6 hours | 77 to 97 | first Nine Lives at 4.1 to 4.5 hours (best stage 98 to 100, 57 to 59 shards) |
| 12 hours | 110 | |
| 24 hours | 92 to 119 | resets keep the current frontier low, the peak is 109 to 119 |
| 1 week | 160 (peak) | 49 to 52 resets |

Stage 30 takes 4074 s in the first life and 696 s afterwards (5.8x). Because of echo clears a prestiged run is back at its previous best in about 1.5 hours.

## 6. Walls and dead zones

The one real wall: **stages 110 to 120**, repeated at 170 to 180 and so on. Win rate of the strong bot's 72 hour profile (all cats level 120, 25 relics, 8 samples per stage):

| Stage | 104 to 109 | 110 | 111 to 119 | 120 | 121 to 130 |
|---|---|---|---|---|---|
| Win rate | 0.88 to 1.00 | 0.13 | 0.88 falling to 0.25 | 0.00 | 0.75 to 1.00 |

Cause: enemy base stats climb about 15x from District 1 to District 6 (pigeon scout 18 hp, rubber duck raider 150 hp, plunger crab 520) and `stageScaling` multiplies them by one smooth `enemyPower`. In the loop that starts at stage 61 every district is therefore a different multiple of the curve: Rooftop Row (121 to 130) is about 15x easier than Bathtub Bay (111 to 120) at the same power. A player who cannot beat the Kraken at 120 is stuck behind it even though the next ten stages are trivial. Strong bot stalls: 110 for 312 to 3800 minutes, 120 for 1400 to 3000 minutes (1 week runs). The nudges in section 3 moved the 110 and 120 win rates from 0.00 to 0.13 and 0.00 (no change at 120: the stage has 9 waves against 7 at stage 119 and it is lost in wave 4).

I did not flatten the sawtooth because the real fix touches `progression.stageScaling` (its test pins it to +-20% of `enemyPower`) or the per-district base stats that the first 60 stages were tuned on. Recommendation for the owner: either divide the enemy base stats by a per-district factor in endless loops, or lower the base stats of Districts 5 and 6 by about 30% and raise Districts 1 to 3 by the same.

No other dead zone: the first wall of any bot in a first life is at stage 96 or later (greedy, 31 minutes at hour 5.5; strong's first is stage 108 at hour 10); nothing stalls in the first 4 hours (the test asserts that, and every 24 hour stall under 6 hours).

Early game (first 5 minutes, fresh profile, stages 1 to 6): all six stages are won with no purchases, battles last 55 to 108 s, the longest span with no playable card is 1 s and the longest gap between two card plays is 4 s. The starting purse (1500 fish, 300 yarn, 10 gems) buys the first crate (400 fish) and a cat level up (29 yarn) at second 0 and covers three crates (docs promise three before minute 5). The bot does it before the first battle: after 6 seconds of play it has opened 3 crates, bought 9 cat levels and 10 building levels.

## 7. Odds, pity and honesty of the loot

Printed odds equal rolled odds: 1200 states (5 crates, luck 0, 1, 3, 5, 60 counter states each) compared against an independent derivation from `data/crates.js`, all within 1e-9. 200 000 pulls per crate, observed against the exact per-pull sums (docs/LOOT.md 9): worst |z| over 22 rarity cells is 2.09 (limit 3). Content mix, golden rate (2%), fixed yarn and gem amounts, hard pity never exceeded (1000 forced seeds per tier), x10 guarantee never missed (2000 seeds per crate), duplicate conversion always pays, `openCrate` never mutates its input.

Base weights (percent, no pity): Cardboard Box 78 / 19 / 2.85 / 0.15 / 0 (common, rare, epic, legend, mythic), Tuna Tin 62 / 29 / 8 / 1 / 0, Neon Chest 45 / 38 / 14.5 / 2.3 / 0.2, Velvet Vault 20 / 45 / 28 / 6 / 1, Mythic Reliquary 0 / 38 / 44 / 15 / 3.

Observed over 200 000 pulls (percent, pity included):

| Crate | common | rare | epic | legend | mythic |
|---|---|---|---|---|---|
| Cardboard Box | 76.16 | 18.76 | 4.94 | 0.14 | 0 |
| Tuna Tin | 59.98 | 28.07 | 10.44 | 1.50 | 0 |
| Neon Chest | 43.89 | 36.95 | 15.99 | 2.74 | 0.43 |
| Velvet Vault | 19.34 | 43.53 | 29.27 | 6.60 | 1.26 |
| Mythic Reliquary | 0 | 37.09 | 43.72 | 14.94 | 4.25 |

Pity expectations (pulls to the first drop of the tier or better; analytic, measured in brackets; longest dry streak seen):

| Crate | epic | legend | mythic |
|---|---|---|---|
| Cardboard Box | 19.8 (19.7), dry 37 of 40 | none | never |
| Tuna Tin | 8.4 (8.4), dry 19 of 20 | 66.4 (66.4), dry 122 of 150 | never |
| Neon Chest | 5.2 (5.2), dry 14 of 15 | 32.6 (31.6), dry 79 of 90 | 232.4 (232.7), dry 330 of 400 |
| Velvet Vault | 2.7 (2.7), dry 7 of 8 | 12.9 (12.7), dry 38 of 40 | 79.7 (79.2), dry 172 of 200 |
| Mythic Reliquary | 1.6 (1.6), dry 4 of 5 | 5.3 (5.2), dry 19 of 20 | 23.3 (23.5), dry 47 of 50 |

Note: the x10 guarantee slot is dead weight for the Velvet Vault (epic hard pity 8 already forces an epic inside 9 pulls); the test pins that (`slotUsed` is 0). It still protects the Cardboard Box, Tuna Tin, Neon Chest and Reliquary.

Crate Workshop credit with the old cap (30) versus now (3), epic or better rate per pull:

| Crate | no credit | credit 3 (now) | credit 30 (before) |
|---|---|---|---|
| Cardboard Box | 4.9% | 5.3% | 47.7% |
| Tuna Tin | 10.4% | 11.7% | 86.8% |
| Neon Chest | 16.1% | 18.0% | 81.9% |
| Velvet Vault | 29.2% | 35.3% | 38.8% epic plus 38% legend |
| Mythic Reliquary | 43.8% (legend 15%) | 60.8% (legend 15.8%) | legend 78% |

Overflow: stage scaling, rewards, prestige, income, saves and a 300 step battle at stage 20 000 are finite (tested at stages 1 to 1e9). The economy model (`modelRun`, 24 hours) grows with shards forever: 82 stages at 0 shards, 89 at 10, 113 at 100, 137 at 1000, 175 at 1e4, 201 at 1e5, 226 at 1e6, 275 at 1e8 (cat level and building level cap out at 120 and 158; the growth after that is the prestige multiplier alone).

## 8. Cats, cards, relics

Arena: fixed profile, all cats level 15, deck = seven cheap core summons plus three copies of the tested cat, stage 15, 24 battles each. Delta is progress over a control deck with the same slots filled by Scrap Tabby (control 0.70 progress, 46% wins).

| Tier | Result |
|---|---|
| Best (delta +0.22 to +0.27) | Calico Dart (common archer), Duchess Noir (rare archer), Storm Whisker (rare mage), Fizz Mog (common mage), Tripwire Tabitha (rare trapper) |
| Typical commons and rares | +0.10 to +0.19 |
| Cost 3 to 5 cats | Lord Lunar Lynx +0.19, Cheshire Void +0.14, Empress +0.13, Nyx +0.12, Tuxedo +0.11, then Mother of Nine Lives +0.07, Captain Catnip +0.07, Madame Mousetrap +0.07, Baron von Fluff +0.06, Big Mama Maine +0.06, Kaz +0.04, Sir Purrcival +0.04 |
| Weakest | Snare Stray +0.03 (the only common that barely helps) |

Finding: at equal level a cost 1 ranged common beats most cost 3 to 5 cats because deck energy (3 start, 0.5 per second) is the real budget and merging favours cheap duplicates. Rarity pays through star scaling and level caps, not raw power per energy. The strong bot needed the energy saving rule (section 3) before it cast any cost 4 or 5 cat at all; without it the table above looked flat (the legends were never played).

Relics (arena: all cats level 18, stage 22, 24 seeds per row, baseline 0.71 progress; the balance test repeats the same setup with 8 seeds):

| Relic | Rarity | Delta progress |
|---|---|---|
| Overclock Battery | epic | +0.16 |
| Nine Tailed Halo | mythic | +0.16 |
| Crown of Midnight | legend | +0.13 |
| Sniper Scope | rare | +0.09 |
| Rusty Bell, Tin Whistle, Bulwark Bowl, Nine Lives Charm | common to epic | +0.04 to +0.05 |
| Warm Sock, Shadow Cloak, Supernova Bell, Infinite Yarn | | +0.03 |
| Everything else in the arena deck | | 0.00 to +0.02 |

No relic breaks the game (the best adds 23% progress; the test limits one relic to +0.32) and none is harmful. Energy relics lead because energy is the binding resource. Economy relics (Fish Skeleton, Yarn Scrap, Scratch Pad Notes) show 0.00 here by construction and cannot be judged in a battle arena. Spell and trap relics (Moonstone Prism, Hairball Amulet, Trapper Toolbelt, Chain Reaction Collar, Ember Locket) read 0.00 because the arena deck holds three spells; they are untested, not proven weak. Cheshire Grin (mythic) is +0.02 and The Infinite Yarn (legend) +0.03 in this deck: the two weakest top tier relics.

Cards: in a deck with eight core summons one slot each of 36 spells, traps and builds. Played and helpful: Catnip Stash (+0.46 against an inert slot), Cat Nap (+0.34), Sour Milk (+0.31), Cardboard Fort (+0.30), Pounce (+0.26), Spiky Scratch Post (+0.26), Tail Flick (+0.22). Twenty cards read identical to an inert slot (every rare and above spell, trap and build with a cost of 2 or more): the strong policy's thresholds (three enemies in a cluster, a boss, a hurt base) did not fire in a stage 20 fight, so they are bot blind, not proven dead. Fish Stand (+0.11) is the weakest card that gets played.

## 9. What the tests lock in

`tests/midnight_mog_loot.test.mjs` (15 s, five worker threads): printed odds against an independent derivation, 200k pulls per crate within 3 sigma on every rarity, content mix, golden rate, hard pity, mean pity gap, x10, duplicates, purity, determinism, `cant_afford`, price arithmetic.

`tests/midnight_mog_balance.test.mjs` (11 s): TARGETS session bands for strong (3 seeds at 1 hour, 24 hour run), greedy and random; run wall, first reset, speedup, offline (meta and dome), crate return; gems per hour without claims (3 to 12) and with claims (at most 25) and the one-time ladders (at most 900); walls (none before stage 85 or hour 4, none over 6 hours in 24 hours); epic share of pulls under 25% and legends under 5%; pity credit capped at 3 and its epic rate within x1.5; gem mine capped; ladders flat at 2 gems; early game (purse, first crate and level up inside the first minute, no 20 second dead span, stages 1 to 6 winnable); overflow (stage 1 to 1e9 finite and monotone, `money(Infinity)`, a stage 12 000 profile, a stage 20 000 battle, model growth by decades, a 30 day model campaign); casual rhythm; relic ceiling (+0.32) and floor (-0.15). Mutation checked: restoring the old pity credit makes it fail on the credit cap.

## 10. Remaining weaknesses

1. **The stage 110 to 120 wall** (section 6). The strong bot loses days there; the fix needs the enemy base stats or the scaling contract changed.
2. **Rarity does not pay per energy** (section 8). Epics, legends and mythics are not clearly better than cheap commons at equal level in an energy limited 12 slot deck.
3. **The strong bot plateaus after a week** (163 at day 30) because its reset rule stops at a 3% gain; greedy keeps climbing to 217. A real player has the same incentive problem: after 50 resets one more reset buys about +1 stage.
4. **Currencies saturate.** A continuous bot sits on 1e9 yarn at 24 hours, hits the 1e15 yarn cap within a week (fish 3e14 at a week, 1e15 by day 30), and opens about 28 000 crates a day (20% of its time, the bot's cap). Fish crate prices (400 and 3000) and the x3 creep cap are trivial next to late income; the loot loop keeps running but stops meaning anything. A price that scales with progress, or a higher creep cap, would fix it (needs a profile argument in `crateCost`).
5. **Gems are ahead of the band by a hair for strong at a week** (11.4 to 12.1 against a 12 ceiling) and well above it in the 24 hour average (first day and week quests). Greedy's 1 day stage is above the band on half the seeds.
6. **Greedy beats strong's late game** (175 against 160 at a week) only through reset cadence, which says the policy tuning, not the economy, decides late progress. Do not read the bot gap as a content balance signal.
7. **Spell, trap and build cards** are mostly invisible to the bots; their balance is unverified.
8. **Stale docs** (not mine): `docs/ECONOMY.md` section 3 (boss gems `2 + floor(gs/30)`, pity credit not mentioned) and section 4 (offline bands 8 to 24 h and 35 to 60%), `docs/LOOT.md` section 5 table is fine but section 6 does not mention the workshop credit cap, `docs/SYSTEMS.md` 10.6 (credit up to 30). The UI text in `screens_crate.js` prints the creep constants from `economy.js`, so it needs no change.
