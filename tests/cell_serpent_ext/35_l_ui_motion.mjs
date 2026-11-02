// Batch 12 agent l: drawn paw/hand/play glyphs, haptic vocabulary, toast below the pills, one pressed state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLYPHS, EMOJI_GLYPH, splitGlyphs } from '../../cell_serpent/glyph_sweep.js';
import { PATTERNS, patternFor, patternMs, haptic, TONE_HAPTIC } from '../../cell_serpent/haptics_b12l.js';
import { toastTone } from '../../cell_serpent/toast_ui.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');

for (const [e, n] of [['🐾', 'paw'], ['👆', 'point'], ['▶', 'play'], ['◀', 'back']]) {
  assert.equal(EMOJI_GLYPH[e], n); assert.ok(/^<svg class="gs9"/.test(GLYPHS[n]));
}
assert.deepEqual(splitGlyphs('CONTINUE ▶ 5').map(x => x.g || x.t), ['CONTINUE ', 'play', ' 5']);

// haptics: patterns are short, named, and respect the Vibration setting
for (const [k, v] of Object.entries(PATTERNS)) assert.ok(patternMs(v) > 0 && patternMs(v) <= 200, k);
assert.deepEqual(patternFor('nope'), []);
let got = null; const nav = { vibrate: p => { got = p; return true; } };
assert.equal(haptic('claim', { vibrate: true }, nav), true); assert.deepEqual(got, PATTERNS.claim);
got = null; assert.equal(haptic('claim', { vibrate: false }, nav), false); assert.equal(got, null);
assert.equal(haptic('claim', { vibrate: true, reduceMotion: true }, nav), false);
assert.equal(haptic('tap', { vibrate: true }, {}), false);
assert.equal(haptic('tap', { vibrate: true }, { vibrate() { throw new Error('x'); } }), false);
assert.equal(TONE_HAPTIC[toastTone('Not enough Beats')], 'deny');
assert.equal(TONE_HAPTIC[toastTone('Reward claimed')], 'good');

// css + wiring
const html = rd('index.html'), main = rd('main.js');
assert.ok(/@css:35-ui-b12l/.test(html) && /#toast\{top:calc\(env\(safe-area-inset-top\) \+ 6\d+px\)/.test(html));
assert.ok(/haptic\(TONE_HAPTIC\[tn\]/.test(main) && /glyph_b12l\.js/.test(rd('glyph_sweep.js')));
assert.ok(!/—/.test(rd('haptics_b12l.js') + rd('glyph_b12l.js')));
console.log('35_l_ui_motion ok');
