// The potluck table: dishes set out by their cooks, a feast for everyone who presses USE, and every limit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { GUIDE_BY_ID, guideText } from '../src/shared/data/guide';
import { HINTS } from '../src/shared/data/hints';
import { ITEM_ORDER, ITEMS, type ItemId } from '../src/shared/data/items';
import { BUFFS } from '../src/shared/data/stats';
import * as economy from '../src/shared/sim/economy';
import * as potluck from '../src/shared/sim/potluck';
import { Sim } from '../src/shared/sim/sim';
import { countOf, derived } from '../src/shared/sim/stats';
import type { BuildE, Cmd, PlayerS, SimEvent } from '../src/shared/sim/types';

/** Three farmers (Dana, Sam, Kit) beside a table Dana built, on Dana's island, with nothing else about. */
function setup (seed = 'potluck') {
    const sim = Sim.create(seed, 'pl');
    const a = sim.join('a', 'Dana')!, b = sim.join('b', 'Sam')!, c = sim.join('c', 'Kit')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const home = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.inv.plank = 20;
    const r = economy.tryBuild(sim, a, 'table', home.tx + 4, home.ty + 6, 0, 99);
    assert.ok(r.ok, 'the table goes up');
    const table = (r as { ok: true; b: BuildE }).b;
    const stand = (p: PlayerS, dx: number, dy = 2.5) => { p.x = (home.tx + 4 + dx) * TILE; p.y = (home.ty + 6 + dy) * TILE; };
    stand(a, 0.5); stand(b, 1.0); stand(c, 1.5);
    sim.events.length = 0;
    return { sim, a, b, c, table, home, stand };
}
const events = <T extends SimEvent['e']>(sim: Sim, e: T) => sim.events.filter((x): x is Extract<SimEvent, { e: T }> => x.e === e);
const fxNames = (sim: Sim) => events(sim, 'fx').map((e) => e.fx);
const said = (sim: Sim) => [...events(sim, 'float').map((e) => e.text), ...events(sim, 'banner').map((e) => `${e.text} ${e.sub ?? ''}`), ...events(sim, 'toast').map((e) => e.text)].join(' | ');
const put = (sim: Sim, who: string, table: BuildE, item: string, n: number) => sim.command(who, { t: 'potluck', op: 'put', id: table.id, item: item as ItemId, n });
const take = (sim: Sim, who: string, table: BuildE, item: string, n: number) => sim.command(who, { t: 'potluck', op: 'take', id: table.id, item: item as ItemId, n });
const feast = (sim: Sim, who: string, table: BuildE) => sim.command(who, { t: 'potluck', op: 'feast', id: table.id });
const use = (sim: Sim, who: string, table: BuildE) => sim.command(who, { t: 'use', id: table.id });
const buff = (p: PlayerS, id: string) => p.buffs.find((x) => x.id === id);
const rowOf = (table: BuildE, item: string) => table.dish?.find((d) => d.it === item);

test('a table is the 2x1 decor piece, and pressing USE at a bare one opens its window and nothing else', () => {
    const { sim, a, table } = setup();
    assert.equal(BUILDINGS.table.size[0], 2); assert.equal(BUILDINGS.table.size[1], 1);
    assert.equal(table.dish, undefined); assert.equal(table.fc, undefined);
    use(sim, 'a', table);
    assert.deepEqual(events(sim, 'open').map((e) => [e.to, e.ui, e.id]), [['a', 'table', table.id]]);
    assert.ok(!fxNames(sim).includes('feast'));
    assert.equal(a.buffs.length, 0);
    feast(sim, 'a', table);                                       // (the button of the window: it says why not)
    assert.ok(said(sim).includes('The table is bare'));
    assert.equal(table.fc, undefined, 'a feast that did not happen starts no cooldown');
});

test('setting a dish out: it leaves your pockets, the table remembers the cook, a friend nearby hears of it', () => {
    const { sim, a, b, table } = setup();
    a.inv.stew = 5;
    put(sim, 'a', table, 'stew', 3);
    assert.equal(countOf(a, 'stew'), 2);
    assert.deepEqual(table.dish, [{ it: 'stew', n: 3, by: 'a' }]);
    assert.ok(fxNames(sim).includes('load'), 'a little sound');
    assert.ok(events(sim, 'toast').some((e) => e.to === 'b' && /Dana/.test(e.text) && /hearty stew/.test(e.text)), 'a friend is called to the table');
    assert.ok(!events(sim, 'toast').some((e) => e.to === 'a'), 'not the cook');
    sim.events.length = 0;
    put(sim, 'a', table, 'stew', 1);
    assert.equal(rowOf(table, 'stew')!.n, 4, 'topping up the same dish');
    assert.equal(events(sim, 'toast').length, 0, 'a top-up is not announced again');
    void b;
});

