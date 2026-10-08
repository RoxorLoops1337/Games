// Boss fights (sim/boss.ts): waking one at an altar, the warning-then-hit scripts, phases, the leash, the pay-out and the Dread wardens.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { COOP_PATTERNS } from '../src/shared/data/costatus';
import { ITEMS } from '../src/shared/data/items';
import { BOSS_ORDER, BOSSES, type CoPattern, isBoss, MOBS, type PatternId } from '../src/shared/data/mobs';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, MobE, PlayerS, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };
const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };
const floats = (ev: SimEvent[]) => ev.filter((e) => e.e === 'float').map((e) => (e as { text: string }).text);
const banners = (ev: SimEvent[]) => ev.filter((e) => e.e === 'banner').map((e) => (e as { text: string }).text);
const fxNames = (ev: SimEvent[]) => ev.filter((e) => e.e === 'fx').map((e) => (e as { fx: string }).fx);

/** Stand just south of an altar: close enough to wake what sleeps in it. */
function stand (p: PlayerS, altar: BuildE) {
    p.x = (altar.tx + 1) * TILE; p.y = (altar.ty + 4) * TILE; p.fx = 0; p.fy = -1; p.warp++;
}
/** A cleared home island with an altar on it and the farmer beside the altar. The Dread wardens stay where they are. */
function arena (seed: string) {
    const sim = Sim.create(seed, 'boss');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node' || (e.k === 'mob' && !e.zone)) sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    const altar = sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + 8, ty: o.ty + 6, rot: 0 });
    stand(p, altar);
    p.invuln = 0;
    events(sim);
    return { sim, p, o, altar };
}
const bossOf = (sim: Sim, kind: string) => sim.ents('mob').find((e) => e.kind === kind && !e.zone);
/** Wake a boss with its sigil, then step a few tiles east so the fight starts at a distance. */
function summon (sim: Sim, p: PlayerS, altar: BuildE, id: string) {
    sim.give(p, BOSSES[id].info.sigil, 1);
    stand(p, altar);
    sim.command(p.id, { t: 'summon', id: altar.id, boss: id });
    p.x = (altar.tx + 6) * TILE; p.y = (altar.ty + 1) * TILE; p.warp++;
    return bossOf(sim, BOSSES[id].kind);
}
/** The patterns a phase can use when fewer than two farmers are up: a co-op pattern is swapped for its stand-in. */
const alonePatterns = (phase: { patterns: PatternId[]; alone?: Partial<Record<CoPattern, PatternId>> }) =>
    new Set<string>(phase.patterns.map((id) => (id in COOP_PATTERNS ? phase.alone?.[id as CoPattern] ?? 'slam' : id)));

test('every altar boss wakes with its sigil, keeps the table hearts for a lone farmer, and fights its opening patterns without throwing', () => {
    for (const id of BOSS_ORDER.filter((b) => b !== 'heart')) {
        const { sim, p, altar } = arena(`BOSS-all-${id}`);
        const e = summon(sim, p, altar, id)!;
        assert.ok(e, `${id} woke`);
        assert.equal(e.mhp, MOBS[e.kind].hp, `${id}: one farmer, the table hearts`);
        assert.equal(e.alt, altar.id);
        assert.equal(countOf(p, BOSSES[id].info.sigil), 0, 'the sigil is spent');
        assert.ok(banners(events(sim)).includes(BOSSES[id].info.title), `${id} is announced`);
        const seen = new Set<string>();
        for (let i = 0; i < 20 * 25; i++) {
            p.invuln = 1;                                             // (a tester's farmer: untouchable, so the fight keeps going)
            sim.step(STEP);
            const cur = sim.s.ents[e.id] as MobE | undefined;
            if (cur?.pat) seen.add(cur.pat);
        }
        assert.ok(sim.s.ents[e.id], `${id} is still fighting`);
        const allowed = alonePatterns(BOSSES[id].info.phases[0]);
        assert.ok(seen.size >= 2 && [...seen].every((x) => allowed.has(x)), `${id} used its opening patterns: ${[...seen]}`);
    }
});

