# Midnight Mog economy

Source of truth: `js/sim/economy.js`. Every number here is produced by that file; if they disagree the code wins and this doc is stale. Bots test against `TARGETS`. Never write an em dash.

## 1. Principles

- Idle-game growth: `cost(level) = base * growth^level`. Costs grow faster than power, so every run meets a wall and the player is pulled toward the next system (crates, buildings, Nine Lives).
- Bonuses add inside a tier and multiply across tiers. Tiers: relics, cat stars, town levels, Nine Lives. Each additive pool has a soft cap: `x <= cap ? x : cap * (x / cap)^0.5`.
- A second, steeper growth starts at a soft level (`softAt`), so the last levels of anything are a long haul.
- Gems are earned slowly by play and never bought. Crates cost fish, yarn or gems only.
- Everything is clamped to 1e15 (`money()`), no NaN or Infinity can reach a profile.

## 2. Currencies

| Currency | Role | Sources | Sinks |
|---|---|---|---|
| fish | soft | battle wins, town fish buildings, offline | building_level, unlock_slot, cheap crates (alley, neon) |
| yarn | upgrades | battle wins (small), yarn mills, offline, crate dupes (`DUPE_YARN`) | cat_level, card_level, rooftop crate |
| gems | premium-feel, earned | boss first clears (2 + 1 per district), daily bonus (10, max 40 per day), never offline | midnight and mythic crates |
| tokens | prestige meta | Nine Lives reset: 1 token per shard earned | meta perks (`META`): offline cap, offline efficiency, start fish, crate luck, extra slot |

## 3. Formulas

Costs (to go from `level` to `level + 1`), `cost(kind, level, {rarity})`:

`base * growth^min(level, softAt) * growth2^max(0, level - softAt)`, times `RARITY_COST_MULT` for cats and cards (common 1, rare 2.5, epic 7, legend 20, mythic 60).

| kind | cur | base | growth | softAt | growth2 | max level |
|---|---|---|---|---|---|---|
| cat_level | yarn | 25 | 1.12 | 60 | 1.17 | 120 |
| card_level | yarn | 18 | 1.14 | 40 | 1.19 | 80 |
| building_level | fish | 90 | 1.20 | 30 | 1.26 | 80 |
| unlock_slot | fish | 600 | 3.4 | none | 3.4 | 12 |
| crate | per id | alley 400 fish, neon 3000 fish, rooftop 2500 yarn, midnight 60 gems, mythic 300 gems | creep +1.5% per open this life, capped x3 | | | |

`cost` returns `Infinity` at max level. Crate ids unknown to the table fall back to the alley price (see "Contract notes").

Power helpers (optional for battle.js): `levelMult(L) = (1 + 0.1 (L - 1)) * 2^floor(L / 25)` (milestone doubling at 25, 50, 75, 100), `starMult(s) = 1 + 0.25 min(s,5) + 0.1 max(0, s-5)`.

Stage rewards, `stageReward(gs)` with gs the global stage (`(district-1)*30 + stage`, both 1 based):

- fish `10 * 1.072^(gs-1)`, yarn `1.8 * 1.062^(gs-1)`. Boss stage (gs % 10 == 0): fish x3, yarn x2.
- first clear of a stage this life pays x2.5. Replay pays x0.55.
- gems: only boss first clears, `2 + floor(gs / 30)`.

Town: a building makes `BUILDING_BASE[kind] * L * 1.05^(L-1)` per second (fish 0.45, yarn 0.06 at level 1). Kind is chosen by `buildingKind(id)`: ids containing yarn, mill, loom, knit or wool make yarn, everything else makes fish. Un-collected production stops after 4h (plus 1h per offline_cap meta level).

Income: `income(profile)` returns `{passive, battle, active, perHour, mult, gs}`. `mult.income = (1+relics) * (1+stars) * (1+town) * prestige`, with pools `relic +6% each (cap 150%)`, `star +3% each (cap 100%)`, `town +2% per building level above 1 (cap 100%)`, all soft capped with exponent 0.5.

Offline: cap 8h (+2h per `offline_cap` level, max 24h). Efficiency 35% of active income (+5% per `offline_eff` level, max 60%). The first 2h count fully, hours after that count half. Fish and yarn only, never gems. Negative or NaN away time is 0. `offlineGainFor(profile, awaySeconds)`.

Nine Lives:

- allowed when best global stage of the run >= 30.
- `shards = floor(1.5 * (best / 10)^1.6)`; tokens granted equal shards; `profile.nineLives.shards` accumulates the total S.
- `income mult = 1 + 0.06 * S^0.8`, `damage mult = 1 + 0.08 * S^0.7`. Damage grows slower than income because enemies scale exponentially.
- Echo clears: after a reset, stages below 60% of the previous run's best resolve in 20s and pay replay rewards, so the early game is not replayed at full length. `echoStage(prevBest)`.
- Unlimited resets. The 9th reset unlocks the cosmetic Ascension tier (no extra power).
- Meta perks: `metaCost(id, level) = base * growth^level` (see `META`).

Difficulty the economy assumes: `enemyPower(gs) = 1.064^(gs-1) * (1 + 0.012 (gs-1))`. `progression.stageScaling` should stay within +-20% of it or `TARGETS` no longer hold.

## 4. Pacing table

From `modelCampaign` (an engaged player who plays continuously, buys buildings then team levels, never idles, and resets when an extra hour adds under 2 stages and shards would gain 30%). The model has no loot, relics or stars, so real play should meet or beat it. Casual players take longer by their idle ratio.