test('up to eight portions of a dish: the rest stay in your pockets', () => {
    const { sim, a, table } = setup();
    a.inv.stew = 20;
    put(sim, 'a', table, 'stew', 20);
    assert.equal(rowOf(table, 'stew')!.n, TUNING.tablePortions); assert.equal(TUNING.tablePortions, 8);
    assert.equal(countOf(a, 'stew'), 12);
    sim.events.length = 0;
    put(sim, 'a', table, 'stew', 1);
    assert.equal(rowOf(table, 'stew')!.n, 8); assert.equal(countOf(a, 'stew'), 12);
    assert.ok(fxNames(sim).includes('deny') && said(sim).includes('full'));
});

test('only dishes with a buff are accepted', () => {
    const { sim, a, table } = setup();
    a.inv.wood = 9; a.inv.berry = 9; a.inv.potion_heal = 3; a.inv.potion_energy = 3; a.inv.sword_iron = 1; a.inv.stew = 2; a.inv.potion_swift = 2; a.inv.bread = 2;
    for (const it of ['wood', 'berry', 'potion_heal', 'potion_energy', 'sword_iron', 'nonsense', 'constructor', '__proto__', 'toString']) put(sim, 'a', table, it, 1);
    assert.equal(table.dish, undefined, 'none of those');
    assert.equal(countOf(a, 'wood'), 9); assert.equal(countOf(a, 'potion_heal'), 3);
    put(sim, 'a', table, 'potion_swift', 1); put(sim, 'a', table, 'bread', 1);
    assert.deepEqual(table.dish!.map((d) => d.it), ['potion_swift', 'bread'], 'potions with a buff and plain bread both count');
    // every item with a buff counts as a dish, and nothing else
    for (const id of ITEM_ORDER) assert.equal(potluck.isDish(id), !!ITEMS[id].buff, id);
    assert.ok(potluck.DISHES.length >= 15);
    // you have to have it
    put(sim, 'a', table, 'pie', 1);
    assert.equal(rowOf(table, 'pie'), undefined);
});

test('four different dishes at most, and a dish is one cook\'s: nobody else adds to it', () => {
    const { sim, a, b, c, table } = setup();
    a.inv.stew = 4; a.inv.pie = 4; b.inv.cornbread = 4; b.inv.jam = 4; c.inv.soup = 4; c.inv.stew = 4;
    put(sim, 'a', table, 'stew', 4); put(sim, 'a', table, 'pie', 4);
    put(sim, 'b', table, 'cornbread', 4); put(sim, 'b', table, 'jam', 4);
    assert.equal(table.dish!.length, TUNING.tableDishes); assert.equal(TUNING.tableDishes, 4);
    sim.events.length = 0;
    put(sim, 'c', table, 'soup', 4);
    assert.equal(table.dish!.length, 4, 'a fifth dish does not fit');
    assert.equal(countOf(c, 'soup'), 4);
    assert.ok(said(sim).includes('full'));
    sim.events.length = 0;
    put(sim, 'c', table, 'stew', 2);                              // Dana's stew is already there
    assert.equal(rowOf(table, 'stew')!.n, 4); assert.equal(rowOf(table, 'stew')!.by, 'a');
    assert.equal(countOf(c, 'stew'), 4);
    assert.ok(said(sim).includes('Dana already brought'));
    assert.deepEqual(table.dish!.map((d) => d.by), ['a', 'a', 'b', 'b']);
});

test('a feast: one portion of every dish, every buff at once, each with its cook\'s name, and the others are untouched', () => {
    const { sim, a, b, c, table } = setup();
    a.inv.stew = 3; b.inv.pie = 3; c.inv.jam = 3; c.inv.cornbread = 3;
    put(sim, 'a', table, 'stew', 3); put(sim, 'b', table, 'pie', 3); put(sim, 'c', table, 'jam', 3); put(sim, 'c', table, 'cornbread', 1);
    sim.events.length = 0;
    use(sim, 'a', table);
    assert.deepEqual(a.buffs.map((x) => [x.id, x.by]), [['mighty', 'Dana'], ['ironhide', 'Sam'], ['lucky', 'Kit'], ['featherfoot', 'Kit']]);
    const mul = derived(a).buffMul;
    assert.equal(buff(a, 'mighty')!.t, 150 * mul); assert.equal(buff(a, 'ironhide')!.t, 150 * mul); assert.equal(buff(a, 'lucky')!.t, 120 * mul);
    assert.deepEqual(table.dish!.map((d) => [d.it, d.n]), [['stew', 2], ['pie', 2], ['jam', 2]], 'a portion of each; the one-portion dish is gone');
    assert.ok(fxNames(sim).includes('feast'), 'the feast effect');
    const banner = events(sim, 'banner');
    assert.equal(banner.length, 1); assert.equal(banner[0].to, 'a');
    assert.equal(banner[0].text, 'A feast!');
    assert.equal(banner[0].sub, 'Cooked by Dana, Sam and Kit', 'four dishes are too many words for a banner: the cooks are named');
    assert.equal(a.cnt?.feast, 1); assert.equal(a.cnt?.eat, 1);
    assert.equal(b.buffs.length, 0, 'nobody else was fed');
    // the buffs really work: the mods are in the stat ledger
    assert.ok(derived(a).mods.dmgPct! >= BUFFS.mighty.mods.dmgPct! && derived(a).mods.luck! >= BUFFS.lucky.mods.luck!);
});

