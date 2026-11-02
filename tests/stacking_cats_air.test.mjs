// Stacking Cats: Whiskerton Walk air and transition animation (kingdom_air.js). Headless, no DOM.
import assert from 'node:assert/strict';
import { airState, stepAir, stepDust, pushDust, landDepth, DUST_CAP, AIR } from '../stacking_cats/kingdom_air.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DT = 1 / 60;

// drive a scripted sequence: [{pose, vy, secs, ...flags}]; returns frames
function run(script, seed = 'tabby') {
  const a = airState(seed), frames = [];
  let poseT = 0, last = null;
  for (const seg of script) {
    const steps = Math.round(seg.secs / DT);
    for (let i = 0; i < steps; i++) {
      poseT = seg.pose === last ? poseT + DT : 0; last = seg.pose;
      const inp = { pose: seg.pose, poseT, vy: seg.vy || 0, impact: seg.impact || 0, grounded: seg.grounded !== undefined ? seg.grounded : !(seg.pose === 'jump' || seg.pose === 'fall'), face: 1, lift: seg.lift };
      if (i === 0) { inp.turned = seg.turned; inp.startedRun = seg.startedRun; inp.stopped = seg.stopped; inp.interact = seg.interact; }
      frames.push(stepAir(a, DT, inp));
    }
  }
  return frames;
}
const JUMP = [
  { pose: 'idle', secs: 0.3 }, { pose: 'jump', vy: -480, secs: 0.15 }, { pose: 'jump', vy: -200, secs: 0.15 },
  { pose: 'jump', vy: -20, secs: 0.1 }, { pose: 'fall', vy: 200, secs: 0.15 }, { pose: 'fall', vy: 600, secs: 0.15 },
];
const full = (impact) => [...JUMP, { pose: 'land', impact, secs: 0.18 }, { pose: 'idle', secs: 0.8 }];

t('outputs are bounded and finite across every pose and a nasty input mix', () => {
  const a = airState('x');
  const poses = ['idle', 'run', 'jump', 'fall', 'land', 'sit', 'sleep', 'zzz', undefined];
  for (let i = 0; i < 3000; i++) {
    const o = stepAir(a, [0, 1 / 60, 0.1, 5, NaN][i % 5], { pose: poses[i % poses.length], poseT: (i % 50) / 60, vy: [-9999, 0, 9999, NaN][i % 4], impact: [0, 400, 1e9, NaN][i % 4], grounded: i % 3 !== 0, turned: i % 7 === 0, startedRun: i % 11 === 0, stopped: i % 13 === 0, interact: i % 17 === 0, lift: i % 19 === 0 });
    for (const k of ['sx', 'sy']) { assert.ok(Number.isFinite(o[k]) && o[k] >= 0.6 && o[k] <= 1.3, k + ' ' + o[k]); }
    assert.ok(Number.isFinite(o.bob) && Math.abs(o.bob) <= 6); assert.ok(Number.isFinite(o.tilt) && Math.abs(o.tilt) <= 0.2);
    assert.ok(o.squashT >= 0 && o.squashT <= 1 && o.flip >= 0 && o.flip <= 1);
  }
});

t('jump has a crouch, then a stretch, then a fall stretch', () => {
  const f = run(JUMP);
  const pre = f[17], minCrouch = Math.min(...f.slice(18, 24).map((o) => o.sy)), rise = Math.max(...f.slice(24, 40).map((o) => o.sy));
  assert.ok(Math.abs(pre.sy - 1) < 0.01);
  assert.ok(minCrouch < 0.97, 'crouch ' + minCrouch);
  assert.ok(rise > 1.06, 'stretch ' + rise);
  assert.ok(f[f.length - 1].sy > 1.03, 'fall stretch');
  assert.ok(f.some((o) => o.phase === 'crouch') && f.some((o) => o.phase === 'rise') && f.some((o) => o.phase === 'hang') && f.some((o) => o.phase === 'fall'));
});

