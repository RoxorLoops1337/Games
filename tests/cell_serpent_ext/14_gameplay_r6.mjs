// Agent 14 round 6: quartet streak, Soundcheck and Crescendo cards, sleepy boss nap, gloomy boss gloom, rippling ring stages.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const mk = (stage, seed = 3) => sim.createGame({ seed, stage });
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) sim.step(g, 1 / 60, { mx: 0 }); };
const evs = (g, t) => g.events.filter(e => e.t === t);
{   // quartet streak: pays more each time, a failed window resets, the result remembers the best
  const g = mk(22), sn = g.snakes[0], pay = [];
  for (let k = 0; k < 3; k++) {
    for (const s of sn.segs) { s.quartet = false; s.qPopped = false; }
    const four = sn.segs.filter(s => s.kind === 'normal' && s.hp > 0 && s.i > 0).slice(10, 14);
    for (const s of four) { s.quartet = true; s.hp = s.max; }
    g.events.length = 0; for (const s of four) s.hp = 0; tick(g);
    const e = evs(g, 'quartet')[0]; assert.ok(e && e.streak === k + 1, 'streak counts up: ' + k); pay.push(e.v);
  }
  assert.ok(g.qStreak === 3 && g.qBest === 3);
  assert.ok(pay[1] > pay[0] * 0.95 && pay[2] > pay[0], 'later quartets pay more: ' + pay);
  for (const s of sn.segs) { s.quartet = false; s.qPopped = false; }
  const f = sn.segs.filter(s => s.kind === 'normal' && s.hp > 0 && s.i > 0).slice(20, 24); for (const s of f) s.quartet = true;
  f[0].hp = 0; tick(g, 160);
  assert.equal(g.qStreak, 0, 'a failed window ends the streak'); assert.equal(g.qBest, 3);
  assert.equal(sim.quitResult(g).qBest, 3);
}
{   // new cards exist, late only
  for (const [id, st] of [['chk', 16], ['cres', 26]]) { const p = sim.PASSIVES.find(u => u.id === id); assert.ok(p && p.minStage === st && p.vals.length >= 4); }
  const g = mk(26); g.ups.cres = 2; g.val = undefined; assert.ok(sim.uv(g, 'cres') > 0);
}
{   // soundcheck fills the encore
  const g = mk(18); g.ups.chk = 3; g.val = undefined; const w = g.snakes[0].segs.find(s => s.ward || s.lull || s.drum); assert.ok(w, 'stage 18 has a special cell');
  const e0 = g.encore; w.hp = 0; tick(g); assert.ok(g.encore > e0 + 0.1 && evs(g, 'soundcheck').length === 1, 'encore ' + g.encore);
  const h = mk(18), w2 = h.snakes[0].segs.find(s => s.ward || s.lull || s.drum); w2.hp = 0; tick(h); assert.ok(h.encore < 0.1, 'no card, no refill');
}
{   // boss groups
  assert.equal(sim.bossGroup(15), 'sleepy'); assert.equal(sim.bossGroup(20), 'gloomy'); assert.equal(sim.bossGroup(7), '');
  const nap = st => { const g = mk(st); const sn = g.snakes[0]; sn.surge = 'go'; sn.surgeT = 0.001; tick(g); return sn.napT > 0; };
  assert.ok(nap(25) && nap(15), 'sleepy bosses nap after a dash'); assert.ok(!nap(5), 'the stage 5 boss is unchanged'); assert.ok(!nap(20), 'gloomy bosses do not nap');
  const g = mk(25), sn = g.snakes[0]; sn.surge = 'warn'; sn.surgeT = 0.001; tick(g); assert.ok(sn.surgeT > 1.4, 'longer dash');
  const sp = (st, napping) => { const h = mk(st), s = h.snakes[0]; s.surge = 'idle'; s.surgeT = 99; if (napping) s.napT = 5; const t0 = s.tail; tick(h, 30); return s.tail - t0; };
  assert.ok(sp(25, true) < sp(25, false) * 0.6, 'napping crawls');
  const gl = mk(30), gs = gl.snakes[0];
  tick(gl, 60 * 3); assert.ok(!gs.segs.some(s => s.gloom), 'quiet at first');
  tick(gl, 60 * 14); assert.equal(gs.segs.filter(s => s.gloom).length, 3, 'a gloom cloud covers three cells'); 
  assert.ok(gs.segs.filter(s => s.gloom).every(s => s.warded), 'gloom halves damage');
  const e = mk(10); tick(e, 60 * 9.5); assert.ok(!e.snakes[0].segs.some(s => s.gloom), 'stage 10 boss has no gloom');
  const n = mk(4); tick(n, 600); assert.ok(!n.snakes[0].segs.some(s => s.gloom) && !(n.snakes[0].napT > 0));
}
{   // ring variety
  const a = sim.buildPath(6), b = sim.buildPath(24), c = sim.buildPath(30), d = sim.buildPath(36);
  assert.equal(sim.ringWobble(6, 0.5), 0); assert.equal(sim.ringWobble(24, 0.4), 0); assert.ok(sim.ringWobble(30, 0.4) !== 0);
  for (const p of [a, b, c, d]) { assert.equal(p.kind, 'ring'); assert.ok(p.pts.every(q => q.x > -40 && q.x < 760), 'fits'); }
  const end = sim.pointAt(c, c.len), R = sim.RING; assert.ok(Math.abs(Math.hypot(end.x - R.cx, end.y - R.cy) - R.R) < 8, 'still ends on the duo circle');
  assert.notEqual(Math.round(c.len), Math.round(sim.buildPath(24).len));
}
console.log('14_gameplay_r6 ok');