test('the attribution reads "Dana\'s stew, Sam\'s pie" and falls back to the cooks when it would be too long', () => {
    const name = (id: string) => ({ a: 'Dana', b: 'Sam', c: 'Kit' } as Record<string, string>)[id];
    assert.equal(potluck.feastLine([{ it: 'stew', by: 'a' }, { it: 'pie', by: 'b' }], name), "Dana's hearty stew, Sam's pumpkin pie");
    assert.equal(potluck.feastLine([{ it: 'stew', by: 'a' }], name), "Dana's hearty stew");
    const long = potluck.feastLine([{ it: 'stew', by: 'a' }, { it: 'pie', by: 'b' }, { it: 'jam', by: 'c' }, { it: 'cornbread', by: 'c' }], name);
    assert.equal(long, 'Cooked by Dana, Sam and Kit');
    assert.equal(potluck.feastLine([{ it: 'stew', by: 'a' }, { it: 'pie', by: 'a' }, { it: 'jam', by: 'a' }, { it: 'cornbread', by: 'a' }], name), 'Cooked by Dana', 'one cook, four dishes');
    assert.equal(potluck.cookName({ a: { name: 'Dana' } }, 'a'), 'Dana');
    assert.equal(potluck.cookName({ a: { name: 'Dana' } }, 'zzz'), 'a friend');
    assert.equal(potluck.cookName({ a: { name: 'Dana' } }, 'constructor'), 'a friend');
});

test('a buff you already have is refreshed, never stacked, and the longer time wins', () => {
    const { sim, a, table } = setup();
    a.inv.stew = 3; a.inv.cornbread = 2;
    put(sim, 'a', table, 'stew', 3);
    a.buffs.push({ id: 'mighty', t: 10 });
    use(sim, 'a', table);
    assert.equal(a.buffs.filter((x) => x.id === 'mighty').length, 1, 'one mighty, not two');
    assert.equal(buff(a, 'mighty')!.t, 150 * derived(a).buffMul, 'back to the full time');
    assert.equal(buff(a, 'mighty')!.by, 'Dana');
    // a longer one of your own keeps its time (a buff lasting longer than the dish is not cut short)
    sim.s.time += 100;
    a.buffs = [{ id: 'mighty', t: 5000 }];
    sim.events.length = 0;
    use(sim, 'a', table);
    assert.equal(buff(a, 'mighty')!.t, 5000);
    assert.equal(rowOf(table, 'stew')!.n, 2, 'and the portion was not wasted on it');
});

test('a portion is eaten only when it helps: a buff with plenty of time left is skipped, the rest is taken', () => {
    const { sim, a, b, table } = setup();
    a.inv.stew = 3; a.inv.pie = 3;
    put(sim, 'a', table, 'stew', 3); put(sim, 'a', table, 'pie', 3);
    b.buffs.push({ id: 'mighty', t: 120 });                       // 120 of 150 s: no need
    b.buffs.push({ id: 'ironhide', t: 60 });                      // 60 of 150 s: less than half, it helps
    const plan = potluck.plan(b, table, sim.s.time);
    assert.deepEqual(plan.eat.map((d) => d.it), ['pie']);
    use(sim, 'b', table);
    assert.equal(rowOf(table, 'stew')!.n, 3, 'the stew stays for the others');
    assert.equal(rowOf(table, 'pie')!.n, 2);
    assert.equal(buff(b, 'mighty')!.t, 120, 'untouched');
    assert.equal(buff(b, 'ironhide')!.t, 150 * derived(b).buffMul);
    // when nothing would help, USE opens the window instead and takes no portion and starts no cooldown
    sim.s.time += 25;
    sim.events.length = 0;
    b.buffs = [{ id: 'mighty', t: 140 }, { id: 'ironhide', t: 140 }];
    use(sim, 'b', table);
    assert.deepEqual(events(sim, 'open').map((e) => e.ui), ['table']);
    assert.equal(rowOf(table, 'stew')!.n, 3); assert.equal(rowOf(table, 'pie')!.n, 2);
    feast(sim, 'b', table);
    assert.ok(said(sim).includes('full of everything'));
});

test('two dishes for one buff: only the longer one is eaten', () => {
    const { sim, a, b, table } = setup();
    a.inv.stew = 2; b.inv.spicy_stew = 2;                          // both are "mighty": 150 s and 180 s
    put(sim, 'a', table, 'stew', 2); put(sim, 'b', table, 'spicy_stew', 2);
    use(sim, 'a', table);
    assert.deepEqual(a.buffs.map((x) => [x.id, x.by, x.t]), [['mighty', 'Sam', 180 * derived(a).buffMul]]);
    assert.equal(rowOf(table, 'stew')!.n, 2, 'the shorter dish keeps its portion'); assert.equal(rowOf(table, 'spicy_stew')!.n, 1);
});

