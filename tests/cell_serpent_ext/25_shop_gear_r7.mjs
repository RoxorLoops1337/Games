// Round 7: shop/gear tiles keep a stacked layout, Epic+ loot foil, wardrobe badges.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const html = readFileSync(join(root, 'index.html'), 'utf8'), hub = readFileSync(join(root, 'hub2.js'), 'utf8');
assert.ok(/\.tile\.chestcard \.top,\.tile\.xch \.top\{flex-direction:column/.test(html), 'chest and exchange tiles stack icon over name');
assert.equal((hub.match(/t-gold xch'/g) || []).length, 2, 'both exchange lists use the stacked tile');
assert.ok(/\.lootx \.it\.rar2::before/.test(html) && /\.lootx \.it\.rar3::before/.test(html), 'Epic and Legendary loot cards have foil');
assert.ok(/wbadge/.test(hub) && /WORN/.test(hub), 'wardrobe shows a worn badge');
assert.ok(!/—/.test(html.slice(html.indexOf('round 7: stacked'))), 'no em dash in the round 7 css');
