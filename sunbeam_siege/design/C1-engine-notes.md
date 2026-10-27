# C1 battle engine notes

Files: `src/engine/util.js`, `content.js`, `registry.js`, `card-inst.js`, `battle.js`, `battle-ai.js`. Tests: `node tests/run-tests.js [--verbose] [--quick]`, `node tests/coverage.js [--list]`.

## Adding content support from another file

Load your file after `registry.js` and before `battle.js` (or after both, registries are plain objects). Every registry has `register(name, fn_or_def, meta)`, `alias(newName, oldName)`, `has`, `get`, `meta`, `names`.

- `SB.engine.ops.register('myOp', function (ctx, e, B) {...})`. `e` is the effect object from data, `ctx` has `self`, `subject`, `src`, `floor`, `choice` (chosen pest, cat or floor), `B` is the Battle. Use `B.damage`, `B.addStatus`, `B.heal`, `B.addFluff`, `B.spawnPest`, `B.fire(name, data)` and `B.emit(type, data)`.
- `SB.engine.triggers.register('onFoo', { scope: 'self'|'any'|'global'|'floor'|'notSelf' })`; fire with `B.fire('onFoo', {subject})`. Own-unit triggers: `B.fireOwn(unit, 'onFoo', data)`.
- `SB.engine.checks.register('name', function (ctx, e, B) { return bool })`, counters (`counters.register('name', fn)`), targets (`targets.register('name', function (ctx, e, B) { return [units] })`).
- `SB.engine.statuses.register('id', { max, debuff, dusk(unit, B), onApply, ... })`.
- Pest AI: `SB.engine.ai.specials.myOp = function (B, pest, action) {}` for `{kind:'special', op:'myOp'}`; pest passives go in `SB.engine.passives`.
- An unregistered name never crashes. It warns once (`SB.util.warnings`), does nothing, and shows up in `SB.content.validate()`.

## Rules worth knowing

- Floors are 0-based in engine state and events (0 Cellar, 1 Parlor, 2 Attic). Data files (waves, summons, tutorial setup) are 1-based and converted at the edge.
- One mulberry32 stream seeded from `opts.seed` (a string seed is hashed). No Math.random. Same seed and same inputs give the same event log.
- Trigger queue is FIFO. Order: relics, passives, rooms, cats, pests. `B.fireNow` is only for `prevent` style checks.
- Dusk order: wet, dizzy, scared, frazzled, yarn, hiss, hairball, purr, rested, rage, then any other status with a `dusk` handler.
- Lethal hit on a cat: one Life spent on the run instance, card to discard (or hand with Reborn). Last Life: exhausted and pushed to `state.lost`.
- Scripted hands: `opts.hands[round-1]` or `enc.rounds[n].hand` when `enc.scripted`, a list of card ids pulled to the top of the draw pile.
- `enc.rules.noPile` turns off Cuddle Pile (the A02 worked example ignores Snug, the tests set it).
- Parasites leave the floor into `state.attached`. `B.scratchOff(hostCatUid)` pays the Zoomies (`useAbility(uid,'scratch')` is the same). Cleanse and Purr aura 10 also remove them. They count for the win check.

## State, events, result

State follows API.md, plus `state.attached`, `state.lost`, `state.clock` and `state.nip`. Events carry `type` and `seq`; the types are those in API.md plus `lifeSpent`, `attach`, `shuffle`, `crash`, `room`. `B.result()` returns `{outcome, warmth, growth, stats:{plays:{instUid:n}, warmthEnd, round, killedBy,...}, loot, lost, killedBy, rounds}`. `B.serialize()` and `SB.battle.restore(run, snap)` round trip the full state and rng.

## Known gaps

Unsupported ops: inhale, swallow, spit, trap, tickTrapTimers, damagePctMax, floodByLevel. Unsupported boss passives: burst_pipe, pressure, overheat, bag, parry, soaked, weight, appointment, skitter, fixate, evaporate, sunrise, final_flush, tap. These belong to Act 2 and 3 bosses (Vacuum MK9, Vet Carrier, Red Dot, Great Bath, Garden Hose, Spray Duelist). The Dawn phase that arms `winIf dawnRounds` has no trigger yet. Several elite passives are descriptive only (the `text` passives).