test('one feast per cooldown at a table; another farmer is not held up by it; a second table is its own', () => {
    const { sim, a, b, table, home } = setup();
    a.inv.stew = 8; a.inv.pie = 8;
    put(sim, 'a', table, 'stew', 8); put(sim, 'a', table, 'pie', 8);
    use(sim, 'a', table);
    assert.equal(rowOf(table, 'stew')!.n, 7);
    a.buffs = [];                                                  // (no buff to hold her back: only the cooldown does)
    sim.events.length = 0;
    use(sim, 'a', table);
    assert.equal(rowOf(table, 'stew')!.n, 7, 'too soon');
    assert.deepEqual(events(sim, 'open').map((e) => e.ui), ['table'], 'USE opens the window instead (to set out more)');
    feast(sim, 'a', table);
    assert.ok(/feast again in \d+s/.test(said(sim)), said(sim));
    sim.s.time += TUNING.feastCooldown - 1;
    sim.events.length = 0; feast(sim, 'a', table);
    assert.equal(rowOf(table, 'stew')!.n, 7, 'one second early');
    sim.s.time += 1.01;
    use(sim, 'a', table);
    assert.equal(rowOf(table, 'stew')!.n, 6, 'ready again');
    // Sam has not feasted: no waiting for her
    use(sim, 'b', table);
    assert.equal(rowOf(table, 'stew')!.n, 5); assert.equal(b.buffs.length, 2);
    // a second table
    a.inv.plank = 9;
    const r2 = economy.tryBuild(sim, a, 'table', home.tx + 8, home.ty + 6, 0, 99) as { ok: true; b: BuildE };
    a.inv.stew = 2; a.x = (home.tx + 8.5) * TILE; a.y = (home.ty + 8.5) * TILE;
    put(sim, 'a', r2.b, 'stew', 2);
    a.buffs = [];
    use(sim, 'a', r2.b);
    assert.equal(rowOf(r2.b, 'stew')!.n, 1, 'another table, another cooldown');
});

test('range: about three tiles from the table, and not through the world', () => {
    const { sim, a, b, table, home } = setup();
    a.inv.stew = 4;
    put(sim, 'a', table, 'stew', 4);
    // far away: nothing works
    b.x = (home.tx + 4) * TILE; b.y = (home.ty + 6 + 6) * TILE;
    sim.events.length = 0;
    use(sim, 'b', table); feast(sim, 'b', table); put(sim, 'b', table, 'stew', 1);
    a.x = (home.tx + 4) * TILE; a.y = (home.ty + 6 + 6) * TILE;
    take(sim, 'a', table, 'stew', 1);
    assert.equal(rowOf(table, 'stew')!.n, 4);
    assert.equal(b.buffs.length, 0);
    assert.equal(events(sim, 'open').length, 0, 'not even the window');
    // just inside three tiles of the edge of the table
    b.x = (home.tx + 4.5) * TILE; b.y = (home.ty + 7 + TUNING.feastRange - 0.15) * TILE + 4;
    assert.ok(potluck.near(sim, b, table));
    use(sim, 'b', table);
    assert.equal(rowOf(table, 'stew')!.n, 3);
    // just outside
    sim.s.time += 99;
    b.y += 0.4 * TILE; b.buffs = [];
    assert.ok(!potluck.near(sim, b, table));
    use(sim, 'b', table);
    assert.equal(rowOf(table, 'stew')!.n, 3);
});

test('only the cook takes a dish back, as many portions as they like, and a gone dish leaves the table clean', () => {
    const { sim, a, b, table } = setup();
    a.inv.stew = 6; b.inv.pie = 2;
    put(sim, 'a', table, 'stew', 6); put(sim, 'b', table, 'pie', 2);
    sim.events.length = 0;
    take(sim, 'b', table, 'stew', 1);                              // Sam cannot take Dana's
    assert.equal(rowOf(table, 'stew')!.n, 6); assert.equal(countOf(b, 'stew'), 0);
    assert.ok(said(sim).includes('Only Dana can take that back'));
    take(sim, 'a', table, 'pie', 1);                               // and Dana cannot take Sam's
    assert.equal(rowOf(table, 'pie')!.n, 2);
    take(sim, 'a', table, 'stew', 4);
    assert.equal(rowOf(table, 'stew')!.n, 2); assert.equal(countOf(a, 'stew'), 4);
    take(sim, 'a', table, 'stew', 99);                             // more than there is: what is there
    assert.equal(rowOf(table, 'stew'), undefined); assert.equal(countOf(a, 'stew'), 6);
    take(sim, 'b', table, 'pie', 2);
    assert.equal(table.dish, undefined, 'a bare table carries no dishes field');
    take(sim, 'b', table, 'pie', 1);                               // nothing there: nothing happens
    assert.equal(countOf(b, 'pie'), 2);
});

