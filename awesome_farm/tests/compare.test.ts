// Item tooltips against the piece you wear: better is green with a plus, worse is red, a ring has no single piece to compare with.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemTip, wornFor } from '../src/client/ui/tips';

test('a better pick lists what it adds over the one worn, and says nothing when nothing is worn', () => {
    const worn = 'pick_flint', better = 'pick_iron';
    const tip = itemTip(better, { worn });
    const text = (tip.lines ?? []).map((l) => l.t).join('\n');
    assert.match(text, /Against your/);
    assert.match(text, /\+\d+(\.\d+)? mining power/);
    assert.ok(!(itemTip(better).lines ?? []).some((l) => /Against your/.test(l.t)), 'no worn piece, no comparison');
});

test('wornFor finds the piece in the same slot, never the same item and never a ring', () => {
    assert.equal(wornFor({ equip: { tool: 'pick_flint' } }, 'pick_iron'), 'pick_flint');
    assert.equal(wornFor({ equip: { tool: 'pick_iron' } }, 'pick_iron'), undefined);
    assert.equal(wornFor({ equip: {} }, 'pick_iron'), undefined);
    assert.equal(wornFor({ equip: {} }, 'wood'), undefined);
});
