// Iridium: a vein surfaces at dawn on a far corner of owned land, sinks back two dawns later, a pick does nothing to it, and the
// Iridium Drill beside it makes ore, draws waves of hunters that go for the drill, and spends the vein.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { ITEMS } from '../src/shared/data/items';
import { RECIPES } from '../src/shared/data/recipes';
import * as clock from '../src/shared/sim/clock';
import * as iridium from '../src/shared/sim/iridium';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, MobE } from '../src/shared/sim/types';

const T = TUNING.iridium;
const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };

function world (seed: string) {
    const sim = Sim.create(seed, 'iri');
    const p = sim.join('a', 'A')!;
    p.invuln = 1e9; p.hearts = 99;
    for (const pl of sim.world.ownedPlots()) void pl;
    return { sim, p };
}
/** Dawns until a vein shows (the chance is turned up so the test does not depend on the dice). */
function surface (sim: Sim) {
    const old = T.chance; (T as { chance: number }).chance = 1;
    try { sim.s.day = T.fromDay - 1; clock.dawn(sim); } finally { (T as { chance: number }).chance = old; }
    return iridium.veins(sim)[0];
}

test('a vein surfaces on owned land far from home, at dawn from the second day, never two at once', () => {
    const { sim, p } = world('IRI-1');
    sim.s.day = 1; clock.dawn(sim);                   // day 2 dawn with the real chance: may or may not
    const v = surface(sim);
    assert.ok(v, 'a vein');
    assert.equal(v.kind, 'iridium');
    assert.equal(v.hp, T.ore);
    assert.equal(v.ex, sim.s.day + T.lifeDays);
    const c = sim.center(v), h = sim.world.plotCenter(sim.homePlot(p.slot));
    assert.ok(Math.hypot(c.x - h.x, c.y - h.y) >= T.homeGap * TILE, 'a far corner');
    assert.ok(sim.world.plotAtPx(c.x, c.y)?.owned, 'on owned land');
    assert.ok(sim.events.some((e) => e.e === 'banner' && /Iridium has fallen/.test(e.text)), 'the dawn says where');
    const again = surface(sim);
    assert.equal(iridium.veins(sim).length, 1, 'one at a time');
    void again;
});

test('the vein sinks back two dawns later, and a pick cannot touch it', () => {
    const { sim, p } = world('IRI-2');
    const v = surface(sim)!;
    p.equip = { tool: 'pick_iron' } as never;
    const c = sim.center(v);
    p.x = c.x; p.y = c.y + 10; p.energy = 99;
    const hp = v.hp;
    sim.command('a', { t: 'swing', id: v.id });
    assert.equal(v.hp, hp, 'a swing does nothing');
    clock.dawn(sim);
    assert.equal(iridium.veins(sim).length, 1, 'still there after one dawn');
    clock.dawn(sim);
    assert.equal(iridium.veins(sim).length, 0, 'gone at the second');
    assert.ok(sim.events.some((e) => e.e === 'banner' && /sank back/.test(e.text)));
});

function drillBeside (sim: Sim, p: ReturnType<typeof world>['p'], vx: number, vy: number): BuildE {
    for (const [dx, dy] of [[2, 0], [-3, 0], [0, 2], [0, -3], [2, 2], [-3, -3]]) {
        const tx = vx + dx, ty = vy + dy;
        sim.give(p, 'ironbar', 10); sim.give(p, 'gear', 6); sim.give(p, 'goldbar', 3); sim.give(p, 'steel', 2);
        p.skills.i_smith2 = 1; p.skills.i_smith = 1;
        p.x = (tx + 0.5) * TILE; p.y = (ty + 4) * TILE;
        sim.command('a', { t: 'build', kind: 'iridium_drill', tx, ty, rot: 0 });
        const b = sim.buildings('iridium_drill')[0];
        if (b) return b;
    }
    throw new Error('could not place the drill');
}

test('the drill makes ore beside a vein, draws waves that march on it, and spends the vein; USE collects', () => {
    const { sim, p } = world('IRI-3');
    const v = surface(sim)!;
    p.level = 5;
    const b = drillBeside(sim, p, v.tx, v.ty);
    assert.ok(Math.hypot(sim.center(b).x - sim.center(v).x, sim.center(b).y - sim.center(v).y) <= T.range * TILE, 'within range of the vein');
    run(sim, T.cycle + 1);
    assert.equal(b.out?.iridium_ore, 1, 'one ore');
    assert.equal(v.hp, T.ore - 1);
    run(sim, T.waveEvery);
    const hunters = Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !!e.rd);
    assert.ok(hunters.length >= 1, 'a wave');
    const c = sim.center(b);
    assert.ok(hunters.every((m) => m.rd![0] === Math.round(c.x) && m.rd![1] === Math.round(c.y)), 'bound for the drill');
    // collect
    p.x = c.x; p.y = c.y + 12;
    const before = p.inv.iridium_ore ?? 0;
    const have = b.out?.iridium_ore ?? 0;
    sim.command('a', { t: 'use', id: b.id });
    assert.equal((p.inv.iridium_ore ?? 0) - before, have, 'USE takes the ore');
    assert.ok(!b.out?.iridium_ore);
    // a long time drilling spends the vein
    for (const m of hunters) sim.remove(m.id);
    for (let i = 0; i < T.ore * 2 && iridium.veins(sim).length; i++) { run(sim, T.cycle + 0.5); for (const m of Object.values(sim.s.ents)) if (m.k === 'mob') sim.remove(m.id); }
    assert.equal(iridium.veins(sim).length, 0, 'the vein is spent');
    assert.ok((b.ido ?? 0) >= T.ore - 1 && (b.ido ?? 0) <= T.ore, `${b.ido} ore drilled`);
});

test('a drill with no vein near it does nothing and says so', () => {
    const { sim, p } = world('IRI-4');
    sim.give(p, 'ironbar', 10); sim.give(p, 'gear', 6); sim.give(p, 'goldbar', 3); sim.give(p, 'steel', 2);
    p.skills.i_smith2 = 1; p.skills.i_smith = 1;
    const h = sim.world.plotCenter(sim.homePlot(p.slot));
    const tx = Math.floor(h.x / TILE) + 3, ty = Math.floor(h.y / TILE) + 3;
    p.x = (tx + 0.5) * TILE; p.y = (ty + 3) * TILE;
    sim.command('a', { t: 'build', kind: 'iridium_drill', tx, ty, rot: 0 });
    const b = sim.buildings('iridium_drill')[0];
    assert.ok(b);
    run(sim, T.cycle * 2);
    assert.ok(!b.out?.iridium_ore);
    sim.command('a', { t: 'use', id: b.id });
    assert.ok(sim.events.some((e) => e.e === 'float' && /No vein within/.test(e.text)));
});

test('iridium ore smelts into a bar and the bar makes a ring', () => {
    assert.ok(ITEMS.iridium_ore && ITEMS.iridium_bar && ITEMS.ring_iridium);
    const bar = Object.values(RECIPES).find((r) => r.out === 'iridium_bar')!;
    assert.deepEqual(bar.in, { iridium_ore: 2, coal: 1 });
    const ring = Object.values(RECIPES).find((r) => r.out === 'ring_iridium')!;
    assert.equal(ring.station, 'anvil');
    assert.ok(ring.in.iridium_bar);
});