test('the Old Heart wakes only at the centre of the world', () => {
    const { sim, p, altar } = arena('BOSS-heart');
    sim.give(p, 'sigil_heart', 1);
    sim.command('a', { t: 'summon', id: altar.id, boss: 'heart' });
    assert.ok(floats(events(sim)).includes('It can only be woken at the centre of the world'));
    assert.equal(countOf(p, 'sigil_heart'), 1, 'the sigil is kept');
    assert.equal(bossOf(sim, 'oldheart'), undefined);
    // raise the Old Heart's plot and set an altar on it
    const heart = sim.s.plots.find((pl) => pl.heart)!;
    heart.owned = true; sim.world.recompute();
    const o = sim.world.plotOrigin(heart);
    const shrine = sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + 8, ty: o.ty + 6, rot: 0 });
    stand(p, shrine);
    sim.command('a', { t: 'summon', id: shrine.id, boss: 'heart' });
    const e = bossOf(sim, 'oldheart');
    assert.ok(e && e.alt === shrine.id, 'the Heart woke at its own altar');
    assert.equal(e!.mhp, MOBS.oldheart.hp);
    assert.equal(countOf(p, 'sigil_heart'), 0);
});

test('a summon needs the sigil, a farmer beside the altar, a free altar and fewer than three fights; the wardens do not count', () => {
    const { sim, p, altar, o } = arena('BOSS-rules');
    sim.command('a', { t: 'summon', id: altar.id, boss: 'nope' });
    assert.equal(sim.ents('mob').filter((e) => !e.zone).length, 0, 'an unknown boss is nothing');
    sim.command('a', { t: 'summon', id: altar.id, boss: 'slime' });
    assert.ok(floats(events(sim)).includes(`You need a ${ITEMS.sigil_slime.name}`));
    sim.give(p, 'sigil_slime', 1);
    p.x = (altar.tx + 1) * TILE; p.y = (altar.ty + 12) * TILE;                 // too far from the altar
    sim.command('a', { t: 'summon', id: altar.id, boss: 'slime' });
    assert.ok(floats(events(sim)).includes('Stand next to the altar'));
    assert.equal(countOf(p, 'sigil_slime'), 1, 'the sigil is kept');
    stand(p, altar);
    sim.command('a', { t: 'summon', id: altar.id, boss: 'slime' });
    assert.ok(bossOf(sim, 'slimeking'), 'the King woke');
    // the same altar cannot host two fights
    sim.give(p, 'sigil_stone', 1);
    sim.command('a', { t: 'summon', id: altar.id, boss: 'stone' });
    assert.ok(floats(events(sim)).includes('This altar already has a fight going'));
    assert.equal(countOf(p, 'sigil_stone'), 1);
    // three fights at once is the most, however many altars there are
    const more = [[2, 2], [2, 12], [13, 12]].map(([dx, dy]) => sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + dx, ty: o.ty + dy, rot: 0 }));
    for (const [i, id] of [[0, 'stone'], [1, 'bog']] as const) {
        sim.give(p, BOSSES[id].info.sigil, 1);
        stand(p, more[i]);
        sim.command('a', { t: 'summon', id: more[i].id, boss: id });
        assert.ok(bossOf(sim, BOSSES[id].kind), `${id} woke at its own altar`);
    }
    sim.give(p, 'sigil_dune', 1);
    stand(p, more[2]);
    sim.command('a', { t: 'summon', id: more[2].id, boss: 'dune' });
    assert.ok(floats(events(sim)).includes('Too many bosses are awake'));
    assert.equal(countOf(p, 'sigil_dune'), 1);
    assert.equal(sim.ents('mob').filter((e) => !e.zone && isBoss(e.kind)).length, 3);
    assert.equal(sim.ents('mob').filter((e) => !!e.zone && isBoss(e.kind)).length, 4, 'the four wardens were awake all along');
});

test('a boss has more hearts the more farmers stand at the altar, and only those nearby hear its name', () => {
    const { sim, p, altar } = arena('BOSS-party');
    const b = sim.join('b', 'B')!, c = sim.join('c', 'C')!, d = sim.join('d', 'D')!;
    b.x = p.x + 10; b.y = p.y; c.x = p.x - 10; c.y = p.y;                        // two friends at the altar; D stays on their own island
    assert.ok(Math.hypot(d.x - p.x, d.y - p.y) > 520, 'D is far away');
    events(sim);
    const e = summon(sim, p, altar, 'slime')!;
    assert.equal(e.mhp, Math.round(MOBS.slimeking.hp * (1 + 0.55 * 2)), 'three at the altar: a bigger King');
    const told = events(sim).filter((ev) => ev.e === 'banner' && ev.text === BOSSES.slime.info.title).map((ev) => (ev as { to?: string }).to);
    assert.deepEqual(new Set(told), new Set(['a', 'b', 'c']));
});

