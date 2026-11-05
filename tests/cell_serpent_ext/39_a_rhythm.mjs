// Batch 16a: Rhythm Core. Perfect judging, the hold-still lock, the drop, the beat lane numbers, and that the early game is untouched.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const R = await import(join(root, 'rhythm_b16a.js'));
const A = await import(join(root, 'audio_b16a.js'));

// judging
assert.equal(sim.judgeBeat(0), 2); assert.equal(sim.judgeBeat(sim.BEAT_PERFECT), 2); assert.equal(sim.judgeBeat(-0.05), 1);
assert.equal(sim.judgeBeat(-0.12), -1, 'early'); assert.equal(sim.judgeBeat(0.12), -2, 'late');
assert.ok(sim.BEAT_PERFECT < sim.BEAT_WIN, 'perfect is inside good');
{ const g = sim.createGame({ seed: 1, stage: 10 }); const T = sim.beatPeriod(g);
  g.t = T * 5 + 0.01; assert.ok(Math.abs(sim.beatOffset(g) - 0.01) < 1e-9, 'late by 10 ms'); g.t = T * 5 - 0.02; assert.ok(Math.abs(sim.beatOffset(g) + 0.02) < 1e-9, 'early by 20 ms'); }

// new game keys exist from the start (no keys added mid-run)
{ const g = sim.createGame({ seed: 1, stage: 10 }); for (const k of ['pStreak', 'pBest', 'dropT', 'dropN', 'stillT', 'lastX', 'lastA', 'chorusIdx', 'perfN']) assert.ok(k in g, k); }

// early game: no rhythm bonuses (a fresh account is not helped)
assert.ok(sim.RHY_FROM >= sim.BEATRUN_FROM, 'same stage as the Beat Run');
{ const g = sim.createGame({ seed: 4, stage: 3, bot: true }); for (let i = 0; i < 1200; i++) { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); }
  assert.equal(g.perfN, 0, 'no judging before stage 8'); assert.equal(g.dropN, 0); assert.ok(!g.events.some(e => e.t === 'rhy')); }

// holding still locks volleys to the beat grid: most lead volleys are perfect; sliding every frame is not
function run(still, secs) {
  const g = sim.createGame({ seed: 5, stage: 11, bot: false }); g.revivesLeft = 1e9; let n = 0, perf = 0;
  for (let i = 0; i < secs * 60; i++) {
    const inp = still ? { mx: 0, my: 0 } : { mx: Math.sin(i / 9), my: 0 };
    sim.step(g, 1 / 60, inp); for (const e of g.events) if (e.t === 'rhy') { n++; if (e.j === 2) perf++; } g.events.length = 0; if (g.phase === 'levelup') sim.choose(g, 0);
    if (g.phase !== 'play') break;
  }
  return { g, n, perf };
}
{ const a = run(true, 12), b = run(false, 12);
  assert.ok(a.n >= 6, 'volleys were judged'); assert.ok(a.perf / a.n > 0.7, 'still: ' + a.perf + '/' + a.n);
  assert.ok(b.n === 0 || b.perf / b.n < 0.5, 'sliding: ' + b.perf + '/' + b.n);
  assert.ok(a.g.dropN >= 1, 'a long perfect streak starts the drop'); }

// the drop: more damage and faster volleys while it lasts, then it ends with an event
{ const g = sim.createGame({ seed: 6, stage: 12 }); g.dropT = 0.05; const ev = []; g.pStreak = 3;
  for (let i = 0; i < 20; i++) { sim.step(g, 1 / 60, { mx: 0, my: 0 }); for (const e of g.events) ev.push(e.t); g.events.length = 0; if (g.phase === 'levelup') sim.choose(g, 0); }
  assert.equal(g.dropT, 0); assert.ok(ev.includes('rdropend')); }
assert.ok(sim.DROP_DMG <= 1.2 && sim.PERFECT_DMG <= 1.1 && sim.DROP_RATE >= 0.85, 'a small sidegrade, never a big power jump');
assert.ok(sim.DROP_AT >= 8, 'the drop is earned');

// the lane numbers
{ const g = sim.createGame({ seed: 2, stage: 10 }); const out = []; const T = sim.beatPeriod(g);
  g.t = T * 3 + 0.1; R.laneBeats(g, out); assert.ok(out.length >= 1 && out.every(x => x > 0 && x <= R.AHEAD + 1e-9)); assert.ok(Math.abs(out[0] - (T - 0.1)) < 1e-9);
  assert.ok(R.laneOn(g) && !R.laneOn(sim.createGame({ seed: 2, stage: 3 })), 'the lane starts at the rhythm stages');
  assert.equal(R.wordOf(2), 'PERFECT'); assert.equal(R.wordOf(-1), 'EARLY'); assert.equal(R.wordOf(-2), 'LATE'); }
// the lane stays clear of the left HUD panel (Groove) and inside the frame
assert.ok(R.LANE_X - R.LANE_HALF - 18 > 300 && R.LANE_X + R.LANE_HALF + 18 <= sim.W && R.LANE_Y + 24 <= sim.H);
// drawing runs with a stub canvas and allocates nothing it keeps
{ const calls = []; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); }), set: (t, k, v) => { t[k] = v; return true; } });
  const g = sim.createGame({ seed: 2, stage: 10 }); g.t = 3.3; g.dropT = 2; R.laneEvent({ t: 'rhy', j: 2, off: 0.01, n: 4 }, 1); R.drawLane(ctx, g, 1.1, () => calls.push('text'), false); R.drawDropFrame(ctx, g, 1.1, sim.W, sim.H);
  assert.ok(calls.length > 5 && calls.length < 60, 'few canvas ops: ' + calls.length); }
// audio helpers
assert.ok(A.pentHz16(0) < A.pentHz16(4) && A.pentHz16(5) === A.pentHz16(0) * 2);
const names = []; A.registerB16a({}, () => {}, () => {}, () => {}, () => true); const sfx = {}; A.registerB16a(sfx, () => names.push('tone'), () => names.push('noise'), () => {}, () => true);
for (const k of ['rhy', 'rdrop', 'rchorus', 'rdropend']) assert.equal(typeof sfx[k], 'function', k); sfx.rhy({ j: 2, n: 3 }); sfx.rdrop(); sfx.rchorus({ n: 2 }); sfx.rdropend(); assert.ok(names.length > 8);
// the run result carries the numbers
{ const g = sim.createGame({ seed: 2, stage: 10 }); g.dropN = 2; g.pBest = 9; const r = sim.runResult ? sim.runResult(g, false) : null; if (r) { assert.equal(r.drops, 2); assert.equal(r.perfBest, 9); } }
console.log('39_a_rhythm ok');
