// Batch 10 duo and pets: run end and revive reactions, pets glance at the nearest head, kitten pounce on crits, puppy bark at bosses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createReact, reactEvent, barkDue, barkU, koPose, starAt, revivePose, glance, pouncePose, clawDraw, barkDraw, POUNCE_GAP, POUNCE_LEN, REVIVE_LEN, BARK_LEN } from '../../cell_serpent/duo_react10.js';
import { createDust, dustStep, dustDraw } from '../../cell_serpent/duo_life9.js';
const r = fs.readFileSync(new URL('../../cell_serpent/render.js', import.meta.url), 'utf8');

// events set the right clocks
{
  const R = createReact();
  reactEvent(R, { t: 'dead' }, 300, 5); assert.equal(R.koT, 5);
  reactEvent(R, { t: 'revive' }, 300, 9); assert.equal(R.koT, -9); assert.equal(R.rvT, 9);
  reactEvent(R, { t: 'hit', crit: false, x: 100 }, 300, 10); assert.equal(R.pT, -9, 'plain hits do not pounce');
  reactEvent(R, { t: 'hit', crit: true, x: 100 }, 300, 10); assert.equal(R.pT, 10); assert.equal(R.pDir, -1);
  reactEvent(R, { t: 'hit', crit: true, x: 500 }, 300, 10 + POUNCE_GAP - 0.1); assert.equal(R.pT, 10, 'crits inside the gap are ignored');
  reactEvent(R, { t: 'hit', crit: true, x: 500 }, 300, 10 + POUNCE_GAP + 0.1); assert.equal(R.pDir, 1);
  reactEvent(R, { t: 'stage', boss: false }, 300, 20); assert.equal(R.bAt, -1, 'no bark on a normal stage');
  reactEvent(R, { t: 'stage', boss: true }, 300, 20); assert.ok(R.bAt > 20);
  assert.equal(barkDue(R, 20.5), false); assert.equal(barkDue(R, R.bAt + 0.01), true); assert.equal(barkDue(R, 30), false, 'one bark per trigger');
  assert.ok(barkU(R, R.bT + 0.1) >= 0 && barkU(R, R.bT + BARK_LEN + 0.1) === -1);
  reactEvent(R, { t: 'phase2' }, 300, 40); assert.equal(barkDue(R, 40.1), true, 'FINAL CHORUS barks again');
}
// KO pose: sinks and tilts, stars fade in, all finite, reduce motion stops the sway
{
  const a = { ...koPose(0, false) }, b = { ...koPose(1, false) };
  assert.ok(a.dy < b.dy && b.dy > 8 && b.sy < 1 && b.stars === 1 && a.stars === 0);
  const s1 = koPose(0.7, true).rot, s2 = koPose(0.9, true).rot; assert.equal(s1, s2, 'reduce motion: no sway');
  const o = { x: 0, y: 0, front: false, s: 1 }; let front = 0;
  for (let i = 0; i < 3; i++) { starAt(o, i, 3, 100, 100, 30, 8, 0.5, false); assert.ok(Math.abs(o.x - 100) <= 30.01 && Math.abs(o.y - 100) <= 8.01 && o.s >= 0.5); if (o.front) front++; }
  assert.ok(front >= 1 && front <= 2);
}
// revive hop leaves the ground and lands
{
  assert.equal(revivePose(-1).u, -1); assert.equal(revivePose(REVIVE_LEN + 0.1).dy, 0);
  let max = 0; for (let u = 0; u < REVIVE_LEN; u += 0.01) max = Math.max(max, revivePose(u).dy);
  assert.ok(max > 25 && max < 45, 'hop height ' + max); assert.ok(revivePose(REVIVE_LEN * 0.9).sy < 1, 'landing squash');
}
// glance: leans toward a close head, relaxes when it is far or gone
{
  const st = {}; let l = 0;
  for (let i = 0; i < 40; i++) l = glance(st, 300, 500, 200, 0.016); assert.ok(l > 0.05 && l <= 0.16, 'right ' + l);
  for (let i = 0; i < 40; i++) l = glance(st, 300, 100, 200, 0.016); assert.ok(l < -0.05, 'left ' + l);
  for (let i = 0; i < 80; i++) l = glance(st, 300, 100, 900, 0.016); assert.ok(Math.abs(l) < 0.01, 'far head: no look');
  for (let i = 0; i < 80; i++) l = glance(st, 300, NaN, 0, 0.016); assert.ok(Math.abs(l) < 0.01 && Number.isFinite(l), 'no head');
}
// pounce: crouch, spring toward the crit, claws at the top, back to rest
{
  assert.equal(pouncePose(-1, 1).u, -1); assert.equal(pouncePose(POUNCE_LEN + 0.1, 1).dy, 0);
  let maxY = 0, maxX = 0, claws = 0, crouch = false;
  for (let u = 0; u < POUNCE_LEN; u += 0.01) { const p = pouncePose(u, 1); maxY = Math.max(maxY, p.dy); maxX = Math.max(maxX, p.dx); claws += p.claws; if (p.sy < 0.9) crouch = true; assert.ok(Number.isFinite(p.rot)); }
  assert.ok(maxY > 30 && maxX > 10 && claws > 3 && crouch);
  const l = pouncePose(POUNCE_LEN * 0.4, -1); assert.ok(l.dx < 0, 'springs left for a crit on the left');
  let calls = 0; const ctx = new Proxy({}, { get: (_, k) => () => { calls++; }, set: () => true });
  clawDraw(ctx, 10, 10, 1); barkDraw(ctx, 10, 10, -1, 0.3); assert.ok(calls > 5);
  calls = 0; barkDraw(ctx, 10, 10, 1, 0); barkDraw(ctx, 10, 10, 1, 1.5); assert.equal(calls, 4, 'only save and restore at the ends');
}
// the foot dust is bigger and outlined so it shows on the dark floor
{
  const d = createDust(); for (let i = 0; i < 20; i++) dustStep(d, 200 + i * 5, 600, 1, 0.016);
  assert.ok([...d.r].some(v => v >= 9), 'puffs are at least 9px');
  const seen = {}; const ctx = new Proxy({}, { get: (_, k) => () => { seen[k] = (seen[k] || 0) + 1; }, set: (_, k, v) => { if (k === 'globalAlpha') seen.alpha = Math.max(seen.alpha || 0, v); return true; } });
  dustDraw(ctx, d); assert.ok(seen.stroke >= 1 && seen.alpha >= 0.7, 'outlined and strong');
}
// wiring: the renderer keeps the duo on screen after the run ends, feeds events first, and hides the aim tick and hitbox while down
assert.ok(/import \{[^}]*reactEvent[^}]*\} from '\.\/duo_react10\.js'/.test(r));
assert.ok(/S\.ko = g\.phase === 'dead'; drawPlayerR\(g\)/.test(r), 'no more vanishing duo on game over');
assert.ok(/function onEvent\(e, g\) \{\n.*reactEvent\(R10/.test(r), 'reactions run before the other handlers');
assert.ok(/if \(S\.ko\) return OPT\.reduceMotion \? 0 : Math\.min\(1, \(S\.t - R10\.koT\)/.test(r), 'pets stay slumped while the run is over');
assert.ok(/glance\(st, px, nearX, near, lastDt\)/.test(r) && /barkDue\(R10, S\.t\)/.test(r) && /pouncePose\(S\.t - R10\.pT/.test(r));
assert.ok(!/—/.test(fs.readFileSync(new URL('../../cell_serpent/duo_react10.js', import.meta.url), 'utf8')), 'no em dash');
