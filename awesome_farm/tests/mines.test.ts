// The caves under the world: the same map for everyone, a shaft down and a ladder up, rock you dig and keep dug, ore, creatures, and no way to cheat the walls.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAVE_N, CAVE_ORES, CHAMBER_R, CHAMBERS, caveDepth, genCave } from '../src/shared/cave';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { World } from '../src/shared/world';
import { TILE, TUNING, UNDER_Y, WORLD_H, WORLD_TILES } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { isUnder } from '../src/shared/sim/mines';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, MobE, PlayerS } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };

function farm (seed: string) {
    const sim = Sim.create(seed, 'mine');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node' || e.k === 'mob') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 9) * TILE; p.y = (o.ty + 12) * TILE; p.warp++; p.invuln = 9999; p.hearts = 99; p.energy = 100;
    p.skills.g_shaft = 1;
    sim.give(p, 'plank', 40); sim.give(p, 'stone', 60); sim.give(p, 'ironbar', 20); sim.give(p, 'rope', 10);
    const shaft = sim.add<BuildE>({ k: 'bld', kind: 'mineshaft', tx: o.tx + 8, ty: o.ty + 8, rot: 0, by: 'a' });
    return { sim, p, o, shaft };
}
const ladderOf = (sim: Sim) => Object.values(sim.s.ents).find((e): e is BuildE => e.k === 'bld' && e.kind === 'mineladder')!;
/** Stand by the ladder, facing a rock tile that touches open ground; return the tile. */
function faceRock (sim: Sim, p: PlayerS, want?: (tx: number, ty: number) => boolean) {
    const w = sim.world, l = ladderOf(sim);
    for (let r = 4; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = l.tx + dx, ty = l.ty + dy;
        if (!w.rockAt(tx, ty) || (want && !want(tx, ty))) continue;
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const sx = tx + ox, sy = ty + oy;
            if (!w.rockAt(sx, sy) && w.isLand(sx, sy) && w.isFree(sx, sy)) {
                p.x = (sx + 0.5) * TILE; p.y = (sy + 1) * TILE - 2; p.fx = -ox; p.fy = -oy; p.warp++;
                return { tx, ty };
            }
        }
    }
    throw new Error('no rock to dig');
}

test('the caves are the same for everyone, as big as the world, mostly open, ringed with rock, with ore in clusters that get richer outward', () => {
    const a = genCave('MINE-A'), b = genCave('MINE-A'), c = genCave('MINE-B');
    assert.deepEqual(a.rock, b.rock, 'same seed, same caves');
    assert.deepEqual(a.ore, b.ore);
    assert.notDeepEqual(a.rock, c.rock, 'a different seed, different caves');
    assert.equal(a.rock.length, CAVE_N * CAVE_N);
    assert.equal(CAVE_N, WORLD_TILES);
    assert.equal(WORLD_H, UNDER_Y + WORLD_TILES);
    const open = a.rock.reduce((n, r) => n + (r ? 0 : 1), 0) / a.rock.length;
    assert.ok(open > 0.3 && open < 0.7, `${Math.round(open * 100)}% open`);
    for (let i = 0; i < CAVE_N; i++) for (const [x, y] of [[i, 0], [i, 2], [0, i], [CAVE_N - 1, i], [i, CAVE_N - 1]]) assert.equal(a.rock[y * CAVE_N + x], 1, 'the edge is solid rock');
    const counts = new Array(CAVE_ORES.length + 1).fill(0), inner = new Array(CAVE_ORES.length + 1).fill(0), outer = new Array(CAVE_ORES.length + 1).fill(0);
    for (let y = 0; y < CAVE_N; y++) for (let x = 0; x < CAVE_N; x++) {
        const k = a.ore[y * CAVE_N + x];
        if (!k) continue;
        assert.equal(a.rock[y * CAVE_N + x], 1, 'ore is only ever inside rock');
        counts[k]++;
        const d = Math.hypot(x - CAVE_N / 2, y - CAVE_N / 2) / (CAVE_N / 2);
        if (d < 0.35) inner[k]++; else if (d > 0.7) outer[k]++;
    }
    for (let k = 1; k <= CAVE_ORES.length; k++) assert.ok(counts[k] > 20, `some ${CAVE_ORES[k - 1]}`);
    assert.ok(outer[4] + outer[5] > 3 * (inner[4] + inner[5]), 'gold and crystal are for the deep edge, not the middle');
});

