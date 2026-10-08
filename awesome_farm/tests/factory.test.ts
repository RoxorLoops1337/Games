// Automation: veins, drills, belts, inserters, power, assemblers, and area-of-interest streaming.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLOT, TILE, TUNING } from '../src/shared/config';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { sunlight } from '../src/shared/daylight';
import { BUILDINGS } from '../src/shared/data/buildings';
import { TUNNEL_RANGE, tunnelPartner } from '../src/shared/sim/factory';
import { buildPowerGraph, netStats } from '../src/shared/sim/power';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, Ent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds; t += STEP) sim.step(STEP); };

/** A clean home plot: nodes removed, returns its origin tile. */
function yard (sim: Sim, id = 'a') {
    const p = sim.join(id, id.toUpperCase())!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;       // the yards are laid out in the corner of the patch, so stand there
    return { p, o };
}
function put (sim: Sim, kind: BuildE['kind'], tx: number, ty: number, extra: Partial<BuildE> = {}) {
    return sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot: 0, by: 'a', ...extra });
}
const chest = (sim: Sim, tx: number, ty: number) => put(sim, 'chest', tx, ty, { inv: {} });
const belt = (sim: Sim, tx: number, ty: number, rot = 0) => put(sim, 'belt', tx, ty, { rot, belt: [null, null, null] });
const inserter = (sim: Sim, tx: number, ty: number, rot = 0, extra: Partial<BuildE> = {}) => put(sim, 'inserter', tx, ty, { rot, ...extra });
const pole = (sim: Sim, tx: number, ty: number) => put(sim, 'pole', tx, ty);
const turbine = (sim: Sim, tx: number, ty: number) => put(sim, 'windturbine', tx, ty);

test('every plot has veins, and home plots start with the basics for a first drill', () => {
    const sim = Sim.create('F-1', 'f');
    assert.ok(sim.s.plots.every((p) => p.owned || p.dread || p.veins === undefined), 'land nobody owns carries no ore: it stays out of the save');
    const p = sim.join('a', 'A')!;
    const home = sim.homePlot(p.slot);
    const kinds = new Set(home.veins!.map((v) => v[2]));
    for (const k of ['stone', 'coal', 'iron', 'copper']) assert.ok(kinds.has(k as never), `home has ${k}`);
    const o = sim.world.plotOrigin(home);
    for (const [x, y] of home.veins!) assert.ok(x > o.tx && x < o.tx + PLOT - 1 && y > o.ty && y < o.ty + PLOT - 1, 'veins stay inside the plot');
    const v = home.veins![0];
    assert.equal(sim.world.veinAt(v[0], v[1]), v[2]);

    // land that is bought gets its ore then, the same ore on every machine (it comes from the seed), and the save stays small
    p.coins = 99999;
    const next = sim.world.purchasable()[0];
    sim.command(p.id, { t: 'buy', plot: next.i });
    assert.ok(next.owned && (next.veins?.length ?? 0) >= 3, 'a bought plot has ore');
    assert.ok(JSON.stringify(sim.s).length < 450_000, `a new world's save is ${JSON.stringify(sim.s).length} bytes`);
});

test('a powered drill mines its vein into the chest in front of it', () => {
    const sim = Sim.create('F-2', 'f');
    const { o } = yard(sim);
    const plot = sim.world.plotAt(o.tx + 1, o.ty + 1)!;
    plot.veins = [[o.tx + 3, o.ty + 3, 'iron'], [o.tx + 4, o.ty + 3, 'iron'], [o.tx + 3, o.ty + 4, 'iron'], [o.tx + 4, o.ty + 4, 'iron']];
    const drill = put(sim, 'drill', o.tx + 3, o.ty + 3, { rot: 0, out: {} });
    const box = chest(sim, o.tx + 5, o.ty + 3);
    run(sim, 30);
    assert.equal(box.inv!.iron ?? 0, 0, 'no power, no ore');
    pole(sim, o.tx + 4, o.ty + 5);
    turbine(sim, o.tx + 6, o.ty + 6);
    run(sim, 40);
    assert.ok((box.inv!.iron ?? 0) >= 5, `mined ${box.inv!.iron} iron`);
    assert.ok((drill.pw ?? 0) > 0.2, 'drill is powered');
    assert.ok((sim.s.prod?.iron ?? 0) >= 5, 'production is counted');
});

