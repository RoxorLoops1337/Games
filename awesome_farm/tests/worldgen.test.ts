// Rolling a world (sim/worldgen.ts): the grid, the homes, the biome rings, the Dread blocks, the rift islands, the ore and the seed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CENTER, DREAD_RING, FAR_RING, GRID, MAX_PLAYERS, PLOT, RIFT_ISLANDS, RIFT_RADIUS, riftOrigin, SPAWN_RING, SPAWN_RING_2, TILE } from '../src/shared/config';
import { BOSSES } from '../src/shared/data/mobs';
import { Sim } from '../src/shared/sim/sim';
import type { Plot, SimEvent } from '../src/shared/sim/types';
import { DREAD_BOSS, ensureVeins, homeSpot, slotPlot } from '../src/shared/sim/worldgen';

const dist = (p: { gx: number; gy: number }) => Math.hypot(p.gx - CENTER.gx, p.gy - CENTER.gy);
const floats = (ev: SimEvent[]) => ev.filter((e) => e.e === 'float').map((e) => (e as { text: string }).text);

test('a new world is GRID by GRID plots indexed row by row, all wild, with the Old Heart in the exact middle', () => {
    const sim = Sim.create('WG-grid', 'wg');
    const plots = sim.s.plots;
    assert.equal(plots.length, GRID * GRID);
    plots.forEach((p, i) => {
        assert.equal(p.i, i);
        assert.equal(p.gx, i % GRID);
        assert.equal(p.gy, Math.floor(i / GRID));
        assert.equal(p.owned, false);
        if (!p.dread) assert.equal(p.nodes, 0, 'nothing grows on land nobody has raised');
        if (!p.dread) assert.equal(p.veins, undefined, 'and no ore is carried for it');
    });
    const hearts = plots.filter((p) => p.heart);
    assert.equal(hearts.length, 1);
    assert.equal(hearts[0].i, CENTER.gy * GRID + CENTER.gx);
    assert.equal(hearts[0].mod, null);
    assert.equal(GRID % 2, 1, 'an odd grid, so the Heart has a middle to sit in');
});

test('the sixteen homes sit on two rings at the designed distances, each a meadow with a quarry and a goldsand beside it', () => {
    const slots = Array.from({ length: MAX_PLAYERS }, (_, k) => slotPlot(k));
    assert.equal(new Set(slots.map((s) => `${s.gx},${s.gy}`)).size, MAX_PLAYERS);
    slots.forEach((s, k) => {
        const r = dist(s), ring = k < 8 ? SPAWN_RING : SPAWN_RING_2;
        assert.ok(Math.abs(r - ring) <= 0.75, `home ${k} is ${r.toFixed(2)} from the centre, the ring is ${ring}`);
    });
    const sim = Sim.create('WG-homes', 'wg');
    const around = (p: Plot) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => sim.world.plot(p.gx + dx, p.gy + dy)!);
    for (let k = 0; k < 8; k++) {
        const home = sim.world.plot(slots[k].gx, slots[k].gy)!;
        assert.equal(home.home, k);
        assert.equal(home.biome, 'meadow');
        assert.equal(home.mod, null);
        assert.deepEqual(around(home).map((n) => n.biome).sort(), ['goldsand', 'meadow', 'meadow', 'quarry'], `home ${k}: stone and gold next door`);
    }
    // the second ring is raised when its farmers arrive
    for (let k = 0; k < MAX_PLAYERS; k++) sim.join(`p${k}`, `P${k}`);
    for (let k = 8; k < MAX_PLAYERS; k++) {
        const home = sim.homePlot(k);
        assert.deepEqual({ gx: home.gx, gy: home.gy }, slots[k], `farmer ${k} got the ring spot`);
        assert.equal(home.home, k);
        assert.ok(home.owned && home.biome === 'meadow' && home.mod === null);
        assert.ok(home.veins && home.veins.length > 0);
        assert.deepEqual(around(home).map((n) => n.biome).sort(), ['goldsand', 'meadow', 'meadow', 'quarry']);
    }
});

