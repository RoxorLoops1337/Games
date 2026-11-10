// Round 2 performance logic, all pure: text width cache, imageSmoothingQuality policy, card face LOD buckets and LRU,
// Ward room layer cache policy, governor calm screens; and what a frame of the title, the Ward and a fight costs in fake canvas calls.
// No wall time, no DOM (the real-browser numbers live in design/PERF.md).
import assert from 'node:assert/strict';
import { createTextMetrics } from '../graftwork/ui/text_metrics.js';
import { smoothingFor, SMOOTH, installSmartDraw } from '../graftwork/ui/smoothing.js';
import { idealBucket, chooseBucket, createFaceLru, BUCKETS, LEGACY, facePixels, BUILDS_PER_FRAME } from '../graftwork/art/face_lod.js';
import { bucketOf, pickLayer, evictFor, isMoving, MAX_BUCKETS, BUILDS_PER_FRAME as LB } from '../graftwork/ui/layer_cache.js';
import { createGovernor } from '../graftwork/ui/quality.js';
import { fakeCtx, installDom, makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import combat from '../graftwork/ui/combat.js';
import title from '../graftwork/ui/title.js';
import ward, { resetWardMem } from '../graftwork/ui/ward.js';
import { Fx, FX_OPTS, CAP_DESKTOP } from '../graftwork/ui/fx.js';

// ---- 1. text metrics: measure once per font + string, tabular digits share the cell of '0'
{
  let calls = 0; const W = { '0': 10, '1': 6, '2': 9, ',': 4, 'a': 8 };
  const tm = createTextMetrics((s) => { calls++; return s.length === 1 ? (W[s] ?? 7) : [...s].reduce((a, c) => a + (W[c] ?? 7), 0); });
  const f = 'bold 14px X|0px';
  assert.equal(tm.tab(f, '1,201'), 10 * 4 + 4, 'digits at the cell width, the comma at its own');
  const c1 = calls; for (let i = 0; i < 100; i++) tm.tab(f, '1,201');
  assert.equal(calls, c1, 'a repeated tabular string costs no measureText');
  assert.equal(tm.str(f, 'a1'), 14); const c2 = calls; tm.str(f, 'a1'); assert.equal(calls, c2);
  assert.equal(tm.cell(f), 10); assert.equal(tm.char(f, '1'), 6);
  const g = 'bold 20px X|0px'; tm.tab(g, '1,201'); assert.ok(calls > c2, 'another size never reuses a width');
  const h = 'bold 14px X|0.5px'; const c3 = calls; tm.str(h, 'a1'); assert.ok(calls > c3, 'letter spacing is part of the key');
  // worst case per frame in the shop / deck: 200 numbers of 4 chars at one font = 5 measures in total (cell + distinct chars), not 1600
  const tm2 = createTextMetrics((s) => { calls++; return s.length * 8; }); calls = 0;
  for (let n = 0; n < 200; n++) tm2.tab('f', String(1000 + (n % 40)));
  assert.ok(calls <= 12, 'tabular numbers cost a handful of measures, got ' + calls);
  // bounded
  for (let i = 0; i < 4000; i++) tm.str(f, 'x' + i); assert.ok(tm.size() < 4000, 'string table is capped');
}

// ---- 2. smoothing policy
{
  const keep0 = SMOOTH.upscale; SMOOTH.upscale = 0; assert.equal(smoothingFor(1280, 720, 1643, 924), 'low', 'with the upscale switch off a 1.28x upscale is bilinear'); SMOOTH.upscale = keep0;
  assert.equal(SMOOTH.upscale, 1.15, 'default: big backdrops keep the sharper bicubic filter when magnified');
  assert.equal(smoothingFor(1280, 720, 1643, 924), 'high', 'a 1280 px backdrop drawn 1.28x on a phone stays bicubic');
  assert.equal(smoothingFor(300, 300, 400, 400), 'low', 'a small source magnified is cheap and stays bilinear');
  assert.equal(smoothingFor(408, 543, 408, 543), 'low', '1:1');
  assert.equal(smoothingFor(512, 512, 300, 300), 'low', 'a 1.7x downscale: bilinear is an exact-ish box');
  assert.equal(smoothingFor(1024, 1024, 256, 256), 'high', 'a big source shrunk 4x gets the mipmapped filter');
  assert.equal(smoothingFor(512, 512, 256, 256), 'low', 'exactly 2x is not "more than 2x"');
  assert.equal(smoothingFor(512, 512, 255, 255), 'high');
  assert.equal(smoothingFor(64, 64, 8, 8), 'low', 'a tiny source cannot alias much: low');
  assert.equal(smoothingFor(0, 0, 10, 10), 'low'); assert.equal(smoothingFor(100, 100, 0, 0), 'low');
  assert.equal(smoothingFor(1024, 256, 1024, 100), 'high', 'the worse axis decides');
  assert.equal(smoothingFor(-512, 512, -100, 100), 'high', 'mirrored draws (negative sizes) count by magnitude');
  // installed on a context: the quality follows the call, 3-argument calls are untouched, small sources skip the transform read
  const log = []; let q = 'low';
  const ctx = { getTransform: () => ({ a: 2, b: 0 }), drawImage() { log.push(q); }, get imageSmoothingQuality() { return q; }, set imageSmoothingQuality(v) { q = v; } };
  assert.ok(installSmartDraw(ctx)); assert.ok(!installSmartDraw(ctx), 'installs once');
  ctx.drawImage({ width: 1024, height: 1024 }, 0, 0, 100, 100); // 100 logical * 2 = 200 device px: 5x down
  ctx.drawImage({ width: 1024, height: 1024 }, 0, 0, 1024, 1024, 0, 0, 100, 100);
  ctx.drawImage({ width: 1024, height: 1024 }, 0, 0, 400, 400);
  ctx.drawImage({ width: 1024, height: 1024 }, 0, 0);
  assert.deepEqual(log, ['high', 'high', 'low', 'low']);
  assert.ok(!installSmartDraw({ drawImage() {} }), 'a context without getTransform is left alone');
}

// ---- 3. (the dirty-frame logic that no screen used is gone: ui/frame_state.js now holds the frozen screens under a modal, tests/graftwork_frozen.test.mjs)

// ---- 4. card face LOD
{
  assert.equal(idealBucket(1.5), 1.5); assert.equal(idealBucket(0.64), 0.75, 'a 40 card deck grid (0.64 device px per card px) bakes at 0.75, not 1.5');
  assert.equal(idealBucket(1.28), 1.5); assert.equal(idealBucket(2.09), 2, 'a zoom card on a DPR 2 phone renders at device resolution');
  assert.equal(idealBucket(3.13), 3, 'and on DPR 3'); assert.equal(idealBucket(9), 4, 'capped'); assert.equal(idealBucket(NaN), LEGACY); assert.equal(idealBucket(0.01), 0.5);
  assert.ok(BUCKETS.every((b, i) => i === 0 || b > BUCKETS[i - 1]));
  // choose: exact hit, close neighbour reuse, build budget, fallbacks
  const have = (...bs) => (b) => bs.includes(b);
  assert.deepEqual(chooseBucket(1.28, have(1.5)), { bucket: 1.5, build: false });
  assert.deepEqual(chooseBucket(1.28, have()), { bucket: 1.5, build: true });
  assert.deepEqual(chooseBucket(0.64, have(1)), { bucket: 0.75, build: true }, 'a 1.0 face is 1.56x the need: too big to reuse');
  assert.deepEqual(chooseBucket(0.9, have(1.5)), { bucket: 1, build: true });
  assert.deepEqual(chooseBucket(0.9, have(1)), { bucket: 1, build: false });
  assert.deepEqual(chooseBucket(1.0, have(1.5), 0), { bucket: 1, build: true }, 'a 1.5 face is exactly 1.5x: over the reuse limit');
  assert.deepEqual(chooseBucket(1.1, have(1.5)), { bucket: 1.5, build: false }, 'a mild downscale is reused instead of building a size');
  assert.deepEqual(chooseBucket(0.64, have(1.5), BUILDS_PER_FRAME), { bucket: 1.5, build: false }, 'over the build budget a bigger cached face beats a hitch');
  assert.deepEqual(chooseBucket(2.0, have(1), BUILDS_PER_FRAME), { bucket: 1, build: false }, 'only smaller exists: soft but instant');
  assert.deepEqual(chooseBucket(2.0, have(), BUILDS_PER_FRAME), { bucket: 2, build: true }, 'nothing cached: it must be built');
  // key invalidation lives in cards.js faceKey (bucket suffix): two buckets of one card coexist
  const lru = createFaceLru({ max: 5, budget: 1e12, bigMax: 2 });
  const E = (b) => ({ px: facePixels(b), big: b >= 2 });
  lru.set('a@1.5', E(1.5)); lru.set('a@0.75', E(0.75)); assert.ok(lru.has('a@1.5') && lru.has('a@0.75'));
  lru.get('a@1.5'); for (let i = 0; i < 4; i++) lru.set('c' + i + '@1', E(1)); assert.ok(lru.has('a@1.5') === false || lru.size <= 5);
  assert.ok(lru.size <= 5, 'count cap');
  const big = createFaceLru({ max: 100, budget: 1e12, bigMax: 2 }); for (let i = 0; i < 5; i++) big.set('z' + i + '@3', E(3)); big.set('s@1', E(1));
  assert.equal(big.bigCount, 2, 'zoom sizes keep only the 2 most recent'); assert.ok(big.has('s@1') && big.has('z4@3') && big.has('z3@3') && !big.has('z0@3'));
  const px = createFaceLru({ max: 100, budget: facePixels(1.5) * 3, bigMax: 9 }); for (let i = 0; i < 10; i++) px.set('p' + i, E(1.5)); assert.equal(px.size, 3, 'pixel budget evicts least recently used first'); assert.ok(px.has('p9') && !px.has('p0'));
  assert.ok(facePixels(0.75) < facePixels(1.5) / 3, 'a deck sized face is a quarter of the old one');
  px.clear(); assert.equal(px.size, 0); assert.equal(px.pixels, 0);
}

// ---- 5. Ward room layer cache policy
{
  assert.equal(bucketOf(0.4), 0.5); assert.equal(bucketOf(1), 1); assert.equal(bucketOf(1.08), 1); assert.equal(bucketOf(1.2), 1.5); assert.equal(bucketOf(9), 4);
  assert.deepEqual(pickLayer(1, [1, 2]), { bucket: 1, build: false }, 'hit');
  assert.deepEqual(pickLayer(1.5, [], {}), { bucket: 1.5, build: true }, 'first sight builds');
  assert.deepEqual(pickLayer(1.5, [1], { moving: true }), { bucket: 1, build: false }, 'while the zoom eases, the neighbour already baked is drawn');
  assert.deepEqual(pickLayer(1.5, [1], { moving: false }), { bucket: 1.5, build: true }, 'once settled the ideal is baked');
  assert.deepEqual(pickLayer(1.5, [1], { built: LB }), { bucket: 1, build: false }, 'over the per-frame budget the neighbour is drawn');
  assert.deepEqual(pickLayer(1, [2], { moving: true }), { bucket: 2, build: false }, 'a larger neighbour is fine (downscale)');
  assert.deepEqual(pickLayer(0.5, [2], { moving: true }), { bucket: 0.5, build: true }, 'more than 2x away is not a stand-in');
  assert.deepEqual(pickLayer(1.5, [1, 2], { moving: true }), { bucket: 2, build: false }, 'ties go to the larger (sharper) one');
  assert.deepEqual(pickLayer(4, [0.5], { built: LB }), { bucket: 0.5, build: false }, 'over budget with only a far one: still no hitch');
  // easing across 1 -> 1.5 -> 2 and back bakes each bucket at most once
  const have = []; let builds = 0;
  for (const z of [1, 1.05, 1.2, 1.4, 1.7, 1.95, 1.7, 1.4, 1.2, 1.05, 1, 1.2, 1.7, 1.2, 1]) { const p = pickLayer(bucketOf(z), have, { moving: false }); if (p.build) { have.push(p.bucket); builds++; for (const e of evictFor(have, bucketOf(z))) have.splice(have.indexOf(e), 1); } }
  assert.ok(builds <= 3, 'a there-and-back zoom bakes 3 buckets at most, got ' + builds);
  assert.deepEqual(evictFor([0.5, 1, 1.5, 2], 1.5), [0.5], 'the farthest bucket goes first'); assert.deepEqual(evictFor([1, 2], 1), []);
  assert.ok(MAX_BUCKETS >= 3);
  assert.ok(isMoving(1, 1.01) && !isMoving(1, 1.001) && !isMoving(0, 1));
}

// ---- 6. governor: a calm screen idles at 30 fps like the title, an unmarked one never does
{
  const g = createGovernor(); g.input(0); g.enter(0);
  assert.equal(g.wanted(10000, 'ward', 'full', false, false, false), 0, 'not calm: every callback');
  assert.ok(g.wanted(10000, 'ward', 'full', false, false, true) > 30, 'calm and idle for 4 s: 30 fps');
  assert.equal(g.wanted(1000, 'ward', 'full', false, false, true), 0, 'calm but recent: full rate');
  g.input(9990); assert.equal(g.wanted(10000, 'ward', 'full', false, false, true), 0, 'input wakes it');
  assert.equal(g.wanted(1, 'title', 'full', true), Infinity, 'hidden tab runs nothing');
  assert.ok(g.shouldRun(100000, 0, 'ward', 'full', false, false), 'every callback runs when not calm');
}

// ---- 7. drawCard picks the face bucket from the real transform scale and keeps the sizes apart (real art module, fake canvases)
{
  installDom();
  const C = await import('../graftwork/art/cards.js');
  const { CARD_LIST } = await import('../graftwork/data/index.js');
  const { cardSpec } = await import('../graftwork/engine/cards.js');
  // a context that tracks the uniform scale like a real one (the base fake has no transform)
  const mk = (px) => { const g = fakeCtx(); const st = [px]; let sc = px; g.save = () => { st.push(sc); }; g.restore = () => { sc = st.pop() ?? px; }; g.scale = (k) => { sc *= k; }; g.getTransform = () => ({ a: sc, b: 0 }); return g; };
  C.clearCardCache();
  const spec = cardSpec({ uid: 1, id: CARD_LIST.find((c) => c.type === 'attack' && c.rarity === 'common').id, grafts: [], up: 0 });
  const s0 = C.cardCacheStats();
  C.cardFrame(); C.drawCard(mk(1.28), spec, 0, 0, { scale: 1 }); // hand size on a DPR 2 phone: 1.28 device px per card px -> bucket 1.5
  C.cardFrame(); C.drawCard(mk(1.28), spec, 0, 0, { scale: 0.5 }); // deck grid: 0.64 -> bucket 0.75
  C.cardFrame(); C.drawCard(mk(1.28), spec, 0, 0, { scale: 1.63 }); // zoom: 2.09 -> bucket 2 (a big one)
  let st = C.cardCacheStats();
  assert.equal(st.faces - s0.faces, 3, 'three sizes of one card are three cached faces');
  assert.equal(st.big, 1, 'only the zoom size is a big face');
  const b0 = st.builds; C.cardFrame(); C.drawCard(mk(1.28), spec, 0, 0, { scale: 0.5 }); C.drawCard(mk(1.28), spec, 0, 0, { scale: 1 });
  assert.equal(C.cardCacheStats().builds, b0, 'redrawing known sizes builds nothing');
  // a context without getTransform keeps the one legacy size
  C.clearCardCache(); const b1 = C.cardCacheStats().builds; C.drawCard(fakeCtx(), spec, 0, 0, { scale: 0.5 }); C.drawCard(fakeCtx(), spec, 0, 0, { scale: 1.6 });
  assert.equal(C.cardCacheStats().builds - b1, 1, 'fake contexts share the 1.5 face');
  // build budget: a burst of new sizes in one frame builds at most BUILDS_PER_FRAME, the rest reuse what is cached
  C.clearCardCache(); C.cardFrame(); C.drawCard(mk(1.28), spec, 0, 0, { scale: 1 });
  const b2 = C.cardCacheStats().builds; C.cardFrame(); for (const sc of [0.3, 0.45, 0.7, 1.6, 2.4]) C.drawCard(mk(1.28), spec, 0, 0, { scale: sc });
  assert.ok(C.cardCacheStats().builds - b2 <= 2, 'at most 2 faces built in one frame, got ' + (C.cardCacheStats().builds - b2));
}

// ---- 8. the frame loop draws the top screen every tick: nothing is skipped (the still() hook is gone with the dirty-frame logic)
{
  const app = await makeApp({});
  let draws = 0;
  app.register('plain', { enter() {}, leave() {}, update() {}, draw() { draws++; }, still() { return true; }, key() {} });
  app.go('plain'); draws = 0; frames(app, 30); assert.equal(draws, 30, 'drawn every tick');
}

// ---- 9. app.text / app.measure go through the width cache (the shop and deck screens drew 140 to 280 measureText calls per frame)
{
  const app = await makeApp({}); let n = 0; const m0 = app.ctx.measureText; app.ctx.measureText = (t) => { n++; return m0(t); };
  n = 0;
  for (let i = 0; i < 100; i++) { app.text('1,234 gold', 100, 100, { size: 16, tab: true, align: 'right' }); app.text('Cost 12', 100, 130, { size: 16, tab: true, bold: true }); app.measure('Draw pile 40', 14, { ui: true, tab: true }); app.measure('Deck', 14, { ui: true }); }
  assert.ok(n < 60, 'repeated tabular text and measures hit the cache, measureText ran ' + n + ' times for 400 calls');
  const after = n; for (let i = 0; i < 100; i++) app.text('1,234 gold', 100, 100, { size: 16, tab: true, align: 'right' }); assert.equal(n, after, 'a warm cache measures nothing');
}

// ---- 10. what a frame costs, counted in fake canvas calls (never wall time): the title, the Ward and a five enemy fight stay within budget, particles are capped, a still background re-runs nothing ----
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
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'perf' });
  const app = await makeApp({ run, audio, meta: { settings: {} }, flow: { RUN, hasSave: () => false, route() {}, openDeck() {}, openSettings() {} } });
  app.register('title', title); app.register('ward', ward); app.register('combat', combat);
  const BUDGET = { title: 2500, ward: 5500, combat: 7000 }; // ward: measured 3582 (first morning, fallback art)
  const GRAD = { title: 20, ward: 60, combat: 100 };
  const DRAWS = { title: 40, ward: 45, combat: 70 }; // drawImage blits per frame
  const SHADOW = { title: 6, ward: 5, combat: 4 }; // shadowBlur writes per frame
  app.go('title');
  let r = await measure(app); console.log('perf title', JSON.stringify(r));
  assert.ok(r.calls < BUDGET.title, 'title ctx calls/frame ' + r.calls); assert.ok(r.grads < GRAD.title, 'title gradients/frame ' + r.grads); assert.ok(r.draws < DRAWS.title, 'title blits/frame ' + r.draws); assert.ok(r.shadow < SHADOW.title, 'title shadowBlur/frame ' + r.shadow);
  // the Ward on the first morning of a run (five plans in hand, the pre-built rooms, the banner gone), in headless fallback art
  assert.equal(run.phase, 'ward'); resetWardMem(); app.go('ward', { run }); frames(app, 200);
  r = await measure(app); console.log('perf ward', JSON.stringify(r));
  assert.ok(r.calls < BUDGET.ward, 'ward ctx calls/frame ' + r.calls); assert.ok(r.grads < GRAD.ward, 'ward gradients/frame ' + r.grads); assert.ok(r.draws < DRAWS.ward, 'ward blits/frame ' + r.draws); assert.ok(r.shadow < SHADOW.ward, 'ward shadowBlur/frame ' + r.shadow);
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
}
console.log('graftwork_perf2: ok');
