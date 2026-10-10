// Combat Arts: learning them, the three keys, the cooldowns, and what each one does to monsters.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ART_LIST, ART_SLOTS, ARTS } from '../src/shared/data/arts';
import { SKILLS } from '../src/shared/data/skills';
import * as arts from '../src/shared/sim/arts';
import { Sim } from '../src/shared/sim/sim';
import type { MobE, PlayerS } from '../src/shared/sim/types';

const STEP = 1 / 20;
const simOf = new WeakMap<PlayerS, Sim>();
function rig (id?: string) {
    const sim = Sim.create(`ARTS-${id ?? 'x'}`, 'b'), p = sim.join('a', 'A')!;
    simOf.set(p, sim);
    p.invuln = 1e9; p.energy = 100;
    for (const a of ART_LIST) p.skills[a.skill] = 1;
    arts.sync(p);
    return { sim, p };
}
const mob = (sim: Sim, p: PlayerS, dx: number, dy = 0, kind = 'slime'): MobE => {
    const m = sim.spawnMob(kind as never, 'a')!;
    m.x = p.x + dx; m.y = p.y + dy; m.hp = m.mhp = 2000; m.vx = m.vy = 0;
    return m;
};
const slotOf = (p: PlayerS, id: string) => { if (!p.arts!.includes(id as never)) arts.bind(simOf.get(p)!, p, 0, id); return p.arts!.indexOf(id as never); };
const cast = (sim: Sim, p: PlayerS, id: string, fx = 1, fy = 0) => sim.command('a', { t: 'art', slot: slotOf(p, id), fx, fy });

test('every art has a skill that grants its token, and an icon', () => {
    for (const a of ART_LIST) {
        assert.ok(SKILLS[a.skill], `${a.id}: the skill exists`);
        assert.deepEqual(SKILLS[a.skill].unlock, [a.token], `${a.id}: and grants the token`);
    }
    assert.equal(ART_SLOTS, 3);
});

test('learning arts fills the keys in order; only learned arts can be bound; an art is never on two keys', () => {
    const sim = Sim.create('ARTS-bind', 'b'), p = sim.join('a', 'A')!;
    arts.sync(p);
    assert.equal(p.arts, undefined, 'nothing learned, nothing bound');
    p.skills.c_hook = 1; arts.sync(p);
    assert.deepEqual(p.arts, ['hook', null, null]);
    p.skills.c_ram = 1; arts.sync(p);
    assert.deepEqual(p.arts, ['hook', 'ram', null]);
    sim.command('a', { t: 'artbind', slot: 2, id: 'frost' });      // not learned
    assert.equal(p.arts![2], null);
    sim.command('a', { t: 'artbind', slot: 2, id: 'hook' });       // moves it
    assert.deepEqual(p.arts, [null, 'ram', 'hook']);
    for (const c of [{ slot: 5, id: 'hook' }, { slot: -1, id: 'hook' }, { slot: 0.5, id: 'hook' }, { slot: 0, id: '__proto__' }, { slot: 0, id: 'constructor' }]) sim.command('a', { t: 'artbind', ...c } as never);
    assert.deepEqual(p.arts, [null, 'ram', 'hook']);
});

test('a cast costs energy, starts a cooldown, and a hostile aim does nothing', () => {
    const { sim, p } = rig('cd');
    const m = mob(sim, p, 60);
    const e0 = p.energy;
    cast(sim, p, 'hook');
    assert.equal(p.energy, e0 - ARTS.hook.energy);
    assert.ok(arts.cooldownLeft(sim, p, 'hook') > ARTS.hook.cd - 0.1);
    const e1 = p.energy;
    cast(sim, p, 'hook');
    assert.equal(p.energy, e1, 'not again until it is ready');
    for (let t = 0; t < ARTS.hook.cd + 0.2; t += STEP) sim.step(STEP);
    assert.equal(arts.cooldownLeft(sim, p, 'hook'), 0);
    p.energy = 100;
    for (const [fx, fy] of [[0, 0], [NaN, 1], [Infinity, 0], ['x' as never, 1]]) sim.command('a', { t: 'art', slot: slotOf(p, 'hook'), fx, fy });
    assert.equal(p.energy, 100, 'a bad direction costs nothing');
    p.energy = 1;
    cast(sim, p, 'hook');
    assert.equal(p.energy, 1, 'and so does having no energy');
    void m;
});

