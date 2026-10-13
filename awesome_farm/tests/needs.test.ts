// "What needs me": ripe crops, machines out of fuel, chests nearly full, grouped, most urgent first, with the nearest one's position.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { needsOf, whereText } from '../src/shared/sim/needs';
import { Sim } from '../src/shared/sim/sim';
import { simEnv } from '../src/shared/sim/status';
import type { BuildE } from '../src/shared/sim/types';

test('ripe beds, a furnace out of fuel and a full chest are listed, ripe crops first', () => {
    const sim = Sim.create('needs', 'n');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    const at = (dx: number, dy: number) => ({ tx: o.tx + dx, ty: o.ty + dy });
    sim.add<BuildE>({ k: 'bld', kind: 'bed', ...at(5, 5), rot: 0, by: 'a', crop: 2, plant: 'seed_wheat' });
    sim.add<BuildE>({ k: 'bld', kind: 'bed', ...at(12, 5), rot: 0, by: 'a', crop: 2, plant: 'seed_wheat' });
    sim.add<BuildE>({ k: 'bld', kind: 'bed', ...at(6, 5), rot: 0, by: 'a', crop: 1, plant: 'seed_wheat' });
    sim.add<BuildE>({ k: 'bld', kind: 'furnace', ...at(8, 8), rot: 0, by: 'a', inv: { iron: 5 }, fin: {}, rcp: 'furnace:ironbar', prog: 1, fuel: 0 });
    sim.add<BuildE>({ k: 'bld', kind: 'chest', ...at(9, 3), rot: 0, by: 'a', inv: { wood: 10000 } });
    const list = needsOf(Object.values(sim.s.ents).filter((e): e is BuildE => e.k === 'bld'), simEnv(sim), { x: (o.tx + 5) * TILE, y: (o.ty + 5) * TILE });
    const ids = list.map((n) => n.id);
    assert.equal(ids[0], 'ripe', 'ripe crops come first');
    assert.equal(list[0].count, 2);
    assert.equal(list[0].x, (o.tx + 5.5) * TILE, 'the nearest ripe bed');
    assert.ok(ids.includes('st:nofuel'), 'the furnace is out of fuel');
    assert.ok(ids.includes('chestfull'), 'the chest is nearly full');
    assert.ok(list.every((n, i) => i === 0 || list[i - 1].rank <= n.rank), 'sorted by urgency');
});

test('a quiet farm lists nothing; distances read as tiles and a compass point', () => {
    const sim = Sim.create('needs2', 'n');
    sim.join('a', 'A');
    assert.deepEqual(needsOf(Object.values(sim.s.ents).filter((e): e is BuildE => e.k === 'bld'), simEnv(sim), { x: 0, y: 0 }), []);
    assert.equal(whereText(0, 0), 'right here');
    assert.equal(whereText(10 * TILE, 0), '10 tiles E');
    assert.equal(whereText(0, -20 * TILE), '20 tiles N');
});

test('rows read right for one and for many', async () => {
    const { needLine } = await import('../src/shared/sim/needs');
    assert.equal(needLine({ count: 1, text: 'crops are ripe' }), '1  crop is ripe');
    assert.equal(needLine({ count: 3, text: 'machines out of fuel' }), '3  machines out of fuel');
    assert.equal(needLine({ count: 1, text: 'machines out of fuel' }), '1  machine out of fuel');
});
