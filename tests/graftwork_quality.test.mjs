// Quality policy: the tier controller (hysteresis, no flapping), the rAF governor (idle 30 fps, hidden pause), the Graphics setting
// (persisted, cleaned), decoded-image eviction and the recipe-scoped kit settle. Pure logic, no wall time.
import assert from 'node:assert/strict';
import { createQuality, createGovernor, TIER_SPEC, TIERS, GRAPHICS, cleanGraphics, Q, IDLE_AFTER_MS } from '../graftwork/ui/quality.js';
import { createAssets } from '../graftwork/ui/assets.js';
import { makeApp, frames } from './graftwork_lib.mjs';

// feed n frames of ms each, advancing a clock; returns the clock
function feed(q, n, ms, clock, expected = 16.7) { for (let i = 0; i < n; i++) { clock += ms; q.sample(ms, expected, clock); } return clock; }

// ---- 1. defaults, mode mapping, cleaning
assert.deepEqual(GRAPHICS, ['auto', 'high', 'low']);
assert.equal(cleanGraphics(undefined), 'auto'); assert.equal(cleanGraphics('ultra'), 'auto'); assert.equal(cleanGraphics('low'), 'low');
assert.equal(createQuality().mode, 'auto'); assert.equal(createQuality().tier, 'full');
assert.equal(createQuality({ mode: 'high' }).tier, 'full'); assert.equal(createQuality({ mode: 'low' }).tier, 'minimal');
{ const q = createQuality({ mode: 'high' }); let c = feed(q, 600, 80, 0); assert.equal(q.tier, 'full', 'High never degrades'); q.setMode('low', c); assert.equal(q.tier, 'minimal'); q.setMode('auto', c); assert.equal(q.tier, 'full', 'back to Auto starts at full'); }
assert.ok(TIER_SPEC.full.post && !TIER_SPEC.lite.post && !TIER_SPEC.minimal.post, 'only full runs the WebGL post');
assert.ok(!TIER_SPEC.lite.motes && TIER_SPEC.lite.sceneEvery === 3 && TIER_SPEC.full.sceneEvery === 1, 'lite: no motes, scene every third frame');
assert.ok(TIER_SPEC.full.dprCap > TIER_SPEC.lite.dprCap && TIER_SPEC.lite.dprCap > TIER_SPEC.minimal.dprCap, 'backing store shrinks with the tier');

// ---- 2. a smooth device never degrades (60 and 120 Hz), however long it runs
for (const ms of [16.7, 8.3, 20]) { const q = createQuality(); feed(q, 20000, ms, 0); assert.equal(q.tier, 'full', ms + ' ms frames stay full'); assert.equal(q.drops, 0); }
// occasional hitches (1 in 25 frames at 60 ms) are not a verdict
{ const q = createQuality(); let c = 0; for (let i = 0; i < 6000; i++) { const ms = i % 25 === 0 ? 60 : 16.7; c += ms; q.sample(ms, 16.7, c); } assert.equal(q.tier, 'full', 'rare hitches keep full'); }
// stalls (hidden tab, debugger) are ignored and re-warm
{ const q = createQuality(); let c = feed(q, 100, 16.7, 0); for (let i = 0; i < 50; i++) { c += 8000; q.sample(8000, 16.7, c); } assert.equal(q.tier, 'full', 'stalls are not slow frames'); }

// ---- 3. a slow device drops one tier at a time, then another, and stops at minimal
{
  const q = createQuality(); const seen = []; q.on((t, p, why) => seen.push([p, t, why]));
  let c = feed(q, Q.warmFrames + 70, 40, 0); assert.equal(q.tier, 'lite', 'half of 60 frames slow drops full to lite');
  assert.equal(seen[0][0], 'full'); assert.equal(seen[0][1], 'lite');
  c = feed(q, Q.warmFrames + 70, 40, c); assert.equal(q.tier, 'minimal');
  c = feed(q, 2000, 40, c); assert.equal(q.tier, 'minimal', 'never below minimal'); assert.equal(q.drops, 2);
}
// a catastrophic stretch (mean over 70 ms) goes straight to minimal
{ const q = createQuality(); feed(q, Q.warmFrames + 30, 120, 0); assert.equal(q.tier, 'minimal', 'panic drops two tiers at once'); }
// a very slow device (3 fps) is judged in seconds, not after 100 frames: warm-up is capped in time, the panic window is 8 frames
{ const q = createQuality(); let c = 0, n = 0; while (q.tier === 'full' && n < 200) { c += 350; q.sample(350, 16.7, c); n++; } assert.equal(q.tier, 'minimal'); assert.ok(n <= 16, 'at 350 ms frames the verdict comes within 16 frames, took ' + n); assert.ok(c <= 6000, 'and within 6 s, took ' + c); }
// the verdict needs a full window after a tier change: no double drop from the same slow stretch
{ const q = createQuality(); let c = feed(q, Q.warmFrames + 61, 40, 0); assert.equal(q.tier, 'lite'); c = feed(q, Q.warmFrames + 30, 40, c); assert.equal(q.tier, 'lite', 'half a window later still lite'); }

