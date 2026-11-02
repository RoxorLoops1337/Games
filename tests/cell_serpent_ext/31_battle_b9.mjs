// Battle tab batch 9 (agent 08): BRING THEM button, claim row reward chips and fly origins, perfect chips
import assert from 'node:assert';
import fs from 'node:fs';
import { bringHTML, claimChips, fanRects, claimInfo } from '../../cell_serpent/battle_ui.js';
import { bestBuild, recFit } from '../../cell_serpent/build_rec.js';
import { defaultSave } from '../../cell_serpent/sim.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
const main = rd('main.js'), html = rd('index.html'), ui = rd('battle_ui.js');

// BRING THEM only shows while the build is incomplete and can be packed
const items = [{ name: 'A', ic: 'a', eq: true, own: true }, { name: 'B', ic: 'b', eq: false, own: true }];
assert.ok(bringHTML({ why: 'x', can: true, items }).includes('ff-bringgo'), 'button when something can be packed');
assert.ok(!bringHTML({ why: 'x', can: false, items }).includes('ff-bringgo'), 'no button when nothing can be packed');
// the real build logic: owned missing picks get packed, then there is nothing left to pack
const s = defaultSave();
for (const id of ['swab', 'tower', 'daggers', 'dragon']) s.skills[id].lv = Math.max(1, s.skills[id].lv);
s.loadout = ['swab', 'tower'];
const nb = bestBuild(s, 'love'); assert.ok(nb && nb.includes('daggers') && nb.includes('dragon'), 'packs the owned recommended skills');
s.loadout = nb; assert.equal(bestBuild(s, 'love'), null, 'second tap has nothing to do');
assert.equal(recFit(s, 'love').have, 3);

// claim row chips merge by currency
const imgs = { beats: '<img>', sparkles: '<s>' };
const ch = claimChips([{ kind: 'beats', amt: 50 }, { kind: 'beats', amt: 100 }, { kind: 'sparkles', amt: 20 }, null], imgs);
assert.ok(ch.includes('+150') && ch.includes('+20') && ch.indexOf('beats') < ch.indexOf('sparkles'), 'merged, beats first');
assert.equal(claimChips([], imgs), ''); assert.equal(claimChips(null, imgs), '');
assert.equal(claimChips([{ kind: 'beats', amt: 0 }], imgs), '', 'no empty chip');
// flyers fan across the row
const fr = fanRects({ left: 10, top: 700, width: 370, height: 40 }, 3);
assert.equal(fr.length, 3); assert.ok(fr[0].left < fr[1].left && fr[1].left < fr[2].left, 'left to right');
assert.ok(fr.every(r => r.left >= 10 && r.left + r.width <= 380), 'inside the row');
assert.equal(fanRects({ left: 0, top: 0, width: 300, height: 30 }, 1).length, 1);
assert.ok(claimInfo(3, '', 0).html.includes("3 gigs</b><span class=\"bc-d\"> done"), 'short claim text leaves room for the chips');

// wiring + css
assert.ok(main.includes('bindBring') && main.includes('claimFrom') && main.includes("classList.add('perfect')") && main.includes('fanRects(claimFrom.rect'), 'wired');
assert.ok(html.includes('.ff-bringgo') && html.includes('.bc-chip') && html.includes('.chip.perfect'), 'css');
assert.ok(!ui.includes('—') && !main.includes('—'), 'no em dash');
