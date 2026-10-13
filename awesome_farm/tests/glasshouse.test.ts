// The Glass Roof: garden beds under it grow at full speed in winter and a little faster in any season.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from '../src/shared/data/buildings';
import { TILE, TUNING } from '../src/shared/config';
import { glassed, seasonGrow } from '../src/shared/sim/machines';
import { seasonDef } from '../src/shared/season';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

function yard () {
    const sim = Sim.create('glass', 'g');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE; p.warp++;
    const bed = (dx: number) => sim.add<BuildE>({ k: 'bld', kind: 'bed', tx: o.tx + dx, ty: o.ty + 8, rot: 0, by: 'a', crop: 0, plant: 'seed_wheat', growT: 0 });
    return { sim, p, o, bed };
}

test('a bed under a Glass Roof ignores the winter slowdown; one beside it does not', () => {
    const { sim, p, o, bed } = yard();
    sim.s.day = 22;                                    // winter
    assert.ok(seasonDef(sim.s.day).grow < 1);
    const a = bed(2), b = bed(3);
    p.inv = { glass: 20, plank: 20 };
    sim.command('a', { t: 'build', kind: 'roof_glass', tx: o.tx + 2, ty: o.ty + 8, rot: 0 });
    assert.ok(glassed(sim, a), 'covered');
    assert.ok(!glassed(sim, b), 'not covered');
    assert.equal(seasonGrow(sim, a), TUNING.glasshouseGrow);
    assert.equal(seasonGrow(sim, b), seasonDef(sim.s.day).grow);
    sim.s.day = 3;                                     // spring (1.25): the roof never makes it slower
    assert.equal(seasonGrow(sim, a), 1.25 * TUNING.glasshouseGrow);
});

test('the Glass Roof is a roof piece you can build from glass and planks', () => {
    const d = BUILDINGS.roof_glass;
    assert.ok(d.roof && d.cost.glass && d.cost.plank);
});
