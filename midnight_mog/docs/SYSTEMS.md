# Midnight Mog: Content and Combat Systems

Owner: content designer. Source of truth for the effect vocabulary. Machine-checked by `js/data/validate.js` (`validateAll()`); if a kind or key is not listed here and in `EFFECT_SPEC`, the sim does not need to support it. All data lives in `js/data/*.js`; this file explains how to interpret it.

## 1. Content at a glance
| Content | Count | File |
|---|---|---|
| Cats | 32 (12 common, 9 rare, 6 epic, 3 legend, 2 mythic) over 6 roles | `cats.js` |
| Enemies | 34 (28 regular, 6 bosses), 12 traits | `enemies.js` |
| Cards | 68 (32 summon, 20 spell, 8 trap, 8 build), cost 0 to 5 | `cards.js` |
| Relics | 27 (6 common, 10 rare, 6 epic, 3 legend, 2 mythic) | `relics.js` |
| Districts | 6 (60 stages) plus endless mode from stage 61 | `districts.js` |

Exports: `CATS, CAT_BY_ID, CAT_ROLES, RARITIES` ; `ENEMIES, ENEMY_BY_ID, BOSSES` ; `CARDS, CARD_BY_ID, STARTER_DECK` ; `RELICS, RELIC_BY_ID` ; `DISTRICTS, DISTRICT_BY_ID, LAST_STAGE, ENDLESS, ELITE_AFFIXES, districtForStage(stage), waveCount(stage)` ; `validate.js`: all vocab arrays, `EFFECT_SPEC, EFFECT_KINDS, validateEffect, validateAll`.

## 2. Battlefield units
- Tile grid; **range, radius, tiles are in tile units**. `speed` is tiles per second, `rate` is attacks per second, durations in seconds, cooldowns in seconds (time is sim time, fixed dt 1/30).
- Cats with `speed 0` hold the tile where they were placed. Cats with `speed > 0` (brawlers, tanks) advance toward the nearest enemy within 3 tiles and return to their tile when none is near.
- Enemies walk the lane toward the base, attack the nearest cat or barricade in `range` (default 1), else the base. `flying` enemies ignore barricades and ground traps and can only be hit by units with range >= 2 or by `aoe`, `chain`, `pierce`, and any spell.
- `Cat.base.dmg` is damage per basic attack. Level `L` stats: `base + perLevel * (L - 1)`, then multiplied by star and relic modifiers (economy.js owns the curves).
- Basic attacks are auto. The cat **ability** triggers when its cooldown completes and a valid target exists (support abilities fire when any ally is hurt or the effect has no target need). First cast at `cooldown * 0.5`.

## 3. The effect vocabulary
An effect is a plain object `{ kind, ...params }`. Kinds below are the full closed set (`EFFECT_KINDS`). Used by cat abilities (`ability.effect`), cards (`card.effect`), enemy abilities and boss phases, traps, auras, relics (`on_event.effect`).

### 3.1 Perspective, selectors (`to`) and placement (`at`)
All selectors are from the **caster's side**: for a cat, `nearest` means nearest enemy; for an enemy, nearest cat. Heal, shield, buff, cleanse, revive, energy target the caster's own side. Debuff, damage, stun, dot, knockback, pull, execute target the opposing side.

`to` values (`SELECTORS`): `self`, `target` (the thing the card was aimed at, or the attack target for abilities, or the trap trigger enemy), `nearest`, `farthest`, `strongest` (highest current HP), `weakest` (lowest current HP), `lowest_ally` (lowest HP ratio on own side, may be self), `random` (use `n`, default 1, seeded rng), `all`, `radius` (all units of the right side within `radius` tiles of `at`), `base`.
`n`: count for `random`, `strongest`, `weakest` (default 1).
`at` (`PLACEMENTS`) for `radius`, `aoe`, `trap`, `pull`: `self` (default for abilities), `target` (default for cards), `nearest`, `strongest`, `lane_ahead` (a tile 2 to 3 tiles in front of the caster), `edge` (where enemies enter, for `spawn_enemies`).
Card top level `target` (`CARD_TARGETS`): `none` (cast immediately), `tile` (player taps a tile), `enemy` (player taps an enemy), `lane` (player taps a lane). A tile or enemy tap becomes `target` and `at: target`.

