// The evening hearth: two or more at one fire in the last minute of the day earn Hearthside until dawn; a farmer and their own companion count as two.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import type { Pet } from '../src/shared/data/creatures';
import { circleNames, HEARTH_SPOTS } from '../src/shared/data/hearth';
import { BUFFS } from '../src/shared/data/stats';
import { ACTIONS } from '../src/shared/actions';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { hasHearth } from '../src/shared/sim/hearth';
import { petsOf } from '../src/shared/sim/petlib';
import { Sim } from '../src/shared/sim/sim';
import { derived, grantXp } from '../src/shared/sim/stats';
import type { BuildE, PlayerS, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s - 1e-9; t += STEP) sim.step(STEP); };
const events = <T extends SimEvent['e']>(sim: Sim, e: T) => sim.events.filter((x): x is Extract<SimEvent, { e: T }> => x.e === e);
const dusk = (sim: Sim, left = 40) => { sim.s.clock = TUNING.dayLength - left; };
const pet = (name = 'Biscuit'): Pet => ({ id: 'p1', sp: 'hopper', name, lv: 3, xp: 0, traits: [] });

/** A home island with a campfire in the middle, and two farmers (Ann and Bo, who is put beside Ann; Cy joins when asked). */
function yard (seed: string, kind: 'campfire' | 'table' | 'lantern' = 'campfire') {
    const sim = Sim.create(seed, 'h');
    const a = sim.join('a', 'Ann')!, b = sim.join('b', 'Bo')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    const fire = sim.add<BuildE>({ k: 'bld', kind, tx: o.tx + 8, ty: o.ty + 8, rot: 0 });
    /** Stand a farmer `dx, dy` tiles from the fire's top left. */
    const stand = (p: PlayerS, dx: number, dy = 0) => { p.x = (fire.tx + 0.5 + dx) * TILE; p.y = (fire.ty + 1 + dy) * TILE; p.invuln = 99999; p.hearts = 99; p.moving = false; };
    stand(a, 1); stand(b, -1);
    sim.events = [];
    return { sim, a, b, fire, stand, o };
}
const buff = (p: PlayerS) => p.buffs.find((x) => x.id === 'hearth');

test('Hearthside is a real buff: regen, a heart tick and +15% XP, and the actions and spots are registered', () => {
    const b = BUFFS.hearth;
    assert.ok(b.good && b.mods.energyRegen! > 0 && b.mods.healPower! > 0 && b.mods.xp === 0.15, 'energy, hearts and xp');
    for (const a of ['hearth', 'pat', 'gift']) assert.ok((ACTIONS as readonly string[]).includes(a), `${a} is a juice-rule action`);
    assert.ok(HEARTH_SPOTS.campfire && HEARTH_SPOTS.table, 'the named gathering places');
    const { a } = yard('HT-0');
    const before = derived(a);
    a.buffs.push({ id: 'hearth', t: 60 });
    const after = derived(a);
    assert.ok(after.energyRegen > before.energyRegen, 'faster energy');
    assert.ok(Math.abs(after.xpMul - before.xpMul - 0.15) < 1e-9, '+15% XP');
    assert.ok(after.healMul > before.healMul, 'stronger healing');
    a.xp = 0; a.level = 1; a.buffs = [];
    grantXp(a, 10);
    const plain = a.xp;
    a.xp = 0; a.buffs.push({ id: 'hearth', t: 60 });
    grantXp(a, 10);
    assert.ok(Math.abs(a.xp - plain * 1.15) < 1e-9, 'the XP really is 15% more');
});

