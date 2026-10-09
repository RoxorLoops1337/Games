// The Blight and the base defenses. For now: the Bed, where a farmer wakes up after a fall.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { Sim } from '../src/shared/sim/sim';
import type { PlayerS } from '../src/shared/sim/types';

const home = (sim: Sim, p: PlayerS) => sim.world.plotCenter(sim.homePlot(p.slot));
const free = (sim: Sim, x: number, y: number) => sim.nearestFree(Math.floor(x / TILE), Math.floor(y / TILE), 8)!;

test('a bed moves where you wake up after a fall', () => {
    const sim = Sim.create('BL-BED', 'b');
    const p = sim.join('a', 'A')!;
    sim.give(p, 'plank', 50); sim.give(p, 'cloth', 10);
    const c = home(sim, p);
    p.x = c.x; p.y = c.y + 40;
    const b = free(sim, c.x + 50, c.y - 30);
    sim.command('a', { t: 'build', kind: 'sleepbed', tx: b.tx, ty: b.ty });
    const bed = sim.buildings('sleepbed')[0];
    assert.ok(bed && p.bed === bed.id, 'placing a bed makes it yours');
    p.x = c.x + 150; p.y = c.y + 100;
    sim.respawnHome(p);
    assert.ok(Math.hypot(p.x - (bed.tx + 0.5) * TILE, p.y - (bed.ty + 1) * TILE) < 4 * TILE, 'you wake beside it');
    sim.remove(bed.id);
    sim.respawnHome(p);
    assert.ok(Math.hypot(p.x - c.x, p.y - c.y) < 6 * TILE, 'with the bed gone, at home');
    assert.equal(p.bed, undefined);
    // pressing E on a bed makes it yours
    p.x = c.x; p.y = c.y + 40;
    const b2 = free(sim, c.x - 50, c.y - 30);
    sim.command('a', { t: 'build', kind: 'sleepbed', tx: b2.tx, ty: b2.ty });
    const second = sim.buildings('sleepbed')[0];
    p.bed = undefined;
    p.x = (second.tx + 0.5) * TILE; p.y = (second.ty + 3) * TILE;
    sim.command('a', { t: 'use', id: second.id });
    assert.equal(p.bed, second.id, 'E: this is where you wake up now');
});
