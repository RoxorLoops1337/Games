// The Export Chute: a belt (or inserter, or drill) feeds it, it sells whatever arrives at 85% of the market price and the coins
// go to the farmer who built it, online or not. It refuses what cannot be sold (the belt then waits), obeys its filter, keeps a
// rolling "coins a minute", survives a save and a reload, and shows its income now and then (not once per item).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { HOWTO } from '../src/shared/data/howto';
import { ITEMS, type ItemId } from '../src/shared/data/items';
import { GUIDE_BY_ID } from '../src/shared/data/guide';
import { HINTS } from '../src/shared/data/hints';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { chuteRate, chuteSells, chuteTakes, CHUTE_SLICES } from '../src/shared/sim/chute';
import { Sim } from '../src/shared/sim/sim';
import { simEnv, statusOf } from '../src/shared/sim/status';
import type { BuildE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds; t += STEP) sim.step(STEP); };

function yard (sim: Sim, id = 'a') {
    const p = sim.join(id, id.toUpperCase())!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    return { p, o };
}
const put = (sim: Sim, kind: BuildE['kind'], tx: number, ty: number, extra: Partial<BuildE> = {}) => sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot: 0, by: 'a', ...extra });
const chest = (sim: Sim, tx: number, ty: number, inv: BuildE['inv'] = {}) => put(sim, 'chest', tx, ty, { inv });
const belt = (sim: Sim, tx: number, ty: number, rot = 0) => put(sim, 'belt', tx, ty, { rot, belt: [null, null, null] });
const chute = (sim: Sim, tx: number, ty: number, extra: Partial<BuildE> = {}) => put(sim, 'chute', tx, ty, extra);

/** A line of belts running east from (x, y), ending at a chute: returns the first belt (put items on it) and the chute. */
function line (sim: Sim, x: number, y: number, len = 4, extra: Partial<BuildE> = {}) {
    const first = belt(sim, x, y);
    for (let i = 1; i < len; i++) belt(sim, x + i, y);
    return { first, end: chute(sim, x + len, y, extra) };
}
/** Put `n` of `item` on the belt, one whenever there is room, stepping the world as they go. */
function feed (sim: Sim, first: BuildE, item: ItemId, n: number, seconds = 40) {
    let left = n;
    for (let t = 0; t < seconds && left > 0; t += STEP) {
        if (!first.belt![0]) { first.belt![0] = item; sim.touch(first); left--; }
        sim.step(STEP);
    }
    return n - left;
}
const status = (sim: Sim, b: BuildE) => statusOf(b, simEnv(sim));
const floatsOf = (sim: Sim) => sim.events.filter((e) => e.e === 'float' && /^\+\d+$/.test(e.text));

test('the chute is a logistics building the Logistics skill unlocks, and its words say what it does', () => {
    const d = BUILDINGS.chute;
    assert.equal(d.cat, 'logistics');
    assert.equal(d.req, 'logistics');
    assert.deepEqual(d.size, [1, 1]);
    assert.ok(d.desc.includes(`${Math.round(TUNING.chuteCut * 100)}%`), 'the description names the real cut');
    assert.ok(HOWTO.chute!.how.includes(`${Math.round(TUNING.chuteCut * 100)}%`), 'so does the how-to');
    assert.equal(TUNING.chuteCut, 0.85);
});

test('it sells materials, food, seeds and potions, and never gear, tools, pods, crates, keys or anything without a price', () => {
    for (const id of ['ironbar', 'wheat', 'bread', 'seed_wheat', 'potion_heal', 'plank', 'coal', 'crystal', 'fish_trout', 'pearl'] as ItemId[]) assert.ok(chuteSells(id), `${id} sells`);
    for (const id of ['pick_iron', 'club', 'sword_iron', 'bag_satchel', 'charm_lucky', 'helm_iron', 'pod', 'pod_great', 'treat', 'rod', 'bait', 'crate_wood', 'crate_mythic', 'bottle', 'sigil_slime', 'trophy_heart', 'junk_boot', 'charm_fortune'] as ItemId[]) assert.ok(!chuteSells(id), `${id} is kept`);
    // the rule, stated over the whole catalogue
    for (const [id, d] of Object.entries(ITEMS)) {
        const want = d.sell > 0 && ['material', 'food', 'seed', 'potion'].includes(d.kind) && !d.gear && !d.open;
        assert.equal(chuteSells(id as ItemId), want, id);
        if (d.gear || d.open || d.kind === 'misc') assert.ok(!chuteSells(id as ItemId), `${id}: gear, crates and keepsakes are never sold`);
    }
    assert.ok(!chuteSells('constructor' as ItemId) && !chuteSells('zzz' as ItemId), 'nothing made up');
    assert.ok(!chuteTakes({ id: 1, k: 'bld', kind: 'chute', tx: 0, ty: 0, rot: 0 }, 'ironbar'), 'a chute nobody built has nobody to pay');
});