test('a drill with one tile of ore is much slower than one on four', () => {
    const sim = Sim.create('F-3', 'f');
    const { o } = yard(sim);
    const plot = sim.world.plotAt(o.tx + 1, o.ty + 1)!;
    plot.veins = [[o.tx + 3, o.ty + 3, 'coal'], [o.tx + 4, o.ty + 3, 'coal'], [o.tx + 3, o.ty + 4, 'coal'], [o.tx + 4, o.ty + 4, 'coal'], [o.tx + 8, o.ty + 8, 'copper']];
    put(sim, 'drill', o.tx + 3, o.ty + 3, { rot: 0, out: {} });
    put(sim, 'drill', o.tx + 8, o.ty + 8, { rot: 0, out: {} });
    const a = chest(sim, o.tx + 5, o.ty + 3), b = chest(sim, o.tx + 10, o.ty + 8);
    pole(sim, o.tx + 6, o.ty + 6);
    turbine(sim, o.tx + 6, o.ty + 8); turbine(sim, o.tx + 8, o.ty + 4);
    run(sim, 60);
    const full = a.inv!.coal ?? 0, quarter = b.inv!.copper ?? 0;
    assert.ok(full >= 8, `full-cover drill made ${full}`);
    assert.ok(quarter >= 1 && quarter < full / 2, `one-tile drill made ${quarter}`);
});

test('belts carry items downstream and deliver them into whatever is at the end', () => {
    const sim = Sim.create('F-4', 'f');
    const { o } = yard(sim);
    const start = belt(sim, o.tx + 2, o.ty + 2, 0);
    for (let i = 1; i <= 5; i++) belt(sim, o.tx + 2 + i, o.ty + 2, 0);
    const box = chest(sim, o.tx + 8, o.ty + 2);
    start.belt = ['wood', null, null];
    run(sim, 6);
    assert.equal(box.inv!.wood, 1, 'the log rode the belt into the chest');
    assert.ok(sim.buildings('belt').every((b) => b.belt!.every((s) => !s)), 'belts are empty again');
});

test('belts turn corners and refuse to run head-on', () => {
    const sim = Sim.create('F-5', 'f');
    const { o } = yard(sim);
    const a = belt(sim, o.tx + 2, o.ty + 2, 0);        // east
    belt(sim, o.tx + 3, o.ty + 2, 1);                    // then south
    belt(sim, o.tx + 3, o.ty + 3, 1);
    const box = chest(sim, o.tx + 3, o.ty + 4);
    a.belt = ['stone', null, null];
    run(sim, 6);
    assert.equal(box.inv!.stone, 1, 'went around the corner');
    const head = belt(sim, o.tx + 6, o.ty + 6, 0);
    const wall = belt(sim, o.tx + 7, o.ty + 6, 2);       // faces back at it
    head.belt = [null, null, 'coal'];
    run(sim, 3);
    assert.equal(head.belt![2], 'coal', 'it waits instead of driving into an oncoming belt');
    assert.ok(!wall.belt!.some(Boolean));
});

/** source chest → inserter → belt → a junction piece at (5,2) facing east, with a chest on each open side. */
function junction (sim: Sim, kind: 'splitter' | 'sorter', stock: BuildE['inv'], extra: Partial<BuildE> = {}) {
    const { o } = yard(sim);
    const x = o.tx + 5, y = o.ty + 3;
    const src = chest(sim, x - 3, y); src.inv = { ...stock };
    inserter(sim, x - 2, y, 0);
    belt(sim, x - 1, y, 0);
    const piece = put(sim, kind, x, y, { rot: 0, belt: [null, null, null], ...extra });
    const front = chest(sim, x + 1, y), left = chest(sim, x, y - 1), right = chest(sim, x, y + 1);
    pole(sim, x - 2, y + 2); turbine(sim, x - 4, y + 4); turbine(sim, x - 1, y + 4);
    return { src, piece, front, left, right };
}
const total = (b: BuildE) => Object.values(b.inv ?? {}).reduce((a, n) => a + n, 0);

