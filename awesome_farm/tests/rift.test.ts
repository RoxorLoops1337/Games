// Expeditions: the rift islands, launching a party, waves, boons, the guardian, rewards,
// falling, leaving, disconnecting and surviving a server restart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRID, PLOT, RIFT_ISLANDS, SEA, TILE, TUNING, WORLD_TILES, riftOrigin } from '../src/shared/config';
import { BOONS, BOON_BY_ID, DAILY_BONUS, dailyRift, dailyShards, offerBoons, omenMul, omenOf, RIFT_TIERS, waveSpec } from '../src/shared/data/rift';
import { MOBS } from '../src/shared/data/mobs';
import { Rng } from '../src/shared/rng';
import { Sim } from '../src/shared/sim/sim';
import { derived } from '../src/shared/sim/stats';
import type { BuildE, MobE, PlayerS, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number, each?: () => void) => { for (let t = 0; t < s; t += STEP) { each?.(); sim.step(STEP); } };
const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };

/** A world with a dock beside player `a` (and optionally `b`), everybody healthy. */
function setup (players = 1) {
    const sim = Sim.create('RIFT-1', 'rift');
    sim.cheats = true;
    const a = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 8) * TILE; a.hearts = 99;
    const dock = sim.add<BuildE>({ k: 'bld', kind: 'dock', tx: o.tx + 5, ty: o.ty + 5, rot: 0, by: 'a' });
    const others: PlayerS[] = [];
    for (let i = 1; i < players; i++) {
        const q = sim.join('p' + i, 'P' + i)!;
        q.x = a.x + 14 * i; q.y = a.y; q.hearts = 99;
        others.push(q);
    }
    events(sim);
    return { sim, a, dock, others, o };
}
/** The player's expedition view (a function, so earlier asserts do not narrow it away). */
const rv = (p: PlayerS) => p.rift;
const mobsOf = (sim: Sim, arena: number) => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && e.rift === arena);
/** Play the run for the party: kill whatever is in the arena as soon as it appears. */
const hero = (sim: Sim, p: PlayerS) => () => {
    for (const q of Object.values(sim.s.players)) { if (q.online && q.rift) q.hearts = 99; }
    for (const m of mobsOf(sim, p.rift?.arena ?? 0)) sim.killMob(m, p);
    if (p.rift?.ph === 2 && p.rift.offer) sim.command(p.id, { t: 'rift', op: 'pick', i: 0 });
};

test('four rift islands sit in the sea corners, always land, never touching a farm island', () => {
    const sim = Sim.create('RIFT-geo', 'rift');
    for (let i = 0; i < RIFT_ISLANDS; i++) {
        const o = riftOrigin(i);
        let land = 0;
        for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) if (sim.world.isLand(o.tx + x, o.ty + y)) land++;
        assert.ok(land > 60, `rift ${i} has ${land} tiles of land`);
        const c = sim.world.riftCenter(i);
        assert.equal(sim.world.riftAtPx(c.x, c.y), i);
        assert.ok(sim.world.isLand(Math.floor(c.x / TILE), Math.floor(c.y / TILE)), 'its centre is land');
        assert.ok(o.tx >= 0 && o.ty >= 0 && o.tx + PLOT <= WORLD_TILES && o.ty + PLOT <= WORLD_TILES, 'inside the world');
    }
    // even with every plot owned, open water separates every rift island from the farm
    for (const p of sim.s.plots) p.owned = true;
    sim.world.recompute();
    const gridTiles = (GRID + SEA) * PLOT;
    for (let i = 0; i < RIFT_ISLANDS; i++) {
        const o = riftOrigin(i);
        for (let y = -1; y <= PLOT; y++) for (let x = -1; x <= PLOT; x++) {
            const tx = o.tx + x, ty = o.ty + y;
            if (sim.world.riftAtTile(tx, ty) >= 0 || !sim.world.inBounds(tx, ty)) continue;
            // a tile beside the rift island's block belongs to the farm ring: it must not be land next to rift land
            if (sim.world.isLand(tx, ty)) {
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.ok(!(sim.world.riftAtTile(tx + dx, ty + dy) >= 0 && sim.world.isLand(tx + dx, ty + dy)), `rift ${i} touches the farm at ${tx},${ty}`);
            }
        }
    }
    assert.ok(gridTiles <= WORLD_TILES);
});

