// The Blight: nest isles out at sea, their levels, merging and spread, destroying them, the night raids they send, and the Bed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRID, TILE, TUNING } from '../src/shared/config';
import { NEST_KINDS, nightCount } from '../src/shared/data/mobs';
import * as blight from '../src/shared/sim/blight';
import * as clock from '../src/shared/sim/clock';
import * as raid from '../src/shared/sim/raid';
import * as defense from '../src/shared/sim/defense';
import * as mobs from '../src/shared/sim/mobs';
import { BUILDINGS } from '../src/shared/data/buildings';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, MobE, NodeE, PlayerS, Plot, WorldState } from '../src/shared/sim/types';
import { slotPlot } from '../src/shared/sim/worldgen';

const B = TUNING.blight;
const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };
const mobsOf = (sim: Sim) => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob');
const nests = (sim: Sim) => sim.s.plots.filter((p) => p.blight === 1);
const nestOf = (sim: Sim, plot: Plot) => Object.values(sim.s.ents).find((e): e is NodeE => e.k === 'node' && e.kind === 'nest' && e.plot === plot.i);
/** Take every nest out of a world (their isles cleansed), so a test can place its own. */
function clear (sim: Sim) {
    for (const p of nests(sim)) { const n = nestOf(sim, p); if (n) sim.remove(n.id); p.blight = undefined; delete p.nl; delete p.nk; }
    sim.world.recompute();
}
/** A wild plot `d` plots east of the farmer's home (or wherever `dx, dy` say). */
const near = (sim: Sim, p: PlayerS, dx: number, dy: number) => { const h = sim.homePlot(p.slot); return sim.world.plot(h.gx + dx, h.gy + dy)!; };
/** Temporarily change a dial. */
function withDial<K extends keyof typeof B> (k: K, v: (typeof B)[K], fn: () => void) { const was = B[k]; (B as Record<string, unknown>)[k] = v; try { fn(); } finally { (B as Record<string, unknown>)[k] = was; } }
const home = (sim: Sim, p: PlayerS) => sim.world.plotCenter(sim.homePlot(p.slot));
const free = (sim: Sim, x: number, y: number) => sim.nearestFree(Math.floor(x / TILE), Math.floor(y / TILE), 8)!;

test('a new world gets its nests from the seed: far from every home, on wild sea, land nobody may buy, each a level-1 nest of a kind', () => {
    const a = Sim.create('BL-1', 'b'), b = Sim.create('BL-1', 'b'), c = Sim.create('BL-OTHER', 'b');
    const list = nests(a);
    assert.equal(list.length, B.nests);
    assert.deepEqual(list.map((p) => p.i), nests(b).map((p) => p.i), 'the same seed, the same nests');
    assert.notDeepEqual(list.map((p) => p.i), nests(c).map((p) => p.i), 'another seed, other nests');
    for (const p of list) {
        for (let k = 0; k < 8; k++) { const h = slotPlot(k); assert.ok(Math.hypot(h.gx - p.gx, h.gy - p.gy) >= B.nestMinHomeGap, `nest ${p.i} is far from home ${k}`); }
        for (let k = 8; k < 16; k++) { const h = slotPlot(k); assert.ok(Math.max(Math.abs(h.gx - p.gx), Math.abs(h.gy - p.gy)) > B.nestOuterGap, `nest ${p.i} keeps clear of home spot ${k}`); }
        assert.ok(!p.owned && !p.dread && !p.heart && p.home === undefined);
        assert.ok(p.gx >= 1 && p.gy >= 1 && p.gx <= GRID - 2 && p.gy <= GRID - 2);
        assert.equal(p.nl, 1, 'a nest starts at level 1');
        assert.ok(p.nk && NEST_KINDS[p.nk], 'and has a kind');
        assert.equal(a.world.isPurchasable(p), false, 'not for sale while the nest lives');
        const o = a.world.plotOrigin(p);
        assert.ok(a.world.isLand(o.tx + 9, o.ty + 9), 'a nest isle is land');
        const n = nestOf(a, p)!;
        assert.ok(n, 'with its nest in the middle');
        assert.equal(n.hp, blight.nestHp(1));
    }
    // the second ring's farmers still get their own spots
    for (let k = 0; k < 16; k++) a.join(`p${k}`, `P${k}`);
    for (let k = 8; k < 16; k++) assert.deepEqual({ gx: a.homePlot(k).gx, gy: a.homePlot(k).gy }, slotPlot(k));
});

