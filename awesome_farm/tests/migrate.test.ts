// A world saved before the map grew (state version 4, 17×17 plots of 12×12 tiles) is carried into the middle of the new one,
// and every plot is then stretched to 18×18 tiles around its old land (state version 6).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CENTER, GRID, LEGACY_GRID, LEGACY_PLOT, PLOT, riftOrigin, SEA, TILE } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { Sim } from '../src/shared/sim/sim';
import { migrate } from '../src/shared/sim/migrate';
import type { BuildE, CritE, DropE, MobE, NodeE, Plot, WorldState } from '../src/shared/sim/types';
import { slotPlot } from '../src/shared/sim/worldgen';

const OFF = (GRID - LEGACY_GRID) / 2;
const PAD = (PLOT - LEGACY_PLOT) / 2;                  // the old land sits this far in from the edge of its bigger plot
const STEP = 1 / 20;

/** A hand-made version-4 save: the old 17×17 grid, a home island, and one of everything that has a position. */
function legacyWorld (): WorldState {
    const c = (LEGACY_GRID - 1) / 2;
    const plots: Plot[] = [];
    for (let gy = 0; gy < LEGACY_GRID; gy++) for (let gx = 0; gx < LEGACY_GRID; gx++) {
        plots.push({ i: gy * LEGACY_GRID + gx, gx, gy, biome: 'meadow', mod: null, owned: false, nodes: 0, veins: [[(gx + SEA) * LEGACY_PLOT + 3, (gy + SEA) * LEGACY_PLOT + 4, 'iron']] });
    }
    const home = { gx: c + 6, gy: c };                                   // slot 0 sits on the ring, east of the centre
    const h = plots[home.gy * LEGACY_GRID + home.gx];
    h.owned = true; h.home = 0; h.buyer = 'home:0';
    plots[c * LEGACY_GRID + c].heart = true;
    const o = { tx: (home.gx + SEA) * LEGACY_PLOT, ty: (home.gy + SEA) * LEGACY_PLOT };
    const node: NodeE = { id: 1, k: 'node', kind: 'tree', tx: o.tx + 2, ty: o.ty + 2, hp: 3, plot: h.i };
    h.nodes = 1;
    const bld: BuildE = { id: 2, k: 'bld', kind: 'workbench', tx: o.tx + 6, ty: o.ty + 6, rot: 0 };
    const px = (o.tx + 5) * TILE, py = (o.ty + 5) * TILE;
    const drop: DropE = { id: 3, k: 'drop', res: 'wood', x: px, y: py, ox: px - 4, oy: py - 4, age: 1 };
    const mob: MobE = { id: 4, k: 'mob', kind: 'slime', x: px + 20, y: py, hp: 2, mhp: 2, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, hx: px + 20, hy: py };
    const crit: CritE = { id: 5, k: 'crit', sp: 'hopper', x: px - 20, y: py, vx: 0, vy: 0, t: 0, lv: 2, mode: 1, hx: px - 20, hy: py, tx: o.tx + 8, ty: o.ty + 8 };
    // an expedition monster standing on the bottom-right rift island
    const farTile = (LEGACY_GRID + SEA) * LEGACY_PLOT;
    const rx = (farTile + 6) * TILE, ry = (farTile + 6) * TILE;
    const riftMob: MobE = { id: 6, k: 'mob', kind: 'slime', x: rx, y: ry, hp: 2, mhp: 2, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, rift: 3 };
    return {
        version: 4, seed: 'LEGACY-1', name: 'legacy', tick: 7, time: 100, clock: 20, day: 12, night: false, nightLen: 50, paused: false,
        plots, ents: { 1: node, 2: bld, 3: drop, 4: mob, 5: crit, 6: riftMob }, nextId: 7,
        players: {
            a: {
                id: 'a', name: 'A', color: 0, slot: 0, online: false, x: px, y: py + 10, fx: 1, fy: 0, moving: false, warp: 0, hearts: 3, energy: 100,
                xp: 0, level: 5, points: 0, coins: 9, inv: { wood: 3 }, equip: {}, skills: {}, buffs: [], plotsBought: 0, downed: 0, revive: 0, invuln: 0,
                swingCd: 0, windDay: 0, stats: { harvested: 0, built: 0, kills: 0, revives: 0, crafted: 0 },
                fishing: { x: px + 30, y: py + 30, ox: px, oy: py, ph: 0, t: 5, rod: 1, item: 'wood', round: 0, rounds: 1, strikes: 0 },
            },
        },
    } as unknown as WorldState;
}