test('a belt feeding a chute sells everything that arrives, at 85% of the market price, into the builder\'s purse', () => {
    const sim = Sim.create('C-1', 'c');
    const { p, o } = yard(sim);
    const { first, end } = line(sim, o.tx + 2, o.ty + 2);
    const coins = p.coins;
    sim.events = [];
    assert.equal(feed(sim, first, 'ironbar', 20), 20);
    run(sim, 3);
    // an iron bar is worth 7 at the market: 7 x 0.85 = 5.95 each, 119 for twenty
    assert.equal(ITEMS.ironbar.sell, 7);
    assert.equal(p.coins - coins, 119, 'exactly 85% of what twenty bars would fetch');
    assert.equal(sim.s.prod?.coin, 119, 'and the farm\'s books show the income');
    assert.equal(end.inv, undefined, 'nothing is kept: it is sold on the spot');
    assert.ok(sim.buildings('belt').every((b) => b.belt!.every((s) => !s)), 'the belt is empty again');
    assert.equal(p.cnt?.sell, 119, 'what a chute sells counts as selling goods for the quests');
    // the market would pay a flat 140 for the same twenty: a chute is a convenience, not a gold mine
    assert.equal(Math.round(ITEMS.ironbar.sell * 20), 140);
    assert.ok(119 < 140);
});

test('the price is the Market\'s, with the builder\'s selling bonus, and a coin is never lost to rounding', () => {
    const sim = Sim.create('C-2', 'c');
    const { p, o } = yard(sim);
    sim.give(p, 'charm_scarab', 1);
    p.equip.charm = 'charm_scarab';                        // +8% when selling
    const { first } = line(sim, o.tx + 2, o.ty + 2);
    const coins = p.coins;
    feed(sim, first, 'ironbar', 30);
    run(sim, 3);
    const exact = 30 * 7 * 1.08 * 0.85;                    // 192.78
    assert.ok(Math.abs(p.coins - coins - exact) < 1, `paid ${p.coins - coins}, the exact price is ${exact.toFixed(2)}`);
    // cheap things do not round to nothing: a hundred wood at 1 coin is 85 coins
    const sim2 = Sim.create('C-2b', 'c');
    const y2 = yard(sim2);
    const l2 = line(sim2, y2.o.tx + 2, y2.o.ty + 2);
    feed(sim2, l2.first, 'wood', 100, 120);
    run(sim2, 3);
    assert.equal(y2.p.coins, 85, 'a hundred logs, 85 coins');
});

test('the coins go to whoever built it, even when they are away, and only to them', () => {
    const sim = Sim.create('C-3', 'c');
    const { p, o } = yard(sim, 'a');
    const q = sim.join('b', 'B')!;
    const { first } = line(sim, o.tx + 2, o.ty + 2);        // built by 'a'
    sim.leave('a');
    assert.ok(!p.online && q.online);
    const mine = p.coins, theirs = q.coins;
    feed(sim, first, 'plank', 20);
    run(sim, 3);
    assert.equal(p.coins - mine, Math.floor(20 * 2 * 0.85), 'the absent builder was paid');
    assert.equal(q.coins, theirs, 'the farmer standing right there was not');
    // a chute 'b' built pays 'b'
    const o2 = sim.world.plotOrigin(sim.homePlot(q.slot));
    q.x = (o2.tx + 6) * TILE; q.y = (o2.ty + 6) * TILE;
    const a = belt(sim, o2.tx + 2, o2.ty + 2); belt(sim, o2.tx + 3, o2.ty + 2);
    chute(sim, o2.tx + 4, o2.ty + 2, { by: 'b' });
    a.by = 'b';
    const mine2 = p.coins;
    feed(sim, a, 'plank', 10);
    run(sim, 3);
    assert.equal(q.coins - theirs, Math.floor(10 * 2 * 0.85), 'the other builder is paid for theirs');
    assert.equal(p.coins, mine2, 'and the first one is not');
});