test('an old world without the Blight gets the same nests when it loads, and a saved world keeps its own', () => {
    const fresh = Sim.create('BL-OLD', 'b');
    const want = nests(fresh).map((p) => p.i);
    const old = JSON.parse(JSON.stringify(fresh.s)) as WorldState;
    delete old.blight;
    for (const p of old.plots) { delete p.blight; delete p.nl; delete p.nk; }
    for (const e of Object.values(old.ents)) if (e.k === 'node' && e.kind === 'nest') { delete old.ents[e.id]; old.plots[e.plot].nodes--; }
    const loaded = new Sim(old);
    assert.deepEqual(nests(loaded).map((p) => p.i), want, 'placed from the seed alone');
    assert.equal(Object.values(loaded.s.ents).filter((e) => e.k === 'node' && e.kind === 'nest').length, B.nests);
    const again = new Sim(JSON.parse(JSON.stringify(loaded.s)));
    assert.equal(Object.values(again.s.ents).filter((e) => e.k === 'node' && e.kind === 'nest').length, B.nests, 'not placed twice');
});

test('nests grow a level every night, keep their wounds as a share, and the spread chance follows the level', () => {
    const sim = Sim.create('BL-LV', 'b');
    const p = sim.join('a', 'A')!;
    const plot = nests(sim)[0];
    const n = nestOf(sim, plot)!;
    n.hp = n.hp / 2;
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.01;
    sim.s.night = true;
    clock.updateClock(sim, 0.02);
    assert.equal(plot.nl, 2, 'one night: level 2');
    assert.equal(n.mhp, blight.nestHp(2), 'more health with the level');
    assert.ok(n.hp > blight.nestHp(2) * 0.5 && n.hp <= blight.nestHp(2), 'half its wounds kept, then it mended some at dawn');
    for (let d = 0; d < 5; d++) blight.onDawn(sim);
    assert.equal(plot.nl, 7);
    assert.equal(blight.spreadChance(1), B.nestSpreadBase + B.nestSpreadPerLv);
    assert.equal(blight.spreadChance(10), B.nestSpreadBase + 10 * B.nestSpreadPerLv);
    assert.equal(blight.spreadChance(500), B.nestSpreadMax, 'capped');
    void p;
});

test('two nests of the same kind on neighbouring plots merge: the levels add up on the higher one, the other isle is cleansed', () => {
    const sim = Sim.create('BL-MERGE', 'b');
    const p = sim.join('a', 'A')!;
    clear(sim);
    const a = near(sim, p, 7, 0), b = near(sim, p, 8, 1), c = near(sim, p, 7, 4), d = near(sim, p, 8, 4);
    assert.ok(blight.raise(sim, a, 'bone') && blight.raise(sim, b, 'bone') && blight.raise(sim, c, 'swarm') && blight.raise(sim, d, 'bone'));
    a.nl = 2; b.nl = 5; c.nl = 3; d.nl = 1;
    withDial('nestMerge', 1, () => blight.merge(sim));
    assert.equal(b.blight, 1, 'the higher level stays');
    assert.equal(b.nl, 7, '5 + 2');
    assert.equal(a.blight, 2, 'the other is cleansed');
    assert.equal(a.nl, undefined);
    assert.ok(!nestOf(sim, a), 'its nest is gone');
    assert.ok(sim.world.isPurchasable(a), 'and its isle is for sale');
    assert.equal(nestOf(sim, b)!.mhp, blight.nestHp(7));
    assert.equal(c.nl, 3, 'a swarm nest never merges with a bone one');
    assert.equal(d.nl, 1, 'nor do nests that are not neighbours');
    // two of a kind side by side merge only at the odds
    const sim2 = Sim.create('BL-MERGE2', 'b');
    const q = sim2.join('a', 'A')!;
    clear(sim2);
    blight.raise(sim2, near(sim2, q, 7, 0), 'beast'); blight.raise(sim2, near(sim2, q, 8, 0), 'beast');
    withDial('nestMerge', 0, () => blight.merge(sim2));
    assert.equal(nests(sim2).length, 2, 'no merge at zero odds');
});