test('two farmers at a campfire in the dusk countdown kindle it, and both are given Hearthside until dawn', () => {
    const { sim, a, b, fire } = yard('HT-1');
    dusk(sim, 40);
    run(sim, TUNING.hearthFill * 0.5);
    assert.ok(!buff(a) && !buff(b), 'not yet: the fire is still filling');
    assert.ok((fire.hg ?? 0) > 0.3 && (fire.hg ?? 0) < 0.7, `it fills as they sit (${fire.hg})`);
    run(sim, TUNING.hearthFill * 0.8);
    for (const p of [a, b]) {
        const h = buff(p);
        assert.ok(h, `${p.name} has Hearthside`);
        assert.ok(h!.t > sim.s.nightLen && h!.t <= 40 + sim.s.nightLen, `it lasts the rest of the day and the whole night (${h!.t})`);
    }
    assert.equal(fire.hg, 1, 'the fire is kindled');
    // everybody is told, with the names of the circle, and there is a burst at the fire and on each farmer
    const banners = events(sim, 'banner').filter((x) => x.text.startsWith('Hearthside'));
    assert.equal(banners.length, 2, 'one banner each');
    for (const bn of banners) assert.ok(bn.text === 'Hearthside: Ann & Bo' && bn.to && ['a', 'b'].includes(bn.to), bn.text);
    const fx = events(sim, 'fx').filter((e) => e.fx === 'hearth');
    assert.equal(fx.length, 3, 'a burst at the fire and one on each farmer');
    assert.deepEqual(fx.filter((e) => e.by).map((e) => e.by).sort(), ['a', 'b'], 'the farmers get their own (with the shake), the fire\'s is for everyone');
    assert.equal(a.cnt?.hearth, 1, 'counted for quests');
    // the buff ticks down like any other and is the same buff that the HUD shows
    const t0 = buff(a)!.t;
    run(sim, 2);
    assert.ok(buff(a)!.t < t0 - 1.9);
});

test('nobody is punished for walking off: once the fire is kindled the buff is theirs, and a friend who sits down late gets it too', () => {
    const { sim, a, b, stand, o } = yard('HT-2');
    dusk(sim, 40);
    run(sim, TUNING.hearthFill + 1);
    assert.ok(buff(a) && buff(b));
    stand(b, 20);                          // Bo wanders off to fetch something
    run(sim, 4);
    assert.ok(buff(b), 'Bo keeps it');
    // Cy arrives later and sits at the kindled fire alone: it is already burning
    const c = sim.join('c', 'Cy')!;
    stand(c, 0, 1);
    sim.events = [];
    assert.ok(!buff(c));
    run(sim, 1);
    assert.ok(buff(c), 'a late arrival is welcomed');
    assert.equal(events(sim, 'banner').filter((x) => x.to === 'c').length, 1);
    assert.ok(o);
});

test('arriving in the last seconds still counts: a circle sitting there as night falls kindles on the spot', () => {
    const { sim, a, b, fire } = yard('HT-3');
    dusk(sim, 1.5);
    run(sim, 1.2);
    assert.ok(!buff(a), 'the fill is not full yet');
    assert.ok(!sim.s.night);
    run(sim, 0.6);
    assert.ok(sim.s.night, 'night has fallen');
    assert.ok(buff(a) && buff(b), 'both are given it as it does');
    assert.ok(Math.abs(buff(a)!.t - sim.s.nightLen) < 1, 'for the night');
    assert.equal(fire.hg, undefined, 'the fire is spent once night falls');
});

test('a farmer alone gets nothing, whatever the time; so do two who are not at the fire', () => {
    const { sim, a, b, fire, stand } = yard('HT-4');
    stand(b, 30);                          // Bo is across the island
    dusk(sim, 40);
    run(sim, 20);
    assert.ok(!buff(a) && !buff(b), 'one at the fire is not a circle');
    assert.equal(fire.hg, undefined, 'and the fire did not even start to fill');
    run(sim, 25);                          // night falls
    assert.ok(sim.s.night);
    assert.ok(!buff(a) && !buff(b));
    // two farmers at the same spot but far from any fire
    const y2 = yard('HT-4b');
    y2.stand(y2.a, 9); y2.stand(y2.b, 9.5);
    dusk(y2.sim, 40);
    run(y2.sim, 12);
    assert.ok(!buff(y2.a) && !buff(y2.b), 'a fire within about three tiles is what counts');
    // and by day, away from the countdown, a circle at the fire is only company
    const y3 = yard('HT-4c');
    y3.sim.s.clock = 30;
    run(y3.sim, 12);
    assert.ok(!buff(y3.a) && !buff(y3.b) && y3.fire.hg === undefined, 'only the last minute of the day counts');
});