test('waves scale with the tier and the party, and the last one holds the guardian', () => {
    for (const t of RIFT_TIERS) {
        const rng = new Rng('waves-' + t.id);
        const first = waveSpec(t.id, 1, 1, rng), last = waveSpec(t.id, t.endless ? 5 : t.waves, 1, rng);
        assert.ok(first.length >= 3 && first.every((m) => !m.guardian && MOBS[m.kind].tier <= t.cap), `tier ${t.id} wave 1`);
        assert.equal(last.filter((m) => m.guardian).length, 1, `tier ${t.id} has one guardian`);
        if (!t.endless) assert.equal(last.find((m) => m.guardian)!.kind, t.guardian);
        const four = waveSpec(t.id, 3, 4, new Rng('x')), one = waveSpec(t.id, 3, 1, new Rng('x'));
        assert.ok(four.length > one.length, 'more farmers, more monsters');
    }
    // harder tiers bring bigger fights
    const size = (tier: number) => waveSpec(tier, 3, 2, new Rng('s')).length;
    assert.ok(size(4) > size(0));
});

test('boon offers: three different boons you do not already have', () => {
    const rng = new Rng('boons');
    const held = ['edge', 'hearty'];
    for (let wave = 1; wave <= 8; wave++) {
        const offer = offerBoons(rng, held, wave);
        assert.equal(offer.length, 3);
        assert.equal(new Set(offer).size, 3, 'all different');
        for (const id of offer) assert.ok(BOON_BY_ID[id] && !held.includes(id));
    }
    assert.ok(BOONS.length >= 24 && new Set(BOONS.map((b) => b.id)).size === BOONS.length, 'a real set of boons');
});

test('the dock opens its screen; a launch needs the dock, the unlock and a free rift', () => {
    const { sim, a, dock } = setup();
    sim.command('a', { t: 'use', id: dock.id });
    assert.ok(events(sim).some((e) => e.e === 'open' && e.ui === 'dock'), 'the dock opens');
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 1 });
    assert.equal(a.rift, undefined, 'tier 2 needs a boss defeated first');
    sim.command('a', { t: 'rift', op: 'launch', id: 9999, tier: 0 });
    assert.equal(a.rift, undefined, 'there is no such dock');
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    assert.ok(rv(a) && rv(a)!.arena === 0 && rv(a)!.tier === 0, 'tier 1 needs nothing');
    assert.ok(sim.world.riftAtPx(a.x, a.y) === 0, 'you are on the rift island');
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    assert.equal(sim.s.rifts![0].party.length, 1, 'one run at a time per farmer');
});

test('a full expedition: waves, boons between them, the guardian, rewards, and back home', () => {
    const { sim, a, dock } = setup();
    const home = { x: a.x, y: a.y };
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    const t = RIFT_TIERS[0];
    assert.ok(a.hearts >= derived(a).maxHearts - 0.01, 'you start healthy');
    // the first wave only starts after the countdown
    run(sim, 2);
    assert.equal(mobsOf(sim, 0).length, 0, 'getting ready');
    let sawPick = false, boonsPicked = 0;
    const play = hero(sim, a);
    for (let i = 0; i < 20 * 120 && a.rift && a.rift.ph !== 3; i++) {
        if (a.rift.ph === 2) { sawPick = true; assert.equal(a.rift.offer?.length, 3, 'three boons to choose from'); boonsPicked = a.boons?.length ?? 0; }
        play();
        sim.step(STEP);
    }
    assert.ok(sawPick, 'a boon was offered between waves');
    assert.ok(a.rift?.win, 'the run ended in victory');
    assert.equal(a.rift!.wave, t.waves);
    assert.equal(a.boons?.length, t.waves - 1, `one boon after each wave but the last: ${boonsPicked}`);
    assert.ok((a.inv.rift_shard ?? 0) >= t.shards[0], `shards: ${a.inv.rift_shard}`);
    assert.equal(a.points >= 1, true, 'the first clear pays a skill point');
    const end = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend' && e.to === 'a');
    assert.ok(end && end.win && end.first && end.points === t.points && end.kills > 0, 'the results event carries the summary');
    // the results linger, then everyone is sent back to the dock and the island is wiped
    run(sim, 16);
    assert.equal(a.rift, undefined);
    assert.equal(a.boons, undefined, 'boons end with the run');
    assert.ok(Math.hypot(a.x - home.x, a.y - home.y) < 2, 'back where you launched from');
    assert.equal(sim.s.rifts![0], undefined, 'the rift is free again');
    assert.equal(mobsOf(sim, 0).length, 0);
    // second time: no first-clear point
    events(sim);
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    const play2 = hero(sim, a);
    for (let i = 0; i < 20 * 120 && rv(a) && rv(a)!.ph !== 3; i++) { play2(); sim.step(STEP); }
    assert.ok(rv(a)?.win);
    const again = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend' && e.win);
    assert.ok(again && !again.first && again.points === 0, 'only the first clear pays a skill point');
    assert.equal(a.cnt?.['riftwin:0'], 2, 'the clears are counted');
});

