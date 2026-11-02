// 07-cards: pick screen markup and CSS hooks stay in place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const html = readFileSync(join(root, 'index.html'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8');
assert.ok(html.includes('/* @css:07-cards */') && html.includes('/* end @css:07-cards */'));
for (const k of ['dealin', 'shine', 'rays', 'cpop', 'lvflash', 'prefers-reduced-motion']) assert.ok(html.includes(k), k);
for (let r = 0; r <= 5; r++) assert.ok(main.includes("' r' + rn"), 'rarity class');
assert.ok(main.includes("'123'.includes(e.key)"), 'keyboard 1-3 kept');
assert.ok(main.includes('pickLock'), 'double pick guard');
assert.ok(!(html + main).includes('—'), 'no em dash');
