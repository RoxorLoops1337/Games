// Hook-a-Duck — headless physics + logic suite.
//
// duck_fishing/index.html is one self-contained file with several inline
// <script> blocks sharing a scope. This harness concatenates them, stubs a
// no-op DOM + 2d context, injects a test-only expose hook (never shipped)
// and evals the result — then drives the wave field, buoyancy, the hook
// pendulum, ring catches, reveals and scoring through the real code.
// The draw path is exercised too, so render-time errors fail here.
// Run: node tests/duck_fishing.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'duck_fishing', 'index.html');

let passed = 0, failed = 0;
function test(name, fn){ try { fn(); passed++; } catch (e){ failed++; console.error(`FAIL ${name}: ${e.message}`); } }
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }
function near(a, b, eps, msg){ if (Math.abs(a - b) > eps) throw new Error(`${msg || 'not near'}: ${a} vs ${b}`); }

const BOOT_TAIL = `reseed(20240707);
seedPond();
bindInput();
fit();
loadBest();
toMenu();
requestAnimationFrame(loop);`;

const EXPOSE = `__out.api = {
  G, ducks, reveals, pops, drops, rings, hook, rod, aim, input, cam, snd,
  waveH, waveDx, waveDz, euler, xf, proj, view, unproject, camFit, fit,
  seedPond, newDuck, respawnDuck, rollNumber, reseed, rng,
  stepDucks, stepHook, stepCatch, stepHooked, stepReveals, stepFx,
  catchDuck, startReveal, update, draw, drawHUD,
  startRound, endRound, toMenu, loadBest, saveBest, fmtTime,
  setAim, rodTip, DUCK_HI, DUCK_LO, DUCK_MIN, PALS, PAL_GOLD, NUM_TABLE, revealRoll,
  getT: () => T, setT: (v) => { T = v; },
  _resize: (w, h) => { window.innerWidth = w; window.innerHeight = h; fit(); },
  _dpr: () => DPR, _tier: () => Q.tier, _autoQuality: autoQuality,
  _ctx: () => ctx, _setCtx: (c) => { ctx = c; },
  _setTier: (t) => { Q.tier = t; fit(); },
  C: { CHAN_HZ, LOOP_LEN, X0, X1, VIEW_HALF, GATE_X, N_DUCKS, CURRENT, GRAV,
       FLOAT_Y, BODY_HH, BUOY, RING_LOCAL, RING_R, CATCH_R, MAX_HOOK,
       ROD_TIP_Y, HOOK_MIN, HOOK_MAX, LOWER_SPD, RAISE_SPD, ROUND_TIME,
       BORE_LOW, BORE_HIGH },
};
`;