// ---- 4. rising needs a long clean stretch and a lock; punished rises are not repeated (no flapping)
{
  const q = createQuality(); let c = 0; const log = [];
  q.on((t, p) => log.push(t));
  c = feed(q, Q.warmFrames + 70, 40, c); assert.equal(q.tier, 'lite');
  c = feed(q, 300, 16.7, c); assert.equal(q.tier, 'lite', 'a few seconds of smooth frames do not rise yet (lock 15 s since the drop)');
  c = feed(q, 2000, 16.7, c); assert.equal(q.tier, 'full', 'a long smooth stretch rises one tier'); assert.equal(q.rises, 1);
  // full does not hold: it drops again, the lock doubles
  c = feed(q, Q.warmFrames + 70, 40, c); assert.equal(q.tier, 'lite'); assert.equal(q.punished, 1); assert.ok(q.lockMs > Q.lockStartMs);
  c = feed(q, 2000, 16.7, c); // 33 s clean: lock is 30 s, so this may rise again
  if (q.tier === 'full') { c = feed(q, Q.warmFrames + 70, 40, c); assert.equal(q.tier, 'lite'); }
  assert.ok(q.punished >= 1);
  // flapping bound: alternate slow and clean for ten simulated minutes, count tier changes
  const changes = log.length; const q2 = createQuality(); let n2 = 0; q2.on(() => n2++); let c2 = 0;
  for (let cyc = 0; cyc < 40; cyc++) { c2 = feed(q2, 700, 40, c2); c2 = feed(q2, 1500, 16.7, c2); }
  assert.ok(n2 <= 12, 'at most 12 tier changes in 40 slow/clean cycles, got ' + n2);
  assert.ok(q2.cap !== 'full' || q2.punished < 2, 'two punished rises lower the cap');
  // once capped it never rises above the cap
  const q3 = createQuality(); let c3 = 0;
  for (let cyc = 0; cyc < 12; cyc++) { c3 = feed(q3, 300, 40, c3); c3 = feed(q3, 3000, 16.7, c3); }
  const t3 = TIERS.indexOf(q3.tier), capI = TIERS.indexOf(q3.cap); assert.ok(t3 >= capI, 'tier is never better than the cap');
}
// an explicit mode freezes the tier and ignores samples
{ const q = createQuality({ mode: 'low' }); feed(q, 3000, 16.7, 0); assert.equal(q.tier, 'minimal', 'Low stays low on a smooth device'); }
// the expected interval counts: a capped 30 fps loop at 33 ms is NOT slow
{ const q = createQuality(); feed(q, 5000, 33.3, 0, 33.3); assert.equal(q.tier, 'full', '30 fps by design is not a slow device'); }
// a lone 500 ms hitch is a stall, but a device that is ALWAYS at 600 ms per frame is judged
{ const q = createQuality(); let c = feed(q, 100, 16.7, 0); c += 500; q.sample(500, 16.7, c); assert.equal(q.tier, 'full'); const q2 = createQuality(); let c2 = 0, n = 0; while (q2.tier === 'full' && n < 100) { c2 += 600; q2.sample(600, 16.7, c2); n++; } assert.equal(q2.tier, 'minimal', '600 ms frames reach minimal'); assert.ok(n < 30, 'in ' + n + ' frames'); }
// warmup clears the window (screen change)
{ const q = createQuality(); let c = feed(q, Q.warmFrames + 40, 40, 0); q.warmup(); c = feed(q, Q.warmFrames - 1, 40, c); assert.equal(q.tier, 'full', 'after warmup the first frames are ignored'); }
// debug line is short text
assert.ok(/^full/.test(createQuality().debug()));