test('boons change your stats for the run: hearts, damage, and the Phoenix Feather', () => {
    const { sim, a, dock } = setup();
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    const hearts = derived(a).maxHearts, dmg = derived(a).weapon.dmg;
    a.boons = ['hearty', 'edge'];
    assert.equal(derived(a).maxHearts, hearts + 2);
    assert.equal(derived(a).weapon.dmg, dmg + 1);
    a.boons = ['phoenix'];
    a.hearts = 0.5;
    sim.hurt(a, { x: a.x + 5, y: a.y }, 3);
    assert.equal(a.downed, 0, 'the Phoenix Feather caught the fall');
    assert.ok(a.hearts >= 1, 'with half your health back');
    assert.deepEqual(a.boons, [], 'and it was used up');
    a.invuln = 0;
    sim.hurt(a, { x: a.x + 5, y: a.y }, 9);
    assert.ok(a.downed > 0, 'a second fall is a real one');
});

test('a party of two: both go, one can leave, the rest fight on, the last one closes the rift', () => {
    const { sim, a, dock, others } = setup(2);
    const b = others[0];
    const homeB = { x: b.x, y: b.y };
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    assert.equal(sim.s.rifts![0].party.length, 2, 'the farmer beside you came too');
    assert.ok(rv(b) && rv(a)!.party === 2);
    // b leaves right away: back at the dock, a carries on alone
    sim.command('p1', { t: 'rift', op: 'leave' });
    assert.equal(b.rift, undefined);
    assert.ok(Math.hypot(b.x - homeB.x, b.y - homeB.y) < 2, 'sent back to where they launched');
    assert.equal(sim.s.rifts![0].party.length, 1);
    run(sim, 8);
    assert.ok(mobsOf(sim, 0).length > 0, 'wave one is on');
    sim.command('a', { t: 'rift', op: 'leave' });
    assert.equal(sim.s.rifts![0], undefined, 'the last one out closes the rift');
    assert.equal(mobsOf(sim, 0).length, 0, 'and its monsters vanish');
});

test('everyone falling ends the run gently: a share of the shards, and nobody loses anything', () => {
    const { sim, a, dock } = setup();
    a.inv.wood = 40;
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    const play = hero(sim, a);
    // win one wave, then fall during the next
    for (let i = 0; i < 20 * 60 && !(a.rift!.wave >= 2 && a.rift!.ph === 1); i++) { play(); sim.step(STEP); }
    assert.ok(a.rift!.wave >= 2);
    a.invuln = 0; a.hearts = 0.5;
    sim.hurt(a, { x: a.x + 3, y: a.y }, 5);
    assert.ok(a.downed > 0);
    run(sim, 1);
    assert.equal(a.rift!.ph, 3, 'the run is over');
    assert.equal(a.rift!.win, false);
    const end = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend');
    assert.ok(end && !end.win && end.wave >= 1);
    run(sim, 8);
    assert.equal(a.rift, undefined, 'sent home');
    assert.equal(a.downed, 0, 'on your feet');
    assert.ok(a.hearts > 0);
    assert.equal(a.inv.wood, 40, 'nothing lost');
    assert.equal(sim.s.rifts![0], undefined);
});

test('a monster-filled arena is not swept away at dawn, and nobody can build or travel on an expedition', () => {
    const { sim, a, dock } = setup();
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    run(sim, 12);
    const before = mobsOf(sim, 0).length;
    assert.ok(before > 0);
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.2;
    sim.s.night = true;
    run(sim, 1);
    assert.ok(mobsOf(sim, 0).length >= before - 1, 'dawn leaves the expedition alone');
    a.inv.wood = 50; a.inv.stone = 50;
    sim.command('a', { t: 'build', kind: 'workbench', tx: Math.floor(a.x / TILE), ty: Math.floor(a.y / TILE) + 1, rot: 0 });
    assert.equal(sim.buildings('workbench').length, 0, 'no building on a rift island');
    const ev = events(sim);
    assert.ok(ev.some((e) => e.e === 'banner' || e.e === 'float' || e.e === 'fx'));
});

