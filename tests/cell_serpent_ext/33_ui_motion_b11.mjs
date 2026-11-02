// Batch 11 UI: close curtain, badge flight direction, event/pet glyphs, unified pressed state, lighter milk glyph.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { badgeDir } from '../../cell_serpent/tabs_ui.js';
import { GLYPHS, EMOJI_GLYPH, splitGlyphs } from '../../cell_serpent/glyph_sweep.js';
import { B11_GLYPHS, B11_EMOJI } from '../../cell_serpent/glyph_b11.js';
import { GEAR_GLYPHS } from '../../cell_serpent/glyph_gear.js';
import { closeFrames, curtainFrames, curtainClose, CURTAIN_SHUT_MS, CURTAIN_REOPEN_MS } from '../../cell_serpent/curtain_ui.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');

// badge direction: more ready flies in, fewer sinks, same stays
assert.equal(badgeDir(undefined, '3'), 1);
assert.equal(badgeDir('', '1'), 1);
assert.equal(badgeDir('2', '5'), 1);
assert.equal(badgeDir('5', '2'), -1);
assert.equal(badgeDir('9+', '4'), -1);
assert.equal(badgeDir('4', '9+'), 1);
assert.equal(badgeDir('3', ''), -1);
assert.equal(badgeDir('3', '3'), 0);

// new glyphs: every one is drawn, aria hidden, and the sweep splits them out of text
for (const [e, n] of Object.entries(B11_EMOJI)) {
  assert.ok(GLYPHS[n] && /^<svg class="gs9"/.test(GLYPHS[n]) && /aria-hidden="true"/.test(GLYPHS[n]) && GLYPHS[n].endsWith('</svg>'), e + ' ' + n);
  assert.equal(EMOJI_GLYPH[e], n);
}
for (const g of Object.values(B11_GLYPHS)) assert.ok(!/—/.test(g));
assert.deepEqual(splitGlyphs('🎪'), [{ g: 'tent' }]);
assert.deepEqual(splitGlyphs('👑 BOSS'), [{ g: 'crown' }, { t: ' BOSS' }]);
assert.deepEqual(splitGlyphs('🐷'), [{ g: 'pig' }]);
assert.deepEqual(splitGlyphs('🐥 Fluffy'), [{ g: 'chick' }, { t: ' Fluffy' }]);
assert.deepEqual(splitGlyphs('plain text'), [{ t: 'plain text' }]);
for (const e of ['🎪', '👑', '💣', '🌀', '🐍', '🐷', '👗', '🥁', '🐥', '👒', '🎧', '🥕', '💥', '🫧', '🏁', '🎯']) assert.ok(EMOJI_GLYPH[e], e);

// the milk carton is a lighter drawing: thin outline, no heavy stroke
assert.ok(!/stroke-width="1\.5"/.test(GEAR_GLYPHS.milk) && /stroke-width="1\.3"/.test(GEAR_GLYPHS.milk));

// curtain way back: halves start off screen, end closed, and without a document the callback still runs once
const L = closeFrames(-1), R = closeFrames(1);
assert.ok(/-104%/.test(L[0].transform) && /104%/.test(R[0].transform) && !/-104/.test(R[0].transform));
assert.equal(L[L.length - 1].transform, 'translateX(0)');
assert.ok(CURTAIN_SHUT_MS >= 150 && CURTAIN_SHUT_MS <= 320 && CURTAIN_REOPEN_MS >= 300 && CURTAIN_REOPEN_MS <= 600);
assert.equal(curtainFrames(1).length, 4);
let n = 0;
assert.equal(curtainClose(true, () => n++), false); assert.equal(n, 1);
assert.equal(curtainClose(false, () => n++), false); assert.equal(n, 2);   // headless: no document

// wiring and css
const main = rd('main.js'), html = rd('index.html'), tabs = rd('tabs_ui.js'), sweep = rd('glyph_sweep.js');
assert.ok(/import \{ curtainOpen, curtainClose \} from '\.\/curtain_ui\.js'/.test(main));
assert.ok(/\$\('rHub'\)\.onclick = \(\) => \{ audio\.play\('click'\); curtainClose\(/.test(main) && /openHub\('Battle'\); \}\); \};/.test(main));
assert.ok(/classList\.add\(dir > 0 \? 'flyin'/.test(tabs));
assert.ok(/\.tabs \.dot\.flyin\{/.test(html) && /@keyframes tbFly/.test(html) && /\.tabs \.dot\.sink\{/.test(html));
assert.ok(/html\.rm \.tabs \.dot\.flyin/.test(html));
assert.ok(/\.sbchip,\.kcard,\.eggstage[^{]*\):not\(\[disabled\]\):active\{scale:\.96/.test(html));
assert.ok(/import \{ B11_GLYPHS, B11_EMOJI \} from '\.\/glyph_b11\.js'/.test(sweep));
assert.ok(!/—/.test(rd('curtain_ui.js') + rd('glyph_b11.js') + tabs + sweep));
console.log('33_ui_motion_b11 ok');
