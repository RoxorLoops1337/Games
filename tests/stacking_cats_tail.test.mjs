// Stacking Cats: tail physics (kingdom_tail.js). Headless, no DOM.
import assert from 'node:assert/strict';
import { tailState, stepTail, tailRest, TAIL } from '../stacking_cats/kingdom_tail.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DT = 1 / 60;
const SPEED = 220;

const runInp = (v, extra = {}) => ({ ax: 0, vx: v, vy: 0, face: 1, grounded: true, mood: 'calm', excite: 0, ...extra });
// simulate and record tip angle and every segment angle each frame
function sim(seed, secs, inpAt, dt = DT) {
  const s = tailState(seed); const rec = [];
  const steps = Math.round(secs / dt);
  for (let i = 0; i < steps; i++) { const o = stepTail(s, dt, inpAt(i * dt, i)); rec.push({ tm: i * dt, a: o.a.slice(), tip: o.tip }); }
  return { s, rec };
}
// zero crossings per second of (x - mean) over a window
function crossHz(vals, dt) {
  const mean = vals.reduce((p, c) => p + c, 0) / vals.length;
  let c = 0, prev = vals[0] - mean;
  for (let i = 1; i < vals.length; i++) { const v = vals[i] - mean; if (Math.abs(v) < 1e-5) continue; if ((v > 0) !== (prev > 0) && Math.abs(prev) > 1e-5) c++; prev = v; }
  return c / 2 / (vals.length * dt);
}
const maxVel = (rec, key) => { let m = 0; for (let i = 1; i < rec.length; i++) { const d = key === 'tip' ? Math.abs(rec[i].tip - rec[i - 1].tip) : Math.max(...rec[i].a.map((v, j) => Math.abs(v - rec[i - 1].a[j]))); m = Math.max(m, d); } return m; };

t('running at any speed stays under 1.5 Hz, never at step rate', () => {
  for (const sp of [0.3, 0.6, 1, 1.25]) {
    for (const seed of ['a', 'b', 7]) {
      const { rec } = sim(seed, 10, () => runInp(sp * SPEED));
      const win = rec.filter((r) => r.tm >= 2);
      const hz = crossHz(win.map((r) => r.tip), DT);
      assert.ok(hz < 1.5, `tip ${hz.toFixed(2)} Hz at speed ${sp}`);
      for (let k = 0; k < 4; k++) assert.ok(crossHz(win.map((r) => r.a[k]), DT) < 1.5, `segment ${k} too fast at speed ${sp}`);
    }
  }
});

t('running under accelerate and decelerate cycles still stays slow', () => {
  // start and stop every 2 s, no ringing above 2.5 Hz at any time window of 2 s
  const { rec } = sim('c', 12, (tm) => { const ph = Math.floor(tm / 2) % 2; return runInp(ph ? 0 : SPEED, { ax: 0 }); });
  for (let w = 0; w < 5; w++) {
    const win = rec.filter((r) => r.tm >= w * 2 && r.tm < w * 2 + 2).map((r) => r.tip);
    assert.ok(crossHz(win, DT) < 2.5);
  }
});

t('idle sway is about 0.4 Hz', () => {
  const { rec } = sim('d', 20, () => runInp(0));
  const hz = crossHz(rec.filter((r) => r.tm > 2).map((r) => r.tip), DT);
  assert.ok(hz > 0.25 && hz < 0.6, 'idle ' + hz);
});

t('angular velocity cap, including whips and wags', () => {
  const wild = (tm, i) => ({ ax: ((i * 37) % 7 - 3) * 1500, vx: ((i * 13) % 9 - 4) * 100, vy: ((i * 29) % 11 - 5) * 200, face: i % 5 ? 1 : -1, grounded: i % 17 < 9, mood: ['calm', 'happy', 'sit', 'sleep', 'alert', 'fall'][Math.floor(i / 20) % 6], excite: (i % 10) / 10 });
  for (const dt of [1 / 240, 1 / 60, 1 / 30, 0.1]) {
    const { rec } = sim('e', 20, wild, dt);
    // the cap is on the internal rate; over a frame the mean rate cannot exceed it either
    assert.ok(maxVel(rec, 'seg') / dt <= TAIL.maxW + 1e-6, 'segment rate at dt ' + dt + ': ' + maxVel(rec, 'seg') / dt);
    assert.ok(maxVel(rec, 'tip') / dt <= TAIL.maxTipW + 1e-6, 'tip rate at dt ' + dt);
    for (const r of rec) for (const v of r.a) assert.ok(Math.abs(v) <= TAIL.maxA + 1e-9);
  }
});

