// Stacking Cats: idle behaviours of the walking cat (kingdom_idle.js). Headless, no DOM.
import assert from 'node:assert/strict';
import { idleState, stepIdle, reducedIdle, IDLE } from '../stacking_cats/kingdom_idle.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const DT = 1 / 60;
const STILL = { moving: false, grounded: true, nearTarget: false };
// run a seeded cat; script(time) gives the input; returns frames with copies of the output
function run(seed, secs, script = () => STILL, dt = DT) {
  const s = idleState(seed), fr = [];
  for (let tt = 0; tt < secs; tt += dt) fr.push({ t: tt, ...stepIdle(s, dt, script(tt)) });
  return { s, fr };
}
const NUM = ['blink', 'headYaw', 'headPitch', 'earL', 'earR', 'breath', 'excite', 'sitAmt', 'sleepAmt', 'startle'];

await t('determinism per seed, different seeds differ', () => {
  const a = run('tabby', 40).fr, b = run('tabby', 40).fr, c = run('ember', 40).fr;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((f) => f.blink), c.map((f) => f.blink));
  assert.deepEqual(run(7, 10).fr, run(7, 10).fr);
});

await t('sit and sleep timing ranges over many seeds', () => {
  for (let k = 0; k < 40; k++) {
    const { fr } = run('cat' + k, 40);
    const sit = fr.find((f) => f.pose === 'sit' || f.sitAmt > 0.5), sleep = fr.find((f) => f.pose === 'sleep');
    assert.ok(sit && sit.t >= 4.5 && sit.t <= 8, 'sit at ' + (sit && sit.t));
    assert.ok(sleep && sleep.t >= 21.9 && sleep.t <= 28.1, 'sleep at ' + (sleep && sleep.t));
    assert.ok(!fr.some((f) => f.t < 5 && f.pose === 'sleep' || f.t < 5.1 && f.pose === 'sit'));
    const z = fr.find((f) => f.zzz);
    assert.ok(z && z.t > sleep.t && z.t < sleep.t + 3, 'zzz follows sleep');
    assert.ok(fr.filter((f) => f.t > 31).every((f) => f.pose === 'sleep' && f.zzz));
  }
});

await t('blink rate is one per 2 to 7 s, double blinks count once', () => {
  let total = 0, secs = 0;
  for (let k = 0; k < 30; k++) {
    const { fr } = run('b' + k, 20);   // standing, sitting and drowsy, before sleep
    const rises = [];
    for (let i = 1; i < fr.length; i++) if (fr[i - 1].blink < 0.85 && fr[i].blink >= 0.85) rises.push(fr[i].t);
    const clusters = rises.filter((r, i) => i === 0 || r - rises[i - 1] > 0.6);
    total += clusters.length; secs += 20;
    for (let i = 1; i < clusters.length; i++) {
      const g = clusters[i] - clusters[i - 1];
      assert.ok(g >= 1.9 && g <= 7.6, 'blink gap ' + g);
    }
    assert.ok(clusters.length >= 2, 'blinks at all');
  }
  const per = secs / total;
  assert.ok(per >= 2 && per <= 7, 'mean seconds per blink ' + per);
});

await t('events happen: look, yawn, stretch, groom, with sane durations', () => {
  const seen = {}, dur = {};
  for (let k = 0; k < 60; k++) {
    const { fr } = run('e' + k, 26);
    let cur = null, st = 0;
    for (const f of fr) {
      if (f.pose !== cur) {
        if (cur && ['look', 'yawn', 'stretch', 'groom'].includes(cur) && f.pose !== 'sleep' && !(cur !== 'groom' && f.pose === 'sit' && f.sitAmt < 0.2 && f.t < 8)) { (dur[cur] ||= []).push(f.t - st); }   // skip events cut off by the posture change
        cur = f.pose; st = f.t; if (!seen[cur]) seen[cur] = 0; seen[cur]++;
      }
    }
  }
  for (const p of ['idle', 'sit', 'sleep', 'look', 'yawn', 'stretch', 'groom']) assert.ok(seen[p] > 0, 'never saw ' + p);
  const lim = { look: [1.3, 3.2], yawn: [1.2, 2.2], stretch: [1.7, 2.5], groom: [2.9, 5.1] };
  for (const [k, [lo, hi]] of Object.entries(lim)) for (const d of dur[k] || []) assert.ok(d >= lo - 0.05 && d <= hi + 0.05 || k === 'yawn', `${k} lasted ${d}`);
  for (const d of dur.stretch || []) assert.ok(d >= 1.7 && d <= 2.5);
  for (const d of dur.groom || []) assert.ok(d >= 2.9 && d <= 5.1);
});

