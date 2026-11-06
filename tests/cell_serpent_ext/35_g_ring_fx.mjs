// Batch 12 (g): hit juice in circle stages: muzzle flash, volley fan, trails and impact marks follow the aim; lanes keep the old upward look.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const fx = await import(join(root, 'hit_fx_b11.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const mk = () => createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const gr = sim.createGame({ seed: 3, stage: 6 }), gl = sim.createGame({ seed: 3, stage: 4 });
assert.ok(gr.ring && !gl.ring, 'stage 6 is a ring stage, stage 4 a lane');
const warm = (R, g) => { for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60); };

{   // a volley in a ring stage: the fan, the flash and the muzzle all point along the aim
  const R = mk(), P = R.hj.pools; warm(R, gr); gr.p.aim = Math.PI * 0.75;
  R.onEvent({ t: 'shoot' }, gr); R.onEvent({ t: 'dragon' }, gr);
  const v = P.marks.find(m => m.k === 'volley'); assert.ok(v, 'a volley mark exists'); assert.ok(Math.abs(v.rot - gr.p.aim) < 1e-9);
  assert.ok(fx.isKind11('volley'));
  assert.ok(P.flashes.length >= 1 && Math.abs(P.flashes[0].a - (gr.p.aim + Math.PI / 2)) < 1e-9, 'the flash is rotated with the aim');
  assert.ok(P.flashes[0].y > gr.p.y, 'aimed down-left: the flash sits below the duo');
  const mz = P.marks.find(m => m.k === 'muz'); assert.ok(mz && Math.abs(mz.rot - (gr.p.aim + Math.PI / 2)) < 1e-9 && mz.x < gr.p.x && mz.y > gr.p.y, 'the muzzle puff sits on the aim');
  for (let i = 0; i < 40; i++) R.draw(gr, null, 1 / 60);
  assert.equal(P.marks.filter(m => m.k === 'volley').length, 0, 'the volley expires');
}
{   // lanes: unchanged (flash straight above, no volley, muzzle unrotated)
  const R = mk(), P = R.hj.pools; warm(R, gl);
  R.onEvent({ t: 'shoot' }, gl); R.onEvent({ t: 'needles' }, gl);
  assert.ok(!P.marks.some(m => m.k === 'volley'), 'no volley in a lane');
  assert.equal(P.flashes[0].a, 0); assert.equal(P.flashes[0].y, gl.p.y - 40);
  assert.equal(P.marks.find(m => m.k === 'muz').rot, 0);
}
{   // trails drop off BEHIND a sideways bullet
  const R = mk(), P = R.hj.pools; warm(R, gr);
  const b = { x: 300, y: 300, vx: 600, vy: 0, kind: 'pill', crit: false, r: 6 };
  for (let i = 0; i < 80; i++) R.hj.bullets([b], 1 / 30);
  assert.ok(P.trail.length > 0 && P.trail.every(q => q.x < b.x && Math.abs(q.vy) < 45), 'sparks sit left of a bullet flying right');
  const n = { x: 300, y: 300, vx: 0, vy: 500, kind: 'needle', crit: false, r: 4 }; P.trail.length = 0;
  for (let i = 0; i < 80; i++) R.hj.bullets([n], 1 / 30);
  assert.ok(P.trail.length > 0 && P.trail.every(q => q.y < n.y && q.vy < 0), 'needle streaks trail above a downward needle');
}
{   // impacts: a needle ping fans along the outward direction in a ring, the old way in a lane
  const R = mk(), P = R.hj.pools; warm(R, gr);
  R.onEvent({ t: 'hit', x: gr.p.x + 100, y: gr.p.y, d: 3, src: 'needles', s: {} }, gr);
  const pg = P.marks.filter(m => m.k === 'ping'); assert.equal(pg.length, 3);
  assert.ok(Math.abs(pg[1].rot - Math.PI / 2) < 1e-9, 'the middle spike points right (outward)');
  const L = mk(), PL = L.hj.pools; warm(L, gl);
  L.onEvent({ t: 'hit', x: 200, y: 300, d: 3, src: 'needles', s: {} }, gl);
  assert.ok(Math.abs(PL.marks.filter(m => m.k === 'ping')[1].rot + Math.PI / 2) < 1e-9, 'lane keeps its old angle');
}
{   // the volley draws with strokes only (no gradients)
  const calls = {}; const rec = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; }), set: (t, k, v) => { t[k] = v; return true; } });
  for (const kk of [0.05, 0.4, 0.9]) fx.drawMark11(rec, { k: 'volley', r: 120, t: kk * 0.26, seed: 0, rot: 1, col: '#fff' }, kk, 1 - kk, () => {});
  assert.ok(calls.stroke >= 3 && !calls.createLinearGradient && !calls.createRadialGradient);
}
console.log('35_g_ring_fx ok');