test('two farmers feast: each takes their own portion, each keeps their own buffs, and the table runs out for nobody unfairly', () => {
    const { sim, a, b, table } = setup();
    a.inv.stew = 2; a.inv.pie = 1;
    put(sim, 'a', table, 'stew', 2); put(sim, 'a', table, 'pie', 1);
    use(sim, 'a', table);
    assert.deepEqual(table.dish!.map((d) => [d.it, d.n]), [['stew', 1]], 'the last pie is gone');
    use(sim, 'b', table);
    assert.equal(table.dish, undefined, 'and the last stew');
    assert.deepEqual(b.buffs.map((x) => x.id), ['mighty'], 'Sam got what was left');
    assert.deepEqual(a.buffs.map((x) => x.id), ['mighty', 'ironhide']);
    assert.deepEqual(Object.keys(table.fc!).sort(), ['a', 'b'], 'who feasted when');
    sim.events.length = 0;
    use(sim, 'b', table);
    assert.deepEqual(events(sim, 'open').map((e) => e.ui), ['table'], 'a bare table opens its window');
});

test('the chronicle: a feast that fed three farmers at once writes one line a day', () => {
    const { sim, a, b, c, table } = setup();
    a.inv.stew = 8; a.inv.pie = 8;
    put(sim, 'a', table, 'stew', 8); put(sim, 'a', table, 'pie', 8);
    const lines = () => (sim.s.chron ?? []).filter((e) => e.k?.startsWith('feast:')).map((e) => e.t);
    use(sim, 'a', table);
    assert.equal(events(sim, 'banner').at(-1)!.sub, "Dana's hearty stew, Dana's pumpkin pie", 'two dishes are told one by one');
    use(sim, 'b', table);
    assert.deepEqual(lines(), [], 'two farmers are not yet a feast to remember');
    use(sim, 'c', table);
    assert.deepEqual(lines(), ["Dana's feast fed Sam and Kit."]);
    const entry = sim.s.chron!.find((e) => e.k === `feast:${sim.s.day}`)!;
    assert.ok(entry.i === 'i_pie' && entry.d === sim.s.day);
    sim.s.time += 25; a.buffs = []; b.buffs = []; c.buffs = [];
    use(sim, 'a', table); use(sim, 'b', table); use(sim, 'c', table);
    assert.equal(lines().length, 1, 'not again the same day');
    sim.s.day++; sim.s.time += 25; a.buffs = []; b.buffs = []; c.buffs = [];
    use(sim, 'a', table); use(sim, 'b', table); use(sim, 'c', table);
    assert.equal(lines().length, 2, 'a new day, a new line');
});

test('farmers who feast far apart in time are not "at once", and the cooldown list forgets the old', () => {
    const { sim, a, table } = setup();
    a.inv.stew = 8; a.inv.pie = 8;
    put(sim, 'a', table, 'stew', 8); put(sim, 'a', table, 'pie', 8);
    use(sim, 'a', table);
    sim.s.time += TUNING.feastWindow + 5; use(sim, 'b', table);
    sim.s.time += TUNING.feastWindow + 5; use(sim, 'c', table);
    assert.equal((sim.s.chron ?? []).filter((e) => e.k?.startsWith('feast:')).length, 0);
    assert.deepEqual(Object.keys(table.fc!), ['c'], 'only recent feasts are remembered');
});

test('alone: one farmer feasting gets every dish\'s buff for one portion each', () => {
    const sim = Sim.create('potluck-solo', 'p');
    const a = sim.join('a', 'Dana')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const home = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.inv.plank = 9; a.inv.stew = 2; a.inv.pie = 2; a.inv.jam = 2; a.inv.potion_swift = 2;
    const t = (economy.tryBuild(sim, a, 'table', home.tx + 4, home.ty + 6, 0, 99) as { ok: true; b: BuildE }).b;
    a.x = (home.tx + 4.5) * TILE; a.y = (home.ty + 8.5) * TILE;
    for (const it of ['stew', 'pie', 'jam', 'potion_swift']) put(sim, 'a', t, it, 1);
    use(sim, 'a', t);
    assert.deepEqual(a.buffs.map((x) => x.id), ['mighty', 'ironhide', 'lucky', 'swift']);
    assert.ok(a.buffs.every((x) => x.by === 'Dana'), 'her own dishes carry her own name');
    assert.equal(t.dish, undefined, 'one portion each: the table is bare');
    assert.equal((sim.s.chron ?? []).filter((e) => e.k?.startsWith('feast:')).length, 0, 'one farmer is not a feast for the chronicle');
});

test('eating a longer dish of your own takes over from the cook\'s name; a shorter one leaves it', () => {
    const { sim, a, table } = setup();
    a.inv.stew = 1; a.inv.spicy_stew = 1; a.inv.potion_might = 1;
    put(sim, 'a', table, 'stew', 1);
    use(sim, 'a', table);
    assert.equal(buff(a, 'mighty')!.by, 'Dana');
    sim.command('a', { t: 'eat', item: 'potion_might' });          // 120 s: shorter than what she has
    assert.equal(buff(a, 'mighty')!.by, 'Dana');
    sim.command('a', { t: 'eat', item: 'spicy_stew' });             // 180 s: longer
    assert.equal(buff(a, 'mighty')!.by, undefined);
    assert.equal(buff(a, 'mighty')!.t, 180 * derived(a).buffMul);
});

