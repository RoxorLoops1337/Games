// Screen feel (agent 05): title card, boss intro, slow motion, confetti, game over fade, Reduce Motion.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const stubCanvas = (w, h) => ({ width: w, height: h, getContext: stubCtx });
const canvas = { width: 390, height: 844, getContext: stubCtx };
const mk = () => createRenderer(canvas, null, createArtDraw(stubCanvas, 1));
const ui = { joy: {}, hints: false };

const R = mk();
const g = sim.createGame({ seed: 3, stage: 10 });
for (const e of g.events.splice(0)) R.onEvent(e, g);
R.draw(g, ui, 0.05);
assert.equal(R.timeScale(), 1, 'no slow motion at the start');
R.onEvent({ t: 'kill', x: 300, y: 300, r: 40, head: true, boss: true, skin: g.skin }, g);
assert.ok(R.timeScale() < 0.6, 'boss face pop slows the game down');
for (let i = 0; i < 60; i++) R.draw(g, ui, 0.02);
assert.equal(R.timeScale(), 1, 'slow motion ends by itself');
R.onEvent({ t: 'clear', n: 10, bonus: 5, boss: true }, g);
R.draw(g, ui, 0.02);
g.groove = 20; g.phase = 'dead'; R.onEvent({ t: 'dead' }, g);
for (let i = 0; i < 40; i++) R.draw(g, ui, 0.03);

const Q = mk(); Q.setOptions({ reduceMotion: true });
Q.onEvent({ t: 'kill', x: 300, y: 300, r: 40, head: true, boss: true, skin: g.skin }, g);
Q.onEvent({ t: 'stage', n: 10, boss: true, name: 'Gloomy Gunk', mod: '' }, g);
Q.onEvent({ t: 'clear', n: 10, bonus: 5, boss: true }, g);
Q.draw(g, ui, 0.6);
assert.equal(Q.timeScale(), 1, 'Reduce Motion: no slow motion');

// ---- round 2: slow motion never drifts the sim clock
const { createClock, STEP } = await import(join(root, 'clock.js'));
{
  const W2 = mk(), clk = createClock(), g2 = sim.createGame({ seed: 5, stage: 10 });
  let steps = 0, integral = 0, seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let f = 0; f < 3000; f++) {
    if (f === 200 || f === 1400) W2.onEvent({ t: 'kill', x: 300, y: 300, r: 40, head: true, boss: f === 1400, skin: g2.skin }, g2);
    const dt = 0.004 + rnd() * 0.04;                       // 4 to 44 ms frames, like a phone
    const sc = W2.timeScale(); integral += dt * sc;
    W2.draw(g2, ui, dt);                                    // advances the slow-motion timer in real time
    clk.feed(dt, sc);
    while (clk.take()) steps++;
  }
  assert.ok(Math.abs(steps * STEP + clk.acc - integral) < 1e-6, 'sim time equals the integral of the time scale (no drift)');
  assert.ok(clk.acc >= 0 && clk.acc < STEP, 'at most one step of remainder');
  // a stalled tab must not fast-forward the sim
  const c2 = createClock(); c2.feed(5, 1); let n = 0; while (c2.take()) n++; assert.ok(n <= 15, 'stall is capped');
  // waiting on a card (the sim does not step) must not bank time
  const c3 = createClock(); for (let i = 0; i < 600; i++) { c3.feed(1 / 30, 1); c3.drop(); } assert.equal(c3.acc, 0, 'nothing banked while the cards are up');
}
// slow motion is fed by real time, so pause (draw dt 0) and the Encore tap (not a sim input) are unaffected
{
  const P = mk(); const g3 = sim.createGame({ seed: 5, stage: 10 });
  P.onEvent({ t: 'kill', x: 300, y: 300, r: 40, head: true, boss: true, skin: g3.skin }, g3);
  const k0 = P.timeScale(); P.draw(g3, ui, 0); P.draw(g3, ui, 0);
  assert.equal(P.timeScale(), k0, 'paused frames (dt 0) do not eat the slow motion');
  assert.ok(k0 > 0.25, 'the sim never stops completely, so a tap or card always gets a step');
}

// ---- STAGE CLEAR card with stars, beat pulse, close call, game over scene
{
  const C = mk(), g4 = sim.createGame({ seed: 5, stage: 10 });
  assert.equal(C.clearBusy(), false);
  g4.phase = 'won'; g4.faceMax = 0.3; g4.revived = false; g4.revivesUsed = 0;
  C.onEvent({ t: 'won' }, g4);
  assert.equal(C.clearBusy(), true, 'the stage clear card holds the result screen');
  const snd = []; let t = 0;
  while (C.clearBusy() && t < 6) { C.draw(g4, ui, 0.05); snd.push(...C.takeSounds()); t += 0.05; }
  assert.deepEqual(snd, ['star1', 'star2', 'star3'], 'three star pops, one per star, in order');
  assert.ok(t > 1.5 && t < 4, 'the card is short');
  g4.revivesUsed = 1; g4.faceMax = 0.9; C.onEvent({ t: 'won' }, g4); const s1 = []; while (C.clearBusy()) { C.draw(g4, ui, 0.05); s1.push(...C.takeSounds()); }
  assert.deepEqual(s1, ['star1'], 'only the earned stars pop');
  g4.mode = 'daily'; C.onEvent({ t: 'won' }, g4); assert.equal(C.clearBusy(), false, 'no stars, no card');
  const Q2 = mk(); Q2.setOptions({ reduceMotion: true }); const g5 = sim.createGame({ seed: 5, stage: 10 }); g5.faceMax = 0.2;
  Q2.onEvent({ t: 'won' }, g5); let tq = 0; while (Q2.clearBusy() && tq < 5) { Q2.draw(g5, ui, 0.05); tq += 0.05; } assert.ok(tq < 1.6, 'Reduce Motion: shorter static card');
  // beat pulse: reads the audio beat, silent under Reduce Motion
  const B = mk(); let calls = 0; B.setBeat(() => { calls++; return { bpm: 120, phase: 0.1 }; });
  B.draw(g5, ui, 0.02); assert.ok(calls > 0, 'beat getter is read while playing');
  Q2.setBeat(() => { calls += 100; return { bpm: 120, phase: 0 }; }); const before = calls; Q2.draw(g5, ui, 0.02); assert.equal(calls, before, 'Reduce Motion: no beat pulse');
  B.draw(g5, null, 0.02);
  // close call: edge flash + rumble, none under Reduce Motion
  B.onEvent({ t: 'clutch', x: 300, y: 1000 }, g5); B.draw(g5, ui, 0.02);
  Q2.onEvent({ t: 'clutch', x: 300, y: 1000 }, g5); Q2.draw(g5, ui, 0.02);
  // game over scene draws (grin + slump) both ways
  const g6 = sim.createGame({ seed: 5, stage: 10 }); g6.phase = 'dead'; B.onEvent({ t: 'dead' }, g6); Q2.onEvent({ t: 'dead' }, g6);
  for (let i = 0; i < 40; i++) { B.draw(g6, ui, 0.03); Q2.draw(g6, ui, 0.03); }
}
// the audio engine exposes the beat
{
  const { createAudio } = await import(join(root, 'audio.js'));
  const a = createAudio(); assert.equal(typeof a.beat, 'function'); assert.equal(a.beat(), null, 'no beat before the music plays');
}
console.log('cell_serpent ext 05_screen_feel ok');
