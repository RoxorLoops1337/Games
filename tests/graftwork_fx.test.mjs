// Fx: API compatibility, pool caps, allocation stability, counter merge, determinism.
import assert from 'node:assert/strict';
import { installDom, fakeCtx } from './graftwork_lib.mjs';
installDom();
const { Fx, FX_OPTS, CAP_DESKTOP, CAP_MOBILE, CAP_ADD, CAP_TRAIL } = await import('../graftwork/ui/fx.js');

// 1. old API still works
const fx = new Fx(); const ctx = fakeCtx();
for (const m of ['emit', 'burst', 'float', 'bolt', 'ring', 'shake', 'hitstop', 'slowmo', 'flash', 'update', 'shakeOffset', 'draw', 'drawFlash', 'floatCounter', 'shakeDir', 'zoom', 'zoomScale', 'sparkLine']) assert.equal(typeof fx[m], 'function', m);
assert.ok('shake' in FX_OPTS && 'reduced' in FX_OPTS);
const kinds = ['spark', 'ember', 'blood', 'dust', 'shard', 'glass', 'coin', 'flake', 'zap', 'heal', 'block', 'echo', 'gild', 'hoard', 'rust', 'static', 'gilded', 'poisonTick', 'burnTick', 'ash'];
for (const k of kinds) fx.burst(300, 300, k);
fx.emit({ x: 5, y: 5, n: 3, colors: ['#fff'], angle: 0, spread: 1, shape: 'coin' });
fx.float('12', 10, 10, { color: '#f00', size: 20, big: true, life: 1 }); fx.bolt(0, 0, 100, 100); fx.ring(50, 50); fx.flash('#fff', 0.3); fx.sparkLine(0, 0, 200, 80, '#ff0');
fx.shake(0.5); fx.shakeDir(0.3, 0.4); fx.zoom(0.05); fx.hitstop(50); fx.slowmo(0.5, 200);
assert.equal(fx.update(0.016), 0); // hit-stopped
for (let i = 0; i < 20; i++) fx.update(0.016);
const so = fx.shakeOffset(); assert.ok(Number.isFinite(so.x) && Number.isFinite(so.y) && Number.isFinite(so.r));
assert.ok(fx.zoomScale() >= 1);
fx.draw(ctx); fx.drawFlash(ctx, 1280, 720);
for (let i = 0; i < 400; i++) fx.update(0.05); // all expire
assert.equal(fx.count, 0); assert.equal(fx.floats.length, 0); assert.equal(fx.bolts.length, 0); assert.equal(fx.rings.length, 0); assert.equal(fx.flashes.length, 0);
assert.equal(fx.zoomScale(), 1);

// 2. caps under a 10,000 emit stress + no allocation growth (typed array identity)
{
  const f = new Fx(); f.emit({ x: 0, y: 0, n: 1 });
  const ids = Object.entries(f.pool).filter(([, v]) => ArrayBuffer.isView(v)); const bufs = ids.map(([, v]) => v.buffer);
  let maxN = 0, maxA = 0, maxT = 0;
  for (let i = 0; i < 10000; i++) {
    const k = kinds[i % kinds.length]; f.burst(640, 360, k, { n: 40 });
    if (i % 10 === 0) { f.update(1 / 60); f.draw(ctx); }
    maxN = Math.max(maxN, f.pool.n); maxA = Math.max(maxA, f.pool.addN); maxT = Math.max(maxT, f.pool.trailN);
  }
  assert.ok(maxN <= CAP_DESKTOP, 'total cap ' + maxN); assert.ok(maxA <= CAP_ADD, 'additive cap ' + maxA); assert.ok(maxT <= CAP_TRAIL, 'trail cap ' + maxT);
  assert.ok(f.floats.length < 5 && f.bolts.length < 400 && f.rings.length < 400, 'object lists stay bounded');
  ids.forEach(([k, v], i) => assert.equal(f.pool[k].buffer, bufs[i], 'array ' + k + ' reallocated'));
  // counters stay exact after swap-remove churn
  let a = 0, t = 0; const P = f.pool;
  for (let i = 0; i < 400; i++) f.update(0.05);
  assert.equal(P.n, 0); assert.equal(P.addN, 0); assert.equal(P.trailN, 0);
  for (let i = 0; i < 300; i++) f.burst(1, 1, 'spark');
  for (let i = 0; i < 5; i++) f.update(0.1);
  for (let i = 0; i < P.n; i++) { if (P.flags[i] & 1) a++; if (P.flags[i] & 4) t++; }
  assert.equal(a, P.addN); assert.equal(t, P.trailN);
  FX_OPTS.mobile = true; const m = new Fx(); for (let i = 0; i < 100; i++) m.burst(0, 0, 'dust', { n: 40 }); assert.equal(m.pool.n, CAP_MOBILE); FX_OPTS.mobile = false;
}

