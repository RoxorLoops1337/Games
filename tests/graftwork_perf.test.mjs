// Perf counters: fake-ctx op counts (never wall time) with generous budgets, plus the quality-tier policy.
import assert from 'node:assert/strict';
import { makeApp, frames, fakeCtx } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import combat from '../graftwork/ui/combat.js';
import title from '../graftwork/ui/title.js';
import map from '../graftwork/ui/map.js';
import { Fx, FX_OPTS, CAP_DESKTOP, CAP_MOBILE, defaultQuality } from '../graftwork/ui/fx.js';

// ---- quality policy ----
const mob = FX_OPTS.mobile;
FX_OPTS.mobile = true; assert.equal(defaultQuality(), 'low', 'mobile defaults to low');
FX_OPTS.mobile = false; assert.equal(defaultQuality(), 'high');
FX_OPTS.quality = 1; assert.equal(new Fx()._cap(), CAP_DESKTOP);
FX_OPTS.quality = 0.5; assert.ok(new Fx()._cap() <= CAP_DESKTOP / 2, 'low halves the particle cap');
FX_OPTS.mobile = true; FX_OPTS.quality = 1; assert.equal(new Fx()._cap(), CAP_MOBILE);
FX_OPTS.mobile = mob; FX_OPTS.quality = 1;

// ---- ops per frame ----
function counted() { // fake ctx that counts every call, gradients and shadow writes separately
  const st = { calls: 0, grads: 0, shadow: 0, draws: 0 };
  const grad = { addColorStop() {} };
  const o = {};
  const ctx = new Proxy(o, {
    get(t, k) {
      if (k === '__st') return st;
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => { st.grads++; st.calls++; return grad; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'drawImage') return () => { st.draws++; st.calls++; };
      return () => { st.calls++; };
    },
    set(t, k, v) { if (k === 'shadowBlur' && v) st.shadow++; t[k] = v; return true; },
  });
  return ctx;
}
async function measure(app, n = 30) {
  const ctx = counted(); app.ctx = ctx; app.canvas.getContext = () => ctx;
  frames(app, 5); const st = ctx.__st; st.calls = st.grads = st.shadow = st.draws = 0;
  frames(app, n);
  return { calls: st.calls / n, grads: st.grads / n, shadow: st.shadow / n, draws: st.draws / n };
}
const run = RUN.newRun({ hero: 'marrow', seed: 'perf' });
const app = await makeApp({ run, audio, meta: { settings: {} }, flow: { RUN, hasSave: () => false, route() {}, openDeck() {}, openSettings() {} } });
app.register('title', title); app.register('map', map); app.register('combat', combat);
const BUDGET = { title: 2500, map: 8000, combat: 7000 };
const GRAD = { title: 20, map: 40, combat: 100 };
const DRAWS = { title: 40, map: 30, combat: 70 }; // drawImage blits per frame
const SHADOW = { title: 6, map: 4, combat: 4 }; // shadowBlur writes per frame
app.go('title');
let r = await measure(app); console.log('perf title', JSON.stringify(r));
assert.ok(r.calls < BUDGET.title, 'title ctx calls/frame ' + r.calls); assert.ok(r.grads < GRAD.title, 'title gradients/frame ' + r.grads); assert.ok(r.draws < DRAWS.title, 'title blits/frame ' + r.draws); assert.ok(r.shadow < SHADOW.title, 'title shadowBlur/frame ' + r.shadow);
run.phase = 'map'; app.go('map', { run });
r = await measure(app); console.log('perf map', JSON.stringify(r));
assert.ok(r.calls < BUDGET.map, 'map ctx calls/frame ' + r.calls); assert.ok(r.grads < GRAD.map, 'map gradients/frame ' + r.grads); assert.ok(r.draws < DRAWS.map, 'map blits/frame ' + r.draws); assert.ok(r.shadow < SHADOW.map, 'map shadowBlur/frame ' + r.shadow);
run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['bedpan_slime', 'orderly', 'leech_jar', 'crutchling', 'fever_moth'] };
app.go('combat', { run });
frames(app, 200);
r = await measure(app); console.log('perf combat', JSON.stringify(r));
assert.ok(r.calls < BUDGET.combat, 'combat ctx calls/frame ' + r.calls); assert.ok(r.grads < GRAD.combat, 'combat gradients/frame ' + r.grads); assert.ok(r.draws < DRAWS.combat, 'combat blits/frame ' + r.draws); assert.ok(r.shadow < SHADOW.combat, 'combat shadowBlur/frame ' + r.shadow);
// particle load stays bounded by the cap
const fx = new Fx(); FX_OPTS.quality = 1;
for (let i = 0; i < 400; i++) fx.burst(100 + i, 200, ['ember', 'spark', 'hoard', 'blood'][i % 4], { n: 30 });
fx.update(0.016); const c = counted(); fx.draw(c);
assert.ok(fx.pool.n <= CAP_DESKTOP, 'live particles capped: ' + fx.pool.n);
assert.ok(c.__st.calls < CAP_DESKTOP * 6, 'fx.draw ops ' + c.__st.calls);
assert.equal(c.__st.shadow, 0, 'particles never use shadowBlur');
// ---- baked backgrounds: a still frame must not rebuild or re-run the static layers ----
{
  const { drawBackground } = await import('../graftwork/art/backgrounds.js');
  const bc = counted(); const o = { parallax: 0 };
  for (let i = 0; i < 6; i++) drawBackground(bc, 'ward', i * 0.016, o); // warm: layers built, bake made once the parallax holds still
  const st = bc.__st; st.calls = st.grads = st.draws = 0;
  for (let i = 0; i < 20; i++) drawBackground(bc, 'ward', 1 + i * 0.016, o);
  console.log('perf bg still', JSON.stringify({ calls: st.calls / 20, grads: st.grads / 20, draws: st.draws / 20 }));
  assert.ok(st.draws / 20 <= 16, 'still background blits/frame ' + st.draws / 20);
  assert.ok(st.grads / 20 <= 8, 'still background gradients/frame ' + st.grads / 20);
}
console.log('graftwork_perf: ok');
