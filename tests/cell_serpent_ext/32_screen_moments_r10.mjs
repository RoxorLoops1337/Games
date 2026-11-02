// 05 screen moments round 10: NEW BEST TIME and PHEW tags on the clear card, species chord per milestone ribbon, best mark on the game over bar
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const rd = f => readFileSync(join(root, f), 'utf8');
const B = await import(join(root, 'screen_b10.js'));
const { createScreenFx } = await import(join(root, 'screenfx.js'));
const noop = () => {};
const grad = () => ({ addColorStop: noop });
const texts = [];
const mk = () => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : /Gradient/.test(String(k)) ? grad : k === 'measureText' ? () => ({ width: 100 }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const S = { t: 0, trauma: 0, flash: 0 };
  return createScreenFx({ ctx, W: 1080, H: 2340, kit: { SPECIES: { love: { lite: '#ff99cc' } } }, art: null, text: s => texts.push(s), glow: noop, S, OPT: {}, ring: noop, burst: noop });
};
const g = { p: { x: 540, y: 2000 }, snakes: [], phase: 'play', groove: 0, stage: 71, progress: 0.5, skin: 'love', t: 83, faceMax: 0.5 };
const run = (fx, gg, n = 200) => { for (let i = 0; i < n; i++) { fx.update(0.016, gg); fx.drawCard(gg); } };

// 1) best time: the first clear is quiet, a faster clear gets the tag, a slower one does not
{
  assert.deepEqual(B.recordTime(71, false, 90), { prev: 0, best: false });
  assert.deepEqual(B.recordTime(71, false, 95), { prev: 90, best: false });
  assert.deepEqual(B.recordTime(71, false, 80), { prev: 90, best: true });
  assert.equal(B.bestTime(71, false), 80); assert.equal(B.bestTime(71, true), 0, 'hard mode has its own record');
  const fx = mk(); fx.onEvent({ t: 'stage', n: 71, boss: false, name: 'x' }, g);
  fx.onEvent({ t: 'won' }, { ...g, t: 70 });
  assert.equal(fx.state.clear.best, true);
  texts.length = 0; run(fx, g);
  assert.ok(texts.includes('NEW BEST TIME'), 'tag drawn');
  assert.ok(fx.takeSounds().includes('besttime'));
  const fx2 = mk(); fx2.onEvent({ t: 'stage', n: 71, boss: false, name: 'x' }, g); fx2.onEvent({ t: 'won' }, { ...g, t: 75 });
  assert.equal(fx2.state.clear.best, false, 'slower than the record: no tag');
}

// 2) near miss: won with the face within 10 percent of the line
{
  assert.ok(B.nearMiss(94) && B.nearMiss(90) && !B.nearMiss(89) && !B.nearMiss(100));
  const fx = mk(); fx.onEvent({ t: 'stage', n: 72, boss: false, name: 'x' }, g); fx.onEvent({ t: 'won' }, { ...g, stage: 72, faceMax: 0.94 });
  assert.equal(fx.state.clear.phew, true);
  texts.length = 0; run(fx, g);
  assert.ok(texts.some(s => /^PHEW!/.test(s) && /94% CLOSE/.test(s)));
  assert.ok(fx.takeSounds().includes('phew'));
}

// 3) milestone ribbons play a chord of their species (more notes higher up), registered as real sfx
{
  const fx = mk(); fx.onEvent({ t: 'stage', n: 5, boss: false, name: 'x' }, g); fx.onEvent({ t: 'checkpoint', k: 1 }, g);
  assert.deepEqual(fx.takeSounds(), ['mile_love_25']);
  assert.equal(B.chordOf('mighty', 25).n.length, 2); assert.equal(B.chordOf('mighty', 50).n.length, 3); assert.equal(B.chordOf('mighty', 75).n.length, 4);
  assert.equal(B.mileSound('nope', 50), 'mile_love_50');
  const sfx = {}, calls = []; B.registerB10(sfx, (...a) => calls.push(a), noop, () => true);
  for (const sk of Object.keys(B.MILE_CHORD)) for (const p of [25, 50, 75]) assert.equal(typeof sfx[B.mileSound(sk, p)], 'function', sk + p);
  sfx.mile_love_75(); assert.equal(calls.length, 5);
  assert.ok(rd('audio.js').includes('registerB10(sfx, tone, noise, gate)'));
}

// 4) game over bar: the old best is a flag, passing it says NEW BEST
{
  B.recordProg(73, false, 60);
  const fx = mk(); fx.onEvent({ t: 'stage', n: 73, boss: false, name: 'x' }, { ...g, stage: 73 });
  assert.equal(fx.state.bestPrev, 60);
  fx.onEvent({ t: 'dead' }, { ...g, stage: 73, progress: 0.4 });
  assert.equal(fx.state.deadBest.isNew, false);
  texts.length = 0; fx.state.deadT = 1.6;
  const gd = { ...g, stage: 73, progress: 0.4, phase: 'dead', snakes: [] };
  for (let i = 0; i < 90; i++) { fx.update(0.016, gd); fx.drawScreen(gd); fx.drawCard(gd); }
  assert.ok(texts.includes('BEST 60%'), 'old best flag text');
  const fy = mk(); fy.onEvent({ t: 'stage', n: 73, boss: false, name: 'x' }, { ...g, stage: 73 });
  fy.onEvent({ t: 'dead' }, { ...g, stage: 73, progress: 0.8 });
  assert.equal(fy.state.deadBest.isNew, true); assert.equal(B.bestProg(73, false), 80);
}
for (const f of ['screen_b10.js', 'screenfx.js']) assert.ok(!rd(f).includes('—'), f + ' has no em dash');
console.log('32_screen_moments_r10 ok');