test('the Blight spreads onto wild sea only: never onto owned land, the Dread Reaches or near a home, and never past the cap', () => {
    const sim = Sim.create('BL-SPREAD', 'b');
    const p = sim.join('a', 'A')!;
    clear(sim);
    const h = sim.homePlot(p.slot);
    const seed = near(sim, p, 4, 0);
    assert.ok(blight.raise(sim, seed, 'beast'));
    // own the plot right next to it
    const mine = near(sim, p, 5, 0); mine.owned = true; mine.buyer = 'a'; sim.world.recompute();
    for (let day = 0; day < 40; day++) { sim.s.day++; blight.spread(sim); }
    for (const q of nests(sim)) {
        assert.ok(!q.owned && !q.dread && !q.heart, 'wild sea only');
        assert.ok(Math.max(Math.abs(q.gx - h.gx), Math.abs(q.gy - h.gy)) > B.nestHomeGuard, `${q.i} keeps away from the home`);
        assert.equal(q.nl, 1, 'a new nest is level 1');
        assert.equal(q.nk, 'beast', 'and of its parent\'s kind');
    }
    assert.ok(nests(sim).length > 1, 'it did spread');
    assert.ok(nests(sim).length <= B.nestMax);
    withDial('nestMax', nests(sim).length, () => { const before = nests(sim).length; sim.s.day++; blight.spread(sim); assert.equal(nests(sim).length, before, 'the cap holds'); });
});

test('how fast a world fills: thirty days of dawns', () => {
    const sim = Sim.create('BL-FILL', 'b');
    for (let k = 0; k < 4; k++) sim.join(`p${k}`, `P${k}`);
    const counts: number[] = [];
    for (let d = 0; d < 30; d++) { sim.s.day++; blight.onDawn(sim); counts.push(nests(sim).length); }
    const top = Math.max(...nests(sim).map((p) => p.nl ?? 1));
    console.log(`  nests by day: ${counts.join(' ')}; max level after 30 days: ${top}`);
    assert.ok(counts.every((n) => n <= B.nestMax));
    assert.ok(top >= 30, 'the first nests have grown a level a night');
});

test('a nest isle cannot be bought while its nest lives; destroying it pays everyone who fought and cleanses the isle', () => {
    const sim = Sim.create('BL-BUY', 'b');
    const p = sim.join('a', 'A')!;
    clear(sim);
    const plot = near(sim, p, 1, 0).owned ? near(sim, p, 2, 0) : near(sim, p, 1, 0);
    // a nest right beside the home island (raised by hand: spread would never put one this close)
    plot.blight = 1; plot.nl = 4; plot.nk = 'bone'; sim.world.recompute();
    const n = sim.add<NodeE>({ k: 'node', kind: 'nest', tx: sim.world.plotOrigin(plot).tx + 9, ty: sim.world.plotOrigin(plot).ty + 9, hp: blight.nestHp(4), mhp: blight.nestHp(4), plot: plot.i });
    p.coins = 1e6;
    sim.command('a', { t: 'buy', plot: plot.i });
    assert.ok(!plot.owned, 'not for sale');
    assert.ok(sim.events.some((e) => e.e === 'float' && /Destroy the Blight nest first/.test(e.text)), 'and it says why');
    p.x = (n.tx + 0.5) * TILE; p.y = (n.ty + 2) * TILE; p.invuln = 1e9;
    const xp = p.xp + p.level * 1000, coins = p.coins;
    for (let i = 0; i < 400 && sim.s.ents[n.id]; i++) { p.swingCd = 0; p.energy = 100; sim.command('a', { t: 'swing', id: n.id }); }
    assert.ok(!sim.s.ents[n.id], 'the nest fell to the weapon');
    assert.equal(plot.blight, 2, 'the isle is cleansed');
    assert.ok((p.inv.blightcore ?? 0) >= B.nestCores + 1, 'Blight Cores');
    assert.ok(p.coins > coins, 'coins');
    assert.ok(p.xp + p.level * 1000 > xp, 'XP');
    assert.ok(sim.s.chron?.some((e) => e.k === 'nest:first'), 'a chronicle line');
    sim.command('a', { t: 'buy', plot: plot.i });
    assert.ok(plot.owned && plot.blight === undefined, 'now it can be bought, and it is ordinary land');
});

