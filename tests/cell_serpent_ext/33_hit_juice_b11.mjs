// Hit juice round 11: slow-mo and zoom checked with a fake clock, per weapon damage numbers, armor break, bomb blast ring, gold pop, combo tick.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const fx = await import(join(root, 'hit_fx_b11.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createClock } = await import(join(root, 'clock.js'));
let scales = [];
const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k === 'scale' ? (x) => { scales.push(x); } : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const mk = () => createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 10, stage: 4 });
const warm = R => { for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60); };
const crit = (src) => ({ t: 'hit', x: 300, y: 400, d: 9, crit: true, src, s: {} });
const finish = (R, src) => { R.onEvent({ t: 'hit', x: 200, y: 300, d: 5, crit: false, src, s: {} }, g); R.onEvent({ t: 'kill', x: 200, y: 300, r: 30, kind: 'normal', skin: 'love', head: true }, g); };
// a fake clock run exactly like main.js: the sim steps lost to slow motion over 1.5 seconds
function lost(R, frames = 90) { const clk = createClock(); let steps = 0, min = 1; for (let f = 0; f < frames; f++) { const ts = R.timeScale(); min = Math.min(min, ts); clk.feed(1 / 60, ts); while (clk.take()) steps++; R.draw(g, null, 1 / 60); } return { lost: frames - steps, min }; }

{   // a heavy crit costs more sim time than a light one, and a plain run loses nothing
  const a = mk(); warm(a); const none = lost(a); assert.equal(none.lost, 0); assert.equal(none.min, 1);
  const m = mk(); warm(m); m.onEvent(crit('maw'), g); const lm = lost(m);
  const n = mk(); warm(n); n.onEvent(crit('needles'), g); const ln = lost(n);
  assert.ok(lm.lost > ln.lost && ln.lost >= 1, 'maw ' + lm.lost + ' vs needles ' + ln.lost);
  assert.ok(lm.lost <= 10, 'a crit never drags: lost ' + lm.lost + ' steps');
}
{   // the finish is the big moment, but it stays well under a second of lost sim time
  const R = mk(); warm(R); finish(R, 'tower'); const l = lost(R);
  assert.ok(l.lost >= 10 && l.lost <= 45, 'finish lost ' + l.lost); assert.ok(l.min <= 0.25);
}
{   // a light crit right after a finish cannot replace the finishing slow-mo
  const R = mk(); warm(R); finish(R, 'tower'); for (let i = 0; i < 4; i++) R.draw(g, null, 1 / 60);
  const before = R.timeScale(); R.onEvent(crit('needles'), g); assert.ok(R.timeScale() <= before + 0.001, 'still as slow as the finish: ' + R.timeScale() + ' vs ' + before);
}
{   // the way out of slow motion is smooth: no frame jumps by more than 0.2
  const R = mk(); warm(R); finish(R, 'maw'); let prev = R.timeScale(), worst = 0;
  for (let i = 0; i < 90; i++) { R.draw(g, null, 1 / 60); const t = R.timeScale(); if (prev > 0.1) worst = Math.max(worst, t - prev); prev = t; }
  assert.ok(worst < 0.2, 'ease out step ' + worst);
}
{   // the zoom punch: a scale above 1 on the hit frame that decays
  const R = mk(); warm(R); R.onEvent(crit('maw'), g);
  const peak = () => { scales = []; R.draw(g, null, 1 / 60); return scales.reduce((a, s) => Math.max(a, s), 1); };
  const p0 = peak(); assert.ok(p0 > 1.02, 'zoom at the hit ' + p0);
  for (let i = 0; i < 12; i++) R.draw(g, null, 1 / 60);
  const p1 = peak(); assert.ok(p1 < p0, 'zoom decays ' + p1);
}
{   // reduce motion: no slow-mo
  const R = mk(); R.setOptions({ reduceMotion: true }); warm(R); R.onEvent(crit('maw'), g); finish(R, 'tower'); assert.equal(R.timeScale(), 1);
}