function boot(seedSave){
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, { get(t, p){
    if (p === 'measureText') return () => ({ width: 30 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
    if (p === 'canvas') return { width: 960, height: 600 };
    return () => {};
  } });
  const el = () => ({
    style: {}, textContent: '', width: 0, height: 0,
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
    addEventListener(){}, removeAttribute(){}, setAttribute(){},
    setPointerCapture(){},
    classList: { add(){}, remove(){}, toggle(){} },
  });
  const canvas = el();
  const store = {};
  if (seedSave != null) store['duck_fishing_best_v1'] = String(seedSave);
  const nodes = {};
  const sandbox = {
    document: {
      getElementById: (id) => { if (id === 'c') return canvas; return nodes[id] || (nodes[id] = el()); },
      createElement: () => el(),
    },
    window: { innerWidth: 960, innerHeight: 600, devicePixelRatio: 1, addEventListener(){} },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    requestAnimationFrame: () => {},
    __out: {},
  };

  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert(blocks.length >= 5, 'expected the game to be split across several inline scripts');
  const src = blocks.join('\n');
  assert(src.includes(BOOT_TAIL), 'boot tail anchor missing from game script');
  const patched = src.replace(BOOT_TAIL, EXPOSE + BOOT_TAIL);
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', '__out', patched)(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined, sandbox.requestAnimationFrame, sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store;
  api._canvas = canvas;
  return api;
}

const step = (api, secs, dt = 1 / 60) => { for (let i = 0; i < Math.round(secs / dt); i++) api.update(dt); };

/* Boot with a context that tallies every 2d call, so the draw path's cost is
   measurable rather than a matter of opinion. The first version of this game
   ran at under a frame a second: ~11k fills AND ~11k strokes (a per-quad
   seam stroke) plus 66 clip() calls, because every near duck drew its whole
   mesh twice through two clipped passes. The budgets below are what keeps
   that from creeping back in. */
function bootCounting(w = 1920, h = 1080, dpr = 2){
  const counts = {};
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, { get(t, p){
    if (p === 'measureText') return () => ({ width: 30 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient')
      return () => { counts[p] = (counts[p] || 0) + 1; return gradient; };
    if (p === 'canvas') return { width: w, height: h };
    if (typeof p === 'string' && p !== 'then')
      return () => { counts[p] = (counts[p] || 0) + 1; };
    return () => {};
  }, set(){ return true; } });
  const el = () => ({
    style: {}, textContent: '', width: 0, height: 0,
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    addEventListener(){}, removeAttribute(){}, setAttribute(){},
    setPointerCapture(){}, classList: { add(){}, remove(){}, toggle(){} },
  });
  const canvas = el(), nodes = {}, store = {};
  const sandbox = {
    document: { getElementById: id => id === 'c' ? canvas : (nodes[id] || (nodes[id] = el())), createElement: () => el() },
    window: { innerWidth: w, innerHeight: h, devicePixelRatio: dpr, addEventListener(){} },
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    requestAnimationFrame: () => {},
    __out: {},
  };
  const html = fs.readFileSync(HTML, 'utf8');
  const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
    .replace(BOOT_TAIL, EXPOSE + BOOT_TAIL);
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', '__out', src)(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined, sandbox.requestAnimationFrame, sandbox.__out);
  const api = sandbox.__out.api;
  api._counts = counts;
  api._reset = () => { for (const k in counts) delete counts[k]; };
  return api;
}

/* ops averaged per frame over N frames of the busiest state: full pond,
   hook down, on the largest viewport */
function frameCost(w, h, dpr, frames = 10){
  const a = bootCounting(w, h, dpr);
  a.startRound(true);
  a.input.down = true;
  a.setAim(w * 0.5, h * 0.55);
  step(a, 1.0);
  a._reset();
  for (let i = 0; i < frames; i++){ a.update(1 / 60); a.draw(); }
  const per = {};
  for (const k in a._counts) per[k] = a._counts[k] / frames;
  per._dpr = a._dpr();
  per._backing = w * h * per._dpr * per._dpr;
  return per;
}

test('the frame stays inside its draw budget on a large viewport', () => {
  const c = frameCost(1920, 1080, 2);
  const fill = c.fill || 0, stroke = c.stroke || 0, clip = c.clip || 0;
  // clip() is the expensive one — it used to force a second full mesh pass
  assert(clip === 0, `the draw path should not clip at all, got ${clip}/frame`);
  // strokes cost far more than fills; only a handful of outlines are legit
  assert(stroke < 120, `too many strokes: ${stroke}/frame`);
  assert(fill < 6000, `too many fills: ${fill}/frame`);
  assert(fill + stroke < 6200, `total path rasterisations too high: ${(fill + stroke).toFixed(0)}/frame`);
  // the static backdrop is baked, so only the twinkling bulbs may allocate
  assert((c.createRadialGradient || 0) < 10, `backdrop gradients not cached: ${c.createRadialGradient}/frame`);
  // and a hi-dpi panel must not blow the fill rate out
  assert(c._backing <= 3.3e6, `backing store too large: ${(c._backing / 1e6).toFixed(1)}M px`);
});

test('quality tiers actually shed work, and the lowest is cheap', () => {
  const a = bootCounting(1920, 1080, 2);
  a.startRound(true);
  a.input.down = true;
  step(a, 1.0);
  const at = (tier) => {
    a._setTier(tier);
    a._reset();
    for (let i = 0; i < 8; i++){ a.update(1 / 60); a.draw(); }
    return (a._counts.fill || 0) / 8;
  };
  const hi = at(2), mid = at(1), lo = at(0);
  assert(mid < hi, `tier 1 should cost less than tier 2 (${mid.toFixed(0)} vs ${hi.toFixed(0)})`);
  assert(lo < mid, `tier 0 should cost less than tier 1 (${lo.toFixed(0)} vs ${mid.toFixed(0)})`);
  assert(lo < hi * 0.62, `the low tier should be a real saving, got ${(lo / hi * 100).toFixed(0)}% of full`);
});

test('a slow frame drops the quality tier, a fast one earns it back', () => {
  const a = boot();
  assert(a._tier() === 2, 'should start at full quality');
  for (let i = 0; i < 200; i++) a._autoQuality(40, 45);   // 40ms of work, 22fps
  assert(a._tier() < 2, 'sustained slow frames should shed quality');
  const dropped = a._tier();
  for (let i = 0; i < 40; i++) a._autoQuality(5, 16);
  assert(a._tier() === dropped, 'a brief fast patch should not immediately promote');
  // recovery is deliberately unhurried — each demotion makes the return trip
  // cost more clean time, so this takes tens of seconds of good frames
  for (let i = 0; i < 30000; i++) a._autoQuality(5, 16);
  assert(a._tier() > dropped, 'a long clean stretch should restore quality');
});

test('a vsync-locked but idle machine still earns its quality back', () => {
  // 16.7ms between frames however fast the machine is, so the promotion has
  // to key off work done rather than wall time or it can never recover
  const a = boot();
  for (let i = 0; i < 300; i++) a._autoQuality(40, 45);
  assert(a._tier() === 0, 'should have bottomed out');
  for (let i = 0; i < 60000; i++) a._autoQuality(4, 16.7);
  assert(a._tier() === 2, 'a machine with headroom should climb back to full quality');
});

test('quality settles instead of oscillating between tiers', () => {
  /* The trap: the low tier runs fast, which looks like a reason to promote —
     but the speed IS the low tier, so a naive rule climbs, stalls, drops and
     repeats forever. Simulate a machine that can only afford tier 0 and
     assert the flapping dies out. */
  const a = boot();
  let changes = 0, prev = a._tier();
  for (let i = 0; i < 40000; i++){
    const cheap = a._tier() === 0;
    a._autoQuality(cheap ? 5 : 32, cheap ? 16.7 : 34);
    if (a._tier() !== prev){ changes++; prev = a._tier(); }
  }
  assert(a._tier() === 0, 'should end up on the tier the machine can afford');
  assert(changes < 12, `quality should stop flapping, saw ${changes} changes`);
  // and the last stretch must be quiet
  let lateChanges = 0; prev = a._tier();
  for (let i = 0; i < 20000; i++){
    const cheap = a._tier() === 0;
    a._autoQuality(cheap ? 5 : 32, cheap ? 16.7 : 34);
    if (a._tier() !== prev){ lateChanges++; prev = a._tier(); }
  }
  assert(lateChanges <= 2, `should have settled, saw ${lateChanges} late changes`);
});

test('a single hitch does not knock the quality down', () => {
  const a = boot();
  for (let i = 0; i < 60; i++) a._autoQuality(5, 16.7);
  a._autoQuality(180, 200);                                // one long stall
  for (let i = 0; i < 30; i++) a._autoQuality(5, 16.7);
  assert(a._tier() === 2, 'a one-off stall should be smoothed away, not acted on');
});

// ---- boot -----------------------------------------------------------------
test('boots into the menu with a full pond', () => {
  const a = boot();
  assert(a.G.mode === 'menu', 'should start in the menu');
  assert(a.ducks.length === a.C.N_DUCKS, `expected ${a.C.N_DUCKS} ducks, got ${a.ducks.length}`);
  assert(a.ducks.every(d => d.state === 'float'), 'every duck should start floating');
});

test('draws the menu frame without throwing', () => {
  const a = boot();
  a.draw();
  a.update(1 / 60);
  a.draw();
});

// ---- geometry -------------------------------------------------------------
test('duck meshes are closed and indices are in range', () => {
  const a = boot();
  for (const mesh of [a.DUCK_HI, a.DUCK_LO, a.DUCK_MIN]){
    assert(mesh.n > 100, 'mesh should have real geometry');
    assert(mesh.q * 4 === mesh.f.length, 'face buffer should be quads');
    for (let i = 0; i < mesh.f.length; i++)
      assert(mesh.f[i] >= 0 && mesh.f[i] < mesh.n, 'face index out of range');
    for (let i = 0; i < mesh.v.length; i++)
      assert(Number.isFinite(mesh.v[i]), 'mesh vertex must be finite');
  }
  assert(a.DUCK_LO.q < a.DUCK_HI.q, 'the LOD mesh should be cheaper than the full one');
  assert(a.DUCK_MIN.q < a.DUCK_LO.q, 'the minimal mesh should be cheaper still');
});

test('the pond fills a sensible band of the canvas at any aspect ratio', () => {
  for (const [w, h] of [[430, 860], [1920, 1080], [900, 700], [1280, 500]]){
    const a = boot();
    a._canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h });
    // resize the way the game does
    a._resize(w, h);
    const far = a.proj(0, 0, a.C.CHAN_HZ).y;
    const near2 = a.proj(0, 0, -a.C.CHAN_HZ).y;
    const band = Math.abs(near2 - far);
    assert(band > h * 0.28, `pond too thin at ${w}x${h}: ${band.toFixed(0)}px of ${h}`);
    assert(band < h * 0.95, `pond too tall at ${w}x${h}: ${band.toFixed(0)}px of ${h}`);
    // and the player must still be able to aim across the whole visible water
    a.setAim(w * 0.5, near2 - band * 0.5);
    assert(Math.abs(a.aim.z) < a.C.CHAN_HZ, 'aim should land inside the channel');
    a.draw();
  }
});