test('a raid spawns at the nest only when one is in range, and marches on the base across the sea', () => {
    const sim = Sim.create('BL-RAID', 'b');
    const p = sim.join('a', 'A')!;
    p.level = 6; p.invuln = 1e9;
    clear(sim);
    // no nest in range: the night is as it always was
    sim.s.clock = TUNING.dayLength;
    clock.startNight(sim);
    assert.ok(sim.nightSpawns.every((s) => s.raid === undefined));
    assert.equal(sim.nightSpawns.length, nightCount(6));
    sim.s.night = false; sim.nightSpawns = [];
    // a nest four plots east
    const plot = near(sim, p, 4, 0);
    assert.ok(blight.raise(sim, plot, 'swarm'));
    const plan = raid.raidFor(sim, p, nightCount(6))!;
    assert.ok(plan && plan.plot === plot.i, 'the nest is in range');
    assert.equal(plan.dir, 'east');
    clock.startNight(sim);
    const party = sim.nightSpawns.filter((s) => s.raid === plot.i);
    assert.equal(party.length, plan.n);
    assert.equal(sim.nightSpawns.length - party.length, nightCount(6) - plan.taken, 'the rest comes as before');
    assert.ok(party.every((s) => s.at <= 2 + 8 * B.waveGap), 'they set out early, wave by wave');
    let t = 0;
    while (!mobsOf(sim).some((m) => m.rd) && t < 2 + B.raidWindow) { sim.step(STEP); t += STEP; }
    const first = mobsOf(sim).find((m) => m.rd)!;
    assert.ok(first, 'a raider came out');
    const b0 = blight.baseOf(sim, p);
    assert.ok(Math.hypot(first.x - b0.x, first.y - b0.y) <= B.raidSpawnTiles * TILE + 6 * TILE, 'it stepped out on the way from the nest, within a night\'s march');
    run(sim, 2 + B.raidWindow - t);
    const raiders = mobsOf(sim).filter((m) => m.rd);
    assert.ok(raiders.length >= 1, `${raiders.length} raiders out`);
    assert.ok(raiders.every((m) => NEST_KINDS.swarm.mobs.includes(m.kind)), 'a swarm nest hatches its own family');
    const base = blight.baseOf(sim, p);
    const d0 = raiders.map((m) => Math.hypot(m.x - base.x, m.y - base.y));
    for (let t = 0; t < 30; t += STEP) {
        sim.step(STEP);
    }
    const alive = raiders.filter((m) => sim.s.ents[m.id]);
    assert.ok(alive.length, 'some still there');
    for (const m of alive.filter((q) => d0[raiders.indexOf(q)] > 100)) assert.ok(Math.hypot(m.x - base.x, m.y - base.y) < d0[raiders.indexOf(m)] - 60, `closer to the base (${Math.round(d0[raiders.indexOf(m)])} -> ${Math.round(Math.hypot(m.x - base.x, m.y - base.y))}, ${m.kind})`);
});

test('a raider breaks the wall in its way; a broken wall is gone and the damaged ones mend at dawn', () => {
    const sim = Sim.create('BL-WALL', 'b');
    const p = sim.join('a', 'A')!;
    clear(sim);
    const c = home(sim, p);
    p.x = c.x - 220; p.y = c.y; p.invuln = 1e9;
    const tx = Math.floor(c.x / TILE) + 3, ty = Math.floor(c.y / TILE);
    for (let y = -2; y <= 2; y++) { const id = sim.world.occAt(tx, ty + y); if (id) sim.remove(id); }
    const walls = [-2, -1, 0, 1, 2].map((y) => sim.add<BuildE>({ k: 'bld', kind: 'wall_wood', tx, ty: ty + y, rot: 0, by: 'a' }));
    for (let x = tx - 4; x < tx; x++) for (let y = ty - 1; y <= ty + 1; y++) { const id = sim.world.occAt(x, y); if (id) sim.remove(id); }
    const m = mobs.spawnMob(sim, 'skeleton', undefined, undefined, { x: (tx - 3) * TILE, y: (ty + 1) * TILE - 3, lv: 1 })!;
    m.rd = [(tx + 8) * TILE, (ty + 1) * TILE - 3];
    run(sim, 20);
    assert.ok(!sim.s.ents[walls[2].id], 'the wall in its way broke');
    assert.ok(sim.events.length >= 0);
    // a damaged one mends at dawn
    const w = walls.find((x) => sim.s.ents[x.id])!;
    w.hp = 3;
    defense.mend(sim);
    assert.equal(w.hp, undefined, 'whole again');
    assert.equal(BUILDINGS.wall_fort.hp, B.hp.fortified);
    assert.ok(BUILDINGS.wall_wood.hp! < BUILDINGS.wall_stone.hp! && BUILDINGS.wall_stone.hp! < BUILDINGS.wall_brick.hp!, 'wood < stone < brick');
});