test('the old land moves to the middle of the bigger map, with everything on it', () => {
    const old = legacyWorld();
    const oldHome = old.plots.find((p) => p.home === 0)!;
    const sim = new Sim(old);                               // the constructor migrates
    const s = sim.s;
    assert.equal(s.version, 7);
    assert.equal(s.plots.length, GRID * GRID);
    s.plots.forEach((p, i) => { assert.equal(p.i, i); assert.equal(p.gy * GRID + p.gx, i); });

    // the homes are still on the ring around the (new) centre, and the heart is in the exact middle
    const home = s.plots.find((p) => p.home === 0)!;
    assert.deepEqual({ gx: home.gx, gy: home.gy }, slotPlot(0));
    assert.equal(home.gx, oldHome.gx + OFF);
    assert.ok(home.owned && home.buyer === 'home:0');
    assert.ok(s.plots[CENTER.gy * GRID + CENTER.gx].heart);
    assert.equal(s.plots.filter((p) => p.heart).length, 1);
    assert.equal(s.plots.filter((p) => p.owned).length, 1, 'no land appears out of nowhere');

    // veins ride along: the one in the old home plot is still inside the same (shifted) plot
    for (const [tx, ty] of home.veins!) assert.equal(Math.floor(tx / PLOT) - SEA, home.gx), assert.equal(Math.floor(ty / PLOT) - SEA, home.gy);

    // land nobody owns carries no ore (it is made from the seed when somebody takes the plot)
    assert.equal(s.plots[0].veins, undefined);

    // entities keep their relation to the land
    const o = sim.world.plotOrigin(home);
    const node = s.ents[1] as NodeE, bld = s.ents[2] as BuildE, drop = s.ents[3] as DropE, mob = s.ents[4] as MobE, crit = s.ents[5] as CritE;
    assert.deepEqual([node.tx, node.ty], [o.tx + 2 + PAD, o.ty + 2 + PAD]);
    assert.equal(s.plots[node.plot], home, 'the node still belongs to its plot');
    assert.deepEqual([bld.tx, bld.ty], [o.tx + 6 + PAD, o.ty + 6 + PAD]);
    assert.deepEqual([drop.x, drop.y], [(o.tx + 5 + PAD) * TILE, (o.ty + 5 + PAD) * TILE]);
    assert.deepEqual([drop.ox, drop.oy], [(o.tx + 5 + PAD) * TILE - 4, (o.ty + 5 + PAD) * TILE - 4]);
    assert.deepEqual([mob.x, mob.hx], [(o.tx + 5 + PAD) * TILE + 20, (o.tx + 5 + PAD) * TILE + 20]);
    assert.deepEqual([crit.tx, crit.ty], [o.tx + 8 + PAD, o.ty + 8 + PAD]);
    assert.equal(sim.world.occAt(node.tx, node.ty), node.id, 'the grid knows about it');
    assert.equal(sim.world.occAt(bld.tx, bld.ty), bld.id);

    // the farmer stands where they stood, on land, and their fishing line moved with them
    const a = s.players.a;
    assert.deepEqual([a.x, a.y], [(o.tx + 5 + PAD) * TILE, (o.ty + 5 + PAD) * TILE + 10]);
    assert.ok(sim.world.isLand(Math.floor(a.x / TILE), Math.floor(a.y / TILE)));
    assert.deepEqual([a.fishing!.x, a.fishing!.ox], [(o.tx + 5 + PAD) * TILE + 30, (o.tx + 5 + PAD) * TILE]);
    assert.equal(a.warp, 2, 'clients snap to the new position (once per step: the map grew, then the patches did)');
    assert.equal(a.level, 5); assert.equal(a.coins, 9); assert.equal(s.day, 12);
});

test('an expedition monster rides out to the new corner with its rift island', () => {
    const s = migrate(legacyWorld());                       // (a Sim would sweep a monster that has no expedition running)
    const m = s.ents[6] as MobE;
    const o = riftOrigin(3);
    assert.ok(m.x >= o.tx * TILE && m.x < (o.tx + PLOT) * TILE && m.y >= o.ty * TILE && m.y < (o.ty + PLOT) * TILE, 'still on the bottom-right rift island');
    assert.equal(m.x, (o.tx + 6 + PAD) * TILE, 'at the same spot on it');
});

test('a migrated world plays on: it steps, saves and loads again unchanged', () => {
    const sim = new Sim(legacyWorld());
    sim.join('a', 'A');
    for (let t = 0; t < 30; t += STEP) sim.step(STEP);
    const json = JSON.stringify(sim.s);
    const again = new Sim(JSON.parse(json));
    assert.equal(again.s.version, 7);
    assert.equal(again.s.plots.length, GRID * GRID);
    assert.equal(Object.keys(again.s.ents).length, Object.keys(sim.s.ents).length);
    // migrating twice is harmless
    const before = JSON.stringify(again.s.plots);
    migrate(again.s);
    assert.equal(JSON.stringify(again.s.plots), before);
});