test('camera fit puts VIEW_HALF at the canvas edge and inverts cleanly', () => {
  const a = boot();
  const p = a.proj(a.C.VIEW_HALF, 0, 0);
  near(p.x, 960, 1.5, 'VIEW_HALF should land on the right-hand edge');
  const back = a.unproject(p.x, p.y);
  assert(back, 'unproject should hit the water plane');
  near(back[0], a.C.VIEW_HALF, 0.05, 'unproject(project(x)) should round-trip in x');
  near(back[1], 0, 0.05, 'unproject(project(z)) should round-trip in z');
});

test('euler matrix is orthonormal', () => {
  const a = boot();
  const m = new Float64Array(9);
  a.euler(0.7, -0.4, 1.1, m);
  const rows = [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]];
  for (const r of rows) near(Math.hypot(r[0], r[1], r[2]), 1, 1e-9, 'row should be unit length');
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  near(dot(rows[0], rows[1]), 0, 1e-9, 'rows should be orthogonal');
  near(dot(rows[0], rows[2]), 0, 1e-9, 'rows should be orthogonal');
});

// ---- water ----------------------------------------------------------------
test('the wave field moves, stays small, and its gradient matches numerically', () => {
  const a = boot();
  const h0 = a.waveH(2.3, 1.1, 0), h1 = a.waveH(2.3, 1.1, 0.4);
  assert(Math.abs(h1 - h0) > 1e-3, 'the surface should travel over time');
  for (let x = -8; x <= 8; x += 1.7)
    assert(Math.abs(a.waveH(x, 0.4, 1.2)) < 0.25, 'wave amplitude should stay a couple of cm');
  const e = 1e-4;
  const numDx = (a.waveH(1 + e, 0.5, 0.7) - a.waveH(1 - e, 0.5, 0.7)) / (2 * e);
  near(a.waveDx(1, 0.5, 0.7), numDx, 1e-5, 'analytic dH/dx should match finite differences');
  const numDz = (a.waveH(1, 0.5 + e, 0.7) - a.waveH(1, 0.5 - e, 0.7)) / (2 * e);
  near(a.waveDz(1, 0.5, 0.7), numDz, 1e-5, 'analytic dH/dz should match finite differences');
});