test('what a chute cannot sell stays on the belt (the belt waits, it is never swallowed), and a sorter turns it aside', () => {
    const sim = Sim.create('C-4', 'c');
    const { p, o } = yard(sim);
    const { first, end } = line(sim, o.tx + 2, o.ty + 2);
    const coins = p.coins;
    first.belt![0] = 'pick_iron';
    run(sim, 6);
    assert.equal(p.coins, coins, 'a pick is not sold');
    const stuck = sim.buildings('belt').find((b) => b.belt!.includes('pick_iron'));
    assert.ok(stuck, 'it is still on the belt');
    assert.equal(stuck!.tx, o.tx + 5, 'waiting at the end, in front of the chute');
    const s = status(sim, stuck!);
    assert.equal(s.state, 'full');
    assert.match(s.text, /Export Chute.*will not take Iron Pick/);
    assert.match(s.hint, /does not sell Iron Pick/);
    assert.match(s.hint, /Sorter/, 'it says how to get out of it');
    assert.equal(end.ch, undefined, 'and the chute never took it');
    // now the fix the hint names: a sorter in front of the chute turns the pick aside into a chest, the bars go on and sell
    const sim2 = Sim.create('C-4b', 'c');
    const y2 = yard(sim2);
    const x = y2.o.tx + 2, y = y2.o.ty + 2;
    const a = belt(sim2, x, y); belt(sim2, x + 1, y);
    put(sim2, 'sorter', x + 2, y, { rot: 0, flt: 'ironbar', belt: [null, null, null] });
    chute(sim2, x + 3, y);
    const bin = chest(sim2, x + 2, y + 1);
    a.belt![0] = 'pick_iron'; sim2.touch(a);
    run(sim2, 1);
    feed(sim2, a, 'ironbar', 4);
    run(sim2, 5);
    assert.equal(bin.inv!.pick_iron, 1, 'the pick went into the bin');
    assert.equal(y2.p.coins, Math.floor(4 * 7 * 0.85), 'the bars sold');
});

test('a filter makes it sell only that item, and only a sellable item can be chosen', () => {
    const sim = Sim.create('C-5', 'c');
    const { p, o } = yard(sim);
    const { first, end } = line(sim, o.tx + 2, o.ty + 2);
    sim.command('a', { t: 'config', id: end.id, flt: 'wheat' });
    assert.equal(end.flt, 'wheat');
    sim.command('a', { t: 'config', id: end.id, flt: 'pick_iron' });
    assert.equal(end.flt, 'wheat', 'a pick is not something it could ever sell: the filter is left alone');
    sim.command('a', { t: 'config', id: end.id, flt: 'zzz' as never });
    assert.equal(end.flt, 'wheat', 'junk is ignored');
    const coins = p.coins;
    first.belt![0] = 'ironbar'; sim.touch(first);
    run(sim, 5);
    assert.equal(p.coins, coins, 'iron bars are refused while it only sells wheat');
    assert.ok(sim.buildings('belt').some((b) => b.belt!.includes('ironbar')), 'and wait on the belt');
    assert.match(status(sim, sim.buildings('belt').find((b) => b.belt!.includes('ironbar'))!).hint, /only sells Wheat/);
    sim.buildings('belt').forEach((b) => { b.belt = [null, null, null]; });
    feed(sim, first, 'wheat', 10);
    run(sim, 3);
    assert.equal(p.coins - coins, Math.floor(10 * 2 * 0.85), 'wheat sells');
    sim.command('a', { t: 'config', id: end.id, flt: null });
    assert.equal(end.flt, undefined, 'and the filter can be cleared');
    // a farmer out of reach changes nothing
    p.x = (o.tx + 60) * TILE;
    sim.command('a', { t: 'config', id: end.id, flt: 'wheat' });
    assert.equal(end.flt, undefined);
});

