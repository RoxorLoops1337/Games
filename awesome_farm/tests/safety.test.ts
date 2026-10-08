// Floors and walls keep the farm safe: nothing spawns on a floor or inside a closed room, and monsters (even the flying ones) stay out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLOT, TILE } from '../src/shared/config';
import type { BuildingKind } from '../src/shared/data/buildings';
import { Rng } from '../src/shared/rng';
import { spawnMob } from '../src/shared/sim/mobs';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, MobE, NodeE } from '../src/shared/sim/types';
const STEP = 1 / 20;

function yard (seed: string) {
    const sim = Sim.create(seed, 'safe');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const home = sim.homePlot(p.slot);
    const o = sim.world.plotOrigin(home);
    p.invuln = 99999; p.hearts = 99;
    const put = (kind: BuildingKind, tx: number, ty: number) => sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot: 0, by: 'a' });
    /** A ring of wall around the box (x0,y0)–(x1,y1), with the tiles in `gaps` left open (or given a doorway). */
    const ring = (x0: number, y0: number, x1: number, y1: number, gaps: [number, number][] = [], door = false) => {
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
            if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
            const gap = gaps.some(([gx, gy]) => gx === x && gy === y);
            if (gap && !door) continue;
            put(gap ? 'doorway' : 'wall_stone', o.tx + x, o.ty + y);
        }
    };
    return { sim, p, home, o, put, ring };
}

test('nothing spawns on a floor, however many times it is asked', () => {
    const { sim, home, o, put } = yard('SAFE-1');
    // floor the whole left half of the patch
    for (let x = 0; x < PLOT / 2; x++) for (let y = 0; y < PLOT; y++) put('planks', o.tx + x, o.ty + y);
    const rng = new Rng('floors');
    let seen = 0;
    for (let i = 0; i < 400; i++) {
        const t = sim.world.randomFreeTile(home, rng, undefined, 0);
        if (!t) continue;
        seen++;
        assert.equal(sim.world.floorAt(t.tx, t.ty), 0, 'never on a floor');
        assert.ok(t.tx >= o.tx + PLOT / 2, 'only the bare half is used');
    }
    assert.ok(seen > 100, 'and the bare half is still used');
    // a patch that is floored from edge to edge has nowhere left to spawn anything
    for (let x = PLOT / 2; x < PLOT; x++) for (let y = 0; y < PLOT; y++) if (sim.world.isFree(o.tx + x, o.ty + y)) put('path', o.tx + x, o.ty + y);
    assert.equal(sim.world.randomFreeTile(home, rng, undefined, 0), null);
    assert.equal(spawnMob(sim, 'slime', undefined, home.i), null, 'no monster either');
});

test('a closed room is sealed, an open one is not, and a doorway still keeps it closed', () => {
    const { sim, o, ring } = yard('SAFE-2');
    ring(4, 4, 9, 9);                                            // a 4×4 room
    const inside = { tx: o.tx + 6, ty: o.ty + 6 }, outside = { tx: o.tx + 12, ty: o.ty + 12 };
    assert.equal(sim.world.sealed(inside.tx, inside.ty), true, 'walls all the way round');
    assert.equal(sim.world.sealed(outside.tx, outside.ty), false, 'open ground is not a room');
    // a doorway is shut to monsters, so the room stays sealed with one
    const w = yard('SAFE-2b');
    w.ring(4, 4, 9, 9, [[6, 9]], true);
    assert.equal(w.sim.world.sealed(w.o.tx + 6, w.o.ty + 6), true, 'a doorway keeps it sealed');
    // a gap in the wall opens it
    const g = yard('SAFE-2c');
    g.ring(4, 4, 9, 9, [[6, 9]], false);
    assert.equal(g.sim.world.sealed(g.o.tx + 6, g.o.ty + 6), false, 'a gap lets the open ground in');
    // tearing a wall down un-seals it again
    const gone = Object.values(sim.s.ents).find((e): e is BuildE => e.k === 'bld' && e.tx === o.tx + 4 && e.ty === o.ty + 6)!;
    sim.remove(gone.id);
    assert.equal(sim.world.sealed(inside.tx, inside.ty), false);
    // the sea is open ground too: a room that reaches the shore is not sealed
    const shore = yard('SAFE-2d');
    shore.ring(0, 4, 5, 9, [[0, 5], [0, 6], [0, 7], [0, 8]]);        // the west side is left open, right down to the water
    assert.equal(shore.sim.world.sealed(shore.o.tx + 3, shore.o.ty + 6), false);
    const wall = yard('SAFE-2e');
    wall.ring(0, 4, 5, 9);                                           // …but a wall right on the shore seals it
    assert.equal(wall.sim.world.sealed(wall.o.tx + 3, wall.o.ty + 6), true);
});