// ---- floating physics -----------------------------------------------------
test('a dropped duck settles at its floating waterline instead of sinking', () => {
  const a = boot();
  const d = a.ducks[0];
  d.x = 0; d.z = 0; d.y = 4; d.vy = 0;
  a.setT(0);
  // freeze the stream so only the vertical dynamics are under test
  for (const o of a.ducks) if (o !== d) o.state = 'reveal';
  for (let i = 0; i < 400; i++) a.stepDucks(1 / 240);
  const wh = a.waveH(d.x, d.z, a.getT());
  assert(Math.abs(d.y - (wh + a.C.FLOAT_Y)) < 0.14,
    `duck should settle near the waterline, y=${d.y.toFixed(3)} vs ${(wh + a.C.FLOAT_Y).toFixed(3)}`);
  assert(Math.abs(d.vy) < 1.2, 'vertical motion should have damped out');
});

test('ducks bob rather than sit perfectly still', () => {
  const a = boot();
  const d = a.ducks[3];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 240; i++){ a.update(1 / 60); lo = Math.min(lo, d.y); hi = Math.max(hi, d.y); }
  assert(hi - lo > 0.01, 'a floating duck should ride the swell');
  assert(hi - lo < 0.9, 'the bob should stay physically plausible');
});

test('a duck leans into the wave slope', () => {
  const a = boot();
  const d = a.ducks[5];
  let maxTilt = 0;
  for (let i = 0; i < 600; i++){ a.update(1 / 60); maxTilt = Math.max(maxTilt, Math.abs(d.pitch), Math.abs(d.roll)); }
  assert(maxTilt > 0.005, 'the wave gradient should tip the duck');
  assert(maxTilt < 1.0, 'a floating duck should never capsize');
});

test('the stream carries ducks downstream and wraps them round the loop', () => {
  const a = boot();
  const d = a.ducks[1];
  const x0 = d.x;
  step(a, 1.0);
  assert(d.x > x0, 'ducks should drift downstream');
  d.x = a.C.X1 - 0.05;
  step(a, 0.5);
  assert(d.x < 0, 'a duck past the end should wrap back to the head of the loop');
});

test('ducks jostle apart instead of overlapping', () => {
  const a = boot();
  const [p, q] = a.ducks;
  p.x = 0; p.z = 0; q.x = 0.08; q.z = 0.04;
  a.stepDucks(1 / 60);
  const gap = Math.hypot(q.x - p.x, q.z - p.z);
  assert(gap > 0.1, `overlapping ducks should push apart, gap=${gap.toFixed(3)}`);
});

test('ducks stay inside the trough walls', () => {
  const a = boot();
  step(a, 8);
  for (const d of a.ducks)
    assert(Math.abs(d.z) < a.C.CHAN_HZ, `duck escaped the channel at z=${d.z.toFixed(2)}`);
});

test('everything stays finite over a long run', () => {
  const a = boot();
  a.startRound(true);
  a.setAim(500, 380);
  for (let i = 0; i < 900; i++){
    a.input.down = (i % 90) < 55;
    a.update(1 / 60);
  }
  a.draw();
  for (const d of a.ducks)
    assert([d.x, d.y, d.z, d.yaw, d.pitch, d.roll].every(Number.isFinite), 'duck state went non-finite');
  assert(hookFinite(a), 'hook state went non-finite');
});
function hookFinite(a){ return a.hook.p.every(Number.isFinite) && a.hook.v.every(Number.isFinite); }

