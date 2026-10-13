// Seasonal special nights: summer fireflies, the autumn Harvest Moon, the winter Aurora (and none of it on a Blood Moon night).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nightEvent } from '../src/shared/weather';
import { startNight } from '../src/shared/sim/clock';
import { AURORA_CRYSTALS, FIREFLY_BOOST, fireflyBoost, harvestMoon, HARVEST_MOON_GROW } from '../src/shared/sim/specialnights';
import { Sim } from '../src/shared/sim/sim';
import type { DropE, SimEvent } from '../src/shared/sim/types';

function nightOf (day: number) {
    const sim = Sim.create('nights', 'n');
    sim.join('a', 'Ann');
    sim.s.day = day;
    sim.events = [];
    startNight(sim);
    return sim;
}
const quiet = (from: number) => { for (let d = from; d < from + 7; d++) if (nightEvent('nights', d) !== 'bloodmoon') return d; return from; };

test('summer nights have fireflies, autumn nights a Harvest Moon, and by day nothing changes', () => {
    const summer = nightOf(quiet(8)), autumn = nightOf(quiet(15));
    assert.equal(fireflyBoost(summer), FIREFLY_BOOST);
    assert.equal(harvestMoon(summer), 1);
    assert.equal(harvestMoon(autumn), HARVEST_MOON_GROW);
    assert.equal(fireflyBoost(autumn), 0);
    autumn.s.night = false;
    assert.equal(harvestMoon(autumn), 1);
    const toasts = (s: Sim) => s.events.filter((e): e is Extract<SimEvent, { e: 'toast' }> => e.e === 'toast').map((e) => e.text).join('|');
    assert.match(toasts(summer), /Fireflies/);
    assert.match(toasts(autumn), /Harvest Moon/);
});

test('the winter Aurora drops crystals on owned islands and pings them', () => {
    const sim = nightOf(quiet(22));
    const crystals = Object.values(sim.s.ents).filter((e): e is DropE => e.k === 'drop' && e.res === 'crystal');
    assert.ok(crystals.length >= AURORA_CRYSTALS, `crystals fell (${crystals.length})`);
    assert.ok(sim.events.some((e) => e.e === 'ping' && e.name === 'Aurora'));
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.text === 'The Aurora'));
});
