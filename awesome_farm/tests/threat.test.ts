// Night difficulty follows the farmer's level (a party's average), not the age of the world; wild creatures are rare.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TUNING } from '../src/shared/config';
import { MOBS, nightCount, softHit, tierCap } from '../src/shared/data/mobs';
import * as mobs from '../src/shared/sim/mobs';
import { Sim } from '../src/shared/sim/sim';
import type { CritE, MobE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds; t += STEP) sim.step(STEP); };
const mobsOf = (sim: Sim) => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !e.zone);       // (the Dread Reaches keep their own

test('a level 1 farmer in an old world meets a new farmer\'s night: a few slimes, gentle, no elites', () => {
    const sim = Sim.create('THREAT-1', 'test');
    const a = sim.join('a', 'A')!;
    sim.s.day = 64;                                   // a long-running world
    a.level = 1;
    sim.s.clock = TUNING.dayLength - 0.5;
    run(sim, 1 + TUNING.nightSpawnWindow + 3);
    a.invuln = 999;
    const ms = mobsOf(sim);
    assert.ok(sim.s.night && ms.length >= 1, `${ms.length} mobs at night`);
    assert.ok(ms.length <= nightCount(1) * 2, `${ms.length} mobs for a level 1 farmer`);
    for (const m of ms) {
        assert.equal(m.kind, 'slime', 'only slimes at level 1');
        assert.ok(!m.el, 'no elites');
        assert.equal(m.lv, 1);
        assert.equal(m.mhp, MOBS.slime.hp, 'base health, not day-64 health');
        assert.ok((m.dm ?? 1) < 1, 'softened hits');
    }
});

test('a veteran still gets the whole bestiary, tougher and in numbers', () => {
    const sim = Sim.create('THREAT-2', 'test');
    const a = sim.join('a', 'A')!;
    sim.s.day = 1;                                    // a brand new world
    a.level = 20;
    const tiers = new Set<number>();
    let elite = 0;
    for (let i = 0; i < 400; i++) {
        const m = mobs.spawnMob(sim, undefined, 'a');
        if (!m) continue;
        tiers.add(MOBS[m.kind].tier);
        if (m.el) elite++;
        assert.equal(m.lv, 20);
        assert.ok(m.mhp >= MOBS[m.kind].hp, 'at least base health');
        sim.remove(m.id);
    }
    assert.ok(Math.max(...tiers) >= 2, `tiers seen: ${[...tiers].join(',')}`);
    assert.ok(elite > 0, 'elites appear');
    assert.ok(nightCount(20) > nightCount(1));
});

test('a party shares the average level; farmers far apart each keep their own', () => {
    const sim = Sim.create('THREAT-3', 'test');
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    a.level = 2; b.level = 20;
    b.x = a.x + 100; b.y = a.y;                       // standing together
    assert.equal(mobs.groupLevel(sim, a), 11);
    assert.equal(mobs.groupLevel(sim, b), 11);
    b.x = a.x + TUNING.partyRange + 400;              // wandered off
    assert.equal(mobs.groupLevel(sim, a), 2);
    assert.equal(mobs.groupLevel(sim, b), 20);
    b.x = a.x + 100; sim.leave('b');                  // offline farmers do not count (join and leave are the only things that change who is online)
    assert.equal(mobs.groupLevel(sim, a), 2);
    sim.join('b', 'B'); b.x = a.x + 100;
    assert.equal(mobs.threatAt(sim, a.x, a.y), 11, 'the spot takes the nearest party\'s level');
});

test('the dials are monotonic and sane', () => {
    let prev = 0;
    for (let l = 1; l <= 80; l++) {
        const n = nightCount(l);
        assert.ok(n >= 2 && n <= 14 && n >= prev, `night count at level ${l}`);
        prev = n;
        assert.ok(softHit(l) > 0 && softHit(l) <= 1);
        assert.ok(tierCap(l) >= tierCap(Math.max(1, l - 1)));
    }
    assert.ok(softHit(1) < softHit(4) && softHit(5) === 1);
});

test('wild creatures are a find, not a crowd', () => {
    const sim = Sim.create('THREAT-4', 'test');
    const a = sim.join('a', 'A')!;
    a.invuln = 999;
    const home = sim.world.plotAtPx(a.x, a.y)!;      // a farm of a few plots, so there is room for them to wander in
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) { const q = sim.world.plot(home.gx + dx, home.gy + dy); if (q) q.owned = true; }
    sim.world.recompute();
    let seen = 0, most = 0;
    for (let t = 0; t < 240; t += STEP) {
        sim.step(STEP);
        a.hearts = 99;
        if (Math.round(t * 20) % 20) continue;
        const near = Object.values(sim.s.ents).filter((e): e is CritE => e.k === 'crit' && e.mode === 0 && Math.hypot(e.x - a.x, e.y - a.y) < 640).length;
        most = Math.max(most, near);
        if (near) seen++;
    }
    assert.ok(!sim.nightEv, 'a quiet day');
    assert.ok(most <= TUNING.wildNear, `${most} wild creatures at once`);
    assert.ok(seen > 0, 'one does turn up');
});