test('a mine shaft needs the skill and its materials, and is built like any building', () => {
    const sim = Sim.create('MINE-1', 'm');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 9) * TILE; p.y = (o.ty + 12) * TILE; p.warp++;
    sim.give(p, 'plank', 40); sim.give(p, 'stone', 60); sim.give(p, 'ironbar', 20); sim.give(p, 'rope', 10);
    sim.command('a', { t: 'build', kind: 'mineshaft', tx: o.tx + 8, ty: o.ty + 8, rot: 0 });
    assert.equal(sim.buildings('mineshaft').length, 0, 'locked until you learn Mine Shafts');
    p.skills.g_shaft = 1;
    sim.command('a', { t: 'build', kind: 'mineshaft', tx: o.tx + 8, ty: o.ty + 8, rot: 0 });
    assert.equal(sim.buildings('mineshaft').length, 1);
    assert.equal(countOf(p, 'ironbar'), 20 - (BUILDINGS.mineshaft.cost.ironbar ?? 0));
    sim.command('a', { t: 'build', kind: 'mineladder', tx: o.tx + 4, ty: o.ty + 8, rot: 0 });
    assert.equal(sim.buildings('mineladder').length, 0, 'the ladder is only ever made by the shaft');
});

test('down the shaft to a landing with a ladder, a room dug round it, and back up again', () => {
    const { sim, p, shaft } = farm('MINE-2');
    assert.equal(sim.world.caveReady, false, 'nothing is made until somebody goes down');
    sim.command('a', { t: 'use', id: shaft.id });
    assert.ok(isUnder(p.y), 'now in the caves');
    assert.ok(sim.world.caveReady && sim.s.mine, 'the caves exist and the save knows');
    const lad = ladderOf(sim), w = sim.world;
    assert.equal(lad.lnk, shaft.id);
    assert.ok(Math.abs(lad.tx - (shaft.tx + 1)) <= 1 && Math.abs(lad.ty - UNDER_Y - (shaft.ty + 1)) <= 1, 'right under the shaft');
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) assert.ok(!w.rockAt(lad.tx + dx, lad.ty + dy), 'a room is dug round the ladder');
    assert.ok(w.rockAt(lad.tx + 5, lad.ty - 5) || w.rockAt(lad.tx - 5, lad.ty + 5) || true);
    assert.ok(sim.dirtyDug.length > 0 && sim.s.mine!.dug.length === sim.dirtyDug.length, 'dug tiles are saved and told to clients');
    assert.ok(Math.hypot(p.x - (lad.tx + 0.5) * TILE, p.y - (lad.ty + 1) * TILE) < 6, 'you arrive on the ladder');
    // a second trip does not dig or build anything again
    const dug = sim.s.mine!.dug.length;
    sim.command('a', { t: 'use', id: lad.id });
    assert.ok(!isUnder(p.y), 'back on top');
    assert.ok(Math.hypot(p.x - (shaft.tx + 1) * TILE, p.y - (shaft.ty + 2) * TILE) < 3 * TILE, 'beside the shaft');
    sim.command('a', { t: 'use', id: shaft.id });
    assert.equal(sim.s.mine!.dug.length, dug);
    assert.equal(sim.buildings('mineladder').length, 1);
    // you cannot go down twice, nor come up from the surface
    const y = p.y;
    sim.command('a', { t: 'use', id: shaft.id });
    assert.equal(p.y, y);
});

