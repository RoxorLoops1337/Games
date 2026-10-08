// Jobs: a creature with a standing post works an island on its own, or keeps a machine, or works through a workshop order.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { BUILDINGS, ORDER_STATIONS } from '../src/shared/data/buildings';
import { AREA_JOBS, SPECIES, SPECIES_LIST, STATUS_INFO, spOf, WORK_KINDS, type Pet } from '../src/shared/data/creatures';
import { ITEMS, type ItemId } from '../src/shared/data/items';
import { RECIPES } from '../src/shared/data/recipes';
import { clearPost, craftTime, isWorkplace, machineBoost, postLabel, sortPlan } from '../src/shared/sim/jobs';
import { cmdPet, petsOf, workSlots } from '../src/shared/sim/creatures';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, CritE, MobE, NodeE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };
let seq = 0;
const pet = (sp: keyof typeof SPECIES, over: Partial<Pet> = {}): Pet => ({ id: `p${++seq}`, sp, name: `T${seq}`, lv: 6, xp: 0, traits: [], ...over });

/** One farmer on a home island with nothing growing on it, far from the work. */
function yard (seed: string) {
    const sim = Sim.create(seed, 'j');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const plot = sim.homePlot(p.slot);
    const o = sim.world.plotOrigin(plot);
    p.x = (o.tx + 1) * TILE; p.y = (o.ty + 1) * TILE; p.hearts = 99; p.invuln = 9999;
    return { sim, p, o, plot: plot.i };
}
type Yard = ReturnType<typeof yard>;
const at = (y: Yard, dx: number, dy: number) => ({ tx: y.o.tx + dx, ty: y.o.ty + dy });
const chest = (y: Yard, dx: number, dy: number, inv: BuildE['inv'] = {}) => y.sim.add<BuildE>({ k: 'bld', kind: 'chest', ...at(y, dx, dy), rot: 0, inv });
const tree = (y: Yard, dx: number, dy: number) => y.sim.add<NodeE>({ k: 'node', kind: 'tree', ...at(y, dx, dy), hp: 3, plot: y.plot });
const rock = (y: Yard, dx: number, dy: number) => y.sim.add<NodeE>({ k: 'node', kind: 'rock', ...at(y, dx, dy), hp: 3, plot: y.plot });
const bed = (y: Yard, dx: number, dy: number, over: Partial<BuildE> = {}) => y.sim.add<BuildE>({ k: 'bld', kind: 'bed', ...at(y, dx, dy), rot: 0, crop: -1, ...over });
const crit = (sim: Sim) => Object.values(sim.s.ents).find((e): e is CritE => e.k === 'crit' && e.mode === 2);
const workers = (sim: Sim) => Object.values(sim.s.ents).filter((e): e is CritE => e.k === 'crit' && e.mode === 2);
const post = (y: Yard, pt: Pet, a: { plot?: number; job?: string; bld?: number }) => cmdPet(y.sim, y.p, { t: 'pet', op: 'post', pet: pt.id, at: a as never });
const denied = (sim: Sim) => sim.events.filter((e) => e.e === 'float' && (e as { color?: number }).color !== undefined).length;

// ── the rules ───────────────────────────────────────────────────────────────
test('the tables agree: every job and workplace is something some creature can do', () => {
    for (const k of AREA_JOBS) assert.ok(WORK_KINDS.includes(k), k);
    assert.ok(SPECIES_LIST.some((id) => (spOf(id).work.make ?? 0) >= 3), 'a master of Handiwork exists');
    for (const [kind, def] of Object.entries(BUILDINGS)) {
        if (!def.work) continue;
        assert.ok(WORK_KINDS.includes(def.work), `${kind}: ${def.work}`);
        assert.ok(SPECIES_LIST.some((id) => (spOf(id).work[def.work!] ?? 0) >= 1), `someone can run the ${kind}`);
        assert.ok(def.proc || ORDER_STATIONS.includes(def.station!), `${kind} is a machine or a workshop`);
    }
    for (const id of ORDER_STATIONS) assert.ok(Object.values(BUILDINGS).some((d) => d.station === id && d.work), `${id} has a skill`);
    for (const st of Object.keys(STATUS_INFO)) assert.ok(STATUS_INFO[st as keyof typeof STATUS_INFO].text.length > 3);
    // every creature can do something at a workshop except the guard types (a deliberate choice)
    const idle = SPECIES_LIST.filter((id) => !spOf(id).work.make && !spOf(id).work.craft);
    assert.ok(idle.length <= 5, `only a few cannot run a workshop: ${idle.join(', ')}`);
});