test('it keeps a rolling minute: "about X coins a minute" while things arrive, nothing once they stop', () => {
    const sim = Sim.create('C-6', 'c');
    const { o } = yard(sim);
    const { first, end } = line(sim, o.tx + 2, o.ty + 2);
    assert.equal(status(sim, end).state, 'waiting', 'before anything comes it waits');
    assert.match(status(sim, end).text, /Waiting for items/);
    assert.equal(chuteRate(end.ch, 0), 0);
    // one iron bar (5.95 coins) every two seconds for 50 seconds is about 178 coins a minute
    for (let t = 0; t < 50; t += 2) { first.belt![0] = 'ironbar'; sim.touch(first); run(sim, 2); }
    const rate = chuteRate(end.ch, sim.s.time);
    const want = 5.95 * 30;
    assert.ok(rate > want * 0.8 && rate < want * 1.2, `about ${Math.round(want)} a minute, read ${Math.round(rate)}`);
    const s = status(sim, end);
    assert.equal(s.state, 'working');
    assert.equal(s.badge, 'work');
    assert.match(s.text, /^Selling: about \d+ coins a minute$/);
    assert.ok(Math.abs((s.coins ?? 0) - rate) < 1e-9, 'the Factory view reads the same number');
    // they stop: the old takings fall out of the minute, slice by slice
    run(sim, 30);
    assert.ok(chuteRate(end.ch, sim.s.time) < rate, 'it falls');
    run(sim, 40);
    assert.equal(chuteRate(end.ch, sim.s.time), 0, 'a minute later it is zero');
    assert.match(status(sim, end).text, /Waiting for items/);
    assert.equal(end.ch!.w.length, CHUTE_SLICES);
    assert.ok(end.ch!.w.every((n) => Number.isFinite(n) && n >= 0), 'the books stay sane');
    // a chute that has just started is not told it earns a sixth of what it does
    const sim2 = Sim.create('C-6b', 'c');
    const y2 = yard(sim2);
    const l2 = line(sim2, y2.o.tx + 2, y2.o.ty + 2);
    run(sim2, 100);
    for (let t = 0; t < 10; t += 1) { l2.first.belt![0] = 'ironbar'; sim2.touch(l2.first); run(sim2, 1); }
    const early = chuteRate(l2.end.ch, sim2.s.time);
    assert.ok(early > 5.95 * 10 * 1.3, `ten bars in ten seconds reads as more than a trickle (${Math.round(early)} a minute)`);
});

test('an inserter feeds it from a chest, and a drill can feed it ore directly', () => {
    const sim = Sim.create('C-7', 'c');
    const { p, o } = yard(sim);
    chest(sim, o.tx + 2, o.ty + 2, { wheat: 12, ironbar: 5, pick_iron: 1 });
    put(sim, 'inserter', o.tx + 3, o.ty + 2, { rot: 0 });
    chute(sim, o.tx + 4, o.ty + 2);
    put(sim, 'pole', o.tx + 4, o.ty + 4);
    put(sim, 'windturbine', o.tx + 6, o.ty + 5);
    const coins = p.coins;
    run(sim, 60);
    assert.equal(p.coins - coins, Math.floor((12 * 2 + 5 * 7) * 0.85), 'everything sellable in the chest was sold, the pick stayed');
    const box = sim.buildings('chest')[0];
    assert.equal(box.inv!.pick_iron, 1, 'the pick is still in the chest');
    assert.equal(statusOf(sim.buildings('inserter')[0], simEnv(sim)).state, 'full', 'the inserter says the chute will not take the pick');
    // a drill straight into it
    const sim2 = Sim.create('C-7b', 'c');
    const y2 = yard(sim2);
    const plot = sim2.world.plotAt(y2.o.tx + 1, y2.o.ty + 1)!;
    plot.veins = [[y2.o.tx + 3, y2.o.ty + 3, 'iron'], [y2.o.tx + 4, y2.o.ty + 3, 'iron'], [y2.o.tx + 3, y2.o.ty + 4, 'iron'], [y2.o.tx + 4, y2.o.ty + 4, 'iron']];
    put(sim2, 'drill', y2.o.tx + 3, y2.o.ty + 3, { rot: 0, out: {} });
    chute(sim2, y2.o.tx + 5, y2.o.ty + 3);
    put(sim2, 'pole', y2.o.tx + 4, y2.o.ty + 5);
    put(sim2, 'windturbine', y2.o.tx + 6, y2.o.ty + 6);
    run(sim2, 40);
    assert.ok(y2.p.coins >= 6, `mined ore sold as it came (${y2.p.coins} coins)`);
    assert.ok((sim2.s.prod?.coin ?? 0) === y2.p.coins);
});

