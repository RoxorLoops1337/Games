# Drop the Bass: gameplay API (sim.js, data_core.js)

Contract for UI code. All of it is deterministic, JSON-snapshot safe (`run.snapshot()` / `Run.restore()`), no em dashes.

## Synergies (data_core.js and Run)
- `SYNERGIES`: array of `{ id, a, b, name, desc, fx }` (13 pairs). `SYNERGY_BY_ID[id]`.
- Two turrets on orthogonally adjacent tiles (up, down, left, right; not diagonal) activate the pair. Effects scale with the LOWER level
  of the two: `synergyScale(L) = min(1.6, 1 + 0.1 * (L - 1))`. Aura turrets (Loop Station, Amp Stack) still buff their 8 neighbours.
- `TURRET_PARTNERS[type]` -> `[{ partner, id, name, desc }]` ("works well with").
- `run.synergiesOf(turretOrId)` -> `[{ id, name, desc, withId, withType, scale }]` (empty when none). `turret.syn` holds the summed effect numbers.
- Event `{ k: 'synergy', id, x, y }` once when a pair becomes active (placement, move, merge that changes a type). x,y is the midpoint of the pair.
  Not repeated by restore or later recalcs while the pair stays active.

## Drop pool and reroll
- `run.nextType`: the queued drop (unchanged).
- `run.poolOdds()` -> `[{ type, p }]`, p sums to 1. Anti-streak: a type that just dropped has 0.6 weight, a type that dropped twice in a row has 0, so no type drops three times in a row.
- `run.rerollOdds()` -> same shape, what a reroll draws from (queued type removed).
- `run.dropRerollCost('coins' | 'gems')` -> number. Coins: `ceil(0.45 * raw deploy cost)` (ignores free deploys). Gems: 2 (`ECON.dropRerollCoinPct`, `ECON.dropRerollGems`).
- `run.rerollNext(payWith = 'coins', balance?)` -> `{ ok, reason, cost, type, paid, spendDiamonds }`.
  - Uses a free reroll first (`run.rerolls`, from Spare Setlist or Remix Master; cost 0, paid 'free').
  - 'coins': spends run coins. 'gems': pass the profile diamond balance as `balance`; the sim only checks it and returns `spendDiamonds` (the caller deducts it from the profile; `run.gemsSpent` tracks it). Without `balance` the run's own gems (`run.runGems`) pay.
  - `reason` (when `ok` is false): 'busy' (choice open or run over), 'single' (one type in the pool), 'locked' (a reroll could only give a third in a row), 'coins', 'gems', 'pay' (bad payWith). Nothing is charged on failure.
  - When ok, `reason` is null and `type` is the new queued type, always different from the old one.
- `run.rerollDrop()` (legacy): free reroll counter only, returns boolean.
- Events: `{ k: 'reroll' }` then `{ k: 'rerollDrop', type }`.

## Wave preview
- `run.nextWavePreview()` -> `{ wave, lanes: [{ lane, enemies: [{ type, count, flying, armored, elite }], boss: id | null }], total, hasBoss, mod: { id, name, desc } | null }`
  or `null` after the last story wave / when the run is over. Built from the same `genWave` and lane plan the spawn uses (verified by test for waves 1..20 in every world).
  `elite` means "can carry elite affixes" (wave 4+). The boss is listed on lane 0 only and is counted in `total`.
- `run.currentWaveInfo()`: same shape for the wave in progress (queued plus alive enemies, so counts shrink on kills); `null` outside a wave.
- `spawn` events now carry `lane`.

## Recap
- `run.recap()` (live) and `result.recap`:
  `{ leaksByLane: [n], leakTypes: [{ type, count }], worstWave: number | null, topKillers: [{ type, count }], bossFinisher: bossId | null, turretUse: [{ type, deployed, bestLevel }], tips: [up to 3 strings] }`
  - `leaksByLane` uses the same weight as `result.leaks` (a boss leak counts 3). Lane 0 is left on festival (2 lanes) and arena (left, right, middle).
  - `topKillers.count` is stage damage dealt by that enemy type. `bossFinisher` is the boss whose leak ended the run.
  - `turretUse` has no kill counts (not tracked).

## Difficulty
- `new Run({ difficulty: 'easy' | 'normal' | 'hard' })`, default 'normal', stored in the snapshot as `run.difficulty`.
- `DIFFICULTY[id]` = `{ id, name, desc, hpMul, stageHp, speedMul, coinMul, recordsMul, fansMul }`; `DIFFICULTY_IDS`.
  easy: hp x0.7, stage +6, speed x0.92, records/fans x0.75. hard: hp x1.3, stage -4, speed x1.06, kill coins x1.15, records/fans x1.25.
- `result.difficulty` (string) and `result.rewardMul = { records, fans }`. meta.js must multiply the payout by these (not done by the sim).