test('taking the table down gives each dish back to its cook: yours to your pockets, a friend\'s by post', () => {
    const { sim, a, b, table } = setup();
    a.inv.stew = 3; b.inv.pie = 4;
    put(sim, 'a', table, 'stew', 3); put(sim, 'b', table, 'pie', 4);
    sim.events.length = 0;
    sim.command('a', { t: 'demolish', id: table.id });
    assert.equal(sim.s.ents[table.id], undefined);
    assert.equal(countOf(a, 'stew'), 3, 'her own dish comes straight back');
    assert.equal(countOf(a, 'pie'), 0, 'his does not');
    assert.deepEqual(b.mail!.map((m) => [m.from, m.items]), [['The potluck table', [['pie', 4]]]]);
    assert.ok(b.mail![0].note.includes('Dana'));
    assert.ok(events(sim, 'toast').some((e) => e.to === 'b' && /Pumpkin Pie/.test(e.text)));
});

test('hostile input: nothing throws and nothing changes', () => {
    const { sim, a, b, table } = setup();
    a.inv.stew = 5; a.inv.wood = 5;
    put(sim, 'a', table, 'stew', 2);
    const before = JSON.stringify([table, a.inv, a.buffs, b.buffs]);
    const send = (c: unknown) => { assert.doesNotThrow(() => sim.command('a', c as Cmd)); assert.doesNotThrow(() => sim.command('b', c as Cmd)); };
    for (const n of [NaN, Infinity, -Infinity, -1, 0, 0.5, 1.5, 1e9, '3', null, undefined, {}, [], true]) {
        send({ t: 'potluck', op: 'put', id: table.id, item: 'stew', n });
        send({ t: 'potluck', op: 'take', id: table.id, item: 'stew', n });
    }
    for (const item of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'wood', 'nonsense', 7, null, undefined, {}, [], ['stew'], { it: 'stew' }]) {
        send({ t: 'potluck', op: 'put', id: table.id, item, n: 1 });
        send({ t: 'potluck', op: 'take', id: table.id, item, n: 1 });
    }
    for (const id of ['x', '__proto__', 'constructor', -1, 0, 1.5, NaN, null, undefined, {}, [], 99999, 1, a.id, 'a']) {
        send({ t: 'potluck', op: 'put', id, item: 'stew', n: 1 });
        send({ t: 'potluck', op: 'feast', id });
        send({ t: 'use', id });
    }
    for (const op of ['', 'nonsense', 'constructor', '__proto__', 7, null, undefined, {}, ['feast']]) send({ t: 'potluck', op, id: table.id, item: 'stew', n: 1 });
    send({ t: 'potluck' }); send({ t: 'potluck', op: 'put' }); send({ t: 'potluck', op: null, id: null });
    // a building that is not a table never takes dishes
    const home = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.inv.wood = 99; a.inv.plank = 99;
    const chest = (economy.tryBuild(sim, a, 'chest', home.tx + 9, home.ty + 6, 0, 99) as { ok: true; b: BuildE }).b;
    a.x = (home.tx + 9) * TILE; a.y = (home.ty + 8) * TILE;
    send({ t: 'potluck', op: 'put', id: chest.id, item: 'stew', n: 1 });
    assert.equal(chest.dish, undefined);
    assert.equal(countOf(a, 'stew'), 3);
    // the table itself did not move, except for what the valid commands above did
    const tableNow = JSON.stringify([table, a.inv, a.buffs, b.buffs]);
    assert.equal(JSON.parse(tableNow)[0].dish.length, 1);
    assert.equal(JSON.parse(before)[0].dish[0].n, 2);
    assert.deepEqual(JSON.parse(tableNow)[3], []);
});

test('a dish with a name from the wire cannot smuggle in an inherited property', () => {
    const { sim, table, a } = setup();
    a.inv.stew = 1;
    (table as unknown as { dish: unknown }).dish = [{ it: 'constructor', n: 3, by: 'a' }, { it: 'stew', n: 'x', by: 'zzz' }, null, { it: 'stew', n: 2, by: 'constructor' }];
    assert.doesNotThrow(() => { use(sim, 'a', table); feast(sim, 'a', table); take(sim, 'a', table, 'stew', 1); sim.command('a', { t: 'demolish', id: table.id }); });
});