test('a post goes to a creature that is good at it, on an island you own, within your work slots', () => {
    const y = yard('J-1');
    const bog = pet('bogsprout'), peb = pet('pebbit');
    petsOf(y.p).push(bog, peb);
    post(y, peb, { plot: y.plot, job: 'farm' });
    assert.equal(peb.post, undefined, 'a pebbit is no farmer');
    post(y, bog, { plot: y.plot, job: 'craft' });
    assert.equal(bog.post, undefined, 'craft is not an island job');
    post(y, bog, { plot: 0, job: 'farm' });
    assert.equal(bog.post, undefined, 'the corner of the sea is not yours');
    post(y, bog, { plot: y.plot, job: 'farm' });
    assert.deepEqual(bog.post, { k: 'plot', plot: y.plot, job: 'farm' });
    assert.equal(workSlots(y.p), 4);
    for (let i = 0; i < 4; i++) { const q = pet('hopper'); petsOf(y.p).push(q); post(y, q, { plot: y.plot, job: 'gather' }); }
    const working = petsOf(y.p).filter((q) => q.post).length;
    assert.equal(working, 4, 'the fifth would be one too many');
    assert.equal(postLabel(y.sim.s.plots, y.sim.s.ents, bog), `Farming, island ${y.sim.s.plots[y.plot].gx + 1}·${y.sim.s.plots[y.plot].gy + 1}`);
});

test('posts exclude each other: a den, a companion, a task and a post are one job at a time', () => {
    const y = yard('J-2');
    const g = pet('gnaw');
    petsOf(y.p).push(g);
    cmdPet(y.sim, y.p, { t: 'pet', op: 'task', pet: g.id, task: 'gather' });
    assert.equal(y.p.comp, g.id);
    post(y, g, { plot: y.plot, job: 'gather' });
    assert.ok(g.post && g.task === undefined && y.p.comp === undefined, 'the post took it off your heels');
    cmdPet(y.sim, y.p, { t: 'pet', op: 'companion', pet: g.id });
    assert.equal(g.post, undefined, 'taking it along ends the post');
    post(y, g, { plot: y.plot, job: 'gather' });
    cmdPet(y.sim, y.p, { t: 'pet', op: 'unassign', pet: g.id });
    assert.equal(g.post, undefined, 'calling it home ends the post');
    // a creature at work cannot be bred
    post(y, g, { plot: y.plot, job: 'gather' });
    assert.ok(isWorking(g));
    function isWorking (q: Pet) { return q.post !== undefined || q.den !== undefined; }
});

test('a machine has one keeper, who must have the skill; hostile requests change nothing', () => {
    const y = yard('J-3');
    const f = y.sim.add<BuildE>({ k: 'bld', kind: 'furnace', ...at(y, 4, 4), rot: 0, inv: {}, out: {}, fin: {} });
    const c = chest(y, 7, 4);
    const kit = pet('cinderkit'), peb = pet('pebbit'), kit2 = pet('cinderkit');
    petsOf(y.p).push(kit, peb, kit2);
    post(y, peb, { bld: f.id });
    assert.equal(peb.post, undefined, 'a pebbit cannot tend a fire');
    post(y, kit, { bld: c.id });
    assert.equal(kit.post, undefined, 'a chest is no workplace');
    post(y, kit, { bld: f.id });
    assert.deepEqual(kit.post, { k: 'stn', id: f.id });
    post(y, kit2, { bld: f.id });
    assert.equal(kit2.post, undefined, 'one keeper to a machine');
    for (const bad of [null, 'x', 5, [], { bld: -1 }, { bld: 1.5 }, { bld: '3' }, { plot: 1.5, job: 'farm' }, { plot: y.plot }, { plot: y.plot, job: 7 }, { plot: y.plot, job: '__proto__' }, { bld: 9999999 }, { plot: -3, job: 'gather' }]) {
        assert.doesNotThrow(() => cmdPet(y.sim, y.p, { t: 'pet', op: 'post', pet: kit2.id, at: bad as never }));
    }
    assert.equal(kit2.post, undefined);
    assert.doesNotThrow(() => cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: kit2.id, rcp: {} as never, n: 'x' as never }));
    assert.doesNotThrow(() => cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: kit.id, rcp: 5 as never, n: NaN }));
    for (const id of ['', 'nope', '__proto__', null as never]) assert.doesNotThrow(() => cmdPet(y.sim, y.p, { t: 'pet', op: 'post', pet: id, at: { plot: y.plot, job: 'gather' } }));
});