// ---- the rod and hook -----------------------------------------------------
test('holding pays the line out, releasing reels it back in', () => {
  const a = boot();
  a.startRound(false);
  a.input.down = true;
  step(a, 2.5);
  assert(a.hook.len > a.C.HOOK_MIN + 1, 'the hook should descend while held');
  assert(a.hook.len <= a.C.HOOK_MAX + 1e-6, 'the line should not exceed its maximum');
  const deep = a.hook.len;
  a.input.down = false;
  step(a, 2.5);
  assert(a.hook.len < deep, 'releasing should reel the hook back up');
  assert(Math.abs(a.hook.len - a.C.HOOK_MIN) < 1e-6, 'the hook should park at its shortest');
});

test('the hook hangs the line length below the rod tip and swings when swept', () => {
  const a = boot();
  a.startRound(false);
  a.input.down = true;
  step(a, 3);
  const tip = a.rodTip();
  const L = Math.hypot(a.hook.p[0] - tip[0], a.hook.p[1] - tip[1], a.hook.p[2] - tip[2]);
  near(L, a.hook.len, 1e-6, 'the pendulum constraint should hold the line taut');
  // sweep the rod hard across the pond and the hook should trail behind it
  a.aim.x = 9; a.aim.z = 0;
  let maxLag = 0;
  for (let i = 0; i < 60; i++){ a.update(1 / 60); maxLag = Math.max(maxLag, Math.abs(a.hook.p[0] - a.rodTip()[0])); }
  assert(maxLag > 0.12, `the hook should swing behind the rod, lag=${maxLag.toFixed(3)}`);
});

test('aiming clamps to the water the player can actually reach', () => {
  const a = boot();
  a.setAim(-4000, 400);
  assert(a.aim.x >= -a.C.GATE_X + 1 - 1e-6, 'aim should clamp inside the left gate');
  a.setAim(9000, 400);
  assert(a.aim.x <= a.C.GATE_X - 1 + 1e-6, 'aim should clamp inside the right gate');
  a.setAim(480, 4000);
  assert(Math.abs(a.aim.z) <= a.C.CHAN_HZ - 0.7 + 1e-6, 'aim should clamp inside the channel');
});

// ---- catching -------------------------------------------------------------
/* Park a duck under the hook and drive the hook down through the ring bore
   and back up — the same motion a player makes. */
function rigCatch(a, duck){
  a.startRound(false);
  for (const o of a.ducks) if (o !== duck) o.x = a.C.X0 - 50;   // clear the lane
  duck.state = 'float';
  duck.yaw = 0; duck.pitch = 0; duck.roll = 0;
  duck.x = a.rod.x = a.aim.x = 0;
  duck.z = a.rod.z = a.aim.z = 0;
  duck.y = a.C.FLOAT_Y; duck.vy = 0;
}
function plungeHook(a, duck, dz){
  // move the hook by hand: down through the bore, then back up
  const ringY = duck.y + a.C.RING_LOCAL[1];
  const place = (y) => {
    a.hook.p[0] = duck.x + a.C.RING_LOCAL[0]; a.hook.p[1] = y; a.hook.p[2] = duck.z + (dz || 0);
    a.hook.q[0] = a.hook.p[0]; a.hook.q[1] = a.hook.p[1]; a.hook.q[2] = a.hook.p[2];
    a.stepCatch(1 / 60);
  };
  for (const y of [ringY + 0.35, ringY + 0.1, ringY - 0.12, ringY - 0.25]) place(y);
  for (const y of [ringY - 0.1, ringY + 0.06, ringY + 0.3]) place(y);
}
// run the sim until every reveal has finished (bounded, so a stuck reveal fails loudly)
function settle(a, cap = 6){
  for (let i = 0; i < cap * 60 && (a.reveals.length || a.hook.caught.length); i++) a.update(1 / 60);
}

test('threading the ring and lifting catches the duck', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  plungeHook(a, d, 0);
  assert(d.state === 'hooked', 'the duck should be on the hook');
  assert(a.hook.caught.includes(d), 'the hook should be carrying it');
});

test('parking the hook under a ring and reeling up lands the duck', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  // slide the hook into the bore, below the ring, and hold it there
  a.hook.p[0] = d.x + a.C.RING_LOCAL[0];
  a.hook.p[1] = d.y + a.C.RING_LOCAL[1] - 0.30;
  a.hook.p[2] = d.z;
  a.hook.v[0] = a.hook.v[1] = a.hook.v[2] = 0;
  a.stepCatch(1 / 60);
  assert(d.state === 'float', 'sitting under the ring is not yet a catch');
  a.hook.v[1] = 0.8;                 // start reeling in
  a.stepCatch(1 / 60);
  assert(d.state === 'hooked', 'lifting an armed hook should land the duck');
});