test('a farmer with their own companion standing near them counts as two', () => {
    const { sim, a, b, fire, stand } = yard('HT-5');
    stand(b, 30);
    petsOf(a).push(pet());
    a.comp = 'p1';
    dusk(sim, 40);
    run(sim, 1);
    const comp = Object.values(sim.s.ents).find((e) => e.k === 'crit' && e.mode === 1);
    assert.ok(comp, 'the companion is out');
    run(sim, TUNING.hearthFill + 1);
    assert.ok(buff(a), 'Ann and Biscuit are a circle');
    assert.ok(!buff(b), 'Bo, away from the fire, is not');
    assert.equal(fire.hg, 1);
    const banner = events(sim, 'banner').find((x) => x.to === 'a' && x.text.startsWith('Hearthside'));
    assert.equal(banner?.text, 'Hearthside: Ann & Biscuit', 'the banner names the pet too');
    assert.ok(events(sim, 'hop').some((h) => h.id === comp!.id), 'and the creature hops for joy');
});

test('a companion that is not near the fire is not company', () => {
    const { sim, a, b, fire, stand } = yard('HT-6');
    stand(b, 30);
    petsOf(a).push(pet());
    a.comp = 'p1';
    dusk(sim, 50);
    run(sim, 1);
    const comp = Object.values(sim.s.ents).find((e) => e.k === 'crit' && e.mode === 1)!;
    assert.ok(comp.k === 'crit');
    // the creature is off chasing something, five tiles from the fire; the farmer sits down
    for (let i = 0; i < 100; i++) { comp.x = (fire.tx + 0.5) * TILE + 5 * TILE; comp.y = (fire.ty + 1) * TILE; sim.step(STEP); }
    assert.ok(!buff(a), 'a pet far from the fire is not at it');
    assert.equal(fire.hg, undefined);
    // a creature counts only for the farmer who sits at the fire with it: Bo and his pet are across the island, so there is still no circle
    const bo = sim.s.players.b;
    petsOf(bo).push({ ...pet('Pip'), id: 'p9' });
    bo.comp = 'p9';
    run(sim, 1);
    assert.ok(!buff(a) && !buff(bo), 'Bo (and his pet) are across the island');
});

test('a farmer who is down does not sit at the fire; one who is revived while it burns is welcomed', () => {
    const { sim, a, b, fire } = yard('HT-7');
    dusk(sim, 40);
    b.downed = 20;
    run(sim, TUNING.hearthFill * 2);
    assert.ok(!buff(a) && !buff(b), 'a farmer on their own at the fire, with a friend on the ground beside them, is not a circle');
    assert.equal(fire.hg, undefined);
    // an expedition farmer does not count either
    b.downed = 0;
    (b as { rift?: unknown }).rift = { arena: 0, tier: 0, wave: 0, waves: 3, ph: 1, left: 0, t: 0, party: 1, kills: 0 };
    run(sim, TUNING.hearthFill * 2);
    assert.ok(!buff(a) && !buff(b), 'on an expedition is not at the fire');
    delete b.rift;
    run(sim, TUNING.hearthFill + 1);
    assert.ok(buff(a) && buff(b), 'on their feet again, it kindles');
});

test('the buff ends at dawn, for the farmers who are away too', () => {
    const { sim, a, b } = yard('HT-8');
    dusk(sim, 30);
    run(sim, TUNING.hearthFill + 1);
    assert.ok(buff(a) && buff(b));
    sim.leave('b');                                  // Bo logs off with it
    assert.ok(buff(b), 'it is in his record');
    run(sim, 30);
    assert.ok(sim.s.night);
    assert.ok(buff(a), 'all night');
    assert.ok(sim.s.nightLen > 20);
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.2;
    const day = sim.s.day;
    run(sim, 0.5);
    assert.equal(sim.s.day, day + 1, 'dawn came');
    assert.ok(!sim.s.night);
    assert.ok(!buff(a), 'Ann\'s Hearthside is gone');
    assert.ok(!buff(b), 'and so is Bo\'s, though he was away');
    assert.ok(!hasHearth(a));
});

