// 07-cards round 8: baked foil art, luck meter wipe markup, named synergy chains, rarity colours in one place.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RARITIES } from '../../cell_serpent/sim.js';
import { FOIL_COLORS, bakeCardArt } from '../../cell_serpent/card_bake.js';
import { luckHTML, bandSheetHTML } from '../../cell_serpent/cards_ui.js';

assert.deepEqual(FOIL_COLORS, RARITIES.map(r => r.color), 'baked foil colours match the rarity table');
assert.equal(bakeCardArt(), false, 'no canvas in node: the old gradient CSS stays in charge');

const g = { level: 4, stage: 6, rerolls: 2, ups: { notes: 2, burst: 1, crit: 1 }, weap: {} };
assert.ok(/<b class="lkw"><i><\/i><\/b>/.test(luckHTML(g)), 'luck fill carries the baked wipe layer');
const sheet = bandSheetHTML(g, () => '');
assert.ok(sheet.includes('Echo Chamber: Every note gets an echo'), 'active chain shows its name');
assert.ok(sheet.includes('Find'), 'half chain still hints the missing part');

const html = readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('/* @css:07-cards round 8 */'), html.indexOf('/* end @css:07-cards round 8 */'));
assert.ok(css.length > 500, 'round 8 css block exists');
for (const i of [0, 1, 2, 3, 4, 5]) assert.ok(css.includes(`.foil.f${i}{background:var(--cb-f${i})`), 'baked plate for rarity ' + i);
assert.ok(/\.chtoast\{/.test(css) && /biplus/.test(css), 'chain toast and +N chip styles');
assert.ok(/@media \(max-width:340px\)/.test(css), '320 wide text fit rules');
assert.ok(!/—/.test(css), 'no em dash');
console.log('07_cards_r8 ok');