test('a splitter shares what arrives between forward, left and right, taking turns', () => {
    const sim = Sim.create('F-split', 'f');
    const j = junction(sim, 'splitter', { wood: 30 });
    run(sim, 90);
    const counts = [j.front, j.left, j.right].map((c) => c.inv!.wood ?? 0);
    assert.ok(counts.every((n) => n >= 6), `every side got a share: ${counts}`);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `an even split: ${counts}`);
    // with only the front connected it is just a belt
    const sim2 = Sim.create('F-split2', 'f');
    const k = junction(sim2, 'splitter', { wood: 12 });
    sim2.remove(k.left.id); sim2.remove(k.right.id);
    run(sim2, 60);
    assert.equal(k.front.inv!.wood, 12, 'a side with nothing there is skipped');
});

test('a sorter sends its filter item straight on and everything else to the sides', () => {
    const sim = Sim.create('F-sort', 'f');
    const j = junction(sim, 'sorter', { iron: 10, copper: 10 }, { flt: 'iron' });
    run(sim, 120);
    assert.equal(j.front.inv!.iron, 10, 'all the iron went straight on');
    assert.equal(j.front.inv!.copper ?? 0, 0, 'no copper went straight on');
    assert.equal((j.left.inv!.copper ?? 0) + (j.right.inv!.copper ?? 0), 10, 'the copper turned off');
    assert.equal((j.left.inv!.iron ?? 0) + (j.right.inv!.iron ?? 0), 0);
    assert.ok((j.left.inv!.copper ?? 0) >= 3 && (j.right.inv!.copper ?? 0) >= 3, 'and shared the sides');
    // nowhere to turn: it waits, it never throws anything away
    const sim2 = Sim.create('F-sort2', 'f');
    const k = junction(sim2, 'sorter', { copper: 4 }, { flt: 'iron' });
    sim2.remove(k.left.id); sim2.remove(k.right.id);
    run(sim2, 40);
    assert.equal(total(k.front), 0, 'copper does not sneak through');
    assert.ok(k.piece.belt!.includes('copper'), 'it is held on the sorter');
    // no filter set: it passes everything straight
    const sim3 = Sim.create('F-sort3', 'f');
    const m = junction(sim3, 'sorter', { iron: 3, copper: 3 });
    run(sim3, 60);
    assert.equal(total(m.front), 6);
});

test('a sorter takes its filter and facing from the config command, and ignores junk', () => {
    const sim = Sim.create('F-sort4', 'f');
    const { p, o } = yard(sim);
    const piece = put(sim, 'sorter', o.tx + 5, o.ty + 5, { rot: 0, belt: [null, null, null] });
    p.x = (o.tx + 5.5) * TILE; p.y = (o.ty + 6) * TILE;
    sim.command('a', { t: 'config', id: piece.id, flt: 'iron' });
    assert.equal(piece.flt, 'iron');
    sim.command('a', { t: 'config', id: piece.id, flt: 'not_an_item' as never });
    assert.equal(piece.flt, 'iron', 'junk is ignored');
    sim.command('a', { t: 'config', id: piece.id, flt: null });
    assert.equal(piece.flt, undefined);
    sim.command('a', { t: 'config', id: piece.id, rot: 1 });
    assert.equal(piece.rot, 1);
});

test('inserters move items from a chest into a furnace, and respect filters', () => {
    const sim = Sim.create('F-6', 'f');
    const { o } = yard(sim);
    const src = chest(sim, o.tx + 2, o.ty + 2);
    src.inv = { iron: 4, sand: 2, coal: 5 };
    pole(sim, o.tx + 4, o.ty + 4);
    turbine(sim, o.tx + 6, o.ty + 5);
    inserter(sim, o.tx + 3, o.ty + 2, 0);
    const furnace = put(sim, 'furnace', o.tx + 4, o.ty + 2, { inv: {}, out: {}, fin: {}, fuel: 0, prog: 0 });
    run(sim, 60);
    assert.ok((furnace.inv!.iron ?? 0) + (furnace.out!.ironbar ?? 0) >= 1, 'iron went in and started smelting');
    assert.ok((src.inv!.iron ?? 0) < 4);
    // a filter keeps everything else where it is
    const sim2 = Sim.create('F-6b', 'f');
    const y2 = yard(sim2);
    const s2 = chest(sim2, y2.o.tx + 2, y2.o.ty + 2); s2.inv = { stone: 3, wood: 3 };
    const d2 = chest(sim2, y2.o.tx + 4, y2.o.ty + 2);
    pole(sim2, y2.o.tx + 3, y2.o.ty + 4); turbine(sim2, y2.o.tx + 6, y2.o.ty + 5);
    inserter(sim2, y2.o.tx + 3, y2.o.ty + 2, 0, { flt: 'wood' });
    run(sim2, 40);
    assert.equal(d2.inv!.wood, 3);
    assert.equal(d2.inv!.stone ?? 0, 0);
});