test('save and load in the middle of the night keep the buff, its timer and its end at dawn', () => {
    const { sim, a } = yard('HT-9');
    dusk(sim, 30);
    run(sim, TUNING.hearthFill + 1);
    run(sim, 30);
    assert.ok(sim.s.night && buff(a));
    const left = buff(a)!.t;
    const saved = JSON.parse(JSON.stringify(sim.s));
    const again = new Sim(saved);
    const a2 = again.join('a', 'Ann')!;
    assert.ok(buff(a2), 'still Hearthside');
    assert.ok(Math.abs(buff(a2)!.t - left) < 0.1, 'with its time');
    run(again, 5);
    assert.ok(buff(a2)!.t < left - 4.9, 'it keeps ticking');
    again.s.clock = TUNING.dayLength + again.s.nightLen - 0.2;
    run(again, 0.5);
    assert.ok(!buff(a2), 'and ends at dawn in the loaded world');
});

test('a fill saved in the middle of the countdown comes back, and one that belongs to no dusk is cleared on load', () => {
    const { sim, a, b, fire } = yard('HT-10');
    dusk(sim, 40);
    run(sim, 2);
    const mid = fire.hg ?? 0;
    assert.ok(mid > 0.3);
    const saved = JSON.parse(JSON.stringify(sim.s));
    const again = new Sim(saved);
    const fire2 = again.s.ents[fire.id] as BuildE;
    assert.ok(Math.abs((fire2.hg ?? 0) - mid) < 1e-9, 'the fill is in the save');
    const stale = JSON.parse(JSON.stringify(sim.s));
    stale.clock = 12;                                  // (a time jump in the developer menu, say)
    stale.players.a.buffs.push({ id: 'hearth', t: 50 });
    const clean = new Sim(stale);
    assert.equal((clean.s.ents[fire.id] as BuildE).hg, undefined, 'a fill with no dusk is dropped');
    assert.ok(!clean.s.players.a.buffs.some((x) => x.id === 'hearth'), 'and so is a Hearthside with no night');
    assert.ok(a && b);
});

test('the fill drains at half speed when the company parts, and a table is a place to gather as well', () => {
    const { sim, a, b, fire, stand } = yard('HT-11', 'table');
    dusk(sim, 50);
    run(sim, 3);
    const full = fire.hg!;
    assert.ok(full > 0.5 && full < 1, `${full}`);
    stand(b, 25);
    run(sim, 2.5);
    const less = fire.hg!;
    assert.ok(less < full && less > full - 0.35, `drained a little (${full} -> ${less})`);
    run(sim, 10);
    assert.equal(fire.hg, undefined, 'and then it goes out');
    stand(b, -1);
    run(sim, TUNING.hearthFill + 1);
    assert.ok(buff(a) && buff(b), 'a Table works as well as a Campfire');
    assert.ok(a);
});

test('Hearthside mends a heart every few seconds and the world is not told over and over while a fire fills', () => {
    const { sim, a, b, fire } = yard('HT-12');
    dusk(sim, 59);
    a.hearts = 1; a.buffs.push({ id: 'hearth', t: 400 });
    const max = derived(a).maxHearts;
    run(sim, TUNING.hearthHealEvery * 2.2);
    assert.ok(a.hearts >= 3 - 1e-9, `two hearts came back (${a.hearts} of ${max})`);
    b.buffs = [];
    assert.ok(b.hearts >= 0);
    // while the fire fills only the tenths are announced
    const touched: number[] = [];
    sim.dirty.clear();
    for (let i = 0; i < TUNING.hearthFill * 20; i++) { sim.step(STEP); if (sim.dirty.has(fire.id)) touched.push(i); sim.dirty.delete(fire.id); }
    assert.ok(touched.length <= 14, `${touched.length} updates`);
});

test('names fit a banner: one, two, three, then a count', () => {
    assert.equal(circleNames(['Ann']), 'Ann');
    assert.equal(circleNames(['Ann', 'Bo']), 'Ann & Bo');
    assert.equal(circleNames(['Ann', 'Bo', 'Cy']), 'Ann, Bo & Cy');
    assert.equal(circleNames(['Ann', 'Bo', 'Cy', 'Di', 'Ed']), 'Ann, Bo, Cy +2');
    assert.equal(circleNames([]), '');
});