/** A farmer at home with the Defense skills and plenty of materials. */
function defender (seed: string) {
    const sim = Sim.create(seed, 'b');
    const p = sim.join('a', 'A')!;
    clear(sim);
    p.skills.c_towers = 1; p.skills.c_siege = 1; p.invuln = 1e9;
    for (const it of ['plank', 'rope', 'stone', 'ironbar', 'gear', 'wire', 'circuit', 'blightcore', 'cloth', 'glass'] as const) sim.give(p, it, 200);
    const c = home(sim, p);
    p.x = c.x; p.y = c.y + 40;
    return { sim, p, c };
}

test('an Archer Tower kills a monster in range and its builder gets the kill', () => {
    const { sim, p, c } = defender('BL-TOWER');
    const t = free(sim, c.x, c.y);
    sim.command('a', { t: 'build', kind: 'tower_archer', tx: t.tx, ty: t.ty });
    const tower = sim.buildings('tower_archer')[0];
    assert.ok(tower, 'built');
    const kills = p.stats.kills, xp = p.xp + p.level * 1e4;
    p.x = c.x - 260;                                              // (out of the slime's sight: only the tower fights)
    const m = mobs.spawnMob(sim, 'slime', undefined, undefined, { x: (t.tx + 0.5) * TILE + 60, y: (t.ty + 1) * TILE, lv: 1 })!;
    run(sim, 6);
    assert.ok(!sim.s.ents[m.id], 'the tower shot it down');
    assert.equal(p.stats.kills, kills + 1, 'credited to its builder');
    assert.ok(p.xp + p.level * 1e4 > xp, 'with its XP');
    assert.ok(sim.events.length >= 0);
    // out of range: left alone
    const far = mobs.spawnMob(sim, 'slime', undefined, undefined, { x: (t.tx + 0.5) * TILE + B.archer.range + 60, y: (t.ty + 1) * TILE, lv: 1 })!;
    far.vx = 0; far.vy = 0;
    sim.s.time += 0;
    sim.step(STEP);
    assert.ok(sim.s.ents[far.id], 'beyond its range nothing is shot');
});

test('a Tesla Coil fires only with power', () => {
    const { sim, p, c } = defender('BL-TESLA');
    const t = free(sim, c.x, c.y);
    sim.command('a', { t: 'build', kind: 'tesla', tx: t.tx, ty: t.ty });
    const coil = sim.buildings('tesla')[0];
    assert.ok(coil, 'built');
    p.x = c.x - 260;
    const spawn = () => { const m = mobs.spawnMob(sim, 'slime', undefined, undefined, { x: (t.tx + 0.5) * TILE + 40, y: (t.ty + 1) * TILE, lv: 1 })!; m.hp = m.mhp = 1000; return m; };
    const m = spawn();
    run(sim, 4);
    assert.equal(m.hp, 1000, 'no power, no zap');
    // a wind turbine and a pole beside it
    p.x = c.x; p.y = c.y + 40;
    let g: { tx: number; ty: number } | null = null;
    for (let r = 2; r < 9 && !g; r++) for (let dy = -r; dy <= r && !g; dy++) for (let dx = -r; dx <= r && !g; dx++) if (sim.world.rectFree(t.tx + dx, t.ty + dy, 2, 2)) g = { tx: t.tx + dx, ty: t.ty + dy };
    sim.add<BuildE>({ k: 'bld', kind: 'windturbine', tx: g!.tx, ty: g!.ty, rot: 0, by: 'a' });
    const pole = sim.nearestFree(t.tx, t.ty - 1, 3)!;
    sim.add<BuildE>({ k: 'bld', kind: 'pole', tx: pole.tx, ty: pole.ty, rot: 0, by: 'a' });
    assert.ok(sim.buildings('windturbine').length && sim.buildings('pole').length, 'power is built');
    p.x = c.x - 260;
    run(sim, 4);
    assert.ok(m.hp < 1000 || !sim.s.ents[m.id], 'with power it zaps');
});

