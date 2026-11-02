// Stacking Cats: the gait of the walking cat (kingdom_gait.js). Headless, pure.
import assert from 'node:assert/strict';
import { gaitState, stepGait, cadence, strideLen, GAIT } from '../stacking_cats/kingdom_gait.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DT = 1 / 60;
const KEYS = ['phase', 'blend', 'bob', 'tilt', 'sx', 'sy', 'pawL', 'pawR'];
const circ = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 1 - d); };

// run a speed profile, returns the frames
function sim(profile, secs, { grounded = () => true } = {}) {
  const g = gaitState(), out = [];
  for (let i = 0; i < 90; i++) stepGait(g, DT, profile(0), grounded(0), 1);   // warm up so a cold start is not measured
  const steps = Math.round(secs / DT);
  for (let i = 0; i < steps; i++) {
    const tm = i * DT;
    const o = stepGait(g, DT, profile(tm), grounded(tm), 1);
    out.push({ ...o, speed: profile(tm), total: g.total });
  }
  return out;
}
const maxJump = (frames, k) => {
  let m = 0;
  for (let i = 1; i < frames.length; i++) m = Math.max(m, k === 'phase' ? circ(frames[i].phase, frames[i - 1].phase) : Math.abs(frames[i][k] - frames[i - 1][k]));
  return m;
};
// per output limits on frame to frame change at 60 fps
const LIMIT = { phase: 0.06, blend: 0.1, bob: 1.0, tilt: 0.04, sx: 0.025, sy: 0.025, pawL: 0.25, pawR: 0.25 };

t('cadence never exceeds the cap at any speed', () => {
  for (let s = 0; s <= 400; s += 0.5) assert.ok(cadence(s) <= 5 && cadence(s) <= GAIT.cadenceCap, 'cadence at ' + s);
  for (let s = 0; s <= 400; s += 5) {
    const g = gaitState(); let last = 0, steps = 0;
    for (let i = 0; i < 120; i++) { const b = g.total; stepGait(g, DT, s, true, 1); if (i > 60) steps += (g.total - b) * 2; last = i; }
    assert.ok(steps / ((last - 60) * DT) <= 5, 'measured steps/s at ' + s);
  }
});

t('natural cadence: walking 2 to 2.6, running up to about 4.5', () => {
  assert.ok(cadence(40) >= 1.95 && cadence(110) <= 2.65 && cadence(110) >= 2.5);
  for (let s = 40; s <= 110; s += 5) assert.ok(cadence(s) >= 1.95 && cadence(s) <= 2.65, 'walk ' + s);
  assert.ok(cadence(GAIT.maxSpeed) >= 4.3 && cadence(GAIT.maxSpeed) <= 4.8);
  for (let s = 1; s < 400; s++) assert.ok(cadence(s + 1) >= cadence(s) - 1e-9, 'cadence is monotone');
});

t('stride phase is proportional to distance, not time', () => {
  for (const sp of [60, 100, 150, 220]) {
    const g = gaitState(); for (let i = 0; i < 60; i++) stepGait(g, DT, sp, true, 1);   // settle
    const t0 = g.total, secs = 3;
    for (let i = 0; i < secs * 60; i++) stepGait(g, DT, sp, true, 1);
    const dist = sp * secs, strides = g.total - t0;
    assert.ok(Math.abs(strides - dist / strideLen(sp)) < 1e-6, 'strides at ' + sp);
  }
  // same distance at a different frame rate gives the same stride count
  const a = gaitState(), b = gaitState();
  for (let i = 0; i < 120; i++) stepGait(a, 1 / 60, 120, true, 1);
  for (let i = 0; i < 60; i++) stepGait(b, 1 / 30, 120, true, 1);
  assert.ok(Math.abs(a.total - b.total) < 1e-9);
  // standing still does not step
  const s = gaitState(); for (let i = 0; i < 120; i++) stepGait(s, DT, 0, true, 1);
  assert.equal(s.total, 0);
  // the air does not step either
  const f = gaitState(); for (let i = 0; i < 120; i++) stepGait(f, DT, 200, false, 1);
  assert.equal(f.total, 0);
});

t('continuity across a speed sweep', () => {
  const up = sim((tm) => Math.min(GAIT.maxSpeed, tm * 60), 4.5);
  const down = sim((tm) => Math.max(0, GAIT.maxSpeed - tm * 60), 4.5);
  for (const k of KEYS) { assert.ok(maxJump(up, k) <= LIMIT[k], 'sweep up ' + k + ' ' + maxJump(up, k)); assert.ok(maxJump(down, k) <= LIMIT[k], 'sweep down ' + k + ' ' + maxJump(down, k)); }
});

t('continuity across hard stop and start (speed steps)', () => {
  // 0 -> 220 at once, then 220 -> 0 at once, repeated, plus a mid speed jump
  const prof = (tm) => { const c = Math.floor(tm / 1.2) % 4; return c === 0 ? 0 : c === 1 ? 220 : c === 2 ? 90 : 0; };
  const fr = sim(prof, 9.6);
  for (const k of KEYS) assert.ok(maxJump(fr, k) <= LIMIT[k], 'step ' + k + ' ' + maxJump(fr, k));
  // landing from the air and jumping
  const air = sim(() => 150, 4, { grounded: (tm) => !(tm > 1 && tm < 1.6) });
  for (const k of KEYS) assert.ok(maxJump(air, k) <= LIMIT[k], 'air ' + k + ' ' + maxJump(air, k));
});

