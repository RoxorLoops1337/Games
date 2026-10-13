// Rainbow's end: when the day's rain clears, a pot of gold (coins and a crate) lands on an owned island, announced to everybody, once a day.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sim } from '../src/shared/sim/sim';
import { potCoins } from '../src/shared/sim/rainbow';
import { weatherAt } from '../src/shared/weather';
import type { DropE } from '../src/shared/sim/types';

function rainyDay (seed: string) {
    for (let d = 2; d < 80; d++) for (let c = 0; c < 200; c += 1) if (weatherAt(seed, d, c).rain > 0.5) { let end = c; while (weatherAt(seed, d, end).rain > 0.05) end++; return { day: d, mid: c, end: end + 1 }; }
    throw new Error('no rain found');
}

test('the rain clearing drops a pot of gold on an owned island, once, with a banner for everyone', () => {
    const sim = Sim.create('rainbow', 'r');
    sim.join('a', 'Ann'); sim.join('b', 'Bo');
    const { day, mid, end } = rainyDay(sim.s.seed);
    sim.s.day = day; sim.s.night = false;
    sim.s.clock = mid;
    sim.step(0.05);                                     // it is raining
    for (const e of Object.values(sim.s.ents)) if (e.k === 'drop') sim.remove(e.id);
    sim.events = [];
    sim.s.clock = end;
    sim.step(0.05);                                     // it has cleared
    const drops = Object.values(sim.s.ents).filter((e): e is DropE => e.k === 'drop');
    assert.ok(drops.filter((d) => d.res === 'coin').length >= potCoins(day), 'the coins');
    assert.ok(drops.some((d) => d.res === 'crate_wood'), 'and a crate');
    assert.equal(sim.events.filter((e) => e.e === 'banner' && e.text === 'A rainbow!').length, 2, 'told to both');
    assert.ok(sim.events.some((e) => e.e === 'ping' && e.name === 'Rainbow'));
    const before = Object.keys(sim.s.ents).length;
    sim.s.clock = mid; sim.step(0.05); sim.s.clock = end; sim.step(0.05);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'drop').length, drops.length, 'only one a day');
    assert.ok(before > 0);
});