test('it shows its income about once a second, not once per item, with one quiet clink', () => {
    const sim = Sim.create('C-8', 'c');
    const { o } = yard(sim);
    const { first, end } = line(sim, o.tx + 2, o.ty + 2);
    run(sim, 2);
    sim.events = [];
    const before = sim.s.players.a.coins;
    assert.equal(feed(sim, first, 'ironbar', 40, 20), 40);
    run(sim, 5);
    assert.equal(sim.s.players.a.coins - before, Math.floor(40 * 7 * 0.85), 'all forty sold');
    const floats = floatsOf(sim), fx = sim.events.filter((e) => e.e === 'fx' && e.fx === 'chute');
    assert.ok(floats.length >= 2 && floats.length <= 12, `${floats.length} numbers for forty items`);
    assert.ok(fx.length === floats.length, 'one clink per number');
    assert.ok(fx.every((e) => e.e === 'fx' && e.by === undefined), 'nobody\'s own action: nobody\'s camera shakes');
    const shown = floats.reduce((a, e) => a + Number(e.e === 'float' ? e.text.slice(1) : 0), 0);
    assert.equal(shown, Math.floor(40 * 7 * 0.85), 'the numbers add up to what was paid');
    assert.ok(floats.every((e) => e.e === 'float' && e.key === `chute-${end.id}` && e.to === undefined), 'they merge by chute and everybody near sees them');
    // nothing arriving: nothing shown
    sim.events = [];
    run(sim, 5);
    assert.equal(floatsOf(sim).length, 0);
});

test('the books are plain JSON: a save and a reload carry the income on', () => {
    const sim = Sim.create('C-9', 'c');
    const { p, o } = yard(sim);
    const { first, end } = line(sim, o.tx + 2, o.ty + 2);
    feed(sim, first, 'ironbar', 12);
    run(sim, 2);
    const json = JSON.stringify(sim.s);
    const copy = new Sim(JSON.parse(json));
    const was = copy.s.ents[end.id] as BuildE;
    assert.deepEqual(was.ch, end.ch, 'the books came back as they were');
    assert.equal(chuteRate(was.ch, copy.s.time), chuteRate(end.ch, sim.s.time));
    // and it goes on selling in the reloaded world
    const first2 = copy.s.ents[first.id] as BuildE;
    const q = copy.s.players[p.id];
    const coins = q.coins;
    feed(copy, first2, 'ironbar', 6);
    run(copy, 3);
    assert.ok(q.coins - coins >= 4 * 5, `${q.coins - coins} coins after the reload`);
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(copy.s.ents[end.id]))), JSON.stringify(copy.s.ents[end.id]), 'still plain JSON');
});

test('building it takes the Logistics skill and its price; pressing E opens its window; a blueprint remembers its filter', () => {
    const sim = Sim.create('C-10', 'c');
    const { p, o } = yard(sim);
    sim.give(p, 'ironbar', 3); sim.give(p, 'plank', 4); sim.give(p, 'gear', 1);
    sim.command('a', { t: 'build', kind: 'chute', tx: o.tx + 8, ty: o.ty + 8 });
    assert.equal(sim.buildings('chute').length, 0, 'locked until Logistics is learned');
    p.skills.i_belts = 1;
    sim.command('a', { t: 'build', kind: 'chute', tx: o.tx + 8, ty: o.ty + 8 });
    const c = sim.buildings('chute')[0];
    assert.ok(c, 'built');
    assert.equal(c.by, 'a', 'it remembers who built it');
    assert.equal(p.inv.ironbar ?? 0, 0); assert.equal(p.inv.plank ?? 0, 0); assert.equal(p.inv.gear ?? 0, 0);
    sim.events = [];
    p.x = (o.tx + 8.5) * TILE; p.y = (o.ty + 10) * TILE;
    sim.command('a', { t: 'use', id: c.id });
    assert.ok(sim.events.some((e) => e.e === 'open' && e.ui === 'device' && e.id === c.id), 'E opens the device window');
    // a blueprint puts one down with its filter
    sim.give(p, 'ironbar', 3); sim.give(p, 'plank', 4); sim.give(p, 'gear', 1);
    sim.command('a', { t: 'bp', tx: o.tx + 4, ty: o.ty + 4, items: [{ kind: 'chute', dx: 0, dy: 0, rot: 0, flt: 'wheat' }] });
    const copy = sim.buildings('chute').find((b) => b.id !== c.id);
    assert.equal(copy?.flt, 'wheat');
    sim.command('a', { t: 'bp', tx: o.tx + 4, ty: o.ty + 6, items: [{ kind: 'chute', dx: 0, dy: 0, rot: 0, flt: 'pick_iron' }] });
    assert.ok(sim.buildings('chute').every((b) => b.flt !== 'pick_iron'), 'an unsellable filter in a blueprint is dropped');
});