// ---- 5. the rAF governor
{
  const g = createGovernor();
  assert.equal(g.wanted(1000, 'ward', 'full'), 0, 'interactive screens run every callback');
  assert.equal(g.wanted(1000, 'combat', 'minimal'), 0, 'even in the minimal tier');
  g.enter(0); assert.equal(g.wanted(1000, 'title', 'full'), 0, 'a fresh title runs at full rate');
  assert.equal(g.wanted(IDLE_AFTER_MS + 1, 'title', 'full'), g.interval, 'idle title: 30 fps');
  g.input(IDLE_AFTER_MS + 100); assert.equal(g.wanted(IDLE_AFTER_MS + 200, 'title', 'full'), 0, 'input wakes it up');
  assert.equal(g.wanted(IDLE_AFTER_MS + 100 + IDLE_AFTER_MS + 1, 'title', 'full'), g.interval, 'and it idles again');
  g.enter(50000); assert.equal(g.wanted(50001, 'title', 'full'), 0, 'entering the title (intro) counts as activity');
  assert.equal(g.wanted(10, 'title', 'minimal'), g.interval, 'minimal tier holds the title at 30 fps from the start');
  assert.equal(g.wanted(10, 'ward', 'full', true), Infinity, 'hidden: nothing runs');
  // 60 Hz callbacks every 16.7 ms: exactly every second one runs at 30 fps
  const h = createGovernor(); h.enter(0); let last = 0, ran = 0, now = 10000;
  for (let i = 0; i < 600; i++) { now += 16.67; if (h.shouldRun(now, last, 'title', 'minimal')) { ran++; last = now; } }
  assert.ok(ran >= 295 && ran <= 305, 'half of 600 callbacks run, got ' + ran);
  // 120 Hz callbacks
  const k = createGovernor(); k.enter(0); last = 0; ran = 0; now = 10000;
  for (let i = 0; i < 1200; i++) { now += 8.33; if (k.shouldRun(now, last, 'title', 'minimal')) { ran++; last = now; } }
  assert.ok(ran >= 295 && ran <= 320, '120 Hz: still about 30 ticks per second, got ' + ran);
  // full rate: all run; hidden: none
  const f = createGovernor(); f.enter(0); last = 0; ran = 0; now = 100;
  for (let i = 0; i < 100; i++) { now += 16.67; if (f.shouldRun(now, last, 'ward', 'full')) { ran++; last = now; } } assert.equal(ran, 100);
  for (let i = 0; i < 10; i++) assert.equal(f.shouldRun(now += 16, last, 'ward', 'full', true), false);
}

// ---- 6. app wiring: perf object, tier change resizes the backing store, settings persist
{
  const meta = { settings: {} };
  const app = await makeApp({ meta });
  assert.ok(app.perf && app.perf.q && app.perf.gov, 'app.perf exists');
  const w0 = app.canvas.width; globalThis.window.devicePixelRatio = 2; app.resize(); const w2 = app.canvas.width;
  app.perf.q.setMode('low'); assert.equal(app.perf.dprCap, 1, 'low caps the backing store at 1 device px'); assert.ok(app.canvas.width < w2, 'canvas shrank: ' + app.canvas.width + ' < ' + w2);
  app.perf.q.setMode('high'); assert.equal(app.perf.dprCap, TIER_SPEC.full.dprCap); assert.equal(app.canvas.width, w2, 'High restores it');
  globalThis.window.devicePixelRatio = 1; frames(app, 2);
  const settings = (await import('../graftwork/ui/settings.js')); const s = settings.settingsOf(app);
  assert.equal(s.graphics, 'auto', 'default Graphics is Auto'); assert.equal(settings.DEFAULTS.graphics, 'auto');
  meta.settings.graphics = 'bogus'; assert.equal(settings.settingsOf(app).graphics, 'auto', 'a damaged value is cleaned');
  meta.settings.graphics = 'low'; assert.equal(settings.settingsOf(app).graphics, 'low', 'a good value survives');
  const META = await import('../graftwork/engine/meta.js');
  const m = META.migrate ? META.migrate({ v: 1, settings: { graphics: 'high' } }) : null;
  if (m) assert.equal(m.settings.graphics, 'high', 'meta migration keeps the setting');
  // the Graphics row exists and cycles Auto -> High -> Low
  const reg = []; app.shared.flow = { saveMeta() { reg.push(1); } }; app.register('settings', settings.default); meta.settings = {};
  app.push('settings'); frames(app, 30);
  const sc = app.top(); const row = sc.rows.find((r) => r.label === 'Graphics'); assert.ok(row, 'Settings has a Graphics row');
  const again = () => { frames(app, 2); return sc.rows.find((r) => r.label === 'Graphics'); };
  row.act(1); assert.equal(meta.settings.graphics, 'high'); again().act(1); assert.equal(meta.settings.graphics, 'low'); again().act(1); assert.equal(meta.settings.graphics, 'auto');
  assert.ok(reg.length >= 3, 'each change is saved');
  // the panel still fits the stage
  assert.ok(sc.rows.every((r) => r.y + r.h <= 720), 'every settings row is on the stage');
}

