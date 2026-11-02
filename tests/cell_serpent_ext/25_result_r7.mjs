// 25 result round 7: the hub pills count up as each result chip lands, RETRY flies chips and the energy spark, the win sunburst.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const U = await import(join(root, 'result_ux.js'));
const main = readFileSync(join(root, 'main.js'), 'utf8'), html = readFileSync(join(root, 'index.html'), 'utf8');

// targets sit inside the screen at every phone size
for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
  const t = U.retryTargets(w, h);
  assert.ok(t.beats.x > 0 && t.beats.x < w && t.beats.y >= 0 && t.beats.y < h / 3, 'beats target on screen ' + w);
  assert.ok(t.energy.x > 0 && t.energy.y >= 0 && t.energy.y < h / 3, 'energy target on screen ' + w);
}
// no DOM or reduced motion: nothing flies and nothing throws
assert.equal(U.retryFly(null, [], false), 0);
assert.equal(U.retryFly({ getBoundingClientRect: () => ({}), animate() {} }, [], true), 0);
// wiring
assert.ok(/gigFlies\(fl\.map\(it => \(\{ snap: it\.s, kind: it\.kind, amt: it\.n \}\)\), 420\); openHub\('Battle'\)/.test(main), 'hold the pills before the hub opens');
assert.ok(/retryFly\(\$\('rRetry'\)/.test(main), 'retry flight wired');
assert.ok(/classList\.toggle\('won', !!r\.won\)/.test(main), 'won class');
assert.ok(/#result\.won::before/.test(html) && /r7Rays/.test(html), 'sunburst css');
assert.ok(!main.includes(String.fromCharCode(8212)) && !html.includes(String.fromCharCode(8212)), 'no em dash');
console.log('25_result_r7 ok');