// 3. reduced motion halves counts and disables shake/stop; quality scales
{
  const a = new Fx(); a.emit({ x: 0, y: 0, n: 20 }); const full = a.count;
  FX_OPTS.reduced = true; const b = new Fx(); b.emit({ x: 0, y: 0, n: 20 }); b.shake(1); b.shakeDir(0, 1); b.hitstop(100); b.slowmo(0.2, 100); b.zoom(0.1);
  assert.equal(b.count, full / 2); assert.equal(b.trauma, 0); assert.equal(b.stop, 0); assert.equal(b.slow, 0); assert.equal(b.zoomScale(), 1);
  FX_OPTS.reduced = false; FX_OPTS.quality = 0.5; const c = new Fx(); c.emit({ x: 0, y: 0, n: 20 }); assert.equal(c.count, 10); FX_OPTS.quality = 1;
  FX_OPTS.shake = false; const d = new Fx(); d.shake(1); assert.equal(d.trauma, 0); FX_OPTS.shake = true;
}

// 4. counter merge logic
{
  const f = new Fx();
  const c1 = f.floatCounter('e1', 100, 100, 7); f.update(0.1);
  const c2 = f.floatCounter('e1', 100, 100, 7); f.update(0.1);
  const c3 = f.floatCounter('e1', 100, 100, 7);
  assert.equal(c1, c2); assert.equal(c2, c3); assert.equal(f.floats.length, 1); assert.equal(c1.total, 21); assert.equal(c1.hits, 3);
  assert.ok(c1.size > c1.baseSize, 'grows per hit');
  f.floatCounter('other', 10, 10, 3); assert.equal(f.floats.length, 2, 'different key does not merge');
  for (let i = 0; i < 30; i++) f.update(0.02); // 600 ms of quiet: finalises
  assert.ok(c1.fin, 'finalises after 350 ms'); assert.equal(c1.shown, 21);
  const c4 = f.floatCounter('e1', 100, 100, 5); assert.notEqual(c4, c1, 'new window starts a new number');
  const c5 = f.floatCounter('z', 0, 0, 4, { last: true }); assert.ok(c5.fin);
  f.draw(ctx);
  for (let i = 0; i < 200; i++) f.update(0.02); assert.equal(f.floats.length, 0);
}

// 5. frame-rate independent floats (final position within 2 px)
{
  const run = (fps) => { const f = new Fx(); const fl = f.float('5', 0, 500, { vy: -80, life: 1.0 }); const n = Math.round(0.8 * fps); for (let i = 0; i < n; i++) f.update(1 / fps); return fl.y; };
  const y30 = run(30), y60 = run(60), y144 = run(144);
  assert.ok(Math.abs(y30 - y60) < 2 && Math.abs(y144 - y60) < 2 && Math.abs(y30 - y144) < 2, `floats ${y30} ${y60} ${y144}`);
  assert.ok(y60 < 500);
}

// 6. directional shake follows its axis
{
  const f = new Fx(); f.shakeDir(0, 0.8); let sx = 0, sy = 0;
  for (let i = 0; i < 40; i++) { f.update(1 / 60); const o = f.shakeOffset(); sx += Math.abs(o.x); sy += Math.abs(o.y); }
  assert.ok(sx > sy * 1.5, `horizontal dominance ${sx} ${sy}`);
}

console.log('graftwork_fx: ok');
