// Batch 9 duo and animal art: springy pets, per-species scare calls, turtle tuck, dust under the duo (pure logic plus source wiring, headless).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newLeash, petFollow, scareEdge, tuckMood, SCARE_CALL, SCARE_GAP, createDust, dustStep, dustDraw } from '../../cell_serpent/duo_life9.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
const r = rd('render.js'), m = rd('duo_life9.js');

// the leash: snaps on the first frame, then lags behind a moving target, overshoots a little, settles, leans into the move
{
  const L = newLeash(); petFollow(L, 100, 0); assert.equal(L.x, 100);
  let t = 0, maxX = 0, minLean = 0, maxLean = 0;
  for (let i = 0; i < 20; i++) { t += 0.016; petFollow(L, 100 + i * 12, t); }   // the target runs right
  assert.ok(L.x < 100 + 19 * 12 - 8 && L.x > 100, 'lags behind: ' + L.x);
  assert.ok(L.lean > 0.01 && L.stretch > 0.05, 'leans into the run');
  for (let i = 0; i < 120; i++) { t += 0.016; petFollow(L, 400, t); maxX = Math.max(maxX, L.x); }
  assert.ok(maxX > 400 && maxX < 440, 'small overshoot: ' + maxX);
  for (let i = 0; i < 200; i++) { t += 0.016; petFollow(L, 400, t); }
  assert.ok(Math.abs(L.x - 400) < 0.5 && Math.abs(L.lean) < 0.01, 'settles');
  petFollow(L, 5, t + 2); assert.equal(L.x, 5, 'a long pause snaps');   // tab was hidden
  petFollow(L, 600, t + 2.01); assert.equal(L.x, 600, 'a teleport snaps');
  for (let i = 0; i < 300; i++) { t += 5; petFollow(L, i % 2 ? 0 : 300, t + 2); assert.ok(Number.isFinite(L.x)); }
}
// the scare call fires on the rising edge once, then waits
{
  const st = {};
  assert.equal(scareEdge(st, false, 0), false);
  assert.equal(scareEdge(st, true, 1), true);
  assert.equal(scareEdge(st, true, 1.2), false, 'held');
  assert.equal(scareEdge(st, false, 2), false);
  assert.equal(scareEdge(st, true, 3), false, 'cooldown');
  assert.equal(scareEdge(st, false, 3.5), false);
  assert.equal(scareEdge(st, true, 1 + SCARE_GAP + 0.1), true);
  for (const id of ['kitten', 'puppy', 'piglet', 'lamb', 'hamster', 'turtle']) assert.ok(SCARE_CALL[id], id);
  assert.equal(tuckMood('turtle', true), 7); assert.equal(tuckMood('turtle', false), -1); assert.equal(tuckMood('kitten', true), -1);
}
// dust: trail while sliding, a skid when reversing, nothing while standing, fades out, draw needs no allocations
{
  const d = createDust(), live = () => [...d.life].filter(l => l > 0).length;
  for (let i = 0; i < 20; i++) dustStep(d, 100, 600, 0, 0.016);
  assert.equal(live(), 0, 'standing still: no dust');
  for (let i = 0; i < 20; i++) dustStep(d, 100 + i * 4, 600, 1, 0.016);
  const trail = live(); assert.ok(trail >= 2, 'trail ' + trail);
  dustStep(d, 180, 600, -1, 0.016); assert.ok(live() >= trail + 3, 'skid on reversal');
  for (let i = 0; i < 80; i++) dustStep(d, 180, 600, 0, 0.016);
  assert.equal(live(), 0, 'fades');
  let calls = 0; const ctx = new Proxy({}, { get: (_, k) => () => { calls++; }, set: () => true });
  for (let i = 0; i < 10; i++) dustStep(d, 100, 600, 1, 0.02);
  dustDraw(ctx, d); assert.ok(calls > 0);
  const idle = createDust(); calls = 0; dustDraw(ctx, idle); assert.equal(calls, 0, 'an empty pool draws nothing');
}
// wiring
assert.ok(r.includes("from './duo_life9.js'") && r.includes('petFollow(lf, ') && r.includes('scareEdge(st, scared, S.t)') && r.includes('dustStep(duoDust'));
assert.ok(r.includes('lf.lean') && r.includes('tuckMood(id, scared)'));
assert.ok(r.includes('OPT.reduceMotion ? p.x + s2 * 92'), 'reduced motion keeps the pets fixed');
assert.ok(!/—/.test(m + r));
console.log('31_duo_life_b9 ok');