// ---- 7. decoded image cache: eviction by recency under a budget
{
  const made = [];
  const A = createAssets({ makeImage: () => { const i = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512, set src(v) { this._s = v; }, get src() { return this._s; } }; made.push(i); return i; }, fetchJson: async () => ({}) });
  A.manifest = { version: 1, tile: { w: 128, h: 64 }, rooms: {}, actors: Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['a' + i, { file1x: `a${i}@1x.webp`, file2x: `a${i}@2x.webp`, w: 256, h: 256 }])), icons: {}, cards: {}, title: {} }; A.state = 'ready';
  const app = { scale: 0.5, px: 0.5 }; // @1x
  A.clock = 0;
  for (let i = 0; i < 10; i++) { A.clock = i * 1000; A.actor('a' + i, app); made[i].onload(); A.clock = i * 1000; A.actor('a' + i, app); }
  const each = 512 * 512 * 4; assert.equal(A.decodedBytes(), 10 * each, 'bytes counted per decoded image');
  assert.equal(A.maintain(20000, 100 * each), 0, 'under budget: nothing goes');
  const n = A.maintain(20000, 6 * each); assert.ok(n >= 4, 'over budget: evicts, got ' + n); assert.ok(A.decodedBytes() <= 6 * each * 0.86);
  assert.equal(A.imgs.has('a0@1x.webp'), false, 'the oldest went first'); assert.ok(A.imgs.has('a9@1x.webp'), 'the newest stayed');
  // recently drawn images are never evicted, even over budget
  const B = createAssets({ makeImage: () => ({ naturalWidth: 100, naturalHeight: 100, set src(v) {} }), fetchJson: async () => ({}) });
  B.manifest = A.manifest; B.state = 'ready'; B.clock = 50000;
  for (let i = 0; i < 3; i++) { B.actor('a' + i, app); B.imgs.get(`a${i}@1x.webp`).img.onload(); B.actor('a' + i, app); }
  assert.equal(B.maintain(50000, 1), 0, 'drawn within keepMs: untouchable');
  assert.ok(B.maintain(70000, 1) > 0, 'idle for long: goes');
  // an evicted image loads again when asked
  assert.equal(A.actor('a0', app), null, 'evicted: null while it reloads'); assert.ok(A.imgs.has('a0@1x.webp'), 'a new load started');
  // images still loading are never evicted
  const C = createAssets({ makeImage: () => ({ naturalWidth: 0, naturalHeight: 0, set src(v) {} }), fetchJson: async () => ({}) }); C.manifest = A.manifest; C.state = 'ready';
  C.actor('a1', app); assert.equal(C.maintain(99999, 0), 0, 'loading entries stay');
}

// ---- 8. recipe-scoped kit settle: only the recipe's files are loaded
{
  const kit = { floors: { f: { file1x: 'floors/f@1x.webp', file2x: 'floors/f@2x.webp' } }, walls: { w: { file1x: 'walls/w@1x.webp' } }, pieces: { p: { file1x: 'pieces/p@1x.webp' }, other: { file1x: 'pieces/o@1x.webp' } }, props: { x: { file1x: 'props/x@1x.webp' }, y: { file1x: 'props/y@1x.webp' } } };
  const made = [];
  const A = createAssets({ makeImage: () => { const i = { naturalWidth: 8, naturalHeight: 8, set src(v) { this._s = v; }, get src() { return this._s; } }; made.push(i); return i; }, fetchJson: async () => kit, kitBase: 'kit/' });
  A.kit = kit; A.kitState = 'ready';
  const rc = { floor: 'f', wall: 'w', pieces: [{ id: 'p' }], props: [{ id: 'x' }] };
  const app = { scale: 0.5, px: 0.5 };
  assert.equal(A.kitRecipeSettled(rc, app), false, 'loading'); assert.equal(made.length, 4, 'floor, wall, one piece, one prop: nothing else is requested');
  assert.ok(!made.some((i) => /other|y@1x/.test(i.src)), 'unused pieces and props are not loaded');
  for (const i of made) i.onload(); assert.equal(A.kitRecipeSettled(rc, app), true);
}
console.log('graftwork_quality: all checks passed');
