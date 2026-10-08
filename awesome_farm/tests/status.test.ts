// "Say what is happening": every state a factory building can be in has plain words, a hint about what to do and a badge.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { Sim } from '../src/shared/sim/sim';
import { isFactoryPiece, simEnv, statusOf, type Badge, type Status, type StatusState } from '../src/shared/sim/status';
import type { BuildE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds; t += STEP) sim.step(STEP); };

function yard (sim: Sim) {
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    return { p, o };
}
const put = (sim: Sim, kind: BuildE['kind'], tx: number, ty: number, extra: Partial<BuildE> = {}) => sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot: 0, by: 'a', ...extra });
const chest = (sim: Sim, tx: number, ty: number, extra: Partial<BuildE> = {}) => put(sim, 'chest', tx, ty, { inv: {}, ...extra });
const belt = (sim: Sim, tx: number, ty: number, rot = 0) => put(sim, 'belt', tx, ty, { rot, belt: [null, null, null] });
const pole = (sim: Sim, tx: number, ty: number) => put(sim, 'pole', tx, ty);
const turbine = (sim: Sim, tx: number, ty: number) => put(sim, 'windturbine', tx, ty);
const furnace = (sim: Sim, tx: number, ty: number, extra: Partial<BuildE> = {}) => put(sim, 'furnace', tx, ty, { inv: {}, out: {}, fin: {}, fuel: 0, prog: 0, ...extra });
const st = (sim: Sim, b: BuildE) => statusOf(b, simEnv(sim));

/** The shape every status must have, so the windows and tooltips can print any of them. */
function sane (s: Status, label: string) {
    assert.ok(s.text.length >= 3 && s.text.length <= 110, `${label}: text fits one or two lines (${s.text.length}): ${s.text}`);
    assert.ok(s.hint.length <= 230, `${label}: hint fits (${s.hint.length})`);
    if (['nofuel', 'nopower', 'full', 'norecipe', 'noin', 'noout', 'noore', 'locked'].includes(s.state)) assert.ok(s.hint.length > 15, `${label}: a problem says what to do about it (${s.state})`);
    if (s.state === 'working' && s.badge) assert.equal(s.badge, 'work');
}
const expectState = (s: Status, state: StatusState, badge: Badge | null, label: string) => {
    assert.equal(s.state, state, `${label}: state (${s.text})`);
    assert.equal(s.badge, badge, `${label}: badge`);
    sane(s, label);
};