test('online: the fill of the fire reaches every farmer near it, and each member of the circle gets their own banner', () => {
    type Inbox = Peer & { msgs: ServerMsg[] };
    const inbox = (): Inbox => { const msgs: ServerMsg[] = []; return { msgs, send: (t: string) => { msgs.push(JSON.parse(t)); } }; };
    const sim = Sim.create('HT-13', 'hw');
    const host = new SimHost(sim, 'Test', '');
    const join = (id: string, name: string) => { const peer = inbox(); host.attach(peer); host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name })); return peer; };
    const pa = join('a', 'Ann'), pb = join('b', 'Bo');
    const a = sim.s.players.a, b = sim.s.players.b;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    const fire = sim.add<BuildE>({ k: 'bld', kind: 'campfire', tx: o.tx + 8, ty: o.ty + 8, rot: 0 });
    for (const [p, dx] of [[a, 1], [b, -1]] as const) { p.x = (fire.tx + 0.5 + dx) * TILE; p.y = (fire.ty + 1) * TILE; p.invuln = 99999; p.hearts = 99; }
    host.flush();
    pa.msgs.length = 0; pb.msgs.length = 0;
    dusk(sim, 40);
    for (let i = 0; i < 20 * (TUNING.hearthFill + 1); i++) { sim.step(STEP); if (i % 2 === 0) host.flush(); }
    host.flush();
    const ticks = (p: Inbox) => p.msgs.filter((m): m is TickMsg => m.t === 'tick');
    for (const [peer, id] of [[pa, 'a'], [pb, 'b']] as const) {
        const seen = ticks(peer).flatMap((t) => t.ents).filter((e) => e.id === fire.id) as BuildE[];
        assert.ok(seen.some((e) => e.hg !== undefined && e.hg > 0 && e.hg < 1), `${id} watched the fire fill`);
        assert.ok(seen.some((e) => e.hg === 1), `${id} saw it kindled`);
        const banners = ticks(peer).flatMap((t) => t.ev).filter((e) => e.e === 'banner' && e.text.startsWith('Hearthside'));
        assert.equal(banners.length, 1, `${id}: one Hearthside banner, for them`);
        assert.equal((banners[0] as { to?: string }).to, id);
    }
    // the buff is the farmer's own: it is in their own view and never in the friend's
    const own = ticks(pa).flatMap((t) => t.players.filter((d) => d.id === 'a')) as { buffs?: { id: string }[] }[];
    assert.ok(own.some((d) => d.buffs?.some((x) => x.id === 'hearth')), 'Ann sees her Hearthside');
    const other = ticks(pb).flatMap((t) => t.players.filter((d) => d.id === 'a')) as { buffs?: unknown }[];
    assert.ok(!other.some((d) => 'buffs' in d), 'Bo never sees her buffs');
});

test('what the guide, the tip and the hint promise is what the rules do', async () => {
    const { GUIDE_BY_ID, guideText } = await import('../src/shared/data/guide');
    const { TIPS } = await import('../src/shared/data/tips');
    const { HINTS } = await import('../src/shared/data/hints');
    const { PATS_PER_DAY } = await import('../src/shared/data/bond');
    const keys = { move: 'WASD', fish: 'Q' };
    const fight = GUIDE_BY_ID.start.steps.map((s) => guideText(s, false, keys)).join(' ');
    assert.ok(fight.includes('Hearthside') && fight.includes('last minute') && TUNING.duskWarn[0] === 60, 'the last minute of the day is the dusk countdown');
    assert.ok(fight.includes(`+${Math.round(BUFFS.hearth.mods.xp! * 100)}% XP`), 'the xp bonus is the buff\'s');
    const pets = GUIDE_BY_ID.pets.steps.map((s) => guideText(s, true, keys)).join(' ');
    assert.ok(pets.includes('tap USE') && pets.includes('to pet it'), 'a phone is told to tap USE');
    assert.ok(pets.includes('five pets a day') && PATS_PER_DAY === 5, 'five pets a day count');
    const tip = TIPS.find((t) => t.id === 'hearth')!;
    assert.ok(tip && tip.text.length <= 200 && tip.text.includes('+15% XP'), `the tip is short (${tip.text.length}) and true`);
    const hint = HINTS.find((h) => h.id === 'pat')!;
    assert.ok(hint && /[Pp]ress E/.test(hint.text({ me: {} as PlayerS, prompt: '' }, { fish: 'Q' })), 'the hint names the key (a phone reads it as USE)');
});
