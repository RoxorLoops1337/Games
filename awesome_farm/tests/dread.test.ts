// The Dread Reaches: four 3×3 blocks of haunted bog, always land and never for sale, haunted day and night, with a warden boss at the heart of each.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CENTER, DREAD_ZONES, GRID, PLOT, TILE, TUNING } from '../src/shared/config';
import { BOSSES, isBoss, MOBS } from '../src/shared/data/mobs';
import { ITEMS } from '../src/shared/data/items';
import { ensure, wardenOf, zoneAt, zones } from '../src/shared/sim/dread';
import { migrate } from '../src/shared/sim/migrate';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, MobE, NodeE, WorldState } from '../src/shared/sim/types';
import { DREAD_BOSS, markDread, slotPlot } from '../src/shared/sim/worldgen';

const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };
const mobsIn = (sim: Sim, q: number, boss: boolean) => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && e.zone === q + 1 && isBoss(e.kind) === boss);

test('a new world has four Dread blocks of 3×3 plots, far from every home, each with its warden and its hoard', () => {
    const sim = Sim.create('DREAD-1', 'd');
    const zs = zones(sim);
    assert.equal(zs.length, DREAD_ZONES);
    const dread = sim.s.plots.filter((p) => p.dread);
    assert.equal(dread.length, 36);
    assert.equal(dread.filter((p) => p.dread === 2).length, 4, 'one middle plot each');
    assert.deepEqual([...new Set(DREAD_BOSS)].length, 4, 'four different wardens');
    for (const z of zs) {
        assert.equal(z.plots.length, 9);
        assert.ok(z.plots.every((p) => p.biome === 'bog' && !p.owned && !p.mod), 'haunted bog, nobody\'s');
        for (const p of z.plots) assert.ok(Math.abs(p.gx - z.core.gx) <= 1 && Math.abs(p.gy - z.core.gy) <= 1, 'a 3×3 block');
        assert.ok(Math.hypot(z.core.gx - CENTER.gx, z.core.gy - CENTER.gy) >= 12, 'out in the wilds');
        assert.ok(z.core.gx >= 2 && z.core.gy >= 2 && z.core.gx <= GRID - 3 && z.core.gy <= GRID - 3, 'whole block on the map');
        for (let k = 0; k < 16; k++) { const h = slotPlot(k); assert.ok(Math.hypot(h.gx - z.core.gx, h.gy - z.core.gy) >= 4, `home ${k} is well clear`); }
        // land from edge to edge, and not for sale
        const o = sim.world.plotOrigin(z.plots.reduce((a, b) => (b.gy < a.gy || (b.gy === a.gy && b.gx < a.gx) ? b : a)));
        let land = 0;
        for (let y = 0; y < 3 * PLOT; y++) for (let x = 0; x < 3 * PLOT; x++) if (sim.world.isLand(o.tx + x, o.ty + y)) land++;
        assert.ok(land >= 9 * PLOT * PLOT - 4 * 4, `${land} land tiles in the block (only its four outer corners are rounded)`);
        for (const p of z.plots) assert.equal(sim.world.isPurchasable(p), false);
        // the warden: the altar boss of its kind, bigger and meaner
        const w = mobsIn(sim, z.q, true);
        assert.equal(w.length, 1, 'exactly one warden');
        const entry = BOSSES[DREAD_BOSS[z.q]];
        assert.equal(w[0].kind, entry.kind);
        assert.equal(w[0].mhp, Math.round(MOBS[entry.kind].hp * TUNING.wardenHp));
        assert.equal(w[0].dm, TUNING.wardenDmg);
        assert.ok(Math.hypot(w[0].x - z.cx, w[0].y - z.cy) < 4 * TILE, 'in the middle of its block');
        // the hoard: ore and plants everywhere, a chest in each outer plot and a vault by the warden
        const nodes = Object.values(sim.s.ents).filter((e): e is NodeE => e.k === 'node' && z.plots.some((p) => p.i === e.plot));
        assert.ok(nodes.length >= 9 * 9, `${nodes.length} nodes in the block`);
        assert.equal(nodes.filter((n) => n.kind === 'chest').length, 8, 'a chest in each outer plot');
        assert.equal(nodes.filter((n) => n.kind === 'vault').length, 1, 'and a vault');
    }
    assert.equal(sim.s.plots.filter((p) => p.owned).length, 0);
});