test('a furnace says what it is waiting for, when it has no fuel, when it works and when its output is full', () => {
    const sim = Sim.create('S-furnace', 'f');
    const { o } = yard(sim);
    const f = furnace(sim, o.tx + 4, o.ty + 4);
    run(sim, 1);
    let s = st(sim, f);
    expectState(s, 'waiting', 'wait', 'empty furnace');
    assert.match(s.text, /Waiting for ingredients/);
    assert.match(s.hint, /iron ore/i, 'it names what it takes');
    assert.ok(!/coal/i.test(s.hint), 'coal is fuel, not an ingredient to put in');
    // coal lying in the ingredient slots is fuel, not half a steel recipe: it still waits for ore, and never names a recipe nothing points to
    f.inv = { coal: 22 }; run(sim, 1);
    s = st(sim, f);
    expectState(s, 'waiting', 'wait', 'coal only');
    assert.match(s.text, /Waiting for ingredients/);
    assert.ok(!/Steel|Iron Bar/.test(s.text + s.hint), `no steel talk: ${s.text} / ${s.hint}`);
    assert.match(s.hint, /copper ore/i, 'it names what to put in');
    // ore arrives beside the coal: it smelts that (the recipe it will actually run), the coal does not pull it towards steel
    f.inv = { coal: 22, copper: 1 }; f.fin = { coal: 2 }; run(sim, 1);
    s = st(sim, f);
    expectState(s, 'working', 'work', 'copper beside coal');
    assert.equal(s.text, 'Making Copper Bar');
    f.fin = {}; f.fuel = 0; f.rcp = undefined; f.prog = 0;
    // one ore but not enough for the steel recipe: names the closest recipe's missing part
    f.inv = { ironbar: 1 }; run(sim, 1);
    s = st(sim, f);
    expectState(s, 'waiting', 'wait', 'half a recipe');
    assert.match(s.text, /Waiting for 1 more Iron Bar and 1 more Coal/);
    // ore but no fuel
    f.inv = { iron: 2 }; run(sim, 1);
    s = st(sim, f);
    expectState(s, 'nofuel', 'fuel', 'no fuel');
    assert.match(s.hint, /coal/i);
    // fuel arrives: working, with a rate
    f.fin = { coal: 3 }; run(sim, 1);
    s = st(sim, f);
    expectState(s, 'working', 'work', 'smelting');
    assert.equal(s.text, 'Making Iron Bar');
    assert.ok(Math.abs(s.rate! - 60 / 3.2) < 0.01 && s.item === 'ironbar', `a rate in bars per minute: ${s.rate}`);
    // finished bars waiting to be collected are mentioned, and nothing is wrong yet
    f.out = { ironbar: 12 };
    s = st(sim, f);
    assert.match(s.note!, /12 Iron Bar ready to collect/);
    assert.match(s.hint, /inserter/i, 'and says how to get them out');
    // the output stack is full: blocked
    f.out = { ironbar: 200 }; f.inv = { iron: 1 }; f.rcp = undefined; f.fuel = 0;
    s = st(sim, f);
    expectState(s, 'full', 'block', 'output full');
    assert.match(s.text, /Output is full \(200 Iron Bar\)/);
    // a recipe the farmer has not unlocked
    const env = { ...simEnv(sim), unlocked: (req?: string, _owner?: string) => req !== 'smithing2' };
    f.out = {}; f.inv = { ironbar: 2, coal: 1 }; f.rcp = undefined;
    s = statusOf(f, env);
    expectState(s, 'locked', 'block', 'locked recipe');
    assert.match(s.text, /Cannot make Steel yet/);
    assert.match(s.hint, /Steelwork/);
});

test('sawmills and millstones name wood and wheat, and never ask for fuel', () => {
    const sim = Sim.create('S-saw', 'f');
    const { o } = yard(sim);
    const saw = put(sim, 'sawmill', o.tx + 4, o.ty + 4, { inv: {}, out: {}, fuel: 0, prog: 0 });
    const mill = put(sim, 'millstone', o.tx + 8, o.ty + 4, { inv: {}, out: {}, fuel: 0, prog: 0 });
    run(sim, 1);
    assert.match(st(sim, saw).hint, /wood/i);
    assert.match(st(sim, mill).hint, /wheat/i);
    saw.inv = { wood: 3 }; mill.inv = { wheat: 4 }; run(sim, 1);
    expectState(st(sim, saw), 'working', 'work', 'sawmill');
    expectState(st(sim, mill), 'working', 'work', 'millstone');
    assert.equal(st(sim, mill).text, 'Making Flour');
});

test('an assembler: no recipe, waiting for named parts, no power at all, no generator, then working', () => {
    const sim = Sim.create('S-asm', 'f');
    const { o } = yard(sim);
    const a = put(sim, 'assembler', o.tx + 4, o.ty + 2, { inv: {}, out: {}, fuel: 0, prog: 0 });
    run(sim, 1);
    let s = st(sim, a);
    expectState(s, 'norecipe', 'block', 'no recipe');
    assert.equal(s.text, 'No recipe chosen');
    assert.match(s.hint, /click what it should build/);
    a.sel = 'assembler:gear'; run(sim, 1);
    s = st(sim, a);
    expectState(s, 'waiting', 'wait', 'a recipe and nothing to build it from');
    assert.equal(s.text, 'Waiting for 2 Iron Bar');
    a.inv = { ironbar: 1 }; run(sim, 1);
    assert.equal(st(sim, a).text, 'Waiting for 1 more Iron Bar', 'it counts what is missing');
    a.inv = { ironbar: 4 }; run(sim, 1);
    s = st(sim, a);
    expectState(s, 'nopower', 'power', 'no pole');
    assert.equal(s.text, 'Not connected to power');
    assert.match(s.hint, /Power Pole within 3 tiles/);
    pole(sim, o.tx + 8, o.ty + 4); run(sim, 1);
    s = st(sim, a);
    expectState(s, 'nopower', 'power', 'a pole but no generator');
    assert.match(s.text, /nothing on this grid is generating/);
    assert.match(s.hint, /Wind Turbine/);
    turbine(sim, o.tx + 9, o.ty + 6); turbine(sim, o.tx + 9, o.ty + 8); run(sim, 2);
    s = st(sim, a);
    expectState(s, 'working', 'work', 'powered');
    assert.equal(s.text, 'Making Gear');
    assert.ok(s.rate! > 10 && s.rate! <= 30, `gears a minute: ${s.rate}`);
});

