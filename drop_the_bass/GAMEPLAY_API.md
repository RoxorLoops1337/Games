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

# Depth systems (sim.js, data_depth.js)

All data lives in `js/data_depth.js` (pure data). Everything is deterministic and part of `run.snapshot()` / `Run.restore()`.

## Turret branches
- `TURRET_BRANCHES[type] = [{ id, name, desc, glyph, fx }, { ... }]`: 12 turrets x 2 = 24. `BRANCH_BY_ID[id]`, `BRANCH_TURRET[id]` (branch id -> turret type), `BRANCH_LEVEL = 4`.
- A turret at level 4 or more may take ONE branch. Stored as `turret.branch` (branch id or `null`).
- `run.canBranch(turretOrId)` -> boolean. `run.branchBlock(turretOrId)` -> reason string or `null`.
- `run.branchOptions(turretOrId)` -> `[{ id, name, desc, glyph }]` (also for a turret that is not level 4 yet, for previews; `[]` for an unknown turret).
- `run.chooseBranch(turretId, branchId)` -> `{ ok, reason }`. reason: 'turret' (unknown turret), 'over' (run ended), 'level' (below 4), 'has' (already branched), 'branch' (branch belongs to another turret type).
- Merge rules: the merge target keeps its branch; if it has none the dragged turret's branch passes on; if the merge result changes type (cross type remix merge) a branch of the wrong type is dropped. Two unbranched level 4 turrets give an unbranched level 5 that can still choose.
- Events: `{ k: 'branchReady', id, x, y }` when a turret is unbranched at level 4+ after a deploy or merge (can repeat at level 5 and up until a branch is chosen), `{ k: 'branch', id, branch, x, y }` on choose.
- Branch list (effects are real, tested): kick `kick_big_bang` (bigger blast, harder, 30% slower) / `kick_double_tap` (faster, second shell); snare `snare_rimshot` (crit) / `snare_flam` (+1 shot); hat `hat_shredder` (ignores armor) / `hat_overspin` (spun up, past full speed); sub `sub_deep_freeze` (stronger longer slow) / `sub_shockwave` (reach, damage, shove); mic `mic_wide_wail` (2x beam) / `mic_healing_hook` (stage heal every 3rd beam); synth `synth_storm` (+3 jumps) / `synth_overload` (stun, damage); horn `horn_sonic_boom` (full circle) / `horn_deafening` (long stun, bosses too); scratch `scratch_triple_spin` (+1 record) / `scratch_razor` (damage, armor, sparks); loop `loop_wide` (aura reach 2) / `loop_hot` (aura +50%); cowbell `cowbell_execute` (kills non-bosses under 30%) / `cowbell_chain_mark` (marks 2 neighbours); amp `amp_wide_stack` (reach 2) / `amp_eleven` (+50%, crit); vocal `vocal_swarm` (+2 orbs) / `vocal_big_chorus` (big burst, heals).
- fx keys are documented at the top of data_depth.js; `BRANCH_FX_KEYS` lists them (a UI can print `desc`, it never needs to read fx).

## Hero abilities
- `HERO_ABILITIES[who] = [{ id, name, desc, unlockLv, cdMul }]` (3 per hero, unlock at hero level 1, 4, 7). roxor: `blast`, `freeze`, `overclock`. jasmin: `song`, `coinrain`, `shield`. `HERO_ABILITY_DEFAULT`, `HERO_ABILITY_NUMS` (seconds and rates).
- `new Run({ heroAbility: { roxor: 'freeze', jasmin: 'song' }, heroLv })`: an unknown or still locked id (hero level below `unlockLv`) falls back to the original. `run.heroAbility` = `{ roxor, jasmin }`, saved in the snapshot.
- `run.heroAbilities(who)` -> `[{ id, name, desc, unlockLv, cdMul, unlocked, chosen }]`. `run.setHeroAbility(who, id)` -> `{ ok, reason }` ('hero', 'unknown', 'locked'). `run.heroAbilityDef(who)`.
- `useHero(who)` uses the chosen ability; the cooldown is multiplied by its `cdMul`. The Duet Finale works with any pair.
- Power scales with `heroPower` (capped at x1.6 for durations): freeze 3 s (bosses 1.2 s, Mute Ghosts immune, ignores the stun cooldown), overclock +60% fire rate 6 s (`run.overclockT`), coinrain a coin burst plus double kill coins 8 s (`run.coinRainT`), shield 6 s (`run.shieldT`): leaks are absorbed, no stage damage and they do not count in `leaks`.
- Events: `{ k: 'hero', who, ability }` (ability is the id), `{ k: 'freeze', dur }` after a freeze, `{ k: 'leak', n: 0, shield: true }` for an absorbed leak, `{ k: 'duet', abilities: { roxor, jasmin } }`.

