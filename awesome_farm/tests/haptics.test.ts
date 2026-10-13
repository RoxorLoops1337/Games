// Haptics: every pattern is short and made of positive numbers, and only actions that exist have one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIONS } from '../src/shared/actions';
import { BUZZ } from '../src/client/juice/haptics';

test('every buzz belongs to a real action and is short and well formed', () => {
    for (const [action, p] of Object.entries(BUZZ)) {
        assert.ok((ACTIONS as readonly string[]).includes(action), `${action} is an action`);
        const list = Array.isArray(p) ? p : [p as number];
        assert.ok(list.every((n) => Number.isFinite(n) && n > 0 && n <= 200), `${action}: each number is 1 to 200 ms`);
        assert.ok(list.reduce((a, n) => a + n, 0) <= 600, `${action}: under 0.6 s in all`);
    }
    assert.ok(BUZZ.downed && BUZZ.levelUp && BUZZ.hurt, 'the big moments are felt');
});