test('save and load: the dishes, their cooks and the cooldowns come through the JSON', () => {
    const { sim, a, b, table } = setup('potluck-save');
    a.inv.stew = 4; b.inv.pie = 4;
    put(sim, 'a', table, 'stew', 4); put(sim, 'b', table, 'pie', 4);
    use(sim, 'a', table);
    const saved = JSON.parse(JSON.stringify(sim.s));
    const sim2 = new Sim(saved);
    const t2 = sim2.s.ents[table.id] as BuildE;
    assert.deepEqual(t2.dish, [{ it: 'stew', n: 3, by: 'a' }, { it: 'pie', n: 3, by: 'b' }]);
    assert.deepEqual(Object.keys(t2.fc!), ['a']);
    const a2 = sim2.s.players.a, b2 = sim2.s.players.b;
    assert.deepEqual(a2.buffs.map((x) => [x.id, x.by]), [['mighty', 'Dana'], ['ironhide', 'Sam']], 'the cook\'s name is kept on the buff');
    sim2.join('a', 'Dana'); sim2.join('b', 'Sam');
    a2.x = a.x; a2.y = a.y; b2.x = b.x; b2.y = b.y;
    sim2.events.length = 0;
    sim2.command('a', { t: 'use', id: table.id });
    assert.equal(t2.dish![0].n, 3, 'the cooldown survived the save');
    assert.deepEqual(events(sim2, 'open').map((e) => e.ui), ['table']);
    sim2.command('b', { t: 'use', id: table.id });
    assert.deepEqual(t2.dish!.map((d) => d.n), [2, 2], 'and Sam can feast');
    assert.deepEqual(b2.buffs.map((x) => x.by), ['Dana', 'Sam']);
});

test('a farmer who is down cannot feast; one on an expedition is nowhere near a table', () => {
    const { sim, a, b, table } = setup();
    a.inv.stew = 2;
    put(sim, 'a', table, 'stew', 2);
    b.downed = 5;
    use(sim, 'b', table); feast(sim, 'b', table); take(sim, 'b', table, 'stew', 1);
    assert.equal(b.buffs.length, 0); assert.equal(rowOf(table, 'stew')!.n, 2);
});

test('the guide and the first-time hint say what the table does, with the real numbers', () => {
    const lines = GUIDE_BY_ID.house.steps.map((s) => guideText(s, false, { move: 'WASD', fish: 'Q' }));
    const line = lines.find((l) => /Set a Table/.test(l));
    assert.ok(line, 'the house page has a line about the table');
    assert.ok(line!.includes(`${TUNING.tableDishes}`) || /four/.test(line!), 'the number of dishes');
    assert.ok(/portion/.test(line!), 'portions');
    const phone = GUIDE_BY_ID.house.steps.map((s) => guideText(s, true, { move: 'WASD', fish: 'Q' })).find((l) => /Set a Table/.test(l))!;
    assert.ok(/USE/.test(phone) && !/press E/i.test(phone), 'a phone taps USE');
    assert.equal(BUILDINGS.table.name, 'Table');
    const hint = HINTS.find((h) => h.id === 'potluck')!;
    assert.ok(hint, 'a first-time hint');
    const { sim, a, table } = setup();
    void table;
    a.cnt = {}; a.inv = {};
    assert.ok(!hint.when({ me: a, prompt: '' }), 'no table of your own, no dish: no hint');
    a.cnt = { 'build:table': 1 };
    assert.ok(!hint.when({ me: a, prompt: '' }), 'a table but nothing to put on it');
    a.inv.stew = 1;
    assert.ok(hint.when({ me: a, prompt: '' }), 'a table and a dish: the hint');
    a.cnt.feast = 1;
    assert.ok(!hint.when({ me: a, prompt: '' }), 'a farmer who has feasted knows');
    assert.ok(/Table/.test(hint.text({ me: a, prompt: '' }, { fish: 'Q' })));
    void sim;
});

test('what USE would do is told in words: set the table, feast on the dishes, or open it with the reason', () => {
    const { sim, a, b, table } = setup();
    const name = (id: string) => sim.s.players[id]?.name ?? '?';
    assert.equal(potluck.promptOf(a, table, sim.s.time, name), 'Set the table: put out a dish');
    a.inv.stew = 2; b.inv.pie = 2; b.inv.jam = 2;
    put(sim, 'a', table, 'stew', 2); put(sim, 'b', table, 'pie', 2);
    assert.equal(potluck.promptOf(a, table, sim.s.time, name), "Feast (Dana's hearty stew, Sam's pumpkin pie)");
    put(sim, 'b', table, 'jam', 2);
    assert.equal(potluck.promptOf(a, table, sim.s.time, name), 'Feast (Cooked by Dana and Sam)', 'three dishes: the cooks');
    use(sim, 'a', table);
    assert.match(potluck.promptOf(a, table, sim.s.time, name), /^Open the table \(feast again in \d+s\)$/);
    sim.s.time += 30;
    assert.match(potluck.promptOf(a, table, sim.s.time, name), /^Open the table \(you are full for now\)$/);
    assert.equal(potluck.whyNotFeast(a, table, sim.s.time), 'You are full of everything here');
    assert.equal(potluck.whyNotFeast(b, table, sim.s.time), null);
});