test('a drill: no ore, no power, mining (and what is in front), nowhere to put the ore, a full or fussy chest in front', () => {
    const sim = Sim.create('S-drill', 'f');
    const { o } = yard(sim);
    const d = put(sim, 'drill', o.tx + 3, o.ty + 3, { out: {}, prog: 0 });
    const plot = sim.world.plotAt(o.tx + 1, o.ty + 1)!;
    plot.veins = [];
    run(sim, 1);
    let s = st(sim, d);
    expectState(s, 'noore', 'block', 'bare ground');
    assert.match(s.hint, /ore painted on the ground/);
    plot.veins = [[o.tx + 3, o.ty + 3, 'iron'], [o.tx + 4, o.ty + 3, 'iron'], [o.tx + 3, o.ty + 4, 'iron'], [o.tx + 4, o.ty + 4, 'copper']];
    run(sim, 1);
    s = st(sim, d);
    expectState(s, 'nopower', 'power', 'ore but no power');
    pole(sim, o.tx + 4, o.ty + 6); turbine(sim, o.tx + 7, o.ty + 7); run(sim, 2);
    s = st(sim, d);
    expectState(s, 'working', 'work', 'mining');
    assert.equal(s.text, 'Mining Iron Ore (3 of 4 tiles)', 'the majority ore, and how much of the square covers it');
    assert.match(s.hint, /Nothing in front yet/, 'a working drill with nothing in front still warns');
    assert.ok(s.rate! > 5 && s.rate! < 60 / 3.5, `a rate that follows the covered tiles: ${s.rate}`);
    // a chest in front: no warning
    const box = chest(sim, o.tx + 5, o.ty + 3);
    s = st(sim, d);
    assert.equal(s.hint, '');
    // its buffer is full and the chest is too: the chest is named
    d.out = { iron: 8 }; box.inv = { wood: 400 };
    s = st(sim, d);
    expectState(s, 'full', 'block', 'full chest');
    assert.match(s.text, /the Chest in front will not take Iron Ore/);
    assert.match(s.hint, /full/);
    // a chest that only takes seeds
    box.inv = {}; box.fl = ['#seeds'];
    s = st(sim, d);
    expectState(s, 'full', 'block', 'fussy chest');
    assert.match(s.hint, /only takes Seeds/i);
    // nothing in front at all
    sim.remove(box.id);
    s = st(sim, d);
    expectState(s, 'noout', 'block', 'nothing in front');
    assert.equal(s.text, 'Nowhere to put the ore');
});

test('an inserter: nothing behind, nothing in front, no power, nothing to pick up, a filter that matches nothing, a target that will not take it', () => {
    const sim = Sim.create('S-ins', 'f');
    const { o } = yard(sim);
    const ins = put(sim, 'inserter', o.tx + 5, o.ty + 5, { rot: 0 });
    run(sim, 1);
    expectState(st(sim, ins), 'noin', 'block', 'alone');
    const src = chest(sim, o.tx + 4, o.ty + 5);
    let s = st(sim, ins);
    expectState(s, 'noout', 'block', 'nothing in front');
    assert.match(s.hint, /east side/, 'it says which side');
    const dst = chest(sim, o.tx + 6, o.ty + 5);
    run(sim, 1);
    s = st(sim, ins);
    expectState(s, 'nopower', 'power', 'no pole');
    pole(sim, o.tx + 5, o.ty + 7); turbine(sim, o.tx + 8, o.ty + 7); run(sim, 1);
    s = st(sim, ins);
    expectState(s, 'idle', null, 'powered, empty chest');
    assert.match(s.text, /nothing to pick up/);
    // a filter that matches nothing behind it
    src.inv = { stone: 3 }; ins.flt = 'wood'; run(sim, 0.1); ins.hand = undefined;
    s = st(sim, ins);
    expectState(s, 'idle', null, 'filter matches nothing');
    assert.match(s.text, /matches its filter \(Wood\)/);
    // the target is full: it says so
    ins.flt = undefined; dst.inv = { wood: 400 }; src.inv = { wood: 5 };
    s = st(sim, ins);
    expectState(s, 'full', 'block', 'full target');
    assert.match(s.text, /the Chest in front will not take Wood/);
    // moving something: no badge (the arm tells you), but it says what
    dst.inv = {}; ins.hand = 'wood'; ins.prog = 0.3;
    s = st(sim, ins);
    expectState(s, 'working', null, 'moving');
    assert.match(s.text, /Moving Wood from the Chest to the Chest/);
    assert.ok(s.rate! > 60, `swings a minute: ${s.rate}`);
});

