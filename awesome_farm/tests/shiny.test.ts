// Shinies: a collector's mark that rides from the wild creature to the pet to the companion and the den worker.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TUNING } from '../src/shared/config';
import { petsOf } from '../src/shared/sim/petlib';
import { Sim } from '../src/shared/sim/sim';
import type { CritE } from '../src/shared/sim/types';

test('the odds are about one in sixty-four wild and one in thirty-two from an egg', () => {
    assert.equal(TUNING.shinyWild, 1 / 64);
    assert.equal(TUNING.shinyEgg, 1 / 32);
});

test('a shiny pet makes a shiny companion, and an ordinary one does not', () => {
    const sim = Sim.create('shiny', 's');
    const p = sim.join('a', 'A')!;
    petsOf(p).push({ id: 'p1', sp: 'hopper', name: 'Sparkle', lv: 3, xp: 0, traits: [], shiny: 1 }, { id: 'p2', sp: 'hopper', name: 'Plain', lv: 3, xp: 0, traits: [] });
    const comp = () => Object.values(sim.s.ents).find((e): e is CritE => e.k === 'crit' && e.mode === 1 && e.owner === 'a');
    p.comp = 'p1';
    for (let i = 0; i < 20; i++) sim.step(0.05);
    assert.equal(comp()?.shiny, 1);
    p.comp = 'p2';
    for (let i = 0; i < 20; i++) sim.step(0.05);
    assert.equal(comp()?.shiny, undefined);
});