test('an unpowered inserter does nothing; a coal generator powers a grid only while it is needed', () => {
    const sim = Sim.create('F-7', 'f');
    const { o } = yard(sim);
    const src = chest(sim, o.tx + 2, o.ty + 2); src.inv = { wood: 4 };
    const dst = chest(sim, o.tx + 4, o.ty + 2);
    inserter(sim, o.tx + 3, o.ty + 2, 0);
    run(sim, 10);
    assert.equal(dst.inv!.wood ?? 0, 0, 'no pole, no movement');
    pole(sim, o.tx + 3, o.ty + 4);
    const gen = put(sim, 'coalgen', o.tx + 5, o.ty + 5, { fin: { coal: 2 }, fuel: 0 });
    run(sim, 30);
    assert.ok((dst.inv!.wood ?? 0) >= 3, 'the generator got things moving');
    assert.ok((gen.fin!.coal ?? 0) < 2, 'and burned some coal');
    run(sim, 30);
    const coalAfterIdle = gen.fin!.coal ?? 0;
    run(sim, 60);
    assert.equal(gen.fin!.coal ?? 0, coalAfterIdle, 'with nothing drawing power it stops burning');
});

test('machines slow down when the grid is overloaded', () => {
    const sim = Sim.create('F-8', 'f');
    const { o } = yard(sim);
    pole(sim, o.tx + 5, o.ty + 5); pole(sim, o.tx + 5, o.ty + 9);
    turbine(sim, o.tx + 8, o.ty + 5);                       // ~27 units of wind
    const drills = [put(sim, 'drill', o.tx + 2, o.ty + 3, { out: {} }), put(sim, 'drill', o.tx + 2, o.ty + 6, { out: {} }), put(sim, 'drill', o.tx + 2, o.ty + 9, { out: {} })];
    const plot = sim.world.plotAt(o.tx + 1, o.ty + 1)!;
    plot.veins = drills.flatMap((d) => [[d.tx, d.ty, 'iron'], [d.tx + 1, d.ty, 'iron'], [d.tx, d.ty + 1, 'iron'], [d.tx + 1, d.ty + 1, 'iron']] as never);
    run(sim, 5);
    const g = buildPowerGraph(sim.buildings());
    assert.equal(g.nets.length, 1, 'both poles are one net');
    assert.ok(drills.every((d) => (d.pw ?? 1) <= 0.5), `60 units of drills on ~27 units of wind: pw ${drills.map((d) => d.pw)}`);
});

test('an assembler builds the recipe it is set to from what inserters feed it', () => {
    const sim = Sim.create('F-9', 'f');
    const { p, o } = yard(sim);
    p.skills.i_asm = 1; p.skills.i_eng = 1;
    pole(sim, o.tx + 5, o.ty + 4);
    turbine(sim, o.tx + 8, o.ty + 4); turbine(sim, o.tx + 8, o.ty + 7);
    const input = chest(sim, o.tx + 2, o.ty + 2); input.inv = { ironbar: 8 };
    inserter(sim, o.tx + 3, o.ty + 2, 0);
    const asm = put(sim, 'assembler', o.tx + 4, o.ty + 2, { inv: {}, out: {}, fuel: 0, prog: 0 });
    sim.command('a', { t: 'config', id: asm.id, sel: 'assembler:gear' });
    assert.equal(asm.sel, 'assembler:gear');
    const out = chest(sim, o.tx + 7, o.ty + 2);
    inserter(sim, o.tx + 6, o.ty + 2, 0);
    run(sim, 60);
    assert.ok((out.inv!.gear ?? 0) >= 3, `gears made: ${out.inv!.gear}`);
    assert.ok((sim.s.prod?.gear ?? 0) >= 3);
    // unlock gating: assemblers only run recipes their owner has unlocked
    const sim2 = Sim.create('F-9b', 'f');
    const y2 = yard(sim2);
    pole(sim2, y2.o.tx + 5, y2.o.ty + 4); turbine(sim2, y2.o.tx + 8, y2.o.ty + 4);
    const a2 = put(sim2, 'assembler', y2.o.tx + 4, y2.o.ty + 2, { inv: { wire: 6, ironbar: 4, glass: 4 }, out: {}, fuel: 0, prog: 0, sel: 'assembler:circuit' });
    run(sim2, 20);
    assert.equal(a2.out!.circuit ?? 0, 0, 'circuits need Engineering');
});

