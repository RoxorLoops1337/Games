// Batch 10 UI: number badges on tabs, drawn Gear glyphs, stage curtain.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { badgeLabel } from '../../cell_serpent/tabs_ui.js';
import { GLYPHS, EMOJI_GLYPH, splitGlyphs } from '../../cell_serpent/glyph_sweep.js';
import { GEAR_GLYPHS, GEAR_EMOJI } from '../../cell_serpent/glyph_gear.js';
import { curtainFrames, curtainOpen, CURTAIN_MS } from '../../cell_serpent/curtain_ui.js';
import { KEEPSAKES } from '../../cell_serpent/sim.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');

// tab badge labels
assert.equal(badgeLabel(0), '');
assert.equal(badgeLabel(1), '1');
assert.equal(badgeLabel(9), '9');
assert.equal(badgeLabel(10), '9+');
assert.equal(badgeLabel(42), '9+');
assert.equal(badgeLabel(-3), '');

// every keepsake icon becomes a drawn glyph, and the sweep splits it out of a string
for (const k of KEEPSAKES) {
  const key = k.icon.replace(/️/g, '');
  const name = EMOJI_GLYPH[key] || EMOJI_GLYPH[k.icon];
  assert.ok(name && GLYPHS[name], 'keepsake ' + k.id + ' has a glyph (' + k.icon + ')');
}
for (const [e, n] of Object.entries(GEAR_EMOJI)) assert.ok(GLYPHS[n] && /^<svg class="gs9"/.test(GLYPHS[n]) && /aria-hidden="true"/.test(GLYPHS[n]), e);
for (const g of Object.values(GEAR_GLYPHS)) assert.ok(!/—/.test(g) && g.endsWith('</svg>'));
assert.deepEqual(splitGlyphs('🎙️'), [{ g: 'stand' }]);
assert.deepEqual(splitGlyphs('🔥 3 day streak'), [{ g: 'flame' }, { t: ' 3 day streak' }]);
assert.deepEqual(splitGlyphs('🧋 Iced Tea'), [{ g: 'tea' }, { t: ' Iced Tea' }]);

// curtain: halves leave in opposite directions, hold first, reduced motion and headless do nothing
const L = curtainFrames(-1), R = curtainFrames(1);
assert.equal(L.length, R.length);
assert.ok(/-104%/.test(L[L.length - 1].transform) && /104%/.test(R[R.length - 1].transform) && !/-104/.test(R[R.length - 1].transform));
assert.equal(L[0].transform, L[1].transform);
assert.ok(CURTAIN_MS >= 400 && CURTAIN_MS <= 800);
assert.equal(curtainOpen(true), false);
assert.equal(curtainOpen(false), false);   // headless: no document

// wiring and css
const main = rd('main.js'), html = rd('index.html'), tabs = rd('tabs_ui.js');
assert.ok(/function badgeCounts\(\)/.test(main) && /setTabCount\(b, bc\.get\(b\.dataset\.tab\) \|\| 0\)/.test(main));
assert.ok(/const fromHub = shownId === 'hub'/.test(main) && /if \(fromHub\) curtainOpen\(/.test(main));
assert.ok(/export function setTabCount/.test(tabs));
assert.ok(/#curtain10\{[^}]*pointer-events:none/.test(html) && /\.tabs \.dot\.wide/.test(html));
assert.ok(/watchGlyphs\(document\.body\)/.test(main));
assert.ok(!/—/.test(rd('curtain_ui.js') + rd('glyph_gear.js') + tabs));
console.log('32_ui_motion_r10 ok');