test('leaving the game mid-run puts you safely back at the dock; a saved world never strands anyone', () => {
    const { sim, a, dock } = setup();
    const home = { x: a.x, y: a.y };
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    run(sim, 8);
    // a disconnect
    sim.leave('a');
    assert.ok(Math.hypot(a.x - home.x, a.y - home.y) < 2, 'logged out beside the dock');
    assert.equal(a.rift, undefined);
    assert.equal(sim.s.rifts![0], undefined);
    // a crash: save mid-run, load, nobody is left on the island and the arena is clear
    sim.join('a', 'A');
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    run(sim, 8);
    assert.ok(mobsOf(sim, 0).length > 0);
    const copy = new Sim(JSON.parse(JSON.stringify(sim.s)));
    const a2 = copy.s.players.a;
    assert.equal(a2.rift, undefined);
    assert.equal(a2.boons, undefined);
    assert.equal(copy.world.riftAtPx(a2.x, a2.y), -1, 'not stranded on the island');
    assert.equal(Object.keys(copy.s.rifts ?? {}).length, 0);
    assert.equal(mobsOf(copy, 0).length, 0);
});

test('only four expeditions can run at once, then the next party waits', () => {
    const { sim, a, dock } = setup();
    sim.s.rifts = {};
    for (let i = 0; i < RIFT_ISLANDS; i++) sim.s.rifts[i] = { arena: i, tier: 0, party: [], from: {}, started: 0, wave: 1, ph: 1, t: 0, queue: [], offers: {}, kills: 0, banked: {} };
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    assert.equal(a.rift, undefined, 'every rift is taken');
    delete sim.s.rifts[2];
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    assert.equal(rv(a)?.arena, 2, 'it takes the free one');
});

test('rift monsters cannot drift off the island, and a lone unreachable straggler is pulled in rather than stalling the run', () => {
    const { sim, a, dock } = setup();
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    run(sim, 8);
    for (let i = 0; i < 40 && mobsOf(sim, 0).length <= 2; i++) run(sim, 1);          // (the wave arrives a monster at a time)
    const mobs = mobsOf(sim, 0);
    assert.ok(mobs.length > 2);
    const c = sim.world.riftCenter(0);
    // fling one far out over the sea: the leash brings it back to the shore
    mobs[0].x = c.x + 400; mobs[0].y = c.y;
    run(sim, 0.1);
    assert.ok(Math.hypot(mobs[0].x - c.x, mobs[0].y - c.y) <= 6 * TILE, 'kept on the island');
    // leave one alive, as if it were out of everyone's reach, and let the stall timer run out
    for (const m of mobsOf(sim, 0).slice(1)) sim.killMob(m, a);
    const run0 = sim.s.rifts![0];
    run0.queue = [];
    run0.stall = 21.9;
    mobsOf(sim, 0)[0].x = c.x + 70; mobsOf(sim, 0)[0].y = c.y + 70;
    run(sim, 0.3);
    const left = mobsOf(sim, 0)[0];
    assert.ok(left, 'still alive');
    assert.ok(Math.hypot(left.x - c.x, left.y - c.y) < 4 * TILE, 'drawn in beside the party');
});

test('the guardian fights like a boss: telegraphed patterns, phases, and summons that belong to the run', () => {
    const { sim, a, dock } = setup();
    a.boss = { slime: 1 };
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 1 });
    // clear the ordinary waves until the guardian wave begins, then stop killing
    for (let i = 0; i < 20 * 300; i++) {
        a.hearts = 99;
        if (rv(a)!.wave < RIFT_TIERS[1].waves) for (const m of mobsOf(sim, 0)) sim.killMob(m, a);
        if (rv(a)!.ph === 2 && rv(a)!.offer) sim.command('a', { t: 'rift', op: 'pick', i: 0 });
        sim.step(STEP);
        if (rv(a)!.wave >= RIFT_TIERS[1].waves && mobsOf(sim, 0).some((m) => m.rb)) break;
    }
    const guardian = mobsOf(sim, 0).find((m) => m.rb);
    assert.ok(guardian, 'the guardian is on the island');
    assert.equal(guardian!.kind, RIFT_TIERS[1].guardian);
    assert.equal(guardian!.rt, 1);
    // let it fight (the farmer cannot be hurt in this test) and watch it act
    events(sim);
    const seen = new Set<string>();
    guardian!.hp = guardian!.mhp * 0.4;          // into its second phase, where it summons
    for (let i = 0; i < 20 * 25; i++) {
        a.hearts = 99; a.invuln = 1;
        sim.step(STEP);
        if (guardian!.pat) seen.add(guardian!.pat);
        for (const e of events(sim)) if (e.e === 'tele') seen.add('tele');
    }
    assert.ok(seen.has('tele'), 'its attacks are announced on the ground');
    assert.ok(seen.size >= 3, `it uses several patterns: ${[...seen]}`);
    assert.equal(guardian!.ph, 1, 'and changes phase');
    const adds = mobsOf(sim, 0).filter((m) => !m.rb);
    assert.ok(adds.length > 0 && adds.every((m) => m.rift === 0 && (m.dm ?? 0) > 1), 'what it summons belongs to the run (so the island is wiped at the end)');
});