test('area of interest: players are only sent what is near them', () => {
    const sim = Sim.create('F-10', 'f');
    const host = new SimHost(sim, 'T');
    const peer = (): Peer & { msgs: ServerMsg[] } => { const msgs: ServerMsg[] = []; return { msgs, send: (t: string) => msgs.push(JSON.parse(t)) }; };
    const a = peer();
    host.attach(a);
    host.receive(a, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A' }));
    const welcome = a.msgs[0] as Extract<ServerMsg, { t: 'welcome' }>;
    const me = sim.s.players.a;
    const farAway = sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: Math.floor(me.x / TILE) + 80, ty: Math.floor(me.y / TILE), rot: 0, inv: {} });
    const closeBy = sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: Math.floor(me.x / TILE) + 4, ty: Math.floor(me.y / TILE) + 4, rot: 0, inv: {} });
    assert.ok(Object.keys(welcome.state.ents).length > 5, 'the home island came with the welcome');
    host.update(0.15);
    const ticks = () => a.msgs.filter((m): m is TickMsg => m.t === 'tick');
    const ids = (t: TickMsg) => t.ents.map((e: Ent) => e.id);
    assert.ok(ticks().some((t) => ids(t).includes(closeBy.id)), 'near chest streamed');
    assert.ok(!ticks().some((t) => ids(t).includes(farAway.id)), 'far chest not streamed');
    me.x += 80 * TILE * 0.9;
    host.update(0.15);
    assert.ok(ticks().some((t) => ids(t).includes(farAway.id)), 'now it is near');
    me.x -= 80 * TILE * 0.9;
    host.update(0.15);
    assert.ok(ticks().some((t) => t.gone.includes(farAway.id)), 'and it is withdrawn again');
});

test('underground belts: items dive at the entrance, surface at the matching exit, and pass under whatever is in between', () => {
    const sim = Sim.create('F-tun', 'f');
    const { o } = yard(sim);
    const y = o.ty + 3;
    const start = belt(sim, o.tx + 2, y, 0);
    const entrance = put(sim, 'tunnel', o.tx + 3, y, { rot: 0, belt: [null, null, null] });
    const wall = chest(sim, o.tx + 5, y);                                     // a chest right in the way
    const cross = belt(sim, o.tx + 4, y - 1, 1);                              // and a belt crossing the path
    cross.belt = [null, null, null];
    const exit = put(sim, 'tunnelx', o.tx + 7, y, { rot: 0, belt: [null, null, null] });
    belt(sim, o.tx + 8, y, 0);
    const box = chest(sim, o.tx + 9, y);
    start.belt = ['wood', 'stone', null];
    run(sim, 10);
    assert.equal(box.inv!.wood, 1, 'the log came out the other side');
    assert.equal(box.inv!.stone, 1, 'and the stone');
    assert.equal(total(wall), 0, 'nothing went into the chest on top');
    assert.ok(sim.buildings('tunnel').concat(sim.buildings('tunnelx')).every((t) => t.belt!.every((s) => !s)), 'the tunnel is empty again');
    // a long line keeps flowing in order
    start.belt = [null, null, null];
    for (let i = 0; i < 6; i++) { start.belt = ['coal', null, null]; run(sim, 1.2); }
    run(sim, 6);
    assert.equal(box.inv!.coal, 6);
    assert.equal(entrance.belt!.filter(Boolean).length + exit.belt!.filter(Boolean).length, 0);
});

