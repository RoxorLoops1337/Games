// 35 j: screen moments round 12: tap to skip on long cards, ring stage intro flourish, near miss bar, level-up chip, readable credits
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const rd = f => readFileSync(join(root, f), 'utf8');
const J = await import(join(root, 'screen_b12j.js'));
const B = await import(join(root, 'screen_b11.js'));
const { createScreenFx } = await import(join(root, 'screenfx.js'));
const noop = () => {};
const texts = [], rings = [];
const mk = (opt = {}) => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : /Gradient/.test(String(k)) ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 100 }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const S = { t: 0, trauma: 0, flash: 0 };
  return createScreenFx({ ctx, W: 1080, H: 2340, kit: { SPECIES: { love: { lite: '#ff99cc', base: '#f08' } }, drawHead: noop }, art: null, text: s => texts.push(s), glow: noop, S, OPT: opt, ring: (...a) => rings.push(a), burst: noop });
};
const g = { p: { x: 540, y: 720 }, snakes: [], phase: 'play', groove: 0, stage: 6, progress: 0.5, skin: 'love', t: 40, faceMax: 0.5, mode: '', ring: { cx: 540, cy: 720, R: 135 } };
const flat = { ...g, ring: null };
const run = (fx, gg, n, dt = 0.016) => { for (let i = 0; i < n; i++) { fx.update(dt, gg); fx.drawCard(gg); } };

// helpers
assert.equal(J.skipReady('card', 0.2), false); assert.equal(J.skipReady('card', 0.6), true);
assert.equal(J.skipReady('boss', 0.6), false); assert.equal(J.skipReady('fin', 2.0), false); assert.equal(J.skipReady('fin', 2.6), true);
assert.ok(J.ringRadius(135, 0) > 135 * 4 && Math.abs(J.ringRadius(135, J.RING_IN) - 135) < 0.01, 'the circle starts wide and lands on the real radius');
assert.ok(J.ringRadius(135, 0.3) > J.ringRadius(135, 0.6), 'it only closes in');
assert.ok(J.ringAlpha(0) === 0 && J.ringAlpha(0.5) === 1 && J.ringAlpha(J.RING_IN + J.RING_TAIL) < 1e-9);
assert.ok(J.gapFill(96, 0) === 0 && Math.abs(J.gapFill(96, 1) - 0.96) < 1e-9);

// tap to skip: the stage card
{
  const fx = mk(); fx.onEvent({ t: 'stage', n: 7, boss: false, name: 'x' }, { ...flat, stage: 7 });
  run(fx, flat, 5); assert.equal(fx.skip(), false, 'too early');
  run(fx, flat, 40); const left = fx.state.card.dur - fx.state.card.t;
  assert.equal(fx.skip(), true); assert.ok(fx.state.card.dur - fx.state.card.t < left && fx.state.card.dur - fx.state.card.t <= 0.41);
  run(fx, flat, 40); assert.equal(fx.state.card, null, 'the skipped card is gone');
  assert.equal(fx.skip(), false, 'nothing left to skip');
}
// tap to skip: the boss card waits for the crown to land
{
  const fx = mk(); fx.onEvent({ t: 'stage', n: 5, boss: true, name: 'b' }, { ...flat, stage: 5 });
  run(fx, flat, 40); assert.equal(fx.skip(), false, 'boss slam first'); run(fx, flat, 40); assert.equal(fx.skip(), true);
}
// tap to skip: finale credits, and the clear card for a normal stage
{
  const ff = mk(); ff.onEvent({ t: 'stage', n: 50, boss: true, name: 'b' }, { ...flat, stage: 50 }); ff.onEvent({ t: 'won' }, { ...flat, stage: 50 });
  run(ff, flat, 60); assert.equal(ff.skip(), false); texts.length = 0; run(ff, flat, 120); assert.ok(texts.includes('TAP TO SKIP'), 'finale shows the skip hint');
  const durBefore = ff.state.clear.dur; assert.equal(ff.skip(), true); assert.ok(ff.state.clear.dur < durBefore);
  run(ff, flat, 40); assert.equal(ff.state.clear, null);
  const nf = mk(); nf.onEvent({ t: 'stage', n: 7, boss: false, name: 'x' }, { ...flat, stage: 7 }); nf.onEvent({ t: 'won' }, { ...flat, stage: 7 });
  run(nf, flat, 60); assert.equal(nf.skip(), false, 'the stars land first'); run(nf, flat, 60); assert.equal(nf.skip(), true);
}

// ring stage intro: the circle closes in as the card leaves, once, with a landing pulse and sound; none on other stages or calm
{
  const fx = mk(); fx.onEvent({ t: 'stage', n: 6, boss: false, name: 'x' }, g);
  assert.ok(fx.state.card.ring && fx.state.card.ring.r === 135);
  run(fx, g, 20); assert.equal(fx.state.rf, null, 'not before the card is leaving');
  rings.length = 0; let seen = 0, snd = false;
  for (let i = 0; i < 400; i++) { fx.update(0.016, g); fx.drawCard(g); if (fx.state.rf) seen++; if (fx.takeSounds().includes('star2')) snd = true; }
  assert.ok(seen > 30, 'the flourish ran'); assert.ok(snd, 'landing sound'); assert.ok(rings.some(r => r[0] === 540 && r[1] === 720), 'landing pulse on the circle');
  const f2 = mk(); f2.onEvent({ t: 'stage', n: 7, boss: false, name: 'x' }, flat); run(f2, flat, 200); assert.equal(f2.state.rf, null);
  const f3 = mk({ reduceMotion: true }); f3.onEvent({ t: 'stage', n: 6, boss: false, name: 'x' }, g); run(f3, g, 200); assert.equal(f3.state.rf, null);
}

// near miss: relief starts at once (not after the stars), the PHEW pill and bar come early
{
  const fx = mk(); fx.onEvent({ t: 'stage', n: 7, boss: false, name: 'x' }, flat);
  fx.onEvent({ t: 'won' }, { ...flat, stage: 7, faceMax: 0.95 });
  assert.equal(fx.state.clear.phew, true); assert.ok(fx.state.nm > 0, 'gasp started');
  texts.length = 0; run(fx, flat, 50); assert.ok(texts.some(s => /^PHEW/.test(s)), 'PHEW shows before the third star'); assert.ok(fx.takeSounds().includes('phew'));
  const far = mk(); far.onEvent({ t: 'stage', n: 7, boss: false, name: 'x' }, flat); far.onEvent({ t: 'won' }, { ...flat, stage: 7, faceMax: 0.5 }); assert.ok(!(far.state.nm > 0));
}

// phone text sizes: credits are at least 40 game units (about 13 css px at 360 wide) and the longest line fits 1080 wide
assert.ok(B.CREDITS.every(l => !l[0] || l[0] >= 40), 'credits readable on a phone');
assert.ok(Math.max(...B.CREDITS.filter(l => l[0]).map(l => l[1].length * l[0] * (l[1] === l[1].toUpperCase() ? 0.95 : 0.6))) < 1000, 'longest credit line fits');
// level-up chip, skip wiring, em dash
assert.ok(/bn\.dataset\.lv = g\.level/.test(rd('main.js')) && /banner\[data-lv\]::before/.test(rd('index.html')));
assert.ok(/R\.skipCard/.test(rd('main.js')) && /skipCard: \(\) => FX\.skip\(\)/.test(rd('render.js')));
for (const f of ['screen_b12j.js', 'screenfx.js', 'screen_b11.js']) assert.ok(!rd(f).includes('—'), f + ' has no em dash');
console.log('35_j_screen_moments ok');