### 3.2 Common params
- `element`: `phys` (default), `fire`, `elec`, `shadow`, `holy`, `poison`, `void`. Used for VFX colour, immunities later, and relic synergy tags. For `dot` also `bleed`.
- `crit`: `'always'` | `'never'`; omitted means normal crit roll (`damage`, `pierce`).
- Amounts: either `mult` (multiplier of the **source unit's current damage stat**) or `amount` (flat reference amount). `pct` on heal/shield/dps means fraction of the **target's** max HP (heal, shield) ; on buff/debuff it is a multiplicative change (0.4 means +40% / -40%).
- Flat `amount` and `dps` on **cards and relics** are scaled by the sim: `amount * spellPower(cardLevel) * refScale(stage)` where `spellPower = 1 + 0.12 * (level - 1)` times the `spell_power` relic modifier, and `refScale(stage)` tracks enemy HP scaling (sim picks the curve, suggested `stageScaling.hp ^ 0.75`). This keeps a level 1 Pounce relevant at stage 40.
- `dps` on cat abilities (e.g. `0.5`) is a **fraction of the source's damage stat per second** when below 5, otherwise flat reference dps as above. (Rule used in data: cat abilities use fractions, cards use flat numbers like 45.)

### 3.3 Kinds and parameters
| kind | required | optional | meaning |
|---|---|---|---|
| `damage` | `amount` or `mult` | `to`, `n`, `element`, `crit` | Hit selected targets once. |
| `chain` | `jumps`, `amount` or `mult` | `falloff` (damage lost per jump, 0..1), `range` (tiles between hops, default 2), `element` | Hit target (default nearest), then hop to the closest unhit enemy within `range`, `jumps` times. Never hits one unit twice. `chain_jumps` relic stat adds jumps. |
| `pierce` | `amount` or `mult` | `count` (targets, 99 = whole lane), `element`, `crit` | Projectile through enemies in the caster's lane in front of it. Card use: lane of the target. |
| `aoe` | `radius`, `amount` or `mult` | `at`, `element` | Damage every enemy within `radius` of `at`. |
| `heal` | `amount` or `pct` | `to` (default `self`), `radius`, `n` | Restore HP. `to: base` heals the base (pct of base max). |
| `shield` | `duration`, `amount` or `pct` | `to`, `radius` | Absorb damage; expires after `duration` (0 = until the battle ends). |
| `buff` | `stat`, `pct`, `duration` | `to`, `radius` | Stat from `BUFF_STATS`: `dmg rate speed range hp armor crit critdmg lifesteal regen`. Refreshing does not stack past +100% per stat. |
| `debuff` | `stat`, `pct`, `duration` | `to`, `radius` | Stat from `DEBUFF_STATS`: `dmg rate speed armor vuln`. `vuln` = takes that much extra damage. Armor is reduced by `pct` of its value. |
| `stun` | `duration` | `to`, `n`, `radius` | Target cannot move, attack or cast. Bosses take 50% duration. |
| `dot` | `dps`, `duration` | `to`, `radius`, `element` (`fire poison bleed` ...) | Damage over time, ticks each 0.5s. Same element and source refreshes instead of stacking. |
| `taunt` | `radius`, `duration` | | Enemies within `radius` of the caster must target the caster. |
| `reflect` | `pct`, `duration` | | Caster returns `pct` of damage taken to the attacker (melee and ranged). |
| `knockback` | `tiles` | `to`, `radius`, `at` | Push enemies back along the lane. Bosses move half. |
| `pull` | `tiles` | `to`, `radius`, `at` | Move targets toward `at` (or toward the caster). Ignored by `flying` enemies only when `tiles` < 1. |
| `execute` | `threshold` | `to`, `bossAmount` | Kill a non-boss target below `threshold` of max HP. Bosses and others take `bossAmount` damage instead (default none). |
| `cleanse` | | `to`, `radius` | Remove stun, dot and debuffs. |
| `revive` | `n`, `hpPct` | | Bring back up to `n` fallen cats (most recent first) on their old tile at `hpPct` max HP. |
| `energy` | `amount` | | Add energy (capped by energy cap). |
| `draw` | `count` | | Draw cards from the draw pile (reshuffle discard when empty). |
| `spawn` | `minion`, `count` | | Create temporary friendly units. `minion = {name, hp, dmg, range, rate, duration, taunt?}`. Not cats, give no loot, vanish at `duration`. Placed adjacent to the caster. |
| `summon` | `cat` | `level` | Place a cat from the roster (only in `summon` cards). Level comes from the profile. |
| `spawn_enemies` | `enemy`, `count` | `at` (default `edge`) | Bosses and phases: spawn enemies, staggered 0.3s apart. |
| `trap` | `charges`, `radius`, `effect` | `at`, `count` (number of placements, default 1), `duration` (expires, default 60) | A hidden tile effect. When an enemy enters the tile (or within `radius`) the nested `effect` fires with that enemy as `target` and one charge is spent. Removed at 0 charges. `trap_charges_add` adds charges. Flying enemies do not trigger traps unless the nested effect uses `aoe` with `radius >= 1.5` (then it triggers when they pass over). |
| `barricade` | `hp` | `duration` | A tile blocker that enemies must destroy; units behind it are unreachable by melee. |
| `aura` | `radius`, `interval`, `duration`, `effect` | | Ticking field at the chosen tile (or base if card target `none`). Every `interval` seconds applies nested `effect` with `to: radius`. `duration 0` = until battle end or the occupying tile is vacated. |
| `battle_rule` | `rule`, `value` | | Change a battle-wide value (see rules). |
| `reward_mult` | `resource`, `pct` or `flat` | | Battle reward bonus. `pct` multiplies the battle's `fish`/`yarn`; `flat` (inside `on_event`) adds that much when it fires. |
| `reset_cooldown` | | `to` (self) | Cooldown of the caster's ability goes to 0. |
| `multi` | `steps` | | Run steps in order. A step may not itself be `multi`. All share the same target context. |

Enemy `ability` and boss `phases[i].effect` use the same kinds, e.g. `pull`, `stun`, `spawn_enemies`.

### 3.4 Rules (`RULES`)
Used by `battle_rule` (battle scope) and relic `rule` (run scope):
`start_energy_add`, `energy_cap_add`, `energy_regen_mult` (multiply regen), `energy_regen_add` (energy per second), `hand_size_add`, `first_card_free` (first card each battle costs 0), `spell_echo` (value = chance a spell casts twice), `ability_echo` (value = chance a cat ability casts twice), `trap_charges_add`, `buff_duration_mult`, `base_revive_once` (value = base HP fraction after surviving lethal), `cat_revive_once` (value = HP fraction), `base_hp_pct` (base max HP + value), `reward_pct`.

## 4. Enemies
`Enemy = { id, name, tier, base:{hp,dmg,speed,reward}, traits, flying, boss }` plus: `district`, `range` (default 1), `rate` (attacks per second, default 1), `size` (draw scale), `params`, `ability`, `phases`, `desc`. `tier` equals district order (1..6). `reward` is base fish, scaled by stage.

Traits (`TRAITS`) and their `params` keys (required by the validator):
| trait | params | behaviour |
|---|---|---|
| `swarm` | `group` | Spawns in groups of `group` (1 means a lone piece). Wave budget counts a group as 0.5 per member. |
| `armored` | `armor` (0..1) | Incoming damage x (1 - armor). `debuff armor` reduces it. |
| `flying` | | Over barricades and ground traps, see section 2. |
| `healer` | `pct`, `radius`, `every`, | Every `every` s heals enemies within `radius` for `pct` max HP. Priority target. |
| `splitter` | `into`, `count` | On death spawns `count` of `into` at its position. |
| `shielded` | `shield`, `regen` | Starts with a shield of `shield`, regenerates `regen` per second when not hit for 3s. |
| `burrower` | `every`, `duration`, `emergeAoe:{radius,mult}` | Every `every` s goes underground for `duration` (untargetable, moves at 1.5x), emerges with an `aoe` of `mult` x its dmg. |
| `ranged` | | Uses `range` tiles, attacks from afar. |
| `fast` | `burstEvery, burstSpeedMult, burstTime` (optional) | Just fast; optional sprint bursts. |
| `summoner` | `enemy`, `every`, `count` | Spawns `count` of `enemy` every `every` s (not while stunned). |
| `explosive` | `radius`, `mult`, `on` (`contact` or `death`) | Explodes (an `aoe` of `mult` x dmg) when reaching a cat or when it dies. |
| `boss` | | 2x scale, immune to knockback > half, stun x0.5, no splitter or swarm cap. |

**Bosses** (one per district, stage 10/20/30/40/50/60): `phases` is a list ordered by descending `at` (fraction of max HP). The first phase has `at: 1.0` and is the opening state (text only). When HP first drops to or below `at`, run `phase.effect` once (any effect kind) and apply `phase.mods` permanently: `speedMult`, `dmgMult`, `armorAdd`. Announce phase `name` with a `wave` event. Boss HP is the base value scaled by stage like others.

Bosses: `king_coo` (summoner flock, 3 phases), `rat_emperor` (shielded court, heal and shaman call, stampede), `gator_mayor` (death roll, armor shed), `dot_overlord` (flying, mass stun), `hoovermatron_prime` (mass pull and slam), `bathtub_kraken` (4 phases: ink cloud damage debuff, whirlpool pull, soap flood).

## 5. Cats
`Cat = { id, name, role, rarity, tags, base:{hp,dmg,range,rate,speed}, perLevel:{hp,dmg}, ability:{id,cooldown,name,text,effect}, flavor }`. The contract shape plus `name`, `text` and the `effect` on the ability so the sim can interpret it.

| Role | Identity | Cats |
|---|---|---|
| brawler | melee, mobile, frontline damage | scrap_tabby, biscuit_bruiser (taunt), ember_mog, rooftop_rascal, kaz_kung_fu, big_mama_maine |
| archer | long range, single lane, pierce, crit | whisker_scout, calico_dart, duchess_noir, nyx_longshot, lord_lunar_lynx |
| mage | area, chain, debuffs | spark_kit, fizz_mog, storm_whisker, hex_hisser, tuxedo_tempest, empress_whiskerwind |
| support | heal, energy, buffs, revive | nurse_purrnell, bell_kitten, moonbeam_medic, captain_catnip, mother_of_nine_lives |
| trapper | snares, mines, decoys, singularity | snare_stray, tack_tabby, tripwire_tabitha, gizmo_gato, madame_mousetrap, cheshire_void |
| tank | HP wall, taunt, reflect, shields | tin_can_tom (reflect), cushion_cat (shield), sir_purrcival, baron_von_fluff |

Rarity power guide (hp x, dmg x vs common of same role): rare 1.6, epic 2.6, legend 5, mythic 8. Summon card cost: common 1 (some 2), rare 2, epic 3 (tank 4), legend 4, mythic 5.

## 6. Cards
`Card = { id, name, cost, type, rarity, text, effect }`, `effect.target` is required. Summon cards are generated one per cat with id `call_<catId>`; **adding a cat requires its summon card** (the validator checks). Non-summon cards are listed in `cards.js` ; trap cards use `kind: 'trap'`; build cards place structures or change battle rules (`barricade`, `aura`, `battle_rule`, `reward_mult`). `STARTER_DECK` is the 12 card tutorial deck. Spells that matter: Catnip Surge, Hairball Barrage, Midnight Howl (stun and buff), Meteor of Yarn, Second Wind (revive), Scratch Post Slam (legend), Starfall Purrade (mythic).

## 7. Relics
`Relic = { id, name, rarity, tags, synergy, text, effect, flavor }`. `effect.kind` (`RELIC_KINDS`):
- `stat_mod`: `{scope, stat, mult | add}`. `scope`: `all_cats`, `role:<role>`, `tag:<tag>`, `rarity:<r>`, `cards`, `economy`, `enemies`, `base`, `self` (affix/elite), `trait:<trait>` (enemies). `stat` in `MOD_STATS` (`dmg hp rate range speed crit critdmg lifesteal armor regen cooldown reflect chain_jumps spell_power cost_add fish yarn xp drop_rate`). `mult` multiplies (default 1), `add` adds. `cooldown` below 1 shortens ability cooldown.
- `on_event`: `{trigger, filter?:{role?,tag?,cardType?}, chance?, cooldown?, effect}`. `trigger` in `TRIGGERS`: `on_kill, on_hit, on_crit, on_cast, on_summon, on_play_card, on_wave_start, on_battle_start, on_base_hit, on_ally_death`. For `on_event`, `effect` is any combat effect; `to: target` is the event subject (killed enemy, hit enemy, summoned cat) and `to: all`, `self` is the relic owner side. Roll `chance` with the battle rng.
- `rule`: `{rule, value}` using section 3.4.
- `multi_mod`: `{steps:[stat_mod | on_event | rule]}` several of the above at once.

Build-defining sets (synergy tags): **Fire** (ember_locket, fizz_mog, ember_mog), **Electric** (tesla_whisker, chain_reaction_collar, storm_whisker, tuxedo_tempest), **Trap** (trapper_toolbelt, infinite_yarn), **Spell** (hairball_amulet, moonstone_prism, tin_whistle), **Tank** (bulwark_bowl, warm_sock, baron_von_fluff), **Royal** (stray_crown, midnight_crown, sir_purrcival, duchess_noir), **Mech** (overclock_battery, tin_can_tom, gizmo_gato), **Neon** (glow_stick, spark_kit, storm_whisker).

## 8. Districts and endless mode
| # | id | stages | boss (stage) | enemies |
|---|---|---|---|---|
| 1 | rooftop_row | 1 to 10 | king_coo (10) | pigeon_scout, gutter_gull, pigeon_bomber, antenna_raven |
| 2 | alley_alamo | 11 to 20 | rat_emperor (20) | rat_courier, dumpster_raccoon, stray_mutt, rat_shaman |
| 3 | sewer_sprawl | 21 to 30 | gator_mayor (30) | sludge_blob, sewer_gator, mud_mole, toxic_toad |
| 4 | laser_lights | 31 to 40 | dot_overlord (40) | red_dot_drone, glitch_bug, strobe_sentry, arcade_clanker |
| 5 | appliance_heights | 41 to 50 | hoovermatron_prime (50) | roomba_rover, toaster_turret, vacuum_mech, microwave_medic |
| 6 | bathtub_bay | 51 to 60 | bathtub_kraken (60) | rubber_duck_raider, soap_slimer, plunger_crab, faucet_eel |

Fields: `palette` (PAL role names, not hex), `enemyPool [{id, weight, from}]` (`from` = first stage within the district it can appear, 1..10), `waves {base, perStages, max}`, `modifier {text, effect}` (a district-wide `stat_mod`, applied to the battle). Spawn-only enemies (`sludge_glob`, `glitch_byte`, `soap_bubble`, `kraken_tentacle`) come from splits and bosses, they are not in pools.

Helpers: `districtForStage(stage)` returns `{district, stageInDistrict, round, endless, isBoss, loopedStage}`; `waveCount(stage)` = `min(max, base + floor((stageInDistrict - 1) / perStages))` (+1 boss wave appended by progression for boss stages).

**Endless mode** (`ENDLESS`): stage 61 onward replays the six districts in order, 10 stages each, forever; a **round** is 60 stages. Boss stages replay the district boss as an elite. Elite affixes (`ELITE_AFFIXES`: swift, plated, regenerating, volatile, warded, vampiric) roll with `eliteChance(stageInRound)`; bosses always get `affixesByRound(round)` affixes (1 in round 0, up to 4). Scaling hints for `progression.stageScaling` (it is the authority): per stage past 60 hp x1.045, dmg x1.03, reward x1.025, and each new round multiplies hp by 1.5 and dmg by 1.25 on top. Wave cap 12.

## 9. Balance notes for the sim authors
- Time to kill target: a level-appropriate team kills a basic enemy in 1 to 2s; an armored one in 3 to 4s; a boss in 60 to 90s.
- Energy: start 3, regen 0.5 per second (`deck.energyRegen`), cap 10 by default. Cost 0 cards (`cat_nap`, `tail_flick`) and `catnip_stash` (cost 1, gain 4) exhaust: once per battle each copy, because the hand refills after every play and a repeatable free or energy positive card is an infinite loop in zero time (docs/EXPLOIT_REPORT.md B2).
- Cheapest strong combos to keep an eye on (bot test): `infinite_yarn` + `catnip_stash`, `moonstone_prism` + `starfall_purrade`, `bulwark_bowl` + `baron_von_fluff` reflect, `tesla_whisker` + `empress_whiskerwind`.
- Contract additions: extra fields on Cat.ability (`name`, `text`, `effect`), Enemy (`district`, `range`, `rate`, `size`, `params`, `ability`, `phases`, `desc`), and Relic/District shapes (defined here).

## 10. Town and Meta
Owner: town and meta designer. Files: `js/data/buildings.js` (16 buildings, grid, adjacency, check-in loop helpers) and `js/data/quests.js` (daily, weekly, achievements, cat collection). Both are pure; `town.js` and the quest UI must call their helpers instead of re-deriving anything. Self checks: `validateBuildings()` and `validateQuests()` return `[]` when healthy.

### 10.1 Profile fields this adds
```
town   = { plots:[{b, level, t, opt?}|{}], keys:{[crateId]:int}, xp:int, streak:{days,last}, visitor:{slot,claimed}, mapsCleared:{[mapId]:dayIndex} }
quests = { v:1, daily:{day,quests:[Quest],bonus:{reward,claimed}}|null, weekly:{week,quests,bonus}|null, ach:{[familyId]:claimedCount}, col:{[entryId]:true} }
Quest  = { id, tpl, metric, text, target, base, reward, claimed }
stats  += battlesWon bossKills kills cardsPlayed spellsCast summons perfectWins fastWins cratesOpened collects upgrades catLevelUps fishEarned  (quests.COUNTER_KEYS; missing = 0)
```
`plots[i]` is the i-th owned plot; an empty owned plot is `{}` (or `{b:null}`). `t` is the last collect time in ms (as `economy`/`offline` use). `opt` only for the Catnip Garden: `{district:<districtId>, strain:'dmg'|'rate'|'hp'}`, check with `validateOpt(def, opt)`. Crate keys are spent by `loot.openCrate` instead of currency (loot author: one key = one open of that crate, pity still counts).

### 10.2 The 16 buildings
Every def: `{id, name, glyph, tags, unlockStage, limit, costMult, buildMult, buildExtra?, keep, storage?, choices?, effects:[spec], receives:[rule], table}`. `unlockStage` is the best global stage needed to build. `limit` is how many may stand at once. `table` is the precomputed effect table at `TABLE_LEVELS` (1 to 12, then 15, 20, 25, 30, 40, 50, 60, 80), potency 1.

| id | tags | stage | limit | effects (level 1 -> level 25 -> level 80) |
|---|---|---|---|---|
| tuna_cannery | food noisy | 1 | 4 | fish/s 0.45 -> 54 -> 5735 |
| yarn_mill | craft noisy | 3 | 4 | yarn/s 0.06 -> 7.3 -> 765 |
| scratching_post | martial | 5 | 2 | xp/s 0.04, cat level discount up to 25% |
| crate_workshop | craft noisy | 8 | 1 | keys/day 0.25 -> 4, pity credit up to 30 pulls |
| barracks | martial | 10 | 1 | +1 deck slot per 8 levels, card level discount up to 25% |
| nap_dome | cozy | 12 | 1 | offline cap +0.5h per level (softcap at 16h), offline efficiency up to +20% |
| laser_arcade | noisy neon | 14 | 1 | energy regen up to +30%, start energy +1 per 15 levels (max +3) |
| smokehouse | food | 15 | 2 | fish/s 0.2 (about 0.44x cannery), battle fish up to +35% |
| kitty_bank | money | 18 | 1 | storage +15m per level (softcap 12h), streak grace +1 day per 20 levels (max 3) |
| vet_clinic | martial cozy | 20 | 1 | base hp up to +50%, base regen up to 1% max hp/s |
| gem_mine | money noisy sewer | 21 | 2 | gems/h 0.12 -> 2.7 -> 12 (x1.25 per 25 levels), costs 25 gems to build |
| catnip_garden | cozy food | 25 | 3 | chosen district: chosen stat up to +30% (x0.3 elsewhere) |
| clock_tower | arcane | 30 | 1 | visitor interval cut up to 50%, all town output up to +25% |
| shrine_nine_lives | arcane | 30 | 1 | shard bonus +2% per level (softcap 100%), echo fraction up to +0.2, kept levels up to +0.5, 100 gems to build |
| observatory | arcane | 35 | 1 | maps: 1 at level 1, +1 per 6 levels, map rewards up to +100%, 50 gems to build |
| radio_tower | noisy neon | 40 | 1 | battle yarn up to +35%, loot drop chance up to +15% |

Stat vocabulary is `STATS` in buildings.js (name, unit, who consumes it). Value shapes (`shape()`): `prod` = `a * L * 1.05^(L-1) * mile^floor(L/25)` (mile 1.5, mirrors `economy.buildingOutput` plus a milestone), `pow`, `lin` (softened above `cap` by `cap*(v/cap)^exp`), `sat` = `cap * L/(L+half)` (bounded forever), `step`. `hardMax` clamps after potency; `int` floors. Always get values through `statValue(spec, level, potency)`, `statsAt(def, level, potency)` or `outputPerSecond(def, level, potency)` (returns per second `{fish, yarn, xp, gems}`; gems are stored per hour and converted).

### 10.3 Costs hook into economy.js
- First build: `buildCost(def, economy.cost)` = `{fish: ceil(cost('building_level', 0) * buildMult), gems: buildExtra.gems}` (cannery 90 fish, shrine 7200 fish + 100 gems).
- Upgrade L to L+1 (L >= 1): `upgradeCost(def, L, economy.cost)` = `ceil(cost('building_level', L) * costMult)`; economy only prices up to level 80, so from L 80 on it continues as `cost(79) * 1.12^(L-79) * costMult`, clamped to 1e15. Cannery: L1 108, L10 558, L25 8,586, L50 2,173,156, L80 1.98e9.
- Pay the upgrade in fish. Treat a cost of 1e15 as "maxed for now".
- Plots: you start with `START_PLOTS` (4). `plotUnlock(n, economy.cost)` gives `{fish, needStage, plotIndex}` for the n-th purchase (n from 0): fish = `cost('unlock_slot', n)` (600 -> 4.2e8 for n 0 to 11), then x2.6 per extra plot forever; `needStage = 3 + 5n` best global stage. Plot count never ends.
- `economy.townOutput`/`buildingKind` currently treat every plot as a fish producer. It must instead count only `PRODUCERS` (cannery, mill, post, smokehouse, gem mine) through `outputPerSecond`. This is a required change for the economy author.

### 10.4 Tiers (endless buildings)
`tierOf(level) = 1 + floor((level-1)/20)`. `tierName(def, level)` prefixes Alley, Rooftop, Neon, Midnight, Mythic, Cosmic, Eternal, then "Eternal II", "Eternal III", and so on. Tier-ups are visual and ceremonial; the power comes from the formulas, which keep going at any level, so buildings never cap.

### 10.5 The plot grid and adjacency puzzle
- Grid width is 5. `plotCoord(i)` returns `{x,y}`: the first 25 plots spread from the centre (distance order: centre, then up, left, right, down, then diagonals ...), and from plot 26 rows of 5 are appended below forever. `makeGrid(count)` returns `{coords, at(x,y)}`.
- Each building has `receives` rules (from its own point of view): `{name, src, mode, add, cap, complete?, completeBonus?}`. `src` is `any`, `empty` (owned plot, nothing on it), `void` (no plot there: open sky), `id:<buildingId>` or `tag:<tag>`. `mode` is `4` (orthogonal), `8`, `row`, `col` (up to 4 away), `cross3` (3 away along both axes). Each matching cell adds `add` (negative is a penalty), the rule is limited to `cap` in absolute value, and a `complete` rule adds `completeBonus` when every cell of the mode matches (the Nine Cell Shrine ring needs 8 neighbours).
- `adjacency(plots, index)` returns `{potency, bonus, parts:[{name,count,value}]}` where `potency = 1 + softened positives + max(-0.6, negatives)`; positives above +1 are softened with exponent 0.5. Potency multiplies production and every effect stat, except stats with `noPotency` (deck slots, start energy, maps unlocked, streak grace). Recompute it whenever a plot is built, moved, upgraded or unlocked. Moving buildings is up to the town.js author.
- Design intent: noisy buildings (cannery, mill, mine, workshop, arcade, radio) hurt the quiet ones (nap dome, garden, vet, observatory, shrine), so the quiet ones want an edge or a gap; the observatory wants open sky (`void`), so the outer ring of the grid is valuable until you expand; food, craft, martial, cozy, arcane and money clusters each have a synergy.

### 10.6 The collect and check-in loop
- Each producing plot stores output for `economy.townStorageSeconds(profile) + storageSecondsAdd` (times `def.storage` if set, gem mine 1.5). Pending = `perSec * min(now - t, cap) * clock` where `clock` is `1 + townOutputPct`. Production beyond the cap is lost, so a visit every few hours matters.
- `collect(profile, nowMs, dayIndex)` per plot: `batch = pending * fillMult(fill) * (1 + streakBonus(days)) * economy.multipliers(profile).income`, where `fill = min(1, elapsed/cap)`, `fillMult` is x1.10 when the building is at least 90% full (`CHECKIN.fillBonusAt`), and gems are not multiplied by income. Set `t` to now. Collecting the same plot twice in one tick pays nothing.
- First collect on a new `dayIndex`: `advanceStreak(streak, dayIndex, streakGrace)` (kept days when at most `grace` days were missed), and pay a daily tip of `CHECKIN.dailyTipMinutes` (20) minutes of town production. `streakBonus(days) = 0.35 * d/(d+12)`: 10 days +16%, 30 days +25%.
- Visitors: slot = `floor(nowSeconds / visitorSeconds(visitorIntervalCut))` (4h default, 2h minimum). `visitorForSlot(slot, profile.seed, builtIds)` is a deterministic weighted pick (stray trader, yarn peddler, old sage cat, tinker with a key, star gazer with gems, golden stray with 2 hours of fish). Claim it once per slot (`town.visitor = {slot, claimed:true}`). Rewards resolve with `resolveReward(spec, perMinute)` where `perMinute = economy.income(profile).active * 60`.
- Crate Workshop: accumulates `keysPerDay` as a fractional counter, converts whole numbers into `town.keys[keyCrate(level)]` on collect (alley below level 12, neon below 30, rooftop after). Its `pityCredit` pulls are added to the pity counter when the odds and the roll are computed (not stored, never past the hard pity).
- Scratching Post xp: `town.xp` pays cat level costs 1 xp = 1 yarn before yarn is touched.
- Observatory maps: `mapAt(n)` for `n < mapsUnlocked` returns `{id, name, baseDistrict, waves, difficulty, rewardMult, modifier:{text,effect}}`; the battle stage is `max(1, round(bestGlobalStage * difficulty))`, the reward is the replay reward times `rewardMult * (1 + mapRewardPct)`. The first win of a map per `dayIndex` also pays 1 gem (`town.mapsCleared[mapId] = dayIndex`). There are always more maps: after six named maps come "Comet Rift II", "III", and so on (difficulty +3% and reward +10% per map).
- Catnip Garden: in a battle in `opt.district` every cat gets `buffPct` of `opt.strain` (dmg, rate or hp) from each garden; elsewhere 30% of that. Different gardens stack additively.
- Nine Lives (progression author): `keptLevel(def, level, keepAdd)` is the building level that survives a reset (`def.keep` of the level, 1 for the nap dome, barracks, bank, clock tower, shrine, observatory; `keepAdd` from the shrine for the rest). Plot count and `town.keys` always persist. `shardPct` multiplies shards from `economy.nineLivesShards`; `echoAdd` is added to `NINE_LIVES.echoFraction`.
- Battle hooks (battle author): `baseHpPct`, `baseRegenPct`, `energyRegenPct`, `startEnergyAdd`, `battleFishPct`, `battleYarnPct`, `lootLuckPct`. Deck author: `deckSlots` adds to the base deck cap. Economy: `catLevelDiscount` and `cardCostDiscount` multiply `cost('cat_level' / 'card_level')` by `(1 - x)`; `offlineCapHours` adds to `offlineCapSeconds` (total clamp 40h), `offlineEffAdd` to `offlineEfficiency` (clamp 0.8).

### 10.7 Quests
- Everything is deterministic from a day index the caller passes (no real date in the sim): `refreshQuests(quests, dayIndex, profile, {perMinute})` returns a new state; rolls dailies when `daily.day !== dayIndex`, weeklies when `weekly.week !== floor(dayIndex/7)`. Unclaimed old quests vanish on rollover. The seed is `hash32('daily'|'weekly', profile.seed, index)`, so a day always rolls the same quests for the same profile (reload safe).
- Daily: 3 quests (one easy, one mid, one hard, no repeated metric) from 14 templates, plus a bonus `DAILY_BONUS` (3 gems, 1 alley key) when all 3 are claimed. Rewards by class: easy 15 min fish + 2 gems, mid 15 min yarn + 3 gems, hard 25 min fish + 15 min yarn + 4 gems. That is 12 gems per day, inside `REWARD.gemsDailyCapPerDay` (40).
- Weekly: 4 quests (one per class w1 to w4) from 11 templates, rewards 8, 10, 12, 15 gems plus keys, bonus `WEEKLY_BONUS` (20 gems, 1 neon key, 1 token). Total about 66 gems per week.
- Targets scale forever: `target = ceil(base * (1 + growth * log2(1 + bestStage/20)))`; "earn fish" targets are 30 minutes (daily) or 8 hours (weekly) of income, rounded to 2 significant digits.
- Quest `base` is the metric value when it was rolled; progress is `min(target, metric - base)` through `questProgress(inst, profile)`; `questDone`; claim with `resolveReward(inst.reward, perMinute)` and set `claimed`. `bonusReady(block)`.
- Metrics are `METRICS` (13 counters in `profile.stats`, plus derived: bestStage, catsOwned, catsMaxLevel, townLevels, nineLives, totalStars). Sim authors increment the counters: battlesWon, bossKills, kills, cardsPlayed, spellsCast, summons (cats placed), perfectWins (win with base hp never reduced), fastWins (win under 60 sim seconds), cratesOpened, collects, upgrades (building level ups), catLevelUps, fishEarned (all fish income, lifetime).
- Achievements: 10 families (`ACHIEVEMENT_FAMILIES`) x 5 named tiers = 50 entries in `ACHIEVEMENTS` (tier-major ladder), ids `battles_won_1` ... `fish_earned_5`. After tier 5 the ladder never stops: `achievementAt(familyId, n)` gives tier n+1 with a generated name ("Midnight Legend II") and target (x1.8 per tier at most). `quests.ach[familyId]` is the number of claimed tiers; `achievementStatus(profile, quests)` returns what is ready (several tiers can be ready at once). Reward `achievementReward(n)`: gems `3 + 2n`, fish `10(n+1)` minutes, a crate key every third tier (alley, neon from tier 7, rooftop from tier 16, midnight from tier 31), a token every fifth (`1 + floor(n/10)`). The 50 fixed entries pay about 350 gems in total, spread over the whole game.
- Cat collection (`collectionStatus(profile, quests)`): per role 25/50/75/100% owned (3, 5, 8, then 15 gems + neon key), per role "all trained to level 10" (12 gems + 1 token), per rarity "own every" (5, 10, 20, 40, 80 gems, keys for legend and mythic) and "give every one a star", and an endless star gallery (`starGalleryAt(n)`: 3, 5, 9, ... total stars, always shows 3 unclaimed tiers). Claim state is `quests.col[id] = true`. Set bonuses are passive, no claim: `collectionBonuses(profile)` returns `{id, effect}` stat_mods (role set dmg x1.04, role trained hp x1.04, rarity set dmg x1.03 or x1.05 for legend and mythic) for the battle author to apply as relic-style `stat_mod`s.
- New cats added to `cats.js` extend the collection automatically (append only). Entry ids derive from role and rarity names, so they stay stable.

### 10.8 Contract notes for other authors
- Needs from others: economy.js to count only `PRODUCERS` in `townOutput` (see 10.3); loot.js to accept `town.keys` and `pityCredit`; profile.js to add `town.keys/xp/streak/visitor/mapsCleared`, `quests`, and the stats counters; progression.js to call `keptLevel` and use `shardPct`/`echoAdd`; battle.js to read the battle hooks and `collectionBonuses`.
- The data files import `rng.js` (quests only), `cats.js` and each other; they never import sim code. Sim code passes `economy.cost` in.