test('nobody can buy the Dread Reaches, and the land beside them is bought the ordinary way', () => {
    const sim = Sim.create('DREAD-2', 'd');
    const p = sim.join('a', 'A')!;
    p.coins = 1e9;
    const z = zones(sim)[0];
    const before = sim.s.plots.filter((q) => q.owned).length;
    for (const plot of z.plots) sim.command('a', { t: 'buy', plot: plot.i });
    assert.equal(sim.s.plots.filter((q) => q.owned).length, before, 'nothing was bought');
    assert.ok(!sim.world.purchasable().some((q) => q.dread));
    // the plot next to the block is for sale once it touches the farm like any other
    const next = sim.world.plot(z.core.gx + 2, z.core.gy)!;
    assert.equal(sim.world.isPurchasable(next), false, 'not yet: it touches nobody\'s land');
    assert.equal(sim.world.dreadPlots().length, 36);
});

test('altar fights still work with four wardens awake', () => {
    const sim = Sim.create('DREAD-3', 'd');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    const altar = sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + 4, ty: o.ty + 3, rot: 0 });
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 7) * TILE;
    sim.give(p, 'sigil_slime', 1);
    sim.command('a', { t: 'summon', id: altar.id, boss: 'slime' });
    assert.ok(Object.values(sim.s.ents).some((e) => e.k === 'mob' && e.kind === 'slimeking'), 'the Slime King woke');
});

test('the dead haunt the block while somebody is in it, by day too, and rest when nobody is', () => {
    const sim = Sim.create('DREAD-4', 'd');
    const p = sim.join('a', 'A')!;
    p.invuln = 99999; p.hearts = 99; p.level = 12;
    const z = zones(sim)[1];
    // walk in at the edge, far from the warden
    p.x = z.x0 + 30; p.y = z.cy; p.warp++;
    assert.equal(sim.s.night, false, 'it is day');
    run(sim, 4);
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.to === 'a' && e.text === 'The Dread Reaches'), 'a warning on the way in');
    run(sim, 20);
    const haunts = mobsIn(sim, z.q, false);
    assert.ok(haunts.length >= TUNING.dreadBase, `${haunts.length} haunting it`);
    assert.ok(haunts.length <= TUNING.dreadMax);
    assert.ok(haunts.every((m) => m.guard === 1 && !isBoss(m.kind)), 'they do not fade at dawn');
    assert.ok(haunts.every((m) => zoneAt(sim, m.x, m.y, 2 * PLOT * TILE)?.q === z.q), 'and they stay inside its borders');
    assert.equal(mobsIn(sim, 0, false).length + mobsIn(sim, 2, false).length + mobsIn(sim, 3, false).length, 0, 'the other blocks are quiet');
    // a second farmer brings more of them
    const b = sim.join('b', 'B')!;
    b.invuln = 99999; b.hearts = 99; b.x = z.x0 + 60; b.y = z.cy + 30; b.warp++;
    run(sim, 30);
    assert.ok(mobsIn(sim, z.q, false).length > haunts.length - 1 && mobsIn(sim, z.q, false).length >= TUNING.dreadBase + 1, 'more farmers, more of the dead');
    // everyone leaves: half a minute later it is quiet again (the warden stays)
    const home = sim.world.plotCenter(sim.homePlot(p.slot));
    for (const q of [p, b]) { q.x = home.x; q.y = home.y; q.warp++; }
    run(sim, 45);
    assert.equal(mobsIn(sim, z.q, false).length, 0, 'the haunting thins out');
    assert.equal(mobsIn(sim, z.q, true).length, 1, 'the warden is still there');
});