t('outputs are bounded and finite', () => {
  const fr = sim((tm) => 250 * Math.abs(Math.sin(tm * 1.7)) + (tm > 3 ? 100 : 0), 8);
  for (const o of fr) {
    for (const k of KEYS) assert.ok(Number.isFinite(o[k]), k);
    assert.ok(o.bob >= 0 && o.bob <= GAIT.BOB_MAX);
    assert.ok(Math.abs(o.tilt) <= 0.2);
    assert.ok(o.sx >= 0.9 && o.sx <= 1.1 && o.sy >= 0.9 && o.sy <= 1.1);
    assert.ok(o.pawL >= 0 && o.pawL <= 1 && o.pawR >= 0 && o.pawR <= 1);
    assert.ok(o.phase >= 0 && o.phase < 1 && o.blend >= 0 && o.blend <= 1);
    assert.ok(['stop', 'walk', 'trot', 'run'].includes(o.kind));
  }
  const g = gaitState();
  for (const bad of [NaN, Infinity, -5, undefined]) {
    const o = stepGait(g, DT, bad, true, 1);
    for (const k of KEYS) assert.ok(Number.isFinite(o[k]));
  }
  const big = stepGait(gaitState(), 5, 220, true, 1);   // a huge dt is clamped
  assert.ok(Number.isFinite(big.bob));
});

t('gait kinds follow speed in order and blend rises with speed', () => {
  const fr = sim((tm) => Math.min(GAIT.maxSpeed, tm * 70), 4);
  const order = ['stop', 'walk', 'trot', 'run'];
  let idx = 0;
  for (const o of fr) { const i = order.indexOf(o.kind); assert.ok(i >= idx && i - idx <= 1, 'kind order'); idx = i; }
  assert.equal(fr[fr.length - 1].kind, 'run');
  assert.equal(fr[0].kind, 'stop');
  for (let i = 1; i < fr.length; i++) assert.ok(fr[i].blend >= fr[i - 1].blend - 1e-9);
  const still = sim(() => 0, 1);
  assert.ok(still[still.length - 1].amp < 0.01 && still[still.length - 1].bob < 0.01);
});

t('footfalls alternate L and R, two per stride, none while still or airborne', () => {
  const fr = sim(() => 120, 6);
  const falls = fr.flatMap((o) => o.footfalls);
  assert.ok(falls.length > 10);
  for (let i = 1; i < falls.length; i++) assert.notEqual(falls[i].foot, falls[i - 1].foot);
  const total = fr[fr.length - 1].total;
  assert.ok(Math.abs(falls.length - (total - fr[0].total) * 2) <= 2);
  for (const f of falls) assert.ok(Number.isFinite(f.x) && (f.foot === 'L' || f.foot === 'R'));
  assert.equal(sim(() => 0, 2).flatMap((o) => o.footfalls).length, 0);
  assert.equal(sim(() => 200, 2, { grounded: () => false }).flatMap((o) => o.footfalls).length, 0);
  // a big dt never drops footfalls
  const g = gaitState(); let c = 0;
  for (let i = 0; i < 20; i++) c += stepGait(g, 0.1, 220, true, 1).footfalls.length;
  assert.equal(c, Math.floor(g.total * 2));
});

t('start leans in with a small anticipation, stopping skids back', () => {
  const g = gaitState(); for (let i = 0; i < 30; i++) stepGait(g, DT, 0, true, 1);
  let minSy = 2, maxLean = -1;
  for (let i = 0; i < 40; i++) { const o = stepGait(g, DT, Math.min(220, i * 220 * DT / 0.12 * 1), true, 1); minSy = Math.min(minSy, o.sy); maxLean = Math.max(maxLean, o.lean); }
  assert.ok(minSy < 0.99, 'anticipation squash ' + minSy);
  assert.ok(maxLean > 0.03, 'lean in ' + maxLean);
  for (let i = 0; i < 90; i++) stepGait(g, DT, 220, true, 1);
  let minLean = 1, skid = 0, last;
  for (let i = 0; i < 40; i++) { last = stepGait(g, DT, Math.max(0, 220 - i * 220 * DT / 0.1), true, 1); minLean = Math.min(minLean, last.lean); skid = Math.max(skid, last.skid); }
  assert.ok(minLean < -0.05, 'lean back ' + minLean);
  assert.ok(skid > 0.2, 'skid ' + skid);
  for (let i = 0; i < 90; i++) last = stepGait(g, DT, 0, true, 1);
  assert.ok(Math.abs(last.tilt) < 0.01 && last.skid < 0.01, 'settles upright');
  // steady running leans slightly forward, walking less
  const run = sim(() => 220, 2).pop(), walk = sim(() => 80, 2).pop();
  assert.ok(run.tilt > walk.tilt - 0.02 && walk.tilt > 0);
});

t('determinism', () => {
  const prof = (tm) => 130 + 90 * Math.sin(tm * 2.3);
  const a = sim(prof, 5), b = sim(prof, 5);
  assert.deepEqual(a, b);
});

t('no dashes in the module', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../stacking_cats/kingdom_gait.js', import.meta.url), 'utf8');
  assert.ok(!/[—–]/.test(src));
});

console.log('gait tests passed:', n);