test('a Spike Trap bites the monsters that walk over it', () => {
    const { sim, c } = defender('BL-SPIKE');
    const t = free(sim, c.x + 40, c.y);
    sim.command('a', { t: 'build', kind: 'spike', tx: t.tx, ty: t.ty });
    assert.ok(sim.buildings('spike').length, 'built');
    sim.s.players.a.x = c.x - 260;
    const m = mobs.spawnMob(sim, 'skeleton', undefined, undefined, { x: (t.tx + 0.5) * TILE, y: (t.ty + 1) * TILE - 3, lv: 1 })!;
    m.hp = m.mhp = 100;
    for (let i = 0; i < 40; i++) { m.x = (t.tx + 0.5) * TILE; m.y = (t.ty + 1) * TILE - 3; sim.step(STEP); }
    assert.ok(m.hp < 100, 'bitten');
});

test('nights without any nest spawn exactly as a world without the Blight', () => {
    const plain = Sim.create('BL-SAME', 'b'), blighted = Sim.create('BL-SAME', 'b');
    const a = plain.join('a', 'A')!, b = blighted.join('a', 'A')!;
    clear(plain); clear(blighted);
    a.level = b.level = 9;
    for (const sim of [plain, blighted]) { sim.s.clock = TUNING.dayLength - 0.01; sim.step(STEP); }
    assert.deepEqual(blighted.nightSpawns, plain.nightSpawns, 'the same monsters at the same moments');
    run(plain, 20); run(blighted, 20);
    const at = (sim: Sim) => mobsOf(sim).filter((m) => !m.zone && !m.nb).map((m) => `${m.kind}@${Math.round(m.x)},${Math.round(m.y)}`).sort();
    assert.deepEqual(at(blighted), at(plain));
});

test('a bed moves where you wake up after a fall', () => {
    const sim = Sim.create('BL-BED', 'b');
    const p = sim.join('a', 'A')!;
    sim.give(p, 'plank', 50); sim.give(p, 'wood', 10);
    const c = home(sim, p);
    p.x = c.x; p.y = c.y + 40;
    const b = free(sim, c.x + 50, c.y - 30);
    sim.command('a', { t: 'build', kind: 'sleepbed', tx: b.tx, ty: b.ty });
    const bed = sim.buildings('sleepbed')[0];
    assert.ok(bed && p.bed === bed.id, 'placing a bed makes it yours');
    p.x = c.x + 150; p.y = c.y + 100;
    sim.respawnHome(p);
    assert.ok(Math.hypot(p.x - (bed.tx + 0.5) * TILE, p.y - (bed.ty + 1) * TILE) < 4 * TILE, 'you wake beside it');
    sim.remove(bed.id);
    sim.respawnHome(p);
    assert.ok(Math.hypot(p.x - c.x, p.y - c.y) < 6 * TILE, 'with the bed gone, at home');
    assert.equal(p.bed, undefined);
    // pressing E on a bed makes it yours
    p.x = c.x; p.y = c.y + 40;
    const b2 = free(sim, c.x - 50, c.y - 30);
    sim.command('a', { t: 'build', kind: 'sleepbed', tx: b2.tx, ty: b2.ty });
    const second = sim.buildings('sleepbed')[0];
    p.bed = undefined;
    p.x = (second.tx + 0.5) * TILE; p.y = (second.ty + 3) * TILE;
    sim.command('a', { t: 'use', id: second.id });
    assert.equal(p.bed, second.id, 'E: this is where you wake up now');
});

