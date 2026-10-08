// Petting your companion: affection with a daily cap, names for the levels, a gift once a day from a fond creature, and every way it can go wrong.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import {
    AFFECTION_LEVELS, AFFECTION_MAX, affectionOf, GIFT_AT, GIFTS, giftOdds, levelInfo, levelOf, PATS_PER_DAY,
} from '../src/shared/data/bond';
import type { Pet } from '../src/shared/data/creatures';
import { ITEMS } from '../src/shared/data/items';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { patInfo } from '../src/shared/sim/bond';
import { petsOf } from '../src/shared/sim/petlib';
import { Sim } from '../src/shared/sim/sim';
import type { Cmd, CritE, DropE, PlayerS, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s - 1e-9; t += STEP) sim.step(STEP); };
const events = <T extends SimEvent['e']>(sim: Sim, e: T) => sim.events.filter((x): x is Extract<SimEvent, { e: T }> => x.e === e);
const drops = (sim: Sim) => Object.values(sim.s.ents).filter((e): e is DropE => e.k === 'drop');
const mk = (id: string, name: string, over: Partial<Pet> = {}): Pet => ({ id, sp: 'hopper', name, lv: 3, xp: 0, traits: [], ...over });

/** A farmer with a companion beside them in an empty yard (and a friend with their own, a few tiles away). */
function yard (seed: string, aff?: number) {
    const sim = Sim.create(seed, 'b');
    const a = sim.join('a', 'Ann')!, b = sim.join('b', 'Bo')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 9) * TILE; a.fx = 1; a.fy = 0; a.hearts = 99; a.invuln = 99999;
    b.x = (o.tx + 14) * TILE; b.y = (o.ty + 9) * TILE; b.fx = 1; b.fy = 0; b.hearts = 99; b.invuln = 99999;
    const biscuit = mk('p1', 'Biscuit', aff === undefined ? {} : { aff });
    petsOf(a).push(biscuit);
    a.comp = 'p1';
    const pip = mk('p2', 'Pip');
    petsOf(b).push(pip);
    b.comp = 'p2';
    run(sim, 1);
    sim.events = [];
    const critOf = (who: string) => Object.values(sim.s.ents).find((e): e is CritE => e.k === 'crit' && e.mode === 1 && e.owner === who)!;
    const pat = (pid = 'a') => { sim.s.time += TUNING.patCooldown + 0.01; sim.command(pid, { t: 'pat' }); };
    /** The next day, as if dawn had come. */
    const nextDay = () => { sim.s.day++; };
    return { sim, a, b, biscuit, pip, critOf, pat, nextDay, o };
}

test('the levels are named, in order, and the gift starts at Fond', () => {
    assert.deepEqual(AFFECTION_LEVELS.map((l) => l.name), ['Shy', 'Friendly', 'Fond', 'Devoted']);
    for (let i = 1; i < AFFECTION_LEVELS.length; i++) assert.ok(AFFECTION_LEVELS[i].at > AFFECTION_LEVELS[i - 1].at);
    assert.equal(levelOf(0).name, 'Shy');
    assert.equal(levelOf(9).name, 'Shy');
    assert.equal(levelOf(10).name, 'Friendly');
    assert.equal(levelOf(GIFT_AT - 1).name, 'Friendly');
    assert.equal(levelOf(GIFT_AT).name, 'Fond', 'the gifts begin where Fond does');
    assert.equal(levelOf(100).name, 'Devoted');
    assert.equal(levelInfo({ aff: 45 }).next?.name, 'Devoted');
    assert.equal(levelInfo({ aff: 100 }).next, null);
    assert.equal(levelInfo({}).level.name, 'Shy', 'a creature from before this existed starts shy');
    for (const bad of [undefined, NaN, -5, 'x' as never, null as never, Infinity]) assert.ok(affectionOf({ aff: bad as never }) >= 0 && affectionOf({ aff: bad as never }) <= AFFECTION_MAX, `${String(bad)} is made safe`);
    assert.equal(affectionOf({ aff: 250 }), 100);
    assert.equal(affectionOf({ aff: 12.9 }), 12);
});

