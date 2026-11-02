// Skills and Pets tab design: static checks on markup hooks and CSS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('/* @css:09-skills-pets */'), html.indexOf('/* end @css:09-skills-pets */'));
assert.ok(css.length > 500, 'css block present');
for (const sel of ['.tile.ready', '.eggstage', '.tile .lk', '.slot .slv', '#bLoot.reveal']) assert.ok(css.includes(sel), 'css has ' + sel);
for (const hook of ['UPGRADE READY', 'eggstage', "'coll", 'class="star', 'slv']) assert.ok(main.includes(hook), 'main has ' + hook);
assert.ok(!/—/.test(css + main), 'no em dash');
console.log('09 skills/pets ok');

// round 2: detail sheets, mastery rank, chips, hatch burst
import { skillPreview, skillRank, petBonusText, PET_ABILITY, PET_RARITY } from '../../cell_serpent/skill_sheet.js';
import { WEAPONS, PETS, SKILL_MAX_LV, skillMul, defaultSave } from '../../cell_serpent/sim.js';
const sheetSrc = fs.readFileSync(new URL('../../cell_serpent/skill_sheet.js', import.meta.url), 'utf8');
for (const w of WEAPONS) {
  const a = skillPreview(w.id, 1), b = skillPreview(w.id, SKILL_MAX_LV);
  assert.ok(a && a.rows[0].k === 'Damage', 'preview for ' + w.id);
  assert.ok(+a.rows[0].b > +a.rows[0].a, 'next level hits harder: ' + w.id);
  assert.equal(+b.rows[0].a, +b.rows[0].b, 'max level has no next step');
}
assert.equal(skillPreview('swab', 4).bonusPct, Math.round((skillMul(5) - skillMul(4)) * 100));
const sv = defaultSave(); sv.addict.sk.swab = 450;
assert.equal(skillRank(sv, 'swab').rank, 2); assert.equal(skillRank(sv, 'daggers').rank, 0);
for (const p of PETS) { assert.ok(PET_ABILITY[p.id] && p.id in PET_RARITY, 'pet text ' + p.id); assert.ok(petBonusText(p, 2).length > 3); }
assert.equal(petBonusText(PETS[0], 2), '+12% hit power');
for (const hook of ['skillSheet', 'petSheet', 'hatchBurst', 'chipRow']) assert.ok(main.includes(hook), 'main uses ' + hook);
for (const sel of ['.dsheet', '.fchip', '.hburst', '.rk']) assert.ok(css.includes(sel), 'css has ' + sel);
assert.ok(/min-height:44px/.test(css) && /\.dsx\{[^}]*width:44px/.test(css), '44px targets');
assert.ok(!/—/.test(sheetSrc), 'no em dash in sheet module');
console.log('09 skills/pets round 2 ok');