test('the Abyss never ends: a guardian every fifth wave, cashing out pays by depth, and the best wave is remembered', () => {
    const { sim, a, dock } = setup();
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 5 });
    assert.equal(rv(a), undefined, 'it needs all five bosses defeated');
    a.boss = { slime: 1, stone: 1, bog: 1, dune: 1, frost: 1 };
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 5 });
    assert.ok(rv(a) && rv(a)!.waves === 0, 'an endless run has no last wave');
    const t = RIFT_TIERS[5];
    const guardians: number[] = [];
    let depth = 0;
    for (let i = 0; i < 20 * 400 && depth < 12; i++) {
        a.hearts = 99;
        const mobs = mobsOf(sim, 0);
        if (mobs.some((m) => m.rb)) guardians.push(rv(a)!.wave);
        for (const m of mobs) sim.killMob(m, a);
        if (rv(a)!.ph === 2 && rv(a)!.offer) sim.command('a', { t: 'rift', op: 'pick', i: 0 });
        sim.step(STEP);
        depth = rv(a)!.wave;
    }
    assert.ok(depth >= 12, 'it kept going past where any normal tier ends');
    assert.ok(!rv(a)!.win, 'and never declares victory');
    assert.deepEqual([...new Set(guardians)], [5, 10], 'a guardian on waves 5 and 10');
    assert.ok((a.cnt?.abyssbest ?? 0) >= 11, `the best depth is recorded: ${a.cnt?.abyssbest}`);
    // keep fighting a moment: the wave's monsters arrive, we are untouchable
    for (let i = 0; i < 20 * 8; i++) { a.hearts = 99; a.invuln = 1; sim.step(STEP); }
    // cash out at the gate: the cleared waves pay shards, coins, xp
    events(sim);
    const shardsBefore = a.inv.rift_shard ?? 0;
    const cleared = rv(a)!.ph === 1 ? rv(a)!.wave - 1 : rv(a)!.wave;
    sim.command('a', { t: 'rift', op: 'leave' });
    assert.equal(rv(a), undefined, 'back at the dock');
    const end = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend');
    assert.ok(end && end.endless && end.win && end.wave === cleared, 'the results say how deep you got');
    assert.ok((a.inv.rift_shard ?? 0) - shardsBefore >= Math.round(Math.pow(cleared, 1.2)), 'shards for the depth');
    assert.ok(end!.first && end!.points === t.points, 'the first deep dive pays skill points');
    assert.equal(sim.s.rifts![0], undefined);
});

test('falling in the Abyss pays for the waves cleared; leaving in the first wave pays nothing and costs nothing', () => {
    const { sim, a, dock } = setup();
    a.boss = { slime: 1, stone: 1, bog: 1, dune: 1, frost: 1 };
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 5 });
    sim.command('a', { t: 'rift', op: 'leave' });
    assert.equal(a.inv.rift_shard ?? 0, 0, 'nothing cleared, nothing paid');
    assert.equal(rv(a), undefined);
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 5 });
    for (let i = 0; i < 20 * 120 && rv(a)!.wave < 4; i++) {
        a.hearts = 99;
        for (const m of mobsOf(sim, 0)) sim.killMob(m, a);
        if (rv(a)!.ph === 2 && rv(a)!.offer) sim.command('a', { t: 'rift', op: 'pick', i: 0 });
        sim.step(STEP);
    }
    assert.ok(rv(a)!.wave >= 4);
    events(sim);
    const had = a.inv.rift_shard ?? 0;
    a.invuln = 0; a.hearts = 0.5;
    sim.hurt(a, { x: a.x + 3, y: a.y }, 9);
    run(sim, 0.5);
    const end = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend');
    assert.ok(end && end.endless && !end.win && end.wave >= 3, 'a fall in the Abyss still pays');
    assert.ok((a.inv.rift_shard ?? 0) > had);
});

