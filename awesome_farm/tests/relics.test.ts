// The Relic Satchel: shapes, touching, combos, attunement, and the commands that lay and lift relics.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEM_ORDER, ITEMS } from '../src/shared/data/items';
import { COMBOS, ATTUNE, LINK, TAG_INFO, cellsOf, fits, satchelDims, satchelResult, RELIC_TAGS, type RelicDef } from '../src/shared/data/relics';
import { RECIPE_LIST } from '../src/shared/data/recipes';
import { LOOT_POOL } from '../src/shared/data/loot';
import { modsOf } from '../src/shared/sim/stats';
import { Sim } from '../src/shared/sim/sim';

const def = (it: string): RelicDef | undefined => (ITEMS as Record<string, { relic?: RelicDef }>)[it]?.relic;
const relics = ITEM_ORDER.filter((id) => ITEMS[id].relic);
const grid = { w: 4, h: 3 };

test('every tag has a chip, a shard and a core, a recipe, and a place in the crates', () => {
    for (const tag of RELIC_TAGS) for (const size of ['chip', 'shard', 'core'] as const) {
        const id = `relic_${tag}_${size}`;
        assert.ok(relics.includes(id as never), `${id} exists`);
        assert.ok(RECIPE_LIST.some((r) => r.out === id), `${id} can be made`);
    }
    const crates = JSON.stringify(LOOT_POOL);
    for (const id of relics) assert.ok(crates.includes(`'${id}'`) || crates.includes(`"${id}"`), `${id} is in a crate`);
    assert.equal(COMBOS.length, 10, 'one combo for every pair of tags');
});

test('a shard stands up when turned, a core is a block; relics never overlap or leave the grid', () => {
    assert.deepEqual(cellsOf('shard', 1, 1), [[1, 1], [2, 1]]);
    assert.deepEqual(cellsOf('shard', 1, 1, 1), [[1, 1], [1, 2]]);
    assert.equal(cellsOf('core', 0, 0).length, 4);
    const placed = [{ it: 'relic_ember_core', x: 0, y: 0 }];
    assert.ok(!fits(def, grid, placed, 'relic_frost_chip', 1, 1), 'on top of the core');
    assert.ok(fits(def, grid, placed, 'relic_frost_chip', 2, 0));
    assert.ok(!fits(def, grid, placed, 'relic_frost_chip', 4, 0), 'off the right edge');
    assert.ok(!fits(def, grid, placed, 'relic_frost_shard', 3, 2), 'a shard sticks out');
    assert.ok(!fits(def, grid, placed, 'relic_frost_chip', 0.5, 0), 'whole cells only');
    assert.ok(!fits(def, grid, placed, 'wood', 2, 0), 'a plank is not a relic');
});

test('a relic gives its tag by its size; a neighbour of its kind adds to it; a ring of its kind attunes it', () => {
    const one = satchelResult(def, [{ it: 'relic_ember_chip', x: 0, y: 0 }]);
    assert.equal(one.mods.dmgPct, TAG_INFO.ember.per);
    const two = satchelResult(def, [{ it: 'relic_ember_chip', x: 0, y: 0 }, { it: 'relic_ember_chip', x: 1, y: 0 }]);
    assert.ok(Math.abs(two.mods.dmgPct! - 2 * TAG_INFO.ember.per * (1 + LINK)) < 1e-9, 'each is worth more beside the other');
    const apart = satchelResult(def, [{ it: 'relic_ember_chip', x: 0, y: 0 }, { it: 'relic_ember_chip', x: 2, y: 0 }]);
    assert.ok(Math.abs(apart.mods.dmgPct! - 2 * TAG_INFO.ember.per) < 1e-9, 'apart they are not');
    const core = satchelResult(def, [{ it: 'relic_ember_core', x: 0, y: 0 }]);
    assert.ok(Math.abs(core.mods.dmgPct! - 4 * TAG_INFO.ember.per) < 1e-9, 'a core is four cells of it');
    const ringed = satchelResult(def, [{ it: 'relic_ember_chip', x: 0, y: 0 }], ['ember', 'ember', 'frost']);
    assert.ok(Math.abs(ringed.mods.dmgPct! - TAG_INFO.ember.per * (1 + 2 * ATTUNE)) < 1e-9, 'two ember rings, the frost one does nothing here');
});