// ── island work ─────────────────────────────────────────────────────────────
test('a lumberjack on an island fells its trees and the wood goes into the chest there', () => {
    const y = yard('J-4');
    const store = chest(y, 8, 8);
    const trees = [tree(y, 3, 3), tree(y, 4, 3), tree(y, 5, 3), tree(y, 3, 5)];
    const g = pet('gnaw');
    petsOf(y.p).push(g);
    const pockets = y.p.inv.wood ?? 0;
    run(y.sim, 5);
    assert.ok(trees.every((t) => y.sim.s.ents[t.id]), 'nothing happens until it has a post');
    post(y, g, { plot: y.plot, job: 'gather' });
    assert.ok(crit(y.sim) === undefined, 'the animal appears when the world next steps');
    run(y.sim, 60);
    assert.ok(crit(y.sim), 'it is on the island');
    assert.ok(trees.filter((t) => y.sim.s.ents[t.id]).length < 4, 'trees came down');
    assert.ok((store.inv?.wood ?? 0) > 0, 'the wood is in the chest');
    assert.equal(y.p.inv.wood ?? 0, pockets, 'not in your pockets');
    assert.ok((g.pn ?? 0) > 0, 'and counted');
    assert.ok(g.xp > 0 || g.lv > 6, 'the creature learns from it');
});

test('with no chest on the island a worker waits and says so, and the trees are left standing', () => {
    const y = yard('J-5');
    const trees = [tree(y, 3, 3), tree(y, 5, 5)];
    const g = pet('gnaw');
    petsOf(y.p).push(g);
    post(y, g, { plot: y.plot, job: 'gather' });
    run(y.sim, 12);
    assert.equal(g.ps, 'nostore');
    assert.equal(crit(y.sim)!.ws, 'nostore', 'the animal shows it too');
    assert.ok(trees.every((t) => y.sim.s.ents[t.id]), 'nothing was destroyed for nothing');
    assert.ok(y.sim.events.some((e) => e.e === 'toast' && /chest/i.test((e as { text: string }).text)), 'the owner was told');
    const store = chest(y, 8, 8);
    run(y.sim, 40);
    assert.notEqual(g.ps, 'nostore', 'a chest was all it needed');
    assert.ok((store.inv?.wood ?? 0) > 0);
});

test('a miner breaks the rocks and stores the stone', () => {
    const y = yard('J-6');
    const store = chest(y, 8, 8);
    const rocks = [rock(y, 3, 3), rock(y, 4, 6)];
    const peb = pet('pebbit');
    petsOf(y.p).push(peb);
    post(y, peb, { plot: y.plot, job: 'mine' });
    run(y.sim, 50);
    assert.ok(rocks.some((r) => !y.sim.s.ents[r.id]), 'a rock went');
    assert.ok((store.inv?.stone ?? 0) > 0);
});

test('a farmer harvests ripe crops, replants from the seeds in the chest, and waters the rest', () => {
    const y = yard('J-7');
    const store = chest(y, 9, 3, { seed_wheat: 4 });
    const ripe = bed(y, 3, 6, { crop: 2, plant: 'seed_wheat', growT: 0, by: 'a' });
    const young = bed(y, 4, 6, { crop: 0, plant: 'seed_carrot', growT: 0, by: 'a' });
    const empty = bed(y, 5, 6);
    const bog = pet('bogsprout');
    petsOf(y.p).push(bog);
    post(y, bog, { plot: y.plot, job: 'farm' });
    run(y.sim, 90);
    assert.ok((store.inv?.wheat ?? 0) > 0, 'wheat in the chest');
    assert.ok((y.p.cnt?.crop ?? 0) >= 1, 'counted for quests');
    assert.ok(empty.plant === 'seed_wheat' || (y.p.cnt?.crop ?? 0) >= 2, 'it sowed the empty bed from the chest');
    assert.ok((store.inv?.carrot ?? 0) > 0, 'the young crop was watered along and harvested too');
    assert.ok((y.p.cnt?.['petwork:farm'] ?? 0) >= 4, 'harvest, sow and water all count as work');
    void ripe; void young;
});