test('omens: locked until the rift is cleared, harder monsters, a bigger payout, and no boons under Spartan', () => {
    const { sim, a, dock } = setup();
    // not before a first clear
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, omens: ['brutal', 'tough'] });
    assert.equal(a.rift, undefined, 'omens need a first clear');
    // a plain clear first, to see the baseline payout
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    const plain = hero(sim, a);
    for (let i = 0; i < 20 * 120 && rv(a) && rv(a)!.ph !== 3; i++) { plain(); sim.step(STEP); }
    assert.ok(rv(a)?.win);
    const base = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend' && e.win)!;
    assert.equal(base.bonus, undefined, 'no omens, no bonus');
    run(sim, 16);
    assert.equal(a.rift, undefined);

    // now with omens: junk and duplicates are dropped, three at most
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, omens: ['brutal', 'brutal', 'nonsense', 'tough', 'spartan', 'swift', 'cursed'] });
    assert.deepEqual(sim.s.rifts![0].omens, ['brutal', 'tough', 'spartan'], 'known, unique, at most three');
    assert.deepEqual(rv(a)?.omens, ['brutal', 'tough', 'spartan'], 'the party sees them');
    // monsters are tougher and hit harder
    let checked = false, offered = false;
    const t = RIFT_TIERS[0];
    for (let i = 0; i < 20 * 120 && rv(a) && rv(a)!.ph !== 3; i++) {
        for (const q of Object.values(sim.s.players)) q.hearts = 99;
        if (rv(a)!.ph === 2) offered = true;
        for (const m of mobsOf(sim, 0)) {
            if (!checked && !m.rb) {
                const expected = Math.max(1, Math.round(MOBS[m.kind].hp * t.hpMul * (1 + 0.08 * (rv(a)!.wave - 1)) * (0.75 + 0.25) * (m.el ? 1.8 : 1) * 1.5));
                assert.equal(m.mhp, expected, 'Tough: 50% more health');
                assert.equal(m.dm, t.dm * 1.4, 'Brutal: 40% more damage');
                checked = true;
            }
            sim.killMob(m, a);
        }
        sim.step(STEP);
    }
    assert.ok(checked, 'saw a monster');
    assert.ok(!offered, 'Spartan: no boons were offered');
    assert.equal(a.boons?.length ?? 0, 0);
    assert.ok(rv(a)?.win);
    const boosted = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend' && e.win)!;
    assert.equal(boosted.bonus, 70, 'brutal 20 + tough 20 + spartan 30');
    assert.equal(a.cnt?.omenwin, 1, 'the omen clear is counted');
    assert.equal(a.cnt?.omen3win, 1, 'and so is the three-omen clear');
    assert.ok(boosted.coins > base.coins, `more coins with omens (${boosted.coins} vs ${base.coins})`);
    assert.ok(boosted.xp > base.xp);
    run(sim, 16);
});

test('omens: Swift monsters outrun the plain ones, Cursed turns healing potions to dust, Swarming adds monsters, Champions add elites', () => {
    const { sim, a, dock } = setup();
    a.cnt = { 'riftwin:0': 1 };
    a.inv.potion_heal = 3;
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, omens: ['swift', 'cursed', 'swarm'] });
    assert.ok(a.rift);
    a.hearts = 1;
    sim.command('a', { t: 'eat', item: 'potion_heal' });
    assert.equal(a.inv.potion_heal, 3, 'the potion is still there');
    assert.equal(a.hearts, 1, 'and it did nothing');
    run(sim, 7);
    const m = mobsOf(sim, 0)[0];
    assert.ok(m, 'wave one is out');
    assert.equal(m.sm, 1.3, 'Swift');
    // the wave is a third bigger
    const rng1 = new Rng('omen-wave'), rng2 = new Rng('omen-wave');
    const plain = waveSpec(1, 4, 1, rng1), swarm = waveSpec(1, 4, 1, rng2, ['swarm']);
    assert.ok(swarm.length > plain.length * 1.25, `${swarm.length} vs ${plain.length}`);
    const eliteShare = (omens: string[]) => { let n = 0, e = 0; for (let i = 0; i < 40; i++) for (const w of waveSpec(2, 6, 2, new Rng('el' + i), omens)) { n++; if (w.elite) e++; } return e / n; };
    assert.ok(eliteShare(['champs']) > eliteShare([]) * 2, 'Champions: elites are far more common');
    // leaving ends it, and potions work again outside
    sim.command('a', { t: 'rift', op: 'leave' });
    run(sim, 8);
    assert.equal(a.rift, undefined);
    sim.command('a', { t: 'eat', item: 'potion_heal' });
    assert.equal(a.inv.potion_heal, 2, 'potions work again at home');
});

