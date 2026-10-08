// Fishing: the roll (place, time, weather, rod), casting rules, the bite and tug timings, and
// what a catch does (inventory, log, counters, who can see your line).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import type { Biome } from '../src/shared/data/biomes';
import { FISH_BY_ID, RODS, rollCatch } from '../src/shared/data/fish';
import { SimHost, type Peer } from '../src/shared/net/host';
import { applyPlayerDelta, PROTOCOL, type PlayerView, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { Rng } from '../src/shared/rng';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { PlayerS, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };
const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };

/** A farmer on the west shore of the home island with a rod, and the bobber spot out in the water. */
function shore (seed = 'FISH-1') {
    const sim = Sim.create(seed, 'f');
    sim.cheats = true;
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 1.5) * TILE; p.y = (o.ty + 6) * TILE; p.hearts = 99;
    const spot = { x: (o.tx - 3) * TILE, y: (o.ty + 6) * TILE };
    sim.command('a', { t: 'devdo', op: 'item', id: 'rod', n: 1 });
    events(sim);
    return { sim, p, o, spot };
}
const cast = (sim: Sim, spot: { x: number; y: number }) => sim.command('a', { t: 'fish', op: 'cast', x: spot.x, y: spot.y });
const caught = (sim: Sim) => events(sim).filter((e): e is Extract<SimEvent, { e: 'catch' }> => e.e === 'catch');
const waitForBite = (sim: Sim, p: PlayerS) => { for (let i = 0; i < 20 * 14 && p.fishing && p.fishing.ph === 0; i++) sim.step(STEP); };
/** The current line, asserted to exist (so earlier asserts do not narrow it away). */
const line = (p: PlayerS) => p.fishing!;

test('what bites depends on the place, the hour, the rain, the rod and your luck', () => {
    const base: { biome: Biome; night: boolean; rain: boolean; rod: (typeof RODS)[number]; bait: boolean; luck: number } = { biome: 'meadow', night: false, rain: false, rod: RODS[0], bait: false, luck: 0 };
    const count = (c: Partial<typeof base>, n = 4000) => {
        const out: Record<string, number> = {};
        const r = new Rng('x' + JSON.stringify(c));
        for (let i = 0; i < n; i++) { const k = rollCatch(r, { ...base, ...c }).item; out[k] = (out[k] ?? 0) + 1; }
        return out;
    };
    const dry = count({}), wet = count({ rain: true });
    assert.equal(dry.fish_koi ?? 0, 0, 'koi only bite in the rain');
    assert.ok((wet.fish_koi ?? 0) > 20, 'and then they do');
    assert.equal(wet.fish_goldkoi ?? 0, 0, 'the golden koi needs the best rod');
    const day = count({ biome: 'bog' }), night = count({ biome: 'bog', night: true });
    assert.ok((night.fish_eel ?? 0) > (day.fish_eel ?? 0) * 8, 'eels come out at night in the bog');
    assert.ok((night.fish_lantern ?? 0) > 20 && (day.fish_lantern ?? 0) < 20, 'lanternfish glow after dark');
    assert.equal(count({ biome: 'snowcap' }).fish_pike ?? 0, 0, 'pike need a steel rod');
    assert.ok((count({ biome: 'snowcap', rod: RODS[1] }).fish_pike ?? 0) > 20);
    const gold = count({ rain: true, rod: RODS[2] }, 30000);
    assert.ok((gold.fish_goldkoi ?? 0) > 0 && (gold.fish_goldkoi ?? 0) < 300, `rare even then: ${gold.fish_goldkoi}`);
    const lucky = count({ luck: 0.4, rain: true, rod: RODS[1] }, 20000), plain = count({ rain: true, rod: RODS[1] }, 20000);
    assert.ok((lucky.pearl ?? 0) > (plain.pearl ?? 0), 'luck finds pearls');
    // sizes stay inside each species' range
    const rng = new Rng('sizes');
    for (let i = 0; i < 400; i++) {
        const r = rollCatch(rng, { ...base, rain: true, rod: RODS[2] });
        if (r.size !== undefined) assert.ok(r.size >= FISH_BY_ID[r.item].size[0] && r.size <= FISH_BY_ID[r.item].size[1], `${r.item} ${r.size}`);
    }
    assert.ok((dry.junk_boot ?? 0) > 0, 'now and then it is only a boot');
});

