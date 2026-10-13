// Settings: the defaults, and that a saved choice (larger text, shape marks) comes back while unknown keys and bad JSON do no harm.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSettings } from '../src/client/settings';

test('accessibility switches start off, and a saved choice is read back', () => {
    const fresh = parseSettings(null);
    assert.equal(fresh.bigText, false);
    assert.equal(fresh.marks, false);
    assert.equal(fresh.shake, true, 'shake, flashes and buzzing start on');
    const saved = parseSettings(JSON.stringify({ bigText: true, marks: true, volume: 0.3 }));
    assert.equal(saved.bigText, true);
    assert.equal(saved.marks, true);
    assert.equal(saved.volume, 0.3);
});

test('bad JSON gives the defaults, and a view or quality that is not known falls back', () => {
    assert.equal(parseSettings('{nope').marks, false);
    assert.equal(parseSettings(JSON.stringify({ view: 'vr', quality3d: 'ultra' })).view, '2d');
    assert.equal(parseSettings(JSON.stringify({ view: 'vr', quality3d: 'ultra' })).quality3d, 'auto');
});
