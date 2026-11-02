// Batch 9 UI: the drawn glyph set for hub emoji, and toast tones.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLYPHS, EMOJI_GLYPH, splitGlyphs, sweepGlyphs } from '../../cell_serpent/glyph_sweep.js';
import { toastTone, TONES } from '../../cell_serpent/toast_ui.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');

// every emoji maps to a drawn glyph, every glyph is an svg with an aria-hidden mark
for (const [e, n] of Object.entries(EMOJI_GLYPH)) assert.ok(GLYPHS[n] && /^<svg class="gs9"/.test(GLYPHS[n]) && /aria-hidden="true"/.test(GLYPHS[n]), e);
assert.deepEqual(splitGlyphs('START  ⚡5'), [{ t: 'START  ' }, { g: 'bolt' }, { t: '5' }]);
assert.deepEqual(splitGlyphs('🌟 Season'), [{ g: 'star' }, { t: ' Season' }]);
assert.deepEqual(splitGlyphs('🛡️'), [{ g: 'shield' }]);                       // the variation selector is eaten
assert.deepEqual(splitGlyphs('plain text'), [{ t: 'plain text' }]);
assert.deepEqual(splitGlyphs('✨ 3 🥚'), [{ g: 'sparkle' }, { t: ' 3 ' }, { g: 'egg' }]);
assert.equal(splitGlyphs('🐾').length, 1);                                     // emoji outside the set are left alone
assert.equal(sweepGlyphs(null), 0);                                           // headless safe

// toast tones
assert.equal(toastTone('Not enough Sparkles'), 'deny');
assert.equal(toastTone('That code does not work'), 'deny');
assert.equal(toastTone('Out of Voice! Rest a bit'), 'warn');
assert.equal(toastTone('Hold to give up'), 'warn');
assert.equal(toastTone('3 rewards claimed'), 'good');
assert.equal(toastTone('Sticker! +3 Sparkles'), 'good');
assert.equal(toastTone('Code copied'), 'good');
assert.equal(toastTone('Something else entirely'), 'info');
assert.equal(toastTone(undefined), 'info');

// wiring and css
const main = rd('main.js'), html = rd('index.html');
assert.ok(/watchGlyphs\(document\.body\)/.test(main) && /dressToast\(t, msg\)/.test(main));
for (const t of TONES) assert.ok(html.includes('#toast.tn-' + t) || t === 'info', t);
assert.ok(/@css:19-buttons round 9 \*\//.test(html) && /end @css:19-buttons round 9/.test(html));
assert.ok(/\.tabs \.dot::after/.test(html) && /\.gs9w\{/.test(html));
assert.ok(!/—/.test(rd('glyph_sweep.js') + rd('toast_ui.js')));
console.log('31_ui_motion_b9 ok');