test('casting needs a rod, open water at a sensible distance, and no expedition', () => {
    const { sim, p, spot } = shore();
    p.inv.rod = 0;
    cast(sim, spot);
    assert.equal(p.fishing, undefined, 'no rod, no cast');
    p.inv.rod = 1;
    cast(sim, { x: p.x + 40, y: p.y });
    assert.equal(p.fishing, undefined, 'land is not water');
    cast(sim, { x: p.x - 20, y: p.y });
    assert.equal(p.fishing, undefined, 'too close');
    cast(sim, { x: p.x - 400, y: p.y });
    assert.equal(p.fishing, undefined, 'too far');
    cast(sim, spot);
    assert.ok(p.fishing && p.line, 'a good cast');
    assert.deepEqual([p.line!.x, p.line!.y, p.line!.ph], [spot.x, spot.y, 0]);
    assert.ok(events(sim).some((e) => e.e === 'fx' && e.fx === 'cast'));
});

test('a bite opens a window: pull in it and the fish is yours; pull early or late and it is not', () => {
    const { sim, p, spot } = shore();
    cast(sim, spot);
    sim.command('a', { t: 'fish', op: 'reel' });
    assert.equal(p.fishing, undefined, 'pulled before the bite: nothing lost, the line comes back');
    // wait for the bite and pull in time
    cast(sim, spot);
    line(p).item = 'fish_carp'; line(p).size = 33; line(p).rounds = 0;
    waitForBite(sim, p);
    assert.equal(line(p).ph, 1, 'it bit');
    assert.equal(p.line!.ph, 1, 'and others can see the bobber go under');
    assert.ok(line(p).t > 0.9 && line(p).t <= RODS[0].window + 0.01);
    events(sim);
    sim.command('a', { t: 'fish', op: 'reel' });
    assert.equal(countOf(p, 'fish_carp'), 1);
    assert.equal(p.fishing, undefined);
    assert.deepEqual(p.fishlog?.fish_carp, { n: 1, best: 33 });
    assert.equal(p.cnt?.fish, 1);
    assert.equal(p.cnt?.['fish:fish_carp'], 1);
    const ev = caught(sim);
    assert.equal(ev.length, 1);
    assert.ok(ev[0].isNew && ev[0].item === 'fish_carp' && ev[0].size === 33);
    // a bigger one next time is a personal best, and no longer new
    cast(sim, spot);
    line(p).item = 'fish_carp'; line(p).size = 50; line(p).rounds = 0;
    waitForBite(sim, p);
    events(sim);
    sim.command('a', { t: 'fish', op: 'reel' });
    const e2 = caught(sim)[0];
    assert.ok(!e2.isNew && e2.best, 'a personal best');
    assert.equal(p.fishlog!.fish_carp.best, 50);
    // too late: the fish gets away
    cast(sim, spot);
    line(p).item = 'fish_carp'; line(p).rounds = 0;
    waitForBite(sim, p);
    run(sim, RODS[0].window + 0.2);
    assert.equal(p.fishing, undefined, 'it got away');
    assert.equal(countOf(p, 'fish_carp'), 2);
});