test('worlds from this version are not touched', () => {
    const sim = Sim.create('FRESH-1', 'x');
    const before = JSON.stringify(sim.s);
    migrate(sim.s);
    assert.equal(JSON.stringify(sim.s), before);
    assert.equal(sim.s.plots.length, GRID * GRID);
});

test('the new border of an owned patch gets fresh resources, and nothing lands on what was already there', () => {
    const old = legacyWorld();
    // a second building straddling the edge of the home plot: its whole footprint must stay in one piece
    const [bw, bh] = BUILDINGS.drill.size;
    const oldHome = old.plots.find((p) => p.home === 0)!;
    const oo = { tx: (oldHome.gx + SEA) * LEGACY_PLOT, ty: (oldHome.gy + SEA) * LEGACY_PLOT };
    old.ents[7] = { id: 7, k: 'bld', kind: 'drill', tx: oo.tx + LEGACY_PLOT - 1, ty: oo.ty + 4, rot: 0 } as BuildE;
    old.nextId = 8;
    const sim = new Sim(old);
    const s = sim.s;
    const home = s.plots.find((p) => p.home === 0)!;
    const o = sim.world.plotOrigin(home);
    const drill = s.ents[7] as BuildE;
    assert.deepEqual([drill.tx, drill.ty], [o.tx + LEGACY_PLOT - 1 + PAD, o.ty + 4 + PAD]);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) assert.equal(sim.world.occAt(drill.tx + x, drill.ty + y), drill.id, 'the whole footprint is still solid and in one piece');

    const nodes = Object.values(s.ents).filter((e): e is NodeE => e.k === 'node' && e.plot === home.i);
    assert.ok(nodes.length >= 7, `${nodes.length} nodes now on the patch`);
    assert.equal(home.nodes, nodes.length, 'the patch counts them');
    const spots = new Set<string>();
    for (const n of nodes.filter((n) => n.id > 7)) {
        const inCore = n.tx >= o.tx + PAD && n.tx < o.tx + PAD + LEGACY_PLOT && n.ty >= o.ty + PAD && n.ty < o.ty + PAD + LEGACY_PLOT;
        assert.ok(!inCore, 'new nodes only go on the new border');
        assert.ok(n.tx > o.tx && n.tx < o.tx + PLOT - 1 && n.ty > o.ty && n.ty < o.ty + PLOT - 1, 'and on land');
        assert.ok(sim.world.isLand(n.tx, n.ty));
        assert.ok(!spots.has(`${n.tx},${n.ty}`), 'one to a tile'); spots.add(`${n.tx},${n.ty}`);
        assert.ok(!(n.tx >= drill.tx && n.tx < drill.tx + bw && n.ty >= drill.ty && n.ty < drill.ty + bh), 'not under the drill');
    }
    // ore: what was there came along, and every vein is on its own patch
    assert.ok(home.veins!.some(([tx, ty]) => tx === o.tx + 3 + PAD && ty === o.ty + 4 + PAD), 'the old vein is where the old land went');
    for (const p of s.plots) for (const [tx, ty] of p.veins ?? []) {
        assert.equal(Math.floor(tx / PLOT) - SEA, p.gx); assert.equal(Math.floor(ty / PLOT) - SEA, p.gy);
    }
    assert.ok(s.nextId > Math.max(...Object.keys(s.ents).map(Number)), 'ids are not reused');
    assert.equal(s.plots.filter((p) => !p.owned && !p.dread && p.nodes > 0).length, 0, 'land nobody owns has no nodes yet (bar the Dread Reaches)');
});

test('every patch is eighteen tiles across and a new home is stocked in proportion', () => {
    assert.equal(PLOT, 18);
    const sim = Sim.create('BIG-1', 'x');
    const p = sim.join('a', 'A')!;
    const h = sim.homePlot(p.slot), o = sim.world.plotOrigin(h);
    let land = 0;
    for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) if (sim.world.isLand(o.tx + x, o.ty + y)) land++;
    assert.ok(land >= PLOT * PLOT - 4, `${land} land tiles on a ${PLOT}×${PLOT} patch`);
    const nodes = Object.values(sim.s.ents).filter((e) => e.k === 'node' && e.plot === h.i).length;
    assert.ok(nodes >= 15, `a new home is stocked in proportion (${nodes})`);
});