test('a pattern warns on the ground where the farmer stands, and the blow lands about a second later', () => {
    const { sim, p, altar } = arena('BOSS-tele');
    const e = summon(sim, p, altar, 'slime')!;
    let teleAt = -1, hitAt = -1, teleX = 0, teleY = 0;
    for (let i = 0; i < 20 * 12 && hitAt < 0; i++) {
        p.invuln = 1;
        sim.step(STEP);
        for (const ev of events(sim)) {
            if (ev.e === 'tele' && ev.shape === 'circle' && teleAt < 0) { teleAt = sim.s.time; teleX = ev.x; teleY = ev.y; }
            if (ev.e === 'fx' && ev.fx === 'slam' && hitAt < 0) hitAt = sim.s.time;
        }
    }
    assert.ok(teleAt > 0, 'the King warned of its leap');
    assert.ok(hitAt > teleAt, 'the warning came before the blow');
    assert.ok(hitAt - teleAt > 1.0 && hitAt - teleAt < 1.3, `the leap lands ${(hitAt - teleAt).toFixed(2)} s after its warning`);
    assert.ok(Math.abs(teleX - p.x) < 1 && Math.abs(teleY - p.y) < 1, 'the circle is drawn at the farmer’s feet');
    assert.ok(sim.s.ents[e.id], 'and the fight goes on');
});

test('a phase begins at its share of hearts with a roar and a banner, and uses only the patterns of its table', () => {
    const { sim, p, altar } = arena('BOSS-phase');
    const e = summon(sim, p, altar, 'stone')!;
    const info = BOSSES.stone.info;
    assert.equal(e.ph, 0);
    for (let ph = 1; ph < info.phases.length; ph++) {
        const phase = info.phases[ph];
        e.hp = Math.floor(e.mhp * phase.at);
        p.invuln = 1;
        sim.step(STEP);
        assert.equal(e.ph, ph, `phase ${ph} at ${phase.at} of its hearts`);
        const ev = events(sim);
        assert.ok(fxNames(ev).includes('roar'));
        assert.ok(banners(ev).includes(phase.note!), `the note "${phase.note}" was shown`);
        const allowed = alonePatterns(phase);
        const seen = new Set<string>();
        for (let i = 0; i < 20 * 20; i++) { p.invuln = 1; sim.step(STEP); if (e.pat) seen.add(e.pat); }
        assert.ok(seen.size >= 2 && [...seen].every((x) => allowed.has(x)), `phase ${ph} used ${[...seen]}`);
        assert.ok(![...seen].some((x) => x in COOP_PATTERNS), 'a lone farmer never meets a pattern that needs a friend');
        assert.equal(e.ph, ph, 'and the phase held');
    }
});

test('with two farmers up in the arena the Colossus chains them; alone it calls its rocklings instead', () => {
    const { sim, p, altar } = arena('BOSS-coop');
    const q = sim.join('b', 'B')!;
    const e = summon(sim, p, altar, 'stone')!;
    q.x = p.x + 30; q.y = p.y; q.warp++;
    e.hp = Math.floor(e.mhp * 0.6);                                              // the second phase carries the chain
    const seen = new Set<string>();
    let tethered = false;
    for (let i = 0; i < 20 * 25; i++) {
        p.invuln = q.invuln = 1;
        sim.step(STEP);
        if (e.pat) seen.add(e.pat);
        if (p.co?.k === 'tether' && q.co?.k === 'tether' && p.co.w === 'b' && q.co.w === 'a' && p.co.b === e.id) tethered = true;
    }
    assert.ok(seen.has('chain'), `the chain was laid: ${[...seen]}`);
    assert.ok(tethered, 'and the two farmers were chained to each other');
    // (while a chain of its own is still on, the Colossus falls back to the stand-in: one tether at a time, so 'summon' may show up too)
});