test('waves: a level 1 nest adds one small raider, level 2 two, then bigger; the map is cut into eight sectors and a night starts a sector further round', () => {
    assert.deepEqual([1, 2, 3, 4, 6, 8].map(raid.waveSize), [1, 2, 2, 3, 4, 5]);
    const o = { x: 0, y: 0 };
    assert.deepEqual([[10, 0], [10, 10], [0, 10], [-10, 10], [-10, 0], [-10, -10], [0, -10], [10, -10]].map(([x, y]) => raid.SECTORS[raid.sectorOf(o, { x, y })]),
        ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']);
    assert.equal(raid.SECTORS[raid.sectorOrder(1)[0]], 'north', 'the first night starts in the north');
    assert.equal(raid.SECTORS[raid.sectorOrder(2)[0]], 'north-east', 'and the next one a sector further round');
    assert.deepEqual([...raid.sectorOrder(5)].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual([1, 2, 3, 5, 7, 20].map(raid.waveCap), [2, 3, 4, 6, 8, 8], 'two waves on the first night, one more each night, never more than eight');
});

test('waves: nests in the same sector send ONE wave between them; at most eight waves; each steps out of its own direction', () => {
    const sim = Sim.create('BL-WAVE', 'b');
    const p = sim.join('a', 'A')!;
    p.level = 6; p.invuln = 1e9;
    clear(sim);
    const plot = near(sim, p, 4, 0);
    assert.ok(blight.raise(sim, plot, 'swarm'));
    plot.nl = 7;                                  // one nest to the east
    let plan = raid.raidFor(sim, p, nightCount(6))!;
    assert.equal(plan.waves.length, 1);
    assert.equal(plan.waves[0].n, raid.waveSize(7));
    assert.equal(raid.SECTORS[plan.waves[0].sector], 'east');
    // a second nest in the same sector joins that wave; one on the other side makes a second wave
    const q = near(sim, p, 5, 1);
    assert.ok(q && blight.raise(sim, q, 'swarm')); q.nl = 3;
    const w = near(sim, p, -4, 0);
    assert.ok(w && blight.raise(sim, w, 'swarm')); w.nl = 1;
    plan = raid.raidFor(sim, p, nightCount(6))!;
    assert.equal(plan.waves.length, 2, 'east and west');
    const east = plan.waves.find((x) => raid.SECTORS[x.sector] === 'east')!;
    assert.equal(east.n, raid.waveSize(7) + raid.waveSize(3), 'the two eastern nests send one wave');
    assert.equal(east.plot, plot.i, 'from the stronger one');
    assert.ok(plan.waves.every((x, i) => i === 0 || x.at - plan.waves[i - 1].at === B.waveGap), 'spaced out');
    assert.equal(plan.n, plan.waves.reduce((a, x) => a + x.n, 0));
    // the night: a wave steps out where its direction meets the march, with a word about it
    clock.startNight(sim);
    const first = sim.nightSpawns.find((s) => s.raid !== undefined && s.first)!;
    assert.ok(first && first.sec !== undefined && first.sx !== undefined);
    sim.nightSpawns = sim.nightSpawns.filter((s) => s === first || s.raid === undefined);
    first.at = 0;
    const m = raid.spawnRaider(sim, first)!;
    assert.ok(m, 'it stepped out');
    const base = blight.baseOf(sim, p);
    const off = Math.abs(raid.sectorOf(base, m) - first.sec!); assert.ok(off === 0 || off === 1 || off === 7, 'in its own sector, or against the line next to it');
    assert.ok(sim.events.some((e) => e.e === 'toast' && /A wave comes from the/.test(e.text)), 'and says where from');
});

test('waves: the very first night already has raiders (every nest on the map counts, the far ones start 26 tiles out), at most waveTotal', () => {
    for (const seed of ['BL-D1A', 'BL-D1B', 'BL-D1C']) {
        const sim = Sim.create(seed, 'b');
        const p = sim.join('a', 'A')!;
        const plan = raid.raidFor(sim, p, nightCount(1));
        assert.ok(plan && plan.waves.length >= 1, `${seed}: a raid on night 1`);
        assert.ok(plan!.n <= B.waveTotal);
        const base = blight.baseOf(sim, p);
        for (const w of plan!.waves) assert.ok(Math.hypot(w.sx - base.x, w.sy - base.y) <= B.raidSpawnTiles * TILE + 1, 'close enough to arrive in a night');
    }
});