test('the gift tables are real items, odds grow with affection, and a rare find stays rare', () => {
    for (const [tier, rows] of Object.entries(GIFTS)) {
        assert.ok(rows.length >= 4, `tier ${tier} has choices`);
        for (const r of rows) {
            assert.ok(r.item === 'coin' || ITEMS[r.item], `${r.item} is a real item`);
            assert.ok(r.w > 0 && r.min >= 1 && r.max >= r.min && (r.item === 'coin' ? r.max <= 30 : r.max <= 6), `${r.item}: ${r.min}-${r.max} @ ${r.w}`);
        }
    }
    for (const r of GIFTS[0]) assert.ok(r.item === 'coin' || ITEMS[r.item].rarity <= 1, `${r.item} is a small thing`);
    assert.ok(GIFTS[0].some((r) => r.item === 'seed_wheat') && GIFTS[0].some((r) => r.item === 'sand') && GIFTS[0].some((r) => r.item === 'clay') && GIFTS[0].some((r) => r.item === 'mushroom'));
    const lo = giftOdds(GIFT_AT), hi = giftOdds(AFFECTION_MAX);
    assert.ok(hi.nice > lo.nice && hi.rare > lo.rare, 'more affection, better odds');
    assert.ok(lo.rare >= 0.02 && hi.rare <= 0.1, 'a rare gift is a treat, not a habit');
    assert.ok(hi.nice + hi.rare < 0.5, 'most days it is something small');
    assert.deepEqual(giftOdds(0), lo, 'no bonus below the threshold');
});

test('a pet earns affection, up to five a day, and a new day starts the count again', () => {
    const { sim, a, biscuit, pat, nextDay } = yard('BD-1');
    assert.equal(biscuit.aff, undefined, 'a new creature has none');
    for (let i = 1; i <= PATS_PER_DAY; i++) { pat(); assert.equal(biscuit.aff, i, `pet ${i}`); }
    sim.events = [];
    pat(); pat();
    assert.equal(biscuit.aff, PATS_PER_DAY, 'the day\'s pets are used up: no more today');
    assert.ok(events(sim, 'fx').filter((e) => e.fx === 'pat').length === 2, 'but it is still a pat: a sound, hearts and a hop each time');
    assert.ok(events(sim, 'float').some((f) => f.text.includes('plenty today') && f.to === 'a'), 'and it says so');
    nextDay();
    pat();
    assert.equal(biscuit.aff, PATS_PER_DAY + 1, 'a new day, a new pet counts');
    for (let i = 0; i < 9; i++) pat();
    assert.equal(biscuit.aff, PATS_PER_DAY + PATS_PER_DAY, 'five more that day, not more');
    assert.equal(biscuit.pt?.d, sim.s.day);
    assert.ok(a);
});

test('two pets inside a second count once; a pet after a second counts', () => {
    const { sim, biscuit } = yard('BD-2');
    sim.s.time += 5;
    sim.command('a', { t: 'pat' });
    sim.command('a', { t: 'pat' });
    assert.equal(biscuit.aff, 1, 'the second pat in the same instant is ignored');
    run(sim, 0.5);
    sim.command('a', { t: 'pat' });
    assert.equal(biscuit.aff, 1, 'and half a second later too');
    run(sim, TUNING.patCooldown + 0.1);
    sim.command('a', { t: 'pat' });
    assert.equal(biscuit.aff, 2, 'a second after the last');
});

test('a pat hops, floats hearts, plays the juice-rule action for the farmer, and names the new level', () => {
    const { sim, a, biscuit, critOf, pat } = yard('BD-3', 9);
    pat();
    const c = critOf('a');
    const fx = events(sim, 'fx').filter((e) => e.fx === 'pat');
    assert.equal(fx.length, 1);
    assert.equal(fx[0].by, 'a', 'the one who pets gets the trio, friends only see and hear');
    assert.ok(Math.abs(fx[0].x - c.x) < 1, 'at the creature');
    assert.deepEqual(events(sim, 'hop').map((h) => h.id), [c.id], 'the creature hops');
    assert.equal(events(sim, 'float').filter((f) => f.text === '♥').length, 3, 'hearts float up');
    assert.ok(events(sim, 'float').some((f) => f.to === 'a' && f.text.includes('Biscuit') && f.text.includes('10')), 'the farmer sees how fond it is');
    const banner = events(sim, 'banner').find((x) => x.to === 'a');
    assert.equal(banner?.text, 'Biscuit is Friendly now', 'crossing ten is a new name');
    assert.equal(biscuit.aff, 10);
    assert.equal(a.cnt?.pat, 1, 'counted for quests');
    sim.events = [];
    pat();
    assert.equal(events(sim, 'banner').length, 0, 'but only once');
});