// ---- damage numbers move like their weapon
{
  const W = Object.keys(fx.NUM_STYLE), out = { dx: 0, dy: 0, rot: 0, sc: 1 };
  assert.equal(W.length, 13);
  const sig = new Set();
  for (const w of W) {
    let s = '';
    for (const age of [0.05, 0.2, 0.4]) { fx.numMotion(w, age, 3, out); for (const v of [out.dx, out.dy, out.rot, out.sc]) assert.ok(Number.isFinite(v), w); assert.ok(out.sc > 0.4 && out.sc < 2, w + ' scale'); s += [out.dx, out.dy, out.rot, out.sc].map(v => v.toFixed(2)).join(',') + ';'; }
    sig.add(s);
  }
  assert.equal(sig.size, W.length, 'every weapon has its own number motion');
  fx.numMotion('daggers', 0.5, 0, out); assert.ok(out.dx > 50 && out.rot < -0.2, 'dagger numbers slide and tilt');
  fx.numMotion('tower', 0.02, 0, out); const big = out.sc; fx.numMotion('tower', 0.5, 0, out); assert.ok(big > out.sc + 0.3 && out.sc === 1, 'tower numbers land heavy then settle');
  fx.numMotion('nonsense', 0.1, 0, out); assert.ok(Number.isFinite(out.dx), 'unknown weapon falls back');
  const R = mk(); warm(R); const cell = { kind: 'normal', hp: 3 };
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 12, crit: false, src: 'daggers', s: cell }, g); R.draw(g, null, 1 / 60);   // a real number draws through the styled path
}

// ---- armor, bomb and gold marks
{
  const R = mk(), P = R.hj.pools; warm(R);
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 3, crit: false, src: 'swab', s: { kind: 'armor', hp: 4 } }, g);
  assert.ok(P.marks.some(m => m.k === 'clank'), 'armor hit clanks');
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 3, crit: false, src: 'swab', s: { kind: 'normal', hp: 4 } }, g);
  assert.equal(P.marks.filter(m => m.k === 'clank').length, 1, 'only armor clanks');
  R.onEvent({ t: 'kill', x: 300, y: 400, r: 30, kind: 'armor', skin: 'love', head: false }, g);
  assert.ok(P.marks.some(m => m.k === 'plates'), 'armor falls apart in plates');
  R.onEvent({ t: 'boom', x: 200, y: 500, r: 150 }, g);
  assert.ok(P.marks.some(m => m.k === 'blast'), 'bomb blast ring'); assert.ok(R.timeScale() < 1, 'the blast gives a small thud');
  R.onEvent({ t: 'goldpop', x: 360, y: 300, v: 40 }, g);
  assert.ok(P.marks.some(m => m.k === 'goldburst'), 'gold cell pops in coins');
  const calls = {}; const rec = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; }), set: (t, k, v) => { t[k] = v; return true; } });
  for (const k of ['clank', 'plates', 'blast', 'goldburst']) for (const kk of [0.05, 0.4, 0.9]) fx.drawMark11(rec, { k, r: 40, t: kk * 0.5, seed: 1, rot: 0.3, col: '#fff' }, kk, 1 - kk, () => {});
  assert.ok(calls.fill > 40 && !calls.createLinearGradient && !calls.createRadialGradient);
  for (let i = 0; i < 80; i++) R.draw(g, null, 1 / 60);
  assert.equal(P.marks.filter(m => fx.isKind11(m.k)).length, 0, 'marks expire');
}
{ const R = mk(); R.setOptions({ reduceMotion: true }); warm(R); R.onEvent({ t: 'kill', x: 300, y: 400, r: 30, kind: 'armor', skin: 'love' }, g); R.onEvent({ t: 'boom', x: 200, y: 500, r: 150 }, g); assert.equal(R.hj.pools.marks.length, 0, 'reduce motion draws none of them'); }

// ---- combo plate ticks on a hit
{
  const R = mk(); warm(R); const gg = sim.createGame({ seed: 3, stage: 4 }); gg.combo = 12; gg.lastKill = gg.t;
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 3, crit: false, src: 'swab', s: {} }, gg);
  assert.equal(R.state.hitPulse, R.state.t, 'a hit stamps the combo pulse'); R.draw(gg, null, 1 / 60); R.draw(gg, null, 1 / 60);
}