test('two touching relics of different tags make their combo, once per pair; touching only at a corner is not touching', () => {
    const r = satchelResult(def, [{ it: 'relic_ember_chip', x: 0, y: 0 }, { it: 'relic_frost_chip', x: 1, y: 0 }]);
    assert.deepEqual(r.combos.map((c) => c.name), ['Steam']);
    assert.ok(r.mods.moveSpeed! > 0);
    const corner = satchelResult(def, [{ it: 'relic_ember_chip', x: 0, y: 0 }, { it: 'relic_frost_chip', x: 1, y: 1 }]);
    assert.equal(corner.combos.length, 0);
    // a core touching two chips makes two combos, and the chips touch each other too
    const three = satchelResult(def, [{ it: 'relic_iron_core', x: 0, y: 0 }, { it: 'relic_frost_chip', x: 2, y: 0 }, { it: 'relic_vine_chip', x: 2, y: 1 }]);
    assert.deepEqual(three.combos.map((c) => c.name).sort(), ['Rime Plate', 'Thornmail', 'Winter Garden']);
    // junk in the list is ignored
    assert.doesNotThrow(() => satchelResult(def, [{ it: 'wood', x: 0, y: 0 }, { it: 'relic_frost_chip', x: 0, y: 0 }]));
});

function farmer () {
    const sim = Sim.create('RELICS', 'b');
    const p = sim.join('a', 'A')!;
    return { sim, p };
}

test('the grid grows with the level', () => {
    assert.deepEqual(satchelDims(1), { w: 4, h: 3 });
    assert.deepEqual(satchelDims(12), { w: 5, h: 3 });
    assert.deepEqual(satchelDims(36), { w: 5, h: 5 });
});

test('laying and lifting relics through the commands: pockets to satchel and back, and what the satchel gives counts', () => {
    const { sim, p } = farmer();
    const base = modsOf(p).dmgPct ?? 0;
    sim.give(p, 'relic_ember_chip', 2);
    sim.command('a', { t: 'satchel', op: 'put', item: 'relic_ember_chip', x: 0, y: 0 });
    sim.command('a', { t: 'satchel', op: 'put', item: 'relic_ember_chip', x: 0, y: 0 });      // (the same cell: refused)
    assert.equal(p.satchel!.length, 1);
    assert.equal(p.inv.relic_ember_chip, 1);
    assert.ok((modsOf(p).dmgPct ?? 0) > base, 'it counts');
    sim.command('a', { t: 'satchel', op: 'put', item: 'relic_ember_chip', x: 1, y: 0 });
    assert.equal(p.satchel!.length, 2);
    assert.equal(p.inv.relic_ember_chip ?? 0, 0);
    sim.command('a', { t: 'satchel', op: 'take', i: 0 });
    assert.equal(p.satchel!.length, 1);
    assert.equal(p.inv.relic_ember_chip, 1);
});

test('hostile commands change nothing', () => {
    const { sim, p } = farmer();
    sim.give(p, 'relic_ember_chip', 1);
    sim.give(p, 'plank', 1);
    for (const c of [
        { t: 'satchel', op: 'put', item: 'plank', x: 0, y: 0 }, { t: 'satchel', op: 'put', item: 'relic_ember_chip', x: -1, y: 0 },
        { t: 'satchel', op: 'put', item: 'relic_ember_chip', x: 9, y: 9 }, { t: 'satchel', op: 'put', item: 'relic_ember_chip', x: 0.5, y: 0 },
        { t: 'satchel', op: 'put', item: 'relic_frost_chip', x: 0, y: 0 }, { t: 'satchel', op: 'take', i: 3 }, { t: 'satchel', op: 'take', i: -1 },
        { t: 'satchel', op: 'put', item: '__proto__', x: 0, y: 0 }, { t: 'satchel', op: 'take', i: 'x' },
    ]) sim.command('a', c as never);
    assert.equal(p.satchel?.length ?? 0, 0);
    assert.equal(p.inv.relic_ember_chip, 1);
});
