// Rings: five fingers, any free one, their bonuses add up, and nothing hostile gets through.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEM_ORDER, ITEMS, RING_SLOTS } from '../src/shared/data/items';
import { MOBS } from '../src/shared/data/mobs';
import { RECIPE_LIST } from '../src/shared/data/recipes';
import { derived } from '../src/shared/sim/stats';
import { Sim } from '../src/shared/sim/sim';

const rings = ITEM_ORDER.filter((id) => ITEMS[id].gear?.slot === 'ring');

function farmer () {
    const sim = Sim.create('RINGS', 'b');
    const p = sim.join('a', 'A')!;
    return { sim, p };
}

test('there are rings, each with a bonus, and each can be got somewhere', () => {
    assert.ok(rings.length >= 10);
    for (const id of rings) {
        assert.ok(Object.keys(ITEMS[id].gear!.mods ?? {}).length > 0, `${id} does something`);
        const crafted = RECIPE_LIST.some((r) => r.out === id);
        const dropped = Object.values(MOBS).some((m) => m.drops.some((d) => d[0] === id));
        assert.ok(crafted || dropped, `${id} is made or dropped`);
    }
});

test('rings go on the first free finger, five at once, and a sixth takes the first one’s place', () => {
    const { sim, p } = farmer();
    const five = rings.slice(0, 5);
    for (const id of five) { sim.give(p, id, 1); sim.command('a', { t: 'equip', item: id }); }
    assert.deepEqual(RING_SLOTS.map((r) => p.equip[r]), five);
    sim.give(p, rings[5], 1);
    sim.command('a', { t: 'equip', item: rings[5] });
    assert.equal(p.equip.ring1, rings[5], 'the sixth ring took the first finger');
    assert.equal(p.inv[five[0]], 1, 'and the old one came back to the backpack');
    assert.equal(p.equip.ring2, five[1], 'the others stayed');
});

test('a ring can be put on a chosen finger, and taken off again', () => {
    const { sim, p } = farmer();
    sim.give(p, 'ring_iron', 1);
    sim.command('a', { t: 'equip', item: 'ring_iron', slot: 'ring4' });
    assert.equal(p.equip.ring4, 'ring_iron');
    assert.equal(p.equip.ring1, undefined);
    sim.command('a', { t: 'unequip', slot: 'ring4' });
    assert.equal(p.equip.ring4, undefined);
    assert.equal(p.inv.ring_iron, 1);
});

test('the bonuses of every worn ring add up, and a ring is not a charm', () => {
    const { sim, p } = farmer();
    const base = derived(p);
    for (const id of ['ring_copper', 'ring_copper', 'ring_iron']) { sim.give(p, id as 'ring_copper', 1); sim.command('a', { t: 'equip', item: id as 'ring_copper' }); }
    const d = derived(p);
    assert.equal(d.maxEnergy, base.maxEnergy + 12, 'two copper rings, two bonuses');
    assert.ok(d.armor > base.armor, 'the iron ring too');
    sim.give(p, 'charm_swift', 1);
    sim.command('a', { t: 'equip', item: 'charm_swift' });
    assert.equal(p.equip.charm, 'charm_swift');
    assert.equal(RING_SLOTS.filter((r) => p.equip[r]).length, 3, 'the charm did not take a finger');
});

test('hostile slots and items are ignored', () => {
    const { sim, p } = farmer();
    const weapon = p.equip.weapon;
    sim.command('a', { t: 'unequip', slot: '__proto__' as never });
    sim.command('a', { t: 'unequip', slot: 'constructor' as never });
    sim.command('a', { t: 'equip', item: 'ring_iron', slot: 'weapon' as never });      // (not owned: nothing happens)
    sim.give(p, 'ring_iron', 1);
    sim.command('a', { t: 'equip', item: 'ring_iron', slot: 'weapon' as never });
    assert.equal(p.equip.weapon, weapon, 'a ring never goes in the weapon slot');
    assert.equal(p.equip.ring1, 'ring_iron', 'it took a finger');
});