test('big fish fight: after the hook, each tug must be answered in its own window, and impatience costs strikes', () => {
    const { sim, p, spot } = shore();
    const toTug = () => { for (let i = 0; i < 20 * 6 && p.fishing && p.fishing.ph !== 3; i++) sim.step(STEP); };
    // a pike: hook + two tugs
    cast(sim, spot);
    line(p).item = 'fish_pike'; line(p).size = 80; line(p).rounds = 2;
    waitForBite(sim, p);
    sim.command('a', { t: 'fish', op: 'reel' });
    assert.equal(line(p).ph, 2, 'hooked: it is fighting');
    sim.command('a', { t: 'fish', op: 'reel' });
    assert.equal(line(p).strikes, 1, 'jumping the gun is a slip');
    toTug();
    assert.equal(line(p).ph, 3, 'a tug');
    sim.command('a', { t: 'fish', op: 'reel' });
    assert.equal(line(p).round, 1);
    assert.equal(line(p).ph, 2);
    toTug();
    sim.command('a', { t: 'fish', op: 'reel' });
    assert.equal(p.fishing, undefined, 'landed');
    assert.equal(countOf(p, 'fish_pike'), 1);
    // two slips lose it
    cast(sim, spot);
    line(p).item = 'fish_pike'; line(p).size = 70; line(p).rounds = 2;
    waitForBite(sim, p);
    sim.command('a', { t: 'fish', op: 'reel' });
    sim.command('a', { t: 'fish', op: 'reel' });   // slip 1
    sim.command('a', { t: 'fish', op: 'reel' });   // slip 2
    assert.equal(p.fishing, undefined, 'lost');
    assert.equal(countOf(p, 'fish_pike'), 1);
    // ignored tugs are slips too
    cast(sim, spot);
    line(p).item = 'fish_pike'; line(p).rounds = 1;
    waitForBite(sim, p);
    sim.command('a', { t: 'fish', op: 'reel' });
    for (let i = 0; i < 20 * 20 && p.fishing; i++) sim.step(STEP);
    assert.equal(p.fishing, undefined, 'tugs ignored, the fish is gone');
});

test('walking away, falling or logging out ends the cast; bait speeds the bite; the best rod is used', () => {
    const { sim, p, spot } = shore('FISH-2');
    cast(sim, spot);
    p.x += 80;
    run(sim, 0.1);
    assert.equal(p.fishing, undefined, 'walked away');
    p.x -= 80;
    cast(sim, spot);
    p.downed = 5;
    run(sim, 0.1);
    assert.equal(p.fishing, undefined, 'downed');
    p.downed = 0;
    const wait = (bait: boolean) => {
        let total = 0;
        for (let i = 0; i < 40; i++) {
            const q = shore('B-' + i);
            if (bait) q.p.inv.bait = 1;
            cast(q.sim, q.spot);
            total += line(q.p).t;
            if (bait) assert.equal(q.p.inv.bait ?? 0, 0, 'the bait was used');
        }
        return total / 40;
    };
    assert.ok(wait(true) < wait(false) * 0.8, 'bait helps');
    assert.ok(RODS[2].wait[1] < RODS[0].wait[1] && RODS[2].window > RODS[0].window, 'better rods bite faster and give more time');
    const q = shore('FISH-3');
    q.p.inv.rod_master = 1;
    cast(q.sim, q.spot);
    assert.equal(line(q.p).rod, 2, 'the best rod you carry is used');
    q.sim.leave('a');
    assert.equal(q.p.fishing, undefined, 'logging out reels you in');
});

test('your line is visible to friends, what is on it is not', () => {
    const sim = Sim.create('FISH-4', 'f');
    sim.cheats = true;
    const host = new SimHost(sim, 'T');
    const known: Record<string, PlayerView> = {};
    const peer = (watch: boolean): Peer => ({
        send: (t: string) => {
            const m: ServerMsg = JSON.parse(t);
            if (watch && m.t === 'tick') for (const d of (m as TickMsg).players) known[d.id] = applyPlayerDelta(known[d.id], d);
        },
    });
    const pa = peer(false), pb = peer(true);
    host.attach(pa); host.attach(pb);
    host.receive(pa, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A' }));
    host.receive(pb, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'b', name: 'B' }));
    const a = sim.s.players.a;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 1.5) * TILE; a.y = (o.ty + 6) * TILE;
    sim.command('a', { t: 'devdo', op: 'item', id: 'rod', n: 1 });
    sim.command('a', { t: 'fish', op: 'cast', x: (o.tx - 3) * TILE, y: (o.ty + 6) * TILE });
    host.update(0.2); host.update(0.2);
    assert.ok(known.a.line, "b sees a's line");
    assert.equal((known.a as PlayerS).fishing, undefined, 'but not what is on it');
    sim.command('a', { t: 'fish', op: 'cancel' });
    host.update(0.2);
    assert.equal(known.a.line, undefined, 'and it is gone when a reels in');
});