test('underground belts pair by facing and range, never across their own kind', () => {
    const sim = Sim.create('F-tun2', 'f');
    const { o } = yard(sim);
    const at = (tx: number, ty: number) => { const id = sim.world.occAt(tx, ty) || sim.world.floorAt(tx, ty); const e = id ? sim.s.ents[id] : null; return e && e.k === 'bld' ? e : null; };
    const y = o.ty + 2;
    const a = put(sim, 'tunnel', o.tx + 1, y, { rot: 0, belt: [null, null, null] });
    // 7 tiles away is out of range
    const far = put(sim, 'tunnelx', o.tx + 1 + TUNNEL_RANGE + 1, y, { rot: 0, belt: [null, null, null] });
    assert.equal(tunnelPartner(at, a), null, 'out of range');
    // exactly the range is fine
    const near = put(sim, 'tunnelx', o.tx + 1 + TUNNEL_RANGE, y, { rot: 0, belt: [null, null, null] });
    assert.equal(tunnelPartner(at, a)?.id, near.id);
    assert.equal(tunnelPartner(at, near)?.id, a.id, 'the exit finds its entrance');
    // an exit facing another way is not a partner
    near.rot = 1;
    assert.equal(tunnelPartner(at, a), null, 'wrong facing');
    near.rot = 0;
    // another entrance in between pairs first
    const mid = put(sim, 'tunnel', o.tx + 3, y, { rot: 0, belt: [null, null, null] });
    assert.equal(tunnelPartner(at, a), null, 'blocked by a nearer entrance');
    assert.equal(tunnelPartner(at, mid)?.id, near.id);
    void far;
    // with no partner, items just wait at the entrance
    const sim2 = Sim.create('F-tun3', 'f');
    const { o: o2 } = yard(sim2);
    const s2 = belt(sim2, o2.tx + 2, o2.ty + 2, 0);
    const lone = put(sim2, 'tunnel', o2.tx + 3, o2.ty + 2, { rot: 0, belt: [null, null, null] });
    s2.belt = ['wood', null, null];
    run(sim2, 5);
    assert.equal(lone.belt!.filter(Boolean).length, 1, 'the item waits in the entrance');
    // using one tells you what it is linked to
    const p = sim.s.players.a;
    p.x = (mid.tx + 0.5) * TILE; p.y = (mid.ty + 1) * TILE;
    sim.events = [];
    sim.command('a', { t: 'use', id: mid.id });
    assert.ok(sim.events.some((e) => e.e === 'float' && /Linked/.test(e.text)), 'a floating note says it is linked');
});

test('solar panels follow the sun, and batteries carry a grid through the night', () => {
    const sim = Sim.create('F-solar', 'f');
    const { o } = yard(sim);
    const plot = sim.world.plotAt(o.tx + 1, o.ty + 1)!;
    plot.veins = [[o.tx + 2, o.ty + 3, 'iron'], [o.tx + 3, o.ty + 3, 'iron'], [o.tx + 2, o.ty + 4, 'iron'], [o.tx + 3, o.ty + 4, 'iron']];
    const drill = put(sim, 'drill', o.tx + 2, o.ty + 3, { out: {} });         // wants 20 units
    pole(sim, o.tx + 5, o.ty + 5);
    const panel = put(sim, 'solar', o.tx + 6, o.ty + 3);                      // 30 units at noon
    const cell = put(sim, 'battery', o.tx + 5, o.ty + 7, { chg: 0 });
    const net = () => buildPowerGraph(sim.buildings()).nets[0];
    // noon: the panel more than feeds the drill, and the spare charges the battery
    sim.s.clock = 40; sim.s.night = false;
    run(sim, 1);
    const noon = netStats(net(), sim.s.time, sunlight(sim.s.clock, sim.s.nightLen));
    assert.ok(noon.gen > 25 && noon.gen <= 30, `solar by day: ${noon.gen}`);
    assert.ok((drill.pw ?? 0) >= 0.99, 'the drill runs at full power');
    sim.s.clock = 40;
    run(sim, 20);
    assert.ok((cell.chg ?? 0) > 100, `spare power charged the battery: ${cell.chg}`);
    assert.ok((cell.chg ?? 0) <= BUILDINGS.battery.store!, 'never past its capacity');
    // night: no sun. The battery covers the drill for a while…
    sim.s.clock = TUNING.dayLength + 10; sim.s.night = true;
    const before = cell.chg!;
    run(sim, 3);
    assert.equal(netStats(net(), sim.s.time, sunlight(sim.s.clock, sim.s.nightLen)).gen, 0, 'no solar at night');
    assert.ok((drill.pw ?? 0) >= 0.99, 'the battery keeps the drill at full power');
    assert.ok((cell.chg ?? 0) < before, 'and it drains');
    // …then runs dry and the drill stops
    cell.chg = 20;
    for (let i = 0; i < 20 * 4; i++) { sim.s.clock = TUNING.dayLength + 10; sim.step(STEP); }
    assert.equal(cell.chg, 0, 'empty');
    assert.ok((drill.pw ?? 1) < 0.1, `without sun or charge the drill stops: pw ${drill.pw}`);
    // dawn: it comes back and the battery charges again
    sim.s.clock = 40; sim.s.night = false;
    run(sim, 10);
    assert.ok((drill.pw ?? 0) >= 0.99);
    assert.ok((cell.chg ?? 0) > 0);
    // a battery holds nothing without a generator, and only one tick matters for the sim state: it stays plain JSON
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(sim.s)));
    void panel;
});

