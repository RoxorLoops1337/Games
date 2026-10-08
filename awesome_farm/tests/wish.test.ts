// Season wishes: three offers a season, a vote, one winner that blesses every farmer until the season ends.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TUNING } from '../src/shared/config';
import { STAT_KEYS } from '../src/shared/data/stats';
import { WISH_BY_ID, WISH_OPTIONS, WISHES, wishPool } from '../src/shared/data/wishes';
import { seasonBegins } from '../src/shared/sim/clock';
import { Sim } from '../src/shared/sim/sim';
import { derived } from '../src/shared/sim/stats';
import type { SimEvent } from '../src/shared/sim/types';
import * as wish from '../src/shared/sim/wish';

const goto = (sim: Sim, day: number) => { sim.s.day = day; sim.s.clock = 5; sim.s.night = false; seasonBegins(sim); };
const events = <T extends SimEvent['e']>(sim: Sim, e: T) => sim.events.filter((x): x is Extract<SimEvent, { e: T }> => x.e === e);

test('every wish is made of real stats, and every season offers three different ones', () => {
    for (const w of WISHES) {
        assert.ok(Object.keys(w.mods).length >= 1, w.id);
        for (const k of Object.keys(w.mods)) assert.ok((STAT_KEYS as readonly string[]).includes(k), `${w.id}: ${k}`);
        assert.ok(w.blurb.length > 10 && w.blurb.length <= 80, `${w.id}: blurb length`);
        assert.equal(WISH_BY_ID[w.id], w);
    }
    for (let k = 1; k < 40; k++) {
        const pool = wishPool('some-seed', k);
        assert.equal(pool.length, WISH_OPTIONS);
        assert.equal(new Set(pool).size, WISH_OPTIONS);
        assert.deepEqual(wishPool('some-seed', k), pool, 'the same every time');
    }
    assert.notDeepEqual(wishPool('a', 1), wishPool('b', 1), 'worlds differ');
});

test('the first season has no wish; the second morning opens a vote and asks everyone who is here', () => {
    const sim = Sim.create('wish-open', 'w');
    sim.join('a', 'Dana'); sim.join('b', 'Sam');
    goto(sim, 1);
    assert.equal(sim.s.wish, undefined, 'spring of year one has none');
    sim.events.length = 0;
    goto(sim, 8);
    const w = sim.s.wish!;
    assert.equal(w.k, 1);
    assert.deepEqual(w.opts, wishPool(sim.s.seed, 1));
    assert.ok(wish.isOpen(sim));
    const open = events(sim, 'open').filter((e) => e.ui === 'wish');
    assert.deepEqual(open.map((e) => e.to).sort(), ['a', 'b']);
    assert.equal(events(sim, 'wish').length, 1, 'the vote is sent to every screen');
});

test('votes: only the three on offer, one each, changeable; the vote closes when everybody has voted', () => {
    const sim = Sim.create('wish-vote', 'w');
    sim.join('a', 'Dana'); sim.join('b', 'Sam');
    goto(sim, 8);
    const [x, y] = sim.s.wish!.opts;
    sim.command('a', { t: 'wish', id: 'not-a-wish' });
    sim.command('a', { t: 'wish', id: 'constructor' });
    sim.command('a', { t: 'wish', id: 42 as unknown as string });
    assert.deepEqual(sim.s.wish!.votes, {});
    sim.command('a', { t: 'wish', id: x });
    sim.command('a', { t: 'wish', id: y });
    assert.deepEqual(sim.s.wish!.votes, { a: y }, 'a vote can be changed');
    assert.equal(sim.s.wish!.won, undefined, 'one of two has voted: still open');
    sim.command('b', { t: 'wish', id: y });
    assert.equal(sim.s.wish!.won, y);
    assert.equal(sim.s.players.a.wish, y); assert.equal(sim.s.players.b.wish, y);
    // closed now
    sim.command('b', { t: 'wish', id: x });
    assert.equal((sim.s.wish!.votes as Record<string, string>).b, y);
});