test('no gift before the threshold; the first pat of a day at Fond digs one up, and only one', () => {
    const { sim, a, biscuit, critOf, pat, nextDay } = yard('BD-4', GIFT_AT - 3);
    for (let i = 0; i < 2; i++) pat();
    assert.equal(biscuit.aff, GIFT_AT - 1);
    assert.equal(drops(sim).length, 0, 'not fond enough yet');
    assert.ok(!events(sim, 'float').some((f) => f.text.includes('dug up')));
    pat();
    assert.equal(biscuit.aff, GIFT_AT, 'at the threshold');
    assert.ok(drops(sim).length >= 1, 'a gift lies next to it');
    const c = critOf('a');
    for (const d of drops(sim)) assert.ok(Math.hypot(d.x - c.x, d.y - c.y) < 40, 'right beside the creature');
    const said = events(sim, 'float').filter((f) => f.text === 'Biscuit dug up something!');
    assert.equal(said.length, 1, 'with its name');
    assert.ok(events(sim, 'fx').some((e) => e.fx === 'gift' && e.by === 'a'), 'and the juice-rule action');
    assert.equal(biscuit.pt?.g, sim.s.day, 'the day is written on the creature');
    const n = drops(sim).length;
    sim.events = [];
    pat(); pat();
    assert.equal(drops(sim).length, n, 'once a day');
    assert.ok(!events(sim, 'float').some((f) => f.text.includes('dug up')));
    nextDay();
    pat();
    assert.ok(drops(sim).length > n, 'the next day it digs again');
    assert.ok(a);
});

test('the gift is yours: it flies into your pockets, and what it is comes from the tables', () => {
    const { sim, a, pat, nextDay } = yard('BD-5', 60);
    const before = JSON.stringify([a.inv, a.coins]);
    const found = new Set<string>();
    for (let day = 0; day < 12; day++) {
        pat();
        for (const d of drops(sim)) found.add(d.res);
        run(sim, 2);
        nextDay();
    }
    const all = new Set(Object.values(GIFTS).flat().map((r) => r.item));
    for (const f of found) assert.ok(all.has(f as never), `${f} is a gift from the tables`);
    assert.ok(found.size >= 2, `a variety (${[...found].join(', ')})`);
    assert.notEqual(JSON.stringify([a.inv, a.coins]), before, 'it all came to you');
});

test('over many days the odds are what the table says: mostly small things, rarely a treasure, and Devoted does better than Fond', () => {
    const tally = (aff: number) => {
        const { sim, a, pat, nextDay } = yard(`BD-6-${aff}`, aff);
        a.fort = a.fort ?? { fd: -1, pd: -1, pn: 0, pity: 0, cpity: 0, last: 0, chain: 0, n: 0 };
        const rare = new Set(GIFTS[2].map((r) => r.item as string)), nice = new Set(GIFTS[1].map((r) => r.item as string).filter((i) => !GIFTS[0].some((g) => g.item === i)));
        let r = 0, n = 0;
        const N = 3000;
        for (let i = 0; i < N; i++) {
            nextDay();
            petsOf(a)[0].aff = aff;
            pat();
            for (const d of drops(sim)) { if (rare.has(d.res as string)) r++; else if (nice.has(d.res as string)) n++; sim.remove(d.id); }
        }
        return { rare: r / N, nice: n / N };
    };
    const fond = tally(GIFT_AT), devoted = tally(AFFECTION_MAX);
    // (a rare roll that is a crate is counted once per drop: crates are single items, so one drop per gift)
    assert.ok(fond.rare > 0.01 && fond.rare < 0.07, `rare at Fond: ${fond.rare}`);
    assert.ok(devoted.rare > fond.rare, `rare: ${fond.rare} -> ${devoted.rare}`);
    assert.ok(devoted.nice > fond.nice - 0.02, `nice: ${fond.nice} -> ${devoted.nice}`);
    assert.ok(fond.rare + fond.nice < 0.45, 'most gifts are small');
});

test('gifts roll the luck dice and never the world\'s: a pet cannot change how a world grows', () => {
    const plain = yard('BD-7', 60), petted = yard('BD-7', 60);
    for (let i = 0; i < 6; i++) { petted.pat(); petted.nextDay(); }
    assert.ok(petted.a.fort && petted.a.fort.n >= 6, 'six gifts were rolled with the farmer\'s own counter');
    for (const { sim } of [plain, petted]) sim.s.day = 3;
    // the world's dice are where they were: both worlds roll the same number next, and the same wild creature turns up
    assert.equal(plain.sim.rng.next(), petted.sim.rng.next());
    const f = (x: ReturnType<typeof yard>) => JSON.stringify(Object.values(x.sim.s.ents).filter((e) => e.k === 'crit' && e.mode === 0).map((e) => (e as CritE).sp));
    run(plain.sim, 30); run(petted.sim, 30);
    assert.equal(f(plain), f(petted), 'the same wild creatures');
});

