// Hit juice round 9: impact and pop looks for Dove Squad, Duckling Splash, puppy, bell and Encore, note bursts for the capsule,
// chips knocked off by every hit and the chain milestone shockwave.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const j9 = await import(join(root, 'hit_juice9.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const R = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 9, stage: 4 });
const P = R.hj.pools;

// the drawing helper handles every new kind without throwing, at every age
const glow = () => {};
for (const k of j9.NEW_KINDS) for (const age of [0, 0.3, 0.99]) j9.drawMark9(stubCtx(), { k, x: 0, y: 0, r: 30, vx: 40, vy: -40, rot: 0.4, col: '#fff', seed: 2, t: age * 0.5, n: 4 }, age, 1 - age, glow);
assert.ok(j9.isNewKind('paw') && !j9.isNewKind('ring'), 'new kinds are told apart from the old ones');
for (const w of ['capsule', 'swab', 'daggers', 'tower', 'dragon', 'needles', 'stick', 'bubble', 'satellite', 'maw', 'puppy', 'bell', 'encore']) assert.ok(/^#/.test(j9.CHIP_COL[w]), 'chip colour for ' + w);

const settle = () => { for (let i = 0; i < 200; i++) R.draw(g, null, 1 / 60); };
// each weapon that had no look now leaves its own mark where it lands
const want = { dragon: 'feather', bubble: 'bpop', puppy: 'paw', bell: 'ding', encore: 'twink' };
for (const [src, kind] of Object.entries(want)) {
  settle();
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 5, crit: false, src, s: {} }, g);
  assert.ok(P.marks.some(m => m.k === kind), src + ' impact leaves a ' + kind);
  assert.ok(P.marks.some(m => m.k === 'chip'), src + ' hit knocks chips off');
}
// a crit knocks off more chips than a plain hit
settle(); R.onEvent({ t: 'hit', x: 300, y: 400, d: 5, crit: false, src: 'swab', s: {} }, g); const plain = P.marks.filter(m => m.k === 'chip').length;
settle(); R.onEvent({ t: 'hit', x: 300, y: 400, d: 9, crit: true, src: 'swab', s: {} }, g); const crit = P.marks.filter(m => m.k === 'chip').length;
assert.ok(crit > plain && plain >= 2, 'crit chips ' + crit + ' vs plain ' + plain);
// kill pops: the weapon that landed the blow decides how the cell bursts
const pops = { dragon: 'feather', bubble: 'bpop', puppy: 'paw', bell: 'ding', encore: 'twink', capsule: 'note' };
for (const [src, kind] of Object.entries(pops)) {
  settle();
  R.onEvent({ t: 'hit', x: 200, y: 300, d: 5, crit: false, src, s: {} }, g);
  R.onEvent({ t: 'kill', x: 200, y: 300, r: 30, kind: 'normal', skin: 'love' }, g);
  assert.ok(P.marks.some(m => m.k === kind), src + ' kill pop has a ' + kind);
}
// chips never crowd the pool: with it nearly full no more are added
settle();
for (let i = 0; i < 60; i++) R.onEvent({ t: 'hit', x: 100 + i * 5, y: 300, d: 5, crit: true, src: i % 2 ? 'bubble' : 'dragon', s: {} }, g);
assert.ok(P.marks.length <= 44, 'marks stay capped: ' + P.marks.length);
// every fifth kill of a chain sends a shockwave
settle();
for (let i = 0; i < 4; i++) R.onEvent({ t: 'kill', x: 100 + i * 20, y: 400, r: 30, kind: 'normal', skin: 'love' }, g);
assert.ok(!P.marks.some(m => m.k === 'shock'), 'no shockwave before the 5th kill');
R.onEvent({ t: 'kill', x: 220, y: 400, r: 30, kind: 'normal', skin: 'love' }, g);
assert.ok(P.marks.some(m => m.k === 'shock'), 'the 5th kill sends a shockwave');
// everything draws and then ends cleanly
for (let i = 0; i < 12; i++) R.draw(g, null, 1 / 60);
settle();
assert.equal(P.marks.length, 0, 'marks end');