test('the warden never leaves his post, mends when nobody is near, and falls to a party for a hoard', () => {
    const sim = Sim.create('DREAD-5', 'd');
    const p = sim.join('a', 'A')!;
    p.invuln = 99999; p.hearts = 99; p.level = 20;
    const z = zones(sim)[2];
    const w = wardenOf(sim, z)!;
    w.hp = w.mhp * 0.3;
    run(sim, 60);                                                    // nobody about: no retreat, no leaving, just mending
    const still = wardenOf(sim, z)!;
    assert.equal(still.id, w.id, 'he is still there a minute later');
    assert.ok(still.hp > w.mhp * 0.3, 'and has mended');
    // bring him down
    still.hp = 1;
    p.x = z.cx - 40; p.y = z.cy; p.warp++;
    sim.killMob(still, p);
    assert.equal(wardenOf(sim, z), undefined, 'he fell');
    assert.ok(countOf(p, 'crate_gold') >= 2, 'the warden’s hoard: gold crates');
    assert.ok(countOf(p, 'rift_shard') >= 4);
    assert.ok(countOf(p, ITEMS[BOSSES[DREAD_BOSS[z.q]].info.trophy] ? BOSSES[DREAD_BOSS[z.q]].info.trophy : 'trophy_stone') >= 1, 'and the usual trophy');
    assert.equal(sim.s.dread![z.core.i].down, sim.s.day);
    assert.equal(p.cnt?.warden, 1, 'counted for the Warden Slayer medal');
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.text === 'A warden has fallen'));
    // he does not come back at once
    ensure(sim);
    assert.equal(wardenOf(sim, z), undefined);
    sim.s.day += TUNING.wardenRespawnDays - 1;
    ensure(sim);
    assert.equal(wardenOf(sim, z), undefined, 'one day early');
    sim.s.day += 1;
    ensure(sim);
    const back = wardenOf(sim, z);
    assert.ok(back, 'he is back');
    assert.equal(back!.hp, back!.mhp, 'at full strength');
});

test('the Dread blocks survive a save and a load, and a loaded world finds its wardens again', () => {
    const sim = Sim.create('DREAD-6', 'd');
    const again = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.equal(zones(again).length, 4);
    const wardens = Object.values(again.s.ents).filter((e): e is MobE => e.k === 'mob' && !!e.zone && isBoss(e.kind));
    assert.equal(wardens.length, 4, 'no extra wardens appear on loading');
    // a save from before the wardens existed gets them (and their hoard) on its first load
    const fresh = JSON.parse(JSON.stringify(sim.s)) as WorldState;
    for (const e of Object.values(fresh.ents)) if (e.k === 'mob') delete fresh.ents[e.id];
    delete fresh.dread;
    const reloaded = new Sim(fresh);
    assert.equal(Object.values(reloaded.s.ents).filter((e) => e.k === 'mob' && (e as MobE).zone && isBoss(e.kind)).length, 4);
});

test('an older world gets the Dread Reaches where the land is free, and slides them aside where it is not', () => {
    const base = Sim.create('DREAD-7', 'd');
    const world = JSON.parse(JSON.stringify(base.s)) as WorldState;
    // pretend it is a version-6 world: no Dread plots, no wardens
    for (const e of Object.values(world.ents)) if (e.k === 'mob') delete world.ents[e.id];
    for (const p of world.plots) { delete p.dread; delete p.zone; }
    delete world.dread;
    world.version = 6;
    // somebody owns land where block 0 would go
    const where = base.s.plots.find((p) => p.dread === 2 && p.zone === 0)!;
    const spot = world.plots[where.i];
    spot.owned = true; spot.buyer = 'a'; spot.biome = 'meadow';
    migrate(world);
    assert.equal(world.version, 7);
    const zs = world.plots.filter((p) => p.dread === 2);
    assert.equal(zs.length, 4, 'all four blocks found a place');
    assert.ok(!world.plots.filter((p) => p.dread).some((p) => p.owned), 'never on owned land');
    assert.notEqual(world.plots.find((p) => p.dread === 2 && p.zone === 0)!.i, where.i, 'the first one moved over');
    const sim = new Sim(world);
    assert.equal(zones(sim).length, 4);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob' && (e as MobE).zone && isBoss(e.kind)).length, 4);
    // migrating a modern world changes nothing
    const copy = JSON.stringify(sim.s.plots);
    migrate(sim.s);
    assert.equal(JSON.stringify(sim.s.plots), copy);
    void markDread;
});

test('later farmers are never given an island inside a Dread block', () => {
    const sim = Sim.create('DREAD-8', 'd');
    for (let i = 0; i < 16; i++) sim.join(`p${i}`, `P${i}`);
    for (const p of sim.s.plots) if (p.home !== undefined) assert.ok(!p.dread, 'no home in the Reaches');
    for (const p of Object.values(sim.s.players)) assert.equal(zoneAt(sim, p.x, p.y), null, `${p.name} starts outside`);
});