test('underground belts chain, loop without losing anything, and re-pair when turned', () => {
    const sim = Sim.create('F-tun4', 'f');
    const { o } = yard(sim);
    const y = o.ty + 2;
    // exit straight into the next entrance: two hops under the ground
    const start = belt(sim, o.tx + 1, y, 0);
    put(sim, 'tunnel', o.tx + 2, y, { rot: 0, belt: [null, null, null] });
    put(sim, 'tunnelx', o.tx + 4, y, { rot: 0, belt: [null, null, null] });
    put(sim, 'tunnel', o.tx + 5, y, { rot: 0, belt: [null, null, null] });
    put(sim, 'tunnelx', o.tx + 8, y, { rot: 0, belt: [null, null, null] });
    const box = chest(sim, o.tx + 9, y);
    start.belt = ['wood', 'stone', 'coal'];
    run(sim, 12);
    assert.equal(total(box), 3, 'everything made it through both tunnels');
    // a closed loop with an underground shortcut keeps its items forever
    const sim2 = Sim.create('F-tun5', 'f');
    const { o: o2 } = yard(sim2);
    const ty = o2.ty + 2, tx = o2.tx + 2;
    belt(sim2, tx, ty, 0); put(sim2, 'tunnel', tx + 1, ty, { rot: 0, belt: [null, null, null] });
    put(sim2, 'tunnelx', tx + 4, ty, { rot: 0, belt: [null, null, null] }); belt(sim2, tx + 5, ty, 1);
    belt(sim2, tx + 5, ty + 1, 1); belt(sim2, tx + 5, ty + 2, 2);
    for (let x = tx + 4; x > tx; x--) belt(sim2, x, ty + 2, 2);
    belt(sim2, tx, ty + 2, 3); belt(sim2, tx, ty + 1, 3);
    const first = sim2.buildings('belt').find((b) => b.tx === tx && b.ty === ty)!;
    first.belt = ['wood', 'iron', 'coal'];
    const count = () => sim2.buildings().reduce((n, b) => n + (b.belt?.filter(Boolean).length ?? 0), 0);
    run(sim2, 30);
    assert.equal(count(), 3, 'nothing lost or made up while circling');
    // turning an exit away unpairs it, turning it back pairs it again (config command)
    const sim3 = Sim.create('F-tun6', 'f');
    const { p: pl, o: o3 } = yard(sim3);
    const ent = put(sim3, 'tunnel', o3.tx + 2, o3.ty + 2, { rot: 0, belt: [null, null, null] });
    const ext = put(sim3, 'tunnelx', o3.tx + 5, o3.ty + 2, { rot: 0, belt: [null, null, null] });
    const at = (a: number, b: number) => { const id = sim3.world.occAt(a, b) || sim3.world.floorAt(a, b); const e = id ? sim3.s.ents[id] : null; return e && e.k === 'bld' ? e : null; };
    assert.equal(tunnelPartner(at, ent)?.id, ext.id);
    pl.x = (ext.tx + 0.5) * TILE; pl.y = (ext.ty + 1) * TILE;
    sim3.command('a', { t: 'config', id: ext.id, rot: 1 });
    assert.equal(ext.rot, 1);
    assert.equal(tunnelPartner(at, ent), null, 'turned away: no pair');
    sim3.command('a', { t: 'config', id: ext.id, rot: 0 });
    assert.equal(tunnelPartner(at, ent)?.id, ext.id, 'turned back: paired again');
});