test('the arming window expires once the duck drifts off the hook', () => {
  const arm = (a, d) => {
    a.hook.p[0] = d.x + a.C.RING_LOCAL[0];
    a.hook.p[1] = d.y + a.C.RING_LOCAL[1] - 0.30;
    a.hook.p[2] = d.z;
    a.hook.v[1] = 0;
    a.stepCatch(1 / 60);
  };
  // just outside the bore but still inside the looser lift radius, so the
  // only thing that can change the outcome is the arming timer
  const slide = (a, d) => { a.hook.p[0] = d.x + a.C.RING_LOCAL[0] + a.C.CATCH_R * 1.2; };

  // still warm -> lifting lands it
  const warm = boot();
  const w = warm.ducks[0];
  rigCatch(warm, w);
  arm(warm, w);
  assert(w.threadT > 0, 'the hook should be armed under the ring');
  slide(warm, w);
  for (let i = 0; i < 6; i++) warm.stepCatch(1 / 60);
  warm.hook.v[1] = 0.8;
  warm.stepCatch(1 / 60);
  assert(w.state === 'hooked', 'a fresh arming should still land the duck');

  // gone cold -> the same lift catches nothing
  const cold = boot();
  const c = cold.ducks[0];
  rigCatch(cold, c);
  arm(cold, c);
  slide(cold, c);
  for (let i = 0; i < 60; i++) cold.stepCatch(1 / 60);
  assert(c.threadT === 0, 'the arming window should have expired');
  cold.hook.v[1] = 0.8;
  cold.stepCatch(1 / 60);
  assert(c.state === 'float', 'a stale arming should not land a duck');
});

test('a hook that misses the bore catches nothing', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  plungeHook(a, d, a.C.CATCH_R + 0.45);
  assert(d.state === 'float', 'a duck the hook missed should still be floating');
  assert(a.hook.caught.length === 0, 'nothing should be on the hook');
});

test('lowering onto a ring without lifting is not a catch', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  const ringY = d.y + a.C.RING_LOCAL[1];
  for (const y of [ringY + 0.4, ringY + 0.15, ringY - 0.05, ringY - 0.2, ringY - 0.3]){
    a.hook.p[0] = d.x + a.C.RING_LOCAL[0]; a.hook.p[1] = y; a.hook.p[2] = d.z;
    a.stepCatch(1 / 60);
  }
  assert(d.state === 'float', 'you have to pull up to land it');
});

/* The real thing, driven only through update(): aim at a duck, hold to lower
   the hook, release to reel in. Nothing is teleported — the pendulum, the
   buoyancy and the catch test all run for real. If the mechanic is ever
   retuned out of reach, this is the test that notices. */
test('playing it properly — aim, hold, release — lands a duck', () => {
  const a = boot();
  a.startRound(false);
  const d = a.ducks[0];
  for (const o of a.ducks) if (o !== d) o.x = a.C.X0 - 50;
  d.x = 0; d.z = 0; d.yaw = 0; d.drift = 0;
  // aim the rod at the duck's ring, and hold the duck in place under it
  a.aim.x = a.C.RING_LOCAL[0]; a.aim.z = 0;
  a.rod.x = a.aim.x; a.rod.z = a.aim.z;
  a.input.down = true;
  for (let i = 0; i < 200; i++){ d.x = 0; d.z = 0; a.update(1 / 60); }
  assert(a.hook.len > a.C.HOOK_MAX - 0.05, 'the line should be fully out by now');
  assert(d.threadT > 0, 'the hook should be sitting in the ring');
  a.input.down = false;
  for (let i = 0; i < 40; i++){ if (d.state !== 'float') break; d.x = 0; d.z = 0; a.update(1 / 60); }
  assert(d.state === 'hooked', 'reeling in should land the duck the hook was threaded through');
  a.input.down = false;
  settle(a);
  assert(a.G.landed === 1, 'and it should be scored');
});

test('the hook carries at most two ducks', () => {
  const a = boot();
  a.startRound(false);
  const picked = a.ducks.slice(0, 3);
  for (const o of a.ducks) if (!picked.includes(o)) o.x = a.C.X0 - 50;
  for (const d of picked){
    d.state = 'float'; d.yaw = d.pitch = d.roll = 0;
    d.x = 0; d.z = 0; d.y = a.C.FLOAT_Y;
    plungeHook(a, d, 0);
  }
  assert(a.hook.caught.length === a.C.MAX_HOOK, `expected ${a.C.MAX_HOOK} on the hook, got ${a.hook.caught.length}`);
  assert(picked[2].state === 'float', 'the third duck should be left in the water');
});

test('a hooked duck hangs from its ring, under the hook', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  plungeHook(a, d, 0);
  a.input.down = true;               // keep the line out so it isn't landed straight away
  for (let i = 0; i < 120; i++) a.update(1 / 60);
  assert(d.state === 'hooked', 'the duck should still be on the hook');
  assert(d.y < a.hook.p[1], 'the duck should hang below the hook');
  const m = new Float64Array(9);
  a.euler(d.yaw, d.pitch, d.roll, m);
  const out = [0, 0, 0];
  a.xf(m, a.C.RING_LOCAL[0], a.C.RING_LOCAL[1], a.C.RING_LOCAL[2], out);
  const ring = [d.x + out[0], d.y + out[1], d.z + out[2]];
  const gap = Math.hypot(ring[0] - a.hook.p[0], ring[1] - a.hook.p[1], ring[2] - a.hook.p[2]);
  assert(gap < 0.85, `the ring should stay on the hook, gap=${gap.toFixed(3)}`);
});

