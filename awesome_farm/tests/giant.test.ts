// Giant crops: a 2 x 2 of one ripe crop is harvested together for twice the usual total; anything less is an ordinary harvest.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { giantBlock } from '../src/shared/sim/machines';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, DropE } from '../src/shared/sim/types';

function garden (ripe = [true, true, true, true], plants = ['seed_wheat', 'seed_wheat', 'seed_wheat', 'seed_wheat']) {
    const sim = Sim.create('giant', 'g');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 7.5) * TILE; p.y = (o.ty + 9) * TILE; p.warp++;
    const beds = [0, 1, 2, 3].map((i) => sim.add<BuildE>({ k: 'bld', kind: 'bed', tx: o.tx + 8 + (i & 1), ty: o.ty + 8 + (i >> 1), rot: 0, by: 'a', crop: ripe[i] ? 2 : 1, plant: plants[i] as never, growT: 0 }));
    return { sim, p, beds };
}
const drops = (sim: Sim) => Object.values(sim.s.ents).filter((e): e is DropE => e.k === 'drop');

test('four ripe beds of one crop are a giant, from whichever bed you press E on', () => {
    for (let i = 0; i < 4; i++) {
        const { sim, beds } = garden();
        assert.equal(giantBlock(sim, beds[i])?.length, 4);
    }
});

test('a giant harvests all four beds at once and drops twice the total', () => {
    const { sim, p, beds } = garden();
    sim.command('a', { t: 'use', id: beds[0].id });
    assert.ok(beds.every((b) => b.crop === -1), 'all four are bare');
    const wheat = drops(sim).filter((d) => d.res === 'wheat').length;
    assert.ok(wheat >= 8, `a double harvest from four beds (${wheat})`);
    assert.ok(p.stats.harvested >= 4);
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.text === 'A giant crop!'));
});

test('one unripe bed, or a different crop in the block, makes it an ordinary harvest', () => {
    const a = garden([true, true, true, false]);
    assert.equal(giantBlock(a.sim, a.beds[0]), null);
    a.sim.command('a', { t: 'use', id: a.beds[0].id });
    assert.equal(a.beds[0].crop, -1);
    assert.equal(a.beds[1].crop, 2, 'its neighbours stay');
    const b = garden([true, true, true, true], ['seed_wheat', 'seed_wheat', 'seed_wheat', 'seed_carrot']);
    assert.equal(giantBlock(b.sim, b.beds[0]), null);
});
