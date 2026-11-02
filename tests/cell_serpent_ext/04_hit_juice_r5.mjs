// Hit juice round 5: chain-break sigh, per-weapon crit badges, power-up fly-in, digit atlas for HP numbers.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createDigitAtlas } = await import(join(root, 'digits.js'));

const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const R = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 7, stage: 4 });
const S = R.state, P = R.hj.pools;

// a streak of 6 that stops for a beat leaves a broken chain mark, once
S.chain.n = 0; S.chain.t = -9;
for (let i = 0; i < 6; i++) R.onEvent({ t: 'kill', x: 100 + i, y: 300, r: 30, kind: 'normal', skin: 'love' }, g);
assert.equal(S.chain.n, 6);
S.t = S.chain.t + 1.0;
R.draw(g, null, 1 / 60);
assert.ok(P.marks.some(m => m.k === 'sigh' && m.n === 6), 'sigh after a broken streak of 6');
const sighs = P.marks.filter(m => m.k === 'sigh').length;
R.draw(g, null, 1 / 60);
assert.equal(P.marks.filter(m => m.k === 'sigh').length, sighs, 'one sigh per streak');
for (let i = 0; i < 90; i++) R.draw(g, null, 1 / 60);
assert.equal(P.marks.filter(m => m.k === 'sigh').length, 0, 'the sigh ends');

// every weapon crit draws without throwing
for (const src of ['capsule', 'swab', 'daggers', 'tower', 'stick', 'needles', 'satellite', 'maw', 'puppy', 'encore', 'other'])
  R.onEvent({ t: 'hit', x: 100, y: 200, d: 50, crit: true, src, s: {} }, g);
for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);

// the digit atlas draws known glyphs and refuses others
let draws = 0;
const kit = { bake: (k, w, h) => ({ c: {}, w, h }) };
const ctx = { drawImage() { draws++; } };
const D = createDigitAtlas(kit);
assert.equal(D.draw(ctx, '1234', 10, 10, 30, '#fff', '#000'), true);
assert.equal(draws, 4, 'one blit per digit');
assert.equal(D.draw(ctx, '12x', 10, 10, 30, '#fff', '#000'), false, 'unknown glyph falls back');
assert.equal(createDigitAtlas(null).draw(ctx, '1', 0, 0, 20, '#fff', '#000'), false);
