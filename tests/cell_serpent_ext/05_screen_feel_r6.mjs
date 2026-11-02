// Round 6 screen feel: danger heartbeat, revive return moment, boss defeat blasts, new-best celebration (no DOM needed).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const { createFeel6, heartbeat } = await import(join(dir, 'feel6.js'));
const { celebrateBest, stopBest } = await import(join(dir, 'best_fx.js'));

// heartbeat is 0..1 and peaks twice per cycle
let max = 0, peaks = 0, prev = 0, rising = false;
for (let i = 0; i <= 200; i++) { const v = heartbeat(i / 200, 1); assert.ok(v >= 0 && v <= 1); max = Math.max(max, v); if (v > prev && !rising) rising = true; if (v < prev && rising) { rising = false; if (prev > 0.3) peaks++; } prev = v; }
assert.ok(max > 0.9 && peaks === 2, 'lub-dub: two beats per cycle');

const calls = { edges: 0, vignette: 0, ring: 0, burst: 0, draw: 0, slow: [], conf: 0 };
const ctx = new Proxy({}, { get: (t, k) => (k === 'drawImage' ? () => calls.draw++ : () => {}), set: () => true });
const S = { t: 0, trauma: 0, flash: 0, flashCol: '' }, sounds = [];
const mk = calm => createFeel6({ ctx, W: 1080, H: 1920, kit: null, S, OPT: { reduceMotion: calm }, ring: () => calls.ring++, burst: () => calls.burst++, text() {}, glow() {}, edges: () => calls.edges++, vignette: () => calls.vignette++, slow: (k, d) => calls.slow.push([k, d]), confetti: () => calls.conf++, sounds });

const f = mk(false);
f.draw({ phase: 'play', danger: 0 }); assert.equal(calls.edges, 0, 'no warning when the snake is far');
f.draw({ phase: 'play', danger: 0.8 }); assert.ok(calls.edges > 0 && calls.vignette > 0, 'edges and vignette near the line');
f.draw({ phase: 'dead', danger: 0.9 }); const e2 = calls.edges; f.draw({ phase: 'dead', danger: 0.9 }); assert.equal(calls.edges, e2, 'no heartbeat once the run is over');

f.onEvent({ t: 'revive' }, { p: { x: 540, y: 1600 } });
assert.ok(f.state.rev && calls.ring >= 2 && calls.slow.length === 1 && sounds.length === 1, 'revive starts the return moment');
for (let i = 0; i < 120; i++) { f.update(1 / 60, {}); f.draw({ phase: 'play', danger: 0 }); }
assert.equal(f.state.rev, null, 'revive moment ends by itself');

const b0 = calls.burst;
f.onEvent({ t: 'kill', head: true, boss: true, x: 540, y: 600 }, {});
assert.ok(f.state.blasts.length >= 6 && calls.slow.length === 2, 'boss head kill queues a chain of blasts');
for (let i = 0; i < 100; i++) { f.update(1 / 60, {}); f.draw({ phase: 'won' }); }
assert.ok(calls.burst - b0 >= 7 && calls.conf >= 1 && f.state.bossT === 0, 'blasts all fire, finale confetti, then it resets');
f.onEvent({ t: 'kill', head: true, boss: false, x: 1, y: 1 }, {}); assert.equal(f.state.blasts.length, 0, 'plain heads do not trigger it');

// reduce motion: still a calm danger tint, no shake, no blasts
const c = mk(true), tr = S.trauma; c.draw({ phase: 'play', danger: 0.9 }); assert.equal(S.trauma, tr);
c.onEvent({ t: 'kill', head: true, boss: true, x: 1, y: 1 }, {}); assert.equal(c.state.blasts.length, 0);

// celebrateBest is safe without a DOM
assert.doesNotThrow(() => { stopBest(); });
const src = readFileSync(join(dir, 'main.js'), 'utf8'), fx = readFileSync(join(dir, 'screenfx.js'), 'utf8');
assert.ok(/celebrateBest\(\$\('rRibbon'\)/.test(src) && /feel6\(\)\.onEvent/.test(fx), 'wired in');
for (const n of ['feel6.js', 'best_fx.js']) assert.ok(!readFileSync(join(dir, n), 'utf8').includes('—'), 'no em dash in ' + n);
void celebrateBest;