test('belts say where they run and shout when they are stuck: a dead end, a head-on pair, a full chest at the end', () => {
    const sim = Sim.create('S-belt', 'f');
    const { o } = yard(sim);
    const a = belt(sim, o.tx + 3, o.ty + 3, 0);
    expectState(st(sim, a), 'ok', null, 'empty belt');
    assert.match(st(sim, a).text, /Conveyor Belt: empty, running east/);
    a.belt = [null, null, 'iron'];
    let s = st(sim, a);
    expectState(s, 'noout', 'block', 'dead end');
    assert.match(s.text, /Dead end: nothing at the end takes Iron Ore/);
    const b = belt(sim, o.tx + 4, o.ty + 3, 2);          // faces back
    s = st(sim, a);
    expectState(s, 'noout', 'block', 'head on');
    assert.match(s.text, /face each other/);
    sim.remove(b.id);
    const end = chest(sim, o.tx + 4, o.ty + 3, { inv: { wood: 400 } });
    s = st(sim, a);
    expectState(s, 'full', 'block', 'full chest at the end');
    assert.match(s.text, /Stuck: the Chest at the end will not take Iron Ore/);
    end.inv = {};
    s = st(sim, a);
    expectState(s, 'ok', null, 'flowing');
    assert.match(s.text, /carrying Iron Ore, running east/);
    // a sorter with nowhere to send what it holds
    const sorter = put(sim, 'sorter', o.tx + 8, o.ty + 8, { rot: 0, belt: [null, null, 'copper'], flt: 'iron' });
    s = st(sim, sorter);
    expectState(s, 'noout', 'block', 'sorter with no side outputs');
    assert.match(s.text, /Nowhere to send Copper/);
    chest(sim, o.tx + 8, o.ty + 9);
    s = st(sim, sorter);
    expectState(s, 'ok', null, 'sorter with a side chest');
    assert.match(s.text, /Iron Ore goes straight on|Iron.* goes straight on/);
    // a tunnel entrance with no exit
    const tun = put(sim, 'tunnel', o.tx + 10, o.ty + 3, { rot: 0, belt: [null, null, 'wood'] });
    expectState(st(sim, tun), 'noout', 'block', 'tunnel without exit');
    const exit = put(sim, 'tunnelx', o.tx + 12, o.ty + 3, { rot: 1, belt: [null, null, null] });
    expectState(st(sim, exit), 'noin', null, 'exit with no entrance');
});