test('biomes come in rings: harsh in the middle, the wilds beyond the far ring, and no bog in the band where the farms grow', () => {
    const sim = Sim.create('WG-rings', 'wg');
    const homes = new Set(Array.from({ length: 8 }, (_, k) => { const s = slotPlot(k); return s.gy * GRID + s.gx; }));
    const nearHome = (p: Plot) => Array.from({ length: 8 }, (_, k) => slotPlot(k)).some((h) => Math.abs(h.gx - p.gx) + Math.abs(h.gy - p.gy) <= 1);
    const seen = { inner: new Set<string>(), band: new Set<string>(), far: new Set<string>() };
    for (const p of sim.s.plots) {
        if (p.dread) continue;
        const r = dist(p);
        if (r < 3) { seen.inner.add(p.biome); assert.ok(['bog', 'snowcap', 'quarry'].includes(p.biome), `${p.biome} at ${r.toFixed(1)} from the Heart`); }
        else if (r >= SPAWN_RING + 0.5 && r < FAR_RING) { seen.band.add(p.biome); assert.notEqual(p.biome, 'bog', `a bog at ${r.toFixed(1)}, where the farms grow`); }
        else if (r >= FAR_RING) seen.far.add(p.biome);
        if (homes.has(p.i)) assert.equal(p.mod, null);
        else if (nearHome(p)) assert.ok(!p.mod || ['bountiful', 'fertile', 'treasure', 'fairy'].includes(p.mod), `${p.mod} beside a home`);
    }
    assert.ok(seen.inner.size >= 2 && seen.band.size >= 3 && seen.far.size >= 4, `a spread of biomes: ${[...seen.inner]} / ${[...seen.band]} / ${[...seen.far]}`);
    assert.ok(sim.s.plots.some((p) => p.mod === 'ruins') && sim.s.plots.some((p) => p.mod === 'haunted'), 'strange land exists somewhere');
});

test('the four Dread blocks stand on the diagonals out in the wilds, each kept by a different boss', () => {
    const sim = Sim.create('WG-dread', 'wg');
    const cores = sim.s.plots.filter((p) => p.dread === 2).sort((a, b) => a.zone! - b.zone!);
    assert.deepEqual(cores.map((c) => c.zone), [0, 1, 2, 3]);
    cores.forEach((c, q) => {
        const a = Math.PI / 4 + (q * Math.PI) / 2;
        assert.deepEqual({ gx: c.gx, gy: c.gy }, { gx: Math.round(CENTER.gx + DREAD_RING * Math.cos(a)), gy: Math.round(CENTER.gy + DREAD_RING * Math.sin(a)) }, `block ${q} is where the design puts it`);
        assert.equal(Math.abs(c.gx - CENTER.gx), Math.abs(c.gy - CENTER.gy), 'on a diagonal');
        assert.ok(dist(c) >= FAR_RING, 'out in the wilds');
        const block = sim.s.plots.filter((p) => p.dread && p.zone === q);
        assert.equal(block.length, 9);
        assert.ok(block.every((p) => p.biome === 'bog' && p.mod === null && !p.owned && Math.abs(p.gx - c.gx) <= 1 && Math.abs(p.gy - c.gy) <= 1));
        assert.ok(BOSSES[DREAD_BOSS[q]], `${DREAD_BOSS[q]} is a boss`);
    });
    assert.equal(new Set(DREAD_BOSS).size, 4);
    assert.equal(sim.s.plots.filter((p) => p.dread).length, 36);
});

test('the rift islands float in the four corners of the sea, are land from the start, belong to no plot, and take no building', () => {
    const sim = Sim.create('WG-rifts', 'wg');
    const p = sim.join('a', 'A')!;
    for (let i = 0; i < RIFT_ISLANDS; i++) {
        const o = riftOrigin(i), c = sim.world.riftCenter(i);
        const ctx = Math.floor(c.x / TILE), cty = Math.floor(c.y / TILE);
        assert.ok(sim.world.isLand(ctx, cty), `rift ${i} has ground at its middle`);
        assert.equal(sim.world.riftAtPx(c.x, c.y), i);
        assert.equal(sim.world.plotAt(ctx, cty), null, 'in the sea ring, on no plot');
        let land = 0;
        for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) if (sim.world.isLand(o.tx + x, o.ty + y)) land++;
        const disc = Math.PI * RIFT_RADIUS * RIFT_RADIUS;
        assert.ok(land > disc * 0.8 && land < disc * 1.2, `rift ${i}: ${land} tiles of a ${disc.toFixed(0)}-tile disc`);
        assert.ok(!sim.world.isLand(ctx + Math.ceil(RIFT_RADIUS) + 1, cty), 'and open water around it');
        sim.give(p, 'wood', 8);
        sim.events = [];
        sim.command('a', { t: 'build', kind: 'chest', tx: ctx, ty: cty, rot: 0 });
        assert.ok(floats(sim.events).includes("Can't build there"));
    }
    assert.ok(riftOrigin(0).tx === 0 && riftOrigin(0).ty === 0, 'the first in the top-left corner');
    assert.ok(riftOrigin(3).tx > riftOrigin(0).tx && riftOrigin(3).ty > riftOrigin(0).ty, 'the last in the bottom-right');
});