test('a chute with nothing feeding it says so, and what feeds it is told apart from what does not', () => {
    const sim = Sim.create('C-11', 'c');
    const { o } = yard(sim);
    const lone = chute(sim, o.tx + 8, o.ty + 8);
    let s = status(sim, lone);
    assert.equal(s.state, 'noin');
    assert.equal(s.badge, 'block');
    assert.match(s.hint, /belt, an inserter or a drill/);
    belt(sim, o.tx + 7, o.ty + 8, 0);                      // pointing at it
    assert.equal(status(sim, lone).state, 'waiting');
    const other = chute(sim, o.tx + 12, o.ty + 8);
    belt(sim, o.tx + 11, o.ty + 8, 2);                     // pointing away
    s = status(sim, other);
    assert.equal(s.state, 'noin', 'a belt pointing the wrong way does not count');
    sim.remove(lone.id);
});

test('the first-time hint and the guide say the true cut', () => {
    const sim = Sim.create('C-12', 'c');
    const p = sim.join('a', 'A')!;
    const hint = HINTS.find((h) => h.id === 'chute')!;
    assert.ok(hint, 'a hint for the chute');
    assert.ok(!hint.when({ me: p, prompt: '' }), 'quiet until one is built');
    p.cnt = { 'build:chute': 1 };
    assert.ok(hint.when({ me: p, prompt: '' }));
    const text = hint.text({ me: p, prompt: '' }, { fish: 'Q' });
    assert.ok(text.includes('85%') && text.length <= 170, text);
    const belts = GUIDE_BY_ID.belts.steps.map((s) => (typeof s === 'string' ? s : s[0])).join(' ');
    assert.ok(belts.includes('Export Chute') && belts.includes(`${Math.round(TUNING.chuteCut * 100)}%`), 'the belts page names it and its cut');
});

test('a chute streams to a farmer nearby with its books, so the Factory view can read them; the farm income is in the production totals', () => {
    const sim = Sim.create('C-13', 'c');
    const host = new SimHost(sim, 'T');
    const peer = (): Peer & { msgs: ServerMsg[] } => { const msgs: ServerMsg[] = []; return { msgs, send: (t: string) => msgs.push(JSON.parse(t)) }; };
    const a = peer();
    host.attach(a);
    host.receive(a, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A' }));
    const p = sim.s.players.a;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    const { first, end } = line(sim, o.tx + 2, o.ty + 2);
    feed(sim, first, 'ironbar', 8);
    run(sim, 2);
    for (let i = 0; i < 12; i++) host.update(0.15);
    const ticks = a.msgs.filter((m): m is TickMsg => m.t === 'tick');
    const seen = ticks.flatMap((t) => t.ents).filter((e): e is BuildE => e.k === 'bld' && e.id === end.id);
    assert.ok(seen.length > 0, 'the chute was sent');
    const got = seen[seen.length - 1].ch!, want = end.ch!;
    assert.deepEqual({ s: got.s, w: got.w, t0: got.t0 }, { s: want.s, w: want.w, t0: want.t0 }, 'with the books the rate is read from');
    assert.equal(chuteRate(got, sim.s.time), chuteRate(want, sim.s.time), 'so a client reads the same rate');
    assert.ok(ticks.some((t) => t.prod?.coin === Math.floor(8 * 7 * 0.85)), 'and the production totals carry the coins the chutes paid');
});