test('the hook nudges ducks it brushes against', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  const z0 = d.z, x0 = d.x;
  // against the flank, well behind the ring axis — close enough to touch the
  // hull, far enough that this is a bump and not a thread
  for (let i = 0; i < 60; i++){
    a.hook.p[0] = d.x - 0.30; a.hook.p[1] = d.y; a.hook.p[2] = d.z + 0.22;
    a.stepCatch(1 / 60);
  }
  assert(!d.threadT, 'brushing the flank should not arm the hook');
  assert(d.z < z0 - 0.005 && d.x > x0 + 0.005, 'the duck should be pushed off the hook');
  assert(d.state === 'float', 'a bump is not a catch');
  // and the shove stays gentle — the hook is a wire, not a plough
  assert(Math.hypot(d.x - x0, d.z - z0) < 0.5, 'the nudge should not clear a lane through the stream');
});

// ---- landing and scoring --------------------------------------------------
test('reeling a duck all the way in scores its number', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  d.num = 5; d.gold = false;
  plungeHook(a, d, 0);
  a.input.down = false;
  step(a, 1.0);                      // long enough to land and pay, before the popup fades
  assert(a.G.score === 5, `expected 5 points, got ${a.G.score}`);
  assert(a.G.landed === 1, 'one duck should be counted as landed');
  assert(a.pops.length > 0, 'a score popup should appear');
  settle(a);
  assert(a.G.score === 5, 'a duck should only ever pay once');
});

test('a double catch pays twice', () => {
  const a = boot();
  a.startRound(false);
  const pair = a.ducks.slice(0, 2);
  for (const o of a.ducks) if (!pair.includes(o)) o.x = a.C.X0 - 50;
  for (const d of pair){
    d.state = 'float'; d.yaw = d.pitch = d.roll = 0;
    d.x = 0; d.z = 0; d.y = a.C.FLOAT_Y; d.num = 3; d.gold = false;
    plungeHook(a, d, 0);
  }
  assert(a.hook.caught.length === 2, 'both ducks should be on the hook');
  a.input.down = false;
  step(a, 4);
  assert(a.G.score === 12, `two 3s at double should score 12, got ${a.G.score}`);
  assert(a.G.landed === 2, 'both should count as landed');
});