await t('a yawn comes before the cat falls asleep', () => {
  for (let k = 0; k < 20; k++) {
    const { fr } = run('y' + k, 30);
    const sl = fr.find((f) => f.pose === 'sleep');
    const before = fr.filter((f) => f.t < sl.t && f.t > sl.t - 2.2);
    assert.ok(before.some((f) => f.pose === 'yawn'), 'yawn before sleep');
  }
});

await t('outputs bounded, finite and continuous (no pops) at 60 fps and 20 fps', () => {
  // wake from sleep, move, stop, sleep again
  const script = (tt) => ({ moving: tt > 33 && tt < 36, grounded: !(tt > 40 && tt < 40.4), nearTarget: tt > 10 && tt < 16, lookAtX: tt > 8 ? 500 : undefined, catX: 300, poke: tt > 38 && tt < 38.05 });
  for (const dt of [DT, 0.05]) {
    const { fr } = run('smooth', 60, script, dt);
    const lim = dt === DT ? 0.4 : 0.8;
    for (let i = 0; i < fr.length; i++) {
      const f = fr[i];
      for (const key of NUM) {
        assert.ok(Number.isFinite(f[key]), key + ' finite');
        const lo = ['headYaw', 'headPitch', 'earL', 'earR'].includes(key) ? -1 : 0;
        assert.ok(f[key] >= lo - 1e-9 && f[key] <= 1 + 1e-9, `${key} ${f[key]} out of range`);
        if (i) {
          const d = Math.abs(f[key] - fr[i - 1][key]);
          const cap = key === 'blink' ? lim * 1.6 : lim;
          assert.ok(d <= cap, `${key} jumped ${d} at ${f.t.toFixed(2)} dt ${dt}`);
        }
      }
    }
  }
});

await t('wake on any input with a startle: movement, poke, airborne', () => {
  for (const [name, inp] of [['move', { moving: true, grounded: true }], ['poke', { poke: true, grounded: true }], ['air', { grounded: false }]]) {
    const s = idleState('w'), T = 30;
    for (let tt = 0; tt < T; tt += DT) stepIdle(s, DT, STILL);
    assert.equal(s.out.pose, 'sleep');
    let peak = 0, o;
    for (let i = 0; i < 40; i++) { o = stepIdle(s, DT, inp); peak = Math.max(peak, o.startle); }
    assert.ok(peak > 0.6, name + ' startle ' + peak);
    assert.equal(o.pose, 'idle'); assert.ok(!o.zzz); assert.equal(s.idleT, 0);
    for (let i = 0; i < 90; i++) o = stepIdle(s, DT, inp);
    assert.ok(o.sleepAmt < 0.01 && o.sitAmt < 0.01 && o.startle < 0.05 && o.blink < 0.9, 'back to neutral');
    // and the timers restart from zero: no sit right after
    for (let i = 0; i < 60 * 3; i++) o = stepIdle(s, DT, STILL);
    assert.notEqual(o.pose, 'sit'); assert.notEqual(o.pose, 'sleep');
  }
  // moving from plain standing causes no startle
  const s = idleState('w2'); let o;
  for (let i = 0; i < 60; i++) stepIdle(s, DT, STILL);
  for (let i = 0; i < 30; i++) { o = stepIdle(s, DT, { moving: true }); assert.equal(o.startle, 0); }
});

