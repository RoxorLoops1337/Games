// The hotbar: an unset bar behaves like it always did; once you pin things it is yours.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOT_SLOTS, consumables, defaultHotbar, hotKind, hotbarOf } from '../src/shared/sim/hotbar';
import { Sim } from '../src/shared/sim/sim';

const setup = (seed: string) => {
    const sim = Sim.create(seed, 'h');
    const p = sim.join('a', 'A')!;
    p.hearts = 99; p.invuln = 999;
    return { sim, p };
};
const hot = (sim: Sim, slot: number, item: unknown) => sim.command('a', { t: 'hot', slot, item } as never);

test('an unset hotbar shows your pick, your weapon and your best food and potions', () => {
    const { sim, p } = setup('HB-1');
    sim.give(p, 'bread', 3);
    sim.give(p, 'potion_heal', 2);
    const bar = hotbarOf(p);
    assert.equal(bar.length, HOT_SLOTS);
    assert.equal(bar[0], p.equip.tool ?? null);
    assert.equal(bar[1], p.equip.weapon ?? null);
    assert.deepEqual(bar.slice(2, 4), ['potion_heal', 'bread'], 'potions first, then food');
    assert.deepEqual(bar, defaultHotbar(p));
    assert.ok(consumables(p).length <= HOT_SLOTS - 2);
    assert.equal(p.hot, undefined, 'nothing is stored until you choose');
});

test('pinning freezes the layout, an item lives in one slot, and clearing works', () => {
    const { sim, p } = setup('HB-2');
    sim.give(p, 'bread', 3); sim.give(p, 'potion_heal', 2); sim.give(p, 'seed_wheat', 5); sim.give(p, 'pod', 3);
    hot(sim, 7, 'seed_wheat');
    assert.ok(p.hot, 'stored');
    assert.equal(hotbarOf(p)[7], 'seed_wheat');
    assert.equal(hotbarOf(p)[2], 'potion_heal', 'the rest of the old layout is kept');
    hot(sim, 6, 'pod');
    hot(sim, 2, 'pod');                                               // already in slot 6: swap places
    assert.equal(hotbarOf(p)[2], 'pod');
    assert.equal(hotbarOf(p)[6], 'potion_heal');
    sim.give(p, 'berry', 4);                                          // new food no longer jumps onto the bar by itself
    assert.ok(!hotbarOf(p).includes('berry'));
    hot(sim, 7, null);
    assert.equal(hotbarOf(p)[7], null);
    assert.equal(hotbarOf(p).filter((x) => x === 'pod').length, 1);
});

test('only things you own can be pinned, and junk is ignored', () => {
    const { sim, p } = setup('HB-3');
    hot(sim, 3, 'potion_heal');                                       // none in your pockets
    assert.equal(p.hot, undefined);
    for (const bad of [[-1, 'wood'], [8, 'wood'], [1.5, 'wood'], ['x', 'wood'], [2, 'toString'], [2, '__proto__'], [2, 42], [2, undefined], [null, null]] as [unknown, unknown][]) hot(sim, bad[0] as number, bad[1]);
    assert.equal(p.hot, undefined, 'nothing changed');
    sim.give(p, 'wood', 5);
    hot(sim, 3, 'wood');
    assert.equal(hotbarOf(p)[3], 'wood');
    // equipped gear counts as owned
    const tool = p.equip.tool!;
    hot(sim, 0, tool);
    assert.equal(hotbarOf(p)[0], tool);
});

test('what a slot does depends on what is in it', () => {
    assert.equal(hotKind('pick_flint'), 'gear');
    assert.equal(hotKind('bread'), 'use');
    assert.equal(hotKind('potion_heal'), 'use');
    assert.equal(hotKind('seed_wheat'), 'seed');
    assert.equal(hotKind('pod'), 'pod');
    assert.equal(hotKind('pod_great'), 'pod');
    assert.equal(hotKind('wood'), 'item');
});

test('your hotbar survives a save and a load, and a corrupt one is tidied', () => {
    const { sim, p } = setup('HB-4');
    sim.give(p, 'wood', 5);
    hot(sim, 4, 'wood');
    const back = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.equal(hotbarOf(back.s.players.a)[4], 'wood');
    p.hot = ['wood', 'nonsense' as never, null];
    const bar = hotbarOf(p);
    assert.equal(bar.length, HOT_SLOTS);
    assert.deepEqual(bar.slice(0, 3), ['wood', null, null]);
});