t('landing squash is deeper for a harder impact (monotonic) and settles within 0.4 s', () => {
  let prev = -1, prevDepth = -1;
  for (const imp of [0, 150, 260, 400, 600, 800, 1000, 1100, 1500]) {
    const f = run(full(imp));
    const start = Math.round((0.3 + 0.7) / DT);
    const min = Math.min(...f.slice(start).map((o) => o.sy));
    const depth = 1 - min;
    assert.ok(depth >= prev - 1e-9, `impact ${imp}: ${depth} < ${prev}`); prev = depth;
    assert.ok(landDepth(imp) >= prevDepth); prevDepth = landDepth(imp);
    // 0.4 s after the land frame the spring is invisible
    const landIdx = Math.round(JUMP.reduce((s, x) => s + x.secs, 0) / DT);
    for (const o of f.slice(landIdx + Math.round(AIR.settleT / DT) + 1)) {
      assert.ok(Math.abs(o.sy - 1) < 0.012 && Math.abs(o.sx - 1) < 0.012, `ringing at impact ${imp}: ${o.sy}`);
    }
  }
  assert.ok(prev > 0.15, 'a hard landing squashes visibly');
});

t('no ringing: after the settle time the squash does not oscillate', () => {
  const f = run(full(1100));
  const landIdx = Math.round(JUMP.reduce((s, x) => s + x.secs, 0) / DT);
  const tail = f.slice(landIdx + 24).map((o) => o.sy);
  assert.ok(Math.max(...tail) - Math.min(...tail) < 0.02);
  assert.equal(f[f.length - 1].squashT, 1);
});

t('turn squash dips and returns, flip progresses 0 to 1', () => {
  const f = run([{ pose: 'run', secs: 0.2 }, { pose: 'run', secs: 0.5, turned: true }, { pose: 'run', secs: 0.5 }]);
  const seg = f.slice(12, 12 + 30);
  assert.ok(Math.min(...seg.map((o) => o.sx)) < 0.9);
  assert.ok(Math.abs(f[f.length - 1].sx - 1) < 0.01);
  assert.equal(f[12].flip < 0.2, true); assert.equal(f[12 + 15].flip, 1);
});

t('dust: run start, skid, hard land emit; soft land does not; cap 24', () => {
  const total = (script) => run(script).reduce((s, o) => s + o.dust.length, 0);
  assert.ok(total([{ pose: 'idle', secs: 0.1 }, { pose: 'run', secs: 0.1, startedRun: true }]) >= 3);
  assert.ok(total([{ pose: 'run', secs: 0.1 }, { pose: 'idle', secs: 0.1, stopped: true }]) >= 3);
  assert.ok(total(full(900)) >= 2);
  assert.equal(total(full(100)), 0);
  const list = [];
  for (let i = 0; i < 100; i++) { pushDust(list, run([{ pose: 'idle', secs: 0.02 }, { pose: 'run', secs: 0.02, startedRun: true }]).flatMap((o) => o.dust)); stepDust(list, 0.001); assert.ok(list.length <= DUST_CAP); }
  assert.equal(list.length, DUST_CAP);
  const raw = Array.from({ length: 60 }, () => ({ x: 0, y: 0, vx: 10, vy: -5, life: 0.3, size: 3 }));
  stepDust(raw, 0.01); assert.ok(raw.length <= DUST_CAP);
  for (let i = 0; i < 60; i++) stepDust(list, DT);
  assert.equal(list.length, 0, 'dust dies');
});

t('dust particles are finite and do not teleport', () => {
  const list = pushDust([], run(full(1100)).flatMap((o) => o.dust));
  assert.ok(list.length > 0);
  for (let i = 0; i < 30; i++) {
    const before = list.map((p) => [p.x, p.y]);
    stepDust(list, DT);
    list.forEach((p, k) => { assert.ok(Number.isFinite(p.x + p.y + p.size)); assert.ok(Math.hypot(p.x - before[k][0], p.y - before[k][1]) < 3); });
  }
});