await t('glance toward a point of interest', () => {
  const s = idleState('g'); let o;
  for (let i = 0; i < 120; i++) o = stepIdle(s, DT, { ...STILL, nearTarget: true, lookAtX: 400, catX: 200 });
  assert.ok(o.headYaw > 0.5, 'looks right ' + o.headYaw);
  assert.ok(o.excite > 0.3 && o.earL > 0.1 - 0.7);
  for (let i = 0; i < 180; i++) o = stepIdle(s, DT, { ...STILL, nearTarget: true, lookAtX: 0, catX: 200 });
  assert.ok(o.headYaw < -0.5, 'looks left ' + o.headYaw);
  // never turns the head while asleep
  const z = idleState('g2');
  for (let i = 0; i < 60 * 40; i++) o = stepIdle(z, DT, { ...STILL, nearTarget: true, lookAtX: 400, catX: 200 });
  assert.equal(o.pose, 'sleep'); assert.ok(o.headYaw < 0.4 && o.headPitch < -0.5);
});

await t('breathing and ear twitches are alive; sleep is slower and eyes shut', () => {
  const { fr } = run('life', 5);
  const br = fr.map((f) => f.breath);
  assert.ok(Math.max(...br) - Math.min(...br) > 0.9, 'breath swings');
  let cross = 0; for (let i = 1; i < br.length; i++) if (br[i - 1] < 0.5 && br[i] >= 0.5) cross++;
  assert.ok(cross >= 1 && cross <= 3, 'standing breath about 0.3 Hz, got ' + cross);
  let flicks = 0;
  for (let k = 0; k < 10; k++) { const f = run('t' + k, 10).fr; if (f.some((x) => Math.abs(x.earL - x.earR) > 0.2 || Math.abs(x.earL) > 0.3)) flicks++; }
  assert.ok(flicks >= 9, 'ears twitch within 10 s');
  const z = run('z', 45).fr.slice(-600);
  assert.ok(z.every((f) => f.blink > 0.95 && f.sleepAmt > 0.95 && f.earL < 0));
});

await t('reduced motion zeroes the motion', () => {
  const s = idleState('r');
  for (let i = 0; i < 60 * 12; i++) {
    const o = stepIdle(s, DT, { ...STILL, nearTarget: true, lookAtX: 1, reduced: true });
    assert.ok(o.blink === 0 && o.headYaw === 0 && o.headPitch === 0 && o.earL === 0 && o.earR === 0 && o.breath === 0.5 && o.excite === 0 && o.startle === 0, 'still');
    assert.ok(o.pose === 'idle' || o.pose === 'sit');
  }
  const z = idleState('r2'); let o;
  for (let i = 0; i < 60 * 40; i++) o = stepIdle(z, DT, { ...STILL, reduced: true });
  assert.equal(o.pose, 'sleep'); assert.equal(o.blink, 1);
  assert.equal(reducedIdle({ pose: 'groom', idleT: 9 }).pose, 'sit');
});

await t('robust: bad dt and inputs never break it, large dt is split', () => {
  const s = idleState(undefined);
  for (const dt of [NaN, -1, 0, Infinity, 5, 0.1]) {
    const o = stepIdle(s, dt, { lookAtX: NaN, catX: Infinity });
    for (const k of NUM) assert.ok(Number.isFinite(o[k]), k);
  }
  assert.ok(stepIdle(idleState(1), 0.016).pose);
  // a coarse 0.1 s step reaches sleep at about the same time as 1/60
  const a = idleState('dt'), b = idleState('dt'); let ta = 0, tb = 0;
  for (let tt = 0; tt < 40; tt += 0.1) if (!ta && stepIdle(a, 0.1, STILL).pose === 'sleep') ta = tt;
  for (let tt = 0; tt < 40; tt += DT) if (!tb && stepIdle(b, DT, STILL).pose === 'sleep') tb = tt;
  assert.ok(Math.abs(ta - tb) < 0.3, `${ta} vs ${tb}`);
  assert.ok(IDLE.sitAt[0] >= 5 && IDLE.sleepAt[1] <= 30);
});

console.log(`${n} idle tests passed`);
