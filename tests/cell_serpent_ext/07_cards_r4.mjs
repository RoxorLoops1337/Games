// 07-cards round 4: passive stat deltas, band totals sheet with synergy chain, reveal stamp, card frames
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const html = readFileSync(join(root, 'index.html'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8');
const ui = await import('../../cell_serpent/cards_ui.js');
assert.ok(html.includes('/* @css:07-cards round 4 */') && html.includes('/* end @css:07-cards round 4 */'));
assert.ok(html.includes('id="bandSheet"') && main.includes('bandSheetHTML') && main.includes('revealHTML') && main.includes('passiveStat'));

const g = { ups: { power: 2, crit: 1, cdmg: 1, notes: 1 }, val: { power: 16, crit: 3, cdmg: 12, notes: 1 }, weap: { swab: { lv: 2 } } };
const s = ui.passiveStat(g, { kind: 'passive', id: 'power', name: 'Loud Vocals', gain: 8 });
assert.match(s, /^Skill damage: \+16% → \+24%$/, s);
assert.match(ui.passiveStat(g, { kind: 'passive', id: 'speed', name: 'Sharp Notes', gain: 2 }), /none → \+2 cells/);
assert.match(ui.passiveStat(g, { kind: 'passive', id: 'vital', name: 'Calm Down', gain: 20 }), /0% → -5%/);
assert.equal(ui.passiveStat(g, { kind: 'capsule', id: 'aspd', gain: 3 }), '');
// the main.js stat parser must split the text into label / from / to
assert.ok(/^(.*?):?\s*([^:→]+?)\s*→\s*(.+)$/.exec(s));

const sh = ui.bandSheetHTML(g, id => id);
assert.ok(sh.includes('Loud Vocals') && sh.includes('+16%') && sh.includes('Kitty Paws'));
assert.ok(sh.includes('bch on') && sh.includes('Crits hit much harder'), 'owned pair lights up');
assert.ok(sh.includes('Find '), 'half-owned pair shows a hint');
assert.ok(ui.bandSheetHTML({ ups: {}, weap: {} }, id => id).includes('Nothing yet'));

assert.equal(ui.revealHTML(1), '');
assert.ok(ui.revealHTML(3).includes('LEGENDARY') && ui.revealHTML(5).includes('GODLIKE'));
assert.ok(!(html + main + ui.revealHTML(4)).includes('—'), 'no em dash');
