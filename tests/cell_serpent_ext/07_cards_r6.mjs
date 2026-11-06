// 07 cards round 6: foil plate behind every card icon, chips that tick on pick. Runs its asserts when imported.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foilHTML, buildHTML } from '../../cell_serpent/cards_ui.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('every rarity gets a foil class and CSS rules', () => {
  for (let r = 0; r <= 5; r++) { assert.ok(foilHTML(r).includes('foil f' + r)); assert.ok(css.includes('.foil.f' + r), 'css for f' + r); }
});
ok('cards render the foil inside the icon', () => assert.ok(main.includes('${foilHTML(rn)}')));
ok('build strip chips carry the id the tick looks up', () => {
  const html = buildHTML({ ups: { aspd: 2 }, weap: { swab: { lv: 3 } } }, id => 'X');
  assert.ok(html.includes('data-id="aspd"') && html.includes('data-id="swab"'));
});
ok('the pick ticks the band chip and no em dash was added', () => {
  assert.ok(main.includes("tickBand($('buildStrip')"));
  for (const f of ['cards_ui.js', 'pickfly.js']) assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('—'));
});