test('a boss with nobody left to fight mends, then slinks home and leaves the sigil by the altar', () => {
    const { sim, p, altar } = arena('BOSS-leash');
    const e = summon(sim, p, altar, 'slime')!;
    e.hp = Math.round(e.mhp * 0.8);
    p.x += 600; p.warp++;                                                        // well outside the arena
    run(sim, 8);
    assert.ok(sim.s.ents[e.id], 'still there after eight seconds');
    assert.ok(e.hp > e.mhp * 0.8 + 40, `mending while nobody is about: ${e.hp} of ${e.mhp}`);
    assert.ok(Math.hypot(e.x - e.hx!, e.y - (e.hy! + 40)) < 12, 'and back at its post');
    events(sim);
    run(sim, 12);
    assert.equal(sim.s.ents[e.id], undefined, 'after eighteen seconds alone it gave up');
    assert.ok(sim.ents('drop').some((d) => d.res === 'sigil_slime'), 'the sigil lies by the altar');
    assert.ok(banners(events(sim)).includes(`${BOSSES.slime.info.title} slinks away…`));
});

test('beating a boss pays everyone who fought or stood in the arena once, and the minions fall with it', () => {
    const { sim, p, altar } = arena('BOSS-win');
    const q = sim.join('b', 'B')!;
    const r = sim.join('c', 'C')!;                                               // stays on their own island
    const e = summon(sim, p, altar, 'slime')!;
    q.x = p.x + 24; q.y = p.y; q.warp++;
    const minion = sim.add<MobE>({ k: 'mob', kind: 'slime', x: e.x + 30, y: e.y, hp: 2, mhp: 2, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    sim.give(p, 'sword_iron', 1);
    sim.command('a', { t: 'equip', item: 'sword_iron' });
    e.hp = 1;
    p.x = e.x - 14; p.y = e.y; p.fx = 1; p.fy = 0; p.swingCd = 0; p.warp++;
    events(sim);
    sim.command('a', { t: 'swing', id: e.id });
    assert.equal(sim.s.ents[e.id], undefined, 'the King is down');
    assert.equal(sim.s.ents[minion.id], undefined, 'its subject fell with it');
    const info = BOSSES.slime.info;
    for (const who of [p, q]) {
        assert.equal(countOf(who, info.trophy), 1, `${who.name} got the trophy`);
        assert.equal(countOf(who, info.gear[0]), 1, `${who.name}: a first win gives the signature gear`);
        assert.equal(countOf(who, 'crate_gold'), 1, `${who.name}: and a golden crate`);
        assert.equal(who.boss?.slime, 1);
        assert.ok(who.coins >= MOBS.slimeking.coins[0] && who.coins <= MOBS.slimeking.coins[1], `${who.name}: coins from the table`);
        assert.ok(who.level > 1, `${who.name}: the xp of a boss`);
        assert.equal(who.points, info.points + (who.level - 1), `${who.name}: the boss points on top of the level points`);
    }
    assert.equal(countOf(r, info.trophy), 0, 'far away: nothing');
    assert.equal(r.points, 0);
    assert.equal(sim.s.bosses?.slime, 1);
    assert.ok(sim.s.chron?.some((c) => c.k === 'boss:slime'), 'the first fall is in the chronicle');
    const ev = events(sim);
    assert.ok(banners(ev).includes(`${info.title} is defeated!`));
    assert.ok(fxNames(ev).includes('bossDie'));
});

test('a boss fires its own kind of shot', () => {
    for (const [id, shot] of [['frost', 'frost'], ['bog', 'orb']] as const) {
        const { sim, p, altar } = arena(`BOSS-shot-${id}`);
        summon(sim, p, altar, id);
        let kinds = new Set<string>();
        for (let i = 0; i < 20 * 6 && !kinds.size; i++) { p.invuln = 1; sim.step(STEP); kinds = new Set(sim.ents('proj').map((x) => x.kind)); }
        assert.deepEqual([...kinds], [shot], `${id} shoots ${shot}`);
    }
});

test('a Dread warden is the altar boss of its kind with the configured hearts and blows, posted at its block', () => {
    const sim = Sim.create('BOSS-warden', 'boss');
    const wardens = sim.ents('mob').filter((e) => !!e.zone && isBoss(e.kind));
    assert.equal(wardens.length, 4);
    for (const w of wardens) {
        assert.equal(w.mhp, Math.round(MOBS[w.kind].hp * TUNING.wardenHp));
        assert.equal(w.dm, TUNING.wardenDmg);
        assert.ok(w.hx !== undefined && w.hy !== undefined && w.alt === undefined, 'posted at its block, not an altar');
        assert.ok(BOSS_ORDER.includes(MOBS[w.kind].boss!.id));
    }
});