## Run modifiers
- `RUN_MODIFIERS = [{ id, name, desc, glyph, mul: { records, fans, diamonds } }]` (10), `RUN_MODIFIER_BY_ID`, `MAX_RUN_MODIFIERS = 3`, `RUN_MODIFIER_NUMS`.
- `new Run({ modifiers: ['glass_stage', ...] })`: max 3, duplicates and unknown ids dropped, ignored in Daily, the Weekly Gig (`opts.weekly` / mode 'daily') and the tutorial. `run.modifiers` (resolved ids), `run.hasMod(id)`.
- `result.modifiers` (ids) and `result.modMul = { records, fans, diamonds }` (product of the active multipliers, `{1,1,1}` without modifiers). The sim does not apply them: meta.js multiplies the payout.
- Effects: `double_trouble` twice the enemies per group (same wave length, boss untouched, previews match) at 60% health (kill coins per enemy unchanged, so total coins double); `small_band` the drop pool becomes 6 random types chosen by the seed (`run.loadout`); `glass_stage` stage health 6; `speedrun` enemies +25% speed; `no_heroes` `heroReady` is always false and `useHero` returns false; `fragile_merge` every merge costs 20 coins (`run.mergeCost()`, `merge()` returns `{ ok: false, reason: 'coins', cost }`, `findMerge` / `mergeAll` stop when unaffordable); `brutal_bosses` boss health x1.5; `lone_lane` every enemy uses lane 0 and has +25% health; `cramped` only 65% of the build slots (`slotCapacity()`); `lean_times` kill coins x0.75 and deploy cost x1.15.

