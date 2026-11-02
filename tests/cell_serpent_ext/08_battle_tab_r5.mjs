// Battle tab round 5 (agent 08): dim H badges, rewards filter, collect fly
import assert from 'node:assert';
import fs from 'node:fs';
import { chipReward } from '../../cell_serpent/battle_ui.js';
import { hardLevel, flightFrames } from '../../cell_serpent/gig_fx.js';
const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
const fx = fs.readFileSync(new URL('../../cell_serpent/gig_fx.js', import.meta.url), 'utf8');
assert.ok(chipReward(4, 14, 3).includes('hk hot'), 'next Hard stage is bright');
assert.ok(chipReward(5, 14, 3).includes('hk dim'), 'other unpaid Hard stages are dim');
assert.equal(chipReward(2, 14, 3), '', 'paid Hard stage has no badge');
assert.ok(chipReward(15, 14, 3).includes('class="rw"'), 'next first clear keeps its reward chip');
assert.equal(hardLevel(4, 14, 3), 'hot'); assert.equal(hardLevel(9, 14, 3), 'dim'); assert.equal(hardLevel(3, 14, 3), 'none'); assert.equal(hardLevel(15, 14, 3), 'none');
const fr = flightFrames(200, -300, 2);
assert.equal(fr.length, 4); assert.ok(fr[3].transform.includes('200.0px,-300.0px'), 'flyer ends on the target');
assert.ok(main.includes('syncRwFilter') && main.includes('collectFly') && main.includes('hasrw'), 'wired');
assert.ok(html.includes('#stChips.rwonly') && html.includes('.gfx-fly') && html.includes('hk.dim'), 'css');
assert.ok(!/—/.test(fx), 'no em dash');
