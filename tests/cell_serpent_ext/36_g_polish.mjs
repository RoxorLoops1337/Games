// batch 13 agent g: pets and gear screen polish (shared header and chip style, centred gear grids)
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const html = readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const i = html.indexOf('/* @css:36-g-polish */'), j = html.indexOf('/* end @css:36-g-polish */'), k = html.indexOf('/* @css:34-phone-hub */');
assert.ok(i > 0 && j > i && j < k, 'g css block sits before the phone-hub block');
assert.ok(!html.slice(i, j).includes('—'), 'no em dash');
assert.ok(/<b class="ttl">GEAR<\/b>/.test(html), 'gear tab has its own title');
assert.ok(/#tabGear \.kgrid\{display:flex/.test(html), 'gear grids are centred');
console.log('36_g_polish ok');
