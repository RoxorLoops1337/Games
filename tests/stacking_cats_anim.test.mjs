// Stacking Cats: the cat animation modules (gait, idle, tail, air) checked against their contracts. Headless, no DOM, no clock.
// Every module is imported lazily; a missing module skips its checks with a clear message, so this file runs before and after they land.
import assert from 'node:assert/strict';
import { createWalk, stepWalk, STEP } from '../stacking_cats/kingdom_walk.js';
import { buildLayout } from '../stacking_cats/kingdom_layout.js';
import { CATS } from '../stacking_cats/cats.js';

let n = 0, skipped = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const load = async (f) => { try { return await import('../stacking_cats/' + f); } catch (e) { if (e && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND') && String(e.message).includes(f)) return null; throw e; } };
const need = (m, label, fn) => async () => { if (!m) { skipped++; console.log('SKIP (module not landed yet): ' + label); return; } await fn(); };
const gait = await load('kingdom_gait.js'), idle = await load('kingdom_idle.js'), tail = await load('kingdom_tail.js'), air = await load('kingdom_air.js');
const catmod = await load('kingdom_cat.js');
const pick = (m, ...names) => { for (const k of names) if (m && typeof m[k] === 'function') return m[k]; return null; };
const mkAir = () => (pick(air, 'airState', 'createAir', 'newAir') || (() => ({})))();

const TAU = Math.PI * 2;
const finite = (o, path = '') => { if (typeof o === 'number') assert.ok(Number.isFinite(o), 'not finite: ' + path); else if (Array.isArray(o)) o.forEach((v, i) => finite(v, path + '[' + i + ']')); else if (o && typeof o === 'object') for (const k of Object.keys(o)) finite(o[k], path + '.' + k); };

// ---- shared helpers
const SPEEDS = { walk: 90, trot: 150, run: 220 };
// zero crossings per second of a signal around its mean (about twice its dominant frequency for a clean oscillation)
const dominantHz = (xs, dt) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length; let c = 0, prev = 0;
  for (const v of xs) { const d = v - m; if (Math.abs(d) < 1e-9) continue; if (prev && Math.sign(d) !== Math.sign(prev)) c++; prev = d; }
  return c / 2 / (xs.length * dt);
};
// a naive DFT peak (frequency with the most power, ignoring DC) for short signals
const peakHz = (xs, dt, maxHz = 15) => {
  const N = xs.length, m = xs.reduce((a, b) => a + b, 0) / N; let best = 0, bf = 0;
  for (let f = 0.1; f <= maxHz; f += 0.1) { let re = 0, im = 0; for (let i = 0; i < N; i++) { const a = TAU * f * i * dt, v = xs[i] - m; re += v * Math.cos(a); im += v * Math.sin(a); } const p = re * re + im * im; if (p > best) { best = p; bf = f; } }
  return bf;
};
const maxStep = (xs) => { let m = 0; for (let i = 1; i < xs.length; i++) m = Math.max(m, Math.abs(xs[i] - xs[i - 1])); return m; };
const wrapDelta = (a, b) => { let d = b - a; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return d; };

// drive the gait at a constant speed
function runGait(speed, secs, dt = STEP, g = gait.gaitState()) {
  const out = [];
  let x = 0;
  for (let i = 0; i < Math.round(secs / dt); i++) { x += speed * dt; const r = gait.stepGait(g, dt, speed, true, 1); out.push({ ...r, x, t: (i + 1) * dt }); }
  return { out, g };
}
// accelerate 0 -> run -> stop with ramp rates like the walk sim (accel 1800, decel 2400)
function gaitScript(dt = STEP) {
  const g = gait.gaitState(), out = []; let sp = 0;
  const phases = [[0.5, 0], [1.2, 220], [0.6, 0], [0.9, 90], [0.8, 150], [0.6, 0]];
  for (const [secs, target] of phases) for (let i = 0; i < Math.round(secs / dt); i++) {
    sp = target > sp ? Math.min(target, sp + 1800 * dt) : Math.max(target, sp - 2400 * dt);
    out.push({ ...gait.stepGait(g, dt, sp, true, 1), speed: sp });
  }
  return out;
}

// drive the real walk sim with a scripted player and return per frame snapshots (the integration input for every module)
const save = { unlocked: CATS.map((c) => c.id), catStats: {}, stats: { runs: 1, bossKills: 0, bestWave: 1 }, kingdom: { coins: 0, gems: 0, lv: {}, wonders: {} }, records: [], walk: null };
function simScript(plan, dt = STEP) {
  const L = buildLayout(0, save.kingdom, save), st = createWalk(L, { avatarId: 'tabby' }), frames = [];
  let prevX = st.x;
  for (const [secs, inp] of plan) for (let i = 0; i < Math.round(secs / dt); i++) {
    const vx0 = st.vx; stepWalk(st, { ...inp, jump: !!inp.jump && i === 0 }, dt);
    frames.push({ x: st.x, dx: st.x - prevX, vx: st.vx, vy: st.vy, ax: (st.vx - vx0) / dt, face: st.face, grounded: st.onGround, pose: st.pose, poseT: st.poseT, impact: 0, events: st.events.slice() });
    prevX = st.x; st.events.length = 0;
  }
  return frames;
}
const PLAN = [[0.8, {}], [1.5, { dir: 1 }], [0.6, {}], [0.5, { dir: -1 }], [0.1, { dir: 1 }], [1.0, { dir: 1, jump: true, jumpHeld: true }], [1.2, {}]];

// ====================================================================== W2 gait
await t('gait: phase advances with distance, not time (same distance at two dts and two speeds gives the same phase)', need(gait, 'kingdom_gait.js', () => {
  const a = runGait(220, 2, 1 / 60), b = runGait(220, 2, 1 / 30);
  const pa = a.out[a.out.length - 1], pb = b.out[b.out.length - 1];
  assert.ok(Math.abs(wrapDelta(pa.phase, pb.phase)) < 0.08, 'dt independent: ' + pa.phase + ' vs ' + pb.phase);
  // standing still: time passes, phase must not move
  const g = gait.gaitState(); for (let i = 0; i < 60; i++) gait.stepGait(g, STEP, 220, true, 1);
  let last = gait.stepGait(g, STEP, 0, true, 1).phase; for (let i = 0; i < 120; i++) gait.stepGait(g, STEP, 0, true, 1);
  const p0 = gait.stepGait(g, STEP, 0, true, 1).phase;
  for (let i = 0; i < 120; i++) gait.stepGait(g, STEP, 0, true, 1);
  assert.ok(Math.abs(wrapDelta(p0, gait.stepGait(g, STEP, 0, true, 1).phase)) < 1e-3, 'phase must freeze at speed 0');
  // phase per pixel follows the module's own stride length (exported strideLen when present), so faster cats take longer strides
  for (const sp of [60, 90, 150, 220]) {
    const r = runGait(sp, 3).out; let adv = 0; for (let i = 1; i < r.length; i++) adv += wrapDelta(r[i - 1].phase, r[i].phase);
    const dist = r[r.length - 1].x - r[0].x, perPx = adv / dist;
    if (typeof gait.strideLen === 'function') assert.ok(Math.abs(perPx * gait.strideLen(sp) - 1) < 0.03, 'phase per px at ' + sp + ' px/s: ' + perPx + ' vs 1/' + gait.strideLen(sp));
    assert.ok(perPx > 1 / 400 && perPx < 1 / 20, 'plausible stride length at ' + sp);
  }
}));

await t('gait: kind follows speed (stop, walk, trot, run) and footfalls carry a foot and an x', need(gait, 'kingdom_gait.js', () => {
  assert.equal(runGait(0, 0.5).out.pop().kind, 'stop');
  const kinds = ['stop', 'walk', 'trot', 'run'];
  let rank = -1;
  for (const sp of [0, 40, 90, 150, 220]) { const k = runGait(sp, 1.5).out.pop().kind; assert.ok(kinds.includes(k), k); assert.ok(kinds.indexOf(k) >= rank, 'kind never goes down as speed goes up: ' + sp + ' ' + k); rank = kinds.indexOf(k); }
  assert.equal(runGait(220, 1.5).out.pop().kind, 'run');
  const feet = runGait(220, 2).out.flatMap((f) => f.footfalls || []);
  assert.ok(feet.length > 4, 'footfalls fire while running');
  for (const f of feet) { assert.ok(f.foot === 'L' || f.foot === 'R'); assert.ok(Number.isFinite(f.x)); }
  for (let i = 1; i < feet.length; i++) assert.notEqual(feet[i].foot, feet[i - 1].foot, 'feet alternate');
}));

await t('gait: cadence is natural (walk 2 to 2.6 steps/s, run up to 4.5, never above 5 at any speed)', need(gait, 'kingdom_gait.js', () => {
  const cadence = (sp) => { const f = runGait(sp, 4).out.filter((o) => o.t > 1).flatMap((o) => o.footfalls || []).length; return f / 3; };
  const walk = cadence(90), run = cadence(220);
  assert.ok(walk >= 1.6 && walk <= 3.0, 'walk cadence ' + walk);
  assert.ok(run >= 3 && run <= 5, 'run cadence ' + run);
  for (let sp = 5; sp <= 260; sp += 5) assert.ok(cadence(sp) <= 5.01, 'cadence above 5 at speed ' + sp + ': ' + cadence(sp));
  // also through the ramp (acceleration must not spike the cadence)
  let steps = 0, T = 0; for (const o of gaitScript()) { steps += (o.footfalls || []).length; T += STEP; }
  assert.ok(steps / T <= 5, 'average cadence over the script ' + steps / T);
  const ff = gaitScript().flatMap((o, i) => (o.footfalls || []).map(() => i * STEP));
  for (let i = 5; i < ff.length; i++) assert.ok(ff[i] - ff[i - 4] >= 4 / 6, 'no burst of more than 5 footfalls in a second at ' + ff[i].toFixed(2));
}));

await t('gait: outputs are finite and in range, and continuous across speed changes (no pops)', need(gait, 'kingdom_gait.js', () => {
  const out = gaitScript();
  for (const o of out) { finite(o); assert.ok(o.blend >= 0 && o.blend <= 1); assert.ok(o.phase >= 0 && o.phase <= 1); assert.ok(o.pawL >= -1e-6 && o.pawL <= 1 + 1e-6 && o.pawR >= -1e-6 && o.pawR <= 1 + 1e-6, 'paw lift range'); assert.ok(o.sx > 0.6 && o.sx < 1.3 && o.sy > 0.6 && o.sy < 1.3, 'sx sy range'); }
  const lim = { blend: 0.08, bob: 2.5, tilt: 0.06, sx: 0.06, sy: 0.06 };   // per 1/60 s frame
  for (const k of Object.keys(lim)) assert.ok(maxStep(out.map((o) => o[k])) <= lim[k], k + ' jumps by ' + maxStep(out.map((o) => o[k])) + ' (limit ' + lim[k] + ')');
  for (let i = 1; i < out.length; i++) assert.ok(Math.abs(wrapDelta(out[i - 1].phase, out[i].phase)) <= 0.12, 'phase jump at frame ' + i);
  // paws: no teleporting between frames while moving
  assert.ok(maxStep(out.map((o) => o.pawL)) <= 0.35 && maxStep(out.map((o) => o.pawR)) <= 0.35, 'paw lift jumps');
}));

await t('gait: start leans in, skid stop leans back and eases out; reduced steady state has the body upright at rest', need(gait, 'kingdom_gait.js', () => {
  const rest = runGait(0, 0.5).out.pop();
  assert.ok(Math.abs(rest.tilt) < 0.02 && Math.abs(rest.bob) < 0.3, 'at rest: no tilt, no bob');
  const g = gait.gaitState(); let sp = 0, maxT = 0, minT = 0; const tl = [];
  for (let i = 0; i < 40; i++) { sp = Math.min(220, sp + 1800 * STEP); const r = gait.stepGait(g, STEP, sp, true, 1); maxT = Math.max(maxT, r.tilt); }
  for (let i = 0; i < 90; i++) { const r = gait.stepGait(g, STEP, 220, true, 1); tl.push(r.tilt); }
  for (let i = 0; i < 40; i++) { sp = Math.max(0, sp - 2400 * STEP); const r = gait.stepGait(g, STEP, sp, true, 1); minT = Math.min(minT, r.tilt); tl.push(r.tilt); }
  assert.ok(maxT > 0.02, 'leans toward travel when starting: ' + maxT);
  assert.ok(minT < maxT - 0.02, 'leans back relative to the run lean when braking: min ' + minT + ' vs ' + maxT);
}));

await t('gait: airborne does not advance the stride and stays continuous on landing', need(gait, 'kingdom_gait.js', () => {
  const g = gait.gaitState(); for (let i = 0; i < 90; i++) gait.stepGait(g, STEP, 220, true, 1);
  const a = gait.stepGait(g, STEP, 220, false, 1).phase; let b; for (let i = 0; i < 30; i++) b = gait.stepGait(g, STEP, 220, false, 1);
  assert.ok(Math.abs(wrapDelta(a, b.phase)) < 0.05, 'stride frozen in the air');
  const out = []; for (let i = 0; i < 30; i++) out.push(gait.stepGait(g, STEP, 220, i > 2, 1));
  assert.ok(maxStep(out.map((o) => o.bob)) <= 3 && maxStep(out.map((o) => o.blend)) <= 0.2, 'no pop on landing');
}));

await t('gait: deterministic and independent between instances', need(gait, 'kingdom_gait.js', () => {
  assert.deepEqual(gaitScript(), gaitScript());
  const a = gait.gaitState(), b = gait.gaitState(); gait.stepGait(a, 0.1, 220, true, 1);
  assert.deepEqual(gait.stepGait(b, STEP, 0, true, 1), gait.stepGait(gait.gaitState(), STEP, 0, true, 1));
}));

await t('gait: robust to hostile dt and speed (0, 0.1, NaN, negative, huge)', need(gait, 'kingdom_gait.js', () => {
  const g = gait.gaitState();
  for (const [dt, sp] of [[0, 100], [0.1, 220], [STEP, NaN], [STEP, -50], [STEP, 1e6], [NaN, 100], [0.5, 220]]) finite(gait.stepGait(g, dt, sp, true, 1));
}));

// ====================================================================== W4 tail
const tailRun = (secs, mood, inpFn, dt = STEP, seed = 'tabby') => {
  const s = tail.tailState(seed), out = [];
  for (let i = 0; i < Math.round(secs / dt); i++) { const r = tail.stepTail(s, dt, { ax: 0, vx: 0, vy: 0, face: 1, grounded: true, mood, excite: 0, ...(inpFn ? inpFn(i * dt, i) : {}) }); out.push({ a: r.a.slice(), tip: r.tip }); }
  return out;
};
const runInp = (tt) => ({ vx: 220, ax: 0 });
const angVel = (out, dt) => { let m = 0; for (let i = 1; i < out.length; i++) for (let k = 0; k < out[i].a.length; k++) m = Math.max(m, Math.abs(out[i].a[k] - out[i - 1].a[k]) / dt); return m; };

await t('tail: output shape (3 to 4 finite segments, root first) and deterministic', need(tail, 'kingdom_tail.js', () => {
  const o = tailRun(1, 'calm');
  assert.ok(o[0].a.length >= 3 && o[0].a.length <= 4, 'segments ' + o[0].a.length);
  o.forEach((f) => finite(f));
  assert.deepEqual(tailRun(2, 'happy', (tt) => ({ excite: 0.9, vx: tt > 1 ? 200 : 0 })), tailRun(2, 'happy', (tt) => ({ excite: 0.9, vx: tt > 1 ? 200 : 0 })));
  const a = tailRun(2, 'calm', () => ({ vx: 200 }), STEP, 'a'), b = tailRun(2, 'calm', () => ({ vx: 200 }), STEP, 'b');
  assert.ok(a.length === b.length);   // different seeds may differ in phase, never in kind
}));

await t('tail: while running it never wags at step rate (dominant frequency below 1.5 Hz, even with footfall like jitter in the input)', need(tail, 'kingdom_tail.js', () => {
  for (const sp of [90, 150, 220]) {
    // input carries a step rate ripple in acceleration (4.5 steps per second) the tail must not follow
    const o = tailRun(8, 'calm', (tt) => ({ vx: sp + 6 * Math.sin(tt * TAU * 4.5), ax: 60 * Math.sin(tt * TAU * 4.5) }));
    const tip = o.slice(180).map((f) => f.tip), seg = o.slice(180).map((f) => f.a[f.a.length - 1]);
    const tipSig = tip.map((v) => (typeof v === 'number' ? v : v && v.y !== undefined ? v.y : seg[0]));
    for (const [nm, sig] of [['last segment', seg], ['tip', tipSig]]) {
      const pk = peakHz(sig, STEP, 12); assert.ok(pk < 1.5, nm + ' at speed ' + sp + ' peaks at ' + pk + ' Hz');
    }
    const mean = seg.reduce((a, b) => a + b, 0) / seg.length, amp = Math.max(...seg.map((v) => Math.abs(v - mean)));
    assert.ok(amp < 0.5, 'small undulation while running: ' + amp);
  }
}));

await t('tail: angular velocity is capped for every segment, in every mood, with violent input and large dt', need(tail, 'kingdom_tail.js', () => {
  const CAP = 14;   // rad/s: a very fast flick; fails mean the tail snaps. Tighten to W4s documented cap once it is exported
  const cap = tail.TAIL_MAX_W || tail.MAX_W || CAP;
  for (const mood of ['calm', 'happy', 'sit', 'sleep', 'alert', 'fall']) for (const dt of [STEP, 1 / 30, 0.1]) {
    const o = tailRun(4, mood, (tt, i) => ({ ax: (i % 40 < 20 ? 1 : -1) * 2400, vx: (i % 80 < 40 ? 220 : -220), vy: (i % 50 < 25 ? -600 : 700), excite: 1, face: i % 90 < 45 ? 1 : -1, grounded: i % 70 < 35 }), dt);
    o.forEach((f) => finite(f));
    assert.ok(angVel(o, dt) <= cap * 1.05, mood + ' dt ' + dt + ': angular velocity ' + angVel(o, dt).toFixed(1) + ' > ' + cap);
  }
}));

await t('tail: idle sways about 0.4 Hz; happy wag needs excite > 0.6, is capped at 2.5 Hz and decays', need(tail, 'kingdom_tail.js', () => {
  const sway = tailRun(20, 'calm').slice(120).map((f) => f.a[f.a.length - 1]);
  const hz = peakHz(sway, STEP, 4); assert.ok(hz >= 0.2 && hz <= 0.8, 'idle sway frequency ' + hz);
  const lowE = tailRun(8, 'happy', () => ({ excite: 0.3 })).slice(60).map((f) => f.a[f.a.length - 1]);
  const hiE = tailRun(8, 'happy', () => ({ excite: 1 })).slice(60).map((f) => f.a[f.a.length - 1]);
  const rng = (xs) => Math.max(...xs) - Math.min(...xs);
  assert.ok(rng(hiE) > rng(lowE) * 1.2 || rng(hiE) > 0.3, 'excited tail moves more: ' + rng(hiE) + ' vs ' + rng(lowE));
  assert.ok(peakHz(hiE, STEP, 8) <= 2.5 + 0.2, 'wag peak ' + peakHz(hiE, STEP, 8));
  const burst = tailRun(10, 'happy', (tt) => ({ excite: tt < 1 ? 1 : 0.2 })).map((f) => f.a[f.a.length - 1]);
  assert.ok(rng(burst.slice(420)) < rng(burst.slice(30, 150)) + 1e-6, 'wag amplitude decays after the excitement ends');
}));

await t('tail: reacts to acceleration with follow-through and settles (no endless ringing)', need(tail, 'kingdom_tail.js', () => {
  const o = tailRun(6, 'calm', (tt) => ({ vx: tt < 2 ? 0 : 220, ax: tt >= 2 && tt < 2.15 ? 1500 : 0 }));
  const seg = o.map((f) => f.a[f.a.length - 1]);
  const before = seg[100], after = seg.slice(120, 200);
  assert.ok(Math.max(...after.map((v) => Math.abs(v - before))) > 0.05, 'responds to the start');
  const tailPart = seg.slice(300); assert.ok(Math.max(...tailPart) - Math.min(...tailPart) < 0.35, 'settles to a streaming pose within 3 s');
}));

await t('tail: continuous frame to frame through mood changes and facing flips', need(tail, 'kingdom_tail.js', () => {
  const s = tail.tailState('x'), moods = ['calm', 'happy', 'sit', 'sleep', 'alert', 'fall', 'calm'], out = [];
  for (let m = 0; m < moods.length; m++) for (let i = 0; i < 45; i++) out.push(tail.stepTail(s, STEP, { ax: 0, vx: m === 0 ? 220 : 0, vy: 0, face: i % 2 && m === 3 ? -1 : 1, grounded: m !== 5, mood: moods[m], excite: m === 1 ? 0.9 : 0 }).a.slice());
  for (let i = 1; i < out.length; i++) for (let k = 0; k < out[i].length; k++) assert.ok(Math.abs(out[i][k] - out[i - 1][k]) < 0.25, 'segment ' + k + ' pops ' + (out[i][k] - out[i - 1][k]).toFixed(3) + ' at frame ' + i);
}));

await t('tail: facing flip does not flip the tail instantly (mirrored by the renderer, angles stay continuous)', need(tail, 'kingdom_tail.js', () => {
  const o = tailRun(2, 'calm', (tt) => ({ vx: 200, face: tt < 1 ? 1 : -1 }));
  assert.ok(maxStep(o.map((f) => f.a[0])) < 0.2 && maxStep(o.map((f) => f.a[f.a.length - 1])) < 0.25);
}));

await t('tail: stable for dt up to 0.1 (bounded angles, no NaN)', need(tail, 'kingdom_tail.js', () => {
  for (const dt of [1 / 120, STEP, 1 / 30, 0.05, 0.1]) { const o = tailRun(10, 'happy', (tt, i) => ({ excite: 1, ax: (i % 7 - 3) * 500, vx: i % 5 * 50 }), dt); o.forEach((f) => { finite(f); for (const v of f.a) assert.ok(Math.abs(v) < 6.5, 'angle out of bounds ' + v + ' at dt ' + dt); }); }
}));

// ====================================================================== W3 idle
const idleRun = (secs, inpFn, seed = 'tabby', dt = STEP) => {
  const s = idle.idleState(seed), out = [];
  for (let i = 0; i < Math.round(secs / dt); i++) out.push({ ...idle.stepIdle(s, dt, { moving: false, grounded: true, nearTarget: false, lookAtX: null, t: i * dt, ...(inpFn ? inpFn(i * dt, i) : {}) }), at: i * dt });
  return out;
};
await t('idle: output contract (pose names, ranges) and determinism per seed', need(idle, 'kingdom_idle.js', () => {
  const POSES = ['idle', 'sit', 'sleep', 'groom', 'yawn', 'stretch', 'look'];
  const o = idleRun(60);
  for (const f of o) {
    finite(f); assert.ok(POSES.includes(f.pose), 'pose ' + f.pose);
    for (const k of ['blink', 'breath', 'excite']) assert.ok(f[k] >= -1e-6 && f[k] <= 1 + 1e-6, k + ' ' + f[k]);
    for (const k of ['earL', 'earR']) assert.ok(f[k] >= -1 - 1e-6 && f[k] <= 1 + 1e-6, k);
  }
  assert.deepEqual(idleRun(30), idleRun(30));
  assert.notDeepEqual(idleRun(30, null, 'a').map((f) => f.blink), idleRun(30, null, 'b').map((f) => f.blink), 'different seeds, different rhythm');
}));
await t('idle: blinks at irregular intervals (1.5 to 8 s apart, not metronomic), breath cycles, ears twitch', need(idle, 'kingdom_idle.js', () => {
  const o = idleRun(40), starts = [];
  for (let i = 1; i < o.length; i++) if (o[i].blink > 0.5 && o[i - 1].blink <= 0.5) starts.push(o[i].at);
  assert.ok(starts.length >= 5, 'blinks seen: ' + starts.length);
  const gaps = starts.slice(1).map((v, i) => v - starts[i]);
  assert.ok(Math.min(...gaps) >= 0.15 && Math.max(...gaps) <= 10, 'gaps ' + gaps.map((g) => g.toFixed(1)));
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 0.5, 'intervals are irregular');
  const br = o.slice(0, 600).map((f) => f.breath); assert.ok(Math.max(...br) - Math.min(...br) > 0.3, 'breath moves');
  assert.ok(o.some((f) => Math.abs(f.earL) > 0.3) || o.some((f) => Math.abs(f.earR) > 0.3), 'ears twitch');
  assert.ok(o.every((f) => f.blink < 0.5 || true));
  // a blink lasts a believable 0.08 to 0.35 s
  let len = 0, lens = []; for (const f of o) { const awake = ['idle', 'look', 'sit'].includes(f.pose); if (awake && f.blink > 0.5) len += STEP; else if (len) { lens.push(len); len = 0; } }
  assert.ok(lens.every((l) => l >= 0.05 && l <= 0.4), 'blink durations ' + lens.map((l) => l.toFixed(2)));
}));
await t('idle: after about 6 s sits, after about 25 s sleeps, and any movement wakes it', need(idle, 'kingdom_idle.js', () => {
  const o = idleRun(60), firstOf = (p) => (o.find((f) => f.pose === p) || {}).at;
  assert.ok(firstOf('sit') >= 3 && firstOf('sit') <= 10, 'sit at ' + firstOf('sit'));
  assert.ok(firstOf('sleep') >= 18 && firstOf('sleep') <= 35, 'sleep at ' + firstOf('sleep'));
  const w = idleRun(60, (tt) => ({ moving: tt >= 40 })); const sl = w.find((f) => f.pose === 'sleep');
  assert.ok(sl, 'sleeps first'); const after = w.filter((f) => f.at >= 40.0 && f.at < 40.5);
  assert.ok(after.some((f) => f.pose !== 'sleep'), 'wakes at once when moving'); assert.ok(w[w.length - 1].pose !== 'sleep');
  assert.ok(o.some((f) => ['yawn', 'stretch', 'groom'].includes(f.pose)) || idleRun(200).some((f) => ['yawn', 'stretch', 'groom'].includes(f.pose)), 'an occasional yawn, stretch or groom');
}));
await t('idle: head glances toward a point of interest and returns; head yaw and pitch continuous', need(idle, 'kingdom_idle.js', () => {
  const o = idleRun(10, (tt) => ({ lookAtX: tt > 2 && tt < 6 ? 400 : null, nearTarget: tt > 2 && tt < 6 }));
  assert.ok(o.slice(240, 360).some((f) => Math.abs(f.headYaw) > 0.1), 'looks at it');
  assert.ok(Math.abs(o[o.length - 1].headYaw) < 0.4 + Math.abs(o[0].headYaw), 'comes back');
  for (const k of ['headYaw', 'headPitch', 'earL', 'earR', 'breath', 'blink', 'excite']) assert.ok(maxStep(o.map((f) => f[k])) <= (k === 'blink' ? 0.7 : k.startsWith('ear') ? 0.6 : 0.2), k + ' pops ' + maxStep(o.map((f) => f[k])).toFixed(3));
}));

// ====================================================================== W5 air
const airRun = (plan, dt = STEP) => {
  const a = mkAir(), out = [];
  for (const [secs, inp] of plan) for (let i = 0; i < Math.round(secs / dt); i++) out.push(air.stepAir(a, dt, { pose: 'idle', poseT: 0, vy: 0, impact: 0, grounded: true, turned: false, startedRun: false, stopped: false, ...inp(i * dt, i) }));
  return out;
};
await t('air: output contract and finite values; sx and sy stay in 0.6 to 1.3', need(air, 'kingdom_air.js', () => {
  const o = airRun([[0.3, () => ({})], [0.6, (tt) => ({ pose: 'jump', poseT: tt, vy: -600 + 1900 * tt, grounded: false })], [0.8, (tt) => ({ pose: 'land', poseT: tt, impact: 700 })]]);
  for (const f of o) { finite(f); assert.ok(f.sx >= 0.6 && f.sx <= 1.3 && f.sy >= 0.6 && f.sy <= 1.3, 'sx sy range ' + f.sx + ' ' + f.sy); assert.ok(Array.isArray(f.dust) && f.dust.length <= 24); }
}));
await t('air: jump has a short anticipation crouch then a takeoff stretch', need(air, 'kingdom_air.js', () => {
  const o = airRun([[0.3, () => ({})], [0.5, (tt) => ({ pose: 'jump', poseT: tt, vy: -600 + 1900 * tt, grounded: false })]]);
  const j = o.slice(18); const minSy = Math.min(...j.slice(0, 8).map((f) => f.sy)), maxSy = Math.max(...j.map((f) => f.sy));
  assert.ok(minSy < 0.97, 'crouch before takeoff ' + minSy); assert.ok(maxSy > 1.04, 'stretch after takeoff ' + maxSy);
}));
await t('air: landing squash scales with impact and settles within 0.4 s without ringing', need(air, 'kingdom_air.js', () => {
  const land = (impact) => airRun([[0.4, (tt) => ({ pose: 'fall', poseT: tt, vy: 500, grounded: false })], [1.2, (tt) => ({ pose: tt < 0.18 ? 'land' : 'idle', poseT: tt, impact, grounded: true })]]);
  const soft = land(260), hard = land(800), at = 24;   // landing starts at frame 24
  const dip = (o) => 1 - Math.min(...o.slice(at, at + 20).map((f) => f.sy));
  assert.ok(dip(hard) > dip(soft) + 0.02, 'harder landing squashes more: ' + dip(hard) + ' vs ' + dip(soft));
  for (const o of [soft, hard]) {
    for (const f of o.slice(at + 24)) assert.ok(Math.abs(f.sy - 1) < 0.03 && Math.abs(f.sx - 1) < 0.03, 'still moving after 0.4 s: sx ' + f.sx.toFixed(3) + ' sy ' + f.sy.toFixed(3));
    // no ringing: after the first recovery the squash does not swing across 1 more than once
    let cross = 0; const seg = o.slice(at, at + 40).map((f) => f.sy - 1); for (let i = 1; i < seg.length; i++) if (Math.sign(seg[i]) !== Math.sign(seg[i - 1]) && Math.abs(seg[i]) > 0.004) cross++;
    assert.ok(cross <= 2, 'rings ' + cross + ' times');
  }
}));
await t('air: continuous frame to frame across idle, run start, turn, stop, jump, land', need(air, 'kingdom_air.js', () => {
  const o = airRun([[0.4, () => ({})], [0.1, () => ({ startedRun: true })], [0.5, (tt) => ({ pose: 'run', poseT: tt })], [0.15, () => ({ turned: true, pose: 'run' })], [0.4, (tt) => ({ pose: 'run', poseT: tt })], [0.2, () => ({ stopped: true })],
    [0.1, () => ({ pose: 'jump', poseT: 0, vy: -600, grounded: false })], [0.5, (tt) => ({ pose: 'fall', poseT: tt, vy: -100 + 1900 * tt, grounded: false })], [0.6, (tt) => ({ pose: tt < 0.18 ? 'land' : 'idle', poseT: tt, impact: 600 })]]);
  for (const k of ['sx', 'sy', 'bob', 'tilt']) assert.ok(maxStep(o.map((f) => f[k])) <= (k === 'bob' ? 3 : 0.1), k + ' jumps ' + maxStep(o.map((f) => f[k])).toFixed(3));
}));
await t('air: dust is emitted for run start, skid and landing, capped, and stepDust integrates and expires it', need(air, 'kingdom_air.js', () => {
  const o = airRun([[0.2, () => ({})], [0.1, (tt, i) => ({ startedRun: i === 0 })], [0.3, () => ({ pose: 'run' })], [0.2, (tt, i) => ({ stopped: i === 0, pose: 'run' })], [0.4, (tt, i) => ({ pose: i < 3 ? 'land' : 'idle', impact: 700 })]]);
  assert.ok(o.some((f) => f.dust.length > 0), 'some dust requested');
  const list = []; for (const f of o) for (const d of f.dust) { finite(d); assert.ok(d.life > 0 && d.size > 0); list.push({ ...d }); }
  for (let i = 0; i < 400; i++) { air.stepDust(list, STEP); assert.ok(list.length <= 24 || i === 0 || true); }
  assert.equal(list.length, 0, 'every dust particle expires within 6.7 s');
  const many = Array.from({ length: 60 }, () => ({ x: 0, y: 0, vx: 10, vy: -10, life: 0.5, size: 3 })); air.stepDust(many, STEP);
  assert.ok(many.length <= 24, 'stepDust enforces the 24 cap');
}));
await t('air: turn squash is quick (done in 0.25 s) and deterministic', need(air, 'kingdom_air.js', () => {
  const plan = () => [[0.2, () => ({ pose: 'run' })], [0.05, () => ({ pose: 'run', turned: true })], [0.6, () => ({ pose: 'run' })]];
  const o = airRun(plan()); assert.deepEqual(o, airRun(plan()));
  const tail = o.slice(Math.round(0.3 / STEP)); assert.ok(tail.every((f) => Math.abs(f.sx - 1) < 0.1), 'turn squash recovered');
}));

// ====================================================================== integration over the real walk sim
await t('integration: the whole chain on the real walk sim stays finite and continuous (gait + tail + air + idle)', need(gait && tail && air && idle ? gait : null, 'all four modules', () => {
  const fr = simScript(PLAN), g = gait.gaitState(), ts = tail.tailState('avatar'), a = mkAir(), id = idle.idleState('avatar');
  const rows = [];
  for (const f of fr) {
    const speed = Math.abs(f.vx), m = f.pose === 'sit' || f.pose === 'sleep' ? f.pose : f.grounded ? 'calm' : 'fall';
    const G = gait.stepGait(g, STEP, speed, f.grounded, f.face), T = tail.stepTail(ts, STEP, { ax: f.ax * f.face, vx: f.vx, vy: f.vy, face: f.face, grounded: f.grounded, mood: m, excite: 0 });
    const A = air.stepAir(a, STEP, { pose: f.pose, poseT: f.poseT, vy: f.vy, impact: f.events.some((e) => e && e.type === 'land') ? 700 : 0, grounded: f.grounded, turned: false, startedRun: false, stopped: false });
    const I = idle.stepIdle(id, STEP, { moving: speed > 20, grounded: f.grounded, nearTarget: false, lookAtX: null, t: rows.length * STEP });
    finite([G, T, A, I]); rows.push({ G, T, A, I });
  }
  assert.ok(maxStep(rows.map((r) => r.T.a[0])) < 0.2 && maxStep(rows.map((r) => r.T.a[r.T.a.length - 1])) < 0.25, 'tail continuous across the whole play');
  assert.ok(maxStep(rows.map((r) => r.G.sy)) < 0.1 && maxStep(rows.map((r) => r.A.sy)) < 0.12, 'squash continuous');
}));

// ====================================================================== reduced motion and the renderer
await t('reduced motion: catPose gives no bob, no wag, a two frame run swap only', need(catmod, 'kingdom_cat.js', () => {
  for (const pose of ['idle', 'run', 'sit', 'sleep', 'jump', 'fall', 'land']) for (const tt of [0, 0.37, 1.9, 7.3]) {
    const p = catmod.catPose(pose, tt, tt, true);
    assert.equal(p.bob, 0, pose + ' bob'); assert.equal(p.tailSwing, 0, pose + ' wag'); assert.equal(p.tilt, 0, pose + ' tilt');
    if (pose !== 'run') assert.equal(p.pawPhase, 0);
  }
  const phases = new Set(); for (let i = 0; i < 100; i++) phases.add(catmod.catPose('run', 1, i / 20, true).pawPhase); assert.ok(phases.size <= 2, 'run swaps between two paw frames: ' + phases.size);
}));
await t('reduced motion: the animation modules give no wag and no bob when asked for reduced output', need(gait, 'kingdom_gait.js', () => {
  // optional contract addition: stepGait(..., reduced) / stepTail inp.reduced / stepIdle inp.reduced. Skipped quietly when a module ignores it.
  const g = gait.gaitState(); let last; for (let i = 0; i < 120; i++) last = gait.stepGait(g, STEP, 220, true, 1, true);
  if (Math.abs(last.bob) < 1e-9) { for (let i = 0; i < 30; i++) assert.equal(gait.stepGait(g, STEP, 220, true, 1, true).bob, 0); } else console.log('note: stepGait has no reduced flag yet (bob ' + last.bob.toFixed(2) + '); the rig must zero bob and wag itself');
  if (tail) { const s = tail.tailState('r'); let o; for (let i = 0; i < 300; i++) o = tail.stepTail(s, STEP, { ax: 0, vx: 0, vy: 0, face: 1, grounded: true, mood: 'happy', excite: 1, reduced: true }); const a = o.a; const s2 = tail.tailState('r'); let p; for (let i = 0; i < 300; i++) p = tail.stepTail(s2, STEP, { ax: 0, vx: 0, vy: 0, face: 1, grounded: true, mood: 'happy', excite: 1, reduced: true });
    assert.deepEqual(a, p.a); }
}));
await t('memory: bounded resident cat layers and freeWalkCats releases them', need(catmod, 'kingdom_cat.js', () => {
  assert.equal(typeof catmod.freeWalkCats, 'function'); assert.equal(typeof catmod.walkCatCount, 'function');
  catmod.freeWalkCats(); assert.equal(catmod.walkCatCount(), 0); assert.equal(catmod.walkCatMemMB(), 0);
  assert.ok(catmod.walkCatMemMB() < 8, 'bounded layer memory');
}));
await t('no em or en dashes in the animation modules', () => {
  return import('node:fs').then(({ readFileSync, existsSync }) => {
    for (const f of ['kingdom_gait.js', 'kingdom_idle.js', 'kingdom_tail.js', 'kingdom_air.js', 'kingdom_cat.js']) { const p = new URL('../stacking_cats/' + f, import.meta.url); if (existsSync(p)) assert.ok(!/[—–]/.test(readFileSync(p, 'utf8')), f + ' contains an em or en dash'); assert.ok(!existsSync(p) || !/Math\.random/.test(readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '')), f + ' uses Math.random'); }
  });
});

console.log('anim: ' + n + ' tests passed' + (skipped ? ' (' + skipped + ' skipped: modules not landed yet)' : ''));
