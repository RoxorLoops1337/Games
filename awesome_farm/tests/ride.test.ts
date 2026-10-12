// Riding your companion: R climbs on a creature that is level 3+ and Friendly, you run faster, it carries you, a blow or a
// sent-away mount puts you back on your feet, and everything that is not allowed is refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { rideSpeed, RIDE_AT, RIDE_LV } from '../src/shared/data/bond';
import type { Pet } from '../src/shared/data/creatures';
import { hurt } from '../src/shared/sim/health';
import { petsOf } from '../src/shared/sim/petlib';
import { Sim } from '../src/shared/sim/sim';
import { derived } from '../src/shared/sim/stats';
import type { CritE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s - 1e-9; t += STEP) sim.step(STEP); };

function yard (over: Partial<Pet> = {}) {
    const sim = Sim.create('ride', 'r');
    const a = sim.join('a', 'Ann')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 9) * TILE; a.hearts = 99; a.invuln = 0;
    const pet: Pet = { id: 'p1', sp: 'hopper', name: 'Biscuit', lv: RIDE_LV, xp: 0, traits: [], aff: RIDE_AT, ...over };
    petsOf(a).push(pet);
    a.comp = 'p1';
    run(sim, 1);
    sim.events = [];
    const crit = () => Object.values(sim.s.ents).find((e): e is CritE => e.k === 'crit' && e.mode === 1 && e.owner === 'a')!;
    return { sim, a, pet, crit };
}

test('R climbs on a Friendly level-3 companion: faster, and the creature is carried under the rider', () => {
    const { sim, a, crit } = yard();
    const base = derived(a).speed;
    sim.command('a', { t: 'ride' });
    assert.ok(a.ride && a.ride > 1.3, `riding (${a.ride})`);
    assert.ok(derived(a).speed > base * 1.3, 'faster');
    a.x += 60; run(sim, 0.2);
    const c = crit();
    assert.ok(Math.hypot(c.x - a.x, c.y - a.y) < 3, 'the mount is under the rider');
    sim.command('a', { t: 'ride' });
    assert.equal(a.ride, undefined, 'R again climbs off');
    assert.equal(derived(a).speed, base);
});

test('too young, too shy, too far, or no companion: refused', () => {
    for (const over of [{ lv: RIDE_LV - 1 }, { aff: RIDE_AT - 1 }]) {
        const { sim, a } = yard(over);
        sim.command('a', { t: 'ride' });
        assert.equal(a.ride, undefined);
    }
    const far = yard();
    far.crit().x += 200; far.crit().y += 200;
    far.sim.command('a', { t: 'ride' });
    assert.equal(far.a.ride, undefined, 'too far');
    const none = yard();
    none.a.comp = undefined; run(none.sim, 0.2);
    none.sim.command('a', { t: 'ride' });
    assert.equal(none.a.ride, undefined);
});

test('a blow, a downed rider or a mount sent to work puts you on your feet', () => {
    const h = yard();
    h.sim.command('a', { t: 'ride' });
    hurt(h.sim, h.a, { x: h.a.x + 10, y: h.a.y }, 1);
    assert.equal(h.a.ride, undefined, 'knocked off');
    const d = yard();
    d.sim.command('a', { t: 'ride' });
    d.a.comp = undefined; run(d.sim, 0.2);
    assert.equal(d.a.ride, undefined, 'mount dismissed');
});

test('stars and the speed trait help, and it is capped', () => {
    assert.ok(rideSpeed({ star: 3 }, 0) > rideSpeed({}, 0));
    assert.equal(rideSpeed({ star: 3 }, 5), 2);
});