test('power buildings: a lone turbine is unwired, a pole reports its grid, a coal generator wants fuel only when asked', () => {
    const sim = Sim.create('S-power', 'f');
    const { o } = yard(sim);
    const t = turbine(sim, o.tx + 8, o.ty + 8);
    run(sim, 1);
    let s = st(sim, t);
    expectState(s, 'nopower', 'power', 'unwired turbine');
    assert.match(s.hint, /Power Pole/);
    const pl = pole(sim, o.tx + 6, o.ty + 8);
    run(sim, 1);
    s = st(sim, t);
    expectState(s, 'working', null, 'wired turbine');
    assert.match(s.text, /^Making \d+ of 40 units \(wind \d+%\)$/);
    s = st(sim, pl);
    expectState(s, 'ok', null, 'pole');
    assert.match(s.text, /1 pole · 1 machine · makes \d+, wants 0/);
    // a coal generator, nothing to power: idle, no fuel
    const g = put(sim, 'coalgen', o.tx + 4, o.ty + 8, { fin: {}, fuel: 0 });
    run(sim, 1);
    s = st(sim, g);
    expectState(s, 'idle', null, 'generator with no demand');
    assert.match(s.text, /Idle, and out of fuel|Idle/);
    // something wants power: now it is out of fuel for real
    put(sim, 'drill', o.tx + 3, o.ty + 3, { out: {}, prog: 0 });
    sim.world.plotAt(o.tx + 1, o.ty + 1)!.veins = [[o.tx + 3, o.ty + 3, 'iron'], [o.tx + 4, o.ty + 3, 'iron'], [o.tx + 3, o.ty + 4, 'iron'], [o.tx + 4, o.ty + 4, 'iron']];
    sim.remove(t.id);
    pole(sim, o.tx + 5, o.ty + 6); run(sim, 2);
    s = st(sim, g);
    expectState(s, 'nofuel', 'fuel', 'generator out of fuel');
    g.fin = { coal: 3 }; run(sim, 2);
    s = st(sim, g);
    expectState(s, 'working', 'work', 'burning');
    assert.match(s.text, /^Burning: making 60 units/);
    // a battery
    const bat = put(sim, 'battery', o.tx + 7, o.ty + 6, { chg: 750 });
    run(sim, 1);
    assert.match(st(sim, bat).text, /^Charge \d+ of 1500 \(\d+%\)$/);
});

test('chests report how full they are, and the factory pieces are recognised', () => {
    const sim = Sim.create('S-chest', 'f');
    const { o } = yard(sim);
    const c = chest(sim, o.tx + 3, o.ty + 3, { inv: { wood: 40 }, fl: ['#wood'] });
    assert.equal(st(sim, c).text, '40 of 400 items · takes only wood & fibre');
    c.inv = { wood: 400 };
    assert.match(st(sim, c).hint, /Full/);
    for (const k of ['furnace', 'sawmill', 'millstone', 'assembler', 'drill', 'inserter', 'belt', 'splitter', 'sorter', 'tunnel', 'tunnelx', 'pole', 'windturbine', 'solar', 'battery', 'coalgen', 'chest', 'steelchest'] as const) assert.ok(isFactoryPiece(k), `${k} is a factory piece`);
    for (const k of ['bed', 'wall_wood', 'campfire', 'den', 'lostpack', 'market', 'lantern'] as const) assert.ok(!isFactoryPiece(k), `${k} is not`);
});

test('every kind of factory building produces a sane status in every state the sim can put it in (a fuzz over real worlds)', () => {
    const sim = Sim.create('S-fuzz', 'f');
    const { o } = yard(sim);
    sim.world.plotAt(o.tx + 1, o.ty + 1)!.veins = [[o.tx + 3, o.ty + 3, 'iron'], [o.tx + 4, o.ty + 3, 'iron'], [o.tx + 3, o.ty + 4, 'iron'], [o.tx + 4, o.ty + 4, 'iron']];
    const kinds = (Object.keys(BUILDINGS) as BuildE['kind'][]).filter((k) => isFactoryPiece(k));
    let x = o.tx + 1;
    for (const k of kinds) {
        const def = BUILDINGS[k];
        put(sim, k, x % 14 + o.tx, o.ty + 2 + Math.floor(x / 14) * 3, { rot: x & 3, inv: {}, out: {}, fin: {}, belt: [null, null, null], fuel: 0, prog: 0 });
        x += def.size[0] + 1;
    }
    const states = new Set<string>();
    for (let round = 0; round < 6; round++) {
        run(sim, 3);
        for (const b of sim.buildings()) { if (!isFactoryPiece(b.kind)) continue; const s = st(sim, b); sane(s, `${b.kind} round ${round}`); states.add(s.state); }
        // stir the pot: feed things, strip things
        for (const b of sim.buildings()) { if (b.inv && round % 2 === 0) b.inv = { iron: 4, coal: 2, wood: 3, wheat: 4 }; else if (b.inv) b.inv = {}; if (b.kind === 'assembler') b.sel = 'assembler:gear'; }
    }
    assert.ok(states.size >= 4, `a spread of states was seen: ${[...states]}`);
});
