// UI motion (agent 19): count-up maths, coin cap, and static checks of the motion CSS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { countAt, coinCount, easeOut } from '../../cell_serpent/motion.js';

assert.equal(countAt(100, 500, 0), 100);
assert.equal(countAt(100, 500, 1), 500);
assert.equal(countAt(100, 500, 2), 500);
assert.ok(countAt(100, 500, 0.5) > 300 && countAt(100, 500, 0.5) < 500, 'ease out is past halfway at t=.5');
assert.equal(countAt(500, 100, 1), 100, 'counts down too');
for (let t = 0; t <= 1; t += 0.1) assert.ok(Number.isInteger(countAt(0, 12345, t)), 'whole numbers only');
assert.ok(easeOut(0.5) > 0.5);
assert.equal(coinCount(0), 0);
assert.equal(coinCount(-5), 0);
assert.ok(coinCount(1) >= 2 && coinCount(1e9) <= 8, 'coin count is bounded');

const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const m = html.match(/\/\* @css:19-transitions \*\/([\s\S]*?)\/\* end @css:19-transitions \*\//);
assert.ok(m, 'css markers exist');
const css = m[1];
assert.ok(/html\.rm/.test(css), 'Reduce Motion rule present');
assert.ok(/\.scr\.on\{animation/.test(css) && /\.scr\.out/.test(css), 'screen in and out');
assert.ok(!css.includes('—'), 'no em dash');
// keyframes may only move transform and opacity
for (const k of css.matchAll(/@keyframes \w+\{([\s\S]*?)\}\}/g)) {
  const props = [...k[1].matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]);
  for (const p of props) assert.ok(p === 'transform' || p === 'opacity', 'keyframe animates only transform/opacity, got ' + p);
}
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
assert.ok(main.includes('motion.screen(id)') && main.includes('motion.num('), 'main.js hooks present');
console.log('19_transitions ok');
