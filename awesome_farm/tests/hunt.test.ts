// The monster drops behind each boss sigil must stay obtainable in a handful of nights on the
// right ground. A night of killing everything on a plot of the biome (see scripts/hunt-lib.ts)
// has to yield a full set within 8 nights, so a later change to spawn weights, drop chances or
// sigil recipes cannot quietly turn a goal into a chore.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUNTS, nightsNeeded } from '../scripts/hunt-lib';

for (const h of HUNTS) {
    test(`the ${h.sigil} sigil's drops come in a handful of nights on ${h.biome} ground`, () => {
        const r = nightsNeeded(h, 6, 5);
        assert.ok(r.nights <= 8, `${h.sigil}: about ${r.nights.toFixed(1)} nights of killing everything`);
        assert.ok(r.nights > 0.5, 'and not trivially instant');
    });
}