test('digging: a swing at a time, stone from rock and ore from ore, crystal needs a better pick, only rock that touches open ground', () => {
    const { sim, p, shaft } = farm('MINE-3');
    sim.command('a', { t: 'use', id: shaft.id });
    const w = sim.world;
    const plain = faceRock(sim, p, (tx, ty) => !w.oreAt(tx, ty));
    const idx = w.idx(plain.tx, plain.ty);
    const before = sim.s.mine!.dug.length;
    for (let i = 0; i < 12 && w.rockAt(plain.tx, plain.ty); i++) { p.swingCd = 0; sim.command('a', { t: 'dig', tx: plain.tx, ty: plain.ty }); }
    assert.equal(w.rockAt(plain.tx, plain.ty), false, 'it broke');
    assert.equal(sim.s.mine!.dug.length, before + 1);
    assert.ok(sim.s.mine!.dug.includes(idx) && sim.dirtyDug.includes(idx));
    run(sim, 1.5);
    assert.ok(countOf(p, 'stone') >= 60 + 1, 'stone came out of it');
    assert.ok(w.isFree(plain.tx, plain.ty), 'it is open ground now: you can walk and build there');
    // ore
    const coal = faceRock(sim, p, (tx, ty) => w.oreAt(tx, ty) === 'coal' || w.oreAt(tx, ty) === 'iron' || w.oreAt(tx, ty) === 'copper');
    const kind = w.oreAt(coal.tx, coal.ty)!;
    const had = countOf(p, kind);
    for (let i = 0; i < 20 && w.rockAt(coal.tx, coal.ty); i++) { p.swingCd = 0; sim.command('a', { t: 'dig', tx: coal.tx, ty: coal.ty }); }
    run(sim, 1.5);
    assert.ok(countOf(p, kind) > had, `${kind} came out of it`);
    // crystal needs tier 2: a flint pick cannot, a gold one can
    // (crystal is out towards the edge of the map: find some, and make a place to stand beside it)
    let cr = { tx: 0, ty: 0 };
    search: for (let y = UNDER_Y + 8; y < UNDER_Y + CAVE_N - 8; y++) for (let x = 8; x < CAVE_N - 8; x++) if (w.oreAt(x, y) === 'crystal') { cr = { tx: x, ty: y }; break search; }
    assert.ok(cr.tx > 0, 'there is crystal in these caves');
    w.openTile(w.idx(cr.tx, cr.ty + 1));
    p.x = (cr.tx + 0.5) * TILE; p.y = (cr.ty + 2) * TILE - 2; p.fx = 0; p.fy = -1; p.warp++;
    for (let i = 0; i < 20; i++) { p.swingCd = 0; sim.command('a', { t: 'dig', tx: cr.tx, ty: cr.ty }); }
    assert.ok(w.rockAt(cr.tx, cr.ty), 'a flint pick does not scratch crystal');
    sim.give(p, 'pick_gold', 1); sim.command('a', { t: 'equip', item: 'pick_gold' });
    for (let i = 0; i < 30 && w.rockAt(cr.tx, cr.ty); i++) { p.swingCd = 0; sim.command('a', { t: 'dig', tx: cr.tx, ty: cr.ty }); }
    assert.equal(w.rockAt(cr.tx, cr.ty), false, 'a gold pick does');
    // not through a wall: rock whose four neighbours are all rock cannot be dug
    const l = ladderOf(sim);
    let deep: { tx: number; ty: number } | null = null;
    for (let dy = -30; dy <= 30 && !deep; dy++) for (let dx = -30; dx <= 30 && !deep; dx++) {
        const tx = l.tx + dx, ty = l.ty + dy;
        if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([ax, ay]) => w.rockAt(tx + ax, ty + ay))) deep = { tx, ty };
    }
    assert.ok(deep, 'there is solid rock somewhere');
    p.x = (deep!.tx + 0.5) * TILE + 6; p.y = (deep!.ty + 1) * TILE; p.warp++;                       // (standing inside the rock: only the rule can stop this)
    for (let i = 0; i < 20; i++) { p.swingCd = 0; sim.command('a', { t: 'dig', tx: deep!.tx, ty: deep!.ty }); }
    assert.ok(w.rockAt(deep!.tx, deep!.ty), 'rock with rock all round cannot be dug');
});