## Boss phases
- `BOSS_PHASES[bossId] = [{ at, id, text, ...params }]`. When the boss health fraction is at or below `at`, effect `id` fires once (list sorted by `at` descending, equal `at` fire in list order; a big hit can fire several in one tick). `id` is a key of `BOSS_PHASE_EFFECTS` (`{ id, name, desc, defaults }`). Params in the entry override the defaults.
- Effects (implemented in `Run.bossPhaseFx`): `dark_lane` (`dur`, `cols`: turrets in a column band around the boss cannot target, `t.dark`), `steal_turret` (`dur`: a random non-aura turret is borrowed, `t.stolen`; it returns with `{ k: 'turretReturn', id, x, y }`), `summon_wave` (`n`, `hpMul`), `bulwark` (`frac` of max health as a shield that absorbs hits), `enrage` (`speed` multiplier, stacks), `heal_pulse` (`frac`, `radius`, `allyFrac`), `jam_pulse` (`radius`, `dur`, `max`).
- Event `{ k: 'bossPhase', boss: bossType, id: effectId, text, bossId: entityId, x, y, phase: n, lane?, cols?, turretId?, turretIds?, n?, shield?, dur? }`. The older `{ k: 'bossphase', id, phase }` for Mr. Playback still exists.
- `run.bossInfo(entityId?)` -> `{ id, type, hpFrac, phase, phases, nextAt, shieldFrac }` for the first living boss, or `null`. `phase` is 1 based (fired count + 1), `nextAt` is the next threshold or `null`.
- The small wave 10 boss only gets its first phase.
- Extra tricks (data): `BOSS_TRICKS[bossId] = { weakFrac, weakMul }` (Low-Pass Tide: hits under 0.2% of its max health do 40%), `BOSS_PULSES[bossId] = { every, n, dur }` (Dr. Dead Air mutes the nearest turrets every 9 s).
- ADDING A BOSS: add it to `BOSSES` in data_core.js (and the world's `boss` / `boss10`), then add a `BOSS_PHASES[id]` entry in data_depth.js using effect ids. No sim.js change. A boss without an entry (or an entry with an unknown effect id) is safe: nothing fires. Add it to `RUSH_BOSSES` in sim.js if it should be in Boss Rush (endless rotation reuses the same list), plus a line in `BOSS_TIPS`.
- Bosses: compressor (bulwark, enrage), noisegate (summon_wave, dark_lane, enrage), reverb (dark_lane, summon_wave, heal_pulse), djglitch (steal_turret, jam_pulse, enrage), playback (jam_pulse, bulwark, steal_turret, on top of its own 3 phases), lowpass (dark_lane, summon_wave, bulwark, enrage), silence (jam_pulse at 100%, steal_turret + dark_lane, summon_wave + heal_pulse + bulwark, enrage).

## 25 wave stages, Boss Rush, endless
- `genWave`: when a world has `wavesTotal` 25 (beach, moon) wave 10 is `boss10` (small), wave 20 is `boss10` at 75% scale and wave 25 is the world's final boss at full size. 20 wave stages are unchanged. Custom `wavesTotal` (Weekly 25 waves on a 20 wave stage) keeps the old rules.
- `waveBaseHp`: full growth `ECON.hpGrowth` runs through `max(20, world.wavesTotal)`, then `hpGrowthLate`.
- Boss Rush (10 waves) cycles `RUSH_BOSSES` (7 bosses, so all seven appear). The endless boss rotation (every 10 waves) uses the same 7.

## Endless milestones
- `ENDLESS_MILESTONES = [{ wave, id, name, reward: { diamonds, cosmetic? } }]` for waves 25, 50, 100 (`endless_25`, `endless_50`, `endless_100`).
- Event `{ k: 'milestone', id, wave, reward }` the first time a wave start reaches each one in an endless run (`run.milestones` lists the earned ids, saved in the snapshot, also `result.milestones`). The sim pays nothing: meta.js pays `reward`.

## Endless themed waves (round 4)
- In endless mode every wave with `w % 10 === 5` from wave 15 (15, 25, 35, ...) is a themed wave, never a boss wave and never in story, daily or rush. `ENDLESS_THEMES` (data_depth.js): swarm, armored_parade, zip_rush, echo_chamber, heal_party, gold_rush, each `{ id, name, desc, glyph, good, theme: true, wm, types?, support?, supportFrac? }`.
- `endlessThemeFor(seed, w)` (sim.js) is pure: the six themes come in a seeded shuffle, each once per six themed waves.
- The theme IS the wave mod: `spec.mod === spec.theme === theme.id`, `nextWavePreview().mod` and `currentWaveInfo().mod` are `{ id, name, desc, theme: true }`, `run.wmId` is the id, and the `wave` event carries `mod` and `theme`. The themes are registered in `WAVE_MODS` (same objects) so every id lookup finds them, but `genWave` never picks them as a random mod. `wm` keys: `count` (genWave group size), `hp`, `coin`, and `echoSplit` (2: a mini born from an Echo splits once more, `enemy.gen` 1 then 2, capped at 160 enemies alive).
- `run.themedWaves = [{ wave, id }]` (snapshot-safe) and `result.recap.themes = [{ wave, id, name }]`. After `Run.restore` a wave in progress rebuilds `curSpec` from `upcoming(wave)`, so `currentWaveInfo()` works after a resume.
