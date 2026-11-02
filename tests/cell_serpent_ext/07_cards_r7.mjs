// 07-cards round 7: luck meter memory, spent reroll pip, card-wide foil, custom Soundcheck and Crescendo icons, chain pulse.
import assert from 'node:assert/strict';
import { luckHTML, refreshPips, markReroll, cardFoilHTML, chainPulse } from '../../cell_serpent/cards_ui.js';
import { capIconURL } from '../../cell_serpent/card_icons.js';

const g = { level: 3, stage: 5, rerolls: 3, ups: {} };
assert.ok(/class="lkf"/.test(luckHTML(g)), 'first draw: no grow animation');
g.level = 9;
assert.ok(/lkf grow/.test(luckHTML(g)), 'meter grows from its last fill');
assert.ok(/class="lkf"/.test(luckHTML(g)), 'same luck again: no grow animation');

assert.ok(!/used/.test(refreshPips(g)));
markReroll(); g.rerolls = 2;
assert.equal((refreshPips(g).match(/used/g) || []).length, 1, 'one spent pip');
assert.ok(!/used/.test(refreshPips(g)), 'flag clears after one draw');

assert.equal(cardFoilHTML(1), ''); assert.equal(cardFoilHTML(0), '');
for (const r of [2, 3, 4, 5]) assert.ok(cardFoilHTML(r).includes('cf' + r));

assert.ok(capIconURL('chk').startsWith('data:image/svg'), 'Soundcheck icon');
assert.ok(capIconURL('cres').startsWith('data:image/svg'), 'Crescendo icon');
assert.notEqual(capIconURL('chk'), capIconURL('cres'));

assert.equal(chainPulse(null, g, 'crit', true), false);
console.log('07_cards_r7 ok');