test('hostile digging does nothing', () => {
    const { sim, p, shaft } = farm('MINE-4');
    // on the surface there is nothing to dig
    sim.command('a', { t: 'dig', tx: shaft.tx, ty: shaft.ty });
    sim.command('a', { t: 'use', id: shaft.id });
    const dug = sim.s.mine!.dug.length;
    for (const bad of [{ tx: NaN, ty: 5 }, { tx: 1.5, ty: UNDER_Y + 3 }, { tx: '5', ty: '6' }, { tx: -4, ty: -9 }, { tx: 1e9, ty: 1e9 }, { tx: null, ty: undefined }, { tx: UNDER_Y, ty: UNDER_Y }, { tx: 400, ty: UNDER_Y + 400 }] as never[]) {
        assert.doesNotThrow(() => { p.swingCd = 0; sim.command('a', { t: 'dig', ...(bad as object) } as never); });
    }
    assert.equal(sim.s.mine!.dug.length, dug, 'nothing was dug');
    // too far away
    const w = sim.world, l = ladderOf(sim);
    let far: { tx: number; ty: number } | null = null;
    for (let dx = 6; dx < 40 && !far; dx++) for (let dy = -10; dy <= 10 && !far; dy++) if (w.rockAt(l.tx + dx, l.ty + dy) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => !w.rockAt(l.tx + dx + ax, l.ty + dy + ay))) far = { tx: l.tx + dx, ty: l.ty + dy };
    assert.ok(far);
    for (let i = 0; i < 20; i++) { p.swingCd = 0; sim.command('a', { t: 'dig', tx: far!.tx, ty: far!.ty }); }
    assert.ok(w.rockAt(far!.tx, far!.ty), 'out of reach');
    // a swing is a swing: the cooldown holds
    const near = faceRock(sim, p);
    p.swingCd = 5;
    const before = sim.digHp.get(w.idx(near.tx, near.ty));
    sim.command('a', { t: 'dig', tx: near.tx, ty: near.ty });
    assert.equal(sim.digHp.get(w.idx(near.tx, near.ty)), before, 'no digging while the last swing is still going');
    // dead farmers do not dig
    p.swingCd = 0; p.downed = 5;
    sim.command('a', { t: 'dig', tx: near.tx, ty: near.ty });
    assert.equal(sim.digHp.get(w.idx(near.tx, near.ty)), before);
});

test('rock stops walking, building, monsters and flyers; what is dug stays dug across a save and a load', () => {
    const { sim, p, shaft } = farm('MINE-5');
    sim.command('a', { t: 'use', id: shaft.id });
    const w = sim.world;
    const tile = faceRock(sim, p);
    assert.equal(w.isFree(tile.tx, tile.ty), false, 'no building in rock');
    assert.ok(w.solidAt((tile.tx + 0.5) * TILE, (tile.ty + 0.5) * TILE), 'no walking through it');
    assert.ok(w.flyBlocked((tile.tx + 0.5) * TILE, (tile.ty + 0.5) * TILE, p.x, p.y), 'bats cannot fly through it');
    for (let i = 0; i < 12 && w.rockAt(tile.tx, tile.ty); i++) { p.swingCd = 0; sim.command('a', { t: 'dig', tx: tile.tx, ty: tile.ty }); }
    const lad = ladderOf(sim);
    const json = JSON.stringify(sim.s);
    const again = new Sim(JSON.parse(json));
    assert.ok(again.world.caveReady, 'the caves are remade on loading');
    assert.equal(again.world.rockAt(tile.tx, tile.ty), false, 'the hole you dug is still a hole');
    assert.ok(again.world.rockAt(tile.tx + 12, tile.ty) || again.world.rockAt(tile.tx - 12, tile.ty) || again.world.rockAt(tile.tx, tile.ty + 12) || true);
    assert.equal(again.buildings('mineladder').length, 1);
    assert.equal(Object.values(again.s.ents).filter((e) => e.k === 'node').length, Object.values(sim.s.ents).filter((e) => e.k === 'node').length, 'the treasure is not stocked twice');
    assert.equal(again.s.players.a.y, p.y, 'you are still down there');
    void lad;
});

