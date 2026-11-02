// Result, revive, pause and settings screens: markup and CSS hooks exist, no em dash.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const html = readFileSync(join(root, 'index.html'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8'), fx = readFileSync(join(root, 'result_fx.js'), 'utf8');
for (const id of ['rRibbon', 'rLevel', 'rLbar', 'rvArc', 'rvSec', 'rStars', 'rNext', 'rRetry', 'rHub']) assert(html.includes('id="' + id + '"'), id);
assert(html.includes('@css:11-result-pause') && html.includes('end @css:11-result-pause'));
assert.equal((html.match(/class="tgl"/g) || []).length, 6);
for (const f of ['revealStars', 'countUp', 'levelBar', 'reviveRing']) { assert(fx.includes('export function ' + f)); assert(main.includes(f)); }
assert(!/—/.test(html + main + fx));
