// Round 5 motion and icons: rubber-band maths, HUD glyph painters, modal pop CSS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rubber, swipeTarget } from '../../cell_serpent/tabs_ui.js';
import { paintPauseGlyph, paintStatsGlyph } from '../../cell_serpent/glyphs_ui.js';

assert.ok(Math.abs(rubber(-100, true) + 55) < 1e-9, 'follows at about half speed with a tab to go to');
assert.ok(rubber(-1000, true) >= -120, 'the follow is capped');
assert.ok(rubber(300, false) > 0 && rubber(300, false) < 34, 'the edge bump is short and one way');
assert.ok(rubber(80, false) < rubber(80, true), 'the edge is stiffer than a real swipe');
assert.equal(rubber(0, false), 0);
assert.equal(swipeTarget(['A', 'B'], 'A', -100, 0, 100), 'B', 'swipe maths unchanged');

let calls = 0; const c = { createLinearGradient: () => ({ addColorStop() {} }), beginPath() { calls++; }, roundRect() {}, rect() {}, fill() {} };
paintPauseGlyph(c, 0, 0); paintStatsGlyph(c, 0, 0); assert.ok(calls >= 10, 'both glyphs paint bars');

const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
assert.ok(/@css:19-buttons round 5/.test(html) && /d19Pop/.test(html) && /rb-back/.test(html), 'round 5 css block present');
assert.ok(!/—/.test(html.slice(html.indexOf('@css:19-buttons round 5'))), 'no em dash');