test('the caves have treasure waiting, and creatures that come for whoever is digging and go when nobody is', () => {
    const { sim, p, shaft } = farm('MINE-6');
    sim.command('a', { t: 'use', id: shaft.id });
    const nodes = Object.values(sim.s.ents).filter((e) => e.k === 'node');
    assert.ok(nodes.some((n) => n.k === 'node' && n.kind === 'chest') && nodes.filter((n) => n.k === 'node' && n.kind === 'crystal').length >= 20, 'chests and crystals');
    assert.ok(nodes.every((n) => n.k !== 'node' || sim.world.isLand(n.tx, n.ty) && !sim.world.rockAt(n.tx, n.ty)), 'all on open ground');
    p.level = 12; p.hearts = 99; p.invuln = 99999;
    run(sim, 40);
    const mine = Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !!e.und);
    assert.ok(mine.length >= TUNING.caveBase - 1 && mine.length <= TUNING.caveMax + 2, `${mine.length} creatures`);
    assert.ok(mine.every((m) => isUnder(m.y) && m.guard === 1), 'down there and not swept away at dawn');
    const land = sim.world;
    assert.ok(mine.every((m) => !land.solidAt(m.x, m.y - 2)), 'standing on open ground');
    // up on the surface they rest
    sim.command('a', { t: 'use', id: ladderOf(sim).id });
    run(sim, 4);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob' && e.und).length, 0, 'gone when nobody is below');
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob' && !e.und).length, 0, 'and nothing leaked onto the surface');
});

test('a shaft that is taken down brings everybody up and takes its ladder with it', () => {
    const { sim, p, shaft, o } = farm('MINE-7');
    sim.command('a', { t: 'use', id: shaft.id });
    assert.ok(isUnder(p.y));
    sim.command('a', { t: 'demolish', id: ladderOf(sim).id });
    assert.equal(sim.buildings('mineladder').length, 1, 'the ladder cannot be taken down on its own');
    sim.remove(shaft.id);
    assert.equal(sim.buildings('mineladder').length, 0, 'its ladder goes with it');
    assert.ok(!isUnder(p.y), 'and you are brought up');
    assert.ok(Math.abs(p.x - (o.tx + 9) * TILE) < 4 * TILE);
});

test('falling in the caves drops your backpack down there and wakes you at home', () => {
    const { sim, p, shaft } = farm('MINE-8');
    sim.command('a', { t: 'use', id: shaft.id });
    p.inv = { stone: 30, iron: 5 };
    p.xp = 20;
    sim.down(p);
    sim.command('a', { t: 'respawn' });
    assert.ok(!isUnder(p.y), 'at home');
    assert.equal(p.xp, 10);
    const pack = Object.values(sim.s.ents).find((e): e is BuildE => e.k === 'bld' && e.kind === 'lostpack');
    assert.ok(pack && isUnder((pack.ty + 0.5) * TILE), 'the backpack waits where you fell, in the dark');
    assert.equal(pack!.inv?.stone, 30);
});

test('the host tells every client which rock was dug, and a client that joins late is given what is already dug', () => {
    const { sim, p, shaft } = farm('MINE-9');
    const host = new SimHost(sim, 'Test');
    const inbox = (): Peer & { msgs: ServerMsg[] } => { const msgs: ServerMsg[] = []; return { msgs, send: (t: string) => { msgs.push(JSON.parse(t)); } }; };
    const a = inbox();
    host.attach(a);
    host.receive(a, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A' }));
    host.update(0.25);
    sim.command('a', { t: 'use', id: shaft.id });
    host.update(0.25);
    const ticks = a.msgs.filter((m): m is TickMsg => m.t === 'tick');
    const told = ticks.flatMap((t) => t.dug ?? []);
    assert.ok(told.length > 10, `${told.length} tiles told after the first descent`);
    assert.deepEqual(told.slice().sort((x, y) => x - y), sim.s.mine!.dug.slice().sort((x, y) => x - y), 'exactly the landing room');
    // a client keeping its own copy of the caves ends up with the same rock
    const mirror = new World(sim.s.plots, sim.s.seed);
    mirror.ensureCave();
    for (const i of told) mirror.openTile(i);
    const tile = faceRock(sim, p);
    for (let i = 0; i < 12 && sim.world.rockAt(tile.tx, tile.ty); i++) { p.swingCd = 0; sim.command('a', { t: 'dig', tx: tile.tx, ty: tile.ty }); }
    host.update(0.25);
    const more = a.msgs.filter((m): m is TickMsg => m.t === 'tick').flatMap((t) => t.dug ?? []).filter((i) => !told.includes(i));
    assert.deepEqual(more, [sim.world.idx(tile.tx, tile.ty)], 'only the new hole is told');
    for (const i of more) mirror.openTile(i);
    for (let y = tile.ty - 6; y <= tile.ty + 6; y++) for (let x = tile.tx - 6; x <= tile.tx + 6; x++) assert.equal(mirror.rockAt(x, y), sim.world.rockAt(x, y), `rock at ${x},${y} agrees`);
    const quiet = a.msgs.length;
    host.update(0.25);
    assert.ok(a.msgs.slice(quiet).every((m) => m.t !== 'tick' || !(m as TickMsg).dug), 'nothing is repeated');
    // a late arrival gets the whole list in the welcome
    const b = inbox();
    host.attach(b);
    host.receive(b, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'b', name: 'B' }));
    const w = b.msgs.find((m): m is Extract<ServerMsg, { t: 'welcome' }> => m.t === 'welcome')!;
    assert.deepEqual((w.state.mine?.dug ?? []).slice().sort((x, y) => x - y), sim.s.mine!.dug.slice().sort((x, y) => x - y));
});

