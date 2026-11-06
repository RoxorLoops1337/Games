// Hit juice round 6: sigh sound and pet slump, power-up icon flying to its chip, readable damage numbers, kill pop per weapon.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));

const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const R = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 7, stage: 4 });
const S = R.state, P = R.hj.pools;

// a broken streak queues the sigh sound once and starts the pet slump
S.chain.n = 0; S.chain.t = -9;
for (let i = 0; i < 6; i++) R.onEvent({ t: 'kill', x: 100 + i, y: 300, r: 30, kind: 'normal', skin: 'love' }, g);
R.takeSounds();
S.t = S.chain.t + 1.0;
R.draw(g, null, 1 / 60);
assert.ok(R.takeSounds().includes('sigh'), 'sigh sound queued');
assert.ok(S.slump && S.slump.n === 6, 'pets slump');
R.draw(g, null, 1 / 60);
assert.ok(!R.takeSounds().includes('sigh'), 'one sigh per streak');
for (let i = 0; i < 90; i++) R.draw(g, null, 1 / 60);

// the power-up icon flies on from the duo to the RAGE chip and the chip pops when it lands
R.onEvent({ t: 'power', kind: 'rage', x: g.p.x, y: g.p.y - 200 }, g);
let seen = false;
for (let i = 0; i < 80; i++) { R.draw(g, null, 1 / 60); if (P.chipfly.length) seen = true; }
assert.ok(seen, 'chip flight happened');
assert.ok(S.land.rage > -9, 'chip landed');
assert.equal(P.chipfly.length, 0);

// damage numbers are never tiny and a hit adds one
const n0 = S.floats.length;
R.onEvent({ t: 'hit', x: 200, y: 300, d: 2, crit: false, src: 'capsule', s: { k: 1 } }, g);
assert.ok(S.floats.length > n0 && S.floats[S.floats.length - 1].size >= 21, 'readable size');

// every weapon gives the kill its own pop
for (const src of ['swab', 'daggers', 'tower', 'stick', 'needles', 'satellite', 'maw']) {
  P.marks.length = 0; S.t += 1;
  R.onEvent({ t: 'hit', x: 100, y: 300, d: 5, src, s: {} }, g);
  const before = P.marks.length;
  R.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'normal', skin: 'love' }, g);
  assert.ok(P.marks.length - before >= 4, 'kill pop for ' + src);
}
for (let i = 0; i < 60; i++) R.draw(g, null, 1 / 60);