test('only your own companion, only beside you: someone else\'s pet, no companion, too far, down, paused and the usual nonsense all do nothing', () => {
    const { sim, a, b, biscuit, pip, critOf, pat } = yard('BD-8');
    // Bo stands next to Ann's creature with no companion of his own: he cannot pet it
    b.comp = undefined;
    run(sim, 1);
    b.x = a.x + 6; b.y = a.y;
    pat('b');
    assert.equal(biscuit.aff, undefined, 'Biscuit is Ann\'s');
    assert.equal(pip.aff, undefined);
    assert.equal(events(sim, 'fx').filter((e) => e.fx === 'pat').length, 0);
    // Bo with his own companion pets his own, never hers, even beside hers
    b.comp = 'p2';
    run(sim, 1.5);
    b.x = a.x + 8; b.y = a.y;
    run(sim, 1);
    pat('b');
    assert.equal(pip.aff, 1);
    assert.equal(biscuit.aff, undefined);
    // too far: Ann's creature is sent off across the yard
    const c = critOf('a');
    for (let i = 0; i < 4; i++) { c.x = a.x + 90; c.y = a.y; sim.step(STEP); }
    sim.events = [];
    pat('a');
    assert.equal(biscuit.aff, undefined, 'too far away');
    assert.ok(events(sim, 'float').some((f) => f.text === 'Too far away' && f.to === 'a'), 'and she is told');
    run(sim, 3);
    // a pat with no companion at all, down, or in a paused world
    a.comp = undefined;
    pat('a');
    assert.equal(biscuit.aff, undefined);
    a.comp = 'p1';
    run(sim, 2);
    a.downed = 5;
    pat('a');
    assert.equal(biscuit.aff, undefined, 'down');
    a.downed = 0;
    sim.s.paused = true;
    pat('a');
    assert.equal(biscuit.aff, undefined, 'paused');
    sim.s.paused = false;
    // hostile commands: inherited names do nothing at all; other junk is at worst a pat, and the cooldown still holds
    run(sim, 2);
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
        sim.s.time += 2;
        sim.command('a', { t: 'pat', id: name } as unknown as Cmd);
        sim.command('a', { t: 'pat', op: name } as unknown as Cmd);
    }
    assert.equal(biscuit.aff, undefined, 'a hostile name is refused before it gets anywhere');
    const junk: unknown[] = [{ t: 'pat', who: { toString: 1 } }, { t: 'pat', n: NaN }, { t: 'pat', t2: [1, 2] }, [], null, 5, 'pat', { t: 'pat\u0000' }, { t: ['pat'] }];
    sim.s.time += 2;
    for (const j of junk) assert.doesNotThrow(() => sim.command('a', j as Cmd));
    assert.equal(biscuit.aff, 1, 'extra fields make no difference: that was one pat, and the rest came inside its cooldown');
    run(sim, 2);
    pat('a');
    assert.equal(biscuit.aff, 2, 'a proper pat still works afterwards');
});

test('a creature from an older save (no affection, no day) can be petted; garbage in the save is made safe', () => {
    const { sim, a, pat } = yard('BD-9');
    const saved = JSON.parse(JSON.stringify(sim.s));
    const pets = saved.players.a.pets as Pet[];
    assert.ok(pets[0] && !('aff' in pets[0]) && !('pt' in pets[0]), 'a fresh save has neither');
    delete pets[0].aff; delete pets[0].pt;
    const again = new Sim(saved);
    const a2 = again.join('a', 'Ann')!;
    run(again, 1);
    again.s.time += 2;
    again.command('a', { t: 'pat' });
    assert.equal(petsOf(a2)[0].aff, 1);
    assert.equal(petsOf(a2)[0].pt?.n, 1);
    // an affection that is not a number counts as none
    const odd = JSON.parse(JSON.stringify(again.s));
    odd.players.a.pets[0].aff = 'lots';
    const again2 = new Sim(odd);
    const a3 = again2.join('a', 'Ann')!;
    run(again2, 1);
    again2.s.time += 2;
    again2.command('a', { t: 'pat' });
    assert.equal(petsOf(a3)[0].aff, 1);
    assert.ok(a && pat);
});

test('affection survives a save and a reload, and so does the day\'s count', () => {
    const { sim, biscuit, pat } = yard('BD-10', 38);
    pat(); pat(); pat();
    assert.equal(biscuit.aff, 41);
    const gifts = drops(sim).length;
    assert.ok(gifts >= 1);
    const again = new Sim(JSON.parse(JSON.stringify(sim.s)));
    const a2 = again.join('a', 'Ann')!;
    const b2 = petsOf(a2)[0];
    assert.equal(b2.aff, 41);
    assert.deepEqual(b2.pt, biscuit.pt);
    run(again, 1);
    for (let i = 0; i < 4; i++) { again.s.time += 2; again.command('a', { t: 'pat' }); }
    assert.equal(b2.aff, 43, 'three of the five pets of the day were used before the save: two more earn, the rest do not');
});