test('omens: Relentless shortens the breather, and hostile omen lists are harmless', () => {
    const { sim, a, dock } = setup();
    a.cnt = { 'riftwin:0': 1 };
    for (const bad of [null, 5, 'swift', {}, [null, 3, {}, []], ['a'.repeat(5000)]] as unknown[]) {
        sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, omens: bad as string[] });
        assert.ok(a.rift, 'launches without omens');
        assert.equal(sim.s.rifts![0].omens, undefined, `ignored: ${JSON.stringify(bad)?.slice(0, 40)}`);
        sim.command('a', { t: 'rift', op: 'leave' });
        run(sim, 8);
        assert.equal(a.rift, undefined);
    }
    // names that exist on every object are refused outright (the host's hostile-input guard), never looked up
    for (const bad of [['__proto__'], ['constructor', 'toString'], ['hasOwnProperty']]) {
        sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, omens: bad });
        assert.ok(!a.rift || !sim.s.rifts![0].omens, 'no omens from inherited names');
        sim.command('a', { t: 'rift', op: 'leave' });
        run(sim, 8);
        assert.equal(a.rift, undefined);
    }
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, omens: ['rush'] });
    const r = sim.s.rifts![0];
    assert.ok(a.rift && r.omens?.[0] === 'rush');
    run(sim, 5.2);
    const play = hero(sim, a);
    for (let i = 0; i < 20 * 60 && r.wave < 1; i++) { play(); sim.step(STEP); }
    // after clearing wave one the next countdown is the short one
    for (let i = 0; i < 20 * 60 && r.ph !== 2 && r.ph !== 0; i++) { play(); sim.step(STEP); }
    for (let i = 0; i < 20 * 30 && r.ph !== 0; i++) { play(); sim.step(STEP); }
    assert.ok(r.ph === 0 && r.t <= 1.5, `the next wave is nearly here (${r.t})`);
});

test('the rift of the day: the same for everyone, chosen by the host, paid a bonus once a day', () => {
    const { sim, a, dock } = setup();
    // deterministic per seed and day, and only a rift you can enter
    const d1 = dailyRift('seed-x', 4, 3), d2 = dailyRift('seed-x', 4, 3);
    assert.deepEqual(d1, d2, 'same day, same rift');
    assert.equal(d1.omens.length, 2);
    assert.ok(new Set(d1.omens).size === 2 && d1.omens.every((id) => omenOf(id)), 'two different known omens');
    const seen = new Set<number>();
    for (let day = 1; day <= 40; day++) { const d = dailyRift('seed-x', day, 3); seen.add(d.tier); assert.ok(RIFT_TIERS[d.tier].need <= 3 && !RIFT_TIERS[d.tier].endless, 'never beyond your bosses, never the Abyss'); }
    assert.ok(seen.size >= 3, `it varies from day to day: ${[...seen]}`);
    assert.equal(dailyRift('seed-x', 4, 0).tier, 0, 'with no bosses only the first rift is open');
    // the host picks the rift: asking for another one is ignored
    a.boss = { slime: 1, stone: 1, bog: 1 };
    const today = dailyRift(sim.s.seed, sim.s.day, 3);
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: today.tier === 0 ? 1 : 0, daily: true });
    const r = sim.s.rifts![0];
    assert.ok(a.rift && r.daily, 'launched as the daily');
    assert.equal(r.tier, today.tier, 'the day decides which rift');
    assert.deepEqual(r.omens, today.omens, 'and which omens, without needing a first clear');
    assert.equal(rv(a)?.daily, true);
    // play it to the end: the multiplier includes the daily bonus, and the extra shards come once
    const play = hero(sim, a);
    for (let i = 0; i < 20 * 240 && rv(a) && rv(a)!.ph !== 3; i++) { play(); sim.step(STEP); }
    assert.ok(rv(a)?.win, 'cleared');
    const end = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend' && e.win)!;
    assert.equal(end.daily, dailyShards(today.tier), 'the daily bonus shards');
    assert.equal(end.bonus, Math.round((omenMul(today.omens) - 1 + DAILY_BONUS) * 100));
    assert.equal(a.daily, sim.s.day);
    assert.equal(a.cnt?.dailywin, 1);
    run(sim, 16);
    // not again today
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, daily: true });
    assert.equal(a.rift, undefined, 'only once a day');
    // a new day, a new rift
    sim.s.day++;
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, daily: true });
    assert.ok(a.rift && sim.s.rifts![0].daily, 'tomorrow it is open again');
    sim.command('a', { t: 'rift', op: 'leave' });
    run(sim, 8);
    assert.equal(a.daily, sim.s.day - 1, 'leaving does not use it up');
});

