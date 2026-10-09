// The Blight: nest isles out at sea, their levels, merging and spread, destroying them, and the Bed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRID, TILE, TUNING } from '../src/shared/config';
import { NEST_KINDS } from '../src/shared/data/mobs';
import * as blight from '../src/shared/sim/blight';
import * as clock from '../src/shared/sim/clock';
import { Sim } from '../src/shared/sim/sim';
import type { NodeE, PlayerS, Plot, WorldState } from '../src/shared/sim/types';
import { slotPlot } from '../src/shared/sim/worldgen';

const B = TUNING.blight;
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

test('a bed moves where you wake up after a fall', () => {
    const sim = Sim.create('BL-BED', 'b');
    const p = sim.join('a', 'A')!;
    sim.give(p, 'plank', 50); sim.give(p, 'cloth', 10);
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