test('a guard clears monsters off its island and ignores the ones outside it', () => {
    const y = yard('J-8');
    const inside = y.sim.add<MobE>({ k: 'mob', kind: 'slime', x: (y.o.tx + 5) * TILE, y: (y.o.ty + 5) * TILE, hp: 3, mhp: 3, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    const outside = y.sim.add<MobE>({ k: 'mob', kind: 'slime', x: (y.o.tx - 8) * TILE, y: (y.o.ty + 5) * TILE, hp: 3, mhp: 3, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    const dm = pet('duskmaw', { lv: 8 });
    petsOf(y.p).push(dm);
    post(y, dm, { plot: y.plot, job: 'guard' });
    run(y.sim, 25);
    assert.equal(y.sim.s.ents[inside.id], undefined, 'the one on the island is gone');
    assert.ok(y.sim.s.ents[outside.id], 'the one outside is none of its business');
});

test('a hauler carries loose goods and machine output to the chest', () => {
    const y = yard('J-9');
    const store = chest(y, 9, 3);
    const furnace = y.sim.add<BuildE>({ k: 'bld', kind: 'furnace', ...at(y, 3, 7), rot: 0, inv: {}, out: { ironbar: 7 }, fin: {} });
    for (let i = 0; i < 3; i++) y.sim.spawnDrop('wood', (y.o.tx + 6) * TILE, (y.o.ty + 6) * TILE);
    const san = pet('sandpaw');
    petsOf(y.p).push(san);
    post(y, san, { plot: y.plot, job: 'haul' });
    run(y.sim, 50);
    assert.equal(furnace.out?.ironbar ?? 0, 0, 'the tray is empty');
    assert.equal(store.inv?.ironbar, 7);
    assert.ok((store.inv?.wood ?? 0) >= 1, 'and the stray wood');
});

// ── machines ────────────────────────────────────────────────────────────────
test('the keeper of a furnace brings ore and fuel from the chest, empties the tray and speeds it up', () => {
    const y = yard('J-10');
    const store = chest(y, 8, 4, { iron: 10, wood: 30 });
    const f = y.sim.add<BuildE>({ k: 'bld', kind: 'furnace', ...at(y, 4, 4), rot: 0, inv: {}, out: {}, fin: {} });
    const kit = pet('cinderkit');
    petsOf(y.p).push(kit);
    post(y, kit, { bld: f.id });
    run(y.sim, 5);
    assert.equal(y.sim.s.ents[f.id]!.k, 'bld');
    run(y.sim, 15);
    assert.equal(crit(y.sim)!.ws, 'work', 'busy while there is ore');
    run(y.sim, 85);
    assert.ok((store.inv?.ironbar ?? 0) >= 6, `bars in the chest: ${store.inv?.ironbar}`);
    assert.ok((store.inv?.iron ?? 0) < 10 && (store.inv?.wood ?? 30) < 30, 'ore and fuel came out of it');
    assert.ok((f.boost ?? 0) > 0 && (f.bs ?? 0) > 0, 'and the furnace is faster for it');
    assert.equal(f.by, 'a');
    assert.ok((kit.pn ?? 0) >= 6);
});

test('a better keeper speeds a machine up more', () => {
    const lo = machineBoost(pet('cinderkit', { lv: 1 }), 'craft'), hi = machineBoost(pet('cinderkit', { lv: 20, star: 3, traits: ['diligent', 'tireless'] }), 'craft');
    assert.ok(lo >= 0.25 && hi > lo && hi <= 1.5, `${lo} < ${hi}`);
    assert.ok(machineBoost(pet('sparkit', {}), 'make') > machineBoost(pet('hopper', {}), 'make'), 'aptitude 3 beats aptitude 1');
});

test('a keeper reports what is wrong: no fuel, no ore, nowhere to put the output', () => {
    const y = yard('J-11');
    const f = y.sim.add<BuildE>({ k: 'bld', kind: 'furnace', ...at(y, 4, 4), rot: 0, inv: {}, out: {}, fin: {} });
    const store = chest(y, 8, 4, { iron: 10 });
    const kit = pet('cinderkit');
    petsOf(y.p).push(kit);
    post(y, kit, { bld: f.id });
    run(y.sim, 12);
    assert.equal(kit.ps, 'nofuel', 'ore but no fuel');
    store.inv = { wood: 10 };
    run(y.sim, 20);
    assert.equal(kit.ps, 'noinput', 'fuel but no ore');
    store.inv = { iron: 8, wood: 10 };
    run(y.sim, 7);
    assert.equal(kit.ps, 'work', 'both: it is working again');
});

test('sawmill and millstone are run with Handiwork, assembler needs a recipe and power', () => {
    const y = yard('J-12');
    const store = chest(y, 8, 8, { wood: 20, wheat: 20, ironbar: 8 });
    const saw = y.sim.add<BuildE>({ k: 'bld', kind: 'sawmill', ...at(y, 3, 3), rot: 0, inv: {}, out: {} });
    const mill = y.sim.add<BuildE>({ k: 'bld', kind: 'millstone', ...at(y, 3, 6), rot: 0, inv: {}, out: {} });
    const asm = y.sim.add<BuildE>({ k: 'bld', kind: 'assembler', ...at(y, 6, 1), rot: 0, inv: {}, out: {} });
    const gnaw = pet('gnaw'), fuz = pet('fuzzle'), spark = pet('sparkit');
    petsOf(y.p).push(gnaw, fuz, spark);
    for (const [pt, b] of [[gnaw, saw], [fuz, mill], [spark, asm]] as const) post(y, pt, { bld: b.id });
    run(y.sim, 60);
    assert.ok((store.inv?.plank ?? 0) > 0, 'planks from the sawmill');
    assert.ok((store.inv?.flour ?? 0) > 0, 'flour from the millstone');
    assert.equal(spark.ps, 'norecipe', 'the assembler has to be told what to build');
    asm.sel = 'assembler:gear';
    run(y.sim, 20);
    assert.equal(spark.ps, 'nopower', 'and it needs power');
});

// ── orders ──────────────────────────────────────────────────────────────────
test('a worker at a workbench makes what you order, from the chest, into the chest', () => {
    const y = yard('J-13');
    const store = chest(y, 8, 4, { wood: 30 });
    const wb = y.sim.add<BuildE>({ k: 'bld', kind: 'workbench', ...at(y, 4, 4), rot: 0 });
    const g = pet('gnaw');
    petsOf(y.p).push(g);
    post(y, g, { bld: wb.id });
    run(y.sim, 10);
    assert.equal(g.ps, 'noorder', 'it waits for an order');
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'workbench:plank', n: 5 });
    assert.deepEqual(g.post, { k: 'stn', id: wb.id, ord: { r: 'workbench:plank', n: 5 } });
    run(y.sim, 4);
    assert.ok((store.inv?.plank ?? 0) >= 1 && (store.inv?.plank ?? 0) < 5, 'planks arrive one after another');
    run(y.sim, 40);
    assert.equal(store.inv?.plank, 5, 'five planks');
    assert.equal(store.inv?.wood, 20, 'for ten wood');
    assert.equal((g.post as { ord?: unknown }).ord, undefined, 'the order is finished');
    assert.equal(g.ps, 'done');
    assert.ok(y.sim.events.length > 0);
    assert.ok((y.p.cnt?.['craft:plank'] ?? 0) >= 5, 'counted for quests');
});

test('an order waits for supplies and for room, and is refused when it should be', () => {
    const y = yard('J-14');
    const store = chest(y, 8, 4, { wood: 1 });
    const wb = y.sim.add<BuildE>({ k: 'bld', kind: 'workbench', ...at(y, 4, 4), rot: 0 });
    const anvil = y.sim.add<BuildE>({ k: 'bld', kind: 'anvil', ...at(y, 4, 7), rot: 0 });
    const g = pet('gnaw'), kit = pet('cinderkit');
    petsOf(y.p).push(g, kit);
    post(y, g, { bld: wb.id });
    post(y, kit, { bld: anvil.id });
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'workbench:plank', n: 3 });
    run(y.sim, 15);
    assert.equal(g.ps, 'noinput', 'one wood is not enough for a plank');
    assert.equal(store.inv?.plank ?? 0, 0);
    store.inv = { wood: 40 };
    run(y.sim, 20);
    assert.ok((store.inv?.plank ?? 0) > 0, 'supplies arrived: it carries on');
    // refused
    const before = JSON.stringify(g.post);
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'workbench:pod', n: 2 });                  // locked: needs Taming
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'anvil:pick_iron', n: 2 });                // wrong workshop
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'workbench:plank', n: 100 });              // too many
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'workbench:plank', n: 1.5 });
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'workbench:plank', n: -2 });
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'nonsense', n: 2 });
    assert.equal(JSON.stringify(g.post), before, 'none of those changed the order');
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'workbench:plank', n: 0 });
    assert.equal((g.post as { ord?: unknown }).ord, undefined, 'zero cancels');
    // no workshop, no order
    const idle = pet('hopper');
    petsOf(y.p).push(idle);
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: idle.id, rcp: 'workbench:plank', n: 2 });
    assert.equal(idle.post, undefined);
    // a full chest means "nowhere to put it"
    store.inv = { wood: 40, stone: 360 };
    cmdPet(y.sim, y.p, { t: 'pet', op: 'order', pet: g.id, rcp: 'workbench:plank', n: 3 });
    run(y.sim, 15);
    assert.equal(g.ps, 'nostore');
});

