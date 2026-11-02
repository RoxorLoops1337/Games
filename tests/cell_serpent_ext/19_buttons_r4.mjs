// Round 4 buttons and motion: hub swipe target maths, tab icon set, canvas press pulse on the round HUD buttons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { swipeTarget } from '../../cell_serpent/tabs_ui.js';
import { ICON_NAMES } from '../../cell_serpent/icons.js';

const T = ['Shop', 'Stats', 'Battle', 'Skills', 'Pets', 'Gear'];
assert.equal(swipeTarget(T, 'Shop', -120, 10, 200), 'Stats', 'swipe left goes to the next tab');
assert.equal(swipeTarget(T, 'Stats', 120, 10, 200), 'Shop', 'swipe right goes back');
assert.equal(swipeTarget(T, 'Shop', 120, 0, 200), null, 'no tab before the first');
assert.equal(swipeTarget(T, 'Gear', -120, 0, 200), null, 'no tab after the last');
assert.equal(swipeTarget(T, 'Shop', -120, 90, 200), null, 'a diagonal drag is a scroll, not a swipe');
assert.equal(swipeTarget(T, 'Shop', -30, 0, 200), null, 'too short');
assert.equal(swipeTarget(T, 'Shop', -120, 0, 1500), null, 'too slow');

for (const n of ['tab_shop', 'tab_stats', 'tab_battle', 'tab_skills', 'tab_pets', 'tab_gear']) assert.ok(ICON_NAMES.includes(n), 'icon ' + n);

const hud = fs.readFileSync(new URL('../../cell_serpent/hud.js', import.meta.url), 'utf8');
assert.ok(/press: z =>/.test(hud) && /function pressK/.test(hud), 'hud exposes the press pulse');
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
assert.ok(/R\.hudPress\(zone\)/.test(main), 'a press on pause or stats pulses the button');
assert.ok(/bindHubSwipe\(/.test(main), 'the hub swipe is wired');