t('lift ride pose and interact pounce are bounded and return to neutral', () => {
  const f = run([{ pose: 'idle', secs: 0.2 }, { pose: 'jump', lift: true, grounded: false, secs: 1.2 }, { pose: 'land', secs: 0.18 }, { pose: 'idle', secs: 0.8 }]);
  assert.ok(f.some((o) => o.phase === 'lift'));
  assert.ok(Math.abs(f[f.length - 1].sy - 1) < 0.01 && Math.abs(f[f.length - 1].bob) < 0.05);
  const p = run([{ pose: 'idle', secs: 0.2 }, { pose: 'idle', secs: 0.6, interact: true }, { pose: 'idle', secs: 0.5 }]);
  assert.ok(Math.min(...p.map((o) => o.sy)) < 0.95 && Math.max(...p.map((o) => o.sy)) > 1.05);
  assert.ok(Math.abs(p[p.length - 1].sy - 1) < 0.01);
});

t('deterministic: same seed and inputs give identical output, different seeds only differ in dust', () => {
  const s = full(900);
  assert.deepEqual(run(s, 'a'), run(s, 'a'));
  const a = run(s, 'a'), b = run(s, 'b');
  assert.deepEqual(a.map((o) => [o.sx, o.sy]), b.map((o) => [o.sx, o.sy]));
  assert.notDeepEqual(a.map((o) => o.dust), b.map((o) => o.dust));
});

t('frame rate independent: 30 and 120 fps agree on the squash', () => {
  const drive = (dt) => {
    const a = airState('q'); let pt = 0, last = '', mins = 1;
    const seq = [['idle', 0.3, 0], ['fall', 0.2, 500], ['land', 0.18, 700], ['idle', 0.6, 0]];
    for (const [pose, secs] of seq) for (let i = 0; i < Math.round(secs / dt); i++) {
      pt = pose === last ? pt + dt : 0; last = pose;
      const o = stepAir(a, dt, { pose, poseT: pt, vy: pose === 'fall' ? 500 : 0, impact: 700, grounded: pose !== 'fall' });
      mins = Math.min(mins, o.sy);
    }
    return mins;
  };
  assert.ok(Math.abs(drive(1 / 30) - drive(1 / 120)) < 0.03);
});

t('no discontinuities at pose transitions (per frame step stays small)', () => {
  const scripts = [
    full(1100), full(300),
    [{ pose: 'idle', secs: 0.3 }, { pose: 'run', secs: 0.3, startedRun: true }, { pose: 'run', secs: 0.3, turned: true }, { pose: 'idle', secs: 0.4, stopped: true }, { pose: 'sit', secs: 0.4 }, { pose: 'sleep', secs: 0.4 }],
    [{ pose: 'run', secs: 0.3 }, { pose: 'jump', vy: -480, secs: 0.2 }, { pose: 'fall', vy: 100, secs: 0.2 }, { pose: 'land', impact: 900, secs: 0.2 }, { pose: 'run', secs: 0.3 }],
    [{ pose: 'idle', secs: 0.2 }, { pose: 'jump', lift: true, grounded: false, secs: 1.2 }, { pose: 'land', secs: 0.18 }, { pose: 'idle', secs: 0.5, interact: true }],
  ];
  for (const s of scripts) {
    const f = run(s);
    for (let i = 1; i < f.length; i++) {
      assert.ok(Math.abs(f[i].sy - f[i - 1].sy) < 0.2, `sy jump ${i}: ${f[i - 1].sy} -> ${f[i].sy}`);
      assert.ok(Math.abs(f[i].sx - f[i - 1].sx) < 0.2, `sx jump ${i}`);
      assert.ok(Math.abs(f[i].tilt - f[i - 1].tilt) < 0.03, `tilt jump ${i}`);
      assert.ok(Math.abs(f[i].bob - f[i - 1].bob) < 0.8, `bob jump ${i}`);
    }
  }
});

t('reduced motion: no dust, no squash kicks, no bob', () => {
  const a = airState('r'); let worst = 0, dust = 0;
  for (let i = 0; i < 200; i++) {
    const o = stepAir(a, DT, { pose: i < 100 ? 'fall' : 'land', poseT: 0.1, vy: 500, impact: 1100, grounded: i >= 100, turned: i === 50, startedRun: i === 10, reduced: true });
    worst = Math.max(worst, Math.abs(o.sy - 1), Math.abs(o.sx - 1), Math.abs(o.bob), Math.abs(o.tilt)); dust += o.dust.length;
  }
  assert.equal(dust, 0); assert.ok(worst < 0.06, 'worst ' + worst);
});

console.log(`stacking_cats_air: ${n} groups passed`);
