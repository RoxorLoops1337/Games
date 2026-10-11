// Windows that watch a machine work leave the solo world running; the rest pause it. A tooltip's owner is checked for being alive.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pausesWorld, stillThere } from '../src/client/ui/screens/live';

test('the machine and device windows do not pause the world, every other window does', () => {
    assert.equal(pausesWorld('machine'), false);
    assert.equal(pausesWorld('device'), false);
    for (const w of ['inventory', 'craft', 'menu', 'skills', 'chest', 'market']) assert.equal(pausesWorld(w), true, w);
});

test('a card whose object was destroyed or hidden (itself or a container above it) goes away on its own', () => {
    const zone = { active: true, visible: true, parentContainer: null as unknown };
    const root = { active: true, visible: true, parentContainer: null as unknown };
    zone.parentContainer = root;
    assert.equal(stillThere(zone as never), true);
    root.visible = false;
    assert.equal(stillThere(zone as never), false, 'its plate is hidden');
    root.visible = true; zone.active = false;
    assert.equal(stillThere(zone as never), false, 'destroyed');
});