test('how long a craft takes depends on the recipe and on the worker', () => {
    const plank = RECIPES['workbench:plank'], pick = RECIPES['anvil:pick_iron'];
    const slow = pet('hopper', { lv: 1 }), fast = pet('sparkit', { lv: 20, traits: ['diligent'] });
    assert.ok(craftTime(pick, slow, 'make') > craftTime(plank, slow, 'make'), 'harder things take longer');
    assert.ok(craftTime(plank, fast, 'make') < craftTime(plank, slow, 'make'), 'a master is quicker');
    assert.ok(craftTime(plank, slow, 'make') >= 2);
});

// ── lasting ─────────────────────────────────────────────────────────────────
test('a post survives a save and a load, and the creature keeps working with its owner offline', () => {
    const y = yard('J-15');
    const store = chest(y, 8, 8);
    for (let i = 0; i < 5; i++) tree(y, 3 + (i % 3), 3 + Math.floor(i / 3) * 2);
    const g = pet('gnaw');
    petsOf(y.p).push(g);
    post(y, g, { plot: y.plot, job: 'gather' });
    run(y.sim, 20);
    const back = new Sim(JSON.parse(JSON.stringify(y.sim.s)));
    const q = back.s.players.a;
    assert.equal(q.online, false, 'the owner is away');
    assert.deepEqual(petsOf(q)[0].post, { k: 'plot', plot: y.plot, job: 'gather' });
    const chestBack = Object.values(back.s.ents).find((e): e is BuildE => e.k === 'bld' && e.kind === 'chest')!;
    const stored = () => Object.values(chestBack.inv ?? {}).reduce((a, n) => a + n, 0);
    const had = stored();
    run(back, 60);
    assert.ok(stored() > had || Object.values(back.s.ents).filter((e) => e.k === 'node' && e.plot === y.plot).length === 0, 'it kept going');
    assert.ok(crit(back), 'and it is still out there');
    void store;
});

