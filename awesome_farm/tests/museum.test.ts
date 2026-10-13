// The Museum of odd things: one of each trophy, fish and gem, prizes at milestones.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MUSEUM_ITEMS } from '../src/shared/data/museum';
import { donated, use } from '../src/shared/sim/museum';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE } from '../src/shared/sim/types';

function setup (seed: string) {
    const sim = Sim.create(seed, 'm');
    const p = sim.join('a', 'A')!;
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    const b = sim.add<BuildE>({ k: 'bld', kind: 'museum', tx: o.tx + 4, ty: o.ty + 4, rot: 0 });
    return { sim, p, b };
}

test('the museum wants trophies, fish and gems, and not food made from them', () => {
    assert.ok(MUSEUM_ITEMS.includes('trophy_slime') && MUSEUM_ITEMS.includes('fish_koi') && MUSEUM_ITEMS.includes('gem_ruby_1'));
    assert.ok(!MUSEUM_ITEMS.includes('fish_pie'));
    assert.ok(!MUSEUM_ITEMS.includes('wood'));
});

test('donating takes one of each new kind, once, and the fifth kind pays a prize', () => {
    const { sim, p, b } = setup('MUS-1');
    for (const id of ['fish_carp', 'fish_perch', 'fish_trout', 'fish_bass'] as const) sim.give(p, id, 2);
    const coins = p.coins;
    use(sim, p, b);
    assert.equal(donated(p), 4);
    assert.equal(countOf(p, 'fish_carp'), 1, 'one stays with you');
    use(sim, p, b);
    assert.equal(donated(p), 4, 'the same kinds are not taken twice');
    sim.give(p, 'fish_eel', 1);
    use(sim, p, b);
    assert.equal(donated(p), 5);
    assert.ok(p.coins >= coins + 100, 'five kinds pay the first prize');
});
