// A new farmer arrives on an island with room to build: the spot they land on has a clearing around it.

import assert from 'node:assert/strict';
import test from 'node:test';
import { TILE } from '../src/shared/config';
import { Sim } from '../src/shared/sim/sim';

test('a home island leaves a clear square around where its farmer arrives', () => {
    for (const seed of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']) {
        const sim = Sim.create(seed, 'x');
        const p = sim.join('p1', 'Tester')!;
        const w = sim.world, cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
        let best = 0;
        for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) {
            for (let s = 12; s >= 1 && s > best; s--) {
                let ok = true;
                for (let dy = 0; dy < s && ok; dy++) for (let dx = 0; dx < s && ok; dx++) if (!w.isLand(x + dx, y + dy) || !w.isFree(x + dx, y + dy)) ok = false;
                if (ok) { best = s; break; }
            }
        }
        assert.ok(best >= 8, `seed ${seed}: the biggest free square near the start is only ${best} wide`);
    }
});

test('a world saved while a menu had it paused wakes up running', () => {
    const sim = Sim.create('paused', 'x');
    const p = sim.join('p1', 'Tester')!;
    sim.command(p.id, { t: 'pause', on: true });
    assert.equal(sim.s.paused, true);
    const again = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.equal(again.s.paused, false);
});