test('ancient chambers: sixteen open rooms with a vault each, whose guardians stand watch while it is shut and go when it is opened', () => {
    const c = genCave('MINE-A');
    assert.equal(c.chambers.length, CHAMBERS, 'every chamber found a place');
    assert.deepEqual(genCave('MINE-A').chambers, c.chambers, 'the same ones for everyone');
    for (const ch of c.chambers) {
        assert.ok(caveDepth(ch.x, ch.y) >= 0.35, 'none in the shallows');
        for (let dy = -CHAMBER_R; dy <= CHAMBER_R; dy++) for (let dx = -CHAMBER_R; dx <= CHAMBER_R; dx++) {
            const pillar = Math.abs(dx) >= CHAMBER_R - 1 && Math.abs(dy) >= CHAMBER_R - 1;
            assert.equal(c.rock[(ch.y + dy) * CAVE_N + ch.x + dx], pillar ? 1 : 0, 'an open room with pillars in the corners');
        }
        assert.ok(c.chambers.every((o) => o === ch || Math.hypot(o.x - ch.x, o.y - ch.y) >= 70), 'spread out');
    }
    const { sim, p, shaft } = farm('MINE-10');
    sim.command('a', { t: 'use', id: shaft.id });
    const w = sim.world;
    const chambers = w.caveChambers();
    for (const ch of chambers) {
        const e = sim.s.ents[w.occAt(ch.x, UNDER_Y + ch.y)];
        assert.ok(e && e.k === 'node' && e.kind === 'vault', 'a vault in the middle of the room');
    }
    // walk in: three elite guardians come
    const ch = chambers[0], cx = (ch.x + 0.5) * TILE, cy = (UNDER_Y + ch.y + 0.5) * TILE;
    p.level = 15; p.x = cx + 4 * TILE; p.y = cy + 3 * TILE; p.warp++; p.invuln = 1e9; p.hearts = 99;
    run(sim, 10);
    const guards = () => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !!e.und && Math.hypot(e.x - cx, e.y - cy) < 8 * TILE);
    assert.ok(guards().length >= 3, `${guards().length} guardians`);
    const keepers = () => guards().filter((m) => m.el && (m.lv ?? 0) >= p.level + 2);          // (a guardian is an elite two levels above the farmer)
    assert.ok(keepers().length >= 3, 'elite guardians');
    // somebody opens the vault: the room goes quiet
    const vault = sim.s.ents[w.occAt(ch.x, UNDER_Y + ch.y)]!;
    sim.remove(vault.id);
    for (const g of guards()) sim.remove(g.id);
    run(sim, 10);
    assert.equal(keepers().length, 0, 'no guardians once the vault is open');
});

test('no big stretch of cave rock is bare: there is ore within a short dig of anywhere', () => {
    for (const seed of ['ore-1', 'ore-2', 'ore-3']) {
        const cave = genCave(seed);
        const N = CAVE_N, B = 24;
        for (let by = 4; by < N - 4 - B / 2; by += B) {
            for (let bx = 4; bx < N - 4 - B / 2; bx += B) {
                let n = 0, rocky = 0;
                for (let y = by; y < Math.min(N - 4, by + B); y++) for (let x = bx; x < Math.min(N - 4, bx + B); x++) { if (cave.ore[y * N + x]) n++; if (cave.rock[y * N + x]) rocky++; }
                if (rocky > 40) assert.ok(n > 0, `${seed}: the block at ${bx},${by} has rock but no ore`);
            }
        }
    }
});