test('the daily rift needs a boss down, and falling does not spend it', () => {
    const { sim, a, dock } = setup();
    a.boss = undefined;
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, daily: true });
    assert.ok(a.rift, 'the first rift needs no boss, so the daily is open to a beginner');
    // everyone falls
    for (let i = 0; i < 20 * 15; i++) { for (const m of mobsOf(sim, 0)) m.hp = m.hp; a.hearts = 0; a.downed = Math.max(a.downed, 1); sim.step(STEP); if (!rv(a) || rv(a)!.ph === 3) break; }
    run(sim, 10);
    assert.equal(a.daily, undefined, 'a lost run does not count');
});

test('omens: a guardian\'s summons are as tough and swift as the rest, and Swarming and Champions still bite at the caps', () => {
    const { sim, a, dock } = setup();
    a.boss = { slime: 1 };
    a.cnt = { 'riftwin:1': 1 };
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 1, omens: ['tough', 'swift'] });
    assert.ok(rv(a));
    for (let i = 0; i < 20 * 300; i++) {
        a.hearts = 99;
        if (rv(a)!.wave < RIFT_TIERS[1].waves) for (const m of mobsOf(sim, 0)) sim.killMob(m, a);
        if (rv(a)!.ph === 2 && rv(a)!.offer) sim.command('a', { t: 'rift', op: 'pick', i: 0 });
        sim.step(STEP);
        if (rv(a)!.wave >= RIFT_TIERS[1].waves && mobsOf(sim, 0).some((m) => m.rb)) break;
    }
    const guardian = mobsOf(sim, 0).find((m) => m.rb)!;
    guardian.hp = guardian.mhp * 0.4;
    for (let i = 0; i < 20 * 25; i++) { a.hearts = 99; a.invuln = 1; sim.step(STEP); }
    const adds = mobsOf(sim, 0).filter((m) => !m.rb);
    assert.ok(adds.length > 0, 'it summoned');
    assert.ok(adds.every((m) => m.sm === 1.3), 'Swift reaches the summons');
    assert.ok(adds.every((m) => m.mhp >= Math.round(MOBS[m.kind].hp * 1.5) - 1), 'and so does Tough');
    // the caps: Swarming adds monsters even when a deep wave is already at the ceiling, Champions raises a high elite share
    const big = (omens: string[]) => waveSpec(5, 12, 4, new Rng('cap'), omens);
    assert.ok(big([]).length <= 34, `no omen: at most 34 (${big([]).length})`);
    assert.ok(big(['swarm']).length > big([]).length + 8, `Swarming still adds a third at the cap (${big(['swarm']).length})`);
    const elites = (omens: string[]) => waveSpec(5, 23, 1, new Rng('el'), omens).filter((w) => w.elite).length / waveSpec(5, 23, 1, new Rng('el'), omens).length;
    assert.ok(elites(['champs']) > elites([]) * 1.3, 'Champions still bite deep in the Abyss');
});

test('omens: only members who could take them join the run, and a lost run still shows the bonus', () => {
    const { sim, a, dock, others } = setup(2);
    const b = others[0];
    a.cnt = { 'riftwin:0': 1 };            // a has cleared the Mossy Rift, b has not
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, omens: ['brutal'] });
    assert.deepEqual(sim.s.rifts![0].party, ['a'], 'b has not cleared it, so b stays behind');
    assert.equal(b.rift, undefined);
    // everyone falls: the results still carry the omen bonus
    events(sim);
    for (let i = 0; i < 20 * 20 && rv(a) && rv(a)!.ph !== 3; i++) { a.hearts = 0; a.downed = Math.max(a.downed, 1); sim.step(STEP); }
    const lost = events(sim).find((e): e is Extract<SimEvent, { e: 'riftend' }> => e.e === 'riftend' && !e.win && e.to === 'a');
    assert.equal(lost?.bonus, 20, 'brutal is +20% and the loss shows it');
    run(sim, 10);
    // the rift of the day takes everyone ready for the rift itself
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0, daily: true });
    assert.ok(sim.s.rifts![0].party.includes('p1'), 'the daily pulls the party in, omens and all');
});