test('when its machine or workshop is taken down the creature is free and the owner is told', () => {
    const y = yard('J-16');
    const f = y.sim.add<BuildE>({ k: 'bld', kind: 'furnace', ...at(y, 4, 4), rot: 0, inv: {}, out: {}, fin: {} });
    const kit = pet('cinderkit');
    petsOf(y.p).push(kit);
    post(y, kit, { bld: f.id });
    run(y.sim, 4);
    assert.ok(crit(y.sim));
    y.sim.remove(f.id);
    y.sim.events = [];
    run(y.sim, 1);
    assert.equal(kit.post, undefined);
    assert.equal(crit(y.sim), undefined, 'the animal is gone from the island');
    assert.ok(y.sim.events.some((e) => e.e === 'toast'), 'the owner was told');
    assert.ok(isWorkplace('furnace') && !isWorkplace('chest'));
});

test('releasing a posted creature, or clearing its post, leaves no animal behind', () => {
    const y = yard('J-17');
    chest(y, 8, 8);
    const g = pet('gnaw'), h = pet('hopper');
    petsOf(y.p).push(g, h);
    post(y, g, { plot: y.plot, job: 'gather' });
    post(y, h, { plot: y.plot, job: 'farm' });
    run(y.sim, 3);
    assert.equal(workers(y.sim).length, 2);
    cmdPet(y.sim, y.p, { t: 'pet', op: 'release', pet: g.id });
    clearPost(h);
    run(y.sim, 2);
    assert.equal(workers(y.sim).length, 0);
    assert.equal(denied(y.sim) >= 0, true);
});

test('a farm full of posts stays cheap to simulate', () => {
    const y = yard('J-18');
    chest(y, 8, 8);
    for (let i = 0; i < 40; i++) bed(y, 2 + (i % 8), 2 + Math.floor(i / 8), { crop: i % 3 });
    for (let i = 0; i < 12; i++) tree(y, 2 + (i % 6), 8 + Math.floor(i / 6));
    const kinds = ['farm', 'gather', 'farm', 'gather'] as const;
    for (let i = 0; i < 4; i++) { const q = pet(i % 2 ? 'gnaw' : 'bogsprout'); petsOf(y.p).push(q); post(y, q, { plot: y.plot, job: kinds[i] }); }
    const t0 = performance.now();
    run(y.sim, 60);
    const ms = performance.now() - t0;
    assert.ok(ms < 4000, `1200 steps with four workers took ${Math.round(ms)} ms`);
});

test('a den worker does the land work first and only keeps machines turning when the land has nothing for it', () => {
    const y = yard('J-19');
    const d = y.sim.add<BuildE>({ k: 'bld', kind: 'den', ...at(y, 5, 4), rot: 0, inv: {} });
    const t = tree(y, 8, 5);
    const f = y.sim.add<BuildE>({ k: 'bld', kind: 'furnace', ...at(y, 3, 6), rot: 0 });
    const fz = pet('fuzzle');      // Handiwork 2 beats Lumber 1 on paper
    petsOf(y.p).push(fz);
    cmdPet(y.sim, y.p, { t: 'pet', op: 'assign', pet: fz.id, den: d.id });
    let felled = false;
    for (let s = 0; s < 240 && !felled; s++) {
        run(y.sim, 1);
        if (!y.sim.s.ents[t.id]) { felled = true; assert.equal(f.boost, undefined, 'it chopped before it fussed with the furnace'); }
    }
    assert.ok(felled, 'the tree was felled');
    // with no land work at all it keeps the furnace turning instead
    const z = yard('J-20');
    const d2 = z.sim.add<BuildE>({ k: 'bld', kind: 'den', ...at(z, 5, 4), rot: 0, inv: {} });
    const f2 = z.sim.add<BuildE>({ k: 'bld', kind: 'furnace', ...at(z, 3, 6), rot: 0 });
    const fz2 = pet('fuzzle');
    petsOf(z.p).push(fz2);
    cmdPet(z.sim, z.p, { t: 'pet', op: 'assign', pet: fz2.id, den: d2.id });
    for (let s = 0; s < 120 && f2.boost === undefined; s++) {
        for (const e of Object.values(z.sim.s.ents)) if (e.k === 'node') z.sim.remove(e.id);
        run(z.sim, 1);
    }
    assert.ok((f2.boost ?? 0) > 0, 'with nothing to chop or carry it keeps the furnace turning');
});

