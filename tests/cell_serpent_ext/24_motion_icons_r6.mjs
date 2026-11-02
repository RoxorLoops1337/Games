// Round 6 motion and icons: tab indicator maths, swipe handoff on chip rows, side icon set, pause to play morph.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { indicatorPos } from '../../cell_serpent/tabs_ui.js';
import { SIDE_ICON_NAMES, sideIconFor, sideIconURL } from '../../cell_serpent/side_icons.js';

assert.equal(indicatorPos(2, 0, true), 2, 'rests on the current tab');
assert.ok(Math.abs(indicatorPos(2, -55, true) - 2.5) < 1e-9, 'slides toward the next tab while dragging left');
assert.equal(indicatorPos(2, -400, true), 3, 'never passes the next tab');
assert.ok(indicatorPos(2, 200, true) === 1, 'dragging right goes to the previous tab');
assert.ok(Math.abs(indicatorPos(0, 300, false) - 0) < 0.11 && indicatorPos(0, 300, false) < 0, 'only nudges at the first tab');

for (const l of ['Sign in', 'Fan Fund', 'Backstage', 'Wardrobe', 'Trophies', 'Preview', 'Pass', 'Goals', 'Swap']) assert.ok(SIDE_ICON_NAMES.includes(sideIconFor(l)), 'icon for ' + l);
assert.equal(sideIconFor('Harvest'), 'tent', 'the event button keeps the tent');
assert.equal(sideIconURL('calendar'), '', 'headless: no data url, emoji stay');

const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
assert.ok(/@css:19-buttons round 6/.test(html) && /d19PzL/.test(html) && /\.tabind/.test(html), 'round 6 css block present');
assert.ok(/<i class="pzg"/.test(html), 'resume button carries the morphing glyph');
assert.ok(!/—/.test(html.slice(html.indexOf('@css:19-buttons round 6'), html.indexOf('end @css:19-buttons round 6'))), 'no em dash');
const tabs = fs.readFileSync(new URL('../../cell_serpent/tabs_ui.js', import.meta.url), 'utf8');
assert.ok(/rowHasRoom/.test(tabs), 'swipe over a chip row hands over at its edge');