test('monsters never spawn inside a closed room, and do once it is opened to the world', () => {
    const { sim, home, o, ring } = yard('SAFE-3');
    // every tile of the patch is taken by a rock, except a 4×4 room and (later) a path from it to the shore
    const free = new Set<string>();
    for (let x = 5; x <= 8; x++) for (let y = 5; y <= 8; y++) free.add(`${x},${y}`);
    ring(4, 4, 9, 9);
    for (let x = 0; x < PLOT; x++) for (let y = 0; y < PLOT; y++) {
        const edge = x === 4 || x === 9 || y === 4 || y === 9;
        if (free.has(`${x},${y}`) || (edge && x >= 4 && x <= 9 && y >= 4 && y <= 9)) continue;
        if (sim.world.isFree(o.tx + x, o.ty + y)) sim.add<NodeE>({ k: 'node', kind: 'rock', tx: o.tx + x, ty: o.ty + y, hp: 3, plot: home.i });
    }
    for (let i = 0; i < 60; i++) assert.equal(spawnMob(sim, 'slime', undefined, home.i), null, 'no spot is allowed: the only free ground is a sealed room');
    // open the room to the shore: take out a wall piece and the rocks on the way to the west edge
    const wall = Object.values(sim.s.ents).find((e): e is BuildE => e.k === 'bld' && e.tx === o.tx + 4 && e.ty === o.ty + 6)!;
    sim.remove(wall.id);
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node' && e.ty === o.ty + 6 && e.tx < o.tx + 4) sim.remove(e.id);
    let got = 0;
    for (let i = 0; i < 80 && got === 0; i++) if (spawnMob(sim, 'slime', undefined, home.i)) got++;
    assert.ok(got > 0, 'now that the room opens onto the shore, spawning is allowed again');
});

test('flying monsters cannot cross a wall or a roof either', () => {
    const { sim, p, o, ring } = yard('SAFE-4');
    ring(4, 4, 9, 9);
    p.x = (o.tx + 6.5) * TILE; p.y = (o.ty + 6.5) * TILE; p.warp++;
    const bat = sim.add<MobE>({ k: 'mob', kind: 'bat', x: (o.tx + 2) * TILE, y: (o.ty + 6.5) * TILE, hp: 5, mhp: 5, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    for (let t = 0; t < 12; t += STEP) {
        sim.step(STEP);
        p.x = (o.tx + 6.5) * TILE; p.y = (o.ty + 6.5) * TILE; p.hearts = 99;
        const m = sim.s.ents[bat.id] as MobE | undefined;
        if (!m) break;
        const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
        assert.ok(!(tx >= o.tx + 4 && tx <= o.tx + 9 && ty >= o.ty + 4 && ty <= o.ty + 9), `the bat is outside the walls (${tx - o.tx},${ty - o.ty})`);
    }
    // a roof over open ground shuts the sky to them as well
    const open = yard('SAFE-4b');
    for (let x = 4; x <= 9; x++) for (let y = 4; y <= 9; y++) open.put('roof_thatch', open.o.tx + x, open.o.ty + y);
    open.p.x = (open.o.tx + 6.5) * TILE; open.p.y = (open.o.ty + 6.5) * TILE; open.p.warp++;
    const bat2 = open.sim.add<MobE>({ k: 'mob', kind: 'bat', x: (open.o.tx + 2) * TILE, y: (open.o.ty + 6.5) * TILE, hp: 5, mhp: 5, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    for (let t = 0; t < 12; t += STEP) {
        open.sim.step(STEP);
        open.p.x = (open.o.tx + 6.5) * TILE; open.p.y = (open.o.ty + 6.5) * TILE; open.p.hearts = 99;
        const m = open.sim.s.ents[bat2.id] as MobE | undefined;
        if (!m) break;
        const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
        assert.equal(open.sim.world.roofAt(tx, ty), 0, 'the bat never gets under the roof');
    }
});
