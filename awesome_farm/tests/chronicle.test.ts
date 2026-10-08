// The farm chronicle: one storybook line per milestone, written once, kept in the saved world and sent to everyone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TUNING } from '../src/shared/config';
import * as chronicle from '../src/shared/sim/chronicle';
import * as economy from '../src/shared/sim/economy';
import { Sim } from '../src/shared/sim/sim';
import type { SimEvent } from '../src/shared/sim/types';

const lines = (sim: Sim) => (sim.s.chron ?? []).map((e) => e.t);
const events = (sim: Sim) => sim.events.filter((x): x is Extract<SimEvent, { e: 'chron' }> => x.e === 'chron');

test('joining writes one line, and coming back does not write it again', () => {
    const sim = Sim.create('chron-join', 'c');
    sim.join('a', 'Dana');
    assert.deepEqual(lines(sim), ['Dana set up camp on a small island.']);
    sim.leave('a'); sim.join('a', 'Dana');
    assert.equal(lines(sim).length, 1);
    sim.join('b', 'Sam');
    assert.deepEqual(lines(sim), ['Dana set up camp on a small island.', 'Sam joined the farm.']);
    assert.equal(events(sim).length, 2, 'each line is also sent to every screen');
});

test('a keyed line is written once; a line without a key every time; the log is capped and the text is cut', () => {
    const sim = Sim.create('chron-key', 'c');
    assert.equal(chronicle.note(sim, 'x', 'First.', 'k_star'), true);
    assert.equal(chronicle.note(sim, 'x', 'Again.', 'k_star'), false);
    chronicle.note(sim, undefined, 'No key.', 'k_star'); chronicle.note(sim, undefined, 'No key.', 'k_star');
    assert.equal(lines(sim).filter((t) => t === 'No key.').length, 2);
    for (let i = 0; i < chronicle.CHRON_MAX + 40; i++) chronicle.note(sim, `n${i}`, `Line ${i}`, 'k_star');
    assert.equal(sim.s.chron!.length, chronicle.CHRON_MAX);
    assert.equal(sim.s.chron![sim.s.chron!.length - 1].t, `Line ${chronicle.CHRON_MAX + 39}`, 'the newest is kept');
    chronicle.note(sim, 'long', 'x'.repeat(500), 'k_star');
    assert.ok(sim.s.chron!.at(-1)!.t.length <= 160);
});

test('names read like a sentence', () => {
    assert.equal(chronicle.names([]), 'Someone');
    assert.equal(chronicle.names(['Dana']), 'Dana');
    assert.equal(chronicle.names(['Dana', 'Sam']), 'Dana and Sam');
    assert.equal(chronicle.names(['Dana', 'Sam', 'Kit']), 'Dana, Sam and Kit');
    assert.equal(chronicle.names(['Dana', 'Sam', 'Kit', 'Lou', 'Bo']), 'Dana, Sam and 3 others');
    assert.equal(chronicle.names(['Dana', 'Dana', '']), 'Dana', 'duplicates and blanks do not count');
});

test('level marks: a line for every mark crossed, once', () => {
    const sim = Sim.create('chron-level', 'c');
    const p = sim.join('a', 'Dana')!;
    sim.gainXp(p, 1e9);
    const l = lines(sim);
    for (const m of chronicle.LEVEL_MARKS.filter((m) => m <= p.level)) assert.ok(l.includes(`Dana reached level ${m}.`), `level ${m}`);
    const n = l.length;
    sim.gainXp(p, 10);
    assert.equal(lines(sim).length, n, 'nothing new without a new mark');
});

test('raising land: the first plot and the count marks', () => {
    const sim = Sim.create('chron-land', 'c');
    const p = sim.join('a', 'Dana')!;
    p.coins = 1e9;
    const want = chronicle.LAND_MARKS.filter((m) => m <= 6);
    for (let i = 0; i < 6; i++) {
        const next = sim.world.purchasable()[0];
        assert.ok(next, 'land to buy');
        economy.cmdBuy(sim, p, next.i);
    }
    const l = lines(sim);
    assert.ok(l.includes('Dana raised the first new plot out of the sea.'));
    assert.ok(l.includes('Dana has raised 5 plots out of the sea.'));
    assert.equal(want.length, 2);
    assert.equal(l.filter((t) => t.includes('raised')).length, 2);
});

test('mornings: the first night, the farm\'s age, the night that held an event, the new season', () => {
    const sim = Sim.create('chron-day', 'c');
    sim.join('a', 'Dana');
    sim.s.day = 2; chronicle.morning(sim, null);
    assert.ok(lines(sim).includes('The farm made it through its first night.'));
    sim.s.day = 11; chronicle.morning(sim, 'bloodmoon');
    assert.ok(lines(sim).includes('The Blood Moon rose on day 10, and the farm stood.'));
    assert.ok(lines(sim).includes('The farm is 10 days old.') === false, 'day 11 is not a mark');
    sim.s.day = 10; chronicle.morning(sim, 'meteors');
    assert.ok(lines(sim).includes('The farm is 10 days old.'));
    assert.ok(lines(sim).includes('Stars fell on the farm on day 9.'));
    // the real dawn does it too: step a world through its first day
    const real = Sim.create('chron-dawn', 'c');
    real.join('a', 'Dana');
    const day = TUNING.dayLength + real.s.nightLen;
    for (let t = 0; t < day + 5; t += 0.5) real.step(0.5);
    assert.equal(real.s.day, 2);
    assert.ok(lines(real).includes('The farm made it through its first night.'));
});

test('the chronicle is saved with the world and sent with the welcome', () => {
    const sim = Sim.create('chron-save', 'c');
    sim.join('a', 'Dana');
    chronicle.note(sim, 'k', 'Something happened.', 'k_flag');
    const copy = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.deepEqual(copy.s.chron, sim.s.chron);
    chronicle.note(copy, 'k', 'Again.', 'k_flag');
    assert.equal(lines(copy).filter((t) => t === 'Again.').length, 0, 'the key survives a reload');
});

test('an old save has no chronicle and still loads and writes one', () => {
    const sim = Sim.create('chron-old', 'c');
    sim.join('a', 'Dana');
    const state = JSON.parse(JSON.stringify(sim.s));
    delete state.chron;
    const old = new Sim(state);
    assert.equal(old.s.chron, undefined);
    old.join('b', 'Sam');
    assert.deepEqual(lines(old), ['Sam joined the farm.']);
});