test('the winner blesses the stat ledger; the most votes win; a tie is settled the same way every time', () => {
    const sim = Sim.create('wish-win', 'w');
    for (const id of ['a', 'b', 'c']) sim.join(id, id.toUpperCase());
    goto(sim, 8);
    const [x, y] = sim.s.wish!.opts;
    const before = JSON.stringify(derived(sim.s.players.a).mods);
    sim.command('a', { t: 'wish', id: x }); sim.command('b', { t: 'wish', id: y }); sim.command('c', { t: 'wish', id: y });
    assert.equal(sim.s.wish!.won, y);
    const after = derived(sim.s.players.a).mods;
    for (const [k, v] of Object.entries(WISH_BY_ID[y].mods)) assert.ok(Math.abs((after[k as keyof typeof after] ?? 0) - (JSON.parse(before)[k] ?? 0) - v) < 1e-9, `${y}: ${k}`);
    // a tie
    const tie = (name: string) => {
        const s = Sim.create(name, 'w'); s.join('a', 'A'); s.join('b', 'B'); goto(s, 8);
        const [p, q] = s.s.wish!.opts; s.command('a', { t: 'wish', id: p }); s.command('b', { t: 'wish', id: q });
        return s.s.wish!.won;
    };
    assert.equal(tie('wish-tie'), tie('wish-tie'));
    assert.ok(wishPool('wish-tie', 1).includes(tie('wish-tie')!));
});

test('nobody votes: the vote closes at nightfall and the world\'s dice choose; the blessing reaches farmers who are away', () => {
    const sim = Sim.create('wish-late', 'w');
    sim.join('a', 'Dana'); sim.join('b', 'Sam');
    sim.leave('b');
    goto(sim, 8);
    sim.step(0.1);
    assert.equal(sim.s.wish!.won, undefined, 'still daytime');
    sim.s.clock = TUNING.dayLength + 1; sim.s.night = true;
    sim.step(0.1);
    const won = sim.s.wish!.won!;
    assert.ok(sim.s.wish!.opts.includes(won));
    assert.equal(sim.s.players.a.wish, won);
    assert.equal(sim.s.players.b.wish, won, 'an offline farmer is blessed too');
});

test('a farmer who joins mid-season is blessed; the next season takes it back and offers new wishes', () => {
    const sim = Sim.create('wish-join', 'w');
    sim.join('a', 'Dana');
    goto(sim, 8);
    sim.command('a', { t: 'wish', id: sim.s.wish!.opts[0] });
    const won = sim.s.wish!.won!;
    const c = sim.join('c', 'Kit')!;
    assert.equal(c.wish, won);
    goto(sim, 15);
    assert.equal(sim.s.wish!.k, 2);
    assert.equal(sim.s.wish!.won, undefined);
    assert.equal(sim.s.players.a.wish, undefined, 'the old blessing is gone');
    assert.equal(sim.join('d', 'Lou')!.wish, undefined, 'nothing chosen yet this season');
});

test('the vote and the blessing survive a save, and an old save without them loads', () => {
    const sim = Sim.create('wish-save', 'w');
    sim.join('a', 'Dana');
    goto(sim, 8);
    const copy = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.deepEqual(copy.s.wish, sim.s.wish);
    copy.join('a', 'Dana');
    copy.command('a', { t: 'wish', id: copy.s.wish!.opts[1] });
    assert.equal(copy.s.wish!.won, copy.s.wish!.opts[1]);
    const state = JSON.parse(JSON.stringify(sim.s)); delete state.wish;
    const old = new Sim(state);
    old.join('a', 'Dana');
    old.command('a', { t: 'wish', id: 'rains' });
    assert.equal(old.s.wish, undefined);
});

test('the chosen wish is written in the farm chronicle', () => {
    const sim = Sim.create('wish-chron', 'w');
    sim.join('a', 'Dana');
    goto(sim, 8);
    sim.command('a', { t: 'wish', id: sim.s.wish!.opts[0] });
    const name = WISH_BY_ID[sim.s.wish!.won!].name;
    assert.ok((sim.s.chron ?? []).some((e) => e.t === `The farm wished for ${name} this season.`));
});