test('over the wire: a friend nearby sees the dishes on the table, and your own buffs carry the cook\'s name', async () => {
    const { SimHost } = await import('../src/shared/net/host');
    const { applyPlayerDelta, PROTOCOL } = await import('../src/shared/net/protocol');
    const sim = Sim.create('potluck-net', 'pn');
    const host = new SimHost(sim, 'T');
    const mirror = (id: string) => {
        const m = { ents: {} as Record<number, BuildE>, me: undefined as PlayerS | undefined, peer: { send: (_t: string) => undefined } as { send: (t: string) => void } };
        m.peer.send = (text: string) => {
            const msg = JSON.parse(text);
            if (msg.t === 'welcome') { for (const e of Object.values(msg.state.ents) as BuildE[]) m.ents[e.id] = e; m.me = msg.state.players[id]; }
            if (msg.t === 'tick') {
                for (const e of msg.ents as BuildE[]) m.ents[e.id] = e;
                for (const d of msg.players) if (d.id === id) m.me = applyPlayerDelta(m.me as never, d) as unknown as PlayerS;
            }
        };
        host.attach(m.peer);
        host.receive(m.peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name: id === 'a' ? 'Dana' : 'Sam' }));
        return m;
    };
    const a = mirror('a'), b = mirror('b');
    const pa = sim.s.players.a, pb = sim.s.players.b;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const home = sim.world.plotOrigin(sim.homePlot(pa.slot));
    pa.inv.plank = 9; pa.inv.stew = 4;
    const t = (economy.tryBuild(sim, pa, 'table', home.tx + 4, home.ty + 6, 0, 99) as { ok: true; b: BuildE }).b;
    pa.x = (home.tx + 4.5) * TILE; pa.y = (home.ty + 8.5) * TILE; pb.x = pa.x + 20; pb.y = pa.y;
    const send = (who: string, c: Cmd) => host.receive((who === 'a' ? a : b).peer as never, JSON.stringify({ t: 'cmd', c }));
    send('a', { t: 'potluck', op: 'put', id: t.id, item: 'stew', n: 4 });
    host.update(0.2); host.update(0.2);
    assert.deepEqual(b.ents[t.id].dish, [{ it: 'stew', n: 4, by: 'a' }], 'the friend sees what is on the table');
    send('b', { t: 'use', id: t.id });
    host.update(0.2); host.update(0.2);
    assert.deepEqual(b.me!.buffs.map((x) => [x.id, x.by]), [['mighty', 'Dana']], 'and eats it, with the cook\'s name');
    assert.equal(a.ents[t.id].dish![0].n, 3);
    assert.deepEqual(Object.keys(a.ents[t.id].fc!), ['b']);
});

test('a storm of random potluck commands keeps the table sound', () => {
    const { sim, a, b, c, table } = setup('potluck-storm');
    const kinds: ItemId[] = ['stew', 'pie', 'cornbread', 'jam', 'soup', 'potion_swift', 'bread', 'spicy_stew'];
    for (const p of [a, b, c]) for (const k of kinds) p.inv[k] = 6;
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = <T>(l: T[]) => l[Math.floor(rnd() * l.length)];
    const total = (k: ItemId) => (table.dish ?? []).filter((d) => d.it === k).reduce((s, d) => s + d.n, 0) + [a, b, c].reduce((s, p) => s + countOf(p, k), 0);
    for (let i = 0; i < 4000; i++) {
        const who = pick(['a', 'b', 'c']);
        const op = pick(['put', 'put', 'take', 'feast', 'use']);
        const item = pick<unknown>([...kinds, ...kinds, 'wood', 'constructor', 7, null]);
        const n = pick<unknown>([1, 2, 3, 8, 9, 0, -1, 1.5, NaN, 1e9, '2']);
        if (op === 'use') sim.command(who, { t: 'use', id: table.id }); else sim.command(who, { t: 'potluck', op, id: table.id, item, n } as never);
        if (i % 7 === 0) sim.s.time += pick([0, 3, 10, 25]);
        if (i % 50 === 0) for (const p of [a, b, c]) p.buffs = pick([[], p.buffs]);
        const rows = table.dish ?? [];
        assert.ok(rows.length <= TUNING.tableDishes, 'at most four dishes');
        assert.equal(new Set(rows.map((d) => d.it)).size, rows.length, 'one row per dish');
        for (const d of rows) assert.ok(Number.isInteger(d.n) && d.n >= 1 && d.n <= TUNING.tablePortions && ['a', 'b', 'c'].includes(d.by) && potluck.isDish(d.it), JSON.stringify(d));
        for (const p of [a, b, c]) { assert.equal(new Set(p.buffs.map((x) => x.id)).size, p.buffs.length, 'a buff is never doubled'); for (const x of p.buffs) assert.ok(x.t > 0 && Number.isFinite(x.t)); }
        for (const k of kinds) assert.ok(total(k) <= 18, `${k} cannot be made from nothing`);
        if (!rows.length) assert.equal(table.dish, undefined);
    }
    assert.doesNotThrow(() => JSON.stringify(sim.s));
});