test('the hook pulls the first monster in line to your feet and stuns it; a boss is hurt but not moved', () => {
    const { sim, p } = rig('hook');
    const near = mob(sim, p, 50), far = mob(sim, p, 90);
    cast(sim, p, 'hook');
    assert.ok(Math.hypot(near.x - p.x, near.y - p.y) < 30, 'pulled in');
    assert.ok(near.hp < 2000, 'hurt');
    assert.ok((near.stun ?? 0) > 0.5, 'stunned');
    assert.ok(far.x > p.x + 60, 'the one behind it was left alone');
    const rig2 = rig('hookboss');
    const b = mob(rig2.sim, rig2.p, 80, 0, 'slimeking');
    const x0 = b.x;
    cast(rig2.sim, rig2.p, 'hook');
    assert.equal(b.x, x0, 'a boss stays where it is');
    assert.ok(b.hp < 2000 && !((b.stun ?? 0) > 0), 'hurt, not stunned');
});

test('the arrow stuns for longer the further it flew, and misses what is off the line', () => {
    const a = rig('arrow-near'), b = rig('arrow-far'), c = rig('arrow-miss');
    const mn = mob(a.sim, a.p, 40), mf = mob(b.sim, b.p, 200), mm = mob(c.sim, c.p, 100, 60);
    cast(a.sim, a.p, 'arrow'); cast(b.sim, b.p, 'arrow'); cast(c.sim, c.p, 'arrow');
    assert.ok((mf.stun ?? 0) > (mn.stun ?? 0) && (mn.stun ?? 0) > 1, `${mn.stun} < ${mf.stun}`);
    assert.equal(mm.hp, 2000, 'off the line');
});

test('scorch burns everything near and leaves what is far; the shroud hides you, and the next blow is harder and ends it', () => {
    const { sim, p } = rig('scorch');
    const close = mob(sim, p, 30), far = mob(sim, p, 150);
    cast(sim, p, 'scorch');
    assert.ok(close.hp < 2000 && far.hp === 2000);
    const h = close.hp;
    for (let t = 0; t < 3; t += STEP) sim.step(STEP);
    assert.ok(close.hp < h - 1, 'and it keeps burning');

    const s = rig('shroud');
    const ally = mob(s.sim, s.p, 100);
    cast(s.sim, s.p, 'shroud');
    assert.ok((s.p.cl ?? 0) > s.sim.s.time, 'hidden');
    for (let t = 0; t < 1; t += STEP) s.sim.step(STEP);
    assert.ok(Math.hypot(ally.x - s.p.x, ally.y - s.p.y) > 60, 'it did not come for us');
    // the hit from the dark
    const w1 = mob(s.sim, s.p, 12), w2 = mob(s.sim, s.p, 14);
    s.p.cl = s.sim.s.time + 3;
    const before = w1.hp;
    s.sim.command('a', { t: 'swing', id: w1.id });
    const dealt = before - w1.hp;
    assert.ok(dealt > 0 && !s.p.cl, 'the shroud ended');
    s.p.swingCd = 0;
    const before2 = w2.hp;
    s.sim.command('a', { t: 'swing', id: w2.id });
    assert.ok(dealt > (before2 - w2.hp) * 1.3, `ambush ${dealt} vs plain ${before2 - w2.hp}`);
    // a blow taken breaks it
    const t2 = rig('shroud2');
    t2.p.invuln = 0;
    cast(t2.sim, t2.p, 'shroud');
    t2.sim.hurt(t2.p, { x: t2.p.x + 5, y: t2.p.y }, 1);
    assert.ok(!t2.p.cl);
});

test('the frost zone freezes what stands in it, then melts away; the headbutt lunges and throws the first monster, dazed', () => {
    const { sim, p } = rig('frost');
    const inside = mob(sim, p, 56), outside = mob(sim, p, 200);
    cast(sim, p, 'frost');
    assert.equal(sim.artZones.length, 1);
    for (let t = 0; t < 1; t += STEP) sim.step(STEP);
    assert.ok((inside.sm ?? 1) < 0.3, `slowed (${inside.sm})`);
    assert.equal(outside.sm ?? 1, 1);
    for (let t = 0; t < 6; t += STEP) sim.step(STEP);
    assert.equal(sim.artZones.length, 0, 'melted');

    const r = rig('ram');
    const m = mob(r.sim, r.p, 40);
    const x0 = r.p.x;
    cast(r.sim, r.p, 'ram');
    assert.ok(r.p.x > x0 + 10, 'lunged');
    assert.ok(m.hp < 2000 && (m.stun ?? 0) > 0.5, 'hit and dazed');
});