test('the reveal presents the numbered base squarely at the player', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  d.num = 8; d.gold = false;
  plungeHook(a, d, 0);
  a.input.down = false;
  step(a, 1.2);
  assert(a.reveals.includes(d), 'the duck should be mid-reveal');
  // the plug's own normal is local -Y; rotate it and check it points back
  // up the camera axis, or the number is stamped on a face nobody can see
  const m = new Float64Array(9);
  a.euler(d.yaw, d.pitch, d.roll, m);
  const n = [0, 0, 0];
  a.xf(m, 0, -1, 0, n);
  const eye = [-a.cam.fwd[0], -a.cam.fwd[1], -a.cam.fwd[2]];
  const facing = n[0] * eye[0] + n[1] * eye[1] + n[2] * eye[2];
  assert(facing > 0.9, `the base should face the camera, dot=${facing.toFixed(3)}`);
  // and it should be held on screen, not sliding off the bottom
  const p = a.proj(d.x, d.y, d.z);
  assert(p.x > 0 && p.x < 960 && p.y > 0 && p.y < 600,
    `the reveal should sit on screen, got ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
});

test('the number on the base reads upright and unmirrored', () => {
  /* Catch the transform the game actually hands to the canvas. A flipped
     axis here is invisible to every logic test but shows on screen as an
     upside-down, mirrored number. */
  const mats = [];
  const a = boot();
  const real = a._ctx();
  a._setCtx(new Proxy({}, { get(t, p){
    if (p === 'measureText') return () => ({ width: 30 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop(){} });
    if (p === 'setTransform') return (...v) => { mats.push(v); };
    if (p === 'canvas') return { width: 960, height: 600 };
    return () => {};
  } }));

  const d = a.ducks[0];
  rigCatch(a, d);
  d.num = 8; d.gold = false;
  plungeHook(a, d, 0);
  a.input.down = false;
  step(a, 1.2);
  a.draw();
  a._setCtx(real);

  const dpr = a._dpr();
  // the per-frame DPR reset translates to the origin; the glyph transform is
  // anchored on the plug, so it always carries a translation
  const stamp = mats.filter(m => m.length === 6 && (m[4] !== 0 || m[5] !== 0));
  assert(stamp.length > 0, 'the base number should have been drawn');
  const [ax, ay, bx, by] = stamp[0];
  // text +x must run left-to-right across the screen
  assert(ax > Math.abs(ay), `text baseline should run rightwards, got (${ax.toFixed(1)}, ${ay.toFixed(1)})`);
  // text +y is DOWN in canvas space, so it must map to increasing screen y
  assert(by > Math.abs(bx), `text should run downwards, got (${bx.toFixed(1)}, ${by.toFixed(1)})`);
  // a negative determinant means the glyph comes out mirrored
  const det = ax * by - bx * ay;
  assert(det > 0, `the number is mirrored (determinant ${det.toFixed(1)})`);
  assert(Math.abs(ax) > 2 * dpr, 'the glyph should be big enough to read');
});

test('a landed duck is replaced so the stream never thins out', () => {
  const a = boot();
  const d = a.ducks[0];
  rigCatch(a, d);
  plungeHook(a, d, 0);
  a.input.down = false;
  settle(a);
  assert(a.ducks.length === a.C.N_DUCKS, 'the pond should stay full');
  assert(d.state === 'float', 'the landed duck should be recycled back into the stream');
  assert(d.x < a.C.X0 + 3, 'the replacement should re-enter at the head of the loop');
  assert(a.reveals.length === 0, 'the reveal should be finished');
});

test('numbers roll inside the published table and gold ducks are worth 25', () => {
  const a = boot();
  const allowed = new Set(a.NUM_TABLE.map(r => r[0]));
  a.reseed(99);
  for (let i = 0; i < 500; i++) assert(allowed.has(a.rollNumber()), 'rolled a number outside the table');
  a.reseed(7);
  let sawGold = false;
  for (let i = 0; i < 600; i++){
    const d = a.newDuck(0, 0);
    if (d.gold){ sawGold = true; assert(d.num === 25, 'a gold duck should be worth 25'); }
    else assert(allowed.has(d.num), 'a plain duck should carry a table number');
  }
  assert(sawGold, 'gold ducks should turn up occasionally');
});

// ---- round flow -----------------------------------------------------------
test('a timed round counts down and ends', () => {
  const a = boot();
  a.startRound(false);
  assert(a.G.mode === 'play', 'the round should be running');
  near(a.G.time, a.C.ROUND_TIME, 1e-6, 'the clock should start full');
  step(a, 10);
  assert(a.G.time < a.C.ROUND_TIME - 9, 'the clock should be counting down');
  step(a, a.C.ROUND_TIME);
  assert(a.G.mode === 'over', 'the round should end when the clock runs out');
  assert(a.G.time === 0, 'the clock should stop at zero');
});

test('relaxed mode never runs out of time', () => {
  const a = boot();
  a.startRound(true);
  step(a, 40);
  assert(a.G.mode === 'play', 'relaxed mode should keep going');
  a.draw();
});

test('a new round wipes the previous score and clears the hook', () => {
  const a = boot();
  a.startRound(false);
  a.G.score = 40; a.G.landed = 3;
  a.hook.caught.push(a.ducks[0]); a.ducks[0].state = 'hooked';
  a.startRound(false);
  assert(a.G.score === 0 && a.G.landed === 0, 'the score should reset');
  assert(a.hook.caught.length === 0, 'the hook should start empty');
  assert(a.ducks.every(d => d.state === 'float'), 'every duck should be back in the water');
  near(a.hook.len, a.C.HOOK_MIN, 1e-6, 'the line should start parked');
});

test('the best score persists and only ever climbs', () => {
  const a = boot();
  a.startRound(false);
  a.G.score = 42;
  a.endRound();
  assert(a.G.best === 42, 'a first score should become the best');
  assert(a._store['duck_fishing_best_v1'] === '42', 'the best score should be saved');
  a.startRound(false);
  a.G.score = 7;
  a.endRound();
  assert(a.G.best === 42, 'a worse round should not lower the best');

  const b = boot(42);
  assert(b.G.best === 42, 'the saved best should load on boot');
});

test('a corrupt save falls back to zero', () => {
  const a = boot('not-a-number');
  assert(a.G.best === 0, 'a junk save should not poison the best score');
});

test('the clock formats as minutes and seconds', () => {
  const a = boot();
  assert(a.fmtTime(90) === '1:30', `expected 1:30, got ${a.fmtTime(90)}`);
  assert(a.fmtTime(9) === '0:09', `expected 0:09, got ${a.fmtTime(9)}`);
  assert(a.fmtTime(-3) === '0:00', 'a negative clock should read zero');
});

// ---- render smoke ---------------------------------------------------------
test('draws every game state, including a full hook and a reveal in flight', () => {
  const a = boot();
  a.draw();                       // menu
  a.startRound(false);
  const pair = a.ducks.slice(0, 2);
  for (const d of pair){
    d.state = 'float'; d.yaw = d.pitch = d.roll = 0;
    d.x = 0; d.z = 0; d.y = a.C.FLOAT_Y;
    plungeHook(a, d, 0);
  }
  a.draw();                       // ducks hanging off the hook
  a.input.down = false;
  for (let i = 0; i < 40; i++){ a.update(1 / 60); a.draw(); }   // mid-reveal
  a.G.score = 123; a.G.time = 8;
  a.draw();                       // low-time HUD
  a.endRound();
  a.draw();                       // game over
});

test('survives a resize mid-round', () => {
  const a = boot();
  a.startRound(false);
  step(a, 1);
  a.fit();
  a.draw();
  const p = a.proj(0, 0, 0);
  assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'projection should stay finite after a resize');
});

console.log(`\nduck_fishing: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