test('ore veins come from the seed once land is somebody’s: the same for every world with that seed, inside the plot, made once', () => {
    const a = Sim.create('WG-veins', 'wg'), b = Sim.create('WG-veins', 'wg');
    const pa = a.s.plots.find((p) => !p.dread && !p.heart && p.home === undefined && p.biome === 'quarry')!;
    const pb = b.s.plots[pa.i];
    assert.equal(pa.veins, undefined);
    ensureVeins(a.s.seed, pa);
    ensureVeins(b.s.seed, pb);
    const va = a.s.plots[pa.i].veins!, vb = b.s.plots[pb.i].veins!;            // (read again: the plot was changed under us)
    assert.ok(va && va.length > 0, 'a quarry has ore');
    assert.deepEqual(va, vb, 'the same ore in both worlds');
    const o = a.world.plotOrigin(pa);
    for (const [x, y] of va) assert.ok(x > o.tx && x < o.tx + PLOT - 1 && y > o.ty && y < o.ty + PLOT - 1, 'ore stays inside the patch');
    assert.equal(new Set(va.map(([x, y]) => `${x},${y}`)).size, va.length, 'one ore per tile');
    ensureVeins(a.s.seed, pa);
    assert.equal(a.s.plots[pa.i].veins, va, 'made once, kept after');
    const [vx, vy, ore] = va[0];
    assert.equal(a.world.veinAt(vx, vy), ore);
    // a home always has the basics for a first drill
    const p = a.join('a', 'A')!;
    const kinds = new Set(a.homePlot(p.slot).veins!.map((v) => v[2]));
    for (const k of ['stone', 'coal', 'iron', 'copper'] as const) assert.ok(kinds.has(k), `a home has ${k}`);
    // a different seed, different ore
    const c = Sim.create('WG-veins-other', 'wg');
    const pc = c.s.plots[pa.i];
    ensureVeins(c.s.seed, pc);
    assert.notDeepEqual(c.s.plots[pa.i].veins, va);
});

test('the same seed makes the same world, and a different seed a different one', () => {
    const a = Sim.create('WG-same', 'wg'), b = Sim.create('WG-same', 'wg'), c = Sim.create('WG-other', 'wg');
    assert.equal(JSON.stringify(a.s.plots), JSON.stringify(b.s.plots));
    assert.equal(JSON.stringify(a.s.ents), JSON.stringify(b.s.ents), 'down to the Dread hoards');
    assert.notEqual(JSON.stringify(a.s.plots), JSON.stringify(c.s.plots));
    // and the homes come out the same for the same farmers
    a.join('a', 'A'); b.join('a', 'A');
    assert.equal(JSON.stringify(a.s.plots), JSON.stringify(b.s.plots));
    assert.equal(JSON.stringify(a.s.ents), JSON.stringify(b.s.ents));
});

test('a ninth farmer takes the second ring; when that spot is taken they get the nearest wild one, clear of everybody', () => {
    const sim = Sim.create('WG-ninth', 'wg');
    const plots = sim.s.plots;
    assert.deepEqual(homeSpot(plots, 8), slotPlot(8));
    const taken = plots[slotPlot(8).gy * GRID + slotPlot(8).gx];
    taken.owned = true; taken.buyer = 'p0';
    const spot = homeSpot(plots, 8)!;
    assert.ok(spot, 'a spot was found');
    assert.notDeepEqual(spot, slotPlot(8));
    assert.ok(spot.gx >= 2 && spot.gy >= 2 && spot.gx <= GRID - 3 && spot.gy <= GRID - 3, 'not on the edge');
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = sim.world.plot(spot.gx + dx, spot.gy + dy)!;
        assert.ok(n && !n.owned && !n.heart && n.home === undefined && !n.dread, 'wild land all round');
    }
    for (let k = 0; k < 8; k++) { const h = slotPlot(k); assert.ok(Math.abs(h.gx - spot.gx) + Math.abs(h.gy - spot.gy) >= 4, `clear of home ${k}`); }
    assert.ok(Math.abs(dist(spot) - SPAWN_RING_2) <= 3.5, 'still about the second ring');
});