test('the prompt helper says whether a pet would earn something today', () => {
    const { sim, a, pat } = yard('BD-11', 40);
    const day = sim.s.day;
    assert.deepEqual(patInfo(a, day) && { earns: patInfo(a, day)!.earns, gift: patInfo(a, day)!.gift }, { earns: true, gift: true });
    pat();
    assert.deepEqual({ earns: patInfo(a, day)!.earns, gift: patInfo(a, day)!.gift }, { earns: true, gift: false });
    for (let i = 0; i < 4; i++) pat();
    assert.equal(patInfo(a, day)!.earns, false, 'five pets today');
    assert.equal(patInfo(a, day + 1)!.earns, true, 'tomorrow is another day');
    a.comp = undefined;
    assert.equal(patInfo(a, day), null, 'no companion');
});

test('online: a pat goes through the host, the owner sees the new affection and a friend does not see the creature\'s record', () => {
    type Inbox = Peer & { msgs: ServerMsg[] };
    const inbox = (): Inbox => { const msgs: ServerMsg[] = []; return { msgs, send: (t: string) => { msgs.push(JSON.parse(t)); } }; };
    const sim = Sim.create('BD-12', 'bw');
    const host = new SimHost(sim, 'Test', '');
    const join = (id: string, name: string) => { const peer = inbox(); host.attach(peer); host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name })); return peer; };
    const pa = join('a', 'Ann'), pb = join('b', 'Bo');
    const a = sim.s.players.a as PlayerS;
    petsOf(a).push(mk('p1', 'Biscuit'));
    a.comp = 'p1';
    const b = sim.s.players.b;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    b.x = a.x + 10; b.y = a.y;
    run(sim, 1);
    host.flush();
    pa.msgs.length = 0; pb.msgs.length = 0;
    sim.s.time += 2;
    host.receive(pa, JSON.stringify({ t: 'cmd', c: { t: 'pat' } }));
    const ticks = (p: Inbox) => p.msgs.filter((m): m is TickMsg => m.t === 'tick');
    const mine = ticks(pa).flatMap((t) => t.players.filter((d) => d.id === 'a'));
    assert.ok(mine.some((d) => JSON.stringify((d as { pets?: Pet[] }).pets ?? []).includes('"aff":1')), 'Ann was told');
    const theirs = ticks(pb).flatMap((t) => t.players.filter((d) => d.id === 'a'));
    assert.ok(!theirs.some((d) => 'pets' in d), 'Bo never sees her roster');
    assert.ok(ticks(pb).some((t) => t.ev.some((e) => e.e === 'hop')), 'but he sees the hop');
    assert.ok(ticks(pb).some((t) => t.ev.some((e) => e.e === 'fx' && e.fx === 'pat')), 'and the hearts burst');
    assert.ok(o);
});

test('the developer menu can set affection and give the creature a fresh day', () => {
    const { sim, a, biscuit } = yard('BD-13');
    sim.devs.add('a');
    sim.command('a', { t: 'devdo', op: 'affection', n: 60 });
    assert.equal(biscuit.aff, 60);
    biscuit.pt = { d: sim.s.day, n: 5, g: sim.s.day };
    sim.command('a', { t: 'devdo', op: 'affection', n: 40 });
    assert.equal(biscuit.aff, 40);
    assert.equal(biscuit.pt, undefined, 'a fresh day for petting and for the gift');
    sim.s.time += 2;
    sim.command('a', { t: 'pat' });
    assert.ok(drops(sim).length >= 1, 'so a pet at once digs up the gift');
    a.comp = undefined;
    sim.events = [];
    sim.command('a', { t: 'devdo', op: 'affection', n: 10 });
    assert.ok(events(sim, 'float').some((f) => f.text === 'Take a creature along first'), 'it says what is missing');
    assert.equal(biscuit.aff, 41, 'no companion along: nothing changes');
    sim.command('a', { t: 'devdo', op: 'affection', n: 1e9 } as Cmd);
    assert.equal(biscuit.aff, 41);
    a.comp = 'p1';
    sim.command('a', { t: 'devdo', op: 'affection', n: 1e9 } as Cmd);
    assert.equal(biscuit.aff, 100, 'made safe');
    sim.devs.delete('a');
    sim.command('a', { t: 'devdo', op: 'affection', n: 5 });
    assert.equal(biscuit.aff, 100, 'and only for a farmer who has unlocked it');
});