// ── carrying ────────────────────────────────────────────────────────────────
const carried = (sim: Sim) => (crit(sim)?.ld ?? []).reduce((a, [, n]) => a + n, 0);

test('an island worker carries what it gets to the chest: it is in its hands first, and the chest gets it in a handful', () => {
    const y = yard('J-21');
    const store = chest(y, 10, 10);
    for (let i = 0; i < 6; i++) tree(y, 2 + i, 2);
    const g = pet('gnaw');
    petsOf(y.p).push(g);
    post(y, g, { plot: y.plot, job: 'gather' });
    let inHands = 0, firstDelivery = 0;
    const stored = () => Object.values(store.inv ?? {}).reduce((a, n) => a + n, 0);
    for (let s = 0; s < 400; s++) {
        run(y.sim, 0.25);
        inHands = Math.max(inHands, carried(y.sim));
        if (!firstDelivery && stored() > 0) firstDelivery = carried(y.sim) + stored();
    }
    assert.ok(inHands >= 2, 'it carried something');
    assert.ok(inHands <= 16, `and not too much at a time (${inHands})`);
    assert.ok(stored() >= 8, 'the chest filled up');
    assert.ok(firstDelivery >= 4, 'it brought a handful, not one thing at a time');
});

test('a farmer fetches seeds from the chest, plants them, and carries the harvest back', () => {
    const y = yard('J-22');
    const store = chest(y, 10, 3, { seed_wheat: 6 });
    const beds = [bed(y, 3, 7), bed(y, 4, 7), bed(y, 5, 7)];
    const bog = pet('bogsprout');
    petsOf(y.p).push(bog);
    post(y, bog, { plot: y.plot, job: 'farm' });
    let seedsInHands = 0, cropInHands = 0, planted = 0;
    for (let s = 0; s < 1600; s++) {
        run(y.sim, 0.25);
        const ld = crit(y.sim)?.ld ?? [];
        seedsInHands = Math.max(seedsInHands, ld.filter(([i]) => i.startsWith('seed_')).reduce((a, [, n]) => a + n, 0));
        cropInHands = Math.max(cropInHands, ld.filter(([i]) => i === 'wheat').reduce((a, [, n]) => a + n, 0));
        planted = Math.max(planted, beds.filter((b) => b.plant === 'seed_wheat').length);
        if ((store.inv?.wheat ?? 0) >= 3) break;
    }
    assert.ok(seedsInHands >= 2, 'it took several seeds out of the chest at once');
    assert.ok(planted >= 2, 'and planted them on the beds');
    assert.ok(cropInHands >= 1, 'the harvest was in its hands on the way to the chest');
    assert.ok((store.inv?.wheat ?? 0) >= 3, 'wheat ended up in the chest');
    assert.equal(y.p.inv.wheat ?? 0, 0, 'not in your pockets');
});

test('a worker with full hands and no room anywhere waits with them, and says so; a release hands them in', () => {
    const y = yard('J-23');
    const store = chest(y, 10, 10);
    store.inv = { stone: (BUILDINGS.chest.storage ?? 0) - 2 };       // room for two more things
    for (let i = 0; i < 8; i++) tree(y, 2 + i, 2);
    const g = pet('gnaw');
    petsOf(y.p).push(g);
    post(y, g, { plot: y.plot, job: 'gather' });
    run(y.sim, 90);
    assert.equal(g.ps, 'nostore');
    assert.ok(carried(y.sim) > 0, 'it still holds what did not fit');
    const held = carried(y.sim);
    assert.ok(held < 30, 'it did not hoard');
    const free = (BUILDINGS.chest.storage ?? 0) - Object.values(store.inv ?? {}).reduce((a, n) => a + n, 0);
    assert.ok(free <= 1, 'the chest is full');
    cmdPet(y.sim, y.p, { t: 'pet', op: 'unassign', pet: g.id });
    const drops0 = Object.values(y.sim.s.ents).filter((e) => e.k === 'drop').length;
    run(y.sim, 2);
    assert.equal(workers(y.sim).length, 0, 'the animal is gone');
    assert.ok(Object.values(y.sim.s.ents).filter((e) => e.k === 'drop').length > drops0 || free > 1, 'what it carried is on the ground, not lost');
});

// ── sorting chests ──────────────────────────────────────────────────────────
const kindsIn = (b: BuildE) => new Set(Object.entries(b.inv ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([i]) => ITEMS[i as ItemId].kind));