| Session | Model stage | TARGETS band | What the player should feel |
|---|---|---|---|
| 2 min | 3 | 2 to 5 | first win, first card level |
| 10 min | 8 | 5 to 12 | first crate, first building |
| 1 hour | 37 | 25 to 42 | district 1 boss, first wall approaches |
| 1 day | 107 | 85 to 130 | five or so resets for a continuous player |
| 1 week | 129 | 110 to 175 | long tail, about +15 stages per doubling of shards |

Other targets: a run with no prestige walls at stage 80 to 115 (`runWallStage`). First Nine Lives is attractive after 3 to 8 active hours (model: 4h, about day 3 to 5 for a 1h per day player). A prestiged run reaches stage 30 in about 570s versus 2550s for a fresh one (4.5x, target 2 to 6x). Gems: 3 to 12 per active hour. Offline cap 8 to 24h, efficiency 35 to 60%.

The first run is bound by battle length (one stage per ~90s), not by money; that is why echo clears exist.

## 5. Sources and sinks, per currency

- fish in: battle wins, first clears, fish buildings, offline. Out: buildings (the main sink), slots, fish crates. Late game fish is abundant by design; the real fish sink is the 80-level building curve (2.2M at level 50).
- yarn in: battle wins (small), yarn mills, dupe conversion, offline. Out: cat and card levels. Yarn is the bottleneck currency on purpose.
- gems in: boss first clears and the daily. Out: premium crates only. No gem to fish or yarn exchange exists (it would let gems bypass the curve).
- tokens in: resets only. Out: meta perks.

## 6. Exploit checklist

Each item needs a guard in the module named. "Economy" means a rule already encoded in economy.js.

1. Replay farming of easy stages: replay pays x0.55 of that stage and its length is the same, so the best farm is the highest clearable stage. Gems pay only on first clears (progression must track first clears per life).
2. Reset spam for shards: shards come from the run's best stage and the minimum is stage 30; fast resets give few shards. Economy: `nineLivesShards`. Check bots: reset at stage 30 every time must lose to waiting.
3. Gem loops: gems only from boss first clears and a daily capped at 40 per day (needs a day counter in profile.stats; use sim time, not Date). Reset lets you first clear bosses again, so gems per life are bounded by number of bosses reached.
4. Dupe conversion: `DUPE_YARN` must stay below the price of a crate in yarn-equivalent. `TARGETS.crateReturnMax` = 0.9, so buying crates to dismantle must be a net loss.
5. Crate price reset trick: creep counts opens this life; resets must not clear `stats.crateOpens` in a way that restores base price for free more than once per life (accepted, since a reset costs the run).
6. Offline clock tampering: `offlineSeconds` ignores negative or NaN, caps at 24h at most. offline.js must keep `lastSeen` monotonic (`max(lastSeen, now)`) and ignore a backward clock.
7. Collect loops: town storage stops production after 4h so spamming collect gains nothing; `collect` must set `t` to now.
8. Level refund: no kind refunds. Never add a respec that refunds 100%.
9. Cheap-slot arbitrage: slots grow x3.4 per slot, steeper than any income growth, so slots cannot be bought out early.
10. Float blowup: all currencies pass `money()` (clamp 1e15, floor). Costs above that return finite numbers, but UI must show scientific notation past 1e9.
11. Negative or fractional levels from a bad save: `cost` floors levels and `buildingOutput` returns 0 below level 1. `migrate()` must also clamp.
12. Save editing is out of scope (single player), but the profile has a checksum idea reserved for leaderboards.

## 7. Contract notes for other members

- progression.js: use `globalStage`, `stageReward`, `nineLivesShards`, `nineLivesMult`, `echoStage`, `canNineLives`, `startingFish`. Keep `stageScaling` near `enemyPower`.
- town.js: use `cost('building_level', L)` and `buildingOutput(id, L)`; `townStorageSeconds(profile)` for the cap. Building ids with yarn, mill, loom, knit or wool in the name produce yarn.
- loot.js and data/crates.js: price comes from `crateCost(id, opens)` -> `{cur, price}`. If crate ids differ from `alley_crate, neon_crate, rooftop_crate, midnight_crate, mythic_crate`, tell economy to add them. Use `DUPE_YARN[rarity]` for dupe value.
- profile.js: optional `profile.meta = {offline_cap, offline_eff, start_fish, crate_luck, extra_slot}` (levels, default 0).
- offline.js: wrap `offlineGainFor`; add gems never.
- battle.js: may multiply stats by `levelMult`, `starMult` and `nineLivesMult(shards).damage`.

## 8. Self-check (expected values)

| Value | L1 | L10 | L50 | L100 |
|---|---|---|---|---|
| cat_level cost (common) | 29 | 78 | 7,226 | 11,979,973 |
| cat_level cost (epic) | 197 | 544 | 50,576 | 83,859,811 |
| card_level cost | 21 | 67 | 19,362 | max (Infinity) |
| building_level cost | 108 | 558 | 2,173,156 | max (Infinity) |
| levelMult | 1 | 1.9 | 23.6 | 174.4 |
| fish stand output per s | 0.45 | 6.98 | 245.73 | 5635.77 |
| stage fish reward (gs) | 10.0 | 56.1 | 905.0 | 29,268.8 |
| stage yarn reward (gs) | 1.80 | 6.19 | 68.61 | 1388.77 |
| enemyPower(gs) | 1.00 | 1.94 | 33.19 | 1016.88 |

Others: `nineLivesShards(30)=8`, `(50)=19`, `(100)=59`, `(200)=181`. `nineLivesMult(100)` income 2.57, damage 2.39. `crateCost('alley_crate',0)` = 400 fish, at 100 opens 1000. `offlineSeconds({}, 9h)` is capped at 8h with 1.75h effective (6300s). Run `selfCheck()` from economy.js: it must return `[]`.