t('stable and finite for any dt up to 0.1 and beyond', () => {
  for (const dt of [0.0005, 1 / 60, 0.05, 0.1, 0.5, 5]) {
    const { rec } = sim('f', 8, (tm, i) => runInp(i % 40 < 20 ? SPEED : 0, { ax: i % 40 === 0 ? 1800 : 0, mood: 'happy', excite: 0.9 }), dt);
    for (const r of rec) { assert.ok(Number.isFinite(r.tip)); for (const v of r.a) assert.ok(Math.abs(v) <= TAIL.maxA + 1e-9); }
  }
  // garbage input does not poison the state
  const s = tailState(1);
  const o = stepTail(s, NaN, { ax: NaN, vx: undefined, vy: 'x', mood: 'nope', excite: 9 });
  assert.ok(Number.isFinite(o.tip));
  stepTail(s, DT, {});
});

t('a coarse dt gives about the same motion as a fine one', () => {
  const a = sim('g', 4, () => runInp(SPEED), 1 / 60).rec.at(-1).tip;
  const b = sim('g', 4, () => runInp(SPEED), 0.1).rec.at(-1).tip;
  assert.ok(Math.abs(a - b) < 0.2, `${a} vs ${b}`);
});

t('deterministic, and seeds differ only slightly', () => {
  const inp = (tm, i) => runInp(i % 90 < 45 ? SPEED : 0, { ax: i % 90 === 0 ? 1800 : 0, face: i % 200 < 100 ? 1 : -1 });
  const r1 = sim('same', 6, inp).rec, r2 = sim('same', 6, inp).rec;
  assert.deepEqual(r1, r2);
  const r3 = sim('other', 6, inp).rec;
  assert.notDeepEqual(r1, r3);
  assert.equal(tailState('x').ph, tailState('x').ph);
});

t('settles within 1.5 s after a stop (sit and sleep to a standstill, calm to its sway)', () => {
  for (const mood of ['sit', 'sleep']) {
    const { rec } = sim('h', 5, (tm) => runInp(tm < 2 ? SPEED : 0, { mood }));
    const rest = tailRest(mood);
    const late = rec.filter((r) => r.tm >= 3.5);
    for (const r of late) r.a.forEach((v, k) => assert.ok(Math.abs(v - rest[k]) < 0.06, `${mood} seg ${k} off rest by ${v - rest[k]}`));
  }
  // calm: after the stop, within 1.5 s the angle stays inside the idle sway band and the speed is sway speed only
  const { rec } = sim('i', 6, (tm) => runInp(tm < 2 ? SPEED : 0));
  const rest = tailRest('calm');
  for (const r of rec.filter((q) => q.tm >= 3.5)) r.a.forEach((v, k) => assert.ok(Math.abs(v - rest[k]) < 0.14, 'calm band seg ' + k));
  assert.ok(maxVel(rec.filter((q) => q.tm >= 3.5), 'seg') / DT < 1.2);
});

t('reacts to acceleration: lags, overshoots a little, settles', () => {
  // a hard start: the tail should be pushed down against its running rest, then overshoot back, then settle
  const run = [];
  const s = tailState('j');
  for (let i = 0; i < 120; i++) stepTail(s, DT, runInp(0));
  const base = s.out.tip;
  let v = 0;
  for (let i = 0; i < 180; i++) {
    const going = i < 8;
    v = Math.min(SPEED, v + (going ? 1800 : 0) * DT);
    run.push(stepTail(s, DT, runInp(going ? v : SPEED, { ax: going ? 1800 : 0 })).tip);
  }
  const settled = run.slice(-30).reduce((p, c) => p + c, 0) / 30;
  const min = Math.min(...run.slice(0, 40)), minAt = run.indexOf(min);
  assert.ok(settled < base, 'running tail streams flatter than idle');
  // lag: the first frames after the push are not yet at the settled value
  assert.ok(Math.abs(run[1] - base) < Math.abs(run[0] - settled) + 1e-9 || Math.abs(run[2] - settled) > 0.03, 'lags');
  // follow-through: undershoots the settled value past the bottom, then comes back
  const over = Math.min(...run.slice(5, 60));
  assert.ok(over < settled - 0.01, `overshoots (${over} vs ${settled})`);
  assert.ok(over > settled - 1.2, 'overshoot is modest');
  assert.ok(minAt > 1, 'peak response is delayed, not instant');
  assert.ok(Math.abs(run.at(-1) - settled) < 0.16, 'settles into the running stream band');
});