test('a sorter puts like with like: every kind of thing ends up in one chest', () => {
    const y = yard('J-30');
    const a = chest(y, 8, 8, { wood: 20, stone: 6, bread: 5, seed_wheat: 3 });
    const b = chest(y, 4, 9, { bread: 9, seed_carrot: 4, plank: 2 });
    const c = chest(y, 9, 4, { seed_wheat: 7, potion_heal: 2 });
    const d = chest(y, 4, 4);                           // an empty one: a kind with no chest of its own gets it
    const before = (r: ItemId) => (a.inv?.[r] ?? 0) + (b.inv?.[r] ?? 0) + (c.inv?.[r] ?? 0) + (d.inv?.[r] ?? 0);
    const totals = Object.fromEntries((['wood', 'stone', 'bread', 'seed_wheat', 'seed_carrot', 'plank', 'potion_heal'] as ItemId[]).map((r) => [r, before(r)]));
    const fz = pet('fuzzle');
    petsOf(y.p).push(fz);
    post(y, fz, { plot: y.plot, job: 'sort' });
    assert.equal(fz.post && fz.post.k === 'plot' && fz.post.job, 'sort');
    run(y.sim, 200);
    for (const [r, n] of Object.entries(totals)) assert.equal(before(r as ItemId), n, `nothing is lost: ${r}`);
    for (const chestE of [a, b, c, d]) {
        const holds = Object.entries(chestE.inv ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([i]) => i);
        assert.ok(new Set(holds.map((i) => ITEMS[i as ItemId].kind)).size <= 1, `one kind to a chest: ${holds.join(', ')}`);
    }
    assert.equal(fz.ps, 'tidy', 'it says everything is tidy');
    assert.ok((fz.pn ?? 0) >= 10, 'and counts what it moved');
    assert.ok((y.p.cnt?.['petwork:sort'] ?? 0) >= 3, 'for quests');
    void kindsIn;
});

test('the sorter shows what it is doing: walking to pick up, carrying, putting away', () => {
    const y = yard('J-31');
    chest(y, 8, 8, { wood: 10, bread: 12 });
    chest(y, 3, 3, { bread: 3 });
    const fz = pet('fuzzle');
    petsOf(y.p).push(fz);
    post(y, fz, { plot: y.plot, job: 'sort' });
    const seen = new Set<string>();
    let carried = 0;
    for (let s = 0; s < 400; s++) { run(y.sim, 0.1); const w = crit(y.sim); if (w?.ac) seen.add(w.ac); carried = Math.max(carried, carriedBy(w)); }
    assert.ok(seen.has('sortpick') && seen.has('sortput'), `both halves of a move are shown (${[...seen].join(', ')})`);
    assert.ok(carried >= 3, 'it really carries things between the chests');
    assert.ok(seen.has('idle'), 'and rests when done');
});

function carriedBy (c: CritE | undefined) { return (c?.ld ?? []).reduce((a, [, n]) => a + n, 0); }

test('the sorter plan: nothing to do with one chest, never into a full chest, and it settles', () => {
    const y = yard('J-32');
    const one = chest(y, 3, 3, { wood: 5, bread: 5 });
    assert.equal(sortPlan([one]), null, 'a single chest has nowhere to sort to');
    const a = chest(y, 8, 8, { wood: 10, bread: 4 });
    const b = chest(y, 9, 9, { bread: 9 });
    const plan = sortPlan([a, b])!;
    assert.deepEqual([plan.item, plan.from.id, plan.to.id], ['bread', a.id, b.id], 'the bread in the wrong chest goes to the bread chest');
    assert.equal(plan.n, 4);
    // a full home chest is left alone
    b.inv = { bread: BUILDINGS.chest.storage! };
    assert.equal(sortPlan([a, b]), null, 'no room, no move');
    // after the move there is nothing left to move
    b.inv = { bread: 13 }; a.inv = { wood: 10 };
    assert.equal(sortPlan([a, b]), null);
});

test('sorting needs the skill and at least a chest; with none it asks for one', () => {
    const y = yard('J-33');
    const duskmaw = pet('duskmaw'), fz = pet('fuzzle');
    petsOf(y.p).push(duskmaw, fz);
    post(y, duskmaw, { plot: y.plot, job: 'sort' });
    assert.equal(duskmaw.post, undefined, 'a night guard is no good at tidying');
    post(y, fz, { plot: y.plot, job: 'sort' });
    run(y.sim, 6);
    assert.equal(fz.ps, 'nostore');
});

test('workers say what they are doing: chopping, carrying, then resting', () => {
    const y = yard('J-34');
    chest(y, 10, 10);
    tree(y, 3, 3);
    const g = pet('gnaw');
    petsOf(y.p).push(g);
    post(y, g, { plot: y.plot, job: 'gather' });
    const seen = new Set<string>();
    for (let s = 0; s < 600; s++) { run(y.sim, 0.1); const w = crit(y.sim); if (w?.ac) seen.add(w.ac); }
    assert.ok(seen.has('chop'), `chopping (${[...seen].join(', ')})`);
    assert.ok(seen.has('carry'), 'carrying what it got to the chest');
});
