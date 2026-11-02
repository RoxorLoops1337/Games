// Round 4: skill power compare, loadout swap rules and the new CSS/markup hooks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sheet = await import(join(root, 'skill_sheet.js'));
const sim = await import(join(root, 'sim.js'));
for (const w of sim.WEAPONS) {
  const a = sheet.skillPower(w.id, 1), b = sheet.skillPower(w.id, 5);
  assert.ok(a > 0 && b > a, 'skill power grows with level: ' + w.id);
}
// swap = remove one then add one: a full loadout refuses a plain add, the swap keeps the size
const s = sim.defaultSave(), extra = sim.WEAPONS.find(w => w.frag);
s.skills[extra.id].lv = 1;
s.loadout = sim.WEAPONS.filter(w => !w.frag).map(w => w.id).slice(0, sim.LOADOUT_SIZE);
if (s.loadout.length === sim.LOADOUT_SIZE) {
  const out = s.loadout[0];
  assert.ok(!sim.toggleLoadout(s, extra.id), 'full loadout refuses a plain add');
  assert.ok(sim.toggleLoadout(s, out) && sim.toggleLoadout(s, extra.id));
  assert.equal(s.loadout.length, sim.LOADOUT_SIZE);
  assert.ok(s.loadout.includes(extra.id) && !s.loadout.includes(out));
}
const css = readFileSync(join(root, 'index.html'), 'utf8');
for (const k of ['.dswalk', '.dscmp', '.lswap', '.rchip']) assert.ok(css.includes(k), 'css has ' + k);
assert.ok(!readFileSync(join(root, 'loadout_ux.js'), 'utf8').includes('—'), 'no em dash');
