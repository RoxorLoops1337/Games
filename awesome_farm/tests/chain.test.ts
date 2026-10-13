// Harvest chain chimes: a run of pickups climbs a ladder of notes that cannot clash, and a pause drops it back to the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chain, CHAIN_GAP, LADDER } from '../src/client/juice/chain';

test('quick pickups climb the ladder to its top and stay there; a pause starts again at the root', () => {
    const c = new Chain();
    let t = 1000;
    assert.equal(c.next(t), 1, 'the first is the root');
    const pitches = [];
    for (let i = 0; i < 12; i++) { t += 400; pitches.push(c.next(t)); }
    assert.deepEqual(pitches.slice(0, 3), [LADDER[1], LADDER[2], LADDER[3]]);
    assert.equal(pitches.at(-1), LADDER[LADDER.length - 1], 'stays on the top note');
    t += CHAIN_GAP + 1;
    assert.equal(c.next(t), 1, 'after a pause: the root again');
    assert.ok(LADDER.every((r, i) => i === 0 || r > LADDER[i - 1]), 'always going up');
});
