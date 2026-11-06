// Round 5 screen feel: the stage 1 count-in is beat synced, the card pick flight module is safe, no em dashes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const fx = readFileSync(join(dir, 'screenfx.js'), 'utf8'), fly = readFileSync(join(dir, 'pickfly.js'), 'utf8'), main = readFileSync(join(dir, 'main.js'), 'utf8');
assert.ok(/function countIn\(\)/.test(fx) && /F\.go = c\.n === 1 && !c\.boss \? countIn\(\)/.test(fx), 'stage 1 starts the count-in');
assert.ok(/F\.beatFn \? F\.beatFn\(\)/.test(fx), 'the count-in reads the music beat');
assert.ok(/flyPick\(el, \$\('buildStrip'\)/.test(main), 'picking a card flies its icon to the build strip');
assert.ok(/export function flyPick/.test(fly) && /try \{/.test(fly), 'flyPick is exported and guarded');
assert.ok(!fx.includes('—') && !fly.includes('—'), 'no em dash');
// flyPick must be a no-op without a DOM
const { flyPick } = await import(join(dir, 'pickfly.js'));
assert.doesNotThrow(() => flyPick(null, null));