t('jump whip overshoots, fall flares, landing bounces', () => {
  const s = tailState('k');
  for (let i = 0; i < 60; i++) stepTail(s, DT, runInp(0));
  const rest = s.out.tip;
  const tips = [];
  tips.push(stepTail(s, DT, runInp(0, { vy: -560, grounded: false })).tip);
  for (let i = 0; i < 20; i++) tips.push(stepTail(s, DT, runInp(0, { vy: -560 + i * 28, grounded: false })).tip);
  assert.ok(Math.min(...tips) < rest - 0.15, 'whips down on takeoff');
  assert.ok(tips.at(-1) > Math.min(...tips) + 0.3, 'recovers after the whip');
  // falling flares up
  const f = tailState('k2');
  for (let i = 0; i < 90; i++) stepTail(f, DT, runInp(0, { vy: 500, grounded: false, mood: 'fall' }));
  assert.ok(f.out.tip > rest + 0.3, 'flares: ' + f.out.tip + ' vs ' + rest);
  // landing: impulse down then back
  const before = f.out.tip; let lowest = before;
  for (let i = 0; i < 20; i++) lowest = Math.min(lowest, stepTail(f, DT, runInp(0, { vy: 0, grounded: true })).tip);
  assert.ok(lowest < before - 0.2, 'landing moves the tail');
});

t('happy wag: only for excite > 0.6, capped at 2.5 Hz, amplitude decays', () => {
  const quiet = sim('l', 8, () => runInp(0, { mood: 'happy', excite: 0.5 })).rec;
  const hzQ = crossHz(quiet.filter((r) => r.tm > 1).map((r) => r.tip), DT);
  assert.ok(hzQ < 0.8, 'no wag at excite 0.5: ' + hzQ);
  const calmExcited = sim('l', 8, () => runInp(0, { mood: 'calm', excite: 1 })).rec;
  assert.ok(crossHz(calmExcited.filter((r) => r.tm > 1).map((r) => r.tip), DT) < 0.8, 'calm mood never wags');
  for (const ex of [0.65, 0.8, 1]) {
    const rec = sim('l', 10, () => runInp(0, { mood: 'happy', excite: ex })).rec;
    const early = rec.filter((r) => r.tm > 0.3 && r.tm < 2.3).map((r) => r.tip);
    const hz = crossHz(early, DT);
    assert.ok(hz > 1 && hz <= 2.6, `wag ${hz} Hz at excite ${ex}`);
    const span = (arr) => Math.max(...arr) - Math.min(...arr);
    const late = rec.filter((r) => r.tm > 7.5).map((r) => r.tip);
    assert.ok(span(late) < span(early) * 0.6, 'wag amplitude decays');
  }
  // reduced motion: no wag, no sway
  const red = sim('l', 6, () => runInp(0, { mood: 'happy', excite: 1, reduced: true })).rec.filter((r) => r.tm > 3).map((r) => r.tip);
  assert.ok(Math.max(...red) - Math.min(...red) < 0.02);
});

t('moods have distinct rest poses: sit curls down, sleep wraps further, alert lifts', () => {
  const tip = (m) => tailRest(m).reduce((p, c) => p + c, 0);
  assert.ok(tip('sit') < -1 && tip('sleep') < tip('sit') && tip('alert') > tip('calm') && tip('fall') > tip('calm'));
  for (const m of ['calm', 'happy', 'sit', 'sleep', 'alert', 'fall']) {
    const s = tailState(m);
    for (let i = 0; i < 240; i++) stepTail(s, DT, runInp(0, { mood: m }));
    const rest = tailRest(m);
    s.out.a.forEach((v, k) => assert.ok(Math.abs(v - rest[k]) < 0.2, m + ' seg ' + k));
  }
  assert.equal(tailState(1).out.a.length, TAIL.segs);
});

t('facing does not change the local tail angles', () => {
  const a = sim('m', 4, () => runInp(SPEED, { face: 1 })).rec.at(-1).tip;
  const b = sim('m', 4, () => runInp(-SPEED, { face: -1 })).rec.at(-1).tip;
  assert.ok(Math.abs(a - b) < 1e-9);
});

t('no em or en dashes in the module', async () => {
  const { readFileSync } = await import('node:fs');
  assert.ok(!/[—–]/.test(readFileSync(new URL('../stacking_cats/kingdom_tail.js', import.meta.url), 'utf8')));
});

console.log(`stacking_cats_tail: ${n} tests passed`);
