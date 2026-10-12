// Nobody is left inside a piece a friend builds on them: farmers near a fresh piece are lifted clear, and a farmer who is somehow
// already inside something solid can walk out (the movement rule of the client is the server's: a step is refused only if it goes INTO a solid).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import * as unstick from '../src/shared/sim/unstick';
import { Sim } from '../src/shared/sim/sim';

function two (seed: string) {
    const sim = Sim.create(seed, 'u');
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    a.invuln = b.invuln = 1e9;
    return { sim, a, b };
}

test('a bed built on a friend who stands beside it (server a few pixels behind their screen) pushes them clear', () => {
    const { sim, a, b } = two('UNSTICK-1');
    const h = sim.world.plotCenter(sim.homePlot(a.slot));
    const tx = Math.floor(h.x / TILE) + 2, ty = Math.floor(h.y / TILE) + 2;
    sim.give(a, 'plank', 10); sim.give(a, 'wood', 10);
    a.x = (tx + 4) * TILE; a.y = (ty + 1) * TILE;
    // the friend is 9 px outside the footprint on the server (their screen may already be inside it)
    b.x = tx * TILE - 4 - 9; b.y = (ty + 1) * TILE;
    const warp = b.warp;
    sim.command('a', { t: 'build', kind: 'sleepbed', tx, ty, rot: 0 });
    assert.equal(sim.buildings('sleepbed').length, 1, 'the bed went down');
    assert.ok(b.warp > warp, 'the friend was moved and their client snaps');
    assert.ok(!unstick.touches({ tx, ty, w: 1, h: 2 }, b.x, b.y, unstick.LAG), 'clear of it, with room to spare');
    assert.ok(!sim.world.boxBlocked(b.x, b.y, 4, 3), 'on free ground');
});

test('a farmer who is exactly inside a solid tile is lifted out to free ground', () => {
    const { sim, a } = two('UNSTICK-2');
    const h = sim.world.plotCenter(sim.homePlot(a.slot));
    const tx = Math.floor(h.x / TILE) + 3, ty = Math.floor(h.y / TILE) + 3;
    sim.give(a, 'wood', 40); sim.give(a, 'plank', 40);
    a.x = (tx + 4) * TILE; a.y = (ty + 4) * TILE;
    sim.command('a', { t: 'build', kind: 'workbench', tx, ty, rot: 0 });
    assert.equal(sim.buildings('workbench').length, 1);
    a.x = (tx + 0.5) * TILE; a.y = (ty + 0.9) * TILE;               // inside it
    assert.ok(sim.world.boxBlocked(a.x, a.y, 4, 3));
    assert.ok(unstick.eject(sim, a));
    assert.ok(!sim.world.boxBlocked(a.x, a.y, 4, 3));
    assert.equal(unstick.eject(sim, a), false, 'and a free farmer is left alone');
});
